-- Hide approved places from the public map without deleting them from D1.
ALTER TABLE places ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_places_disabled ON places(disabled);
