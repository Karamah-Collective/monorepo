UPDATE tags SET icon = 'restaurant', color = '#FF6319' WHERE type = 'restaurant_restaurant_type' AND tag_id = 'restaurant_type_restaurant';
UPDATE tags SET icon = 'cafe', color = '#FF6319' WHERE type = 'restaurant_restaurant_type' AND tag_id = 'restaurant_type_cafe';
UPDATE tags SET icon = 'bakery', color = '#FF6319' WHERE type = 'restaurant_restaurant_type' AND tag_id = 'restaurant_type_bakery';
UPDATE tags SET icon = 'dessert', color = '#FF6319' WHERE type = 'restaurant_restaurant_type' AND tag_id = 'restaurant_type_dessert';
UPDATE tags SET icon = 'truck', color = '#FF6319' WHERE type = 'restaurant_restaurant_type' AND tag_id = 'restaurant_type_food_truck';
UPDATE tags SET icon = 'restaurant', color = '#FF6319' WHERE type = 'restaurant_restaurant_type' AND tag_id IN ('restaurant_type_catering', 'restaurant_type_takeaway', 'restaurant_type_buffet');

UPDATE tags SET icon = 'grocery', color = '#8C4799' WHERE type = 'service_service_type' AND tag_id = 'service_type_grocery';
UPDATE tags SET icon = 'butchery', color = '#8C4799' WHERE type = 'service_service_type' AND tag_id = 'service_type_butchery';
UPDATE tags SET icon = 'book', color = '#8C4799' WHERE type = 'service_service_type' AND tag_id = 'service_type_bookshop';
UPDATE tags SET icon = 'salon', color = '#8C4799' WHERE type = 'service_service_type' AND tag_id = 'service_type_salon';
UPDATE tags SET icon = 'clothing', color = '#8C4799' WHERE type = 'service_service_type' AND tag_id = 'service_type_clothing';
UPDATE tags SET icon = 'bag', color = '#8C4799' WHERE type = 'service_service_type' AND tag_id = 'service_type_islamic_goods';
UPDATE tags SET icon = 'education', color = '#8C4799' WHERE type = 'service_service_type' AND tag_id = 'service_type_education';
UPDATE tags SET icon = 'hall', color = '#8C4799' WHERE type = 'service_service_type' AND tag_id = 'service_type_community_service';
UPDATE tags SET icon = 'charity', color = '#8C4799' WHERE type = 'service_service_type' AND tag_id = 'service_type_charity';

UPDATE tags SET icon = 'mosque', color = '#1FA86A' WHERE type = 'space_space_type' AND tag_id = 'space_type_mosque';
UPDATE tags SET icon = 'prayer', color = '#00B9E4' WHERE type = 'space_space_type' AND tag_id = 'space_type_prayer_place';
UPDATE tags SET icon = 'moon', color = '#b89030' WHERE type = 'space_space_type' AND tag_id = 'space_type_eid_prayer_place';
UPDATE tags SET icon = 'cemetery', color = '#475569' WHERE type = 'space_space_type' AND tag_id = 'space_type_cemetery';
UPDATE tags SET icon = 'hall', color = '#00B9E4' WHERE type = 'space_space_type' AND tag_id = 'space_type_community_hall';
UPDATE tags SET icon = 'building', color = '#00B9E4' WHERE type = 'space_space_type' AND tag_id = 'space_type_event_space';
UPDATE tags SET icon = 'classroom', color = '#00B9E4' WHERE type = 'space_space_type' AND tag_id = 'space_type_classroom';
UPDATE tags SET icon = 'wudu', color = '#00B9E4' WHERE type = 'space_space_type' AND tag_id = 'space_type_wudu_facility';
UPDATE tags SET icon = 'sisters', color = '#00B9E4' WHERE type = 'space_space_type' AND tag_id = 'space_type_sisters_space';
