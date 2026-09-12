-- Multiple place promos, independent of sponsorship.
CREATE TABLE IF NOT EXISTS place_promos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id    TEXT NOT NULL,
  code        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  start_date  TEXT NOT NULL DEFAULT '',
  end_date    TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(place_id) REFERENCES places(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_place_promos_place_id ON place_promos(place_id);

INSERT INTO place_promos (place_id, code, description, start_date, end_date, sort_order)
SELECT
  id,
  CASE
    WHEN lower(trim(coalesce(sponsor_promo, ''))) IN ('true', 'false') THEN ''
    ELSE trim(coalesce(sponsor_promo, ''))
  END,
  trim(coalesce(sponsor_promo_text, '')),
  trim(coalesce(sponsor_start_date, '')),
  trim(coalesce(sponsor_end_date, '')),
  0
FROM places
WHERE NOT EXISTS (SELECT 1 FROM place_promos WHERE place_promos.place_id = places.id)
  AND (
    (trim(coalesce(sponsor_promo, '')) != '' AND lower(trim(coalesce(sponsor_promo, ''))) NOT IN ('true', 'false'))
    OR trim(coalesce(sponsor_promo_text, '')) != ''
  );
