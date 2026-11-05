const FALLBACK_SETTINGS = {
  profile_name: 'Karamah Collective',
  profile_bio: '',
  avatar_url: '', background_color: '#f4f3ee', surface_color: '#ffffff',
  text_color: '#202923', accent_color: '#2b745c', theme: 'light',
  card_style: 'soft', corner_style: 'rounded', layout: 'stack', max_width: 680,
  show_descriptions: 1, show_domains: 1, show_share: 1,
  footer_text: '', seo_title: 'Karamah Collective — Links',
  seo_description: 'Karamah Collective links.',
  page_kicker: '', links_kicker: '', links_heading: '', links_description: '',
  socials_kicker: '', socials_heading: '', socials_description: '',
  count_suffix: '', featured_label: 'Featured',
  share_page_label: 'Share this page', share_link_label: 'Share',
  copy_success_text: 'Link copied', footer_link_label: '',
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
      env.DB.prepare(`SELECT id,url,title,description,image_url,custom_site_name,custom_favicon_url,metadata_title,metadata_description,metadata_image_url,site_name,favicon_url,featured,sort_order,link_kind,social_platform,social_handle
        FROM link_hub_links WHERE active = 1 ORDER BY sort_order, created_at`).all(),
    ]);
    const publicItems = links.results.map(link => ({
      id: link.id, url: link.url,
      title: link.title || link.metadata_title || link.site_name || new URL(link.url).hostname,
      description: link.description || link.metadata_description || '',
      imageUrl: link.image_url || link.metadata_image_url || '',
      siteName: link.custom_site_name || link.site_name || new URL(link.url).hostname.replace(/^www\./, ''),
      faviconUrl: link.custom_favicon_url || link.favicon_url || '', featured: !!link.featured,
      kind: link.link_kind === 'social' ? 'social' : 'link',
      socialPlatform: link.social_platform || '', socialHandle: link.social_handle || '',
    }));
    return Response.json({
      settings: { ...FALLBACK_SETTINGS, ...(settings || {}) },
      links: publicItems.filter(item => item.kind === 'link'),
      socials: publicItems.filter(item => item.kind === 'social'),
    }, { headers });
  } catch {
    return Response.json({ error: 'Links are temporarily unavailable.' }, { status: 502, headers: { ...headers, 'Cache-Control': 'no-store' } });
  }
}
