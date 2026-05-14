/**
 * Cloudflare Pages Function – /api/reviews
 *
 * GET  → List all live reviews grouped by placeId, edge-cached 5 min
 * POST → Submit a review or check if user already reviewed a place
 *
 * Required Cloudflare Pages Environment Variables:
 *   RECAPTCHA_SECRET – reCAPTCHA v3 secret key
 *   GAS_URL          – Google Apps Script web app URL
 */

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = 0.7;
const ALLOWED_ORIGINS = ["https://maps.karamahcollective.com"];
const MAX_BODY_SIZE = 4096;
const MAX_TEXT_LEN = 500;
const MIN_TEXT_LEN = 20;
const MAX_DEVICE_LEN = 64;
const MAX_FINGERPRINT_LEN = 64;
const MAX_PLACE_ID_LEN = 6;

function allowedOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function truncate(str, max) {
  return typeof str === "string" ? str.slice(0, max) : "";
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Compute SHA-256 hex hash of a string using Web Crypto API.
 * @param {string} input
 * @returns {Promise<string>}
 */
async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── GET: list all live reviews ───────────────────────────────────────────────
export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin(request),
  };

  // Use SHEETS_URL (same as places/events) with GAS_URL fallback
  const gasUrl = env.SHEETS_URL || env.GAS_URL;
  if (!gasUrl) {
    return json({ error: "Service temporarily unavailable" }, 500, headers);
  }

  try {
    const upstream = await fetch(`${gasUrl}?action=reviews`);
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...headers,
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch {
    return json({ error: "Failed to fetch reviews" }, 502, headers);
  }
}

// ── POST: submit review or check existing ────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin(request),
  };

  if (!env.RECAPTCHA_SECRET || !env.GAS_URL) {
    return json({ error: "Service temporarily unavailable" }, 500, headers);
  }

  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_BODY_SIZE) {
    return json({ error: "Payload too large" }, 413, headers);
  }

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: "Invalid JSON" }, 400, headers);
  }

  const { action, token } = body;
  if (!token || !["submit", "check"].includes(action)) {
    return json({ error: "Invalid request" }, 400, headers);
  }

  // Verify reCAPTCHA with elevated threshold
  let captcha;
  try {
    const res = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret: env.RECAPTCHA_SECRET, response: token }),
    });
    captcha = await res.json();
  } catch {
    return json({ error: "Verification unavailable" }, 502, headers);
  }

  if (!captcha.success || captcha.score < MIN_SCORE) {
    return json({ error: "Verification failed" }, 403, headers);
  }

  // Compute IP hash server-side (raw IP never stored/forwarded)
  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await sha256(clientIp);

  // Build payload for Apps Script
  const placeId = truncate((body.placeId || "").trim(), MAX_PLACE_ID_LEN);
  const deviceId = truncate((body.deviceId || "").trim(), MAX_DEVICE_LEN);
  const fingerprint = truncate((body.fingerprint || "").trim(), MAX_FINGERPRINT_LEN);

  if (!placeId || !deviceId || !fingerprint) {
    return json({ error: "Missing required fields" }, 400, headers);
  }

  const gasPayload = {
    formType: "review",
    action,
    placeId,
    deviceId,
    fingerprint,
    ipHash,
    score: captcha.score,
  };

  if (action === "submit") {
    const rating = parseInt(body.rating, 10);
    if (!rating || rating < 1 || rating > 5) {
      return json({ error: "invalid_rating" }, 400, headers);
    }

    const text = truncate((body.text || "").trim(), MAX_TEXT_LEN);
    if (text && text.length < MIN_TEXT_LEN) {
      return json({ error: "text_too_short" }, 400, headers);
    }

    gasPayload.rating = rating;
    gasPayload.text = text;
  }

  try {
    let res = await fetch(env.GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gasPayload),
      redirect: "manual",
    });

    // Follow redirects (GAS returns 302)
    for (let i = 0; i < 5; i++) {
      const loc = res.headers.get("Location");
      if ([301, 302, 307, 308].includes(res.status) && loc) {
        res = await fetch(loc, { redirect: "manual" });
        continue;
      }
      break;
    }

    const result = JSON.parse(await res.text());
    if (result.error) return json({ error: result.error }, 400, headers);
    return json({ success: true, ...result }, 200, headers);
  } catch {
    return json({ error: "Service error" }, 502, headers);
  }
}

// ── OPTIONS: CORS preflight ──────────────────────────────────────────────────
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin(context.request),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
