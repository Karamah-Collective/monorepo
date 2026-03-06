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
 *   SHEETS_URL           – Google Apps Script web app URL (serves live places/tags data)
 *   DIGITRANSIT_URL     – Digitransit routing endpoint
 *   DIGITRANSIT_GEO_URL – Digitransit geocoding endpoint
 *   DIGITRANSIT_REV_URL – Digitransit reverse geocoding endpoint
 *   TRANSITOUS_URL      – Transitous routing endpoint
 *   NOMINATIM_REV       – Nominatim reverse geocoding endpoint
 *   NOMINATIM_VB        – Helsinki bounding box
 */
export async function onRequestGet(context) {
  const { env } = context;

  const cfg = {
    DIGITRANSIT_URL:     env.DIGITRANSIT_URL     || 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1',
    DIGITRANSIT_GEO_URL: env.DIGITRANSIT_GEO_URL || 'https://api.digitransit.fi/geocoding/v1/search',
    DIGITRANSIT_REV_URL: env.DIGITRANSIT_REV_URL || 'https://api.digitransit.fi/geocoding/v1/reverse',
    TRANSITOUS_URL:      env.TRANSITOUS_URL      || 'https://api.transitous.org/api/v5/plan',
    DT_API_KEY:          env.DT_API_KEY          || '',
    NOMINATIM_REV:       env.NOMINATIM_REV       || 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1',
    NOMINATIM_VB:        env.NOMINATIM_VB        || '24.0,60.8,25.8,59.8',
    HF_TOKEN_KEY:        env.HF_TOKEN_KEY        || '',
    SHEETS_URL:          env.SHEETS_URL           || '',
  };

  return new Response(JSON.stringify(cfg), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
