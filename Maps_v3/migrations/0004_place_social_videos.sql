-- Feed clips attached to places (Rihla Discover). Metadata only — playback stays on TikTok/IG/YouTube.
-- Safe to re-run. (0003 is place_disabled.)
CREATE TABLE IF NOT EXISTS place_social_videos (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('TikTok', 'Instagram', 'YouTube')),
  url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  creator TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_place_social_videos_place_id
  ON place_social_videos(place_id);

CREATE INDEX IF NOT EXISTS idx_place_social_videos_created_at
  ON place_social_videos(created_at);
