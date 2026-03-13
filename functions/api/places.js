/**
 * Cloudflare Pages Function – /api/places
 *
 * Proxies data requests to the Google Apps Script web app and adds CDN cache
 * headers so Cloudflare caches the response at the edge for 5 minutes.
 * After the first request, all subsequent users are served cached data in
 * ~50 ms without hitting Apps Script or the Google Sheet at all.
 *
 * stale-while-revalidate=60 means CF serves the old response immediately
 * while fetching a fresh copy in the background — users never wait.
 *
 * Supported query params (forwarded to Apps Script):
 *   ?action=all     → { places: [...], tags: {...} }
 *   ?action=places  → [...] places array
 *   ?action=tags    → {...} tags object
 */
const ALLOWED_ORIGINS = ['https://maps.karamahcollective.com'];

function allowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const sheetsUrl = env.SHEETS_URL;

  if (!sheetsUrl) {
    return new Response(JSON.stringify({ error: 'SHEETS_URL not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const incomingUrl = new URL(request.url);
  const action = incomingUrl.searchParams.get('action') || 'all';

  try {
    const upstream = await fetch(`${sheetsUrl}?action=${encodeURIComponent(action)}`);
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
        'Access-Control-Allow-Origin': allowedOrigin(request),
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Data temporarily unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
