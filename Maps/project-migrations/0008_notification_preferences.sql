CREATE TABLE IF NOT EXISTS project_notification_preferences (
  owner_uid TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  email_enabled INTEGER NOT NULL DEFAULT 0,
  ntfy_enabled INTEGER NOT NULL DEFAULT 0,
  ntfy_server_url TEXT,
  ntfy_topic TEXT,
  ntfy_token_ciphertext TEXT NOT NULL DEFAULT '',
  gotify_enabled INTEGER NOT NULL DEFAULT 0,
  gotify_server_url TEXT,
  gotify_token_ciphertext TEXT NOT NULL DEFAULT '',
  webhook_enabled INTEGER NOT NULL DEFAULT 0,
  webhook_url TEXT,
  webhook_secret_ciphertext TEXT NOT NULL DEFAULT '',
  task_assignment_enabled INTEGER NOT NULL DEFAULT 1,
  task_comment_enabled INTEGER NOT NULL DEFAULT 1,
  task_status_change_enabled INTEGER NOT NULL DEFAULT 1,
  due_date_reminder_enabled INTEGER NOT NULL DEFAULT 1,
  due_date_reminder_lead_time_minutes INTEGER NOT NULL DEFAULT 1440,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_notification_workspace_rules (
  owner_uid TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
  is_active INTEGER NOT NULL DEFAULT 1,
  email_enabled INTEGER NOT NULL DEFAULT 0,
  ntfy_enabled INTEGER NOT NULL DEFAULT 0,
  gotify_enabled INTEGER NOT NULL DEFAULT 0,
  webhook_enabled INTEGER NOT NULL DEFAULT 0,
  project_mode TEXT NOT NULL DEFAULT 'all' CHECK (project_mode IN ('all','selected')),
  selected_project_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(owner_uid, workspace_id)
);
