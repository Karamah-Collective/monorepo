-- Fine-grained project privacy. project_members.role remains the named role
-- preset and this table stores the per-person overrides.
CREATE TABLE IF NOT EXISTS project_member_permissions (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  can_view_project INTEGER NOT NULL DEFAULT 1,
  can_read_tasks INTEGER NOT NULL DEFAULT 1,
  can_create_tasks INTEGER NOT NULL DEFAULT 0,
  can_edit_own_tasks INTEGER NOT NULL DEFAULT 0,
  can_edit_any_tasks INTEGER NOT NULL DEFAULT 0,
  can_assign_tasks INTEGER NOT NULL DEFAULT 0,
  can_comment INTEGER NOT NULL DEFAULT 0,
  can_relate INTEGER NOT NULL DEFAULT 0,
  can_attach INTEGER NOT NULL DEFAULT 0,
  can_manage_members INTEGER NOT NULL DEFAULT 0,
  can_manage_project INTEGER NOT NULL DEFAULT 0,
  task_visibility TEXT NOT NULL DEFAULT 'all' CHECK (task_visibility IN ('all','assigned','own')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(project_id,email)
);
CREATE INDEX IF NOT EXISTS idx_project_member_permissions_email
  ON project_member_permissions(email,project_id);

-- Seed explicit members from the existing role preset. This is intentionally
-- idempotent: later role edits are written by the project member API.
INSERT OR IGNORE INTO project_member_permissions (
  project_id,email,can_view_project,can_read_tasks,can_create_tasks,
  can_edit_own_tasks,can_edit_any_tasks,can_assign_tasks,can_comment,
  can_relate,can_attach,can_manage_members,can_manage_project,task_visibility
)
SELECT
  project_id,
  email,
  1,
  1,
  CASE WHEN role IN ('contributor','manager','project-admin') THEN 1 ELSE 0 END,
  CASE WHEN role IN ('contributor','manager','project-admin') THEN 1 ELSE 0 END,
  CASE WHEN role IN ('manager','project-admin') THEN 1 ELSE 0 END,
  CASE WHEN role IN ('manager','project-admin') THEN 1 ELSE 0 END,
  CASE WHEN role IN ('contributor','manager','project-admin') THEN 1 ELSE 0 END,
  CASE WHEN role IN ('contributor','manager','project-admin') THEN 1 ELSE 0 END,
  CASE WHEN role IN ('contributor','manager','project-admin') THEN 1 ELSE 0 END,
  CASE WHEN role = 'project-admin' THEN 1 ELSE 0 END,
  CASE WHEN role = 'project-admin' THEN 1 ELSE 0 END,
  'all'
FROM project_members;
