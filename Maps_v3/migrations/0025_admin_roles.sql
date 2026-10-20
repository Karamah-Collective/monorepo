-- Role assignments live beside the protected admin data so authorization is
-- evaluated server-side for every request, not just hidden in the interface.
CREATE TABLE IF NOT EXISTS admin_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '[]',
  is_preset INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_role_members (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  role_id TEXT NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL DEFAULT '',
  added_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_role_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_role_id TEXT NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT
);

INSERT OR IGNORE INTO admin_roles (id, name, description, permissions, is_preset) VALUES
  ('administrator', 'Administrator', 'Full access, including access management.', '["*"]', 1),
  ('map-editor', 'Map editor', 'Manage maps, places, events and map configuration.', '["maps.*"]', 1),
  ('content-editor', 'Content editor', 'Manage website, link hub and forms content.', '["website.*","links.*","forms.*"]', 1),
  ('moderator', 'Moderator', 'Review community submissions, reviews, wishes and inbox.', '["moderation.*"]', 1),
  ('viewer', 'Viewer', 'View the workspace without making changes.', '["dashboard.view","activity.view"]', 1);

INSERT OR IGNORE INTO admin_role_settings (id, default_role_id) VALUES (1, 'viewer');

INSERT OR IGNORE INTO admin_role_members (email, role_id, display_name, added_by)
VALUES ('moontasir@karamahcollective.com', 'administrator', 'Moontasir', 'initial setup');
