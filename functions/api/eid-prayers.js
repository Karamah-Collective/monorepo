/**
 * Cloudflare Pages Function – /api/eid-prayers
 *
 * Proxies Eid prayer location data from Google Apps Script.
 * Cached at edge for 1 hour — Eid data changes infrequently once set.
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
    return new Response(JSON.stringify({ error: 'Configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const upstream = await fetch(`${sheetsUrl}?action=eid`);
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
