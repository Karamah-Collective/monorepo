-- Website administration data. These tables live in the existing Karamah D1
-- database and are consumed only by the Website Pages project through its DB
-- binding.
CREATE TABLE IF NOT EXISTS website_people (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('active', 'inactive')),
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_website_people_public ON website_people(status, display_order, name);

CREATE TABLE IF NOT EXISTS website_content (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  content TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO website_content (id) VALUES (1);

CREATE TABLE IF NOT EXISTS website_subscribers (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  recaptcha_score TEXT NOT NULL DEFAULT '',
  subscribed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'subscribed' CHECK(status IN ('subscribed', 'unsubscribed')),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_website_subscribers_status ON website_subscribers(status, subscribed_at DESC);

CREATE TABLE IF NOT EXISTS website_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_website_audit_created_at ON website_audit(created_at DESC);
