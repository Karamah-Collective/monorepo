/**
 * Cloudflare Pages Function – /api/submit
 *
 * Handles form submissions from the "Suggest a Place" and "Suggest Edit" forms.
 * Flow:
 *   1. Validate the incoming JSON payload
 *   2. Verify the reCAPTCHA v3 token with Google (server-side)
 *   3. Forward the data to the Google Apps Script web app → Google Sheet
 *
 * Required Cloudflare Pages Environment Variables (set in Pages → Settings → Variables):
 *   RECAPTCHA_SECRET   – reCAPTCHA v3 secret key
 *   GAS_URL            – Google Apps Script web app URL (https://script.google.com/macros/s/…/exec)
 */

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
// Minimum reCAPTCHA v3 score to accept (0.0 = bot, 1.0 = human). 0.5 is Google's recommended default.
const MIN_SCORE = 0.5;

// ── Main handler ─────────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  // ── Guard: env vars must be present ──
  if (!env.RECAPTCHA_SECRET) {
    return json({ error: 'Server misconfiguration: RECAPTCHA_SECRET not set' }, 500, responseHeaders);
  }
  if (!env.GAS_URL) {
    return json({ error: 'Server misconfiguration: GAS_URL not set' }, 500, responseHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, responseHeaders);
  }

  const { token, formType, ...formData } = body;

  // ── Basic validation ──
  if (!token) {
    return json({ error: 'Missing reCAPTCHA token' }, 400, responseHeaders);
  }
  if (!formType || !['new', 'edit'].includes(formType)) {
    return json({ error: 'formType must be "new" or "edit"' }, 400, responseHeaders);
  }

  // ── 1. Verify reCAPTCHA v3 ────────────────────────────────────────────────
  let captcha;
  try {
    const verifyRes = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret:   env.RECAPTCHA_SECRET,
        response: token,
      }),
    });
    captcha = await verifyRes.json();
  } catch (err) {
    return json({ error: 'reCAPTCHA verification request failed', detail: err.message }, 502, responseHeaders);
  }

  if (!captcha.success) {
    return json({ error: 'reCAPTCHA failed', codes: captcha['error-codes'] }, 403, responseHeaders);
  }
  if (captcha.score < MIN_SCORE) {
    return json({ error: 'Submission blocked (low reCAPTCHA score)', score: captcha.score }, 403, responseHeaders);
  }

  // ── 2. Forward to Google Apps Script (fire-and-forget) ───────────────────
  // GAS web apps always do a 302 redirect on POST. Following that across
  // Cloudflare's fetch implementation produces unreliable status codes even
  // when the row is written successfully. Since reCAPTCHA is the security gate,
  // we return success to the browser immediately and let GAS run in the
  // background via context.waitUntil — no more false "failed" toasts.
  const payload = JSON.stringify({
    ...formData,
    formType,
    score: captcha.score,
  });

  async function sendToGAS() {
    let url = env.GAS_URL;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(url, {
        method:   'POST',
        headers:  { 'Content-Type': 'application/json' },
        body:     payload,
        redirect: 'manual',
      });
      const loc = res.headers.get('Location');
      if ((res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) && loc) {
        url = loc;
        continue;
      }
      break;
    }
  }

  // waitUntil keeps the worker alive until GAS finishes without blocking the response.
  context.waitUntil(sendToGAS().catch(() => {}));

  return json({ success: true }, 200, responseHeaders);
}

// ── OPTIONS preflight (CORS) ──────────────────────────────────────────────────
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ── Helper ────────────────────────────────────────────────────────────────────
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}
