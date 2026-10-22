-- Event occurrences share the private timeline table but are keyed by event
-- occurrence date so recurring events can be recorded once per occurrence.
ALTER TABLE verified_visits ADD COLUMN event_id TEXT NOT NULL DEFAULT '';
ALTER TABLE verified_visits ADD COLUMN event_title TEXT NOT NULL DEFAULT '';
ALTER TABLE verified_visits ADD COLUMN occurrence_at TEXT NOT NULL DEFAULT '';
ALTER TABLE verified_visits ADD COLUMN event_lat REAL;
ALTER TABLE verified_visits ADD COLUMN event_lng REAL;
ALTER TABLE verified_visits ADD COLUMN event_location_name TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_verified_visits_event_occurrence
  ON verified_visits(email_hash, event_id, occurrence_at);
