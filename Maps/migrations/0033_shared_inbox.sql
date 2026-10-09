-- Shared customer correspondence, including messages forwarded by the mail host
-- and submissions mirrored from the public contact forms.
CREATE TABLE IF NOT EXISTS inbox_threads (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL DEFAULT '',
  participant_email TEXT NOT NULL DEFAULT '',
  participant_name TEXT NOT NULL DEFAULT '',
  mailbox TEXT NOT NULL DEFAULT 'contact@karamahcollective.com',
  source TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_updated ON inbox_threads(status,last_message_at DESC);
CREATE TABLE IF NOT EXISTS inbox_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES inbox_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  sender_email TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  recipient_email TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  provider_message_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_messages_provider_id ON inbox_messages(provider_message_id) WHERE provider_message_id <> '';
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread ON inbox_messages(thread_id,created_at);
