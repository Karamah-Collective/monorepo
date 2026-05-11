/**
 * Cloudflare Pages Function – /api/submit
 *
 * Handles form submissions from the "Suggest a Place" and "Suggest Edit" forms.
 * Flow:
 *   1. Validate the incoming JSON payload
 *   2. Verify the reCAPTCHA v3 token with Google (server-side)
 *   3. Forward the data to the Google Apps Script web app → Google Sheet
 *
 * Required Cloudflare Pages Environment Variables (set in Pages -> Settings -> Variables):
 *   RECAPTCHA_SECRET   – reCAPTCHA v3 secret key
 *   GAS_URL            – Google Apps Script web app URL (https://script.google.com/macros/s/…/exec)
 */

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const MIN_SCORE = 0.5;
const ALLOWED_ORIGINS = ['https://maps.karamahcollective.com'];
const MAX_FIELD_LEN = 500;
const MAX_NOTES_LEN = 2000;
const MAX_BODY_SIZE = 8192; // 8 KB
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function allowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function truncate(str, max) {
  return typeof str === 'string' ? str.slice(0, max) : '';
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin(request),
  };

  // ── Guard: env vars must be present ──
  if (!env.RECAPTCHA_SECRET) {
    return json({ error: 'Service temporarily unavailable' }, 500, responseHeaders);
  }
  if (!env.GAS_URL) {
    return json({ error: 'Service temporarily unavailable' }, 500, responseHeaders);
  }

  // ── Reject oversized payloads ──
  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return json({ error: 'Payload too large' }, 413, responseHeaders);
  }

  let rawText;
  try {
    rawText = await request.text();
  } catch {
    return json({ error: 'Invalid request body' }, 400, responseHeaders);
  }
  if (rawText.length > MAX_BODY_SIZE) {
    return json({ error: 'Payload too large' }, 413, responseHeaders);
  }

  let body;
  try {
    body = JSON.parse(rawText);
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, responseHeaders);
  }

  const { token, formType, ...formData } = body;

  // ── Basic validation ──
  if (!token || typeof token !== 'string') {
    return json({ error: 'Missing reCAPTCHA token' }, 400, responseHeaders);
  }
  if (!formType || !['new', 'edit', 'contact', 'event', 'event-edit'].includes(formType)) {
    return json({ error: 'Invalid form type' }, 400, responseHeaders);
  }

  // ── Field-level validation & truncation ──
  if (formData.name)    formData.name    = truncate(formData.name, MAX_FIELD_LEN);
  if (formData.address) formData.address = truncate(formData.address, MAX_FIELD_LEN);
  if (formData.gmaps)   formData.gmaps   = truncate(formData.gmaps, MAX_FIELD_LEN);
  if (formData.notes)   formData.notes   = truncate(formData.notes, MAX_NOTES_LEN);
  if (formData.message) formData.message = truncate(formData.message, MAX_NOTES_LEN);
  if (formData.tags)    formData.tags    = truncate(formData.tags, MAX_FIELD_LEN);
  if (formData.changesSummary) formData.changesSummary = truncate(formData.changesSummary, MAX_NOTES_LEN);
  if (formData.openingHours)   formData.openingHours   = truncate(formData.openingHours, MAX_NOTES_LEN);

  // Event-specific fields
  if (formData.title)       formData.title       = truncate(formData.title, MAX_FIELD_LEN);
  if (formData.description) formData.description = truncate(formData.description, MAX_NOTES_LEN);
  if (formData.placeId)     formData.placeId     = truncate(formData.placeId, 20);
  if (formData.eventDate)   formData.eventDate   = truncate(formData.eventDate, 10);
  if (formData.eventTime)   formData.eventTime   = truncate(formData.eventTime, 5);
  if (formData.endTime)     formData.endTime     = truncate(formData.endTime, 5);
  if (formData.recurrencePattern) formData.recurrencePattern = truncate(formData.recurrencePattern, MAX_FIELD_LEN);
  if (formData.url)         formData.url         = truncate(formData.url, MAX_FIELD_LEN);
  if (formData.eventId)     formData.eventId     = truncate(formData.eventId, 50);

  // Validate email format for contact forms
  if (formType === 'contact' && formData.email && !EMAIL_RE.test(formData.email)) {
    return json({ error: 'Invalid email address' }, 400, responseHeaders);
  }
  if (formData.email) formData.email = truncate(formData.email, 254);
  if (formData.phone) formData.phone = truncate(formData.phone, 30);

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
    return json({ error: 'Verification unavailable. Please try again.' }, 502, responseHeaders);
  }

  if (!captcha.success) {
    return json({ error: 'Verification failed. Please try again.' }, 403, responseHeaders);
  }
  if (captcha.score < MIN_SCORE) {
    return json({ error: 'Submission blocked. Please try again later.' }, 403, responseHeaders);
  }

  // ── 2. Forward to Google Apps Script ───────────────────────────────────────
  // GAS web apps return a 302 redirect after POST. The redirect target must be
  // fetched with GET (per HTTP spec). We follow the chain manually so we can
  // read the final JSON response and surface any errors to the user.
  const payload = JSON.stringify({
    ...formData,
    formType,
    score: captcha.score,
  });

  async function sendToGAS() {
    // 1. Initial POST to GAS exec URL
    let res = await fetch(env.GAS_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'application/json' },
      body:     payload,
      redirect: 'manual',
    });

    // 2. Follow redirect chain with GET (302 switches POST → GET)
    for (let i = 0; i < 5; i++) {
      const loc = res.headers.get('Location');
      if ((res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) && loc) {
        res = await fetch(loc, { redirect: 'manual' });
        continue;
      }
      break;
    }
    return res;
  }

  try {
    const gasRes = await sendToGAS();
    const gasText = gasRes ? await gasRes.text() : '';
    let gasData = null;
    try { gasData = JSON.parse(gasText); } catch { /* not JSON */ }
    if (!gasData || gasData.error) {
      return json({ success: false, error: 'Submission could not be processed. Please try again.' }, 200, responseHeaders);
    }
    return json({ success: true }, 200, responseHeaders);
  } catch {
    return json({ success: false, error: 'Submission failed. Please try again later.' }, 200, responseHeaders);
  }
}

// ── OPTIONS preflight (CORS) ──────────────────────────────────────────────────
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  allowedOrigin(context.request),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
    },
  });
}

// ── Helper ────────────────────────────────────────────────────────────────────
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}
