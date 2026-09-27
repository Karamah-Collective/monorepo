CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed','archived','deleted')),
  draft_schema_json TEXT NOT NULL,
  draft_revision INTEGER NOT NULL DEFAULT 0,
  active_version_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS form_versions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  schema_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT NOT NULL,
  UNIQUE(form_id, version_number)
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  form_version_id TEXT NOT NULL REFERENCES form_versions(id),
  respondent_uid TEXT,
  respondent_email TEXT,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid',
  idempotency_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(form_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS form_answers (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  answer_type TEXT NOT NULL,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS form_files (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  submission_id TEXT REFERENCES form_submissions(id) ON DELETE CASCADE,
  question_id TEXT,
  upload_token TEXT NOT NULL UNIQUE,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS form_assets (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('cover','content','question')),
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forms_status_updated ON forms(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_versions_form ON form_versions(form_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_time ON form_submissions(form_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_uid ON form_submissions(form_id, respondent_uid);
CREATE INDEX IF NOT EXISTS idx_form_answers_submission ON form_answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_form_answers_question ON form_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_form_files_submission ON form_files(submission_id);
CREATE INDEX IF NOT EXISTS idx_form_assets_form ON form_assets(form_id);
