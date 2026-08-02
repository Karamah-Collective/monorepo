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
  OAuthProvider,
  signInWithPopup,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  getAdditionalUserInfo,
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
// Microsoft has no dedicated MicrosoftAuthProvider class in the Firebase Web
// SDK (unlike Google) — it's configured as a generic OAuthProvider with the
// "microsoft.com" id, same mechanism Apple/Yahoo sign-in would use if added
// later. Requires the Microsoft provider to be enabled in the Firebase
// console with an Azure app registration's Application ID + secret (Firebase
// project setup, not something this code can do — see the accounts plan).
const _microsoftProvider = new OAuthProvider("microsoft.com");
// Needed for the profile-photo fetch below — Firebase's own sign-in doesn't
// request this by default, and without it the Graph API call is rejected
// even though the user already consented to sign in.
_microsoftProvider.addScope("User.Read");

/**
 * Read the cached account from localStorage (instant UI hydration only —
 * every privileged action re-verifies via a fresh ID token server-side).
 * @returns {{uid: string, email: string, displayName: string, photoURL: string}|null}
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
    // Google supplies this automatically; Firebase itself never populates it
    // for Microsoft (per Firebase's own docs, Microsoft "does not provide a
    // photo URL") — signInWithMicrosoft() below fills this in asynchronously
    // afterward via a separate Microsoft Graph API call, once one succeeds.
    photoURL: user.photoURL || "",
  };
  try { localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account)); } catch { /* quota/blocked */ }
  return account;
}

function _emitAuthChanged(account) {
  window.dispatchEvent(new CustomEvent(EVT.AUTH_CHANGED, { detail: { account } }));
}

/**
 * Merge a fetched photoURL into whatever account is currently cached (a
 * no-op if the user has since signed out or switched accounts) and re-emit
 * EVT.AUTH_CHANGED so the UI picks it up once it's ready.
 * @param {string} photoURL
 * @returns {void}
 */
function _mergeCachedPhoto(photoURL) {
  const current = getCachedAccount();
  if (!current || !photoURL) return;
  const updated = { ...current, photoURL };
  try { localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(updated)); } catch { /* quota/blocked */ }
  _emitAuthChanged(updated);
}

/**
 * Fetch the signed-in Microsoft account's profile photo via the Microsoft
 * Graph API (Firebase never surfaces this the way it does for Google — see
 * the note on _cacheAccount() above) and cache it as a data: URL, since the
 * access token this needs is only available momentarily right after this
 * exact interactive sign-in — it isn't persisted, and isn't derivable again
 * on a later silent session restore. A data: URL survives in localStorage
 * indefinitely with no further Graph calls; a blob: URL would not survive a
 * page reload. Runs in the background — never blocks or fails sign-in
 * itself, since plenty of Microsoft accounts (especially personal ones)
 * simply have no photo set, which is an expected, silent no-op here.
 * @param {string} accessToken - the Microsoft OAuth access token from this sign-in
 * @returns {Promise<void>}
 */
async function _fetchAndCacheMicrosoftPhoto(accessToken) {
  if (!accessToken) return;
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return; // no photo set, or account type doesn't have one — silent, expected
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    _mergeCachedPhoto(dataUrl);
  } catch {
    /* network error / no photo — leave the initial-letter avatar fallback in place */
  }
}

/**
 * Extract {account, isNewUser} from a Firebase UserCredential — shared by
 * every sign-in method (Google popup, Microsoft popup, magic link) so the
 * caller can show "Welcome, X" vs. "Welcome back, X" without a separate
 * getCachedAccount() read racing onAuthStateChanged's own async update.
 * @param {import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js").UserCredential} cred
 * @returns {{account: {uid: string, email: string, displayName: string}, isNewUser: boolean}}
 */
function _resultFromCredential(cred) {
  return {
    account: _cacheAccount(cred.user),
    isNewUser: !!getAdditionalUserInfo(cred)?.isNewUser,
  };
}

/**
 * Complete a pending email-link sign-in if the current URL is one, per
 * https://firebase.google.com/docs/auth/web/email-link-auth. Same-device
 * completion reads the email stashed by sendMagicLink(); cross-device
 * completion (link opened on a different browser/device) prompts for it.
 * @returns {Promise<{completed: boolean, account?: {uid: string, email: string, displayName: string}, isNewUser?: boolean}>}
 */
export async function completeMagicLinkSignIn() {
  if (!isSignInWithEmailLink(_auth, window.location.href)) return { completed: false };

  let email = null;
  try { email = window.localStorage.getItem(MAGIC_LINK_EMAIL_KEY); } catch { /* blocked */ }
  if (!email) {
    email = window.prompt("Confirm your email to finish signing in");
  }
  if (!email) return { completed: false };

  try {
    const cred = await signInWithEmailLink(_auth, email, window.location.href);
    try { window.localStorage.removeItem(MAGIC_LINK_EMAIL_KEY); } catch { /* blocked */ }
    _stripMagicLinkParamsFromUrl();
    return { completed: true, ..._resultFromCredential(cred) };
  } catch {
    _stripMagicLinkParamsFromUrl();
    return { completed: false };
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
 * @returns {Promise<{completed: boolean, account?: {uid: string, email: string, displayName: string}, isNewUser?: boolean}>}
 *   `completed` is true if a pending magic-link sign-in on the current URL
 *   was just completed (as opposed to an already-signed-in session simply
 *   being restored) — callers use this to decide whether a one-time welcome
 *   toast is warranted (see src/menu.js).
 */
export async function initAuth() {
  if (_initialized) return { completed: false };
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
 * @returns {Promise<{success: boolean, error?: string, account?: {uid: string, email: string, displayName: string}, isNewUser?: boolean}>}
 */
export async function signInWithGoogle() {
  try {
    const cred = await signInWithPopup(_auth, _googleProvider);
    return { success: true, ..._resultFromCredential(cred) };
  } catch (err) {
    return { success: false, error: err?.code || "auth_error" };
  }
}

/**
 * Sign in with a Microsoft popup (personal or work/school Microsoft account,
 * depending on how the Azure app registration's supported-account-types is
 * configured on the Firebase/Azure side).
 * @returns {Promise<{success: boolean, error?: string, account?: {uid: string, email: string, displayName: string}, isNewUser?: boolean}>}
 */
export async function signInWithMicrosoft() {
  try {
    const cred = await signInWithPopup(_auth, _microsoftProvider);
    const result = { success: true, ..._resultFromCredential(cred) };
    // Fire-and-forget: the Microsoft OAuth access token needed for the photo
    // fetch is only available right here, on this exact credential — never
    // await it, sign-in itself must not wait on (or fail because of) it.
    const accessToken = OAuthProvider.credentialFromResult(cred)?.accessToken;
    _fetchAndCacheMicrosoftPhoto(accessToken);
    return result;
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
