export function onRequestGet({ env }) {
  return Response.json({ turnstileSiteKey: String(env.TURNSTILE_SITE_KEY || "").replace(/^"|"$/g, "") }, { headers: { "Cache-Control": "public, max-age=300" } });
}
