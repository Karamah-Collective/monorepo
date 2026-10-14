-- Projects-owned workspace membership and roles.
-- Admin-panel roles are intentionally not referenced here: Projects access is
-- scoped to these workspace and project records instead.

CREATE TABLE IF NOT EXISTS project_workspace_roles (
  workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '[]',
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(workspace_id,id)
);

CREATE TABLE IF NOT EXISTS project_workspace_members (
  workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(workspace_id,email)
);

CREATE INDEX IF NOT EXISTS idx_project_workspace_members_email
  ON project_workspace_members(email,workspace_id);

INSERT OR IGNORE INTO project_workspace_roles
  (workspace_id,id,name,description,permissions,is_system)
VALUES
  ('workspace-default','viewer','Viewer','Can view workspace projects and tasks.','["project.read","task.read","label.read","workspace.read","member.read"]',1),
  ('workspace-default','member','Member','Can work on workspace projects and tasks.','["project.create","project.read","task.create","task.read","task.update","label.create","label.read","label.update","label.delete","workspace.read","member.read"]',1),
  ('workspace-default','admin','Admin','Can manage workspace projects, settings, and members.','["project.create","project.read","project.update","project.delete","project.share","task.create","task.read","task.update","task.delete","task.assign","label.create","label.read","label.update","label.delete","workspace.read","workspace.update","workspace.manage_settings","member.read","member.update","member.delete","invitation.create"]',1);
