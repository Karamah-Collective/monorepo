/**
 * Cross-device sync — favourites, saved pins, and home location for signed-in
 * users (docs/ACCOUNTS_AND_REDESIGN_PLAN.md Phase 8).
 *
 * Two-way reconcile (see docs/PREFERENCE_LOG.md for the before/after writeup
 * and the acknowledged residual edge case): on every sign-in AND on every
 * app load where a cached signed-in account already exists, the local copy
 * is merged with the server copy —
 *   1. anything genuinely local-only-and-new gets pushed up,
 *   2. anything server-only gets adopted locally,
 *   3. anything local that was previously confirmed synced (see the
 *      "known" baseline below) but is now missing from the server's list
 *      is treated as "removed on another device" and removed locally too.
 * Step 3 is what the original Phase 8 merge explicitly did NOT do (it was a
 * pure additive union that "never deletes anything on either side") — this
 * is the fix for that gap. Step 3 can only run correctly because step 1
 * happens first, so a not-yet-uploaded local addition is pushed up (and
 * therefore never looks "missing from the server" by mistake).
 *
 * Distinguishing (1) from (3) requires more than a single local-vs-server
 * diff — both look identical ("local has it, server doesn't") without some
 * memory of what was last confirmed synced. `_getKnownSyncState()`/
 * `_setKnownSyncState()` persist that baseline in localStorage, updated to
 * the post-merge local truth at the end of every successful reconcile.
 *
 * Residual edge case (not solved by this, and not claimed to be): a local
 * removal made while the device is genuinely offline never reaches the
 * server (background sync below is fire-and-forget, no retry/offline
 * queue). If a reconcile-from-server pull happens on that same device
 * before connectivity returns and the removal is ever retried, the server's
 * still-has-it copy will look like a legitimate "adopt this locally" case
 * and can silently resurrect the item the user just removed. There's no
 * tombstone/deletion-log in this design, so this one scenario can still
 * lose a removal — flagged rather than oversold as airtight.
 *
 * Toggling a favourite/pin, or changing home location, while signed in
 * additionally fires a background save/unsave call (same "instant local
 * write, fire-and-forget sync" pattern already used elsewhere in this app).
 *
 * Deliberately decoupled from places.js/utils.js via events rather than a
 * direct import of this module from them, to avoid a circular dependency
 * (this module already imports both of those for the merge itself).
 */
import { EVT } from "./events.js";
import { getSavedPins, setSavedPinState, getHomeLocation, setHomeLocation, clearHomeLocation, showToast } from "./utils.js";
import { getFavouriteIds, setFavouriteState } from "./places.js";

const ACCOUNT_API = "/api/account";
const COORD_EPSILON = 1e-6; // ~0.1m — treats float rounding as "the same point"
const KNOWN_SYNC_STORAGE_KEY = "hf_sync_known_v1";

// auth.js is dynamically imported (never a static top-level import) so the
// heavy Firebase CDN modules it pulls in stay lazy.
let _authModulePromise = null;
function _getAuthModule() {
  if (!_authModulePromise) _authModulePromise = import("./auth.js");
  return _authModulePromise;
}

let _merging = false; // guards the hf:home-updated listener against its own merge-triggered write

async function _callAccountApi(action, fields, idToken) {
  try {
    const res = await fetch(ACCOUNT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, idToken, ...fields }),
    });
    return await res.json();
  } catch {
    return { success: false };
  }
}

function _sameCoords(aLat, aLng, bLat, bLng) {
  return Math.abs(aLat - bLat) < COORD_EPSILON && Math.abs(aLng - bLng) < COORD_EPSILON;
}

/**
 * Read the last-reconciled "known synced" baseline — a snapshot of local
 * truth taken right after the previous successful merge. Lets the merge
 * tell "brand-new local item, never uploaded" apart from "previously-synced
 * item that's now been removed on another device", since both otherwise
 * look identical (present locally, absent from the current server list).
 * @returns {{favorites: string[], pins: Array<{lat:number,lng:number,name:string}>, home: {lat:number,lng:number,name:string}|null}}
 */
function _getKnownSyncState() {
  try {
    const raw = localStorage.getItem(KNOWN_SYNC_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      favorites: Array.isArray(parsed?.favorites) ? parsed.favorites : [],
      pins: Array.isArray(parsed?.pins) ? parsed.pins : [],
      home: parsed?.home || null,
    };
  } catch {
    return { favorites: [], pins: [], home: null };
  }
}

/**
 * Persist the post-merge local truth as the new reconciliation baseline.
 * @param {{favorites: string[], pins: Array<{lat:number,lng:number,name:string}>, home: {lat:number,lng:number,name:string}|null}} state
 */
function _setKnownSyncState(state) {
  try {
    localStorage.setItem(KNOWN_SYNC_STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota/blocked */ }
}

/**
 * Two-way merge favourites: adopt server-only locally, push genuinely-new
 * local-only items up, and remove local items that were previously known
 * synced but are now missing from the server (removed elsewhere).
 * @param {Array<Object>} saved - server's sync-saved rows (all kinds)
 * @param {string} idToken
 * @param {string[]} knownFavIds - last-reconciled baseline
 * @returns {Promise<void>}
 */
async function _mergeFavourites(saved, idToken, knownFavIds) {
  const serverFavIds = new Set(saved.filter((s) => s.kind === "favorite").map((s) => s.placeId));
  const localFavIds = new Set(getFavouriteIds());
  const knownSet = new Set(knownFavIds || []);

  for (const placeId of serverFavIds) {
    if (!localFavIds.has(placeId)) setFavouriteState(placeId, true);
  }
  for (const placeId of localFavIds) {
    if (serverFavIds.has(placeId)) continue;
    if (knownSet.has(placeId)) {
      // Was previously confirmed synced; the server no longer has it —
      // removed on another device. Remove locally too.
      setFavouriteState(placeId, false);
    } else {
      // Never yet uploaded — genuinely new on this device.
      await _callAccountApi("save", { kind: "favorite", placeId }, idToken);
    }
  }
}

/**
 * Two-way merge saved pins — same shape as _mergeFavourites but matched by
 * coordinates instead of an id.
 * @param {Array<Object>} saved
 * @param {string} idToken
 * @param {Array<{lat:number,lng:number,name:string}>} knownPins
 * @returns {Promise<void>}
 */
async function _mergePins(saved, idToken, knownPins) {
  const serverPins = saved.filter((s) => s.kind === "pin");
  const localPins = getSavedPins();
  const known = knownPins || [];

  for (const p of serverPins) {
    const alreadyLocal = localPins.some((lp) => _sameCoords(lp.lat, lp.lng, p.pinLat, p.pinLng));
    if (!alreadyLocal) setSavedPinState(p.pinLat, p.pinLng, p.pinName, true);
  }
  for (const p of localPins) {
    const onServer = serverPins.some((sp) => _sameCoords(sp.pinLat, sp.pinLng, p.lat, p.lng));
    if (onServer) continue;
    const wasKnown = known.some((kp) => _sameCoords(kp.lat, kp.lng, p.lat, p.lng));
    if (wasKnown) {
      setSavedPinState(p.lat, p.lng, p.name, false);
    } else {
      await _callAccountApi("save", { kind: "pin", pinLat: p.lat, pinLng: p.lng, pinName: p.name }, idToken);
    }
  }
}

/**
 * Two-way merge the home location (a singleton, not a set — handled with
 * the same push-new/adopt-server/remove-if-known-and-missing shape).
 * @param {Array<Object>} saved
 * @param {string} idToken
 * @param {{lat:number,lng:number,name:string}|null} knownHome
 * @returns {Promise<void>}
 */
async function _mergeHome(saved, idToken, knownHome) {
  const serverHome = saved.find((s) => s.kind === "home") || null;
  const localHome = getHomeLocation();

  if (!localHome && serverHome) {
    _merging = true;
    setHomeLocation({ lat: serverHome.pinLat, lng: serverHome.pinLng, name: serverHome.pinName });
    _merging = false;
    return;
  }
  if (localHome && !serverHome) {
    const wasKnown = knownHome && _sameCoords(localHome.lat, localHome.lng, knownHome.lat, knownHome.lng);
    if (wasKnown) {
      // This exact home was previously confirmed synced, and the server no
      // longer has it — removed on another device. Clear it locally too.
      _merging = true;
      clearHomeLocation();
      _merging = false;
    } else {
      // Genuinely new local home, never yet uploaded — push it up.
      await _callAccountApi("save", { kind: "home", pinLat: localHome.lat, pinLng: localHome.lng, pinName: localHome.name }, idToken);
    }
    return;
  }
  // Both exist and disagree — local wins (matches this app's existing
  // "locally-entered value takes precedence" convention, e.g. Google-enriched
  // opening hours/website never overriding a user-submitted value).
  if (localHome && serverHome && !_sameCoords(localHome.lat, localHome.lng, serverHome.pinLat, serverHome.pinLng)) {
    await _callAccountApi("save", { kind: "home", pinLat: localHome.lat, pinLng: localHome.lng, pinName: localHome.name }, idToken);
  }
}

let _syncing = false;

/**
 * Two-way reconcile local favourites/saved pins/home location with the
 * signed-in user's server copy. See the module header for the full
 * push-then-adopt-then-remove-if-known-missing shape and its residual
 * offline-removal edge case.
 * @returns {Promise<void>}
 */
async function _syncOnSignIn() {
  if (_syncing) return;
  _syncing = true;
  try {
    const auth = await _getAuthModule();
    const idToken = await auth.getIdToken();
    if (!idToken) return;

    const result = await _callAccountApi("sync-saved", {}, idToken);
    const saved = Array.isArray(result.saved) ? result.saved : [];
    const known = _getKnownSyncState();

    await _mergeFavourites(saved, idToken, known.favorites);
    await _mergePins(saved, idToken, known.pins);
    await _mergeHome(saved, idToken, known.home);

    // Snapshot the post-merge local truth as the new reconciliation
    // baseline for next time.
    _setKnownSyncState({
      favorites: getFavouriteIds(),
      pins: getSavedPins().map((p) => ({ lat: p.lat, lng: p.lng, name: p.name })),
      home: getHomeLocation(),
    });

    window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} }));
  } finally {
    _syncing = false;
  }
}

/**
 * Fire a background save/unsave for a favourite/pin/home toggle that has
 * already been applied optimistically to local state. If the request never
 * actually succeeds server-side, `onFailure` is called to roll the local
 * state back to what it was — the toggle itself is instant/local, but it
 * must not silently stay "saved" locally while the server never got it.
 * @param {string} kind - "favorite" | "pin" | "home"
 * @param {string} action - "save" | "unsave"
 * @param {object} fields - extra payload fields (placeId, pinLat, etc.)
 * @param {() => void} onFailure - reverts the optimistic local change
 * @returns {Promise<void>}
 */
async function _backgroundSync(kind, action, fields, onFailure) {
  const auth = await _getAuthModule();
  if (!auth.getCachedAccount()) return; // signed out — no-op, purely additive feature
  const idToken = await auth.getIdToken();
  if (!idToken) { onFailure?.(); return; }
  const result = await _callAccountApi(action, { kind, ...fields }, idToken);
  if (!result.success) onFailure?.();
}

/**
 * Initialize account sync: reconciles on sign-in, on every app load where a
 * cached signed-in account already exists, and keeps every subsequent
 * favourite/pin/home toggle synced in the background. Call once, after
 * auth.js's initAuth() has run (same lazy-load timing as the Account
 * section).
 * @returns {void}
 */
export function initAccountSync() {
  window.addEventListener(EVT.AUTH_CHANGED, (e) => {
    if (e.detail?.account) _syncOnSignIn();
  });

  window.addEventListener(EVT.FAVOURITE_TOGGLED, (e) => {
    const { placeId, saved } = e.detail || {};
    if (!placeId) return;
    _backgroundSync("favorite", saved ? "save" : "unsave", { placeId }, () => {
      // Revert to what it was before this toggle, then let the Places list
      // pick it back up the same way it picks up any other sync change.
      setFavouriteState(placeId, !saved);
      window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} }));
      showToast(saved ? "Couldn't save favourite" : "Couldn't remove favourite", "error", "Please try again");
    });
  });

  window.addEventListener(EVT.SAVED_PIN_TOGGLED, (e) => {
    const { lat, lng, name, saved } = e.detail || {};
    if (lat == null || lng == null) return;
    _backgroundSync("pin", saved ? "save" : "unsave", { pinLat: lat, pinLng: lng, pinName: name }, () => {
      setSavedPinState(lat, lng, name, !saved);
      window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} }));
      showToast(saved ? "Couldn't save pin" : "Couldn't remove pin", "error", "Please try again");
    });
  });

  // hf:home-updated is a pre-existing string-literal event (utils.js) — kept
  // as-is rather than routed through EVT, per this codebase's convention of
  // not retrofitting every existing event name (see src/events.js header).
  window.addEventListener("hf:home-updated", (e) => {
    if (_merging) return; // this exact event was just fired by our own merge above
    const home = e.detail?.home;
    if (home) {
      _backgroundSync("home", "save", { pinLat: home.lat, pinLng: home.lng, pinName: home.name }, () => {
        // Not a full rollback (the previous home, if any, isn't captured
        // here) — surfacing the failure is still strictly better than the
        // previous silent no-op, which gave no indication anything was wrong.
        showToast("Couldn't sync home location", "error", "Please try again");
      });
    } else {
      _backgroundSync("home", "unsave", {}, () => {
        showToast("Couldn't sync home removal", "error", "Please try again");
      });
    }
  });

  // Explicitly reconcile on every app load whenever a cached signed-in
  // account already exists — not only reactively on a fresh
  // EVT.AUTH_CHANGED. Firebase's onAuthStateChanged callback restoring an
  // already-signed-in persisted session does already dispatch
  // EVT.AUTH_CHANGED on its own (confirmed via a full trace of src/auth.js
  // and this module's listener-registration order — see
  // docs/PREFERENCE_LOG.md), so this call is a deliberate, explicit
  // belt-and-suspenders duplicate of that path rather than the primary fix
  // for "doesn't reconcile on load" — it doesn't depend on that implicit
  // SDK timing guarantee holding in every future SDK version/environment.
  // _syncOnSignIn()'s own `_syncing` guard makes calling it from both places
  // harmless if both actually fire.
  _getAuthModule().then((auth) => {
    if (auth.getCachedAccount()) _syncOnSignIn();
  });
}
