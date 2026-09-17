-- Complete public copy and presentation controls for the Karamah link hub.
-- Every visitor-facing label now lives in D1 and can be edited from Admin.
ALTER TABLE link_hub_settings ADD COLUMN page_kicker TEXT NOT NULL DEFAULT 'Karamah, collected';
ALTER TABLE link_hub_settings ADD COLUMN links_kicker TEXT NOT NULL DEFAULT 'Directory';
ALTER TABLE link_hub_settings ADD COLUMN links_heading TEXT NOT NULL DEFAULT 'Places worth keeping close';
ALTER TABLE link_hub_settings ADD COLUMN links_description TEXT NOT NULL DEFAULT 'Our projects, community spaces and the places we show up online.';
ALTER TABLE link_hub_settings ADD COLUMN count_suffix TEXT NOT NULL DEFAULT 'destinations';
ALTER TABLE link_hub_settings ADD COLUMN featured_label TEXT NOT NULL DEFAULT 'Featured';
ALTER TABLE link_hub_settings ADD COLUMN share_page_label TEXT NOT NULL DEFAULT 'Share this page';
ALTER TABLE link_hub_settings ADD COLUMN share_link_label TEXT NOT NULL DEFAULT 'Share';
ALTER TABLE link_hub_settings ADD COLUMN copy_success_text TEXT NOT NULL DEFAULT 'Link copied';
ALTER TABLE link_hub_settings ADD COLUMN footer_link_label TEXT NOT NULL DEFAULT 'Visit the collective';
ALTER TABLE link_hub_settings ADD COLUMN footer_link_url TEXT NOT NULL DEFAULT 'https://karamahcollective.com';
ALTER TABLE link_hub_settings ADD COLUMN empty_title TEXT NOT NULL DEFAULT 'Nothing published yet';
ALTER TABLE link_hub_settings ADD COLUMN empty_description TEXT NOT NULL DEFAULT 'The next Karamah destination will appear here soon.';
ALTER TABLE link_hub_settings ADD COLUMN error_title TEXT NOT NULL DEFAULT 'The directory is taking a pause';
ALTER TABLE link_hub_settings ADD COLUMN error_description TEXT NOT NULL DEFAULT 'We could not load these links just now.';
ALTER TABLE link_hub_settings ADD COLUMN retry_label TEXT NOT NULL DEFAULT 'Try again';
ALTER TABLE link_hub_settings ADD COLUMN background_style TEXT NOT NULL DEFAULT 'paper' CHECK(background_style IN ('paper', 'mist', 'plain'));
ALTER TABLE link_hub_settings ADD COLUMN image_style TEXT NOT NULL DEFAULT 'cover' CHECK(image_style IN ('cover', 'contain'));
