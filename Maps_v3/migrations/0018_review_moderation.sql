-- Reversible review/image moderation and reviewer-level submission bans.
ALTER TABLE reviews ADD COLUMN moderation_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE review_images ADD COLUMN status TEXT NOT NULL DEFAULT 'yes' CHECK(status IN ('yes','no'));
ALTER TABLE review_images ADD COLUMN moderation_reason TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS reviewer_bans (
  email_hash TEXT PRIMARY KEY,
  reason     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT ''
);
