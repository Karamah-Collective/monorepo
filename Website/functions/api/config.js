/**
 * Cloudflare Pages Function - GET /api/config
 *
 * Returns front-end configuration sourced from Pages environment
 * variables / secrets so nothing private is hard-coded in the client bundle.
 *
 * Expected env vars:
 *   - recaptchaSiteKey / RECAPTCHA_SITE_KEY: reCAPTCHA v3 site key
 */
export function onRequestGet(context) {
  const { env } = context;

  const turnstileSiteKey = (
    env.TURNSTILE_SITE_KEY ||
    "0x4AAAAAAFIwqiUGSK74cVm5"
  ).replace(/^"|"$/g, "");

  return new Response(JSON.stringify({ turnstileSiteKey }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
