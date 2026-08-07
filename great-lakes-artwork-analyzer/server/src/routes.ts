import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { db, id, nowIso, STORAGE_DIR } from './db.js';
import {
  MAX_UPLOAD_BYTES,
  WorkflowError,
  blockingIssues,
  completeRun,
  createJob,
  createRevision,
  failRun,
  getAsset,
  getJob,
  getRun,
  getVersion,
  latestRun,
  listVersions,
  recordConfirmation,
  recordEvent,
  resolvedResult,
  sendNotification,
  setStatus,
  startRun,
  storeFileAsset,
  updateRunStages,
  type Actor,
  type JobRow,
  type RunRow,
  type VersionRow,
} from './store.js';
import { ANALYZER_VERSION, analyzePdf } from './analyzer/index.js';
import { toCsv, toHtmlReport } from './exporters.js';
import { JOB_STATUS_LABELS, type AnalysisResult, type JobStatus } from './types.js';

export const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function actorFrom(body: Record<string, unknown> | undefined, fallbackRole: Actor['role']): Actor {
  const name = typeof body?.actorName === 'string' && body.actorName.trim() ? body.actorName.trim() : null;
  const role = (typeof body?.actorRole === 'string' ? body.actorRole : fallbackRole) as Actor['role'];
  return {
    name: name ?? (role === 'customer' ? 'Customer' : 'Susan (Prepress)'),
    role: role === 'customer' || role === 'system' ? role : 'prepress',
    email: typeof body?.actorEmail === 'string' ? body.actorEmail : undefined,
  };
}

function requireVersion(versionId: string): VersionRow {
  const v = getVersion(versionId);
  if (!v) throw new WorkflowError('Artwork version not found.', 404);
  return v;
}

const RENDER_ROOT = path.join(STORAGE_DIR, 'renders');

function renderDirFor(runId: string): string {
  return path.join(RENDER_ROOT, runId);
}

/** Kicks off analysis for a version and persists the outcome. Never throws. */
async function runAnalysis(version: VersionRow): Promise<void> {
  const asset = getAsset(version.file_asset_id)!;
  const run = startRun(version.id, ANALYZER_VERSION, renderDirFor('pending'));
  const dir = renderDirFor(run.id);
  db.prepare('UPDATE analysis_run SET render_dir = ? WHERE id = ?').run(dir, run.id);

  const job = getJob(version.job_id)!;
  if (version.status === 'uploaded' || version.status === 'revision_uploaded') {
    setStatus(version.id, 'analyzing', { name: 'Analyzer', role: 'system' }, 'Automatic analysis started.');
  }

  try {
    const result = await analyzePdf({
      filePath: asset.stored_path,
      fileName: asset.original_name,
      renderDir: dir,
      renderUrlPrefix: `/api/renders/${run.id}`,
      onStage: (stage) => {
        const current = JSON.parse((getRun(run.id)?.stages_json ?? '[]') as string) as {
          key: string;
        }[];
        const next = current.filter((s) => s.key !== stage.key);
        next.push(stage);
        updateRunStages(run.id, next as never);
      },
    });
    completeRun(run.id, version.id, result);

    const blocking = blockingIssues(result);
    const unconfirmed =
      result.attributes.filter((a) => a.status === 'needs_review').length +
      result.materials.filter((m) => m.status === 'needs_review').length +
      result.dimensions.filter((d) => d.status === 'needs_review').length +
      result.channels.filter((c) => c.status === 'needs_review').length;

    const next: JobStatus = blocking > 0 || unconfirmed > 0 ? 'needs_prepress_review' : 'analysis_complete';
    setStatus(
      version.id,
      'analysis_complete',
      { name: 'Analyzer', role: 'system' },
      `Analysis complete in ${result.durationMs} ms. ${result.channels.length} separations, ${result.preflight.length} preflight checks.`,
    );
    if (next === 'needs_prepress_review') {
      setStatus(
        version.id,
        'needs_prepress_review',
        { name: 'Analyzer', role: 'system' },
        `${blocking} blocking issue(s) and ${unconfirmed} value(s) need a prepress decision.`,
      );
    }

    // Carry the detected product number onto the job when it had none.
    const product = result.attributes.find((a) => a.key === 'product_number')?.normalizedValue;
    if (product && !job.product_number) {
      db.prepare('UPDATE artwork_job SET product_number = ?, updated_at = ? WHERE id = ?').run(
        product,
        nowIso(),
        job.id,
      );
    }
  } catch (err) {
    const message = (err as Error).message || 'Unknown analyzer failure';
    failRun(run.id, message);
    recordEvent(
      version.job_id,
      version.id,
      version.status,
      version.status,
      { name: 'Analyzer', role: 'system' },
      `Analysis failed: ${message}`,
    );
  }
}

function versionPayload(version: VersionRow) {
  const run = latestRun(version.id);
  const asset = getAsset(version.file_asset_id);
  const result = run ? resolvedResult(run) : null;
  return {
    version,
    asset: asset
      ? {
          id: asset.id,
          originalName: asset.original_name,
          byteSize: asset.byte_size,
          sha256: asset.sha256,
          uploadedAt: asset.uploaded_at,
          uploadedBy: asset.uploaded_by,
          url: `/api/assets/${asset.id}`,
        }
      : null,
    run: run
      ? {
          id: run.id,
          state: run.state,
          analyzerVersion: run.analyzer_version,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          durationMs: run.duration_ms,
          error: run.error,
          stages: JSON.parse(run.stages_json),
        }
      : null,
    analysis: result,
    blockingIssues: blockingIssues(result),
    comments: db
      .prepare('SELECT * FROM artwork_comment WHERE version_id = ? ORDER BY created_at ASC')
      .all(version.id),
    approvals: db
      .prepare('SELECT * FROM artwork_approval WHERE version_id = ? ORDER BY decided_at ASC')
      .all(version.id),
  };
}

/** The workspace always needs the job alongside the version, so every response
 *  that returns version state returns the same complete shape. */
function fullVersionPayload(version: VersionRow) {
  return { ...versionPayload(version), job: jobPayload(getJob(version.job_id)!) };
}

function jobPayload(job: JobRow) {
  const versions = listVersions(job.id);
  return {
    job,
    statusLabel: JOB_STATUS_LABELS[job.status],
    versions: versions.map((v) => {
      const run = latestRun(v.id);
      return {
        ...v,
        runState: run?.state ?? null,
        analyzedAt: run?.finished_at ?? null,
      };
    }),
    events: db
      .prepare('SELECT * FROM artwork_status_event WHERE job_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(job.id),
    notifications: db
      .prepare('SELECT * FROM notification_event WHERE job_id = ? ORDER BY created_at DESC')
      .all(job.id),
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard and lists                                                 */
/* ------------------------------------------------------------------ */

router.get('/dashboard', (_req, res) => {
  const jobs = db.prepare('SELECT * FROM artwork_job ORDER BY updated_at DESC').all() as JobRow[];
  const count = (statuses: JobStatus[]) => jobs.filter((j) => statuses.includes(j.status)).length;

  // Cycle time: upload → approval, per approved version.
  const approvals = db
    .prepare(
      `SELECT a.decided_at, v.created_at AS uploaded_at
       FROM artwork_approval a JOIN artwork_version v ON v.id = a.version_id
       WHERE a.decision = 'approved'`,
    )
    .all() as { decided_at: string; uploaded_at: string }[];
  const hours = approvals.map(
    (a) => (new Date(a.decided_at).getTime() - new Date(a.uploaded_at).getTime()) / 3_600_000,
  );
  const avgHours = hours.length ? hours.reduce((s, h) => s + h, 0) / hours.length : null;

  res.json({
    counts: {
      awaitingAnalysis: count(['uploaded', 'analyzing', 'revision_uploaded']),
      needsPrepressReview: count(['needs_prepress_review', 'analysis_complete']),
      awaitingCustomer: count(['sent_for_customer_review']),
      changesRequested: count(['changes_requested']),
      approved: count(['approved']),
      total: jobs.length,
    },
    averageApprovalHours: avgHours,
    approvedCount: approvals.length,
    recentActivity: db
      .prepare(
        `SELECT e.*, j.job_number, j.title, j.customer
         FROM artwork_status_event e JOIN artwork_job j ON j.id = e.job_id
         ORDER BY e.created_at DESC, e.rowid DESC LIMIT 25`,
      )
      .all(),
    jobs: jobs.slice(0, 8).map((j) => ({ ...j, statusLabel: JOB_STATUS_LABELS[j.status] })),
  });
});

router.get('/jobs', (req, res) => {
  const filter = String(req.query.filter ?? 'all');
  const groups: Record<string, JobStatus[]> = {
    all: [],
    approval_queue: ['sent_for_customer_review'],
    needs_review: ['needs_prepress_review', 'analysis_complete', 'changes_requested'],
    approved: ['approved'],
  };
  const wanted = groups[filter] ?? [];
  let jobs = db.prepare('SELECT * FROM artwork_job ORDER BY updated_at DESC').all() as JobRow[];
  if (wanted.length) jobs = jobs.filter((j) => wanted.includes(j.status));
  const q = String(req.query.q ?? '').toLowerCase();
  if (q) {
    jobs = jobs.filter((j) =>
      [j.job_number, j.customer, j.title, j.product_number ?? ''].join(' ').toLowerCase().includes(q),
    );
  }
  res.json(
    jobs.map((j) => {
      const versions = listVersions(j.id);
      const current = versions.find((v) => v.id === j.current_version_id) ?? versions[0];
      const run = current ? latestRun(current.id) : undefined;
      return {
        ...j,
        statusLabel: JOB_STATUS_LABELS[j.status],
        versionCount: versions.length,
        currentVersionId: current?.id ?? null,
        currentVersionNumber: current?.version_number ?? null,
        runState: run?.state ?? null,
      };
    }),
  );
});

router.get('/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) throw new WorkflowError('Artwork job not found.', 404);
  res.json(jobPayload(job));
});

router.get('/versions/:versionId', (req, res) => {
  res.json(fullVersionPayload(requireVersion(req.params.versionId)));
});

/* ------------------------------------------------------------------ */
/* Upload and analysis                                                 */
/* ------------------------------------------------------------------ */

function validateUpload(file: Express.Multer.File | undefined): Buffer {
  if (!file) throw new WorkflowError('No file was uploaded. Choose a PDF proof to analyse.');
  if (file.size === 0) throw new WorkflowError('The uploaded file is empty.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new WorkflowError(`The file is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit.`);
  }
  const isPdfName = /\.pdf$/i.test(file.originalname);
  const header = file.buffer.subarray(0, 5).toString('latin1');
  if (header !== '%PDF-') {
    throw new WorkflowError(
      'That file is not a PDF. The analyzer reads PDF objects directly, so only PDF proofs can be processed.',
    );
  }
  if (!isPdfName) {
    throw new WorkflowError('The file must have a .pdf extension.');
  }
  return file.buffer;
}

router.post('/jobs', upload.single('file'), async (req, res) => {
  const buffer = validateUpload(req.file);
  const actor = actorFrom(req.body, 'prepress');
  const asset = storeFileAsset(buffer, req.file!.originalname, 'application/pdf', actor);
  const { job, version } = createJob({
    customer: String(req.body.customer ?? '').trim() || 'Unassigned customer',
    title: String(req.body.title ?? '').trim() || req.file!.originalname.replace(/\.pdf$/i, ''),
    productNumber: String(req.body.productNumber ?? '').trim() || null,
    notes: String(req.body.notes ?? '').trim() || null,
    actor,
    asset,
  });
  // Analysis runs in the background; the client polls the run for progress.
  void runAnalysis(version);
  res.status(201).json({ jobId: job.id, versionId: version.id });
});

router.post('/jobs/:jobId/revisions', upload.single('file'), async (req, res) => {
  const buffer = validateUpload(req.file);
  const actor = actorFrom(req.body, 'prepress');
  const asset = storeFileAsset(buffer, req.file!.originalname, 'application/pdf', actor);
  const version = createRevision({
    jobId: req.params.jobId,
    asset,
    actor,
    revisionLabel: String(req.body.revisionLabel ?? '').trim() || null,
    notes: String(req.body.notes ?? '').trim() || null,
  });
  void runAnalysis(version);
  res.status(201).json({ jobId: req.params.jobId, versionId: version.id });
});

router.post('/versions/:versionId/reanalyze', async (req, res) => {
  const version = requireVersion(req.params.versionId);
  void runAnalysis(version);
  res.json({ ok: true });
});

router.get('/runs/:runId', (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) throw new WorkflowError('Analysis run not found.', 404);
  res.json({
    id: run.id,
    versionId: run.version_id,
    state: run.state,
    error: run.error,
    stages: JSON.parse(run.stages_json),
    finishedAt: run.finished_at,
    durationMs: run.duration_ms,
  });
});

/* ------------------------------------------------------------------ */
/* Confirmations and edits                                             */
/* ------------------------------------------------------------------ */

const confirmSchema = z.object({
  targetType: z.enum(['attribute', 'channel', 'layer', 'material', 'dimension']),
  targetId: z.string().min(1),
  action: z.enum(['confirm', 'edit', 'reject']),
  value: z.string().nullable().optional(),
  status: z.string().optional(),
  actorName: z.string().optional(),
  actorRole: z.string().optional(),
});

router.post('/versions/:versionId/confirm', (req, res) => {
  const version = requireVersion(req.params.versionId);
  const run = latestRun(version.id);
  if (!run || run.state !== 'complete') throw new WorkflowError('This version has no completed analysis to confirm.');
  const input = confirmSchema.parse(req.body);
  const actor = actorFrom(req.body, 'prepress');
  const ts = nowIso();

  if (input.targetType === 'attribute') {
    const row = db
      .prepare('SELECT * FROM detected_attribute WHERE run_id = ? AND key = ?')
      .get(run.id, input.targetId) as Record<string, string | null> | undefined;
    if (!row) throw new WorkflowError('That detected value is not part of this analysis.', 404);
    const previous = row.normalized_value;
    const newValue = input.action === 'edit' ? (input.value ?? null) : previous;
    const status = input.action === 'reject' ? 'needs_review' : 'confirmed';
    db.prepare(
      `UPDATE detected_attribute
       SET normalized_value = ?, status = ?, confirmed_by = ?, confirmed_at = ?,
           source = CASE WHEN ? = 'edit' THEN 'manual_entry' ELSE source END,
           confidence = CASE WHEN ? = 'reject' THEN confidence ELSE 1.0 END,
           warning = CASE WHEN ? = 'reject' THEN warning ELSE NULL END
       WHERE run_id = ? AND key = ?`,
    ).run(newValue, status, actor.name, ts, input.action, input.action, input.action, run.id, input.targetId);
    recordConfirmation({
      versionId: version.id,
      runId: run.id,
      targetType: 'attribute',
      targetId: input.targetId,
      action: input.action,
      previousValue: previous,
      newValue,
      actor,
    });
  } else {
    const table = {
      channel: 'color_channel',
      layer: 'production_layer',
      material: 'material_finish',
      dimension: 'dimension_record',
    }[input.targetType];
    const rowId = `${run.id}:${input.targetId}`;
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(rowId) as
      | Record<string, string | null>
      | undefined;
    if (!row) throw new WorkflowError('That analysis record is not part of this analysis.', 404);
    const payload = JSON.parse(row.payload_json as string) as Record<string, unknown>;
    const existing = row.override_json ? JSON.parse(row.override_json) : {};
    const valueField =
      input.targetType === 'channel'
        ? 'normalizedName'
        : input.targetType === 'layer'
          ? 'classification'
          : input.targetType === 'dimension'
            ? 'rawValue'
            : 'normalizedValue';
    const previous = String((existing as Record<string, unknown>)[valueField] ?? payload[valueField] ?? '');
    const override: Record<string, unknown> = { ...existing };
    if (input.action === 'edit') {
      override[valueField] = input.value ?? null;
      override.source = 'manual_entry';
    }
    override.status = input.action === 'reject' ? 'needs_review' : 'confirmed';
    if (input.action !== 'reject') {
      override.confidence = 1;
      override.warning = null;
    }
    db.prepare(`UPDATE ${table} SET override_json = ?, confirmed_by = ?, confirmed_at = ? WHERE id = ?`).run(
      JSON.stringify(override),
      actor.name,
      ts,
      rowId,
    );
    recordConfirmation({
      versionId: version.id,
      runId: run.id,
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      previousValue: previous,
      newValue: input.action === 'edit' ? (input.value ?? null) : previous,
      actor,
    });
  }

  res.json(fullVersionPayload(requireVersion(version.id)));
});

router.post('/versions/:versionId/preflight/:issueId/resolve', (req, res) => {
  const version = requireVersion(req.params.versionId);
  const run = latestRun(version.id);
  if (!run) throw new WorkflowError('This version has no analysis.', 404);
  const actor = actorFrom(req.body, 'prepress');
  const rowId = `${run.id}:${req.params.issueId}`;
  const resolved = req.body?.resolved === false ? 0 : 1;
  const result = db
    .prepare('UPDATE preflight_issue SET resolved = ?, resolved_by = ?, resolved_at = ?, resolution_note = ? WHERE id = ?')
    .run(resolved, resolved ? actor.name : null, resolved ? nowIso() : null, String(req.body?.note ?? '') || null, rowId);
  if (result.changes === 0) throw new WorkflowError('Preflight issue not found on this analysis.', 404);
  recordEvent(
    version.job_id,
    version.id,
    version.status,
    version.status,
    actor,
    `${resolved ? 'Resolved' : 'Reopened'} preflight issue ${req.params.issueId}${req.body?.note ? `: ${req.body.note}` : ''}`,
  );
  res.json(fullVersionPayload(requireVersion(version.id)));
});

/* ------------------------------------------------------------------ */
/* Workflow actions                                                    */
/* ------------------------------------------------------------------ */

router.post('/versions/:versionId/prepress-review', (req, res) => {
  const version = requireVersion(req.params.versionId);
  const actor = actorFrom(req.body, 'prepress');
  const run = latestRun(version.id);
  const result = run ? resolvedResult(run) : null;
  if (!result) throw new WorkflowError('Analyse this version before marking it prepress reviewed.');
  const blocking = blockingIssues(result);
  if (blocking > 0) {
    throw new WorkflowError(
      `${blocking} blocking preflight issue(s) must be resolved before this analysis can be marked prepress reviewed.`,
    );
  }
  db.prepare('UPDATE artwork_version SET prepress_reviewed_at = ?, prepress_reviewed_by = ? WHERE id = ?').run(
    nowIso(),
    actor.name,
    version.id,
  );
  const out = setStatus(version.id, 'prepress_reviewed', actor, String(req.body?.note ?? '') || 'Analysis confirmed by prepress.');
  res.json(fullVersionPayload(out.version));
});

router.post('/versions/:versionId/send-for-review', (req, res) => {
  const version = requireVersion(req.params.versionId);
  const job = getJob(version.job_id)!;
  const actor = actorFrom(req.body, 'prepress');
  const recipient = String(req.body?.recipient ?? '').trim();
  if (!recipient) throw new WorkflowError('Enter the customer contact to send this proof to.');
  if (!version.prepress_reviewed_at) {
    throw new WorkflowError('Mark the analysis prepress reviewed before sending it for customer approval.');
  }
  const out = setStatus(version.id, 'sent_for_customer_review', actor, `Sent to ${recipient} for approval.`);
  sendNotification(
    job.id,
    version.id,
    'sent_for_review',
    recipient,
    `Artwork proof for approval — ${job.job_number} ${job.title} (v${version.version_number})`,
    String(req.body?.message ?? '') ||
      `${job.customer}, please review the attached artwork proof for ${job.title} (version ${version.version_number}) and approve it or request changes.`,
  );
  res.json(fullVersionPayload(out.version));
});

router.post('/versions/:versionId/approve', (req, res) => {
  const version = requireVersion(req.params.versionId);
  const job = getJob(version.job_id)!;
  const signature = String(req.body?.signatureName ?? '').trim();
  if (!signature) throw new WorkflowError('An approval signature name is required.');
  const actor = actorFrom({ ...req.body, actorName: signature, actorRole: 'customer' }, 'customer');
  const decidedAt = nowIso();

  db.prepare(
    `INSERT INTO artwork_approval (id, job_id, version_id, decision, signature_name, signature_email, comment, decided_at)
     VALUES (?, ?, ?, 'approved', ?, ?, ?, ?)`,
  ).run(
    id('apr'),
    job.id,
    version.id,
    signature,
    String(req.body?.signatureEmail ?? '') || null,
    String(req.body?.comment ?? '') || null,
    decidedAt,
  );
  const out = setStatus(version.id, 'approved', actor, `Approved by ${signature} at ${decidedAt}.`);
  sendNotification(
    job.id,
    version.id,
    'approved',
    'prepress@greatlakeslabel.com',
    `Artwork approved — ${job.job_number} v${version.version_number}`,
    `${signature} approved version ${version.version_number} of ${job.title}.`,
  );
  res.json(fullVersionPayload(out.version));
});

router.post('/versions/:versionId/request-changes', (req, res) => {
  const version = requireVersion(req.params.versionId);
  const job = getJob(version.job_id)!;
  const signature = String(req.body?.signatureName ?? '').trim();
  const comment = String(req.body?.comment ?? '').trim();
  if (!signature) throw new WorkflowError('A name is required when requesting changes.');
  if (!comment) throw new WorkflowError('Describe the changes required so prepress knows what to revise.');
  const actor = actorFrom({ ...req.body, actorName: signature, actorRole: 'customer' }, 'customer');

  db.prepare(
    `INSERT INTO artwork_approval (id, job_id, version_id, decision, signature_name, signature_email, comment, decided_at)
     VALUES (?, ?, ?, 'changes_requested', ?, ?, ?, ?)`,
  ).run(
    id('apr'),
    job.id,
    version.id,
    signature,
    String(req.body?.signatureEmail ?? '') || null,
    comment,
    nowIso(),
  );
  db.prepare(
    `INSERT INTO artwork_comment (id, job_id, version_id, audience, author_name, author_role, body, page, created_at)
     VALUES (?, ?, ?, 'customer', ?, 'customer', ?, ?, ?)`,
  ).run(id('cmt'), job.id, version.id, signature, comment, req.body?.page ?? null, nowIso());

  const out = setStatus(version.id, 'changes_requested', actor, `Changes requested by ${signature}.`);
  sendNotification(
    job.id,
    version.id,
    'changes_requested',
    'prepress@greatlakeslabel.com',
    `Changes requested — ${job.job_number} v${version.version_number}`,
    comment,
  );
  res.json(fullVersionPayload(out.version));
});

router.post('/versions/:versionId/comments', (req, res) => {
  const version = requireVersion(req.params.versionId);
  const body = String(req.body?.body ?? '').trim();
  if (!body) throw new WorkflowError('A comment cannot be empty.');
  const audience = req.body?.audience === 'customer' ? 'customer' : 'internal';
  const actor = actorFrom(req.body, audience === 'customer' ? 'customer' : 'prepress');
  db.prepare(
    `INSERT INTO artwork_comment (id, job_id, version_id, audience, author_name, author_role, body, page, location_x, location_y, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id('cmt'),
    version.job_id,
    version.id,
    audience,
    actor.name,
    actor.role,
    body,
    req.body?.page ?? null,
    req.body?.locationX ?? null,
    req.body?.locationY ?? null,
    nowIso(),
  );
  res.status(201).json(fullVersionPayload(requireVersion(version.id)));
});

router.post('/notifications/:notificationId/resend', (req, res) => {
  const original = db
    .prepare('SELECT * FROM notification_event WHERE id = ?')
    .get(req.params.notificationId) as Record<string, string> | undefined;
  if (!original) throw new WorkflowError('Notification not found.', 404);
  const notifId = sendNotification(
    original.job_id,
    original.version_id,
    original.kind,
    String(req.body?.recipient ?? '') || original.recipient,
    original.subject,
    original.body,
    true,
  );
  recordEvent(
    original.job_id,
    original.version_id ?? null,
    null,
    (getJob(original.job_id)?.status ?? 'uploaded') as JobStatus,
    actorFrom(req.body, 'prepress'),
    `Notification resent to ${String(req.body?.recipient ?? '') || original.recipient}.`,
  );
  res.json({ id: notifId });
});

/* ------------------------------------------------------------------ */
/* Files and exports                                                   */
/* ------------------------------------------------------------------ */

router.get('/assets/:assetId', (req, res) => {
  const asset = getAsset(req.params.assetId);
  if (!asset || !fs.existsSync(asset.stored_path)) throw new WorkflowError('File not found.', 404);
  res.setHeader('Content-Type', asset.mime_type);
  res.setHeader(
    'Content-Disposition',
    `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${asset.original_name.replace(/"/g, '')}"`,
  );
  fs.createReadStream(asset.stored_path).pipe(res);
});

router.get('/renders/:runId/:file', (req, res) => {
  const safe = path.basename(req.params.file);
  const file = path.join(RENDER_ROOT, path.basename(req.params.runId), safe);
  if (!file.startsWith(RENDER_ROOT) || !fs.existsSync(file)) throw new WorkflowError('Render not found.', 404);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  fs.createReadStream(file).pipe(res);
});

function exportContext(versionId: string): {
  job: JobRow;
  version: VersionRow;
  result: AnalysisResult;
  run: RunRow;
} {
  const version = requireVersion(versionId);
  const run = latestRun(version.id);
  const result = run ? resolvedResult(run) : null;
  if (!run || !result) throw new WorkflowError('This version has no completed analysis to export.', 404);
  return { job: getJob(version.job_id)!, version, result, run };
}

router.get('/versions/:versionId/export.json', (req, res) => {
  const { job, version, result } = exportContext(req.params.versionId);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${job.job_number}-v${version.version_number}-analysis.json"`,
  );
  res.json({
    exportedAt: nowIso(),
    job,
    version,
    analyzerVersion: result.analyzerVersion,
    analysis: result,
    comments: db.prepare('SELECT * FROM artwork_comment WHERE version_id = ?').all(version.id),
    approvals: db.prepare('SELECT * FROM artwork_approval WHERE version_id = ?').all(version.id),
    statusEvents: db.prepare('SELECT * FROM artwork_status_event WHERE job_id = ? ORDER BY created_at').all(job.id),
    notifications: db.prepare('SELECT * FROM notification_event WHERE job_id = ? ORDER BY created_at').all(job.id),
    userConfirmations: db.prepare('SELECT * FROM user_confirmation WHERE version_id = ?').all(version.id),
  });
});

router.get('/versions/:versionId/export.csv', (req, res) => {
  const { job, version, result } = exportContext(req.params.versionId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${job.job_number}-v${version.version_number}-analysis.csv"`,
  );
  res.send(toCsv(job, version, result));
});

router.get('/versions/:versionId/report.html', (req, res) => {
  const { job, version, result } = exportContext(req.params.versionId);
  const comments = db.prepare('SELECT * FROM artwork_comment WHERE version_id = ? ORDER BY created_at').all(version.id);
  const approvals = db.prepare('SELECT * FROM artwork_approval WHERE version_id = ? ORDER BY decided_at').all(version.id);
  const events = db
    .prepare('SELECT * FROM artwork_status_event WHERE job_id = ? ORDER BY created_at')
    .all(job.id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.query.download === '1') {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${job.job_number}-v${version.version_number}-analysis-report.html"`,
    );
  }
  res.send(toHtmlReport(job, version, result, { comments, approvals, events }));
});

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof WorkflowError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: `Invalid request: ${err.issues.map((i) => i.message).join('; ')}` });
    return;
  }
  const e = err as NodeJS.ErrnoException & { code?: string };
  if (e?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: `The file is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit.` });
    return;
  }
  console.error('[api] unhandled error', err);
  res.status(500).json({ error: (err as Error)?.message ?? 'Unexpected server error.' });
}
