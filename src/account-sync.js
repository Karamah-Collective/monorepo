/**
 * Cross-device sync — favourites, saved pins, and home location for signed-in
 * users (docs/ACCOUNTS_AND_REDESIGN_PLAN.md Phase 8, re-architected per the
 * 2026-08-03 account-scoping fix — see docs/PREFERENCE_LOG.md for the full
 * before/after writeup of the privacy bug this replaced).
 *
 * STRICT ACCOUNT SCOPING — no merging, ever, past first sign-in:
 *   Signed out: the local device cache (hf_favs/hf_home_location/
 *     hf_saved_pins in localStorage, read/written directly by places.js/
 *     utils.js) is the single source of truth, untouched by anything here.
 *   Signed in: places.js/utils.js are put into "cloud mode" (see
 *     enterCloudFavourites()/enterCloudScope() there) — every read/write for
 *     favourites/pins/home is redirected to an in-memory-only mirror of the
 *     account's cloud data. The local device cache is NEVER read or written
 *     while signed in, so it reappears exactly as it was the instant
 *     exitCloudFavourites()/exitCloudScope() run on sign-out.
 *   First-ever sign-in for an account with no cloud data yet AND this device
 *     has local data: a one-time confirm dialog offers to import the local
 *     data into the (empty) account. Accepted → pushed to the cloud, then
 *     cloud-scoped from then on. Declined → cloud stays empty, local device
 *     data is left untouched but not shown. Either way this is recorded
 *     server-side (functions/api/account.js's "resolve-import" action, an
 *     AccountMeta row keyed by emailHash in Code.gs) so the SAME account is
 *     never offered this prompt again — including from a second device.
 *
 * This is a deliberate architectural change from the previous "two-way union
 * merge" design: that design silently bled personal data between whoever
 * signs in and whoever last used a shared device (a real privacy bug on
 * shared/family devices), since it always adopted server data into the local
 * cache and pushed local data into whatever account signed in, regardless of
 * whose data it actually was. Cloud state is now the sole source of truth for
 * every sign-in after the first (a plain replace-from-server on every sign-in
 * and app-load restore, not a diff/merge) — which also fully resolves the old
 * design's acknowledged "offline removal can resurrect a deleted item" edge
 * case, since there is no more local-vs-server diffing at all once an account
 * is past its one-time import decision.
 *
 * Toggling a favourite/pin, or changing home location, while signed in still
 * updates the in-memory cloud state instantly (optimistic) and fires a
 * background save/unsave call to sync it — same "instant local write,
 * fire-and-forget sync" pattern this app already uses elsewhere, just backed
 * by the cloud mirror instead of localStorage while signed in.
 *
 * Deliberately decoupled from places.js/utils.js via events rather than a
 * direct import of this module from them, to avoid a circular dependency
 * (this module already imports both of those for the cloud-mode swap).
 */
import { EVT } from "./events.js";
import {
  getSavedPins,
  setSavedPinState,
  getHomeLocation,
  enterCloudScope,
  exitCloudScope,
  setPinsHomeSyncPending,
  showConfirmDialog,
  showToast,
} from "./utils.js";
import { getFavouriteIds, setFavouriteState, enterCloudFavourites, exitCloudFavourites, setFavouritesSyncPending } from "./places.js";

const ACCOUNT_API = "/api/account";

// Icon for the one-time "import your local data?" dialog (showConfirmDialog(),
// src/utils.js) — a standard upload-to-cloud glyph, same 20x20/stroke-2
// convention as menu.js's TRASH_ICON_SVG/SIGNOUT_ICON_SVG.
const IMPORT_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;

// auth.js is dynamically imported (never a static top-level import) so the
// heavy Firebase CDN modules it pulls in stay lazy.
let _authModulePromise = null;
function _getAuthModule() {
  if (!_authModulePromise) _authModulePromise = import("./auth.js");
  return _authModulePromise;
}

// Guards the "hf:home-updated" background-sync listener against re-firing a
// background save/unsave for a programmatic cloud-mode entry/exit (as opposed
// to a genuine user-initiated home change) — those already reflect exactly
// what the server just returned (or, on exit, don't touch the server at all).
let _suppressHomeBackgroundSync = false;

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

/**
 * Push this device's local favourites/pins/home up to the (currently empty)
 * cloud account, one item at a time, reusing the existing per-item "save"
 * action — this is the one-time "Import" path only.
 *
 * `generation` is checked before EVERY item, not just once up front: an
 * already-in-flight `_callAccountApi()` call can't be recalled if a sign-out
 * happens mid-loop (the ID token stays valid client-side-signOut or not), but
 * checking between items stops any *further* items from being submitted the
 * moment the generation changes — otherwise the entire remaining list would
 * still silently land in the cloud account even though the client considers
 * the import aborted, which would make a NEVER-confirmed import look
 * "already resolved" (`saved.length > 0`) on every future sign-in/device.
 * @param {string} idToken
 * @param {string[]} favIds
 * @param {Array<{lat:number,lng:number,name:string}>} pins
 * @param {{lat:number,lng:number,name:string}|null} home
 * @param {number} generation - _syncGeneration captured when this import began
 * @returns {Promise<void>}
 */
async function _pushLocalDataToCloud(idToken, favIds, pins, home, generation) {
  for (const placeId of favIds) {
    if (generation !== _syncGeneration) return;
    await _callAccountApi("save", { kind: "favorite", placeId }, idToken);
  }
  for (const p of pins) {
    if (generation !== _syncGeneration) return;
    await _callAccountApi("save", { kind: "pin", pinLat: p.lat, pinLng: p.lng, pinName: p.name }, idToken);
  }
  if (home) {
    if (generation !== _syncGeneration) return;
    await _callAccountApi("save", { kind: "home", pinLat: home.lat, pinLng: home.lng, pinName: home.name }, idToken);
  }
}

/**
 * Put places.js/utils.js into cloud-scoped mode with the given data and
 * announce it to the UI. The one place every sign-in path (fresh server
 * state, or a just-accepted local import) funnels through.
 * @param {string[]} favIds
 * @param {Array<{lat:number,lng:number,name:string}>} pins
 * @param {{lat:number,lng:number,name:string}|null} home
 * @returns {void}
 */
function _enterCloudState(favIds, pins, home) {
  enterCloudFavourites(favIds);
  _suppressHomeBackgroundSync = true;
  enterCloudScope(pins, home);
  _suppressHomeBackgroundSync = false;
  window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} }));
}

/**
 * Revert places.js/utils.js to the local device cache and announce it to the
 * UI — called on sign-out. The local cache was never touched while signed
 * in, so this is a clean, exact restore.
 * @returns {void}
 */
function _exitCloudState() {
  _syncGeneration++; // invalidate any _handleSignIn() still in flight
  exitCloudFavourites();
  _suppressHomeBackgroundSync = true;
  exitCloudScope();
  _suppressHomeBackgroundSync = false;
  window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} }));
}

let _syncing = false;
// Bumped every time _exitCloudState() runs (sign-out). _handleSignIn() checks
// this after every await so a sign-out that happens WHILE a sign-in is still
// resolving (e.g. mid-network-call, or while the import dialog is open) can't
// have its now-stale result applied afterward and silently re-enter cloud
// mode on top of what should be a clean signed-out device.
let _syncGeneration = 0;
// Set when _handleSignIn() is called while another call is already in
// flight (the `_syncing` guard below) — WITHOUT this, that second call's own
// account (which can be a genuinely different account than the one already
// resolving, e.g. a fast sign-out+sign-in-as-someone-else while the first
// account's `sync-saved` round-trip is still pending) would silently never
// get resolved at all: not just its EVT.ACCOUNT_DATA_RESOLVED dispatch (see
// showWelcomeGreeting()'s uid-scoping fix in utils.js), but its actual cloud
// state (favourites/pins/home) too, since nothing else re-triggers
// _handleSignIn() for it. The in-flight call's own `finally` checks this
// flag and, if set, re-runs _handleSignIn() once more — which always
// resolves whichever account is ACTUALLY signed in at that later point (via
// a fresh auth.getCachedAccount()/getIdToken() read), so one rerun correctly
// coalesces any number of skipped attempts into the one that still matters.
// Found by adversarial review — see docs/PREFERENCE_LOG.md.
let _rerunRequested = false;

/**
 * Resolve this account's cloud state on sign-in (interactive, or an
 * already-signed-in session restoring on page load): fetch the account's
 * saved-places rows, and either (a) go straight to cloud-scoped mode if the
 * account already has cloud data or has already resolved its one-time import
 * decision, or (b) — only for a genuinely first-ever sign-in with local
 * device data present and nothing decided yet — show the one-time import
 * dialog before entering cloud-scoped mode either way.
 *
 * Favourite/pin/home mutations are blocked (via setFavouritesSyncPending()/
 * setPinsHomeSyncPending()) for this entire function's duration, not just
 * after it resolves — the network round-trip below (a GAS cold start can be
 * hundreds of ms) plus a possible confirm-dialog wait both happen BEFORE
 * places.js/utils.js actually flip into cloud mode. A favourite tapped in
 * that window would otherwise still write straight into the local device
 * cache and then get silently discarded moments later when the cloud state
 * lands — but the localStorage write would already have happened, reopening
 * the exact cross-account bleed this whole model exists to close.
 * @returns {Promise<void>}
 */
async function _handleSignIn() {
  if (_syncing) {
    // Don't just drop this attempt — it can belong to a genuinely different
    // account than the one currently resolving (see _rerunRequested's own
    // comment above). Queue exactly one rerun, which will read whichever
    // account is actually signed in once it fires.
    _rerunRequested = true;
    return;
  }
  _syncing = true;
  setFavouritesSyncPending(true);
  setPinsHomeSyncPending(true);
  const generation = _syncGeneration;
  try {
    const auth = await _getAuthModule();
    const idToken = await auth.getIdToken();
    if (!idToken) return;
    // Captured immediately alongside idToken, BEFORE the (potentially slow)
    // sync-saved round-trip below — not re-read fresh at dispatch time. If
    // re-read fresh instead, a still-in-flight call for account A whose
    // stale-generation guard below doesn't happen to catch it (no sign-out
    // occurred, just a same-tab account swap) would report A's fetched data
    // tagged with WHICHEVER account is cached by the time this line runs,
    // which could by then be a completely different account B — a data/uid
    // mismatch. Capturing here ties the uid to the exact identity the
    // idToken (and therefore `result` below) actually belongs to.
    const uid = auth.getCachedAccount()?.uid;

    const result = await _callAccountApi("sync-saved", {}, idToken);
    if (generation !== _syncGeneration) return; // signed out while this was in flight
    const saved = Array.isArray(result.saved) ? result.saved : [];
    const alreadyResolved = saved.length > 0 || !!result.localImportResolved;
    // Announce this as soon as it's known (before either branch below runs,
    // and specifically before the "not yet resolved" branch's own possible
    // import-confirm-dialog wait) — src/utils.js's showWelcomeGreeting() uses
    // this to correct a "Welcome back" greeting for the "erased data, signed
    // back in with the same credentials" edge case, where Firebase's own
    // isNewUser flag can't tell that apart from a genuinely returning user.
    // Fires on every sign-in resolution, including a plain page-load session
    // restore — harmless, since only a caller with a pending correction is
    // listening for it at any given moment (see EVT.ACCOUNT_DATA_RESOLVED's
    // doc comment in src/events.js). `uid` scopes this resolution to THIS
    // account specifically — required so a listener registered for a
    // different, earlier sign-in attempt can tell this event isn't its own
    // and ignore it, rather than misattributing this account's result to
    // whoever it was actually listening on behalf of.
    //
    // Deliberately NOT `alreadyResolved` here — that flag answers a different
    // question (should the local-import-merge prompt be skipped), scoped only
    // to SavedPlaces rows/localImportResolved. It's false for a real returning
    // account that has only ever written reviews/submissions and never saved
    // a place — which showed BOTH "Welcome back" and a corrective "Welcome"
    // toast for a pre-existing account (reported bug). `isFirstEverSignIn`
    // comes straight from Code.gs's ensureFirstSeenAt(), which is true only
    // when THIS call is the very first "account" POST ever made for this
    // emailHash — the correct, source-agnostic signal for "has this account
    // been seen before, in any capacity."
    const hasPriorData = !result.isFirstEverSignIn;
    window.dispatchEvent(new CustomEvent(EVT.ACCOUNT_DATA_RESOLVED, { detail: { uid, hasPriorData } }));

    if (alreadyResolved) {
      const favIds = saved.filter((s) => s.kind === "favorite").map((s) => s.placeId);
      const pins = saved.filter((s) => s.kind === "pin").map((s) => ({ lat: s.pinLat, lng: s.pinLng, name: s.pinName }));
      const homeRow = saved.find((s) => s.kind === "home");
      const home = homeRow ? { lat: homeRow.pinLat, lng: homeRow.pinLng, name: homeRow.pinName } : null;
      _enterCloudState(favIds, pins, home);
      return;
    }

    // Not yet resolved and the cloud account is empty — check whether THIS
    // device has anything worth offering to import.
    const localFavIds = getFavouriteIds();
    const localPins = getSavedPins();
    const localHome = getHomeLocation();
    const localCount = localFavIds.length + localPins.length + (localHome ? 1 : 0);

    if (localCount === 0) {
      // Nothing to import and nothing decided — enter empty cloud mode
      // without marking this account resolved, so a different device that
      // DOES have local data can still be offered the prompt later.
      _enterCloudState([], [], null);
      return;
    }

    const noun = localCount === 1 ? "saved place" : "saved places";
    const confirmed = await showConfirmDialog({
      title: "Import your saved places?",
      message: `Import ${localCount} ${noun} from this device into your account? This only happens once — you can always add more later.`,
      confirmLabel: "Import",
      cancelLabel: "Not now",
      variant: "default",
      icon: IMPORT_ICON_SVG,
    });
    if (generation !== _syncGeneration) return; // signed out while the dialog was open

    if (confirmed) {
      await _pushLocalDataToCloud(idToken, localFavIds, localPins, localHome, generation);
      if (generation !== _syncGeneration) return;
    }
    // Either way, this account's one-time decision is now made — never offer
    // this prompt again, on any device.
    await _callAccountApi("resolve-import", {}, idToken);
    if (generation !== _syncGeneration) return;
    _enterCloudState(confirmed ? localFavIds : [], confirmed ? localPins : [], confirmed ? localHome : null);
  } finally {
    _syncing = false;
    setFavouritesSyncPending(false);
    setPinsHomeSyncPending(false);
    if (_rerunRequested) {
      // Exactly one rerun, regardless of how many attempts were queued while
      // this call was running — it re-reads auth.getCachedAccount()/
      // getIdToken() from scratch, so it always resolves whichever account
      // is ACTUALLY signed in by now (the last one to arrive), not a stale
      // snapshot of whichever attempt happened to set this flag first.
      _rerunRequested = false;
      _handleSignIn();
    }
  }
}

/**
 * Fire a background save/unsave for a favourite/pin/home toggle that has
 * already been applied optimistically to the in-memory state. Optimistic
 * means the STATE change is instant (the caller already applied it before
 * calling this) — it does NOT mean announcing a result before it's known.
 * This function is the one place that actually knows the real outcome, so
 * every "did it work" callback belongs here, not at the call site:
 *   - `onSignedOut`: there is no cloud round-trip to wait for at all (signed
 *     out is a purely local, synchronous operation) — safe to confirm right
 *     away, since nothing further can fail.
 *   - `onSuccess`: the cloud request actually confirmed. This is the ONLY
 *     correct moment for a "Saved" toast when the caller is signed in —
 *     showing it earlier (e.g. immediately after the optimistic local
 *     mutation, before this async call even starts) is exactly the bug that
 *     produced a "Pin saved" success toast stacked with a later "Couldn't
 *     save pin" failure toast for the SAME action (reported 2026-08-03).
 *   - `onFailure`: the request failed (or never had a valid session) — rolls
 *     the optimistic state back AND is the moment to show a failure toast.
 *
 * `_syncGeneration` is captured here, as the very first line — before any
 * `await`, so it's equivalent to capturing it at the moment the optimistic
 * mutation happened (the caller invokes this synchronously right after that
 * mutation, with no `await` in between). `onFailure` only runs if the
 * generation hasn't changed by the time the request resolves. Without this,
 * a sign-out that happens WHILE this request is in flight leaves
 * `onFailure`'s rollback pointed at whatever the CURRENT state now is — which
 * is the just-restored local device cache, not the cloud state the mutation
 * actually applied to — silently corrupting the local cache with a rollback
 * that was never about it. Same guard applies to `onSuccess` for the
 * identical reason — a stale success callback firing after a sign-out would
 * announce success against an account that's no longer active.
 * @param {string} kind - "favorite" | "pin" | "home"
 * @param {string} action - "save" | "unsave"
 * @param {object} fields - extra payload fields (placeId, pinLat, etc.)
 * @param {{onSuccess?: () => void, onFailure?: () => void, onSignedOut?: () => void}} callbacks
 * @returns {Promise<void>}
 */
async function _backgroundSync(kind, action, fields, { onSuccess, onFailure, onSignedOut } = {}) {
  const generation = _syncGeneration;
  const auth = await _getAuthModule();
  if (!auth.getCachedAccount()) { onSignedOut?.(); return; } // signed out — nothing async to wait for, confirm right away
  const idToken = await auth.getIdToken();
  if (!idToken) { if (generation === _syncGeneration) onFailure?.(); return; }
  const result = await _callAccountApi(action, { kind, ...fields }, idToken);
  if (generation !== _syncGeneration) return;
  if (result.success) onSuccess?.();
  else onFailure?.();
}

/**
 * Initialize account sync: resolves cloud state on sign-in, on every app
 * load where a cached signed-in account already exists, reverts to the local
 * device cache on sign-out, and keeps every subsequent favourite/pin/home
 * toggle synced to the cloud in the background. Call once, after auth.js's
 * initAuth() has run (same lazy-load timing as the Account section).
 * @returns {void}
 */
export function initAccountSync() {
  window.addEventListener(EVT.AUTH_CHANGED, (e) => {
    if (e.detail?.account) _handleSignIn();
    else _exitCloudState();
  });

  window.addEventListener(EVT.FAVOURITE_TOGGLED, (e) => {
    const { placeId, saved } = e.detail || {};
    if (!placeId) return;
    _backgroundSync("favorite", saved ? "save" : "unsave", { placeId }, {
      // No onSuccess/onSignedOut — favouriting has never shown a toast at
      // all (the star icon's own fill/unfill is the confirmation), only a
      // rollback + explanation on actual failure.
      onFailure: () => {
        setFavouriteState(placeId, !saved);
        window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} }));
        showToast(saved ? "Couldn't save favourite" : "Couldn't remove favourite", "error", "Please try again");
      },
    });
  });

  // Pin save/remove toast now lives entirely here, not at the click-handler
  // call site (src/search.js / src/transit-stops.js no longer show one at
  // all) — this is the only place that actually knows whether the action
  // succeeded. Signed out: nothing async happens, so confirming immediately
  // is honest. Signed in: wait for the real cloud result — showing "Pin
  // saved" before that was confirmed is exactly what produced a stacked
  // "Pin saved" + "Couldn't save pin" pair for the same tap (reported bug).
  window.addEventListener(EVT.SAVED_PIN_TOGGLED, (e) => {
    const { lat, lng, name, saved } = e.detail || {};
    if (lat == null || lng == null) return;
    const confirmToast = () => showToast(saved ? "Pin saved" : "Pin removed", "check");
    _backgroundSync("pin", saved ? "save" : "unsave", { pinLat: lat, pinLng: lng, pinName: name }, {
      onSignedOut: confirmToast,
      onSuccess: confirmToast,
      onFailure: () => {
        setSavedPinState(lat, lng, name, !saved);
        window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} }));
        showToast(saved ? "Couldn't save pin" : "Couldn't remove pin", "error", "Please try again");
      },
    });
  });

  // hf:home-updated is a pre-existing string-literal event (utils.js) — kept
  // as-is rather than routed through EVT, per this codebase's convention of
  // not retrofitting every existing event name (see src/events.js header).
  // Home's own "Home saved... Saved locally on this device" toast (shown at
  // the call site, src/search.js) is honest as written — it's true the
  // instant it fires, regardless of whether the background cloud sync below
  // later succeeds or fails, so it doesn't have the pin toast's bug and
  // isn't changed here — only the failure/rollback path is this function's
  // job.
  window.addEventListener("hf:home-updated", (e) => {
    if (_suppressHomeBackgroundSync) return; // this exact event was just fired by our own cloud-mode entry/exit above
    const home = e.detail?.home;
    if (home) {
      _backgroundSync("home", "save", { pinLat: home.lat, pinLng: home.lng, pinName: home.name }, {
        onFailure: () => {
          // Not a full rollback (the previous home, if any, isn't captured
          // here) — surfacing the failure is still strictly better than the
          // previous silent no-op, which gave no indication anything was wrong.
          showToast("Couldn't sync home location", "error", "Please try again");
        },
      });
    } else {
      _backgroundSync("home", "unsave", {}, {
        onFailure: () => showToast("Couldn't sync home removal", "error", "Please try again"),
      });
    }
  });

  // Explicitly resolve cloud state on every app load whenever a cached
  // signed-in account already exists — not only reactively on a fresh
  // EVT.AUTH_CHANGED. Firebase's onAuthStateChanged callback restoring an
  // already-signed-in persisted session does already dispatch
  // EVT.AUTH_CHANGED on its own (confirmed via a full trace of src/auth.js
  // and this module's listener-registration order — see
  // docs/PREFERENCE_LOG.md), so this call is a deliberate, explicit
  // belt-and-suspenders duplicate of that path rather than the primary fix
  // for "doesn't resolve on load" — it doesn't depend on that implicit SDK
  // timing guarantee holding in every future SDK version/environment.
  // _handleSignIn()'s own `_syncing` guard makes calling it from both places
  // harmless if both actually fire.
  _getAuthModule().then((auth) => {
    if (auth.getCachedAccount()) _handleSignIn();
  });
}
