-- Dedicated project workspace database.
-- This database is authoritative for Projects only. Forms, Maps, Website,
-- Links, Inbox, and Admin identity/access data remain in their own databases.

CREATE TABLE IF NOT EXISTS project_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('workspace','restricted')),
  archived_at TEXT,
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES project_workspaces(id),
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('workspace','restricted')),
  archived_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, key)
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','contributor','manager','project-admin')),
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(project_id, email)
);

CREATE TABLE IF NOT EXISTS project_columns (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status_category TEXT NOT NULL DEFAULT 'inbox' CHECK (status_category IN ('inbox','assigned','in_progress','blocked','completed','cancelled')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_at TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed','cancelled')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  column_id TEXT NOT NULL REFERENCES project_columns(id),
  status_category TEXT NOT NULL DEFAULT 'inbox' CHECK (status_category IN ('inbox','assigned','in_progress','blocked','completed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assignee_uid TEXT NOT NULL DEFAULT '',
  assignee_email TEXT NOT NULL DEFAULT '',
  start_at TEXT,
  due_at TEXT,
  milestone_id TEXT REFERENCES project_milestones(id),
  source_domain TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  source_action TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT,
  position REAL NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(project_id, task_number),
  UNIQUE(project_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_queue ON project_tasks(project_id,status_category,priority,due_at,position);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee ON project_tasks(assignee_uid,status_category,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_tasks_source ON project_tasks(source_domain,source_type,source_id);

CREATE TABLE IF NOT EXISTS project_labels (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#2b745c',
  UNIQUE(project_id,name)
);
CREATE TABLE IF NOT EXISTS project_task_labels (
  task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES project_labels(id) ON DELETE CASCADE,
  PRIMARY KEY(task_id,label_id)
);
CREATE TABLE IF NOT EXISTS project_task_relations (
  task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  related_task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('blocks','blocked_by','relates_to','subtask')),
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(task_id,related_task_id,relation_type)
);
CREATE TABLE IF NOT EXISTS project_task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_uid TEXT NOT NULL DEFAULT '',
  author_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS project_task_attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS project_task_links (
  task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL,
  link_id TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(task_id,link_type,link_id)
);
CREATE TABLE IF NOT EXISTS project_task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_value TEXT NOT NULL DEFAULT '',
  to_value TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  actor_uid TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_task_events_task ON project_task_events(task_id,created_at DESC);
CREATE TABLE IF NOT EXISTS project_task_idempotency (
  request_id TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(request_id,actor_uid)
);

-- Kept in the Projects database because these rows describe task projections,
-- not Admin identity or permissions. Google synchronization remains disabled
-- until its OAuth flow is enabled.
CREATE TABLE IF NOT EXISTS google_workspace_connections (
  owner_uid TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  account_email TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','revoked','error')),
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS google_workspace_oauth_states (
  state TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS google_workspace_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  task_list_name TEXT NOT NULL DEFAULT 'Karamah Admin',
  sync_enabled INTEGER NOT NULL DEFAULT 0,
  updated_by_uid TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO google_workspace_settings (id) VALUES (1);
CREATE TABLE IF NOT EXISTS google_workspace_task_links (
  task_id TEXT PRIMARY KEY REFERENCES project_tasks(id) ON DELETE CASCADE,
  owner_uid TEXT NOT NULL,
  google_task_list_id TEXT NOT NULL,
  google_task_id TEXT NOT NULL,
  google_etag TEXT NOT NULL DEFAULT '',
  sync_hash TEXT NOT NULL DEFAULT '',
  external_state TEXT NOT NULL DEFAULT 'active' CHECK (external_state IN ('active','completed','deleted','conflict')),
  last_synced_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_uid,google_task_list_id,google_task_id)
);
CREATE TABLE IF NOT EXISTS google_workspace_sync_outbox (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  owner_uid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_google_workspace_outbox_ready ON google_workspace_sync_outbox(completed_at,available_at);
CREATE TABLE IF NOT EXISTS google_workspace_sync_events (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  task_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('admin_to_google','google_to_admin')),
  status TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO project_workspaces (id,name,description,created_by_uid,created_by_email)
VALUES ('workspace-default','Karamah Projects','Private project workspaces for Karamah Collective.','','');
INSERT OR IGNORE INTO projects (id,workspace_id,name,key,description,visibility,created_by_uid,created_by_email)
VALUES ('project-admin-operations','workspace-default','Admin operations','OPS','Migrated operational work and cross-domain tasks.','workspace','','');
INSERT OR IGNORE INTO project_columns (id,project_id,name,status_category,position) VALUES
 ('project-admin-operations-inbox','project-admin-operations','Inbox','inbox',10),
 ('project-admin-operations-progress','project-admin-operations','In progress','in_progress',20),
 ('project-admin-operations-blocked','project-admin-operations','Blocked','blocked',30),
 ('project-admin-operations-done','project-admin-operations','Done','completed',40),
 ('project-admin-operations-cancelled','project-admin-operations','Cancelled','cancelled',50);
