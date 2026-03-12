/**
 * Halal Finder — Service Worker
 *
 * Caching strategy:
 *   App shell (own-origin JS / CSS / data)    → pre-cached on install, then stale-while-revalidate
 *   Vector tiles (tiles.openfreemap.org)       → stale-while-revalidate, capped at MAX_TILES
 *   Glyphs / fonts (…/fonts/*)                → cache-first (they are immutable once published)
 *   MapLibre GL JS from unpkg (versioned URL) → stale-while-revalidate
 *
 * "Stale-while-revalidate" means:
 *   – Cached copy is returned immediately (instant load).
 *   – A fresh copy is fetched from the network in the background.
 *   – The cache is updated quietly; the user sees the update on the next visit.
 *
 * Deployment note:
 *   VERSION below is the only string you need to change when deploying.
 *   Use the same date you set on the CSS ?v= param in index.html — one date covers both.
 *   Example: deploy on 15 March 2026 → set VERSION = '20260315' here AND
 *            set ?v=20260315 on the <link> in index.html.
 *   That single change causes the browser to install the new SW and wipe the old caches.
 */

const VERSION = '20260312'; // ← update to today's date (YYYYMMDD) on every deploy — same value as ?v= in index.html

const CACHE_SHELL  = `hf-shell-${VERSION}`;
const CACHE_TILES  = `hf-tiles-${VERSION}`;
const CACHE_GLYPHS = `hf-glyphs-${VERSION}`;

// Cap tile cache entries so storage stays reasonable.
// Helsinki vector tiles at z10-z16 are ~20-80 KB each; 500 entries ≈ 10-40 MB.
const MAX_TILES  = 500;
const MAX_GLYPHS =  64;   // 64 glyph ranges covers the full Basic Multilingual Plane

// ─── Assets to pre-cache on install ───────────────────────────────────────────
// These are served instantly from the very first repeat visit.
// Do NOT include assets with ?v= query params here — they are handled at runtime
// by the stale-while-revalidate handler for own-origin requests.
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/src/app.js',
  '/src/config.js',
  '/src/map-init.js',
  '/src/map-style.js',
  '/src/map-controls.js',
  '/src/places.js',
  '/src/search.js',
  '/src/directions.js',
  '/src/prayer.js',
  '/src/icons.js',
  '/src/utils.js',
  '/src/tutorial.js',
  '/src/contact.js',
  '/src/transit-stops.js',
  '/src/semantic-worker.js',
  '/data/places.json',
  '/data/tags.json',
  '/data/embeddings.json',
  '/data/thumbs/default.png',
  '/data/thumbs/satellite.jpg',
  '/data/thumbs/3d.png',
  // MapLibre GL JS — pinned version, stable URL
  'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js',
  'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css',
];

// ─── Install ───────────────────────────────────────────────────────────────────
// Pre-cache the shell. Individual failures are swallowed so a single missing
// asset doesn't prevent the SW from installing.
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { credentials: 'same-origin' }))
               .catch(() => { /* skip if unavailable */ }),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

// ─── Activate ──────────────────────────────────────────────────────────────────
// Delete all caches from previous versions.
self.addEventListener('activate', (evt) => {
  const live = new Set([CACHE_SHELL, CACHE_TILES, CACHE_GLYPHS]);
  evt.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(names.filter((n) => !live.has(n)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

// ─── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (evt) => {
  const req = evt.request;
  if (req.method !== 'GET') return;   // only GET is safe to cache

  const url = new URL(req.url);

  // ── Skip dynamic Cloudflare Functions (config / places API) ──────────────
  if (url.pathname.startsWith('/api/')) return;

  // ── Glyphs / fonts from OpenFreeMap — cache-first (immutable) ───────────
  if (url.hostname === 'tiles.openfreemap.org' && url.pathname.startsWith('/fonts/')) {
    evt.respondWith(cacheFirst(req, CACHE_GLYPHS, MAX_GLYPHS));
    return;
  }

  // ── Vector tiles + TileJSON from OpenFreeMap — stale-while-revalidate ────
  if (url.hostname === 'tiles.openfreemap.org') {
    evt.respondWith(staleWhileRevalidate(req, CACHE_TILES, MAX_TILES));
    return;
  }

  // ── Own origin (shell JS / CSS / data / HTML) — stale-while-revalidate ───
  if (url.origin === self.location.origin) {
    evt.respondWith(staleWhileRevalidate(req, CACHE_SHELL));
    return;
  }

  // ── MapLibre GL from unpkg (pinned version) — stale-while-revalidate ─────
  if (url.hostname === 'unpkg.com' && url.pathname.startsWith('/maplibre-gl@')) {
    evt.respondWith(staleWhileRevalidate(req, CACHE_SHELL));
    return;
  }

  // Everything else (Digitransit, Nominatim, reCAPTCHA, terrain tiles, etc.)
  // is dynamic or privacy-sensitive — let it go directly to the network.
});

// ─── Cache strategies ──────────────────────────────────────────────────────────

/**
 * Stale-While-Revalidate:
 * Return the cached copy immediately if available.
 * Simultaneously kick off a network fetch to refresh the cache in the background.
 * Falls back to the in-flight network response if the cache is cold.
 */
async function staleWhileRevalidate(req, cacheName, maxEntries) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);

  // Always kick off a background refresh (fire-and-forget, errors swallowed).
  const refresh = fetch(req)
    .then(async (res) => {
      if (res.ok) {
        await cache.put(req, res.clone());
        if (maxEntries) await trimCache(cache, maxEntries);
      }
      return res;
    })
    .catch(() => null);

  // Return cached instantly; if cold, await the network.
  return cached ?? (await refresh);
}

/**
 * Cache-First:
 * Return from cache if present; only go to network on a cold miss.
 * Used for font glyphs which are versioned and effectively immutable.
 */
async function cacheFirst(req, cacheName, maxEntries) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;

  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    if (maxEntries) await trimCache(cache, maxEntries);
  }
  return res;
}

/**
 * Evict the oldest entries when the cache exceeds maxEntries.
 * Cache.keys() returns entries in insertion order, so we delete from the front.
 */
async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const evict = keys.slice(0, keys.length - maxEntries);
  await Promise.all(evict.map((k) => cache.delete(k)));
}
