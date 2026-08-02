/**
 * Auth — Firebase-based sign-in (Google popup + email magic link).
 *
 * A pure identity layer: no Firestore, no new database. Google Sheets (via the
 * existing Apps Script backend) stays the single source of truth for synced
 * data. Firebase only issues ID tokens, which get verified at the Cloudflare
 * edge (functions/_firebase-verify.js) and reduced to a privacy-preserving
 * emailHash before anything is written to a Sheet — see Phase 6 of
 * docs/ACCOUNTS_AND_REDESIGN_PLAN.md.
 *
 * The Firebase SDK loads from Google's CDN as real ES modules (same
 * "external CDN, no bundler" convention as MapLibre GL — see the
 * <script type="module"> tags in index.html); this module's own top-level
 * imports resolve from the browser's module cache once those have loaded,
 * whether that finishes before or after this module itself is imported.
 *
 * Follows https://firebase.google.com/docs/auth/web/email-link-auth for the
 * sendSignInLinkToEmail / isSignInWithEmailLink / signInWithEmailLink flow.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  onAuthStateChanged,
  signOut as _fbSignOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

import { FIREBASE_CONFIG } from "./config.js";
import { EVT } from "./events.js";

const ACCOUNT_STORAGE_KEY = "hf_account"; // instant-hydration cache only — never a trust boundary
const MAGIC_LINK_EMAIL_KEY = "hf_magic_link_email";
const MAGIC_LINK_QUERY_PARAM = "signin"; // marks the return URL so isSignInWithEmailLink has something stable to check

let _initialized = false;
let _auth = null;
const _googleProvider = new GoogleAuthProvider();

/**
 * Read the cached account from localStorage (instant UI hydration only —
 * every privileged action re-verifies via a fresh ID token server-side).
 * @returns {{uid: string, email: string, displayName: string}|null}
 */
export function getCachedAccount() {
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function _cacheAccount(user) {
  if (!user) {
    try { localStorage.removeItem(ACCOUNT_STORAGE_KEY); } catch { /* quota/blocked */ }
    return null;
  }
  const account = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
  };
  try { localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account)); } catch { /* quota/blocked */ }
  return account;
}

function _emitAuthChanged(account) {
  window.dispatchEvent(new CustomEvent(EVT.AUTH_CHANGED, { detail: { account } }));
}

/**
 * Complete a pending email-link sign-in if the current URL is one, per
 * https://firebase.google.com/docs/auth/web/email-link-auth. Same-device
 * completion reads the email stashed by sendMagicLink(); cross-device
 * completion (link opened on a different browser/device) prompts for it.
 * @returns {Promise<boolean>} true if a sign-in was completed
 */
export async function completeMagicLinkSignIn() {
  if (!isSignInWithEmailLink(_auth, window.location.href)) return false;

  let email = null;
  try { email = window.localStorage.getItem(MAGIC_LINK_EMAIL_KEY); } catch { /* blocked */ }
  if (!email) {
    email = window.prompt("Confirm your email to finish signing in");
  }
  if (!email) return false;

  try {
    await signInWithEmailLink(_auth, email, window.location.href);
    try { window.localStorage.removeItem(MAGIC_LINK_EMAIL_KEY); } catch { /* blocked */ }
    _stripMagicLinkParamsFromUrl();
    return true;
  } catch {
    _stripMagicLinkParamsFromUrl();
    return false;
  }
}

function _stripMagicLinkParamsFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(MAGIC_LINK_QUERY_PARAM);
    // Firebase appends its own oobCode/mode/apiKey/etc params to the link
    ["oobCode", "mode", "apiKey", "continueUrl", "lang"].forEach((p) => url.searchParams.delete(p));
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch { /* URL API edge case — non-fatal, leaves params in place */ }
}

/**
 * Initialize Firebase Auth: sets up the app-wide auth-state listener (which
 * fires EVT.AUTH_CHANGED and hydrates hf_account on every change) and
 * resolves any pending magic-link sign-in. Call once, after map load.
 * @returns {Promise<boolean>} true if a pending magic-link sign-in on the
 *   current URL was just completed (as opposed to an already-signed-in
 *   session simply being restored) — callers use this to decide whether a
 *   one-time "Signed in" confirmation is warranted (see src/menu.js).
 */
export async function initAuth() {
  if (_initialized) return false;
  _initialized = true;

  const app = initializeApp(FIREBASE_CONFIG);
  _auth = getAuth(app);

  onAuthStateChanged(_auth, (user) => {
    _emitAuthChanged(_cacheAccount(user));
  });

  return await completeMagicLinkSignIn();
}

/**
 * Sign in with a Google popup.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signInWithGoogle() {
  try {
    await signInWithPopup(_auth, _googleProvider);
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.code || "auth_error" };
  }
}

/**
 * Send a passwordless sign-in link to an email address.
 * @param {string} email
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendMagicLink(email) {
  const actionCodeSettings = {
    url: `${window.location.origin}${window.location.pathname}?${MAGIC_LINK_QUERY_PARAM}=1`,
    handleCodeInApp: true,
  };
  try {
    await sendSignInLinkToEmail(_auth, email, actionCodeSettings);
    try { window.localStorage.setItem(MAGIC_LINK_EMAIL_KEY, email); } catch { /* blocked */ }
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.code || "auth_error" };
  }
}

/**
 * Get a fresh Firebase ID token for the signed-in user, or null if signed out.
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<string|null>}
 */
export async function getIdToken(forceRefresh = false) {
  if (!_auth?.currentUser) return null;
  try {
    return await _auth.currentUser.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

/**
 * Sign the current user out.
 * @returns {Promise<{success: boolean}>}
 */
export async function signOut() {
  try {
    await _fbSignOut(_auth);
    return { success: true };
  } catch {
    return { success: false };
  }
}
