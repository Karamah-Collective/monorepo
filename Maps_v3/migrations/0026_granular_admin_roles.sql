-- Upgrade installations that already applied 0025 before granular roles and
-- automatic default assignment were introduced.
CREATE TABLE IF NOT EXISTS admin_role_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_role_id TEXT NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT
);

UPDATE admin_roles SET permissions = '["maps.*"]' WHERE id = 'map-editor';
UPDATE admin_roles SET permissions = '["website.*","links.*","forms.*"]' WHERE id = 'content-editor';
UPDATE admin_roles SET permissions = '["moderation.*"]' WHERE id = 'moderator';
UPDATE admin_roles SET permissions = '["dashboard.view","activity.view"]' WHERE id = 'viewer';
INSERT OR IGNORE INTO admin_role_settings (id, default_role_id) VALUES (1, 'viewer');
