function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function replaceText(html, id, value) {
  const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`(<[^>]+id=["']${safeId}["'][^>]*>)([\\s\\S]*?)(</[^>]+>)`, 'i'), `$1${escapeHtml(value)}$3`);
}

function replaceMeta(html, selector, value) {
  const safeSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`(<meta[^>]+(?:name|property)=["']${safeSelector}["'][^>]+content=["'])[^"']*(["'][^>]*>)`, 'i'), `$1${escapeHtml(value)}$2`);
}

function replaceAttribute(html, id, attribute, value) {
  const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`(<[^>]+id=["']${safeId}["'][^>]+${safeAttribute}=["'])[^"']*(["'])`, 'i'), `$1${escapeHtml(value)}$2`);
}

/** Inject D1-authored page copy and metadata into the initial public HTML. */
export async function onRequest(context) {
  const response = await context.next();
  const path = new URL(context.request.url).pathname;
  if (!['/', '/index.html'].includes(path) || !context.env.DB || !response.headers.get('content-type')?.includes('text/html')) return response;
  try {
    const settings = await context.env.DB.prepare('SELECT * FROM link_hub_settings WHERE id = 1').first();
    if (!settings) return response;
    let html = await response.text();
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(settings.seo_title)}</title>`);
    html = replaceMeta(html, 'description', settings.seo_description);
    html = replaceMeta(html, 'theme-color', settings.background_color);
    html = replaceMeta(html, 'og:title', settings.seo_title);
    html = replaceMeta(html, 'og:description', settings.seo_description);
    html = replaceMeta(html, 'twitter:title', settings.seo_title);
    html = replaceMeta(html, 'twitter:description', settings.seo_description);
    for (const [id, field] of [
      ['brand-name', 'profile_name'], ['profile-share-label', 'share_page_label'],
      ['page-kicker', 'page_kicker'], ['profile-name', 'profile_name'],
      ['profile-bio', 'profile_bio'], ['links-kicker', 'links_kicker'],
      ['links-heading', 'links_heading'], ['links-description', 'links_description'],
      ['footer-text', 'footer_text'], ['footer-link-label', 'footer_link_label'],
    ]) html = replaceText(html, id, settings[field]);
    html = replaceAttribute(html, 'brand-link', 'href', settings.footer_link_url);
    html = replaceAttribute(html, 'brand-link', 'aria-label', settings.profile_name);
    html = replaceAttribute(html, 'footer-link', 'href', settings.footer_link_url);
    html = replaceAttribute(html, 'profile-image', 'src', settings.avatar_url || '/assets/karamah-logo.webp');
    html = replaceAttribute(html, 'profile-image', 'alt', settings.profile_name);
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return new Response(html, { status: response.status, headers });
  } catch {
    return response;
  }
}
