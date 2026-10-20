-- Place media: permanent community review uploads plus the only Google value
-- the public Places policy explicitly permits storing indefinitely (place ID).
CREATE TABLE IF NOT EXISTS review_images (
  id           TEXT PRIMARY KEY,
  review_id    INTEGER NOT NULL,
  place_id     TEXT NOT NULL,
  object_key   TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY(place_id) REFERENCES places(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_review_images_review_id ON review_images(review_id);
CREATE INDEX IF NOT EXISTS idx_review_images_place_id ON review_images(place_id);

CREATE TABLE IF NOT EXISTS place_google_ids (
  place_id        TEXT PRIMARY KEY,
  google_place_id TEXT NOT NULL,
  resolved_at     TEXT NOT NULL,
  FOREIGN KEY(place_id) REFERENCES places(id) ON DELETE CASCADE
);
