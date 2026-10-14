-- Invitation-only access for non-Karamah Project collaborators.
-- Membership rows are created only after the invitee accepts the link.
CREATE TABLE IF NOT EXISTS project_invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES project_workspaces(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  workspace_role TEXT,
  project_role TEXT,
  project_permissions_json TEXT NOT NULL DEFAULT '{}',
  project_task_visibility TEXT NOT NULL DEFAULT 'all' CHECK (project_task_visibility IN ('all','assigned','own')),
  selected_project_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','canceled')),
  invited_by_uid TEXT NOT NULL DEFAULT '',
  invited_by_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  sent_at TEXT,
  accepted_at TEXT,
  accepted_uid TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  CHECK ((workspace_id IS NOT NULL AND project_id IS NULL) OR (workspace_id IS NULL AND project_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_project_invitations_workspace
  ON project_invitations(workspace_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_invitations_project
  ON project_invitations(project_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_invitations_email
  ON project_invitations(email,status,expires_at);
