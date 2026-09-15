-- Queue columns for pending app link submissions from Rihla.
ALTER TABLE new_places ADD COLUMN app_links TEXT NOT NULL DEFAULT '{}';
ALTER TABLE edits ADD COLUMN app_links TEXT NOT NULL DEFAULT '{}';
