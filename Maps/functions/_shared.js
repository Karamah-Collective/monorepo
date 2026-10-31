/**
 * Shared helpers used across functions/api/*.js — previously copy-pasted
 * identically in submit.js, reviews.js, account.js, wishes.js. No behavior
 * change, pure dedup (see docs/D1_MIGRATION_PLAN.md Phase 3).
 */

export const ALLOWED_ORIGINS = ["https://maps.karamahcollective.com"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function allowedOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

/**
 * Return true only when both the request URL and browser origin are loopback.
 * @param {Request} request - Incoming Pages Functions request.
 * @returns {boolean} Whether this is a browser request to the local dev server.
 */
export function isLoopbackRequest(request) {
  try {
    const requestHost = new URL(request.url).hostname;
    const origin = request.headers.get("Origin") || "";
    const originHost = origin ? new URL(origin).hostname : "";
    return LOOPBACK_HOSTS.has(requestHost) && LOOPBACK_HOSTS.has(originHost);
  } catch {
    return false;
  }
}

export function truncate(str, max) {
  return typeof str === "string" ? str.slice(0, max) : "";
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Compute SHA-256 hex hash of a string using Web Crypto API.
 * @param {string} input
 * @returns {Promise<string>}
 */
export async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Current Helsinki-local timestamp string, in the exact format Code.gs used
 * for every Timestamp/EnrichedAt/etc. column (`toLocaleString('en-FI', ...)`),
 * kept identical so historical and newly-written rows read the same way.
 * @returns {string}
 */
export function helsinkiTimestamp() {
  return new Date().toLocaleString("en-FI", { timeZone: "Europe/Helsinki" });
}
