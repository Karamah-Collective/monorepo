-- Preserve existing opaque form URLs before rotating their canonical codes.
-- Migration 0024 adds the supporting index after this backfill.
CREATE TABLE IF NOT EXISTS form_share_code_aliases (
  code TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO form_share_code_aliases (code, form_id, created_at)
SELECT share_code, id, datetime('now')
FROM forms
WHERE share_code IS NOT NULL
  AND length(share_code) > 12;

-- Shorten existing opaque form share codes. Existing public /f/:code links
-- remain resolvable through the alias records above.
UPDATE forms
SET share_code = lower(hex(randomblob(6)))
WHERE share_code IS NOT NULL
  AND length(share_code) > 12;
