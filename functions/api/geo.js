/**
 * Cloudflare Pages Function – /api/geo
 *
 * Returns the visitor's country code using Cloudflare's built-in IP geolocation.
 * Cloudflare sets the CF-IPCountry header on every request that passes through
 * their network — accurate, zero rate limits, works with VPNs (returns VPN
 * server country), no external API calls needed.
 *
 * Response: { "country": "FI" }  (ISO 3166-1 alpha-2, or "XX" if unknown)
 */
export async function onRequestGet(context) {
  const country = context.request.headers.get('CF-IPCountry') || 'XX';
  return new Response(JSON.stringify({ country }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
