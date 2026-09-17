-- Remove the original decorative copy only when it is still untouched.
-- Any text already customized by an admin is preserved.
UPDATE link_hub_settings
SET
  profile_bio = CASE
    WHEN profile_bio IN (
      'Community, connection and useful places — all in one place.',
      'Community, connection and useful places â€” all in one place.'
    ) THEN ''
    ELSE profile_bio
  END,
  page_kicker = CASE WHEN page_kicker = 'Karamah, collected' THEN '' ELSE page_kicker END,
  links_kicker = CASE WHEN links_kicker = 'Directory' THEN '' ELSE links_kicker END,
  links_heading = CASE WHEN links_heading = 'Places worth keeping close' THEN '' ELSE links_heading END,
  links_description = CASE
    WHEN links_description = 'Our projects, community spaces and the places we show up online.' THEN ''
    ELSE links_description
  END,
  count_suffix = CASE WHEN count_suffix = 'destinations' THEN '' ELSE count_suffix END,
  footer_text = CASE WHEN footer_text = 'Karamah Collective' THEN '' ELSE footer_text END,
  footer_link_label = CASE WHEN footer_link_label = 'Visit the collective' THEN '' ELSE footer_link_label END,
  seo_description = CASE
    WHEN seo_description = 'Find Karamah Collective across the web.' THEN 'Karamah Collective links.'
    ELSE seo_description
  END,
  seo_title = CASE
    WHEN seo_title = 'Karamah Collective â€” Links' THEN 'Karamah Collective — Links'
    ELSE seo_title
  END,
  revision = revision + 1,
  updated_at = datetime('now')
WHERE id = 1
  AND (
    profile_bio IN (
      'Community, connection and useful places — all in one place.',
      'Community, connection and useful places â€” all in one place.'
    )
    OR page_kicker = 'Karamah, collected'
    OR links_kicker = 'Directory'
    OR links_heading = 'Places worth keeping close'
    OR links_description = 'Our projects, community spaces and the places we show up online.'
    OR count_suffix = 'destinations'
    OR footer_text = 'Karamah Collective'
    OR footer_link_label = 'Visit the collective'
    OR seo_description = 'Find Karamah Collective across the web.'
    OR seo_title = 'Karamah Collective â€” Links'
  );
