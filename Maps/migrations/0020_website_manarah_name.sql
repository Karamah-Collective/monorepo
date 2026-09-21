-- Keep already-authored Website content aligned with the Maps product rename.
-- Defaults live in Website/assets/js/content-schema.mjs; this updates the
-- existing singleton D1 document that otherwise overrides those defaults.
UPDATE website_content
SET content = replace(content, 'Halal Finder', 'Manarah'),
    revision = revision + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE instr(content, 'Halal Finder') > 0;
