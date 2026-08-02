/**
 * Cloudflare Pages Function – /api/account
 *
 * Cross-device sync for signed-in users: favourites, saved custom pins, and
 * home location (docs/ACCOUNTS_AND_REDESIGN_PLAN.md Phase 6/8). Every action
 * requires a Firebase ID token, verified here via ../_firebase-verify.js and
 * reduced to an emailHash before anything reaches Google Sheets — no
 * plaintext email is ever forwarded, per the Phase 6 privacy rule.
 *
 * POST actions: sync-saved (list), save, unsave.
 *
 * Required Cloudflare Pages Environment Variables:
 *   GAS_URL – Google Apps Script web app URL
 */
import { verifyFirebaseIdToken } from "../_firebase-verify.js";

const ALLOWED_ORIGINS = ["https://maps.karamahcollective.com"];
const MAX_BODY_SIZE = 2048;
const MAX_ID_TOKEN_LEN = 2048;
const MAX_PLACE_ID_LEN = 20;
const MAX_PIN_NAME_LEN = 200;
const SAVED_PLACE_KINDS = ["favorite", "pin", "home"];

function allowedOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function truncate(str, max) {
  return typeof str === "string" ? str.slice(0, max) : "";
}

function json(data, status = 200, headers = {}) {
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
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify a Firebase ID token and reduce it to just an emailHash — never the
 * plaintext email, per the Phase 6 privacy rule.
 * @param {string} idToken
 * @returns {Promise<string|null>}
 */
async function resolveEmailHash(idToken) {
  const cleanToken = truncate((idToken || "").toString(), MAX_ID_TOKEN_LEN);
  if (!cleanToken) return null;
  const verified = await verifyFirebaseIdToken(cleanToken);
  if (!verified || !verified.email) return null;
  return sha256(verified.email.trim().toLowerCase());
}

// ── POST: sync-saved, save, unsave ───────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin(request),
  };

  try {
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

    const { action, idToken } = body;
    if (!["sync-saved", "save", "unsave"].includes(action)) {
      return json({ error: "Invalid request" }, 400, headers);
    }

    const emailHash = await resolveEmailHash(idToken);
    if (!emailHash) return json({ error: "invalid_token" }, 401, headers);

    if (action === "sync-saved") {
      return await forwardToGAS(env.GAS_URL, { formType: "account", action: "sync-saved", emailHash }, headers);
    }

    // save / unsave share the same field validation
    const kind = truncate((body.kind || "").toString().trim(), 20);
    if (!SAVED_PLACE_KINDS.includes(kind)) {
      return json({ error: "invalid_kind" }, 400, headers);
    }

    const gasPayload = { formType: "account", action, emailHash, kind };

    const placeId = truncate((body.placeId || "").toString().trim(), MAX_PLACE_ID_LEN);
    if (placeId) gasPayload.placeId = placeId;

    if (body.pinLat != null || body.pinLng != null) {
      const lat = Number(body.pinLat);
      const lng = Number(body.pinLng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        gasPayload.pinLat = lat;
        gasPayload.pinLng = lng;
      }
    }
    if (body.pinName) gasPayload.pinName = truncate(body.pinName.toString(), MAX_PIN_NAME_LEN);

    if (kind === "favorite" && !gasPayload.placeId) {
      return json({ error: "missing_place_id" }, 400, headers);
    }
    if ((kind === "pin" || kind === "home") && (gasPayload.pinLat == null || gasPayload.pinLng == null)) {
      return json({ error: "missing_coordinates" }, 400, headers);
    }

    return await forwardToGAS(env.GAS_URL, gasPayload, headers);
  } catch {
    return json({ error: "Service error" }, 502, headers);
  }
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
