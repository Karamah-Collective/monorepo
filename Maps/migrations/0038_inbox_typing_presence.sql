-- Short-lived workspace presence for the shared inbox chat composer.
CREATE TABLE IF NOT EXISTS inbox_typing_presence (
  thread_id TEXT NOT NULL,
  admin_email TEXT NOT NULL COLLATE NOCASE,
  admin_name TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (thread_id, admin_email)
);

CREATE INDEX IF NOT EXISTS idx_inbox_typing_presence_expiry
  ON inbox_typing_presence(thread_id, updated_at);
