/**
 * Cloudflare Pages Middleware — Dynamic Open Graph tags for shared links
 *
 * When a URL contains ?place=<id> or ?lat=<X>&lng=<Y>, this middleware
 * rewrites the OG / Twitter meta tags in the HTML response so social
 * platforms (WhatsApp, Telegram, Twitter, Facebook, etc.) show a
 * context-aware preview instead of the generic site description.
 *
 * Only the root HTML page is affected; static assets and API routes
 * pass through untouched.
 */

const PLACE_TYPES = {
  mosque:      'Mosque',
  prayer_room: 'Prayer Room',
  restaurant:  'Halal Restaurant',
  shop:        'Halal Shop',
};

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Fast path: only process root HTML page with share params
  const placeId = url.searchParams.get('place');
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  const routeToken = url.searchParams.get('r');
  const isLegacyRoute = url.searchParams.get('route') === '1';
  const isRoute = !!(routeToken || isLegacyRoute);

  if ((!placeId && !lat && !isRoute) || (url.pathname !== '/' && url.pathname !== '/index.html')) {
    return context.next();
  }

  let ogTitle = null;
  let ogDescription = null;

  if (isRoute) {
    let oname = '', dname = '', mode = 'transit';
    if (routeToken) {
      try {
        const padded = routeToken.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(padded));
        oname = (payload.on || '').slice(0, 100);
        dname = (payload.dn || '').slice(0, 100);
        mode = payload.m || 'transit';
      } catch { /* ignore malformed token */ }
    } else {
      oname = (url.searchParams.get('on') || '').slice(0, 100);
      dname = (url.searchParams.get('dn') || '').slice(0, 100);
      mode = url.searchParams.get('mode') || 'transit';
    }
    const modeLabels = { drive: 'Driving', transit: 'Transit', cycle: 'Cycling', walk: 'Walking' };
    const modeLabel = modeLabels[mode] || 'Transit';
    const from = oname || 'Origin';
    const to = dname || 'Destination';
    ogTitle = `${from} → ${to} — Halal Finder Helsinki`;
    ogDescription = `${modeLabel} route shared via Halal Finder Helsinki`;
  } else if (placeId) {
    try {
      const res = await context.env.ASSETS.fetch(new URL('/data/places.json', url.origin));
      const places = await res.json();
      const place = places.find(p => p.id === placeId);
      if (place) {
        const typeLabel = PLACE_TYPES[place.type] || place.type;
        ogTitle = `${place.name} — Halal Finder Helsinki`;
        ogDescription = `${typeLabel} at ${place.address}`;
      }
    } catch { /* fall through to default tags */ }
  } else if (lat && lng) {
    const rawName = url.searchParams.get('name');
    // Limit name length to prevent abuse
    const name = rawName ? rawName.slice(0, 100) : null;
    if (name) {
      ogTitle = `${name} — Halal Finder Helsinki`;
      ogDescription = 'Transit stop shared via Halal Finder Helsinki';
    } else {
      ogTitle = 'Shared Location — Halal Finder Helsinki';
      ogDescription = `Location at ${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`;
    }
  }

  // No OG data resolved — serve page as-is
  if (!ogTitle) {
    return context.next();
  }

  const response = await context.next();

  return new HTMLRewriter()
    .on('title', {
      element(el) { el.setInnerContent(ogTitle); }
    })
    .on('meta[name="description"]', {
      element(el) { el.setAttribute('content', ogDescription); }
    })
    .on('meta[property="og:title"]', {
      element(el) { el.setAttribute('content', ogTitle); }
    })
    .on('meta[property="og:description"]', {
      element(el) { el.setAttribute('content', ogDescription); }
    })
    .on('meta[name="twitter:title"]', {
      element(el) { el.setAttribute('content', ogTitle); }
    })
    .on('meta[name="twitter:description"]', {
      element(el) { el.setAttribute('content', ogDescription); }
    })
    .transform(response);
}
