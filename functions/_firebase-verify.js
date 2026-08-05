/**
 * Shared helper — verifies a Firebase Auth ID token at the Cloudflare edge.
 *
 * No Firebase Admin SDK is used (it depends on Node.js APIs unavailable in the
 * Workers/Pages Functions V8 runtime). Instead this fetches Google's public
 * JWKS (JWK format, not X.509 — avoids needing a certificate parser) and
 * verifies the RS256 signature + standard claims manually via Web Crypto.
 *
 * The Firebase project ID is not secret (it's part of every ID token's
 * `aud`/`iss` claims and is already public in the client bundle), so it's
 * hardcoded here rather than routed through a Cloudflare env var. Callers
 * that need a different project (e.g. a separate Firebase project for an
 * internal tool) can pass `env.FIREBASE_PROJECT_ID` to override it — unused
 * by default, so existing single-argument callers are unaffected.
 *
 * Imported by functions/api/reviews.js, functions/api/account.js, and
 * functions/api/admin.js.
 */

const FIREBASE_PROJECT_ID = "halal-map-karamah";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const JWKS_CACHE_TTL_MS = 3_600_000; // 1 hour — mirrors the Cache-Control this endpoint itself sends
const CLOCK_SKEW_TOLERANCE_S = 300; // 5 minutes, absorbs modest client/server clock drift

// Module-scoped cache — persists across requests within the same isolate,
// avoiding a JWKS fetch on every single verification.
let _jwksCache = null; // { keys: Array<JsonWebKey & {kid:string}>, fetchedAt: number }

/**
 * Fetch (and cache) Google's Secure Token Service JWKS.
 * @returns {Promise<Array<Object>>}
 */
async function _getJwks() {
  if (_jwksCache && Date.now() - _jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return _jwksCache.keys;
  }
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("jwks_fetch_failed");
  const data = await res.json();
  const keys = Array.isArray(data.keys) ? data.keys : [];
  _jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/**
 * Decode a base64url string into a Uint8Array.
 * @param {string} b64url
 * @returns {Uint8Array}
 */
function _base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Decode a JWT segment (header or payload) into a parsed JSON object.
 * @param {string} part
 * @returns {Object}
 */
function _decodeJwtSegment(part) {
  const json = new TextDecoder().decode(_base64UrlToBytes(part));
  return JSON.parse(json);
}

/**
 * Verify a Firebase Auth ID token: RS256 signature (against Google's public
 * JWKS) plus the standard `aud`/`iss`/`exp`/`iat`/`auth_time`/`sub` claims.
 * @param {string} idToken
 * @param {{FIREBASE_PROJECT_ID?: string}} [env] - optional; overrides the hardcoded project id
 * @returns {Promise<{uid: string, email: string, emailVerified: boolean, name: string, signInProvider: string}|null>}
 *   null on any verification failure — callers should treat this as "unauthenticated".
 *   `signInProvider` mirrors the client SDK's providerData[0].providerId
 *   (e.g. "password", "google.com") via the token's own `firebase.sign_in_provider`
 *   claim — callers use it to hard-block an unverified password account from
 *   a privileged write the same way the client already does (src/auth.js's
 *   isCurrentUserUnverifiedPassword()) without trusting the client's own,
 *   spoofable claim about which provider it used.
 */
export async function verifyFirebaseIdToken(idToken, env) {
  if (!idToken || typeof idToken !== "string") return null;

  const parts = idToken.split(".");
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = _decodeJwtSegment(parts[0]);
    payload = _decodeJwtSegment(parts[1]);
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) return null;

  const projectId = (env && env.FIREBASE_PROJECT_ID) || FIREBASE_PROJECT_ID;
  const issuer = `https://securetoken.google.com/${projectId}`;

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== issuer) return null;
  if (typeof payload.exp !== "number" || now >= payload.exp) return null;
  if (typeof payload.iat !== "number" || now < payload.iat - CLOCK_SKEW_TOLERANCE_S) return null;
  if (typeof payload.auth_time !== "number" || now < payload.auth_time - CLOCK_SKEW_TOLERANCE_S) return null;
  if (!payload.sub || typeof payload.sub !== "string") return null;

  let keys;
  try {
    keys = await _getJwks();
  } catch {
    return null;
  }

  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let cryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }

  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = _base64UrlToBytes(parts[2]);

  let valid = false;
  try {
    valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, signedData);
  } catch {
    return null;
  }
  if (!valid) return null;

  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : "",
    emailVerified: !!payload.email_verified,
    name: typeof payload.name === "string" ? payload.name : "",
    signInProvider: typeof payload.firebase?.sign_in_provider === "string" ? payload.firebase.sign_in_provider : "",
  };
}
