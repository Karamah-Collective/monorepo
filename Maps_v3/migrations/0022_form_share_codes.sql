-- Opaque, non-sequential public capabilities replace title-derived URLs.
ALTER TABLE forms ADD COLUMN share_code TEXT;
UPDATE forms SET share_code = lower(hex(randomblob(16))) WHERE share_code IS NULL OR share_code = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_share_code ON forms(share_code);
