ALTER TABLE inbox_messages ADD COLUMN message_kind TEXT NOT NULL DEFAULT 'email';
ALTER TABLE inbox_messages ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_inbox_messages_kind ON inbox_messages(thread_id,message_kind,created_at);
