const FALLBACK_SETTINGS = {
  profile_name: 'Karamah Collective',
  profile_bio: 'Community, connection and useful places — all in one place.',
  avatar_url: '', background_color: '#f4f3ee', surface_color: '#ffffff',
  text_color: '#202923', accent_color: '#2b745c', theme: 'light',
  card_style: 'soft', corner_style: 'rounded', layout: 'stack', max_width: 680,
  show_descriptions: 1, show_domains: 1, show_share: 1,
  footer_text: 'Karamah Collective', seo_title: 'Karamah Collective — Links',
  seo_description: 'Find Karamah Collective across the web.',
  page_kicker: 'Karamah, collected', links_kicker: 'Directory',
  links_heading: 'Places worth keeping close',
  links_description: 'Our projects, community spaces and the places we show up online.',
  count_suffix: 'destinations', featured_label: 'Featured',
  share_page_label: 'Share this page', share_link_label: 'Share',
  copy_success_text: 'Link copied', footer_link_label: 'Visit the collective',
  footer_link_url: 'https://karamahcollective.com', empty_title: 'Nothing published yet',
  empty_description: 'The next Karamah destination will appear here soon.',
  error_title: 'The directory is taking a pause', error_description: 'We could not load these links just now.',
  retry_label: 'Try again', background_style: 'paper', image_style: 'cover',
};

export async function onRequestGet({ env }) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' };
  if (!env.DB) return Response.json({ error: 'Links are temporarily unavailable.' }, { status: 503, headers });
  try {
    const [settings, links] = await Promise.all([
      env.DB.prepare('SELECT * FROM link_hub_settings WHERE id = 1').first(),
      env.DB.prepare(`SELECT id,url,title,description,image_url,custom_site_name,custom_favicon_url,metadata_title,metadata_description,metadata_image_url,site_name,favicon_url,featured,sort_order
        FROM link_hub_links WHERE active = 1 ORDER BY sort_order, created_at`).all(),
    ]);
    const publicLinks = links.results.map(link => ({
      id: link.id, url: link.url,
      title: link.title || link.metadata_title || link.site_name || new URL(link.url).hostname,
      description: link.description || link.metadata_description || '',
      imageUrl: link.image_url || link.metadata_image_url || '',
      siteName: link.custom_site_name || link.site_name || new URL(link.url).hostname.replace(/^www\./, ''),
      faviconUrl: link.custom_favicon_url || link.favicon_url || '', featured: !!link.featured,
    }));
    return Response.json({ settings: { ...FALLBACK_SETTINGS, ...(settings || {}) }, links: publicLinks }, { headers });
  } catch {
    return Response.json({ error: 'Links are temporarily unavailable.' }, { status: 502, headers: { ...headers, 'Cache-Control': 'no-store' } });
  }
}
