-- Keep previously shared long form URLs valid after their canonical links are
-- shortened. New forms only store their canonical three-character code.
CREATE TABLE IF NOT EXISTS form_share_code_aliases (
  code TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_form_share_code_aliases_form ON form_share_code_aliases(form_id);
