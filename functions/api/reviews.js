/**
 * Cloudflare Pages Function – /api/reviews
 *
 * GET  → List all live reviews grouped by placeId, never edge-cached
 * POST → Submit/edit/delete a review, list "my reviews", send/verify OTP, or
 *        check an existing review. `submit`/`check` accept either a legacy
 *        OTP `verifyToken` or a Firebase `idToken` (verified here via
 *        ../_firebase-verify.js); `delete`/`my-reviews` are Firebase-only —
 *        see docs/ACCOUNTS_AND_REDESIGN_PLAN.md Phase 6/7.
 *
 * Required Cloudflare Pages Environment Variables:
 *   RECAPTCHA_SECRET – reCAPTCHA v3 secret key (used for send-otp only)
 *   GAS_URL          – Google Apps Script web app URL
 */
import { verifyFirebaseIdToken } from "../_firebase-verify.js";

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = 0.5;
const ALLOWED_ORIGINS = ["https://maps.karamahcollective.com"];
const MAX_BODY_SIZE = 4096;
const MAX_TEXT_LEN = 500;
const MIN_TEXT_LEN = 20;
const MAX_PLACE_ID_LEN = 6;
const MAX_EMAIL_LEN = 254;
const MAX_TOKEN_LEN = 512;
const MAX_ID_TOKEN_LEN = 2048; // Firebase ID tokens (JWTs) run ~1000-1300 chars

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
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
  };

  // Use SHEETS_URL (same as places/events) with GAS_URL fallback
  const gasUrl = env.SHEETS_URL || env.GAS_URL;
  if (!gasUrl) {
    return json({ error: "Service temporarily unavailable" }, 500, headers);
  }

  try {
    const upstream = await fetch(`${gasUrl}?action=reviews&_=${Date.now()}`, {
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return json({ error: "Failed to fetch reviews" }, 502, headers);
  }
}

// ── POST: submit review, send OTP, verify OTP, or check existing ─────────────
export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin(request),
  };

  if (!env.GAS_URL) {
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

  const { action } = body;
  if (!["submit", "check", "send-otp", "verify-otp", "delete", "my-reviews"].includes(action)) {
    return json({ error: "Invalid request" }, 400, headers);
  }

  // Compute IP hash server-side (raw IP never stored/forwarded)
  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await sha256(clientIp);

  /**
   * Verify a Firebase ID token and reduce it to just an emailHash — never
   * the plaintext email, per the Phase 6 privacy rule. Returns null (never
   * throws) so callers can treat any failure as "unauthenticated".
   * @param {string} idToken
   * @returns {Promise<{emailHash: string}|null>}
   */
  async function resolveFirebaseIdentity(idToken) {
    const cleanToken = truncate((idToken || "").toString(), MAX_ID_TOKEN_LEN);
    if (!cleanToken) return null;
    const verified = await verifyFirebaseIdToken(cleanToken);
    if (!verified || !verified.email) return null;
    const emailHash = await sha256(verified.email.trim().toLowerCase());
    return { emailHash };
  }

  // ── send-otp: requires reCAPTCHA to prevent bot spam on email sending ──
  if (action === "send-otp") {
    if (!env.RECAPTCHA_SECRET) {
      return json({ error: "Service temporarily unavailable" }, 500, headers);
    }

    const { token, email } = body;
    if (!token || !email) {
      return json({ error: "Missing required fields" }, 400, headers);
    }

    // Validate email format
    const cleanEmail = email.trim().toLowerCase().slice(0, MAX_EMAIL_LEN);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return json({ error: "invalid_email" }, 400, headers);
    }

    // Verify reCAPTCHA (prevents bots from burning daily email quota)
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

    const gasPayload = {
      formType: "review",
      action: "send-otp",
      email: cleanEmail,
      ipHash,
    };

    return await forwardToGAS(env.GAS_URL, gasPayload, headers);
  }

  // ── verify-otp: validate OTP, get signed token back ──
  if (action === "verify-otp") {
    const { email, otp } = body;
    if (!email || !otp) {
      return json({ error: "Missing required fields" }, 400, headers);
    }

    const cleanEmail = email.trim().toLowerCase().slice(0, MAX_EMAIL_LEN);
    const cleanOtp = (otp + "").trim().slice(0, 6);

    if (!/^\d{6}$/.test(cleanOtp)) {
      return json({ error: "invalid_otp" }, 400, headers);
    }

    const gasPayload = {
      formType: "review",
      action: "verify-otp",
      email: cleanEmail,
      otp: cleanOtp,
      ipHash,
    };

    return await forwardToGAS(env.GAS_URL, gasPayload, headers);
  }

  // ── check: check if user already reviewed a place (either auth path) ──
  if (action === "check") {
    const placeId = truncate((body.placeId || "").trim(), MAX_PLACE_ID_LEN);
    if (!placeId || (!body.verifyToken && !body.idToken)) {
      return json({ error: "Missing required fields" }, 400, headers);
    }

    const gasPayload = { formType: "review", action: "check", placeId, ipHash };
    if (body.idToken) {
      const identity = await resolveFirebaseIdentity(body.idToken);
      if (!identity) return json({ reviewed: false }, 200, headers);
      gasPayload.emailHash = identity.emailHash;
    } else {
      gasPayload.verifyToken = truncate(body.verifyToken, MAX_TOKEN_LEN);
    }

    return await forwardToGAS(env.GAS_URL, gasPayload, headers);
  }

  // ── submit: submit or update a review (either auth path) ──
  if (action === "submit") {
    const placeId = truncate((body.placeId || "").trim(), MAX_PLACE_ID_LEN);
    if (!placeId || (!body.verifyToken && !body.idToken)) {
      return json({ error: "Missing required fields" }, 400, headers);
    }

    const rating = parseInt(body.rating, 10);
    if (!rating || rating < 1 || rating > 5) {
      return json({ error: "invalid_rating" }, 400, headers);
    }

    const text = truncate((body.text || "").trim(), MAX_TEXT_LEN);
    if (text && text.length < MIN_TEXT_LEN) {
      return json({ error: "text_too_short" }, 400, headers);
    }

    const gasPayload = { formType: "review", action: "submit", placeId, rating, text, ipHash };
    if (body.idToken) {
      const identity = await resolveFirebaseIdentity(body.idToken);
      if (!identity) return json({ error: "invalid_token" }, 401, headers);
      gasPayload.emailHash = identity.emailHash;
    } else {
      gasPayload.verifyToken = truncate(body.verifyToken, MAX_TOKEN_LEN);
    }

    return await forwardToGAS(env.GAS_URL, gasPayload, headers);
  }

  // ── delete: remove the caller's own review for a place (Firebase-only) ──
  if (action === "delete") {
    const placeId = truncate((body.placeId || "").trim(), MAX_PLACE_ID_LEN);
    if (!placeId || !body.idToken) {
      return json({ error: "Missing required fields" }, 400, headers);
    }
    const identity = await resolveFirebaseIdentity(body.idToken);
    if (!identity) return json({ error: "invalid_token" }, 401, headers);

    const gasPayload = { formType: "review", action: "delete", placeId, emailHash: identity.emailHash };
    return await forwardToGAS(env.GAS_URL, gasPayload, headers);
  }

  // ── my-reviews: list the caller's own reviews (Firebase-only) ──
  if (action === "my-reviews") {
    if (!body.idToken) {
      return json({ error: "Missing required fields" }, 400, headers);
    }
    const identity = await resolveFirebaseIdentity(body.idToken);
    if (!identity) return json({ error: "invalid_token" }, 401, headers);

    const gasPayload = { formType: "review", action: "my-reviews", emailHash: identity.emailHash };
    return await forwardToGAS(env.GAS_URL, gasPayload, headers);
  }

  return json({ error: "Invalid request" }, 400, headers);
}

/**
 * Forward a payload to Google Apps Script, following redirects.
 * @param {string} gasUrl
 * @param {object} payload
 * @param {object} headers - response headers
 * @returns {Promise<Response>}
 */
async function forwardToGAS(gasUrl, payload, headers) {
  try {
    let res = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
