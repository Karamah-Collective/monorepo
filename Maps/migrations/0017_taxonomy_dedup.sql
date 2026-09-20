-- Consolidate legacy feature tags that duplicate active place subtypes.
-- Butchery takes precedence over Grocery for services that previously carried
-- both feature tags; the remaining feature tags continue to describe what the
-- place offers.

UPDATE places
SET tags = json_remove(
  json_set(
    json_remove(
      CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
      '$.service_type_grocery'
    ),
    '$.service_type_butchery',
    json('true')
  ),
  '$.halal_butchery',
  '$.halal_groceries'
)
WHERE type = 'service'
  AND json_extract(
    CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
    '$.halal_butchery'
  ) = 1;

UPDATE places
SET tags = json_remove(
  json_set(
    CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
    '$.service_type_grocery',
    json('true')
  ),
  '$.halal_butchery',
  '$.halal_groceries'
)
WHERE type = 'service'
  AND json_extract(
    CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
    '$.halal_groceries'
  ) = 1
  AND COALESCE(json_extract(
    CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
    '$.service_type_butchery'
  ), 0) != 1;

-- Remove stale duplicate keys even when they were stored as false.
UPDATE places
SET tags = json_remove(
  CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
  '$.halal_butchery',
  '$.halal_groceries'
)
WHERE json_type(
    CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
    '$.halal_butchery'
  ) IS NOT NULL
  OR json_type(
    CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
    '$.halal_groceries'
  ) IS NOT NULL;

-- One legacy record used a display label as its JSON key. Preserve the value
-- under the canonical tag ID and remove the malformed key.
UPDATE places
SET tags = json_set(
  json_remove(
    CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
    '$."Quran Available"'
  ),
  '$.quran_available',
  json_extract(
    CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
    '$."Quran Available"'
  )
)
WHERE json_type(
  CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
  '$."Quran Available"'
) IS NOT NULL;

DELETE FROM tags
WHERE (type = 'service' AND tag_id IN ('halal_butchery', 'halal_groceries'))
   OR type IN ('shop', 'mosque', 'prayer_room');
