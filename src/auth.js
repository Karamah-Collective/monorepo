/**
 * Auth — Firebase-based sign-in (Google, Microsoft, Facebook, and Apple
 * popups, plus passwordless email magic link, plus traditional email +
 * password accounts).
 *
 * A pure identity layer: no Firestore. Cloudflare D1 is the source of truth
 * for synced data. Firebase only issues ID tokens, which get verified at the
 * Cloudflare edge (functions/_firebase-verify.js) and reduced to a
 * privacy-preserving emailHash before account-linked data is written — see
 * Phase 6 of docs/ACCOUNTS_AND_REDESIGN_PLAN.md.
 *
 * Email/password accounts are the ONE sign-in method here where Firebase
 * itself never proves the person actually controls the typed email address
 * (every OAuth provider — Google/Microsoft/Facebook/Apple — already proves
 * that before Firebase ever hands us a token; the passwordless magic link
 * proves it too, since the link only works if the recipient can open it).
 * Since this app's whole identity-linking design treats emailHash as a
 * trust anchor (D1 never stores plaintext email, only the hash — see
 * the privacy policy), an unverified password account undermines that
 * anchor. `signUpWithEmailPassword()` fires a verification email on
 * account creation; `isCurrentUserUnverifiedPassword()` is the single check
 * every privileged write action (writing a review, attaching identity to a
 * place/edit submission, etc.) must re-run fresh, right before acting, to
 * hard-block that one case — see each call site for the actual gate.
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
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  fetchSignInMethodsForEmail,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  linkWithCredential,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  getAdditionalUserInfo,
  onAuthStateChanged,
  signOut as _fbSignOut,
  deleteUser as _fbDeleteUser,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

import { FIREBASE_CONFIG } from "./config.js";
import { EVT } from "./events.js";

const ACCOUNT_STORAGE_KEY = "hf_account"; // instant-hydration cache only — never a trust boundary
const MAGIC_LINK_EMAIL_KEY = "hf_magic_link_email";
const MAGIC_LINK_QUERY_PARAM = "signin"; // marks the return URL so isSignInWithEmailLink has something stable to check
const MICROSOFT_PROVIDER_ID = "microsoft.com";
const FACEBOOK_PROVIDER_ID = "facebook.com";
const PASSWORD_PROVIDER_ID = "password"; // Firebase's providerData[].providerId for email+password accounts (never an OAuth provider's id)
// The Graph photo call is a network request during a fire-and-forget flow
// nobody's watching — worth one retry before giving up, since a transient
// blip here otherwise means "no photo, ever, on this device" permanently.
const MS_PHOTO_FETCH_MAX_ATTEMPTS = 2;
const MS_PHOTO_FETCH_RETRY_DELAY_MS = 800;

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
// Facebook DOES have a dedicated FacebookAuthProvider class in the Firebase
// Web SDK (unlike Microsoft/Apple) — same shape as GoogleAuthProvider.
// Request public_profile explicitly because the avatar fallback below reads
// Facebook's provider profile UID (the same providerData record Firebase uses
// for Facebook's name/email) and builds a Graph picture URL from it.
const _facebookProvider = new FacebookAuthProvider();
_facebookProvider.addScope("public_profile");
_facebookProvider.addScope("email");
// Apple, like Microsoft, has no dedicated Firebase provider class — it's a
// generic OAuthProvider with the "apple.com" id. Per Apple's own Firebase
// sign-in docs, request the "email" and "name" scopes explicitly (Apple
// does not return either by default); Apple only ever supplies the user's
// name on the FIRST authorization for a given app, which Firebase already
// surfaces on user.displayName when present.
const _appleProvider = new OAuthProvider("apple.com");
_appleProvider.addScope("email");
_appleProvider.addScope("name");

let _pendingLinkCredential = null;

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

function _providerPhotoURL(user, providerId) {
  return user?.providerData?.find((provider) => provider.providerId === providerId)?.photoURL || "";
}

function _providerProfile(user, providerId) {
  return user?.providerData?.find((provider) => provider.providerId === providerId) || null;
}

function _firstProviderPhotoURL(user) {
  return user?.providerData?.find((provider) => provider.photoURL)?.photoURL || "";
}

function _facebookGraphPictureURL(facebookUserId) {
  return facebookUserId
    ? `https://graph.facebook.com/${encodeURIComponent(facebookUserId)}/picture?type=large&height=500&width=500`
    : "";
}

function _facebookPhotoURLFromProfile(profile) {
  if (!profile) return "";
  const picture = profile.picture;
  const pictureURL = typeof picture === "string" ? picture : picture?.data?.url;
  return pictureURL || _facebookGraphPictureURL(profile.id || profile.uid || "");
}

function _facebookPhotoURLFromCredential(cred) {
  return _facebookPhotoURLFromProfile(getAdditionalUserInfo(cred)?.profile);
}

function _facebookPhotoURLFromProvider(user) {
  const facebookProfile = _providerProfile(user, FACEBOOK_PROVIDER_ID);
  if (!facebookProfile) return "";
  if (facebookProfile.photoURL) return facebookProfile.photoURL;
  return _facebookGraphPictureURL(facebookProfile.uid || "");
}

function _cacheAccount(user) {
  if (!user) {
    try { localStorage.removeItem(ACCOUNT_STORAGE_KEY); } catch { /* quota/blocked */ }
    return null;
  }
  // Google supplies user.photoURL automatically and keeps it fresh on every
  // Firebase user object; Microsoft's is NEVER populated here (per Firebase's
  // own docs, Microsoft "does not provide a photo URL") — the only source for
  // a Microsoft photo is the separate Graph API fetch below, merged in
  // asynchronously after it succeeds. Since Firebase's user.photoURL is thus
  // permanently meaningless for Microsoft, rebuilding the cached account from
  // it alone every time onAuthStateChanged fires would silently overwrite an
  // already-merged photo back to "" the moment this listener re-fires for any
  // reason (token refresh, multi-tab storage sync, SDK internals) — preserve
  // whatever's already cached for this exact uid in that case instead. Google
  // accounts are excluded from this preservation on purpose: its photoURL is
  // always authoritative, so if it's ever genuinely empty (e.g. removed),
  // that should actually clear the cached photo rather than keep it stale.
  const existing = getCachedAccount();
  const preservedPhoto = existing && existing.uid === user.uid ? existing.photoURL : "";
  const facebookPhoto = _facebookPhotoURLFromProvider(user);
  const hasFacebookProvider = user.providerData?.some((provider) => provider.providerId === FACEBOOK_PROVIDER_ID);
  const account = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    photoURL: facebookPhoto || (hasFacebookProvider ? preservedPhoto : "") || user.photoURL || preservedPhoto || _firstProviderPhotoURL(user) || "",
  };
  try { localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account)); } catch { /* quota/blocked */ }
  return account;
}

function _emitAuthChanged(account) {
  window.dispatchEvent(new CustomEvent(EVT.AUTH_CHANGED, { detail: { account } }));
}

function _authErrorPayload(err, providerLabel, extra = {}) {
  const code = err?.code || "auth_error";
  const email = err?.customData?.email || err?.email || "";
  const message = err?.message || "";
  console.warn(`[auth] ${providerLabel} sign-in failed`, {
    code,
    email,
    message,
    customData: err?.customData || null,
  });
  return { success: false, error: code, errorEmail: email, errorMessage: message, ...extra };
}

async function _fetchExistingProviderLabels(email) {
  if (!email) return [];
  try {
    const methods = await fetchSignInMethodsForEmail(_auth, email);
    return methods.map(_providerLabelFromId).filter(Boolean);
  } catch (err) {
    console.warn("[auth] Could not fetch existing sign-in methods:", err?.code || err?.message || err);
    return [];
  }
}

function _providerLabelFromId(providerId) {
  switch (providerId) {
    case "google.com": return "Google";
    case "microsoft.com": return "Microsoft";
    case FACEBOOK_PROVIDER_ID: return "Facebook";
    case "apple.com": return "Apple";
    case PASSWORD_PROVIDER_ID: return "email";
    case "emailLink": return "email link";
    default: return providerId || "";
  }
}

async function _facebookErrorPayload(err) {
  const code = err?.code || "auth_error";
  let pendingCredential = null;
  try {
    pendingCredential = FacebookAuthProvider.credentialFromError(err);
  } catch {
    pendingCredential = null;
  }

  const email = err?.customData?.email || err?.email || "";
  const existingProviderLabels = code === "auth/account-exists-with-different-credential"
    ? await _fetchExistingProviderLabels(email)
    : [];

  if (pendingCredential && email) {
    _pendingLinkCredential = {
      credential: pendingCredential,
      accessToken: pendingCredential.accessToken || "",
      email: email.toLowerCase(),
      providerId: FACEBOOK_PROVIDER_ID,
      providerLabel: "Facebook",
    };
  }

  return _authErrorPayload(err, "Facebook", {
    existingProviderLabels,
    hasPendingLinkCredential: !!_pendingLinkCredential,
  });
}

async function _linkPendingCredentialIfPossible(user) {
  if (!_pendingLinkCredential || !user) return null;
  const pending = _pendingLinkCredential;
  const userEmail = (user.email || "").toLowerCase();
  if (!userEmail || userEmail !== pending.email) return null;

  try {
    const linkResult = await linkWithCredential(user, pending.credential);
    _pendingLinkCredential = null;
    const linkedUser = linkResult?.user || user;
    try { await linkedUser.reload?.(); } catch { /* non-fatal; providerData may already be fresh */ }
    const linkedPhotoURL = (pending.providerId === FACEBOOK_PROVIDER_ID ? (_facebookPhotoURLFromCredential(linkResult) || _facebookPhotoURLFromProvider(linkedUser)) : _providerPhotoURL(linkedUser, pending.providerId))
      || await _fetchFacebookPhotoURL(pending.accessToken);
    if (linkedPhotoURL) _mergeCachedPhoto(linkedPhotoURL);
    return { providerId: pending.providerId, providerLabel: pending.providerLabel };
  } catch (err) {
    // Clear one-shot OAuth credentials after a failed link attempt; Firebase
    // credentials are short-lived and retrying the stale object is more
    // confusing than asking the user to start the provider flow again.
    _pendingLinkCredential = null;
    console.warn(`[auth] Could not link ${pending.providerLabel} credential:`, err?.code || err?.message || err);
    return { providerId: pending.providerId, providerLabel: pending.providerLabel, error: err?.code || "auth_error" };
  }
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

async function _fetchFacebookPhotoURL(accessToken) {
  if (!accessToken) return "";
  try {
    const res = await fetch(`https://graph.facebook.com/me/picture?type=large&redirect=false&access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) {
      console.warn(`[auth] Facebook photo fetch failed: Graph API returned HTTP ${res.status}.`);
      return "";
    }
    const data = await res.json();
    return data?.data?.url || "";
  } catch (err) {
    console.warn("[auth] Facebook photo fetch failed:", err?.message || err);
    return "";
  }
}

async function _fetchAndCacheFacebookPhoto(accessToken) {
  const photoURL = await _fetchFacebookPhotoURL(accessToken);
  if (photoURL) _mergeCachedPhoto(photoURL);
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
 *
 * A missing photo is silent by design, but every OTHER way this can come up
 * empty (no access token on the credential, Graph rejecting the token,
 * transient network failure) previously gave up just as silently — logging
 * a warning here isn't for the user, it's the only diagnostic trail available
 * the next time "the avatar never loaded" gets reported, since this whole
 * path can't be exercised by automated tests (needs a live Microsoft account
 * + interactive popup). A single retry covers transient network blips /
 * Graph 5xx responses; a bad token (401/403) or "no photo" (404) won't be
 * fixed by retrying, so those return immediately.
 * @param {string} accessToken - the Microsoft OAuth access token from this sign-in
 * @returns {Promise<void>}
 */
async function _fetchAndCacheMicrosoftPhoto(accessToken) {
  if (!accessToken) {
    // Per Firebase's docs this SHOULD always be populated after signInWithPopup
    // once a non-default scope (addScope("User.Read") above) is requested —
    // if this fires in practice, that assumption doesn't hold for this
    // sign-in and is worth knowing about precisely.
    console.warn("[auth] Microsoft photo skipped: no OAuth access token on this credential.");
    return;
  }
  for (let attempt = 1; attempt <= MS_PHOTO_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 404) return; // no photo set on this account — expected, silent
      if (!res.ok) {
        const isTransient = res.status >= 500;
        if (isTransient && attempt < MS_PHOTO_FETCH_MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, MS_PHOTO_FETCH_RETRY_DELAY_MS));
          continue;
        }
        console.warn(`[auth] Microsoft photo fetch failed: Graph API returned HTTP ${res.status}.`);
        return;
      }
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      _mergeCachedPhoto(dataUrl);
      return;
    } catch (err) {
      if (attempt < MS_PHOTO_FETCH_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, MS_PHOTO_FETCH_RETRY_DELAY_MS));
        continue;
      }
      console.warn("[auth] Microsoft photo fetch failed after retry:", err?.message || err);
    }
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
    const linkedProvider = await _linkPendingCredentialIfPossible(cred.user);
    return { completed: true, ..._resultFromCredential(cred), linkedProvider };
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
    const linkedProvider = await _linkPendingCredentialIfPossible(cred.user);
    return { success: true, ..._resultFromCredential(cred), linkedProvider };
  } catch (err) {
    return _authErrorPayload(err, "Google");
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
    result.linkedProvider = await _linkPendingCredentialIfPossible(cred.user);
    return result;
  } catch (err) {
    return _authErrorPayload(err, "Microsoft");
  }
}

/**
 * Sign in with a Facebook popup.
 * @returns {Promise<{success: boolean, error?: string, account?: {uid: string, email: string, displayName: string}, isNewUser?: boolean}>}
 */
export async function signInWithFacebook() {
  try {
    const cred = await signInWithPopup(_auth, _facebookProvider);
    const linkedProvider = await _linkPendingCredentialIfPossible(cred.user);
    const result = { success: true, ..._resultFromCredential(cred), linkedProvider };
    const profilePhotoURL = _facebookPhotoURLFromCredential(cred);
    if (profilePhotoURL && !result.account?.photoURL) {
      _mergeCachedPhoto(profilePhotoURL);
      result.account = { ...result.account, photoURL: profilePhotoURL };
    }
    const accessToken = FacebookAuthProvider.credentialFromResult(cred)?.accessToken;
    if (!result.account?.photoURL) _fetchAndCacheFacebookPhoto(accessToken);
    return result;
  } catch (err) {
    return await _facebookErrorPayload(err);
  }
}

/**
 * Sign in with an Apple popup.
 * @returns {Promise<{success: boolean, error?: string, account?: {uid: string, email: string, displayName: string}, isNewUser?: boolean}>}
 */
export async function signInWithApple() {
  try {
    const cred = await signInWithPopup(_auth, _appleProvider);
    const linkedProvider = await _linkPendingCredentialIfPossible(cred.user);
    return { success: true, ..._resultFromCredential(cred), linkedProvider };
  } catch (err) {
    return _authErrorPayload(err, "Apple");
  }
}

/**
 * Create a new account with a name, email address, and password — a
 * separate, additional sign-in method from the passwordless email magic
 * link above (sendMagicLink/completeMagicLinkSignIn); the two are
 * independent Firebase Auth mechanisms and this one is NOT a replacement
 * for that one.
 *
 * Unlike Google/Microsoft/Facebook/Apple (which all supply a displayName
 * from the provider for free), `createUserWithEmailAndPassword` alone never
 * sets one — every place this app reads `account.displayName` (e.g.
 * src/menu.js's `_buildSignedInHTML()`) would otherwise fall all the way
 * back to the email address for every password-created account. `name` is
 * REQUIRED here (trimmed; an empty/whitespace-only value is rejected before
 * any Firebase call is made) — callers must have already validated it's
 * non-blank client-side (see src/menu.js/src/reviews.js's own inline
 * "Name"/"Full name" field validation), but this function re-validates
 * anyway since it's the actual mechanism, not just the UI gate.
 *
 * Also fires a verification email at the new address — fire-and-forget
 * (never awaited, never fails/blocks the signup itself if sending it
 * throws; see deleteCurrentUserBestEffort()'s doc comment for this file's
 * established best-effort convention). The account is fully created and
 * signed in either way; every privileged write action elsewhere checks
 * isCurrentUserUnverifiedPassword() at the point of action instead of
 * gating signup itself.
 * @param {string} name - display name to set on the new account; rejected if empty/whitespace-only after trimming
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string, account?: {uid: string, email: string, displayName: string}, isNewUser?: boolean}>}
 */
export async function signUpWithEmailPassword(name, email, password) {
  const trimmedName = (name || "").trim();
  if (!trimmedName) return { success: false, error: "missing_name" };
  try {
    const cred = await createUserWithEmailAndPassword(_auth, email, password);
    try {
      await updateProfile(cred.user, { displayName: trimmedName });
    } catch (err) {
      // Non-fatal: the account still exists and is signed in either way —
      // see the belt-and-suspenders merge below for why this doesn't leave
      // the cached/returned account nameless even if this call fails.
      console.warn("[auth] Could not set display name:", err?.code || err?.message || err);
    }
    sendEmailVerification(cred.user).catch((err) => {
      console.warn("[auth] Could not send verification email:", err?.code || err?.message || err);
    });

    const result = _resultFromCredential(cred);
    // updateProfile() mutates cred.user's own displayName in place once it
    // resolves (confirmed against the Firebase JS SDK v9 modular Auth
    // implementation — the SDK applies a successful profile update to the
    // SAME in-memory User object, not just server-side), so
    // _resultFromCredential(cred) above — which reads cred.user.displayName
    // via _cacheAccount() — already reflects the new name in the normal
    // case. The merge below is kept anyway as a defensive guard for the one
    // case where it wouldn't: the updateProfile() call above failing (e.g.
    // a transient network error) — we already know the intended name for
    // certain at this point, so there's no reason to return/cache an
    // account with no display name just because that one secondary call
    // didn't land.
    if (result.account && !result.account.displayName) {
      result.account = { ...result.account, displayName: trimmedName };
      try { localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(result.account)); } catch { /* quota/blocked */ }
    }
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err?.code || "auth_error" };
  }
}

/**
 * Sign in to an existing email address + password account.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string, account?: {uid: string, email: string, displayName: string}, isNewUser?: boolean}>}
 */
export async function signInWithEmailPassword(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(_auth, email, password);
    const linkedProvider = await _linkPendingCredentialIfPossible(cred.user);
    return { success: true, ..._resultFromCredential(cred), linkedProvider };
  } catch (err) {
    return _authErrorPayload(err, "Email/password");
  }
}

/**
 * Resend the verification email to the currently signed-in user — the
 * "resend" affordance on every unverified-password blocking screen (someone
 * might not find the first email, or it might land in spam). No-ops with
 * `{success: false}` if nobody is signed in.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function resendVerificationEmail() {
  if (!_auth?.currentUser) return { success: false, error: "not_signed_in" };
  try {
    await sendEmailVerification(_auth.currentUser);
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.code || "auth_error" };
  }
}

/**
 * Whether the CURRENTLY signed-in user is a password-provider account with
 * an unverified email — the one case every privileged write action must
 * hard-block. Google/Microsoft/Facebook/Apple accounts are NEVER gated by
 * this regardless of their own emailVerified flag; only providerId
 * === "password" is ever checked. Always reloads the user first (Firebase's
 * onAuthStateChanged user object can go stale after the user verifies in
 * another tab — reload() re-fetches the account's real current state from
 * Firebase, so a user who just verified elsewhere isn't stuck blocked here
 * until a full page reload). Callers must call this fresh at the point a
 * privileged action is attempted; never cache its result.
 * @returns {Promise<boolean>}
 */
export async function isCurrentUserUnverifiedPassword() {
  const user = _auth?.currentUser;
  if (!user) return false;
  if (user.providerData?.[0]?.providerId !== PASSWORD_PROVIDER_ID) return false;
  try {
    await user.reload();
  } catch {
    // Offline/transient — fall back to whatever's already on the user
    // object rather than failing the check outright.
  }
  return !_auth.currentUser?.emailVerified;
}

/**
 * Send a password-reset email. Always resolves to a neutral outcome for
 * "no such account" — Firebase projects can have Email Enumeration
 * Protection enabled (Google's now-default anti-abuse setting for newer
 * projects), which makes this NOT throw `auth/user-not-found` even when no
 * account exists, specifically so attackers can't probe which emails are
 * registered by watching for that error. Coded defensively for that either
 * way: callers must show the same neutral "if an account exists, a reset
 * link is on its way" message regardless of this function's return value —
 * never reveal whether the email was actually registered.
 * @param {string} email
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendPasswordReset(email) {
  try {
    await sendPasswordResetEmail(_auth, email);
    return { success: true };
  } catch (err) {
    if (err?.code === "auth/user-not-found") return { success: true };
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

/**
 * Best-effort attempt to delete the underlying Firebase Auth user record —
 * used by src/profile.js's "Erase my data" flow as a bonus on top of the
 * Sheets-side row deletion, per this project's explicit design decision
 * (docs/PREFERENCE_LOG.md): this app has no Admin SDK infrastructure to
 * force-delete a Firebase Auth record server-side, and the client SDK's
 * deleteUser() commonly fails with `auth/requires-recent-login` for a
 * session that's been open a while (Firebase requires a *recent*
 * re-authentication for this specific operation, unlike sign-out). Silently
 * no-ops on ANY failure — the caller never awaits this for its own
 * correctness, never shows an error for it, and always signs out
 * unconditionally regardless of whether this actually succeeded. Must be
 * called BEFORE signOut() while auth.currentUser still exists — a
 * successful deleteUser() also signs the user out as a side effect, but a
 * failed one leaves them still signed in, which is exactly why the caller's
 * own explicit signOut() call afterward is unconditional rather than
 * skipped "because deleteUser probably already did it".
 * @returns {Promise<void>}
 */
export async function deleteCurrentUserBestEffort() {
  try {
    if (_auth?.currentUser) await _fbDeleteUser(_auth.currentUser);
  } catch {
    /* best-effort only — auth/requires-recent-login etc. are expected, not errors */
  }
}
