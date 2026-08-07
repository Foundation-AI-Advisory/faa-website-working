import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(here, '..', '..');
export const DATA_DIR = process.env.GLL_DATA_DIR ?? path.join(APP_ROOT, 'data');
export const STORAGE_DIR = process.env.GLL_STORAGE_DIR ?? path.join(APP_ROOT, 'storage');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(STORAGE_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'artwork.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS artwork_job (
  id TEXT PRIMARY KEY,
  job_number TEXT NOT NULL,
  customer TEXT NOT NULL,
  product_number TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  current_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  seeded INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS file_asset (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artwork_version (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES artwork_job(id),
  version_number INTEGER NOT NULL,
  revision_label TEXT,
  file_asset_id TEXT NOT NULL REFERENCES file_asset(id),
  status TEXT NOT NULL,
  prepress_reviewed_at TEXT,
  prepress_reviewed_by TEXT,
  superseded_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE (job_id, version_number)
);

CREATE TABLE IF NOT EXISTS analysis_run (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES artwork_version(id),
  analyzer_version TEXT NOT NULL,
  state TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  error TEXT,
  stages_json TEXT NOT NULL DEFAULT '[]',
  result_json TEXT,
  render_dir TEXT
);

CREATE TABLE IF NOT EXISTS detected_attribute (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES analysis_run(id),
  version_id TEXT NOT NULL REFERENCES artwork_version(id),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  data_type TEXT NOT NULL,
  raw_value TEXT,
  normalized_value TEXT,
  classification TEXT,
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL,
  warning TEXT,
  page INTEGER,
  region TEXT,
  notes TEXT,
  analyzer_version TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  UNIQUE (run_id, key)
);

CREATE TABLE IF NOT EXISTS color_channel (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES analysis_run(id),
  payload_json TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  override_json TEXT
);

CREATE TABLE IF NOT EXISTS production_layer (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES analysis_run(id),
  payload_json TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  override_json TEXT
);

CREATE TABLE IF NOT EXISTS material_finish (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES analysis_run(id),
  payload_json TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  override_json TEXT
);

CREATE TABLE IF NOT EXISTS dimension_record (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES analysis_run(id),
  payload_json TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  override_json TEXT
);

CREATE TABLE IF NOT EXISTS preflight_issue (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES analysis_run(id),
  payload_json TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_by TEXT,
  resolved_at TEXT,
  resolution_note TEXT
);

CREATE TABLE IF NOT EXISTS user_confirmation (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES artwork_version(id),
  run_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  user_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artwork_comment (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES artwork_job(id),
  version_id TEXT NOT NULL REFERENCES artwork_version(id),
  audience TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  body TEXT NOT NULL,
  page INTEGER,
  location_x REAL,
  location_y REAL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artwork_approval (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES artwork_job(id),
  version_id TEXT NOT NULL REFERENCES artwork_version(id),
  decision TEXT NOT NULL,
  signature_name TEXT NOT NULL,
  signature_email TEXT,
  comment TEXT,
  decided_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artwork_status_event (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES artwork_job(id),
  version_id TEXT REFERENCES artwork_version(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_event (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES artwork_job(id),
  version_id TEXT REFERENCES artwork_version(id),
  kind TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL,
  delivery_state TEXT NOT NULL,
  is_resend INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_version_job ON artwork_version(job_id);
CREATE INDEX IF NOT EXISTS idx_run_version ON analysis_run(version_id);
CREATE INDEX IF NOT EXISTS idx_attr_run ON detected_attribute(run_id);
CREATE INDEX IF NOT EXISTS idx_event_job ON artwork_status_event(job_id);
CREATE INDEX IF NOT EXISTS idx_comment_version ON artwork_comment(version_id);
CREATE INDEX IF NOT EXISTS idx_notify_job ON notification_event(job_id);
`);

export function nowIso(): string {
  return new Date().toISOString();
}

let counter = 0;
export function id(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
