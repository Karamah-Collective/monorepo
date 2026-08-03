/**
 * Cloudflare Pages Function – /api/submit
 *
 * Handles form submissions from the "Suggest a Place" and "Suggest Edit" forms,
 * plus (Phase 2 of the accounts/profile plan) two Firebase-only read actions
 * for a signed-in user's own past submissions.
 * Flow (default — no `action` field, the original single-purpose behavior):
 *   1. Validate the incoming JSON payload
 *   2. Verify the reCAPTCHA v3 token with Google (server-side)
 *   3. Optionally resolve an `idToken` to an emailHash (Phase 1 — never
 *      required, never fails the submission if it doesn't resolve)
 *   4. Forward the data to the Google Apps Script web app → Google Sheet
 * Flow (`action: "my-submitted-places"|"my-submitted-edits"`): Firebase-only,
 * no reCAPTCHA — verifies `idToken`, forwards `{formType, action, emailHash}`
 * to Apps Script and returns whatever it responds with. Mirrors
 * `functions/api/reviews.js`'s `my-reviews` action.
 *
 * Required Cloudflare Pages Environment Variables (set in Pages -> Settings -> Variables):
 *   RECAPTCHA_SECRET   – reCAPTCHA v3 secret key
 *   GAS_URL            – Google Apps Script web app URL (https://script.google.com/macros/s/…/exec)
 */
import { verifyFirebaseIdToken } from '../_firebase-verify.js';

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const MIN_SCORE = 0.5;
const ALLOWED_ORIGINS = ['https://maps.karamahcollective.com'];
const MAX_FIELD_LEN = 500;
const MAX_NOTES_LEN = 2000;
const MAX_BODY_SIZE = 8192; // 8 KB
const MAX_ID_TOKEN_LEN = 2048; // Firebase ID tokens (JWTs) run ~1000-1300 chars
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMIT_ACTIONS = ['my-submitted-places', 'my-submitted-edits'];

function allowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function truncate(str, max) {
  return typeof str === 'string' ? str.slice(0, max) : '';
}

/**
 * Compute SHA-256 hex hash of a string using Web Crypto API.
 * @param {string} input
 * @returns {Promise<string>}
 */
async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a Firebase ID token and reduce it to just an emailHash — never the
 * plaintext email, per the Phase 6 privacy rule. Returns null (never throws)
 * so callers can treat any failure as "unauthenticated".
 * @param {string} idToken
 * @returns {Promise<{emailHash: string}|null>}
 */
async function resolveFirebaseIdentity(idToken) {
  const cleanToken = truncate((idToken || '').toString(), MAX_ID_TOKEN_LEN);
  if (!cleanToken) return null;
  const verified = await verifyFirebaseIdToken(cleanToken);
  if (!verified || !verified.email) return null;
  const emailHash = await sha256(verified.email.trim().toLowerCase());
  return { emailHash };
}

/**
 * Dispatch action-based (non-plain-submission) POST requests — the
 * Firebase-only "my submitted places/edits" read paths. Unlike the default
 * plain-submission path (where identity is optional), an unresolvable
 * idToken here is rejected rather than silently omitted, since there is no
 * meaningful anonymous variant of "list my own submissions".
 * @param {string} action
 * @param {string} formType
 * @param {object} body - full parsed request body (for body.idToken)
 * @param {object} headers - response headers
 * @param {object} env - Cloudflare Pages environment bindings
 * @returns {Promise<Response>}
 */
async function handleSubmitAction(action, formType, body, headers, env) {
  if (!SUBMIT_ACTIONS.includes(action)) {
    return json({ error: 'Invalid request' }, 400, headers);
  }
  const expectedFormType = action === 'my-submitted-places' ? 'new' : 'edit';
  if (formType !== expectedFormType) {
    return json({ error: 'Invalid request' }, 400, headers);
  }

  const identity = await resolveFirebaseIdentity(body.idToken);
  if (!identity) {
    return json({ error: 'invalid_token' }, 401, headers);
  }

  return await forwardToGAS(env.GAS_URL, { formType, action, emailHash: identity.emailHash }, headers);
}

/**
 * Forward a payload to Google Apps Script, following redirects, returning
 * whatever GAS responds with. Used only by the action-based read paths above
 * — the default plain-submission path below keeps its own inline
 * redirect-following logic untouched, for byte-identical backward compatibility.
 * @param {string} gasUrl
 * @param {object} payload
 * @param {object} headers - response headers
 * @returns {Promise<Response>}
 */
async function forwardToGAS(gasUrl, payload, headers) {
  try {
    let res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'manual',
    });

    for (let i = 0; i < 5; i++) {
      const loc = res.headers.get('Location');
      if ([301, 302, 307, 308].includes(res.status) && loc) {
        res = await fetch(loc, { redirect: 'manual' });
        continue;
      }
      break;
    }

    const result = JSON.parse(await res.text());
    if (result.error) return json({ error: result.error }, 400, headers);
    return json({ success: true, ...result }, 200, headers);
  } catch {
    return json({ error: 'Service error' }, 502, headers);
  }
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

  const { token, formType, action, idToken, ...formData } = body;

  // ── Action-based dispatch (Phase 2): Firebase-only "my submissions" read
  // paths. No reCAPTCHA required (read-only, identity-gated). Absent `action`
  // (the default) falls through unchanged below — byte-identical behavior
  // for anonymous/plain place & edit submissions. ──
  if (action) {
    return await handleSubmitAction(action, formType, body, responseHeaders, env);
  }

  // ── Basic validation ──
  if (!token || typeof token !== 'string') {
    return json({ error: 'Missing reCAPTCHA token' }, 400, responseHeaders);
  }
  if (!formType || !['new', 'edit', 'contact', 'event', 'event-edit', 'eid'].includes(formType)) {
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
  if (formData.website)        formData.website        = truncate(formData.website, MAX_FIELD_LEN);

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
  if (formData.locationName)       formData.locationName       = truncate(formData.locationName, MAX_FIELD_LEN);
  if (formData.locationGmapsLink)  formData.locationGmapsLink  = truncate(formData.locationGmapsLink, MAX_FIELD_LEN);
  if (formData.locationAddress)    formData.locationAddress    = truncate(formData.locationAddress, MAX_FIELD_LEN);
  if (formData.locationLat != null || formData.locationLng != null) {
    const lat = Number(formData.locationLat);
    const lng = Number(formData.locationLng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      formData.locationLat = lat;
      formData.locationLng = lng;
    } else {
      delete formData.locationLat;
      delete formData.locationLng;
    }
  }
  if (formData.organizerName)   formData.organizerName   = truncate(formData.organizerName, MAX_FIELD_LEN);
  if (formData.organizerPlaceId) formData.organizerPlaceId = truncate(formData.organizerPlaceId, 20);

  // Eid-specific fields
  if (formData.eidOrganizer) formData.eidOrganizer = truncate(formData.eidOrganizer, MAX_FIELD_LEN);
  if (formData.eidDate)      formData.eidDate      = truncate(formData.eidDate, 10);
  if (formData.eidJamaats)   formData.eidJamaats   = truncate(formData.eidJamaats, MAX_FIELD_LEN);

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
  const gasPayload = { ...formData, formType, score: captcha.score };

  // ── Optional identity (Phase 1) — attach emailHash if the caller is signed
  // in via Firebase. Silently omitted on any resolution failure; never blocks
  // the submission (reCAPTCHA above already gates abuse either way). ──
  if (idToken) {
    const identity = await resolveFirebaseIdentity(idToken);
    if (identity) gasPayload.emailHash = identity.emailHash;
  }

  const payload = JSON.stringify(gasPayload);

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
