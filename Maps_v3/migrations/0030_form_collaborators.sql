-- Apply this migration to the Forms D1 database, not the Maps database.
ALTER TABLE forms ADD COLUMN owner_email TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS form_collaborators (
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (form_id, email)
);

CREATE INDEX IF NOT EXISTS idx_form_collaborators_email
  ON form_collaborators(email, form_id);
