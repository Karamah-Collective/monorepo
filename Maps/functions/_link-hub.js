import { truncate } from './_shared.js';

const SETTING_FIELDS = [
  'profile_name', 'profile_bio', 'avatar_url', 'background_color', 'surface_color',
  'text_color', 'accent_color', 'theme', 'card_style', 'corner_style', 'layout',
  'max_width', 'show_descriptions', 'show_domains', 'show_share', 'footer_text',
  'seo_title', 'seo_description',
  'page_kicker', 'links_kicker', 'links_heading', 'links_description',
  'count_suffix', 'featured_label', 'share_page_label', 'share_link_label',
  'copy_success_text', 'footer_link_label', 'footer_link_url', 'empty_title',
  'empty_description', 'error_title', 'error_description', 'retry_label',
  'background_style', 'image_style',
];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Validate and normalize a public HTTP(S) URL while rejecting private-network targets. */
export function cleanPublicUrl(value, { allowEmpty = false } = {}) {
  const raw = truncate(value || '', 2048).trim();
  if (!raw && allowEmpty) return '';
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '0.0.0.0' || host === '::1') return null;
  if (/^(?:fc|fd|fe8|fe9|fea|feb)[0-9a-f:]*$/i.test(host)) return null;
  if (/^(?:10|127)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return null;
  const private172 = /^172\.(\d{1,3})\./.exec(host);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return null;
  return parsed.toString();
}

/** Accept a public image URL or a small, browser-compressed image stored directly in D1. */
export function cleanLinkImage(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(raw) && raw.length <= 60_000) return raw;
  return cleanPublicUrl(raw, { allowEmpty: true });
}

function decodeMeta(value = '') {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function readMeta(html, keys) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match) return decodeMeta(match[1]);
    }
  }
  return '';
}

async function fetchMetadata(rawUrl) {
  let current = cleanPublicUrl(rawUrl);
  if (!current) return { error: 'Enter a valid public http or https URL.' };
  let response;
  for (let redirects = 0; redirects < 5; redirects += 1) {
    response = await fetch(current, {
      headers: { 'User-Agent': 'KaramahLinkPreview/1.0 (+https://karamahcollective.com)' },
      redirect: 'manual', signal: AbortSignal.timeout(8000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location) return { error: 'The site returned an invalid redirect.' };
    current = cleanPublicUrl(new URL(location, current).toString());
    if (!current) return { error: 'The URL redirected to a private or unsupported address.' };
  }
  if (!response?.ok) return { error: `The site returned HTTP ${response?.status || 'error'}.` };
  if (!(response.headers.get('content-type') || '').includes('text/html')) return { error: 'This URL does not return an HTML page.' };
  const html = (await response.text()).slice(0, 750_000);
  const finalUrl = response.url || current;
  const base = new URL(finalUrl);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '';
  const rawImage = readMeta(html, ['og:image', 'twitter:image', 'twitter:image:src']);
  const icon = /<link[^>]+rel=["'][^"']*(?:icon|shortcut icon)[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(html)
    || /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*(?:icon|shortcut icon)[^"']*["'][^>]*>/i.exec(html);
  const absolute = value => { try { return cleanPublicUrl(new URL(value, base).toString(), { allowEmpty: true }) || ''; } catch { return ''; } };
  return {
    success: true, url: finalUrl,
    title: truncate(readMeta(html, ['og:title', 'twitter:title']) || decodeMeta(titleTag), 240),
    description: truncate(readMeta(html, ['og:description', 'twitter:description', 'description']), 800),
    imageUrl: absolute(rawImage), siteName: truncate(readMeta(html, ['og:site_name']) || base.hostname.replace(/^www\./, ''), 120),
    faviconUrl: absolute(icon?.[1] || '/favicon.ico'),
  };
}

/** Return the complete private link-hub settings and link collection for Admin. */
export async function getAdminLinkHub(db) {
  const [settings, links] = await Promise.all([
    db.prepare('SELECT * FROM link_hub_settings WHERE id = 1').first(),
    db.prepare('SELECT * FROM link_hub_links ORDER BY sort_order, created_at').all(),
  ]);
  return { settings, links: links.results };
}

/** Validate and revision-save all public link-hub copy and appearance settings. */
export async function saveLinkHubSettings(db, data) {
  const value = data.settings || {};
  const current = await db.prepare('SELECT revision FROM link_hub_settings WHERE id = 1').first();
  if (!current) return { error: 'Link hub settings are not initialized.' };
  if (Number(data.revision) !== current.revision) return { error: 'These settings changed in another session. Reload and try again.' };
  for (const field of ['background_color', 'surface_color', 'text_color', 'accent_color']) if (!HEX_COLOR.test(value[field] || '')) return { error: `Invalid ${field.replaceAll('_', ' ')}.` };
  if (!['light', 'dark', 'system'].includes(value.theme) || !['soft', 'outline', 'solid'].includes(value.card_style) || !['compact', 'rounded', 'pill'].includes(value.corner_style) || !['stack', 'grid'].includes(value.layout) || !['paper', 'mist', 'plain'].includes(value.background_style) || !['cover', 'contain'].includes(value.image_style)) return { error: 'One or more appearance choices are invalid.' };
  if (cleanPublicUrl(value.avatar_url, { allowEmpty: true }) === null || cleanPublicUrl(value.footer_link_url, { allowEmpty: true }) === null) return { error: 'Avatar and footer links must use a valid public http or https URL.' };
  const cleaned = SETTING_FIELDS.map(field => {
    if (field === 'max_width') return Math.min(1100, Math.max(480, Number(value[field]) || 680));
    if (field.startsWith('show_')) return value[field] ? 1 : 0;
    if (field === 'avatar_url' || field === 'footer_link_url') return cleanPublicUrl(value[field], { allowEmpty: true }) || '';
    return truncate(value[field] || '', ['profile_bio', 'seo_description', 'links_description', 'empty_description', 'error_description'].includes(field) ? 500 : 200);
  });
  const assignments = SETTING_FIELDS.map(field => `${field} = ?`).join(', ');
  await db.prepare(`UPDATE link_hub_settings SET ${assignments}, revision = revision + 1, updated_at = ? WHERE id = 1`).bind(...cleaned, new Date().toISOString()).run();
  return { success: true, settings: await db.prepare('SELECT * FROM link_hub_settings WHERE id = 1').first() };
}

/** Create or update a destination, optionally refreshing its public site metadata. */
export async function saveLinkHubLink(db, data) {
  const link = data.link || {};
  const url = cleanPublicUrl(link.url);
  if (!url) return { error: 'Enter a valid public http or https URL.' };
  const id = truncate(link.id || crypto.randomUUID(), 80);
  const existing = await db.prepare('SELECT * FROM link_hub_links WHERE id = ?').bind(id).first();
  if (existing && Number(link.revision) !== existing.revision) return { error: 'This link changed in another session. Reload and try again.' };
  let metadata = null;
  if (!existing || data.refreshMetadata || existing.url !== url) {
    try { metadata = await fetchMetadata(url); } catch (error) { metadata = { error: error?.name === 'TimeoutError' ? 'The site took too long to respond.' : 'Preview metadata could not be loaded.' }; }
  }
  const customImageUrl = cleanLinkImage(link.image_url);
  const customFaviconUrl = cleanPublicUrl(link.custom_favicon_url, { allowEmpty: true });
  if (customImageUrl === null || customFaviconUrl === null) return { error: 'Use a valid public image URL, uploaded image, or public site icon URL.' };
  const now = new Date().toISOString();
  const values = [
    metadata?.success ? metadata.url : url,
    truncate(link.title || '', 240), truncate(link.description || '', 800),
    customImageUrl,
    truncate(link.custom_site_name || '', 120),
    customFaviconUrl,
    metadata?.success ? metadata.title : (existing?.metadata_title || ''),
    metadata?.success ? metadata.description : (existing?.metadata_description || ''),
    metadata?.success ? metadata.imageUrl : (existing?.metadata_image_url || ''),
    metadata?.success ? metadata.siteName : (existing?.site_name || ''),
    metadata?.success ? metadata.faviconUrl : (existing?.favicon_url || ''),
    metadata ? (metadata.success ? 'ready' : 'error') : (existing?.metadata_status || 'pending'),
    metadata?.error || '', link.active === false || link.active === 0 ? 0 : 1,
    link.featured ? 1 : 0, Math.max(0, Number(link.sort_order) || 0),
  ];
  if (existing) {
    await db.prepare('UPDATE link_hub_links SET url=?,title=?,description=?,image_url=?,custom_site_name=?,custom_favicon_url=?,metadata_title=?,metadata_description=?,metadata_image_url=?,site_name=?,favicon_url=?,metadata_status=?,metadata_error=?,active=?,featured=?,sort_order=?,revision=revision+1,updated_at=? WHERE id=?').bind(...values, now, id).run();
  } else {
    await db.prepare('INSERT INTO link_hub_links (id,url,title,description,image_url,custom_site_name,custom_favicon_url,metadata_title,metadata_description,metadata_image_url,site_name,favicon_url,metadata_status,metadata_error,active,featured,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, ...values, now, now).run();
  }
  return { success: true, link: await db.prepare('SELECT * FROM link_hub_links WHERE id = ?').bind(id).first() };
}

/** Delete a destination after enforcing optimistic revision matching. */
export async function deleteLinkHubLink(db, data) {
  const row = await db.prepare('SELECT revision FROM link_hub_links WHERE id = ?').bind(data.id || '').first();
  if (!row) return { error: 'Link not found.' };
  if (Number(data.revision) !== row.revision) return { error: 'This link changed in another session. Reload and try again.' };
  await db.prepare('DELETE FROM link_hub_links WHERE id = ?').bind(data.id).run();
  return { success: true };
}
