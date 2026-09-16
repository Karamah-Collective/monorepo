-- Persist event venues that are not linked to a directory place.
ALTER TABLE events ADD COLUMN location_name TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN location_address TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN location_lat REAL;
ALTER TABLE events ADD COLUMN location_lng REAL;
ALTER TABLE events ADD COLUMN location_gmaps_link TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN organizer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN organizer_place_id TEXT NOT NULL DEFAULT '';

ALTER TABLE event_edits ADD COLUMN location_name TEXT NOT NULL DEFAULT '';
ALTER TABLE event_edits ADD COLUMN location_address TEXT NOT NULL DEFAULT '';
ALTER TABLE event_edits ADD COLUMN location_lat REAL;
ALTER TABLE event_edits ADD COLUMN location_lng REAL;
ALTER TABLE event_edits ADD COLUMN location_gmaps_link TEXT NOT NULL DEFAULT '';
ALTER TABLE event_edits ADD COLUMN organizer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE event_edits ADD COLUMN organizer_place_id TEXT NOT NULL DEFAULT '';
