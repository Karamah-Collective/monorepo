-- Gmail push state. Gmail watch leases expire after at most seven days, so
-- these values let the event consumer renew safely and resume from history
-- without scanning the mailbox on every inbox read.
ALTER TABLE gmail_connections ADD COLUMN watch_history_id TEXT NOT NULL DEFAULT '';
ALTER TABLE gmail_connections ADD COLUMN watch_expiration INTEGER NOT NULL DEFAULT 0;

ALTER TABLE personal_gmail_connections ADD COLUMN watch_history_id TEXT NOT NULL DEFAULT '';
ALTER TABLE personal_gmail_connections ADD COLUMN watch_expiration INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_gmail_connections_watch_expiration
  ON gmail_connections(watch_expiration);
CREATE INDEX IF NOT EXISTS idx_personal_gmail_watch_expiration
  ON personal_gmail_connections(watch_expiration);
