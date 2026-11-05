/**
 * Cloudflare Pages Middleware
 *
 * 1. Data protection — blocks direct/cross-origin access to /data/*.json
 *    so the dataset can't be trivially cloned by visiting the URL.
 *    Same-origin requests (app JS, service worker) are allowed via
 *    the browser's Sec-Fetch-Site header (cannot be spoofed from JS).
 *
 * 2. Dynamic Open Graph tags — rewrites OG/Twitter meta tags for shared
 *    links so social platforms show a context-aware preview.
 */

// ── Protected paths (block direct / cross-origin access) ─────────────────────
// Data JSON files  → curated datasets (most valuable to protect)
// Source files     → app logic, config, styles
function isProtectedPath(pathname) {
  if (pathname === '/data/places.json' || pathname === '/data/tags.json' || pathname === '/data/eid-prayers.json') return true;
  if (pathname.startsWith('/src/')) return true;
  return false;
}

const PLACE_TYPES = {
  mosque:      'Mosque',
  prayer_room: 'Prayer Room',
  restaurant:  'Halal Restaurant',
  shop:        'Halal Shop',
};

// ── Compact share token decoders (mirrors utils.js encoding) ─────────────────
const _GEO_LAT_BASE = 58, _GEO_LNG_BASE = 19, _GEO_SCALE = 5000;
const _DATE_EPOCH = Date.UTC(2024, 0, 1);
const _ROUTE_MODES = ['drive', 'transit', 'cycle', 'walk'];

function _b64d(tok) {
  const b = tok.replace(/-/g, '+').replace(/_/g, '/');
  const p = b.length % 4;
  const raw = atob(p ? b + '='.repeat(4 - p) : b);
  return Array.from(raw, c => c.charCodeAt(0));
}
function _u16(h, l) { return (h << 8) | l; }
function _lat(h, l) { return _GEO_LAT_BASE + _u16(h, l) / _GEO_SCALE; }
function _lng(h, l) { return _GEO_LNG_BASE + _u16(h, l) / _GEO_SCALE; }
function _str(b, off) {
  const len = b[off];
  const bytes = b.slice(off + 1, off + 1 + len);
  return { s: new TextDecoder().decode(new Uint8Array(bytes)), n: off + 1 + len };
}

function _decodeCompactRoute(token) {
  try {
    const b = _b64d(token);
    const ver = b[0];
    if (ver !== 0x01 && ver !== 0x02) return null;
    const f = b[1];
    const mode = _ROUTE_MODES[f & 3];
    const ho = !!(f & 16), hd = !!(f & 32);
    let off = 10;
    if (f & 8) off += ver === 0x01 ? 3 : 4; // v1: 3 bytes time, v2: 4 bytes (exact min)
    let oname = '';
    if (ho) { const r = _str(b, off); oname = r.s; off = r.n; }
    let dname = '';
    if (hd) { const r = _str(b, off); dname = r.s; off = r.n; }
    return { oname, dname, mode };
  } catch { return null; }
}

function _decodeCompactPin(token) {
  try {
    const b = _b64d(token);
    if (b[0] !== 0x02 && b[0] !== 0x03) return null;
    const isStop = b[0] === 0x03;
    const lat = _lat(b[2], b[3]);
    const lng = _lng(b[4], b[5]);
    let name = '';
    if (isStop && b.length > 6) { name = _str(b, 6).s; }
    return { lat, lng, isStop, name };
  } catch { return null; }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // ── Data protection gate ─────────────────────────────────────────────────
  // Sec-Fetch-Site is set by browsers and cannot be forged from client JS.
  // 'same-origin' = our app code / service worker fetching data normally.
  // 'none' = direct URL bar navigation. 'cross-site' / absent = external.
  if (isProtectedPath(url.pathname)) {
    const fetchSite = context.request.headers.get('Sec-Fetch-Site');
    if (fetchSite !== 'same-origin') {
      return new Response(
        JSON.stringify({ error: 'Direct access not permitted.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return context.next();
  }

  // Fast path: only process root HTML page with share params
  const placeId = url.searchParams.get('place');
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  const routeToken = url.searchParams.get('r');
  const isLegacyRoute = url.searchParams.get('route') === '1';
  const isRoute = !!(routeToken || isLegacyRoute);
  const eidParam = url.searchParams.get('eid');
  const isEid = !!eidParam;
  const pinToken = url.searchParams.get('p');

  if ((!placeId && !lat && !isRoute && !isEid && !pinToken) || (url.pathname !== '/' && url.pathname !== '/index.html')) {
    return context.next();
  }

  let ogTitle = null;
  let ogDescription = null;

  if (isEid) {
    let name = null;
    if (eidParam === '1') {
      // Legacy: ?eid=1&name=...
      const rawName = url.searchParams.get('name');
      name = rawName ? rawName.slice(0, 100) : null;
    } else {
      // New: ?eid=<id> — resolve name from data
      try {
        const res = await context.env.ASSETS.fetch(new URL('/data/eid-prayers.json', url.origin));
        const locs = await res.json();
        const loc = locs.find(l => l.id === eidParam);
        if (loc) name = loc.name.slice(0, 100);
      } catch { /* fall through */ }
    }
    ogTitle = `✨ Eid Mubarak! — ${name ? `${name} Eid Prayer` : 'Eid Prayer Location'}`;
    ogDescription = name
      ? `Join ${name} for Eid prayer. Find times, location, and directions on Manarah.`
      : 'Find Eid prayer times, locations, and directions on Manarah.';
  } else if (isRoute) {
    let oname = '', dname = '', mode = 'transit';
    if (routeToken) {
      // Try compact binary first, then legacy JSON
      const cr = _decodeCompactRoute(routeToken);
      if (cr) {
        oname = (cr.oname || '').slice(0, 100);
        dname = (cr.dname || '').slice(0, 100);
        mode = cr.mode || 'transit';
      } else {
        try {
          const padded = routeToken.replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(atob(padded));
          oname = (payload.on || '').slice(0, 100);
          dname = (payload.dn || '').slice(0, 100);
          mode = payload.m || 'transit';
        } catch { /* ignore malformed token */ }
      }
    } else {
      oname = (url.searchParams.get('on') || '').slice(0, 100);
      dname = (url.searchParams.get('dn') || '').slice(0, 100);
      mode = url.searchParams.get('mode') || 'transit';
    }
    const modeLabels = { drive: 'Driving', transit: 'Transit', cycle: 'Cycling', walk: 'Walking' };
    const modeLabel = modeLabels[mode] || 'Transit';
    const from = oname || 'Origin';
    const to = dname || 'Destination';
    ogTitle = `${from} → ${to} — Manarah`;
    ogDescription = `${modeLabel} route shared via Manarah`;
  } else if (placeId) {
    try {
      const res = await context.env.ASSETS.fetch(new URL('/data/places.json', url.origin));
      const places = await res.json();
      const place = places.find(p => p.id === placeId);
      if (place) {
        const typeLabel = PLACE_TYPES[place.type] || place.type;
        ogTitle = `${place.name} — Manarah`;
        const sponsorSuffix = (place.sponsor?.tier === 'spotlight' && !place.boycott) ? ' — Sponsored Partner' : '';
        ogDescription = `${typeLabel} at ${place.address}${sponsorSuffix}`;
      }
    } catch { /* fall through to default tags */ }
  } else if (pinToken) {
    // Compact pin/stop link: ?p=<token>
    const cp = _decodeCompactPin(pinToken);
    if (cp) {
      const name = cp.name ? cp.name.slice(0, 100) : null;
      if (cp.isStop && name) {
        ogTitle = `${name} — Manarah`;
        ogDescription = 'Transit stop shared via Manarah';
      } else {
        ogTitle = 'Shared Location — Manarah';
        ogDescription = name ? `${name} — shared via Manarah`
          : `Location at ${cp.lat.toFixed(4)}, ${cp.lng.toFixed(4)}`;
      }
    }
  } else if (lat && lng) {
    // Legacy pin/stop link: ?lat=&lng=
    const rawName = url.searchParams.get('name');
    // Limit name length to prevent abuse
    const name = rawName ? rawName.slice(0, 100) : null;
    if (name) {
      ogTitle = `${name} — Manarah`;
      ogDescription = 'Transit stop shared via Manarah';
    } else {
      ogTitle = 'Shared Location — Manarah';
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
