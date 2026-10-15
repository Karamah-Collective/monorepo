-- The Projects UI exposes medium priority. Rebuild the table because SQLite
-- does not support changing a CHECK constraint in place.
PRAGMA foreign_keys=OFF;

CREATE TABLE project_tasks_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  column_id TEXT NOT NULL REFERENCES project_columns(id),
  status_category TEXT NOT NULL DEFAULT 'inbox' CHECK (status_category IN ('inbox','assigned','in_progress','blocked','completed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','medium','high','urgent')),
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

INSERT INTO project_tasks_new (
  id,project_id,task_number,title,description,column_id,status_category,priority,
  assignee_uid,assignee_email,start_at,due_at,milestone_id,source_domain,
  source_type,source_id,source_action,dedupe_key,position,revision,created_by_uid,
  created_by_email,created_at,updated_at,completed_at
)
SELECT
  id,project_id,task_number,title,description,column_id,status_category,priority,
  assignee_uid,assignee_email,start_at,due_at,milestone_id,source_domain,
  source_type,source_id,source_action,dedupe_key,position,revision,created_by_uid,
  created_by_email,created_at,updated_at,completed_at
FROM project_tasks;

DROP TABLE project_tasks;
ALTER TABLE project_tasks_new RENAME TO project_tasks;

CREATE INDEX IF NOT EXISTS idx_project_tasks_queue ON project_tasks(project_id,status_category,priority,due_at,position);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee ON project_tasks(assignee_uid,status_category,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_tasks_source ON project_tasks(source_domain,source_type,source_id);

PRAGMA foreign_keys=ON;
