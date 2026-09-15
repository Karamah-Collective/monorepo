-- Services/Spaces taxonomy migration.
-- Safe to re-run: tag inserts are idempotent and place updates only fill the
-- required subtype tag for legacy top-level rows.

INSERT OR IGNORE INTO tags (type, tag_id, label) VALUES
  ('restaurant', 'restaurant_type', 'Food Type'),
  ('restaurant_restaurant_type', 'restaurant_type_restaurant', 'Restaurant'),
  ('restaurant_restaurant_type', 'restaurant_type_cafe', 'Cafe'),
  ('restaurant_restaurant_type', 'restaurant_type_bakery', 'Bakery'),
  ('restaurant_restaurant_type', 'restaurant_type_dessert', 'Dessert'),
  ('restaurant_restaurant_type', 'restaurant_type_food_truck', 'Food Truck'),
  ('restaurant_restaurant_type', 'restaurant_type_catering', 'Catering'),
  ('restaurant_restaurant_type', 'restaurant_type_takeaway', 'Takeaway'),
  ('restaurant_restaurant_type', 'restaurant_type_buffet', 'Buffet'),
  ('service', 'service_type', 'Service Type'),
  ('service', 'halal_meat', 'Halal Meat'),
  ('service', 'halal_butchery', 'Butchery'),
  ('service', 'halal_groceries', 'Groceries'),
  ('service', 'asian_products', 'Asian'),
  ('service', 'african_products', 'African'),
  ('service', 'arab_products', 'Arab'),
  ('service', 'halal_certified', 'Certified'),
  ('service', 'muslim_owned', 'Muslim-owned'),
  ('service_service_type', 'service_type_grocery', 'Grocery'),
  ('service_service_type', 'service_type_butchery', 'Butchery'),
  ('service_service_type', 'service_type_bookshop', 'Bookshop'),
  ('service_service_type', 'service_type_salon', 'Salon'),
  ('service_service_type', 'service_type_clothing', 'Clothing'),
  ('service_service_type', 'service_type_islamic_goods', 'Islamic Goods'),
  ('service_service_type', 'service_type_education', 'Education'),
  ('service_service_type', 'service_type_community_service', 'Community Service'),
  ('service_service_type', 'service_type_charity', 'Charity'),
  ('space', 'space_type', 'Space Type'),
  ('space', 'daily_prayers', 'Daily Prayers'),
  ('space', 'jummah', 'Jummah'),
  ('space', 'taraweeh', 'Taraweeh'),
  ('space', 'eid_prayer', 'Eid Prayer'),
  ('space', 'janaza', 'Janaza'),
  ('space', 'quran_classes', 'Quran Classes'),
  ('space', 'wudu', 'Wudu'),
  ('space', 'female_prayer', 'Sisters Section'),
  ('space', 'female_wudu', 'Sisters Wudu'),
  ('space', 'quran_available', 'Quran Available'),
  ('space_space_type', 'space_type_mosque', 'Mosque'),
  ('space_space_type', 'space_type_prayer_place', 'Prayer Place'),
  ('space_space_type', 'space_type_eid_prayer_place', 'Eid Prayer Place'),
  ('space_space_type', 'space_type_cemetery', 'Cemetery'),
  ('space_space_type', 'space_type_community_hall', 'Community Hall'),
  ('space_space_type', 'space_type_event_space', 'Event Space'),
  ('space_space_type', 'space_type_classroom', 'Classroom'),
  ('space_space_type', 'space_type_wudu_facility', 'Wudu Facility'),
  ('space_space_type', 'space_type_sisters_space', 'Sisters Space');

DELETE FROM tags
WHERE type = 'service_service_type'
  AND tag_id = 'service_type_cafe';

DELETE FROM tags
WHERE type = 'restaurant_cuisine'
  AND tag_id IN ('cuisine_buffet', 'cuisine_cafe', 'cuisine_pastries');

UPDATE places
SET tags = json_set(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.restaurant_type_restaurant', json('true'))
WHERE type = 'restaurant'
  AND COALESCE(json_extract(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.restaurant_type_restaurant'), 0) != 1
  AND COALESCE(json_extract(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.restaurant_type_cafe'), 0) != 1
  AND COALESCE(json_extract(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.restaurant_type_bakery'), 0) != 1
  AND COALESCE(json_extract(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.restaurant_type_dessert'), 0) != 1
  AND COALESCE(json_extract(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.restaurant_type_food_truck'), 0) != 1
  AND COALESCE(json_extract(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.restaurant_type_catering'), 0) != 1
  AND COALESCE(json_extract(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.restaurant_type_takeaway'), 0) != 1
  AND COALESCE(json_extract(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.restaurant_type_buffet'), 0) != 1;

UPDATE places
SET tags = json_set(
  json_remove(
    CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
    '$.restaurant_type_restaurant',
    '$.restaurant_type_cafe',
    '$.restaurant_type_bakery',
    '$.restaurant_type_dessert',
    '$.restaurant_type_food_truck',
    '$.restaurant_type_catering',
    '$.restaurant_type_takeaway',
    '$.restaurant_type_buffet',
    '$.cuisine_buffet',
    '$.cuisine_cafe',
    '$.cuisine_pastries'
  ),
  '$.restaurant_type_buffet',
  json('true')
)
WHERE type = 'restaurant'
  AND json_extract(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.cuisine_buffet') = 1;

UPDATE places
SET tags = json_set(
  json_remove(
    CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
    '$.restaurant_type_restaurant',
    '$.restaurant_type_cafe',
    '$.restaurant_type_bakery',
    '$.restaurant_type_dessert',
    '$.restaurant_type_food_truck',
    '$.restaurant_type_catering',
    '$.restaurant_type_takeaway',
    '$.restaurant_type_buffet',
    '$.cuisine_cafe',
    '$.cuisine_pastries'
  ),
  '$.restaurant_type_cafe',
  json('true')
)
WHERE type = 'restaurant'
  AND json_extract(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.cuisine_cafe') = 1;

UPDATE places
SET tags = json_set(
  json_remove(
    CASE WHEN json_valid(tags) THEN tags ELSE '{}' END,
    '$.restaurant_type_restaurant',
    '$.restaurant_type_cafe',
    '$.restaurant_type_bakery',
    '$.restaurant_type_dessert',
    '$.restaurant_type_food_truck',
    '$.restaurant_type_catering',
    '$.restaurant_type_takeaway',
    '$.restaurant_type_buffet',
    '$.cuisine_pastries'
  ),
  '$.restaurant_type_bakery',
  json('true')
)
WHERE type = 'restaurant'
  AND json_extract(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.cuisine_pastries') = 1;

UPDATE places
SET
  type = 'service',
  tags = json_set(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.service_type_grocery', json('true'))
WHERE type = 'shop';

UPDATE places
SET
  type = 'space',
  tags = json_set(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.space_type_mosque', json('true'))
WHERE type = 'mosque';

UPDATE places
SET
  type = 'space',
  tags = json_set(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.space_type_prayer_place', json('true'))
WHERE type = 'prayer_room';

UPDATE places
SET
  type = 'space',
  tags = json_set(CASE WHEN json_valid(tags) THEN tags ELSE '{}' END, '$.space_type_cemetery', json('true'))
WHERE type = 'cemetery';
