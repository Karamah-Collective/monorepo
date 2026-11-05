CREATE TABLE IF NOT EXISTS place_photos (
  id                TEXT PRIMARY KEY,
  place_id          TEXT NOT NULL,
  email_hash        TEXT NOT NULL,
  object_key        TEXT NOT NULL UNIQUE,
  content_type      TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  photo_tag         TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'yes' CHECK(status IN ('yes','no')),
  moderation_reason TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(place_id) REFERENCES places(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_place_photos_place_id ON place_photos(place_id);
CREATE INDEX IF NOT EXISTS idx_place_photos_email_hash ON place_photos(email_hash);
