-- Admin Operations Workspace
-- The Operations database stores workflow state, approvals, and safe revision
-- snapshots. Domain databases remain the source of truth for their records.

CREATE TABLE IF NOT EXISTS operations_tasks (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  task_type TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  source_action TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'inbox' CHECK(status IN ('inbox','assigned','in_progress','blocked','completed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  assignee_uid TEXT NOT NULL DEFAULT '',
  assignee_email TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  required_permission TEXT NOT NULL DEFAULT 'dashboard.view',
  dedupe_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_uid TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_queue ON operations_tasks(status, priority, due_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_assignee ON operations_tasks(assignee_uid, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_domain ON operations_tasks(domain, task_type, status);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_source ON operations_tasks(source_type, source_id);

CREATE TABLE IF NOT EXISTS operations_task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES operations_tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_value TEXT NOT NULL DEFAULT '',
  to_value TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  actor_uid TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_operations_task_events_task ON operations_task_events(task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS operations_task_links (
  task_id TEXT NOT NULL REFERENCES operations_tasks(id) ON DELETE CASCADE,
  linked_type TEXT NOT NULL,
  linked_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(task_id, linked_type, linked_id)
);

CREATE TABLE IF NOT EXISTS operations_approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  payload_hash TEXT NOT NULL,
  source_revision TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','expired','cancelled')),
  requested_by_uid TEXT NOT NULL,
  requested_by_email TEXT NOT NULL,
  resolved_by_uid TEXT NOT NULL DEFAULT '',
  resolved_by_email TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_operations_approvals_status ON operations_approvals(status, expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_approvals_target ON operations_approvals(target_type, target_id, status);

CREATE TABLE IF NOT EXISTS operations_revisions (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('draft','published')),
  snapshot_json TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '',
  source_action TEXT NOT NULL DEFAULT '',
  actor_uid TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(domain, record_type, record_id, revision_number)
);
CREATE INDEX IF NOT EXISTS idx_operations_revisions_record ON operations_revisions(domain, record_type, record_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS operations_workspace_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  approval_policy_json TEXT NOT NULL DEFAULT '{}',
  draft_retention_days INTEGER NOT NULL DEFAULT 180,
  updated_by_uid TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO operations_workspace_settings (id, updated_at) VALUES (1, datetime('now'));

CREATE TABLE IF NOT EXISTS operations_idempotency (
  request_id TEXT PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
