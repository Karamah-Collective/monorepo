/**
 * Cloudflare Pages Function - /api/geo
 *
 * Returns coarse visitor location data from Cloudflare's built-in IP
 * geolocation. Country is available from CF-IPCountry; city/region/lat/lon are
 * available when the "Add visitor location headers" Managed Transform is on.
 *
 * Response: { "country": "FI", "city": "Turku", "lat": 60.45, "lon": 22.26 }
 */
const ALLOWED_ORIGINS = ['https://maps.karamahcollective.com'];
const UNKNOWN_COUNTRY = 'XX';

function allowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function headerValue(request, name) {
  const value = request.headers.get(name);
  if (!value) return '';
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function cfValue(request, key) {
  const value = request.cf?.[key];
  if (value == null) return '';
  return String(value).trim();
}

function numberValue(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Handles the Cloudflare Pages `/api/geo` request.
 * @param {{ request: Request }} context - Pages Function context.
 * @returns {Promise<Response>} JSON response with coarse visitor location.
 */
export async function onRequestGet(context) {
  const { request } = context;
  const country =
    cfValue(request, 'country') ||
    headerValue(request, 'CF-IPCountry') ||
    UNKNOWN_COUNTRY;
  const city = cfValue(request, 'city') || headerValue(request, 'CF-IPCity');
  const region = cfValue(request, 'region') || headerValue(request, 'CF-Region');
  const timezone = cfValue(request, 'timezone') || headerValue(request, 'CF-Timezone');
  const postalCode =
    cfValue(request, 'postalCode') ||
    headerValue(request, 'CF-Postal-Code') ||
    headerValue(request, 'CF-PostalCode') ||
    headerValue(request, 'CF-IPPostalCode');
  const lat = numberValue(cfValue(request, 'latitude') || headerValue(request, 'CF-IPLatitude'));
  const lon = numberValue(cfValue(request, 'longitude') || headerValue(request, 'CF-IPLongitude'));

  return new Response(JSON.stringify({
    country,
    city,
    region,
    timezone,
    postalCode,
    lat,
    lon,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': allowedOrigin(request),
    },
  });
}
