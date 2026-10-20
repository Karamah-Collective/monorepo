-- Universal workspace capabilities are enforced in application code. Roles only
-- store additional read/write grants, keeping the baseline consistent for all.
CREATE TABLE IF NOT EXISTS admin_access_requests (
  id TEXT PRIMARY KEY,
  requester_email TEXT NOT NULL COLLATE NOCASE,
  requested_permission TEXT NOT NULL,
  admin_email TEXT NOT NULL COLLATE NOCASE,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_access_requests_admin_status
  ON admin_access_requests(admin_email, status, created_at DESC);

UPDATE admin_roles SET
  description = 'Everyday workspace access. Personal forms, QR tools, place browsing, and the team directory are included for everyone.',
  permissions = '[]'
WHERE id = 'viewer';

UPDATE admin_roles SET permissions = '["maps.*"]' WHERE id = 'map-editor';
UPDATE admin_roles SET permissions = '["website.*","links.*","forms.*","reports.write"]' WHERE id = 'content-editor';
