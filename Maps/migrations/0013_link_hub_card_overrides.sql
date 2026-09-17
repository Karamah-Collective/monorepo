-- Optional per-card overrides for metadata that normally comes from the site.
ALTER TABLE link_hub_links ADD COLUMN custom_site_name TEXT NOT NULL DEFAULT '';
ALTER TABLE link_hub_links ADD COLUMN custom_favicon_url TEXT NOT NULL DEFAULT '';
