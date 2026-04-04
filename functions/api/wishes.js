/**
 * Cloudflare Pages Function – /api/wishes
 *
 * GET  → List all wishes (sorted by votes desc), edge-cached 5 min
 * POST → Create a new wish or vote on an existing one
 *
 * Required Cloudflare Pages Environment Variables:
 *   RECAPTCHA_SECRET – reCAPTCHA v3 secret key
 *   GAS_URL          – Google Apps Script web app URL
 */

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const MIN_SCORE = 0.5;
const ALLOWED_ORIGINS = ['https://maps.karamahcollective.com'];
const MAX_TITLE_LEN = 120;
const MAX_DESC_LEN = 1000;
const MAX_DEVICE_LEN = 64;
const MAX_BODY_SIZE = 4096;

function allowedOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function truncate(str, max) {
  return typeof str === 'string' ? str.slice(0, max) : '';
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}

// ── GET: list wishes ─────────────────────────────────────────────────────────
export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin(request),
  };

  if (!env.GAS_URL) {
    return json({ error: 'Service temporarily unavailable' }, 500, headers);
  }

  try {
    const upstream = await fetch(`${env.GAS_URL}?action=wishes`);
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...headers,
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch {
    return json({ error: 'Failed to fetch wishes' }, 502, headers);
  }
}

// ── POST: create wish or vote ────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin(request),
  };

  if (!env.RECAPTCHA_SECRET || !env.GAS_URL) {
    return json({ error: 'Service temporarily unavailable' }, 500, headers);
  }

  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return json({ error: 'Payload too large' }, 413, headers);
  }

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: 'Invalid JSON' }, 400, headers);
  }

  const { action, token } = body;
  if (!token || !['add', 'vote'].includes(action)) {
    return json({ error: 'Invalid request' }, 400, headers);
  }

  // Verify reCAPTCHA
  let captcha;
  try {
    const res = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret: env.RECAPTCHA_SECRET, response: token }),
    });
    captcha = await res.json();
  } catch {
    return json({ error: 'Verification unavailable' }, 502, headers);
  }

  if (!captcha.success || captcha.score < MIN_SCORE) {
    return json({ error: 'Verification failed' }, 403, headers);
  }

  // Build payload for Apps Script
  const gasPayload = { formType: 'wish', action, score: captcha.score };

  if (action === 'add') {
    const title = truncate((body.title || '').trim(), MAX_TITLE_LEN);
    const description = truncate((body.description || '').trim(), MAX_DESC_LEN);
    if (!title) return json({ error: 'Title is required' }, 400, headers);
    gasPayload.title = title;
    gasPayload.description = description;
  } else if (action === 'vote') {
    const wishId = truncate((body.wishId || '').trim(), 40);
    const deviceId = truncate((body.deviceId || '').trim(), MAX_DEVICE_LEN);
    if (!wishId || !deviceId) return json({ error: 'Missing wish ID or device ID' }, 400, headers);
    gasPayload.wishId = wishId;
    gasPayload.deviceId = deviceId;
  }

  try {
    let res = await fetch(env.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gasPayload),
      redirect: 'manual',
    });

    // Follow redirects (GAS returns 302)
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

// ── OPTIONS: CORS preflight ──────────────────────────────────────────────────
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin(context.request),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
