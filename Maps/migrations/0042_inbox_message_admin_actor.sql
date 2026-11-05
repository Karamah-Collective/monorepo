ALTER TABLE inbox_messages ADD COLUMN sender_admin_email TEXT NOT NULL DEFAULT '';
ALTER TABLE inbox_messages ADD COLUMN sender_admin_name TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_inbox_messages_admin_actor
  ON inbox_messages(sender_admin_email, created_at);
