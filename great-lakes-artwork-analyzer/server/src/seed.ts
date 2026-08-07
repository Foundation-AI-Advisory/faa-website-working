/**
 * Demonstration jobs for the dashboard and queues.
 *
 * These exist only so the lists are not empty on a fresh install. They carry no
 * analysis results — a seeded job has no AnalysisRun, so nothing in the app ever
 * presents mocked analyzer output as real. Every analysed job comes from a real
 * uploaded PDF.
 */
import { db, id, nowIso } from './db.js';
import type { JobStatus } from './types.js';

interface SeedJob {
  customer: string;
  title: string;
  productNumber: string;
  status: JobStatus;
  daysAgo: number;
  approvedAfterHours?: number;
  events: [JobStatus, string, string][];
}

const SEEDS: SeedJob[] = [
  {
    customer: 'Midland Chemical Co.',
    title: 'Industrial Degreaser 1 gal — front panel',
    productNumber: '10-8842011',
    status: 'sent_for_customer_review',
    daysAgo: 2,
    events: [
      ['uploaded', 'Susan (Prepress)', 'Uploaded 10-8842011 v1 Proof.pdf'],
      ['analyzing', 'Analyzer', 'Automatic analysis started.'],
      ['analysis_complete', 'Analyzer', 'Analysis complete.'],
      ['prepress_reviewed', 'Susan (Prepress)', 'Analysis confirmed by prepress.'],
      ['sent_for_customer_review', 'Susan (Prepress)', 'Sent to purchasing@midlandchem.example for approval.'],
    ],
  },
  {
    customer: 'Northshore Beverage',
    title: 'Sparkling Water 12 oz — wrap label',
    productNumber: '10-7731204',
    status: 'changes_requested',
    daysAgo: 5,
    events: [
      ['uploaded', 'Susan (Prepress)', 'Uploaded 10-7731204 v2 Proof.pdf'],
      ['analysis_complete', 'Analyzer', 'Analysis complete.'],
      ['prepress_reviewed', 'Susan (Prepress)', 'Analysis confirmed by prepress.'],
      ['sent_for_customer_review', 'Susan (Prepress)', 'Sent to brand@northshore.example for approval.'],
      ['changes_requested', 'D. Alvarez', 'Nutrition panel type is too small; please increase to 6 pt.'],
    ],
  },
  {
    customer: 'Lakeside Pharma',
    title: 'Vial label 2 mL — booklet base',
    productNumber: '10-9120677',
    status: 'approved',
    daysAgo: 12,
    approvedAfterHours: 26,
    events: [
      ['uploaded', 'Susan (Prepress)', 'Uploaded 10-9120677 v3 Proof.pdf'],
      ['analysis_complete', 'Analyzer', 'Analysis complete.'],
      ['prepress_reviewed', 'Susan (Prepress)', 'Analysis confirmed by prepress.'],
      ['sent_for_customer_review', 'Susan (Prepress)', 'Sent to regulatory@lakesidepharma.example for approval.'],
      ['approved', 'M. Whitfield', 'Approved as is.'],
    ],
  },
  {
    customer: 'Grand River Foods',
    title: 'Maple Syrup 375 mL — face label',
    productNumber: '10-6650188',
    status: 'needs_prepress_review',
    daysAgo: 1,
    events: [
      ['uploaded', 'Susan (Prepress)', 'Uploaded 10-6650188 v1 Proof.pdf'],
      ['analysis_complete', 'Analyzer', 'Analysis complete.'],
      ['needs_prepress_review', 'Analyzer', 'Substrate and finish values need a prepress decision.'],
    ],
  },
];

export function seedDemoData(): void {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM artwork_job WHERE seeded = 1').get() as { n: number };
  if (existing.n > 0) return;

  const total = db.prepare('SELECT COUNT(*) AS n FROM artwork_job').get() as { n: number };
  let counter = total.n;

  for (const seed of SEEDS) {
    counter += 1;
    const jobId = id('job');
    const versionId = id('ver');
    const assetId = id('asset');
    const created = new Date(Date.now() - seed.daysAgo * 86_400_000).toISOString();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO file_asset (id, original_name, stored_path, mime_type, byte_size, sha256, uploaded_at, uploaded_by)
         VALUES (?, ?, '', 'application/pdf', 0, '', ?, 'Susan (Prepress)')`,
      ).run(assetId, `${seed.productNumber} Proof.pdf`, created);

      db.prepare(
        `INSERT INTO artwork_job (id, job_number, customer, product_number, title, status, current_version_id, created_at, updated_at, created_by, seeded)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Susan (Prepress)', 1)`,
      ).run(
        jobId,
        `GLL-${1000 + counter}`,
        seed.customer,
        seed.productNumber,
        seed.title,
        seed.status,
        versionId,
        created,
        created,
      );

      db.prepare(
        `INSERT INTO artwork_version (id, job_id, version_number, revision_label, file_asset_id, status, prepress_reviewed_at, prepress_reviewed_by, notes, created_at, created_by)
         VALUES (?, ?, 1, 'Initial', ?, ?, ?, ?, 'Demonstration record — no analyzer output is attached to this job.', ?, 'Susan (Prepress)')`,
      ).run(
        versionId,
        jobId,
        assetId,
        seed.status,
        seed.events.some((e) => e[0] === 'prepress_reviewed') ? created : null,
        seed.events.some((e) => e[0] === 'prepress_reviewed') ? 'Susan (Prepress)' : null,
        created,
      );

      let previous: JobStatus | null = null;
      seed.events.forEach(([status, actor, detail], i) => {
        const at = new Date(
          new Date(created).getTime() + i * ((seed.approvedAfterHours ?? 8) / seed.events.length) * 3_600_000,
        ).toISOString();
        db.prepare(
          `INSERT INTO artwork_status_event (id, job_id, version_id, from_status, to_status, actor, actor_role, detail, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id('evt'),
          jobId,
          versionId,
          previous,
          status,
          actor,
          actor === 'Analyzer' ? 'system' : /\(Prepress\)/.test(actor) ? 'prepress' : 'customer',
          detail,
          at,
        );
        previous = status;
      });

      if (seed.status === 'approved') {
        db.prepare(
          `INSERT INTO artwork_approval (id, job_id, version_id, decision, signature_name, signature_email, comment, decided_at)
           VALUES (?, ?, ?, 'approved', 'M. Whitfield', 'regulatory@lakesidepharma.example', 'Approved as is.', ?)`,
        ).run(
          id('apr'),
          jobId,
          versionId,
          new Date(new Date(created).getTime() + (seed.approvedAfterHours ?? 24) * 3_600_000).toISOString(),
        );
      }
      if (seed.status === 'changes_requested') {
        const comment = seed.events[seed.events.length - 1][2];
        db.prepare(
          `INSERT INTO artwork_comment (id, job_id, version_id, audience, author_name, author_role, body, created_at)
           VALUES (?, ?, ?, 'customer', 'D. Alvarez', 'customer', ?, ?)`,
        ).run(id('cmt'), jobId, versionId, comment, created);
      }
      if (seed.status === 'sent_for_customer_review' || seed.status === 'changes_requested' || seed.status === 'approved') {
        db.prepare(
          `INSERT INTO notification_event (id, job_id, version_id, kind, recipient, subject, body, channel, delivery_state, is_resend, created_at)
           VALUES (?, ?, ?, 'sent_for_review', ?, ?, ?, 'email', 'recorded', 0, ?)`,
        ).run(
          id('ntf'),
          jobId,
          versionId,
          `approvals@${seed.customer.toLowerCase().replace(/[^a-z]+/g, '')}.example`,
          `Artwork proof for approval — ${seed.title}`,
          'Please review the attached artwork proof and approve it or request changes.',
          created,
        );
      }
    })();
  }

  console.log(`[seed] inserted ${SEEDS.length} demonstration jobs (no analyzer output attached) at ${nowIso()}`);
}
