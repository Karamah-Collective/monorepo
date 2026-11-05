-- Private, user-triggered GPS-confirmed visit events for Manarah Maps.
-- Coordinates from the user's device are never accepted or stored here.
CREATE TABLE IF NOT EXISTS verified_visits (
  id          TEXT PRIMARY KEY,
  email_hash  TEXT NOT NULL,
  place_id    TEXT NOT NULL,
  place_name  TEXT NOT NULL DEFAULT '',
  visited_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verified_visits_account_time
  ON verified_visits(email_hash, visited_at DESC);
