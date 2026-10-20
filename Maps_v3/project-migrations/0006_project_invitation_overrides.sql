-- Per-project overrides for workspace invitations.
-- An empty workspace_role means project-only access inside this workspace.
ALTER TABLE project_invitations
  ADD COLUMN project_roles_json TEXT NOT NULL DEFAULT '{}';
