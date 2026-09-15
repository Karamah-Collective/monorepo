-- App-exclusive place links (Rihla mobile). Safe to re-run.
CREATE TABLE IF NOT EXISTS place_app_links (
  place_id TEXT PRIMARY KEY,
  tiktok_url TEXT NOT NULL DEFAULT '',
  instagram_url TEXT NOT NULL DEFAULT '',
  youtube_url TEXT NOT NULL DEFAULT '',
  google_url TEXT NOT NULL DEFAULT '',
  google_maps_url TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_place_app_links_updated_at
  ON place_app_links(updated_at);
