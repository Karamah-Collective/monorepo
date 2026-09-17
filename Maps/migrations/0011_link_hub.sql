-- Public Karamah link hub. The public Links Pages project and the existing
-- authenticated Maps admin API share these tables through the same D1 binding.
CREATE TABLE IF NOT EXISTS link_hub_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  profile_name TEXT NOT NULL DEFAULT 'Karamah Collective',
  profile_bio TEXT NOT NULL DEFAULT 'Community, connection and useful places — all in one place.',
  avatar_url TEXT NOT NULL DEFAULT '',
  background_color TEXT NOT NULL DEFAULT '#f4f3ee',
  surface_color TEXT NOT NULL DEFAULT '#ffffff',
  text_color TEXT NOT NULL DEFAULT '#202923',
  accent_color TEXT NOT NULL DEFAULT '#2b745c',
  theme TEXT NOT NULL DEFAULT 'light' CHECK(theme IN ('light', 'dark', 'system')),
  card_style TEXT NOT NULL DEFAULT 'soft' CHECK(card_style IN ('soft', 'outline', 'solid')),
  corner_style TEXT NOT NULL DEFAULT 'rounded' CHECK(corner_style IN ('compact', 'rounded', 'pill')),
  layout TEXT NOT NULL DEFAULT 'stack' CHECK(layout IN ('stack', 'grid')),
  max_width INTEGER NOT NULL DEFAULT 680 CHECK(max_width BETWEEN 480 AND 1100),
  show_descriptions INTEGER NOT NULL DEFAULT 1 CHECK(show_descriptions IN (0, 1)),
  show_domains INTEGER NOT NULL DEFAULT 1 CHECK(show_domains IN (0, 1)),
  show_share INTEGER NOT NULL DEFAULT 1 CHECK(show_share IN (0, 1)),
  footer_text TEXT NOT NULL DEFAULT 'Karamah Collective',
  seo_title TEXT NOT NULL DEFAULT 'Karamah Collective — Links',
  seo_description TEXT NOT NULL DEFAULT 'Find Karamah Collective across the web.',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO link_hub_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS link_hub_links (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  metadata_title TEXT NOT NULL DEFAULT '',
  metadata_description TEXT NOT NULL DEFAULT '',
  metadata_image_url TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  favicon_url TEXT NOT NULL DEFAULT '',
  metadata_status TEXT NOT NULL DEFAULT 'pending' CHECK(metadata_status IN ('pending', 'ready', 'error')),
  metadata_error TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_link_hub_public ON link_hub_links(active, sort_order, created_at);
