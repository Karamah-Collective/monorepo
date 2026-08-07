/**
 * Cloudflare Pages Function – /api/config
 *
 * Serves client-side config values from Cloudflare env vars at runtime.
 * This avoids the need for a build step to inject secrets into a static file.
 *
 * Local dev falls back to src/config.local.js (see src/config.js).
 *
 * Required Cloudflare Pages Environment Variables (Pages → Settings → Variables):
 *   DT_API_KEY          – Digitransit subscription key
 *   HF_TOKEN_KEY        – Share-link encryption key
 *
 * Optional (have sensible defaults if omitted):
 *   DIGITRANSIT_URL     – Digitransit routing endpoint
 *   DIGITRANSIT_GEO_URL – Digitransit geocoding endpoint
 *   DIGITRANSIT_REV_URL – Digitransit reverse geocoding endpoint
 *   TRANSITOUS_URL      – Transitous routing endpoint
 *   NOMINATIM_REV       – Nominatim reverse geocoding endpoint
 *   NOMINATIM_VB        – Helsinki bounding box
 */
const ALLOWED_ORIGINS = ['https://maps.karamahcollective.com'];

function allowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export async function onRequestGet(context) {
  const { env, request } = context;

  const cfg = {
    DIGITRANSIT_URL:        env.DIGITRANSIT_URL        || 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1',
    DIGITRANSIT_WALTTI_URL: env.DIGITRANSIT_WALTTI_URL || 'https://api.digitransit.fi/routing/v2/waltti/gtfs/v1',
    DIGITRANSIT_GEO_URL: env.DIGITRANSIT_GEO_URL || 'https://api.digitransit.fi/geocoding/v1/search',
    DIGITRANSIT_REV_URL: env.DIGITRANSIT_REV_URL || 'https://api.digitransit.fi/geocoding/v1/reverse',
    TRANSITOUS_URL:      env.TRANSITOUS_URL      || 'https://api.transitous.org/api/v5/plan',
    DT_API_KEY:          env.DT_API_KEY          || '',
    NOMINATIM_REV:       env.NOMINATIM_REV       || 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1',
    NOMINATIM_VB:        env.NOMINATIM_VB        || '24.0,60.8,25.8,59.8',
    HF_TOKEN_KEY:        env.HF_TOKEN_KEY        || '',
    // Database details intentionally omitted — clients use /api/* functions.
  };

  return new Response(JSON.stringify(cfg), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': allowedOrigin(request),
    },
  });
}
