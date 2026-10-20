-- One category-aware descriptive tag per community review photo.
-- Existing images use the neutral Location label until edited or replaced.
ALTER TABLE review_images ADD COLUMN photo_tag TEXT NOT NULL DEFAULT 'location';
