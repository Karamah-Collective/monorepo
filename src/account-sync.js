/**
 * Cross-device sync — favourites, saved pins, and home location for signed-in
 * users (docs/ACCOUNTS_AND_REDESIGN_PLAN.md Phase 8). Purely additive:
 * signed-out users see zero behavior change.
 *
 * On sign-in, the local copy is union-merged with the server copy — anything
 * local-only gets uploaded, anything server-only gets adopted locally, and
 * nothing already synced is duplicated or removed. Toggling a favourite/pin,
 * or changing home location, while signed in additionally fires a background
 * save/unsave call (same "instant local write, fire-and-forget sync" pattern
 * already used elsewhere in this app).
 *
 * Deliberately decoupled from places.js/utils.js via events rather than a
 * direct import of this module from them, to avoid a circular dependency
 * (this module already imports both of those for the merge itself).
 */
import { EVT } from "./events.js";
import { getSavedPins, setSavedPinState, getHomeLocation, setHomeLocation } from "./utils.js";
import { getFavouriteIds, setFavouriteState } from "./places.js";

const ACCOUNT_API = "/api/account";
const COORD_EPSILON = 1e-6; // ~0.1m — treats float rounding as "the same point"

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

async function _mergeFavourites(saved, idToken) {
  const serverFavIds = new Set(saved.filter((s) => s.kind === "favorite").map((s) => s.placeId));
  const localFavIds = new Set(getFavouriteIds());

  for (const placeId of serverFavIds) {
    if (!localFavIds.has(placeId)) setFavouriteState(placeId, true);
  }
  for (const placeId of localFavIds) {
    if (!serverFavIds.has(placeId)) await _callAccountApi("save", { kind: "favorite", placeId }, idToken);
  }
}

async function _mergePins(saved, idToken) {
  const serverPins = saved.filter((s) => s.kind === "pin");
  const localPins = getSavedPins();

  for (const p of serverPins) {
    const alreadyLocal = localPins.some((lp) => _sameCoords(lp.lat, lp.lng, p.pinLat, p.pinLng));
    if (!alreadyLocal) setSavedPinState(p.pinLat, p.pinLng, p.pinName, true);
  }
  for (const p of localPins) {
    const onServer = serverPins.some((sp) => _sameCoords(sp.pinLat, sp.pinLng, p.lat, p.lng));
    if (!onServer) {
      await _callAccountApi("save", { kind: "pin", pinLat: p.lat, pinLng: p.lng, pinName: p.name }, idToken);
    }
  }
}

async function _mergeHome(saved, idToken) {
  const serverHome = saved.find((s) => s.kind === "home") || null;
  const localHome = getHomeLocation();

  if (!localHome && serverHome) {
    _merging = true;
    setHomeLocation({ lat: serverHome.pinLat, lng: serverHome.pinLng, name: serverHome.pinName });
    _merging = false;
    return;
  }
  if (localHome && !serverHome) {
    await _callAccountApi("save", { kind: "home", pinLat: localHome.lat, pinLng: localHome.lng, pinName: localHome.name }, idToken);
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
 * Union-merge local favourites/saved pins/home location with the signed-in
 * user's server copy. Never deletes anything on either side.
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

    await _mergeFavourites(saved, idToken);
    await _mergePins(saved, idToken);
    await _mergeHome(saved, idToken);

    window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} }));
  } finally {
    _syncing = false;
  }
}

async function _backgroundSync(kind, action, fields) {
  const auth = await _getAuthModule();
  if (!auth.getCachedAccount()) return; // signed out — no-op, purely additive feature
  const idToken = await auth.getIdToken();
  if (!idToken) return;
  _callAccountApi(action, { kind, ...fields }, idToken);
}

/**
 * Initialize account sync: merges on sign-in, then keeps every subsequent
 * favourite/pin/home toggle synced in the background. Call once, after
 * auth.js's initAuth() has run (same lazy-load timing as the Account section).
 */
export function initAccountSync() {
  window.addEventListener(EVT.AUTH_CHANGED, (e) => {
    if (e.detail?.account) _syncOnSignIn();
  });

  window.addEventListener(EVT.FAVOURITE_TOGGLED, (e) => {
    const { placeId, saved } = e.detail || {};
    if (!placeId) return;
    _backgroundSync("favorite", saved ? "save" : "unsave", { placeId });
  });

  window.addEventListener(EVT.SAVED_PIN_TOGGLED, (e) => {
    const { lat, lng, name, saved } = e.detail || {};
    if (lat == null || lng == null) return;
    _backgroundSync("pin", saved ? "save" : "unsave", { pinLat: lat, pinLng: lng, pinName: name });
  });

  // hf:home-updated is a pre-existing string-literal event (utils.js) — kept
  // as-is rather than routed through EVT, per this codebase's convention of
  // not retrofitting every existing event name (see src/events.js header).
  window.addEventListener("hf:home-updated", (e) => {
    if (_merging) return; // this exact event was just fired by our own merge above
    const home = e.detail?.home;
    if (home) {
      _backgroundSync("home", "save", { pinLat: home.lat, pinLng: home.lng, pinName: home.name });
    } else {
      _backgroundSync("home", "unsave", {});
    }
  });
}
