/**
 * Store-level workflow tests.
 *
 * These run against a real SQLite database in a temporary directory, so version
 * immutability and the audit trail are exercised end to end.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gll-wf-'));
process.env.GLL_DATA_DIR = path.join(tmp, 'data');
process.env.GLL_STORAGE_DIR = path.join(tmp, 'storage');

const store = await import('../src/store.js');
const { db } = await import('../src/db.js');

const prepress: import('../src/store.js').Actor = { name: 'Susan (Prepress)', role: 'prepress' };
const customer: import('../src/store.js').Actor = { name: 'J. Rivera', role: 'customer' };

function asset(name: string, body: string) {
  return store.storeFileAsset(Buffer.from(body), name, 'application/pdf', prepress);
}

describe('artwork versioning', () => {
  let jobId: string;
  let v1: string;
  let v2: string;

  beforeAll(() => {
    const created = store.createJob({
      customer: 'Ecolab USA Inc.',
      title: 'Acid Toilet Bowl Cleaner',
      productNumber: '10-9819356',
      actor: prepress,
      asset: asset('v1.pdf', '%PDF-1.4 one'),
    });
    jobId = created.job.id;
    v1 = created.version.id;
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('creates version 1 pointing at the stored original', () => {
    const version = store.getVersion(v1)!;
    expect(version.version_number).toBe(1);
    const a = store.getAsset(version.file_asset_id)!;
    expect(fs.readFileSync(a.stored_path, 'utf8')).toBe('%PDF-1.4 one');
    expect(a.sha256).toHaveLength(64);
  });

  it('records an audit event for the upload', () => {
    const events = db.prepare('SELECT * FROM artwork_status_event WHERE job_id = ?').all(jobId);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('creates a new version on revision and never overwrites the old one', () => {
    store.setStatus(v1, 'analyzing', prepress, null);
    store.setStatus(v1, 'analysis_complete', prepress, null);
    store.setStatus(v1, 'prepress_reviewed', prepress, null);
    store.setStatus(v1, 'sent_for_customer_review', prepress, null);
    store.setStatus(v1, 'changes_requested', customer, 'Copy change.');

    const revision = store.createRevision({
      jobId,
      asset: asset('v2.pdf', '%PDF-1.4 two'),
      actor: prepress,
    });
    v2 = revision.id;

    expect(revision.version_number).toBe(2);
    const old = store.getVersion(v1)!;
    expect(old.status).toBe('superseded');
    expect(old.superseded_at).toBeTruthy();

    // The first file is byte-for-byte intact.
    const a1 = store.getAsset(old.file_asset_id)!;
    expect(fs.readFileSync(a1.stored_path, 'utf8')).toBe('%PDF-1.4 one');
    const a2 = store.getAsset(revision.file_asset_id)!;
    expect(fs.readFileSync(a2.stored_path, 'utf8')).toBe('%PDF-1.4 two');
    expect(a1.stored_path).not.toBe(a2.stored_path);

    expect(store.listVersions(jobId).map((v) => v.version_number)).toEqual([2, 1]);
    expect(store.getJob(jobId)!.current_version_id).toBe(v2);
  });

  it('keeps every earlier comment and approval after a revision', () => {
    db.prepare(
      `INSERT INTO artwork_comment (id, job_id, version_id, audience, author_name, author_role, body, created_at)
       VALUES ('c1', ?, ?, 'customer', 'J. Rivera', 'customer', 'Original note', datetime('now'))`,
    ).run(jobId, v1);
    store.createRevision({ jobId, asset: asset('v3.pdf', '%PDF-1.4 three'), actor: prepress });
    const kept = db.prepare('SELECT * FROM artwork_comment WHERE version_id = ?').all(v1);
    expect(kept).toHaveLength(1);
    expect(store.listVersions(jobId)).toHaveLength(3);
  });

  it('preserves the full status history across versions', () => {
    const events = db
      .prepare('SELECT to_status FROM artwork_status_event WHERE job_id = ? ORDER BY rowid')
      .all(jobId) as { to_status: string }[];
    const statuses = events.map((e) => e.to_status);
    expect(statuses).toContain('changes_requested');
    expect(statuses).toContain('superseded');
    expect(statuses).toContain('revision_uploaded');
  });
});

describe('status transition guard', () => {
  let versionId: string;

  beforeAll(() => {
    const created = store.createJob({
      customer: 'Test Co.',
      title: 'Guard test',
      actor: prepress,
      asset: asset('guard.pdf', '%PDF-1.4 guard'),
    });
    versionId = created.version.id;
  });

  it('rejects a jump straight from uploaded to approved', () => {
    expect(() => store.setStatus(versionId, 'approved', customer, null)).toThrow(store.WorkflowError);
  });

  it('names the legal next steps in the error', () => {
    try {
      store.setStatus(versionId, 'approved', customer, null);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatch(/Allowed next steps/);
    }
  });

  it('allows the legal move and records it', () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM artwork_status_event').get() as { n: number };
    store.setStatus(versionId, 'analyzing', prepress, 'started');
    const after = db.prepare('SELECT COUNT(*) AS n FROM artwork_status_event').get() as { n: number };
    expect(after.n).toBe(before.n + 1);
    expect(store.getVersion(versionId)!.status).toBe('analyzing');
  });
});

describe('notifications', () => {
  it('records sends and resends separately', () => {
    const created = store.createJob({
      customer: 'Notify Co.',
      title: 'Notify test',
      actor: prepress,
      asset: asset('n.pdf', '%PDF-1.4 n'),
    });
    const first = store.sendNotification(
      created.job.id,
      created.version.id,
      'sent_for_review',
      'a@b.example',
      'Subject',
      'Body',
    );
    const resent = store.sendNotification(
      created.job.id,
      created.version.id,
      'sent_for_review',
      'a@b.example',
      'Subject',
      'Body',
      true,
    );
    expect(first).not.toBe(resent);
    const rows = db
      .prepare('SELECT is_resend FROM notification_event WHERE job_id = ? ORDER BY rowid')
      .all(created.job.id) as { is_resend: number }[];
    expect(rows.map((r) => r.is_resend)).toEqual([0, 1]);
  });
});
