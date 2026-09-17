-- Separate social profiles from full destination cards while keeping both in
-- the same ordered, revision-controlled Link Hub collection.
ALTER TABLE link_hub_links ADD COLUMN link_kind TEXT NOT NULL DEFAULT 'link'
  CHECK(link_kind IN ('link', 'social'));
ALTER TABLE link_hub_links ADD COLUMN social_platform TEXT NOT NULL DEFAULT '';
ALTER TABLE link_hub_links ADD COLUMN social_handle TEXT NOT NULL DEFAULT '';

-- Optional public copy for the social strip. Blank values collapse cleanly.
ALTER TABLE link_hub_settings ADD COLUMN socials_kicker TEXT NOT NULL DEFAULT '';
ALTER TABLE link_hub_settings ADD COLUMN socials_heading TEXT NOT NULL DEFAULT '';
ALTER TABLE link_hub_settings ADD COLUMN socials_description TEXT NOT NULL DEFAULT '';

-- Recognize existing social URLs without changing ordinary destinations.
UPDATE link_hub_links
SET
  link_kind = 'social',
  social_platform = CASE
    WHEN lower(url) LIKE '%instagram.com/%' THEN 'instagram'
    WHEN lower(url) LIKE '%linkedin.com/%' THEN 'linkedin'
    WHEN lower(url) LIKE '%facebook.com/%' OR lower(url) LIKE '%fb.com/%' THEN 'facebook'
    WHEN lower(url) LIKE '%youtube.com/%' OR lower(url) LIKE '%youtu.be/%' THEN 'youtube'
    WHEN lower(url) LIKE '%tiktok.com/%' THEN 'tiktok'
    WHEN lower(url) LIKE '%threads.net/%' THEN 'threads'
    WHEN lower(url) LIKE '%bsky.app/%' THEN 'bluesky'
    WHEN lower(url) LIKE '%twitter.com/%' OR lower(url) LIKE '%x.com/%' THEN 'x'
    WHEN lower(url) LIKE '%whatsapp.com/%' OR lower(url) LIKE '%wa.me/%' THEN 'whatsapp'
    WHEN lower(url) LIKE '%t.me/%' OR lower(url) LIKE '%telegram.me/%' THEN 'telegram'
    WHEN lower(url) LIKE '%spotify.com/%' THEN 'spotify'
    ELSE social_platform
  END,
  featured = 0,
  revision = revision + 1,
  updated_at = datetime('now')
WHERE
  lower(url) LIKE '%instagram.com/%'
  OR lower(url) LIKE '%linkedin.com/%'
  OR lower(url) LIKE '%facebook.com/%'
  OR lower(url) LIKE '%fb.com/%'
  OR lower(url) LIKE '%youtube.com/%'
  OR lower(url) LIKE '%youtu.be/%'
  OR lower(url) LIKE '%tiktok.com/%'
  OR lower(url) LIKE '%threads.net/%'
  OR lower(url) LIKE '%bsky.app/%'
  OR lower(url) LIKE '%twitter.com/%'
  OR lower(url) LIKE '%x.com/%'
  OR lower(url) LIKE '%whatsapp.com/%'
  OR lower(url) LIKE '%wa.me/%'
  OR lower(url) LIKE '%t.me/%'
  OR lower(url) LIKE '%telegram.me/%'
  OR lower(url) LIKE '%spotify.com/%';

CREATE INDEX IF NOT EXISTS idx_link_hub_kind_public
  ON link_hub_links(link_kind, active, sort_order, created_at);
