ALTER TABLE inbox_threads ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inbox_threads ADD COLUMN snoozed_until TEXT NOT NULL DEFAULT '';
ALTER TABLE inbox_threads ADD COLUMN assigned_to TEXT NOT NULL DEFAULT '';
ALTER TABLE inbox_threads ADD COLUMN assigned_name TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_inbox_threads_snoozed
  ON inbox_threads(snoozed_until);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_assignment
  ON inbox_threads(assigned_to);
