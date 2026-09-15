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

  const recaptchaSiteKey = (
    env.recaptchaSiteKey ||
    env.RECAPTCHA_SITE_KEY ||
    ""
  ).replace(/^"|"$/g, "");

  return new Response(JSON.stringify({ recaptchaSiteKey }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
