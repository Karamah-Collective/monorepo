-- Shorten existing opaque form share codes.
-- This changes public /f/:code links for already-created forms; apply only
-- when you are ready for Admin to show the shorter links as canonical.
UPDATE forms
SET share_code = lower(hex(randomblob(6)))
WHERE share_code IS NOT NULL
  AND length(share_code) > 12;
