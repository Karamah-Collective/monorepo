CREATE TABLE IF NOT EXISTS weekly_report_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed','unsubscribed')),
  unsubscribe_token TEXT NOT NULL UNIQUE,
  added_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_report_subscribers_email
ON weekly_report_subscribers(lower(email));

CREATE INDEX IF NOT EXISTS idx_weekly_report_subscribers_status
ON weekly_report_subscribers(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS weekly_report_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  report_mode TEXT NOT NULL DEFAULT 'enabled' CHECK (report_mode IN ('enabled','disabled','test')),
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly','biweekly','monthly')),
  day_of_week INTEGER NOT NULL DEFAULT 6 CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month INTEGER NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 31),
  send_time TEXT NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'Europe/Helsinki',
  subject_prefix TEXT NOT NULL DEFAULT 'Manarah weekly report',
  visual_density TEXT NOT NULL DEFAULT 'standard' CHECK (visual_density IN ('standard','compact')),
  accent_color TEXT NOT NULL DEFAULT '#08705b',
  include_analytics INTEGER NOT NULL DEFAULT 1,
  include_community INTEGER NOT NULL DEFAULT 1,
  include_queues INTEGER NOT NULL DEFAULT 1,
  include_countries INTEGER NOT NULL DEFAULT 1,
  include_contributions INTEGER NOT NULL DEFAULT 1,
  last_sent_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO weekly_report_settings (id) VALUES (1);

INSERT OR IGNORE INTO weekly_report_subscribers (
  id,
  email,
  display_name,
  status,
  unsubscribe_token,
  added_by
) VALUES (
  lower(hex(randomblob(16))),
  'home@karamahcollective.com',
  'Home',
  'subscribed',
  lower(hex(randomblob(24))),
  'migration'
);

UPDATE admin_roles
SET permissions = '["website.*","links.*","forms.*","reports.manage"]'
WHERE id = 'content-editor';
