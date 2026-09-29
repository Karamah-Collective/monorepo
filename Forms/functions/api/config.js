export function onRequestGet({ env }) {
  return Response.json({ turnstileSiteKey: String(env.TURNSTILE_SITE_KEY || "0x4AAAAAAFIwqiUGSK74cVm5").replace(/^"|"$/g, "") }, { headers: { "Cache-Control": "public, max-age=300" } });
}
