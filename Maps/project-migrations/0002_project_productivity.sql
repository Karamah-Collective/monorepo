-- Productive project features that remain compatible with D1, R2 and Pages
-- Functions. The project database remains the only source of truth for these
-- records; Admin identity, MCP grants and audit events stay in karamah-admin-db.

CREATE TABLE IF NOT EXISTS project_saved_views (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_uid TEXT NOT NULL,
  name TEXT NOT NULL,
  view_type TEXT NOT NULL DEFAULT 'board' CHECK (view_type IN ('board','list','calendar','timeline','backlog')),
  filter_json TEXT NOT NULL DEFAULT '{}',
  sort_json TEXT NOT NULL DEFAULT '{}',
  shared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, owner_uid, name)
);
CREATE INDEX IF NOT EXISTS idx_project_saved_views_owner ON project_saved_views(owner_uid,project_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS project_task_watchers (
  task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(task_id,email)
);

CREATE TABLE IF NOT EXISTS project_notifications (
  id TEXT PRIMARY KEY,
  recipient_uid TEXT NOT NULL DEFAULT '',
  recipient_email TEXT NOT NULL COLLATE NOCASE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES project_tasks(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_notifications_recipient ON project_notifications(recipient_email,read_at,created_at DESC);

CREATE TABLE IF NOT EXISTS project_task_time_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL COLLATE NOCASE,
  started_at TEXT,
  ended_at TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_task_time_entries_task ON project_task_time_entries(task_id,created_at DESC);

CREATE TABLE IF NOT EXISTS project_custom_fields (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','select','checkbox')),
  options_json TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0,
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id,name)
);
CREATE TABLE IF NOT EXISTS project_task_custom_values (
  task_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES project_custom_fields(id) ON DELETE CASCADE,
  value_text TEXT NOT NULL DEFAULT '',
  updated_by_uid TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(task_id,field_id)
);

CREATE TABLE IF NOT EXISTS project_task_templates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id,name)
);

CREATE TABLE IF NOT EXISTS project_webhooks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL DEFAULT '',
  event_types_json TEXT NOT NULL DEFAULT '["task.created","task.updated","task.completed"]',
  active INTEGER NOT NULL DEFAULT 1,
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
