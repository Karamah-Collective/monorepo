CREATE TABLE IF NOT EXISTS analytics_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analytics_daily_snapshots (
  snapshot_date TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('posthog','cloudflare')),
  metric TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(snapshot_date, provider, metric)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_snapshots_range
ON analytics_daily_snapshots(provider, snapshot_date DESC);
