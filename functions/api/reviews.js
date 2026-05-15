/**
 * Cloudflare Pages Function – /api/reviews
 *
 * GET  → List all live reviews grouped by placeId, edge-cached 5 min
 * POST → Submit a review, send/verify OTP, or check existing review
 *
 * Required Cloudflare Pages Environment Variables:
 *   RECAPTCHA_SECRET – reCAPTCHA v3 secret key (used for send-otp only)
 *   GAS_URL          – Google Apps Script web app URL
 *   VERIFY_SECRET    – HMAC signing key for verification tokens
 */

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = 0.5;
const ALLOWED_ORIGINS = ["https://maps.karamahcollective.com"];
const MAX_BODY_SIZE = 4096;
const MAX_TEXT_LEN = 500;
const MIN_TEXT_LEN = 20;
const MAX_DEVICE_LEN = 64;
const MAX_FINGERPRINT_LEN = 64;
const MAX_PLACE_ID_LEN = 6;
const MAX_EMAIL_LEN = 254;
const MAX_TOKEN_LEN = 512;

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

/**
 * Validate an HMAC-signed verification token using Web Crypto.
 * @param {string} token - base64(payload).base64(signature)
 * @param {string} secret - HMAC secret key
 * @returns {Promise<{valid: boolean, emailHash?: string}>}
 */
async function validateToken(token, secret) {
  if (!token || typeof token !== "string") return { valid: false };

  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false };

  const [payloadB64, sigB64] = parts;

  let payload;
  try {
    payload = atob(payloadB64);
  } catch {
    return { valid: false };
  }

  // Import key and verify HMAC
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const expectedSig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  // Compare signatures (base64 encoded)
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)));
  if (sigB64 !== expectedB64) return { valid: false };

  // Parse payload: emailHash|expiryTimestamp
  const pipeIdx = payload.lastIndexOf("|");
  if (pipeIdx === -1) return { valid: false };

  const emailHash = payload.substring(0, pipeIdx);
  const expiry = parseInt(payload.substring(pipeIdx + 1), 10);

  if (isNaN(expiry) || Date.now() > expiry) return { valid: false };

  return { valid: true, emailHash };
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
  if (!["submit", "check", "send-otp", "verify-otp"].includes(action)) {
    return json({ error: "Invalid request" }, 400, headers);
  }

  // Compute IP hash server-side (raw IP never stored/forwarded)
  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await sha256(clientIp);

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

  // ── check: check if user already reviewed a place ──
  if (action === "check") {
    const placeId = truncate((body.placeId || "").trim(), MAX_PLACE_ID_LEN);
    if (!placeId) {
      return json({ error: "Missing required fields" }, 400, headers);
    }

    const gasPayload = {
      formType: "review",
      action: "check",
      placeId,
      ipHash,
    };

    // Token-based check (new flow)
    if (body.verifyToken) {
      const verifySecret = env.VERIFY_SECRET || "";
      if (!verifySecret) {
        return json({ error: "Service temporarily unavailable" }, 500, headers);
      }
      const tokenResult = await validateToken(body.verifyToken.slice(0, MAX_TOKEN_LEN), verifySecret);
      if (!tokenResult.valid) {
        return json({ error: "invalid_token" }, 403, headers);
      }
      gasPayload.verifyToken = body.verifyToken.slice(0, MAX_TOKEN_LEN);
    } else {
      // Legacy identity fields
      gasPayload.deviceId = truncate((body.deviceId || "").trim(), MAX_DEVICE_LEN);
      gasPayload.fingerprint = truncate((body.fingerprint || "").trim(), MAX_FINGERPRINT_LEN);
      if (!gasPayload.deviceId || !gasPayload.fingerprint) {
        return json({ error: "Missing required fields" }, 400, headers);
      }
    }

    return await forwardToGAS(env.GAS_URL, gasPayload, headers);
  }

  // ── submit: submit or update a review ──
  if (action === "submit") {
    const placeId = truncate((body.placeId || "").trim(), MAX_PLACE_ID_LEN);
    if (!placeId) {
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

    const gasPayload = {
      formType: "review",
      action: "submit",
      placeId,
      rating,
      text,
      ipHash,
    };

    // Token-based submission (verified user — no reCAPTCHA needed)
    if (body.verifyToken) {
      const verifySecret = env.VERIFY_SECRET || "";
      if (!verifySecret) {
        return json({ error: "Service temporarily unavailable" }, 500, headers);
      }
      const tokenResult = await validateToken(body.verifyToken.slice(0, MAX_TOKEN_LEN), verifySecret);
      if (!tokenResult.valid) {
        return json({ error: "invalid_token" }, 403, headers);
      }
      gasPayload.verifyToken = body.verifyToken.slice(0, MAX_TOKEN_LEN);
    } else {
      // Legacy flow: requires reCAPTCHA + identity fields
      if (!env.RECAPTCHA_SECRET) {
        return json({ error: "Service temporarily unavailable" }, 500, headers);
      }

      const { token, deviceId, fingerprint } = body;
      if (!token || !deviceId || !fingerprint) {
        return json({ error: "Missing required fields" }, 400, headers);
      }

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

      gasPayload.deviceId = truncate(deviceId.trim(), MAX_DEVICE_LEN);
      gasPayload.fingerprint = truncate(fingerprint.trim(), MAX_FINGERPRINT_LEN);
    }

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
