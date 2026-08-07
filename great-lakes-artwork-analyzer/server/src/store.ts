/**
 * Data access and workflow service.
 *
 * Versions are immutable: a revision always inserts a new ArtworkVersion with its
 * own FileAsset and AnalysisRun. Nothing overwrites an earlier PDF, analysis,
 * comment, approval or event.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, id, nowIso, STORAGE_DIR } from './db.js';
import {
  ALLOWED_TRANSITIONS,
  JOB_STATUS_LABELS,
  type AnalysisResult,
  type AnalysisStage,
  type JobStatus,
} from './types.js';

export class WorkflowError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

export interface Actor {
  name: string;
  role: 'prepress' | 'customer' | 'system';
  email?: string;
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export interface JobRow {
  id: string;
  job_number: string;
  customer: string;
  product_number: string | null;
  title: string;
  status: JobStatus;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  seeded: number;
}

export interface VersionRow {
  id: string;
  job_id: string;
  version_number: number;
  revision_label: string | null;
  file_asset_id: string;
  status: JobStatus;
  prepress_reviewed_at: string | null;
  prepress_reviewed_by: string | null;
  superseded_at: string | null;
  notes: string | null;
  created_at: string;
  created_by: string;
}

export interface AssetRow {
  id: string;
  original_name: string;
  stored_path: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  uploaded_at: string;
  uploaded_by: string;
}

export interface RunRow {
  id: string;
  version_id: string;
  analyzer_version: string;
  state: 'queued' | 'running' | 'complete' | 'failed';
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error: string | null;
  stages_json: string;
  result_json: string | null;
  render_dir: string | null;
}

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function storeFileAsset(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  actor: Actor,
): AssetRow {
  const assetId = id('asset');
  const dir = path.join(STORAGE_DIR, 'originals', assetId);
  fs.mkdirSync(dir, { recursive: true });
  const safeName = originalName.replace(/[^\w.\- ]+/g, '_').slice(0, 180) || 'artwork.pdf';
  const stored = path.join(dir, safeName);
  // Written once and never rewritten — this is the immutable original.
  fs.writeFileSync(stored, buffer, { flag: 'wx' });
  const row: AssetRow = {
    id: assetId,
    original_name: originalName,
    stored_path: stored,
    mime_type: mimeType,
    byte_size: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    uploaded_at: nowIso(),
    uploaded_by: actor.name,
  };
  db.prepare(
    `INSERT INTO file_asset (id, original_name, stored_path, mime_type, byte_size, sha256, uploaded_at, uploaded_by)
     VALUES (@id, @original_name, @stored_path, @mime_type, @byte_size, @sha256, @uploaded_at, @uploaded_by)`,
  ).run(row);
  return row;
}

export function getAsset(assetId: string): AssetRow | undefined {
  return db.prepare('SELECT * FROM file_asset WHERE id = ?').get(assetId) as AssetRow | undefined;
}

/* ------------------------------------------------------------------ */
/* Events and notifications                                            */
/* ------------------------------------------------------------------ */

export function recordEvent(
  jobId: string,
  versionId: string | null,
  from: JobStatus | null,
  to: JobStatus,
  actor: Actor,
  detail: string | null,
): void {
  db.prepare(
    `INSERT INTO artwork_status_event (id, job_id, version_id, from_status, to_status, actor, actor_role, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id('evt'), jobId, versionId, from, to, actor.name, actor.role, detail, nowIso());
}

export function sendNotification(
  jobId: string,
  versionId: string | null,
  kind: string,
  recipient: string,
  subject: string,
  body: string,
  isResend = false,
): string {
  const notifId = id('ntf');
  db.prepare(
    `INSERT INTO notification_event (id, job_id, version_id, kind, recipient, subject, body, channel, delivery_state, is_resend, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'email', 'recorded', ?, ?)`,
  ).run(notifId, jobId, versionId, kind, recipient, subject, body, isResend ? 1 : 0, nowIso());
  return notifId;
}

/* ------------------------------------------------------------------ */
/* Status transitions                                                  */
/* ------------------------------------------------------------------ */

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (from === to) return;
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new WorkflowError(
      `Cannot move from "${JOB_STATUS_LABELS[from]}" to "${JOB_STATUS_LABELS[to]}". Allowed next steps: ${
        allowed.length ? allowed.map((s) => JOB_STATUS_LABELS[s]).join(', ') : 'none'
      }.`,
    );
  }
}

export function setStatus(
  versionId: string,
  to: JobStatus,
  actor: Actor,
  detail: string | null,
): { job: JobRow; version: VersionRow } {
  const version = getVersion(versionId);
  if (!version) throw new WorkflowError('Artwork version not found.', 404);
  const job = getJob(version.job_id)!;
  assertTransition(version.status, to);
  const from = version.status;
  db.prepare('UPDATE artwork_version SET status = ? WHERE id = ?').run(to, versionId);
  // The job mirrors the status of its current version only.
  if (job.current_version_id === versionId) {
    db.prepare('UPDATE artwork_job SET status = ?, updated_at = ? WHERE id = ?').run(to, nowIso(), job.id);
  }
  recordEvent(job.id, versionId, from, to, actor, detail);
  return { job: getJob(job.id)!, version: getVersion(versionId)! };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export function getJob(jobId: string): JobRow | undefined {
  return db.prepare('SELECT * FROM artwork_job WHERE id = ?').get(jobId) as JobRow | undefined;
}

export function getVersion(versionId: string): VersionRow | undefined {
  return db.prepare('SELECT * FROM artwork_version WHERE id = ?').get(versionId) as VersionRow | undefined;
}

export function listVersions(jobId: string): VersionRow[] {
  return db
    .prepare('SELECT * FROM artwork_version WHERE job_id = ? ORDER BY version_number DESC')
    .all(jobId) as VersionRow[];
}

export function latestRun(versionId: string): RunRow | undefined {
  return db
    .prepare('SELECT * FROM analysis_run WHERE version_id = ? ORDER BY started_at DESC LIMIT 1')
    .get(versionId) as RunRow | undefined;
}

export function getRun(runId: string): RunRow | undefined {
  return db.prepare('SELECT * FROM analysis_run WHERE id = ?').get(runId) as RunRow | undefined;
}

/* ------------------------------------------------------------------ */
/* Job + version creation                                              */
/* ------------------------------------------------------------------ */

function nextJobNumber(): string {
  const row = db.prepare('SELECT COUNT(*) AS n FROM artwork_job').get() as { n: number };
  return `GLL-${String(1000 + row.n + 1)}`;
}

export function createJob(input: {
  customer: string;
  title: string;
  productNumber?: string | null;
  actor: Actor;
  asset: AssetRow;
  notes?: string | null;
}): { job: JobRow; version: VersionRow } {
  const jobId = id('job');
  const versionId = id('ver');
  const ts = nowIso();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO artwork_job (id, job_number, customer, product_number, title, status, current_version_id, created_at, updated_at, created_by, seeded)
       VALUES (?, ?, ?, ?, ?, 'uploaded', ?, ?, ?, ?, 0)`,
    ).run(
      jobId,
      nextJobNumber(),
      input.customer,
      input.productNumber ?? null,
      input.title,
      versionId,
      ts,
      ts,
      input.actor.name,
    );
    db.prepare(
      `INSERT INTO artwork_version (id, job_id, version_number, revision_label, file_asset_id, status, notes, created_at, created_by)
       VALUES (?, ?, 1, 'Initial', ?, 'uploaded', ?, ?, ?)`,
    ).run(versionId, jobId, input.asset.id, input.notes ?? null, ts, input.actor.name);
  })();

  recordEvent(jobId, versionId, null, 'uploaded', input.actor, `Uploaded ${input.asset.original_name}`);
  return { job: getJob(jobId)!, version: getVersion(versionId)! };
}

export function createRevision(input: {
  jobId: string;
  asset: AssetRow;
  actor: Actor;
  revisionLabel?: string | null;
  notes?: string | null;
}): VersionRow {
  const job = getJob(input.jobId);
  if (!job) throw new WorkflowError('Artwork job not found.', 404);
  const versions = listVersions(input.jobId);
  const previous = versions[0];
  const nextNumber = (previous?.version_number ?? 0) + 1;
  const versionId = id('ver');
  const ts = nowIso();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO artwork_version (id, job_id, version_number, revision_label, file_asset_id, status, notes, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'revision_uploaded', ?, ?, ?)`,
    ).run(
      versionId,
      input.jobId,
      nextNumber,
      input.revisionLabel ?? `Revision ${nextNumber}`,
      input.asset.id,
      input.notes ?? null,
      ts,
      input.actor.name,
    );
    // The earlier version is retained in full and simply marked superseded.
    if (previous) {
      db.prepare('UPDATE artwork_version SET status = ?, superseded_at = ? WHERE id = ?').run(
        'superseded',
        ts,
        previous.id,
      );
    }
    db.prepare('UPDATE artwork_job SET current_version_id = ?, status = ?, updated_at = ? WHERE id = ?').run(
      versionId,
      'revision_uploaded',
      ts,
      input.jobId,
    );
  })();

  if (previous) {
    recordEvent(
      input.jobId,
      previous.id,
      previous.status,
      'superseded',
      input.actor,
      `Superseded by version ${nextNumber}. The file, analysis, comments and approvals for version ${previous.version_number} are preserved.`,
    );
  }
  recordEvent(
    input.jobId,
    versionId,
    null,
    'revision_uploaded',
    input.actor,
    `Revision uploaded: ${input.asset.original_name}`,
  );
  return getVersion(versionId)!;
}

/* ------------------------------------------------------------------ */
/* Analysis runs                                                       */
/* ------------------------------------------------------------------ */

export function startRun(versionId: string, analyzerVersion: string, renderDir: string): RunRow {
  const runId = id('run');
  db.prepare(
    `INSERT INTO analysis_run (id, version_id, analyzer_version, state, started_at, stages_json, render_dir)
     VALUES (?, ?, ?, 'running', ?, '[]', ?)`,
  ).run(runId, versionId, analyzerVersion, nowIso(), renderDir);
  return getRun(runId)!;
}

export function updateRunStages(runId: string, stages: AnalysisStage[]): void {
  db.prepare('UPDATE analysis_run SET stages_json = ? WHERE id = ?').run(JSON.stringify(stages), runId);
}

export function failRun(runId: string, error: string): void {
  db.prepare(
    'UPDATE analysis_run SET state = ?, finished_at = ?, error = ? WHERE id = ?',
  ).run('failed', nowIso(), error, runId);
}

/** Persist an analysis result into its typed tables. */
export function completeRun(runId: string, versionId: string, result: AnalysisResult): void {
  db.transaction(() => {
    db.prepare(
      `UPDATE analysis_run SET state = 'complete', finished_at = ?, duration_ms = ?, stages_json = ?, result_json = ? WHERE id = ?`,
    ).run(nowIso(), result.durationMs, JSON.stringify(result.stages), JSON.stringify(result), runId);

    const attrStmt = db.prepare(
      `INSERT OR REPLACE INTO detected_attribute
       (id, run_id, version_id, key, label, category, data_type, raw_value, normalized_value, classification,
        source, confidence, status, warning, page, region, notes, analyzer_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const a of result.attributes) {
      attrStmt.run(
        `${runId}:${a.key}`,
        runId,
        versionId,
        a.key,
        a.label,
        a.category,
        a.dataType,
        a.rawValue,
        a.normalizedValue,
        a.classification,
        a.source,
        a.confidence,
        a.status,
        a.warning,
        a.page,
        a.region ? JSON.stringify(a.region) : null,
        a.notes,
        result.analyzerVersion,
      );
    }

    const bulk = (table: string, rows: { id: string }[]) => {
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (id, run_id, payload_json) VALUES (?, ?, ?)`);
      for (const r of rows) stmt.run(`${runId}:${r.id}`, runId, JSON.stringify(r));
    };
    bulk('color_channel', result.channels);
    bulk('production_layer', result.layers);
    bulk('material_finish', result.materials);
    bulk('dimension_record', result.dimensions);

    const pfStmt = db.prepare(
      `INSERT OR REPLACE INTO preflight_issue (id, run_id, payload_json, resolved) VALUES (?, ?, ?, 0)`,
    );
    for (const p of result.preflight) pfStmt.run(`${runId}:${p.id}`, runId, JSON.stringify(p));
  })();
}

/**
 * The stored analysis with every user confirmation and edit applied on top.
 * The original detection is always preserved underneath.
 */
export function resolvedResult(run: RunRow): AnalysisResult | null {
  if (!run.result_json) return null;
  const result = JSON.parse(run.result_json) as AnalysisResult;

  const attrRows = db
    .prepare('SELECT * FROM detected_attribute WHERE run_id = ?')
    .all(run.id) as Record<string, string | number | null>[];
  const attrByKey = new Map(attrRows.map((r) => [String(r.key), r]));
  result.attributes = result.attributes.map((a) => {
    const row = attrByKey.get(a.key);
    if (!row) return a;
    return {
      ...a,
      normalizedValue: (row.normalized_value as string) ?? a.normalizedValue,
      status: (row.status as typeof a.status) ?? a.status,
      source: (row.source as typeof a.source) ?? a.source,
      confidence: (row.confidence as number) ?? a.confidence,
      warning: (row.warning as string) ?? a.warning,
      confirmedBy: row.confirmed_by,
      confirmedAt: row.confirmed_at,
    } as typeof a;
  });

  const overlay = (table: string, list: { id: string }[]) => {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE run_id = ?`).all(run.id) as Record<
      string,
      string | null
    >[];
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    return list.map((item) => {
      const row = byId.get(`${run.id}:${item.id}`);
      if (!row) return item;
      const override = row.override_json ? JSON.parse(row.override_json) : {};
      return { ...item, ...override, confirmedBy: row.confirmed_by, confirmedAt: row.confirmed_at };
    });
  };
  result.channels = overlay('color_channel', result.channels) as typeof result.channels;
  result.layers = overlay('production_layer', result.layers) as typeof result.layers;
  result.materials = overlay('material_finish', result.materials) as typeof result.materials;
  result.dimensions = overlay('dimension_record', result.dimensions) as typeof result.dimensions;

  const pfRows = db.prepare('SELECT * FROM preflight_issue WHERE run_id = ?').all(run.id) as Record<
    string,
    string | number | null
  >[];
  const pfById = new Map(pfRows.map((r) => [String(r.id), r]));
  result.preflight = result.preflight.map((p) => {
    const row = pfById.get(`${run.id}:${p.id}`);
    if (!row) return p;
    return {
      ...p,
      resolved: Boolean(row.resolved),
      resolvedBy: (row.resolved_by as string) ?? null,
      resolvedAt: (row.resolved_at as string) ?? null,
    };
  });

  return result;
}

export function recordConfirmation(input: {
  versionId: string;
  runId: string;
  targetType: string;
  targetId: string;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  actor: Actor;
}): void {
  db.prepare(
    `INSERT INTO user_confirmation (id, version_id, run_id, target_type, target_id, action, previous_value, new_value, user_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id('cnf'),
    input.versionId,
    input.runId,
    input.targetType,
    input.targetId,
    input.action,
    input.previousValue,
    input.newValue,
    input.actor.name,
    nowIso(),
  );
}

/** True when nothing blocking is outstanding on the current analysis. */
export function blockingIssues(result: AnalysisResult | null): number {
  if (!result) return 0;
  return result.preflight.filter((p) => p.severity === 'blocking' && !p.resolved).length;
}
