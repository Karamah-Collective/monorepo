import { _CRYPTO_KEY } from "./config.js";
import { map } from "./map-init.js";
import { EVT } from "./events.js";

// ─── Saved custom pins / home location — account-scoping model ─────────────────────
// Signed OUT (the default): hf_saved_pins/hf_home_location in localStorage are the
// single source of truth, exactly as before.
// Signed IN: this module is put into "cloud mode" by src/account-sync.js
// (enterCloudScope()/exitCloudScope() below), and every read/write here is
// redirected to an in-memory-only mirror (_cloudPins/_cloudHome) — the local
// device keys are never read or written while cloud mode is active, so they
// reappear untouched the instant exitCloudScope() runs on sign-out. Actual
// persistence to the signed-in account happens separately, via the existing
// EVT.SAVED_PIN_TOGGLED / "hf:home-updated" background-sync listeners in
// account-sync.js — this module only ever holds the current *display* state.
// See docs/PREFERENCE_LOG.md for the full account-scoping writeup.
const SAVED_PINS_KEY = "hf_saved_pins";
const HOME_LOCATION_KEY = "hf_home_location";
let _currentLocationState = { active: false, lat: null, lng: null, accuracy: null };
let _cloudScoped = false; // true only while a signed-in cloud session is active
let _cloudPins = [];
let _cloudHome = null;
let _visitorGeoPromise = null;
// True only for the (usually brief, but real — a GAS cold-start round-trip
// can be hundreds of ms) window between EVT.AUTH_CHANGED firing and
// enterCloudScope() actually landing. Without this gate, a pin/home mutation
// made in that window would write straight into hf_saved_pins/
// hf_home_location (still in local mode at that point) and then get silently
// discarded when the cloud state replaces it moments later — but the
// localStorage write already happened, reintroducing the exact cross-account
// local-cache bleed this whole account-scoping model exists to prevent. See
// src/account-sync.js and docs/PREFERENCE_LOG.md's adversarial-review
// follow-up.
let _pinsHomeSyncPending = false;
export function pinId(lat, lng) { return `${(+lat).toFixed(5)},${(+lng).toFixed(5)}`; }
function _loadPins() { try { return JSON.parse(localStorage.getItem(SAVED_PINS_KEY) || "[]"); } catch { return []; } }
function _writePins(pins) {
  if (_cloudScoped) _cloudPins = pins;
  else localStorage.setItem(SAVED_PINS_KEY, JSON.stringify(pins));
}
function _blockedBySyncPending() {
  if (!_pinsHomeSyncPending) return false;
  showToast("Still signing in…", "clock", "Try again in a moment");
  return true;
}
export function getSavedPins() { return _cloudScoped ? _cloudPins : _loadPins(); }
export function isPinSaved(lat, lng) { return getSavedPins().some(p => p.id === pinId(lat, lng)); }
export function toggleSavedPin(lat, lng, name) {
  if (_blockedBySyncPending()) return isPinSaved(lat, lng);
  const id = pinId(lat, lng);
  let pins = getSavedPins();
  const exists = pins.some(p => p.id === id);
  pins = exists ? pins.filter(p => p.id !== id) : [...pins, { id, lat: +lat, lng: +lng, name: name || id }];
  _writePins(pins);
  const saved = !exists; // new saved state (true = now saved)
  _emitWindowEvent(EVT.SAVED_PIN_TOGGLED, { lat: +lat, lng: +lng, name: name || id, saved });
  return saved;
}
export function removeSavedPin(id) {
  if (_blockedBySyncPending()) return;
  const pins = getSavedPins();
  const pin = pins.find((p) => p.id === id);
  _writePins(pins.filter((p) => p.id !== id));
  // Fire the same toggle event toggleSavedPin() does — this call site (the
  // Saved-places list's unsave button) previously bypassed it entirely, so a
  // removal made here never reached cross-device cloud sync at all.
  if (pin) _emitWindowEvent(EVT.SAVED_PIN_TOGGLED, { lat: pin.lat, lng: pin.lng, name: pin.name, saved: false });
}
/**
 * Set (not toggle) a saved-pin's state directly, without firing
 * EVT.SAVED_PIN_TOGGLED — used by src/account-sync.js only, to roll a pin's
 * optimistic local state back if its background cloud save/unsave request
 * actually fails server-side (the toggle that got rolled back already fired
 * the event once; re-firing it here would re-trigger another sync attempt).
 * @param {number} lat
 * @param {number} lng
 * @param {string} name
 * @param {boolean} saved
 */
export function setSavedPinState(lat, lng, name, saved) {
  const id = pinId(lat, lng);
  let pins = getSavedPins();
  const exists = pins.some((p) => p.id === id);
  if (saved === exists) return;
  pins = saved ? [...pins, { id, lat: +lat, lng: +lng, name: name || id }] : pins.filter((p) => p.id !== id);
  _writePins(pins);
}

function _emitWindowEvent(name, detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function _normalizeStoredLocation(raw) {
  if (!raw) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address = String(raw.address || "").trim();
  const name = String(raw.name || address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`).trim();
  return {
    id: raw.id || pinId(lat, lng),
    lat,
    lng,
    name,
    address,
  };
}

export function getHomeLocation() {
  if (_cloudScoped) return _cloudHome;
  try {
    return _normalizeStoredLocation(JSON.parse(localStorage.getItem(HOME_LOCATION_KEY) || "null"));
  } catch {
    return null;
  }
}

export function hasHomeLocation() {
  return !!getHomeLocation();
}

export function isSavedDataCloudScoped() {
  return _cloudScoped;
}

export function isHomeLocation(lat, lng) {
  const home = getHomeLocation();
  return !!home && home.id === pinId(lat, lng);
}

export function setHomeLocation({ lat, lng, name, address } = {}) {
  if (_blockedBySyncPending()) return getHomeLocation();
  const home = _normalizeStoredLocation({ lat, lng, name, address });
  if (!home) return null;
  if (_cloudScoped) _cloudHome = home;
  else localStorage.setItem(HOME_LOCATION_KEY, JSON.stringify(home));
  _emitWindowEvent("hf:home-updated", { home });
  return home;
}

export function clearHomeLocation() {
  if (_blockedBySyncPending()) return;
  if (_cloudScoped) _cloudHome = null;
  else localStorage.removeItem(HOME_LOCATION_KEY);
  _emitWindowEvent("hf:home-updated", { home: null });
}

/**
 * Block/unblock saved-pin and home-location mutations while a sign-in's
 * cloud-state resolution is still in flight — called by src/account-sync.js
 * only. See `_pinsHomeSyncPending`'s own comment above for the exact race
 * this closes.
 * @param {boolean} pending
 * @returns {void}
 */
export function setPinsHomeSyncPending(pending) {
  _pinsHomeSyncPending = pending;
}

/**
 * Enter cloud-scoped mode for saved pins + home location — called once by
 * src/account-sync.js after a sign-in resolves to a cloud state (either
 * fetched fresh from the server, or from a just-accepted local import).
 * Local device storage (hf_saved_pins/hf_home_location) is never read or
 * written again until exitCloudScope() runs on sign-out.
 * @param {Array<{lat:number,lng:number,name:string}>} pins
 * @param {{lat:number,lng:number,name:string}|null} home
 * @returns {void}
 */
export function enterCloudScope(pins, home) {
  _cloudScoped = true;
  _cloudPins = Array.isArray(pins) ? pins.map((p) => ({ id: pinId(p.lat, p.lng), lat: +p.lat, lng: +p.lng, name: p.name })) : [];
  _cloudHome = home ? _normalizeStoredLocation(home) : null;
  _emitWindowEvent("hf:home-updated", { home: _cloudHome });
}

/**
 * Exit cloud-scoped mode (sign-out) — reverts saved pins / home location to
 * whatever is in localStorage, untouched throughout the whole cloud session.
 * @returns {void}
 */
export function exitCloudScope() {
  _cloudScoped = false;
  _cloudPins = [];
  _cloudHome = null;
  _emitWindowEvent("hf:home-updated", { home: getHomeLocation() });
}

export function getCurrentLocationState() {
  return { ..._currentLocationState };
}

export function setCurrentLocationState({ lat, lng, accuracy, active = true } = {}) {
  const accuracyNum = Number(accuracy);
  const next = {
    active: !!active && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)),
    lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
    lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
    accuracy: Number.isFinite(accuracyNum) ? accuracyNum : null,
  };
  _currentLocationState = next;
  _emitWindowEvent("hf:current-location-updated", { location: { ...next } });
  return { ...next };
}

export function clearCurrentLocationState() {
  return setCurrentLocationState({ active: false, lat: null, lng: null });
}
// ─────────────────────────────────────────────────────────────

// --- Reduced motion (Menu sheet → Preferences → "Reduce motion") ---
//
// Single source of truth for "should this app dampen animations right now?",
// consulted by both CSS (the html.reduce-motion selector in design-tokens.css,
// which replaced a bare `@media (prefers-reduced-motion: reduce)` block) and
// any JS-level motion checks (animateElementHeight() below, reviews.js's
// panel-close animation) — not two competing mechanisms. An explicit in-app
// override (this preference) takes precedence over the OS-level
// `prefers-reduced-motion` media feature; absent an override, the OS setting
// is followed live (including if the user changes it while the app is open).
const REDUCE_MOTION_KEY = "hf_reduce_motion"; // "true" | "false" | absent = follow OS
const REDUCE_MOTION_CLASS = "reduce-motion";
const _reduceMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

/**
 * The user's explicit reduce-motion override, if any has been set.
 * @returns {boolean | null} true/false if explicitly set via the Preferences
 *   toggle, or null if there's no override (following the OS setting).
 */
export function getReduceMotionOverride() {
  const stored = localStorage.getItem(REDUCE_MOTION_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return null;
}

/**
 * The effective reduce-motion state right now: the explicit override if one
 * is set, otherwise the OS-level `prefers-reduced-motion` media feature.
 * @returns {boolean}
 */
export function isReduceMotionActive() {
  const override = getReduceMotionOverride();
  return override === null ? _reduceMotionMQ.matches : override;
}

function _applyReduceMotionClass() {
  const active = isReduceMotionActive();
  document.documentElement.classList.toggle(REDUCE_MOTION_CLASS, active);
  document.body.classList.toggle(REDUCE_MOTION_CLASS, active);
}

/**
 * Set (or clear) the explicit reduce-motion override and re-apply the class
 * immediately. Called by the Menu sheet's Preferences toggle.
 * @param {boolean | null} value true/false to force a state, or null to clear
 *   the override and go back to following the OS setting.
 * @returns {void}
 */
export function setReduceMotionOverride(value) {
  if (value === null) localStorage.removeItem(REDUCE_MOTION_KEY);
  else localStorage.setItem(REDUCE_MOTION_KEY, value ? "true" : "false");
  _applyReduceMotionClass();
}

// Apply as early as possible (mirrors map-controls.js's restoreSavedTheme()
// dark-mode IIFE) so animations are already dampened before anything else
// on the page starts animating in.
_applyReduceMotionClass();
// If there's no explicit override, keep following live OS-setting changes
// (e.g. the user flips their OS's reduce-motion toggle while the app is open).
_reduceMotionMQ.addEventListener("change", () => {
  if (getReduceMotionOverride() === null) _applyReduceMotionClass();
});
// ─────────────────────────────────────────────────────────────

// --- Device ID (stable per browser profile, shared across modules) ---

const DEVICE_ID_KEY = "hf_device_id";

/**
 * Get or generate a stable device identifier (UUID stored in localStorage).
 * @returns {string}
 */
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// --- HTML escaping ---

export function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

export function escA(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// --- Clipboard ---

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText =
      "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// --- Toast notifications ---

// ─── Fade-out helpers for MapLibre popups and markers ───────────────────────
export function fadeAndRemovePopup(popup) {
  if (!popup) return;
  const el = popup.getElement();
  if (!el) { try { popup.remove(); } catch (_) {} return; }
  el.classList.add("popup-fading-out");
  setTimeout(() => { try { popup.remove(); } catch (_) {} }, 150);
}
export function fadeAndRemoveMarker(marker) {
  if (!marker) return;
  const el = marker.getElement();
  if (!el) { marker.remove(); return; }
  el.classList.add("marker-fading-out");
  setTimeout(() => marker.remove(), 150);
}

const _TOAST_SVG = {
  check: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  clock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  error: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  loc: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 2.61 1.43 4.88 3.54 6.96L12 22l3.46-6.04C17.57 13.88 19 11.61 19 9c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/><line x1="3" y1="3" x2="21" y2="21"/></svg>`,
  traffic: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12"/><path d="M8 3v18"/><path d="M16 3v18"/><circle cx="12" cy="8" r="2"/><circle cx="12" cy="14" r="2"/><path d="M5 21h14"/></svg>`,
  info: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="12" y1="7" x2="12.01" y2="7"/></svg>`,
  home: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-4a3 3 0 0 1 6 0v4"/></svg>`,
};
const _TOAST_ICON_CLASS = {
  check: "snack-icon--success",
  clock: "snack-icon--clock",
  error: "snack-icon--error",
  loc:   "snack-icon--error",
  traffic: "snack-icon--info",
  info:  "snack-icon--info",
  home:  "snack-icon--info",
};

/* ── Persistent loading toast (stays until hideLoadingToast is called) ──── */
export function showLoadingToast(label, sub = null) {
  if (document.getElementById("loading-toast")) return;
  const slot = document.createElement("div");
  slot.className = "toast-slot";
  const t = document.createElement("div");
  t.id = "loading-toast";
  t.className = "share-toast snack loading-toast";
  t.innerHTML = `<span class="snack-icon snack-icon--clock"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></span><span class="snack-body"><span class="snack-label">${esc(label)}</span>${sub ? `<span class="snack-sub">${esc(sub)}</span>` : ""}</span>`;
  slot.appendChild(t);
  _getToastStack().appendChild(slot);
  void slot.offsetHeight; // commit grid-template-rows:0fr before transition
  slot.classList.add("toast-slot-show");
  t.classList.add("share-toast-show");
}
export function hideLoadingToast() {
  const t = document.getElementById("loading-toast");
  if (!t) return;
  const slot = t.parentElement;
  t.classList.remove("share-toast-show");
  slot.classList.remove("toast-slot-show");
  slot.classList.add("toast-slot-collapsing");
  setTimeout(() => slot.remove(), 300);
}

/**
 * Build a personalized "Welcome, X" / "Welcome back, X" greeting for a
 * just-completed sign-in — shared by every sign-in entry point (Google
 * popup, Microsoft popup, magic link) in src/menu.js and src/reviews.js so
 * the wording/fallback logic lives in exactly one place.
 * @param {{displayName?: string, email?: string}|null} account
 * @param {boolean} isNewUser - from Firebase's getAdditionalUserInfo(cred)
 * @returns {string}
 */
export function buildWelcomeGreeting(account, isNewUser) {
  const greeting = isNewUser ? "Welcome" : "Welcome back";
  // Magic-link sign-ins have no displayName at all — fall back to the
  // email's local-part rather than a name-less generic greeting, since a
  // first name is almost always derivable from either source.
  const source = account?.displayName?.trim() || account?.email?.split("@")[0] || "";
  const firstName = source.split(/\s+/)[0];
  return firstName ? `${greeting}, ${firstName}!` : `${greeting}!`;
}

// How long showWelcomeGreeting() waits for src/account-sync.js's
// EVT.ACCOUNT_DATA_RESOLVED before giving up on a possible correction —
// bounds the one-shot listener's lifetime so it can never linger to
// misfire against a later, unrelated sign-in in the same page session (see
// showWelcomeGreeting()'s own comment for why a listener could otherwise
// outlive the sign-in it belongs to).
const WELCOME_CORRECTION_TIMEOUT_MS = 15000;

/**
 * Show a "Welcome"/"Welcome back" toast for a just-completed sign-in, then
 * silently correct it to "Welcome" if a later EVT.ACCOUNT_DATA_RESOLVED
 * (src/account-sync.js's post-sign-in check) reports the account actually
 * has no prior data. This is the "erase my data, then sign back in with the
 * same credentials" edge case: Firebase's own `isNewUser` flag says
 * "returning" (the Firebase Auth record still exists — erasure never
 * touches it, see docs/PREFERENCE_LOG.md) even though our own system has
 * nothing left for this account. Firebase's flag is trusted immediately for
 * the (vast majority) common case — this never delays or withholds the
 * first toast, it only ever adds a second, corrective one, and only when
 * the two signals actually disagree.
 *
 * The correction is scoped to THIS account (`account.uid`, matched against
 * EVT.ACCOUNT_DATA_RESOLVED's own `detail.uid`) — not just "whichever
 * ACCOUNT_DATA_RESOLVED fires next". Without this, a listener registered
 * for one sign-in attempt (e.g. Alice's) can still be alive — its own
 * account's resolution never having arrived, e.g. because Alice signed out
 * before her own `sync-saved` round-trip finished — when a DIFFERENT
 * account's sign-in (Bob's) resolves shortly after; the stale listener would
 * otherwise catch Bob's event and show a corrective toast built from
 * Alice's closure data to Bob. Found by adversarial review (see
 * docs/PREFERENCE_LOG.md) — an event whose `uid` doesn't match is ignored
 * (kept waiting, not removed), so only this exact sign-in's own resolution
 * can ever complete or cancel this listener.
 *
 * Shared by every sign-in entry point (src/menu.js, src/reviews.js) so this
 * correction logic lives in exactly one place rather than being duplicated
 * per caller.
 * @param {{uid?: string, displayName?: string, email?: string}|null} account
 * @param {boolean} isNewUser - from Firebase's getAdditionalUserInfo(cred)
 * @returns {void}
 */
export function showWelcomeGreeting(account, isNewUser) {
  showToast(buildWelcomeGreeting(account, isNewUser), "check");
  if (isNewUser) return; // "Welcome" is already correct regardless of prior-data signal

  let done = false;
  const timeoutId = setTimeout(() => {
    if (done) return;
    done = true;
    window.removeEventListener(EVT.ACCOUNT_DATA_RESOLVED, onResolved);
  }, WELCOME_CORRECTION_TIMEOUT_MS);

  function onResolved(e) {
    if (done) return;
    // Not this sign-in attempt's own resolution (a different account's
    // _handleSignIn() resolved instead) — ignore and keep waiting for ours;
    // never treat "the next event to fire" as automatically ours.
    if (e.detail?.uid !== account?.uid) return;
    done = true;
    clearTimeout(timeoutId);
    window.removeEventListener(EVT.ACCOUNT_DATA_RESOLVED, onResolved);
    if (e.detail?.hasPriorData === false) {
      showToast(buildWelcomeGreeting(account, true), "check");
    }
  }
  window.addEventListener(EVT.ACCOUNT_DATA_RESOLVED, onResolved);
}

/**
 * Map a Firebase Auth error code from the email + password sign-in/sign-up
 * flow (src/auth.js's signInWithEmailPassword/signUpWithEmailPassword) to a
 * clear, user-facing message — shared by src/menu.js and src/reviews.js so
 * both password panels report identical wording for the same failure rather
 * than drifting apart across two copy-pasted switch statements.
 * `auth/invalid-credential` is the modern, consolidated code several Firebase
 * SDK versions now return in place of both `auth/wrong-password` AND
 * `auth/user-not-found` for a sign-in attempt (deliberately vague for
 * enumeration-safety) — worded generically enough to cover either underlying
 * cause without confidently mis-telling the user which one it was.
 * @param {string} code - err?.code from the failed Firebase Auth call
 * @param {"signin"|"signup"} mode - which action was attempted, since the
 *   same code (e.g. auth/invalid-credential) reads differently for each
 * @returns {string}
 */
export function emailPasswordErrorMessage(code, mode) {
  switch (code) {
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/email-already-in-use":
      return "An account already exists for this email. Try signing in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-not-found":
      return "No account found for this email. Try creating one instead.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return mode === "signup"
        ? "Could not create that account. Please try again."
        : "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "missing_name":
      // src/auth.js's signUpWithEmailPassword() re-validates this itself —
      // this code should be unreachable in practice since both callers
      // (src/menu.js/src/reviews.js) already block submission client-side
      // when the "Full name" field is blank, but it's handled here too so a
      // future call site that skips that check still gets a clear message
      // instead of falling through to the generic default below.
      return "Please enter your name.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function isPopupCancelError(code) {
  return code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
}

export function oauthSignInErrorToast(result, providerLabel = "provider") {
  const code = result?.error || "auth_error";
  if (isPopupCancelError(code)) return null;

  if (code === "auth/account-exists-with-different-credential") {
    const methods = Array.isArray(result?.existingProviderLabels) && result.existingProviderLabels.length
      ? result.existingProviderLabels.join(" or ")
      : "your existing sign-in method";
    return {
      title: "Use existing login",
      sub: `Already on ${methods}. Sign in there once to connect Facebook.`,
      inline: "This email already has an account. Use the existing login first.",
    };
  }

  switch (code) {
    case "auth/operation-not-allowed":
      return {
        title: `${providerLabel} not enabled`,
        sub: "Enable it in Firebase Authentication.",
        inline: `${providerLabel} login is not enabled yet.`,
      };
    case "auth/unauthorized-domain":
      return {
        title: "Login domain not allowed",
        sub: "Add this domain in Firebase Authentication.",
        inline: "This domain is not authorized for login.",
      };
    case "auth/invalid-credential":
    case "auth/internal-error":
      return {
        title: `${providerLabel} login failed`,
        sub: "Check App ID, secret, and redirect URI.",
        inline: `${providerLabel} login failed. Check the provider setup.`,
      };
    case "auth/too-many-requests":
      return {
        title: "Too many login attempts",
        sub: "Wait a moment, then try again.",
        inline: "Too many attempts. Please try again shortly.",
      };
    default:
      return {
        title: `${providerLabel} login failed`,
        sub: code,
        inline: `${providerLabel} login failed. Please try again.`,
      };
  }
}

export function showLinkedProviderToast(linkedProvider) {
  if (!linkedProvider) return;
  if (linkedProvider.error) {
    showToast(`${linkedProvider.providerLabel} not connected`, "error", "Try that login again.");
  } else {
    showToast(`${linkedProvider.providerLabel} connected`, "check", "Use it next time.");
  }
}

function _getToastStack() {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

export function showToast(label, icon = "check", sub = null) {
  const stack = _getToastStack();
  const slot = document.createElement("div");
  slot.className = "toast-slot";
  const t = document.createElement("div");
  t.className = "share-toast snack";
  const svg = _TOAST_SVG[icon] || "";
  const iconClass = _TOAST_ICON_CLASS[icon] || "snack-icon--success";
  const subHtml = sub ? `<span class="snack-sub">${esc(sub)}</span>` : "";
  t.innerHTML = `${svg ? `<span class="snack-icon ${iconClass}">${svg}</span>` : ""}<span class="snack-body"><span class="snack-label">${esc(label)}</span>${subHtml}</span>`;
  slot.appendChild(t);
  stack.appendChild(slot);
  void slot.offsetHeight; // commit grid-template-rows:0fr before transition
  slot.classList.add("toast-slot-show");
  t.classList.add("share-toast-show");
  setTimeout(() => {
    t.classList.remove("share-toast-show");
    slot.classList.remove("toast-slot-show");
    slot.classList.add("toast-slot-collapsing");
    setTimeout(() => slot.remove(), 300);
  }, 2400);
}

let _activeConfirmCleanup = null; // the open dialog's own finish() fn, if any

/**
 * Show a reusable Yes/No confirm dialog for a destructive or state-changing
 * action — the one confirm-before-action component in this app (replaces
 * the earlier press-twice-to-confirm pattern used for review delete; see
 * docs/DESIGN_SYSTEM.md). Built and torn down entirely in JS, matching
 * showToast()'s own create-on-demand convention, rather than a static
 * always-in-the-DOM overlay in index.html.
 * @param {Object} opts
 * @param {string} opts.title - short question, e.g. "Delete this review?"
 * @param {string} [opts.message=""] - supporting detail line
 * @param {string} [opts.confirmLabel="Confirm"]
 * @param {string} [opts.cancelLabel="Cancel"]
 * @param {"danger"|"default"} [opts.variant="default"] - "danger" renders the
 *   confirm button as .btn-danger-filled and the icon circle red-tinted, for
 *   a hard-destructive action with no easy undo (matches .btn-danger-filled's
 *   own definition); "default" uses .btn-primary / accent-tinted for a
 *   state-changing but non-destructive action (e.g. sign-out).
 * @param {string} [opts.icon=""] - inline SVG markup for the icon circle
 * @returns {Promise<boolean>} true if confirmed, false if cancelled/dismissed
 */
export function showConfirmDialog({
  title,
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  icon = "",
} = {}) {
  // A second call while one is already open cancels the first rather than
  // stacking dialogs — this app only ever needs one confirmation in flight.
  if (_activeConfirmCleanup) _activeConfirmCleanup(false);

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay hide";
    const iconClass = variant === "danger" ? "confirm-icon confirm-icon--danger" : "confirm-icon";
    const confirmBtnClass = variant === "danger" ? "btn-danger-filled" : "btn-primary";
    overlay.innerHTML = `<div class="confirm-card">
      ${icon ? `<span class="${iconClass}">${icon}</span>` : ""}
      <h3 class="confirm-title">${esc(title || "Are you sure?")}</h3>
      ${message ? `<p class="confirm-desc">${esc(message)}</p>` : ""}
      <div class="confirm-actions">
        <button type="button" class="btn-secondary confirm-cancel">${esc(cancelLabel)}</button>
        <button type="button" class="${confirmBtnClass} confirm-ok">${esc(confirmLabel)}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    void overlay.offsetHeight; // commit .hide's start state before animating out of it

    function finish(result) {
      overlay.classList.add("hide");
      document.removeEventListener("keydown", onKeydown);
      if (_activeConfirmCleanup === finish) _activeConfirmCleanup = null;
      setTimeout(() => overlay.remove(), 250);
      resolve(result);
    }
    function onKeydown(e) {
      if (e.key === "Escape") finish(false);
    }

    overlay.querySelector(".confirm-cancel").addEventListener("click", () => finish(false));
    overlay.querySelector(".confirm-ok").addEventListener("click", () => finish(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(false);
    });
    document.addEventListener("keydown", onKeydown);

    _activeConfirmCleanup = finish;
    overlay.classList.remove("hide");
  });
}

// --- Early-development notice (shown to everyone, every visit) ---

export function showEarlyDevNotice() {
  if (document.getElementById("dev-notice")) return;
  const slot = document.createElement("div");
  slot.className = "toast-slot";
  const el = document.createElement("div");
  el.id = "dev-notice";
  el.className = "snack";
  el.innerHTML = `
    <span class="snack-icon snack-icon--info">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 20h20L12 4 2 20z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    </span>
    <span class="snack-body">
      <span class="snack-label">Early Development 🚧</span>
      <span class="snack-sub">Halal Finder is still in its early stages. Some features may not work as expected, and places are being added gradually by the community. JazakAllah Khair for your patience &mdash; we appreciate you being here!</span>
    </span>
    <button class="sheet-x btn-roundel" aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;
  el.querySelector(".sheet-x").addEventListener("click", () => {
    el.classList.remove("dev-notice-show");
    slot.classList.remove("toast-slot-show");
    slot.classList.add("toast-slot-collapsing");
    setTimeout(() => slot.remove(), 300);
  });
  slot.appendChild(el);
  _getToastStack().appendChild(slot);
  void slot.offsetHeight; // commit grid-template-rows:0fr before transition
  slot.classList.add("toast-slot-show");
  el.classList.add("dev-notice-show");
}

// --- Geo notice (shown to non-Finland visitors) ---

export function showGeoNotice() {
  if (document.getElementById("geo-notice")) return;
  const slot = document.createElement("div");
  slot.className = "toast-slot";
  const el = document.createElement("div");
  el.id = "geo-notice";
  el.className = "snack";
  el.innerHTML = `
    <span class="snack-icon snack-icon--info">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </span>
    <span class="snack-body">
      <span class="snack-label">Assalamu Alaikum, traveller! 🌍</span>
      <span class="snack-sub">This app is built for Finland — places, prayer times, and transit are all Finland-based. Feel free to look around!</span>
    </span>
    <button class="sheet-x btn-roundel" aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;
  el.querySelector(".sheet-x").addEventListener("click", () => {
    el.classList.remove("geo-notice-show");
    slot.classList.remove("toast-slot-show");
    slot.classList.add("toast-slot-collapsing");
    setTimeout(() => slot.remove(), 300);
  });
  slot.appendChild(el);
  _getToastStack().appendChild(slot);
  void slot.offsetHeight; // commit grid-template-rows:0fr before transition
  slot.classList.add("toast-slot-show");
  el.classList.add("geo-notice-show");
}

export async function checkGeoNotice() {
  const { country } = await getVisitorGeo();
  if (country && country !== "FI" && country !== "XX") showGeoNotice();
}

/**
 * Fetches coarse Cloudflare IP geolocation for this visitor.
 * @returns {Promise<object>} Visitor country/city metadata, or an empty object.
 */
export async function getVisitorGeo() {
  if (_visitorGeoPromise) return _visitorGeoPromise;
  _visitorGeoPromise = fetch("/api/geo", { signal: AbortSignal.timeout(4000) })
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}));
  return _visitorGeoPromise;
}
// --- Badge achievement notice (shown when a signed-in user crosses a new
// badge tier/level — see account-profile.js's computeBadges()/
// diffBadgeLevelUps(), checked on app load by account-sync.js's
// _checkBadgeLevelUps()) ---

// One glyph per badge category (account-profile.js's BADGE_DEFS `glyph` key)
// — Reviewer/Contributor/Explorer/Veteran read as star/pin-with-plus/heart/
// medal, matching the names those categories were designed under. All 4
// share the same 24x24/stroke-2/round-cap convention as every other icon in
// this file so they sit consistently inside .snack-icon regardless of which
// one renders.
const _BADGE_GLYPH_SVG = {
  star: `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`,
  plusPin: `<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="9" y1="9" x2="15" y2="9"/>`,
  heart: `<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>`,
  medal: `<circle cx="12" cy="8" r="6"/><polyline points="8.21 13.89 7 22 12 19 17 22 15.79 13.88"/>`,
};

/**
 * Show a big, explicitly-closable "you earned a new badge" notification —
 * same .snack shape as showGeoNotice()/showEarlyDevNotice() (an icon, a
 * label, a sub-line, and a close button), deliberately NOT auto-dismissing
 * like showToast()'s small 2.4s toasts, since this is a genuine
 * achievement worth letting the user actually read and dismiss on their own
 * terms. Unlike those two, this is NOT a page-wide singleton (no fixed id,
 * dedup-by-id guard) — up to 4 categories can plausibly cross a tier between
 * two checks (e.g. after being offline a while), and each should get its own
 * dismissable notice, stacked in the toast stack like showToast()'s own
 * multi-instance toasts.
 *
 * The icon shape identifies WHICH category leveled up (`glyph`, from
 * account-profile.js's BADGE_DEFS); its color identifies WHICH level (I/II/
 * III) via the same --badge-lvl-1/2/3 tokens the identity-card pill already
 * uses — deliberately no separate per-TIER icon treatment on top of that
 * (Bronze/Silver/Gold/etc. is already spelled out in `tierName`), matching
 * how the pill itself scoped down to level-color + text with no per-tier
 * icon either.
 * @param {{categoryLabel: string, tierName: string, levelRoman: string, glyph?: string, level?: number}} badge
 * @returns {void}
 */
export function showBadgeNotice({ categoryLabel, tierName, levelRoman, glyph = "star", level = 1 }) {
  const slot = document.createElement("div");
  slot.className = "toast-slot";
  const el = document.createElement("div");
  el.className = "snack badge-notice";
  const glyphSVG = _BADGE_GLYPH_SVG[glyph] || _BADGE_GLYPH_SVG.star;
  const levelColorVar = `var(--badge-lvl-${level >= 1 && level <= 3 ? level : 1})`;
  el.innerHTML = `
    <span class="snack-icon" style="background:color-mix(in srgb, ${levelColorVar} 14%, transparent);color:${levelColorVar}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyphSVG}</svg>
    </span>
    <span class="snack-body">
      <span class="snack-label">New badge earned! 🎉</span>
      <span class="snack-sub">${esc(tierName)} ${esc(levelRoman)} — ${esc(categoryLabel)}</span>
    </span>
    <button class="sheet-x btn-roundel" aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;
  el.querySelector(".sheet-x").addEventListener("click", () => {
    el.classList.remove("badge-notice-show");
    slot.classList.remove("toast-slot-show");
    slot.classList.add("toast-slot-collapsing");
    setTimeout(() => slot.remove(), 300);
  });
  slot.appendChild(el);
  _getToastStack().appendChild(slot);
  void slot.offsetHeight; // commit grid-template-rows:0fr before transition
  slot.classList.add("toast-slot-show");
  el.classList.add("badge-notice-show");
}

// --- Lazy reCAPTCHA loader ---

let _recaptchaPromise = null;
export function loadRecaptcha(siteKey) {
  if (_recaptchaPromise) return _recaptchaPromise;
  if (typeof grecaptcha !== "undefined") {
    _recaptchaPromise = Promise.resolve();
    return _recaptchaPromise;
  }
  _recaptchaPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    s.async = true;
    s.addEventListener("load", resolve);
    document.head.appendChild(s);
  });
  return _recaptchaPromise;
}

// --- Offline / online status banner ---

const _WIFI_OFF_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;

let _offlineBannerEl = null;
let _offlineBannerSlot = null;
export function showOfflineBanner() {
  if (_offlineBannerEl) return;
  _offlineBannerSlot = document.createElement("div");
  _offlineBannerSlot.className = "toast-slot";
  _offlineBannerEl = document.createElement("div");
  _offlineBannerEl.id = "offline-banner";
  _offlineBannerEl.className = "share-toast snack loading-toast";
  _offlineBannerEl.innerHTML = `<span class="snack-icon snack-icon--warn">${_WIFI_OFF_SVG}</span><span class="snack-body"><span class="snack-label">You're offline</span><span class="snack-sub">Showing cached data</span></span>`;
  _offlineBannerSlot.appendChild(_offlineBannerEl);
  _getToastStack().appendChild(_offlineBannerSlot);
  void _offlineBannerSlot.offsetHeight; // commit grid-template-rows:0fr before transition
  _offlineBannerSlot.classList.add("toast-slot-show");
  _offlineBannerEl.classList.add("share-toast-show");
}
export function hideOfflineBanner() {
  if (!_offlineBannerEl) return;
  _offlineBannerEl.classList.remove("share-toast-show");
  _offlineBannerSlot.classList.remove("toast-slot-show");
  _offlineBannerSlot.classList.add("toast-slot-collapsing");
  setTimeout(() => {
    _offlineBannerSlot?.remove();
    _offlineBannerEl = null;
    _offlineBannerSlot = null;
  }, 300);
}

// --- Segmented-control sliding pill ---
//
// Creates an absolutely-positioned highlight that glides to the active button.
// Returns `moveTo(btn)` to reposition the pill.

export function initSegPill(container) {
  const pill = document.createElement("span");
  pill.className = "seg-pill";
  container.appendChild(pill);
  let placed = false;                              // true once pill has a real position

  function moveTo(btn) {
    if (!btn) return;
    // If container is hidden (display:none), dimensions are 0 — skip
    if (!btn.offsetWidth) return;
    if (!placed) {
      // First visible positioning — no transition
      pill.style.transition = "none";
      pill.style.left  = btn.offsetLeft + "px";
      pill.style.width = btn.offsetWidth + "px";
      void pill.offsetHeight;
      pill.style.transition = "";
      placed = true;
    } else {
      pill.style.left  = btn.offsetLeft + "px";
      pill.style.width = btn.offsetWidth + "px";
    }
  }

  // Try initial placement (works if container is visible)
  const first = container.querySelector(".active");
  if (first) requestAnimationFrame(() => moveTo(first));

  return moveTo;
}

// --- Sheet drag-to-resize/dismiss (mobile snap system) ---
//
// Algorithm per content-to-viewport ratio:
//
//   content < 50 vh  → opens at content height, always snaps back (unless
//                      pulled below 5 % → dismiss)
//
//   50–75 vh         → opens at *content* height (no wasted whitespace).
//                      Snaps to: dismiss | 50 % | content
//
//   ≥ 75 vh          → opens at 75 % (leave room for the map).
//                      Snaps to: dismiss | 50 % | 75 % | full (100 %)
//
// During drag the sheet follows the finger with zero resistance.
// On release it gracefully animates to the nearest snap point.

const HEIGHT_ANIMATION_EPSILON_PX = 2;
const HEIGHT_ANIMATION_FALLBACK_MS = 500;

/**
 * Smoothly animate an element's height while its DOM content changes.
 * @param {HTMLElement | null | undefined} element
 * @param {() => void} changeFn
 * @param {{ skip?: boolean, measureHeight?: () => number, keepExplicitHeight?: boolean, onSettled?: () => void }} [options]
 *   measureHeight: supply this when the element's own natural `height: auto`
 *   measurement wouldn't reflect the real target (e.g. src/menu.js's
 *   `#mp-scroll`, whose sibling-stretched auto-height would still equal the
 *   OTHER, inactive pane's height — see `_syncPaneHeight()`) — bypasses the
 *   default "set height:auto, re-measure offsetHeight" step entirely in
 *   favor of calling this instead, run right after changeFn().
 *   keepExplicitHeight: by default, once the transition finishes (or the
 *   old/new heights are within epsilon of each other), the inline `height`
 *   is removed so the element reverts to its natural CSS sizing. Pass true
 *   to instead leave the inline px height permanently pinned at the target
 *   value — needed when something ELSE (e.g. a sibling's `height: 100%`)
 *   depends on this element's height staying an explicit, JS-owned number
 *   rather than snapping back to `auto`.
 *   onSettled: called exactly once the height change is fully done and
 *   visually settled — synchronously, right here, for the skip/reduce-motion
 *   and no-real-change (epsilon) cases (nothing is animating, so "settled" is
 *   immediate); otherwise once the real CSS transition's own `transitionend`
 *   fires (or the fallback timer, if it never does). Added for
 *   src/reviews.js's `_animateReviewCardHeight()`, which needs to restore a
 *   temporarily-suspended `overflow` value once — and only once — the tween
 *   genuinely finishes (see its own doc comment for why).
 * @returns {void}
 */
export function animateElementHeight(element, changeFn, { skip = false, measureHeight, keepExplicitHeight = false, onSettled } = {}) {
  if (!element || skip || isReduceMotionActive() || !element.isConnected) {
    changeFn();
    if (keepExplicitHeight) {
      const h = typeof measureHeight === "function" ? measureHeight() : element.offsetHeight;
      element.style.height = `${h}px`;
    }
    onSettled?.();
    return;
  }

  if (element._heightAnimCleanup) element._heightAnimCleanup();

  const oldHeight = element.offsetHeight;
  element.style.height = `${oldHeight}px`;
  element.style.transition = "none";

  changeFn();

  let newHeight;
  if (typeof measureHeight === "function") {
    newHeight = measureHeight();
  } else {
    element.style.height = "auto";
    newHeight = element.offsetHeight;
  }

  if (Math.abs(newHeight - oldHeight) < HEIGHT_ANIMATION_EPSILON_PX) {
    if (keepExplicitHeight) element.style.height = `${newHeight}px`;
    else element.style.removeProperty("height");
    element.style.removeProperty("transition");
    onSettled?.();
    return;
  }

  element.style.height = `${oldHeight}px`;
  void element.offsetHeight;
  element.style.removeProperty("transition");
  element.style.height = `${newHeight}px`;

  const cleanup = () => {
    clearTimeout(element._heightAnimTimer);
    element.removeEventListener("transitionend", onEnd);
    element._heightAnimCleanup = null;
    if (element.isConnected && !keepExplicitHeight) element.style.removeProperty("height");
    onSettled?.();
  };
  const onEnd = (e) => {
    if (e.propertyName === "height") cleanup();
  };

  element.addEventListener("transitionend", onEnd);
  element._heightAnimCleanup = cleanup;
  element._heightAnimTimer = setTimeout(cleanup, HEIGHT_ANIMATION_FALLBACK_MS);
}

const CROSS_FADE_FALLBACK_MS = 300; // safety net if transitionend never fires — `--t-fast` is .15s, this leaves a generous margin

/**
 * Cross-fade `hideEl` out (opacity only, never a layout-affecting property)
 * BEFORE running `swapFn` — which does the actual `.hide` class toggling,
 * typically itself wrapped in animateElementHeight() by the caller (e.g.
 * src/menu.js's `_animateMenuPanelHeight()`/src/reviews.js's
 * `_animateReviewCardHeight()`) — then cross-fades `revealEl` in once
 * `swapFn` has run. Exists so a collapsing sibling (e.g. the OAuth/email
 * sign-in button row) doesn't just vanish instantly via `.hide`'s
 * `display: none` while the wrapping panel/card's own height-tween resizes
 * around it in the very same tick — that combination previously read as the
 * row abruptly popping out of existence mid-resize, even though the
 * container itself was already animating smoothly.
 *
 * Deliberately sequential (fade hideEl out, THEN call swapFn), not
 * concurrent: an opacity transition never changes an element's own layout
 * box, so running it at the same time as the height-tween (which measures
 * its "new" target height assuming hideEl is ALREADY gone) would leave
 * hideEl's own full-size box visibly disagreeing with that already-final
 * target height for the whole fade's duration. Revealing `revealEl` and
 * fading it in, by contrast, is safe to do immediately after `swapFn` runs
 * (not deferred any further) — revealing an element changes what height the
 * container tweens to (via its `display: none` state), but fading its
 * opacity in afterward doesn't change that height a second time, so there's
 * nothing left for the two to fight over.
 *
 * `hideEl`/`revealEl` must each carry their own `transition: opacity
 * var(--t-fast)` in CSS (see `.rv-verify-step`/`.menu-account-signin-row` in
 * styles.css) — this function only toggles the `.fade-swap-out`/
 * `.fade-swap-in` modifier classes (styles.css) that change the opacity
 * VALUE, using the same "force a reflow, then toggle the class" idiom
 * animateElementHeight() above already uses for its own height tween, so a
 * freshly-revealed `revealEl` reliably starts its transition from opacity 0
 * rather than skipping straight to 1 with no visible animation.
 * @param {HTMLElement} hideEl - element to fade out, then hide
 * @param {HTMLElement|null} revealEl - element to reveal, then fade in (omit if nothing is being revealed)
 * @param {() => void} swapFn - the actual `.hide` toggling (and whatever height-tween wrapper the caller wants around it)
 * @returns {void}
 */
export function crossFadeSwap(hideEl, revealEl, swapFn) {
  if (!hideEl || isReduceMotionActive() || !hideEl.isConnected || hideEl.classList.contains("hide")) {
    swapFn();
    return;
  }
  if (hideEl._crossFadeCleanup) hideEl._crossFadeCleanup();

  hideEl.classList.add("fade-swap-out");
  const cleanup = () => {
    clearTimeout(fallbackTimer);
    hideEl.removeEventListener("transitionend", onEnd);
    hideEl.classList.remove("fade-swap-out");
    hideEl._crossFadeCleanup = null;
    swapFn();
    if (revealEl) {
      revealEl.classList.add("fade-swap-in");
      void revealEl.offsetHeight; // commit the opacity:0 starting point before releasing it, below
      revealEl.classList.remove("fade-swap-in");
    }
  };
  const onEnd = (e) => {
    if (e.propertyName === "opacity" && e.target === hideEl) cleanup();
  };

  hideEl.addEventListener("transitionend", onEnd);
  hideEl._crossFadeCleanup = cleanup;
  const fallbackTimer = setTimeout(cleanup, CROSS_FADE_FALLBACK_MS);
}

/**
 * Smoothly animate a desktop sheet's height when its content changes.
 * On mobile (≤768 px) the changeFn runs immediately with no animation.
 *
 * Flow: pin at current height → run changeFn → measure new natural
 * height → FLIP-animate from old → new → restore fit-content.
 */
export function animateSheetHeight(sheet, changeFn, { force = false } = {}) {
  // Cancel any pending cleanup from a previous animation
  if (sheet._animCleanup) { clearTimeout(sheet._animCleanup); sheet._animCleanup = null; }

  if ((!force && window.innerWidth <= 768) || sheet.classList.contains("shut")) {
    changeFn();
    return;
  }

  const oldH = sheet.offsetHeight;

  // 1. Pin at current height so DOM change doesn't cause visible jump
  sheet.style.setProperty("height", oldH + "px", "important");
  sheet.style.setProperty("transition", "none", "important");

  // 2. Execute content change (sheet stays visually at oldH)
  changeFn();

  // 3. Measure new natural height (briefly restore fit-content)
  sheet.style.setProperty("height", "fit-content", "important");
  const newH = sheet.offsetHeight;

  if (Math.abs(newH - oldH) < 2) {
    sheet.style.removeProperty("height");
    sheet.style.removeProperty("transition");
    return;
  }

  // 4. Re-pin at old height, force reflow so browser commits it
  sheet.style.setProperty("height", oldH + "px", "important");
  void sheet.offsetHeight;

  // 5. Animate to new height (CSS transition on .sheet kicks in)
  sheet.style.removeProperty("transition");
  sheet.style.setProperty("height", newH + "px", "important");

  const cleanup = () => {
    sheet._animCleanup = null;
    sheet.removeEventListener("transitionend", onEnd);
    // Don't touch a closed sheet — a new open() may have set fresh styles
    if (!sheet.classList.contains("shut")) sheet.style.removeProperty("height");
  };
  const onEnd = (e) => { if (e.propertyName === "height") cleanup(); };
  sheet.addEventListener("transitionend", onEnd);
  sheet._animCleanup = setTimeout(cleanup, 400); // safety fallback
}

export function initSheetDrag(sheet, closeFn) {
  const isMobile = () => window.innerWidth <= 768;
  const SHEET_STATE_OPENING = "opening";
  const SHEET_STATE_OPEN = "open";
  const SHEET_STATE_CLOSING = "closing";
  let startY = 0, startH = 0, dragging = false;
  let cached = null;                               // snap-mode cache (survives tab switches)

  /* ── measure true content height ── */
  /* Called only from freshCalc() which first sets height:auto so flex-1
     children report their natural scrollHeight, not flex-expanded size. */
  function contentHeight() {
    let h = 0;
    for (const c of sheet.children) {
      if (!c.offsetWidth && !c.offsetHeight) continue;   // skip display:none
      const cs = getComputedStyle(c);
      const own = parseFloat(cs.flexGrow) > 0 ? c.scrollHeight : c.offsetHeight;
      h += own + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    }
    return h;
  }

  /* ── fresh calculation (always re-measures) ── */
  function freshCalc() {
    const vh = window.innerHeight;
    const ch = contentHeight();
    const r  = ch / vh;
    if (r < 0.5)  return { mode: "small",  initial: ch,         cap: ch };
    if (r < 0.75) return { mode: "medium", initial: ch,         cap: ch };
    /*   large  */ return { mode: "large",  initial: vh * 0.75,  cap: vh };
  }

  /* ── pick snap target from current height ── */
  function snapTarget(currentH, mode, cap) {
    const vh = window.innerHeight;
    const r  = currentH / vh;

    if (mode === "small") {
      if (r < 0.25) return 0;              // dismiss
      // snap to content height or 50 %, whichever is closer
      const mid = (cap + vh * 0.5) / 2;
      return currentH >= mid ? vh * 0.5 : cap;
    }

    if (mode === "medium") {
      if (r < 0.25) return 0;              // dismiss
      // midpoint between 50 % and the content cap
      const mid = (vh * 0.5 + cap) / 2;
      return currentH >= mid ? cap : vh * 0.5;
    }

    // large
    if (r < 0.25) return 0;                // dismiss
    if (r >= 0.76) return "full";           // 100 %
    // midpoint between 50 % and 75 %
    return r >= 0.625 ? vh * 0.75 : vh * 0.5;
  }

  /* ── drag handlers ── */
  function onStart(y) {
    if (!isMobile()) return;
    // If currently in .full state, commit actual height as inline px and drop the
    // class so the drag isn't fighting the !important CSS rule
    if (sheet.classList.contains("full")) {
      sheet.style.height = sheet.offsetHeight + "px";
      sheet.classList.remove("full");
    }
    startY = y;
    startH = sheet.offsetHeight;
    dragging = true;
    sheet.classList.add("dragging");
  }

  function onMove(y) {
    if (!dragging) return;
    const vh = window.innerHeight;
    const newH = Math.max(40, Math.min(startH + (startY - y), vh));
    sheet.style.height = newH + "px";
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;

    sheet.classList.remove("dragging");            // re-enable CSS transition

    // If someone already closed the sheet while we were dragging, bail out
    if (sheet.classList.contains("shut")) return;

    const currentH = sheet.offsetHeight;
    const { mode, cap } = cached || freshCalc();
    // Clamp to content cap — if user dragged above it, snap back down
    const effective = Math.min(currentH, cap);
    const target = snapTarget(effective, mode, cap);

    // Commit current height so the transition has a known start value
    sheet.style.height = currentH + "px";
    void sheet.offsetHeight;                       // force reflow

    if (target === 0) {
      closeFn();
    } else if (target === "full") {
      sheet.classList.add("full");
      sheet.style.height = "";
    } else {
      sheet.classList.remove("full");
      sheet.style.height = target + "px";
    }
  }

  /* ── Desktop: track height for open() priming ── */
  /* The sheet uses fit-content on desktop, which naturally follows child
     transitions frame by frame — no FLIP or pinning needed. We only
     track the current height so open() can prime correctly. */
  let prevDesktopH = null;
  const desktopRO = new ResizeObserver(() => {
    if (isMobile() || sheet.classList.contains("shut")) { prevDesktopH = null; return; }
    prevDesktopH = sheet.offsetHeight;
  });
  desktopRO.observe(sheet);

  /* ── bind drag handles (start on handle, move/end on document) ── */
  sheet.querySelectorAll(".sheet-drag, .sheet-head").forEach((handle) => {
    handle.addEventListener("touchstart", (e) => {
      if (e.target.closest("button, a, [role='button']")) return;
      // preventDefault stops the browser from starting a scroll/pan,
      // replacing the old CSS touch-action:none on .sheet-head.
      e.preventDefault();
      onStart(e.touches[0].clientY);
    }, { passive: false });
    handle.addEventListener("mousedown",  (e) => {
      if (e.target.closest("button, a, [role='button']")) return;
      onStart(e.clientY); e.preventDefault();
    });
  });
  document.addEventListener("touchmove", (e) => { if (dragging) onMove(e.touches[0].clientY); }, { passive: true });
  document.addEventListener("touchend",  ()  => { if (dragging) onEnd(); }, { passive: true });
  document.addEventListener("mousemove", (e) => { if (dragging) onMove(e.clientY); });
  document.addEventListener("mouseup",   ()  => { if (dragging) onEnd(); });

  /* ── public controller ── */
  let openRAF = null;                              // track pending rAF from open()

  return {
    /**
     * Open the sheet at its correct initial snap height.
     * Briefly remove .shut → measure → re-add .shut → rAF remove = smooth reveal.
     */
    open() {
      // Cancel any stale open rAF so it can't fight a close that came in between
      if (openRAF) { cancelAnimationFrame(openRAF); openRAF = null; }

      if (!isMobile()) {
        // Desktop/tablet: just reveal — CSS handles height via fit-content
        sheet.classList.remove("shut", "full");
        sheet.style.height = "";
        sheet.dataset.sheetState = SHEET_STATE_OPEN;
        prevDesktopH = sheet.offsetHeight; // prime so first RO callback can animate immediately
        return;
      }
      sheet.classList.remove("full");
      sheet.dataset.sheetState = SHEET_STATE_OPENING;

      // 1. height:auto + remove .shut so children lay out at natural sizes
      sheet.style.height = "auto";
      sheet.classList.remove("shut");
      void sheet.offsetHeight;                     // force layout

      // 2. Fresh measure (children now at natural height)
      cached = freshCalc();

      // 3. Commit the height and re-add .shut in the same frame (no paint yet)
      sheet.style.height = cached.initial + "px";
      sheet.classList.add("shut");
      void sheet.offsetHeight;                     // force layout with .shut

      // 4. Remove .shut in next frame → CSS transition slides up
      openRAF = requestAnimationFrame(() => {
        openRAF = null;
        sheet.classList.remove("shut");
        sheet.dataset.sheetState = SHEET_STATE_OPEN;
      });
    },
    /** Re-measure after content changes (e.g. results loaded) & re-snap.
     *  Transitions are disabled during measurement so there is NEVER a
     *  flash to content-height.  The flow is:
     *    1. Capture current rendered height  (startH)
     *    2. transition:none → height:auto  → reflow → freshCalc
     *    3. Pin back to startH  → reflow  (no paint at auto)
     *    4. Restore transition → set target  (smooth CSS animation)
     */
    remeasure() {
      if (!isMobile() || sheet.classList.contains("shut")) return;

      // 1. Current visual height
      const startH = sheet.offsetHeight;

      // 2. Suppress transitions, remove .full, measure at natural height
      sheet.style.transition = "none";
      sheet.classList.remove("full");
      sheet.style.height = "auto";
      void sheet.offsetHeight;                     // sync reflow (no paint)
      cached = freshCalc();

      // 3. Pin back to startH so transition has a known numeric origin
      sheet.style.height = startH + "px";
      void sheet.offsetHeight;                     // commit with no transition

      // 4. Re-enable transitions — next height set animates smoothly
      sheet.style.transition = "";

      // Always snap to the natural initial for the *new* content.
      // Using startH would keep the panel at a stale size (e.g. 100 vh
      // from route-focused) even though content changed.
      const target = snapTarget(cached.initial, cached.mode, cached.cap);

      if (target === "full") {
        sheet.classList.add("full");
        sheet.style.height = "";
      } else if (target === 0) {
        sheet.style.height = cached.initial + "px";
      } else {
        sheet.style.height = Math.max(target, cached.initial) + "px";
      }
    },
    /** Update cached cap (e.g. after a tab switch).
     *  Only updates the drag cap — never changes the current height. */
    softRemeasure() {
      if (!isMobile() || sheet.classList.contains("shut")) return;
      const prev = sheet.style.height;
      sheet.style.height = "auto";
      void sheet.offsetHeight;
      cached = freshCalc();
      sheet.style.height = prev;
    },
    /** Prepare the sheet for a CSS-transitioned close.
     *  Cleans up drag state and inline overrides, forces a reflow so
     *  the browser commits the current "open" state, then adds .shut
     *  — guaranteeing a proper from→to transition on every engine. */
    close() {
      if (openRAF) { cancelAnimationFrame(openRAF); openRAF = null; }
      sheet.dataset.sheetState = SHEET_STATE_CLOSING;
      dragging = false;
      sheet.classList.remove("full", "dragging");
      sheet.style.removeProperty("transition");
      sheet.style.removeProperty("will-change");
      cached = null;
      // Commit the clean "open" layout as the transition origin
      void sheet.offsetHeight;
      // Now .shut triggers a real transition from the committed state
      sheet.classList.add("shut");
    },
    /** Wipe ALL inline styles — call after the close transition ends
     *  (or immediately for instant force-close). */
    cleanup() {
      sheet.removeAttribute("style");
      delete sheet.dataset.sheetState;
    }
  };
}

// Removed: swapSheetsHorizontally() + its SWAP_CLEANUP_MS constant (dated
// 2026-08-03, superseded same-day). It coordinated a horizontal "swap"
// transition between #menu-sheet and #profile-sheet as two independent
// .sheet elements — smoother than a plain close/open, but each sheet still
// auto-sized to its OWN content height, so the coordinated swap still
// visibly "wobbled" via a height reflow underneath the slide (Profile is
// far taller than Menu). Superseded by merging Menu and Profile into one
// physical .sheet with two internal panes that stretch to a shared height
// (see index.html's #menu-sheet, #mp-pane-track, and src/menu.js's
// _setActivePane()) — navigation between them is now an internal transform
// swap that never touches sheet-level open/close or height at all, so this
// helper (and the .sheet.shut.sheet--swap-left/-right CSS it depended on)
// is no longer needed by anything.

// --- Pure math ---

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Share token crypto (XOR + FNV-1a, no real security — just obfuscation) ---

const _LAT_BASE = 58.0,
  _LNG_BASE = 23.0,
  _GEO_SCALE = 10000;

function _keyBuf() {
  return Array.from(_CRYPTO_KEY, (c) => c.charCodeAt(0));
}
function _fnv1a16(bytes) {
  let h = 2166136261;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619) >>> 0;
  return ((h >>> 16) ^ (h & 0xffff)) & 0xffff;
}
function _b64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function _b64decode(token) {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  const raw = atob(pad ? b64 + "=".repeat(4 - pad) : b64);
  return Array.from(raw, (c) => c.charCodeAt(0));
}

export function encryptToken(place) {
  const kb = _keyBuf();
  // Hash string ID to 16 bits for compact token encoding
  const idBytes = Array.from(String(place.id), (c) => c.charCodeAt(0));
  const id = _fnv1a16(idBytes);
  const lat16 = Math.round((place.lat - _LAT_BASE) * _GEO_SCALE) & 0xffff;
  const lng16 = Math.round((place.lng - _LNG_BASE) * _GEO_SCALE) & 0xffff;
  const data = [
    id >> 8,
    id & 0xff,
    lat16 >> 8,
    lat16 & 0xff,
    lng16 >> 8,
    lng16 & 0xff,
  ];
  const mac = _fnv1a16([...kb, ...data]);
  const plain = [...data, mac >> 8, mac & 0xff];
  const xored = plain.map((b, i) => b ^ kb[i % kb.length]);
  return _b64url(xored);
}

export function decryptToken(token) {
  try {
    const raw = _b64decode(token);
    if (raw.length !== 8) return null;
    const kb = _keyBuf();
    const plain = raw.map((b, i) => b ^ kb[i % kb.length]);
    const [ih, il, lah, lal, loh, lol, mh, ml] = plain;
    const mac = (mh << 8) | ml;
    const data = [ih, il, lah, lal, loh, lol];
    if (_fnv1a16([...kb, ...data]) !== mac) return null;
    return {
      id: null, // ID is a hash — resolve via lat/lng proximity
      a: _LAT_BASE + ((lah << 8) | lal) / _GEO_SCALE,
      o: _LNG_BASE + ((loh << 8) | lol) / _GEO_SCALE,
    };
  } catch {
    return null;
  }
}

export function _decodeLegacyToken(token) {
  try {
    const LEGACY_KEY = "Hf#K4r@m@h_2O26!";
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    const raw = atob(pad ? b64 + "=".repeat(4 - pad) : b64);
    const plain = Array.from(raw, (c, i) =>
      String.fromCharCode(
        c.charCodeAt(0) ^ LEGACY_KEY.charCodeAt(i % LEGACY_KEY.length),
      ),
    ).join("");
    const obj = JSON.parse(plain);
    if (obj && obj.n) return obj;
  } catch {}
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    return JSON.parse(atob(pad ? b64 + "=".repeat(4 - pad) : b64));
  } catch {}
  return null;
}

export function buildShareUrl(place) {
  return `${location.origin}${location.pathname}?place=${encodeURIComponent(place.id)}`;
}

// ─── Unified share helper ───────────────────────────────────────────────────

export async function shareUrl(fullUrl, title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url: fullUrl });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  copyToClipboard(fullUrl);
  showToast("Link copied");
}

// ─── Compact share URL encoding ────────────────────────────────────────────
// v2: binary header + DEFLATE-compressed itinerary for transit routes.
// Transit shares embed the full itinerary (legs, geometry, stops) so the
// receiver sees the EXACT route — no API re-query needed.
// Non-transit shares (drive/cycle/walk) still re-query (deterministic).
// Old v1 tokens (0x01) and legacy JSON formats still decode for compat.

const _C_LAT_BASE = 58;
const _C_LNG_BASE = 19;
const _C_SCALE = 5000; // uint16 covers 58–71° lat, 19–32° lng (~22 m precision)
const _DATE_EPOCH = Date.UTC(2024, 0, 1);
const _ROUTE_MODES = ["drive", "transit", "cycle", "walk"];

function _toU16(v) { const u = Math.round(v) & 0xffff; return [u >> 8, u & 0xff]; }
function _fromU16(h, l) { return (h << 8) | l; }
function _encLat(lat) { return _toU16((lat - _C_LAT_BASE) * _C_SCALE); }
function _encLng(lng) { return _toU16((lng - _C_LNG_BASE) * _C_SCALE); }
function _decLat(h, l) { return _C_LAT_BASE + _fromU16(h, l) / _C_SCALE; }
function _decLng(h, l) { return _C_LNG_BASE + _fromU16(h, l) / _C_SCALE; }

function _pushStr(buf, str) {
  const enc = new TextEncoder().encode(str.slice(0, 60));
  buf.push(enc.length);
  for (const b of enc) buf.push(b);
}
function _pullStr(buf, off) {
  const len = buf[off];
  return { s: new TextDecoder().decode(new Uint8Array(buf.slice(off + 1, off + 1 + len))), n: off + 1 + len };
}
function _b64e(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function _b64d(tok) {
  const b = tok.replace(/-/g, "+").replace(/_/g, "/");
  const p = b.length % 4;
  return Array.from(atob(p ? b + "=".repeat(4 - p) : b), (c) => c.charCodeAt(0));
}

// ── Compression helpers (DEFLATE-raw via Web Streams API) ──
async function _deflate(data) {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data instanceof Uint8Array ? data : new Uint8Array(data));
  writer.close();
  const chunks = [];
  const reader = cs.readable.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}
async function _inflate(data) {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(data instanceof Uint8Array ? data : new Uint8Array(data));
  writer.close();
  const chunks = [];
  const reader = ds.readable.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// ── Itinerary packing (full itinerary → minimal JSON) ──
function _packItinerary(itin) {
  return {
    s: new Date(itin.start).getTime(),
    e: new Date(itin.end).getTime(),
    l: itin.legs.map(leg => {
      const o = {
        m: leg.mode,
        s: new Date(leg.start.scheduledTime).getTime(),
        e: new Date(leg.end.scheduledTime).getTime(),
        fn: leg.from.name || "",
        tn: leg.to.name || "",
        g: leg.legGeometry.points,
        du: leg.duration,
        di: leg.distance || 0,
      };
      if (leg.legGeometry.precision && leg.legGeometry.precision !== 5) o.gp = leg.legGeometry.precision;
      if (leg.from.stop?.code) o.fc = leg.from.stop.code;
      if (leg.from.stop?.zoneId) o.fz = leg.from.stop.zoneId;
      if (leg.to.stop?.code) o.tc = leg.to.stop.code;
      if (leg.to.stop?.zoneId) o.tz = leg.to.stop.zoneId;
      if (leg.intermediateStops?.length) {
        o.is = leg.intermediateStops.map(s => {
          const st = { n: s.name || "" };
          if (s.code) st.c = s.code;
          if (s.zoneId) st.z = s.zoneId;
          return st;
        });
      }
      if (leg.trip) {
        if (leg.trip.routeShortName) o.rn = leg.trip.routeShortName;
        if (leg.trip.tripHeadsign) o.rh = leg.trip.tripHeadsign;
        if (leg.trip.route?.type != null) o.rt = leg.trip.route.type;
        if (leg.trip.route?.color) o.rc = leg.trip.route.color;
        if (leg.trip.route?.textColor) o.rx = leg.trip.route.textColor;
      }
      return o;
    }),
  };
}
function _unpackItinerary(packed) {
  return {
    start: new Date(packed.s).toISOString(),
    end: new Date(packed.e).toISOString(),
    legs: packed.l.map(pl => ({
      mode: pl.m,
      duration: pl.du,
      distance: pl.di || 0,
      start: { scheduledTime: new Date(pl.s).toISOString() },
      end: { scheduledTime: new Date(pl.e).toISOString() },
      from: { name: pl.fn || "", stop: (pl.fc || pl.fz) ? { code: pl.fc || null, zoneId: pl.fz || null } : null },
      to: { name: pl.tn || "", stop: (pl.tc || pl.tz) ? { code: pl.tc || null, zoneId: pl.tz || null } : null },
      intermediateStops: (pl.is || []).map(s => ({ name: s.n || "", code: s.c || null, zoneId: s.z || null })),
      trip: (pl.rn || pl.rh || pl.rt != null) ? {
        routeShortName: pl.rn || null,
        tripHeadsign: pl.rh || null,
        route: { type: pl.rt ?? 0, color: pl.rc || null, textColor: pl.rx || null },
      } : null,
      legGeometry: { points: pl.g, precision: pl.gp || 5 },
    })),
  };
}

export async function decompressItinerary(compressedBytes) {
  const decompressed = await _inflate(compressedBytes);
  const json = new TextDecoder().decode(decompressed);
  return _unpackItinerary(JSON.parse(json));
}

// ── Route compact v2: ?r=<token>  (byte 0 = 0x02)
// v2 changes vs v1: exact-minute time (not 15-min); embedded DEFLATE-compressed
// itinerary for transit (receiver renders directly without re-querying APIs).
export async function encodeCompactRoute({ olat, olng, dlat, dlng, mode, oname, dname, tmode, tdate, ttime, waypoints, itinerary }) {
  const buf = [0x02];
  const m = _ROUTE_MODES.indexOf(mode) & 3;
  const tm = tmode === "arrive" ? 1 : 0;
  const ht = !!(tdate && ttime);
  const ho = !!oname;
  const hd = !!dname;
  const hw = !!(waypoints?.length);
  const hi = !!(itinerary && mode === "transit");
  buf.push(m | (tm << 2) | (ht ? 8 : 0) | (ho ? 16 : 0) | (hd ? 32 : 0) | (hw ? 64 : 0) | (hi ? 128 : 0));
  buf.push(..._encLat(olat), ..._encLng(olng));
  buf.push(..._encLat(dlat), ..._encLng(dlng));
  if (ht) {
    const days = Math.round((new Date(tdate + "T00:00:00").getTime() - _DATE_EPOCH) / 86400000);
    buf.push(..._toU16(days));
    const [h, mi] = ttime.split(":").map(Number);
    buf.push(h, mi);
  }
  if (ho) _pushStr(buf, oname);
  if (hd) _pushStr(buf, dname);
  if (hw) {
    buf.push(waypoints.length);
    for (const wp of waypoints) {
      buf.push(..._encLat(wp.lat), ..._encLng(wp.lng));
      _pushStr(buf, (wp.name || "").slice(0, 60));
    }
  }
  if (hi) {
    const json = JSON.stringify(_packItinerary(itinerary));
    const compressed = await _deflate(new TextEncoder().encode(json));
    const combined = new Uint8Array(buf.length + compressed.length);
    combined.set(buf);
    combined.set(compressed, buf.length);
    return _b64e(combined);
  }
  return _b64e(buf);
}

// Decode handles both v1 (0x01) and v2 (0x02) compact route tokens.
// Returns header fields synchronously; v2 transit tokens include _compressedItinerary
// bytes that must be decompressed async via decompressItinerary().
export function decodeCompactRoute(token) {
  try {
    const b = _b64d(token);
    if (b[0] === 0x01) return _decodeRouteV1(b);
    if (b[0] === 0x02) return _decodeRouteV2(b);
    return null;
  } catch { return null; }
}

function _decodeRouteV1(b) {
  const f = b[1];
  const mode = _ROUTE_MODES[f & 3];
  const tmode = (f >> 2) & 1 ? "arrive" : "depart";
  const ht = !!(f & 8), ho = !!(f & 16), hd = !!(f & 32), hw = !!(f & 64), hi = !!(f & 128);
  const olat = _decLat(b[2], b[3]), olng = _decLng(b[4], b[5]);
  const dlat = _decLat(b[6], b[7]), dlng = _decLng(b[8], b[9]);
  let off = 10, tdate, ttime;
  if (ht) {
    const days = _fromU16(b[off], b[off + 1]);
    const d = new Date(_DATE_EPOCH + days * 86400000);
    tdate = d.toISOString().slice(0, 10);
    const qh = b[off + 2];
    ttime = `${String(Math.floor(qh / 4)).padStart(2, "0")}:${String((qh % 4) * 15).padStart(2, "0")}`;
    off += 3;
  }
  let oname = "";
  if (ho) { const r = _pullStr(b, off); oname = r.s; off = r.n; }
  let dname = "";
  if (hd) { const r = _pullStr(b, off); dname = r.s; off = r.n; }
  const waypoints = [];
  if (hw) {
    const count = b[off++];
    for (let i = 0; i < count; i++) {
      const wlat = _decLat(b[off], b[off + 1]);
      const wlng = _decLng(b[off + 2], b[off + 3]);
      off += 4;
      const r = _pullStr(b, off);
      waypoints.push({ lat: wlat, lng: wlng, name: r.s });
      off = r.n;
    }
  }
  let itinIdx = null;
  if (hi) itinIdx = b[off++];
  return { olat, olng, dlat, dlng, mode, oname, dname, tmode, tdate, ttime, waypoints, itinIdx, _compressedItinerary: null };
}

function _decodeRouteV2(b) {
  const f = b[1];
  const mode = _ROUTE_MODES[f & 3];
  const tmode = (f >> 2) & 1 ? "arrive" : "depart";
  const ht = !!(f & 8), ho = !!(f & 16), hd = !!(f & 32), hw = !!(f & 64), hi = !!(f & 128);
  const olat = _decLat(b[2], b[3]), olng = _decLng(b[4], b[5]);
  const dlat = _decLat(b[6], b[7]), dlng = _decLng(b[8], b[9]);
  let off = 10, tdate, ttime;
  if (ht) {
    const days = _fromU16(b[off], b[off + 1]);
    const d = new Date(_DATE_EPOCH + days * 86400000);
    tdate = d.toISOString().slice(0, 10);
    ttime = `${String(b[off + 2]).padStart(2, "0")}:${String(b[off + 3]).padStart(2, "0")}`;
    off += 4;
  }
  let oname = "";
  if (ho) { const r = _pullStr(b, off); oname = r.s; off = r.n; }
  let dname = "";
  if (hd) { const r = _pullStr(b, off); dname = r.s; off = r.n; }
  const waypoints = [];
  if (hw) {
    const count = b[off++];
    for (let i = 0; i < count; i++) {
      const wlat = _decLat(b[off], b[off + 1]);
      const wlng = _decLng(b[off + 2], b[off + 3]);
      off += 4;
      const r = _pullStr(b, off);
      waypoints.push({ lat: wlat, lng: wlng, name: r.s });
      off = r.n;
    }
  }
  let _compressedItinerary = null;
  if (hi && off < b.length) {
    _compressedItinerary = new Uint8Array(b.slice(off));
  }
  return { olat, olng, dlat, dlng, mode, oname, dname, tmode, tdate, ttime, waypoints, itinIdx: null, _compressedItinerary };
}

// ── Pin / Stop compact: ?p=<token>
export function encodeCompactPin(lat, lng, zoom, isStop, name) {
  const buf = [isStop ? 0x03 : 0x02];
  buf.push(Math.round(zoom * 10));
  buf.push(..._encLat(lat), ..._encLng(lng));
  if (isStop && name) _pushStr(buf, name);
  return _b64e(buf);
}

export function decodeCompactPin(token) {
  try {
    const b = _b64d(token);
    if (b[0] !== 0x02 && b[0] !== 0x03) return null;
    const isStop = b[0] === 0x03;
    const zoom = b[1] / 10;
    const lat = _decLat(b[2], b[3]);
    const lng = _decLng(b[4], b[5]);
    let name = "";
    if (isStop && b.length > 6) { name = _pullStr(b, 6).s; }
    return { lat, lng, zoom, isStop, name };
  } catch { return null; }
}

// ── Geolocation helper ─────────────────────────────────────────────
// Returns Promise<GeolocationPosition>.
// – Checks permission state first so we can adapt timeouts:
//     "prompt" → long timeout (user must interact with browser dialog)
//     "granted" → normal short timeout
//     "denied" → reject immediately with a helpful message
// – Retries once with low-accuracy fallback on POSITION_UNAVAILABLE / TIMEOUT.
// Options: { watch: false } for one-shot, { watch: true } returns watchId via onWatch callback.
export function requestLocation({ watch = false, onPosition, onWatch } = {}) {
  return new Promise(async (resolve, reject) => {
    if (!navigator.geolocation) {
      return reject({ denied: false, message: "Browser doesn't support location" });
    }

    let permState = "unknown";
    // Start the geolocation request immediately so the browser still treats it
    // as a direct user gesture and can show the permission prompt. Permission
    // state is queried in parallel and only used as a hint for messaging.
    Promise.resolve()
      .then(() => navigator.permissions?.query?.({ name: "geolocation" }))
      .then((status) => { if (status?.state) permState = status.state; })
      .catch(() => {});

    // A generous first timeout avoids firing while the browser permission
    // dialog is still open when the state is "ask" / "prompt".
    const firstTimeout = 60000;
    const retryTimeout = 15000;
    let retried = false;

    function onSuccess(pos) {
      if (onPosition) onPosition(pos);
      resolve(pos);
    }

    function retry(errCb) {
      if (watch) {
        const id = navigator.geolocation.watchPosition(onPosition || onSuccess, errCb, {
          enableHighAccuracy: false, timeout: retryTimeout,
        });
        if (onWatch) onWatch(id);
      } else {
        navigator.geolocation.getCurrentPosition(onSuccess, errCb, {
          enableHighAccuracy: false, timeout: retryTimeout,
        });
      }
    }

    function onError(err) {
      // PERMISSION_DENIED (1) — either blocked in settings or denied at prompt.
      if (err && err.code === 1) {
        return reject({ denied: true, message: "Enable it in browser settings" });
      }
      if (permState === "denied") {
        return reject({ denied: true, message: "Enable it in browser settings" });
      }
      // POSITION_UNAVAILABLE (2) / TIMEOUT (3) — retry once with low accuracy.
      if (!retried) {
        retried = true;
        return retry(onFinalError);
      }
      onFinalError(err);
    }

    function onFinalError() {
      reject({ denied: false, message: "Try again in a moment" });
    }

    if (watch) {
      const id = navigator.geolocation.watchPosition(onPosition || onSuccess, onError, {
        enableHighAccuracy: true, timeout: firstTimeout,
      });
      if (onWatch) onWatch(id);
    } else {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true, timeout: firstTimeout,
      });
    }
  });
}
