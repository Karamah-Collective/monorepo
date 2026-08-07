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
  showBadgeNotice,
} from "./utils.js";
import {
  getFavouriteIds, setFavouriteState, enterCloudFavourites, exitCloudFavourites, setFavouritesSyncPending,
  getVisitedIds, setVisitedState, enterCloudVisited, exitCloudVisited, setVisitedSyncPending,
  fetchMySubmittedPlaces, fetchMySubmittedEdits,
} from "./places.js";
import { computeBadges, diffBadgeLevelUps, buildBadgeSnapshot } from "./account-profile.js";

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

// Namespaced localStorage snapshot of each badge category's last-seen tier/
// level step, used by _checkBadgeLevelUps() below to detect a crossing since
// the last check — the badge equivalent of places.js's own
// STORAGE_KEY_SUBMISSION_STATUS/diffSubmissionStatuses() pattern.
//
// Shape: {uid, steps: {reviewer: step|null, …}} — ONE account's snapshot,
// tagged with whose it is. `v1` stored the bare steps object with no owner, so
// on a shared device signing in as B read A's steps as B's baseline and either
// announced a badge B never earned (A's step lower) or swallowed one B did
// (A's step higher). Reading it back for a different uid now deliberately
// yields {} — treated as "no previous snapshot", which diffBadgeLevelUps()
// already handles as "baseline quietly, announce nothing", so a returning
// account re-baselines instead of being told something false. Deliberately
// NOT a uid→steps map: keeping every account that ever signed in on this
// device would retain per-account achievement history in localStorage, which
// cuts against this module's own "the local device cache is never written
// while signed in" privacy rule (see the file header) for no real benefit.
const STORAGE_KEY_BADGE_SNAPSHOT = "hf_badge_snapshot_v2";
// v1's unkeyed predecessor, cleared on first write so it doesn't linger.
const STORAGE_KEY_BADGE_SNAPSHOT_LEGACY = "hf_badge_snapshot_v1";

/**
 * This account's last-seen badge steps, or {} if the stored snapshot belongs
 * to a different account (or none exists yet).
 * @param {string?} uid - the account the caller is checking badges for
 * @returns {Object<string, number|null>}
 */
function _getBadgeSnapshotCache(uid) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_BADGE_SNAPSHOT) || "{}");
    if (!raw || typeof raw !== "object") return {};
    // Normalized on BOTH sides (here and in _persistBadgeSnapshot) rather than
    // requiring a truthy uid, so an account somehow cached without one — which
    // Firebase shouldn't produce — degrades to v1's device-wide behavior
    // instead of to "no snapshot ever matches, so no level-up is ever
    // announced again", a silent failure that would be hard to notice.
    if ((raw.uid || "") !== (uid || "")) return {};
    return raw.steps && typeof raw.steps === "object" ? raw.steps : {};
  } catch {
    return {};
  }
}

/**
 * Record this account's current badge steps as the new baseline.
 *
 * MERGES into whatever this same account already had rather than replacing it
 * wholesale, because a check doesn't always cover all four categories: the
 * in-session recheck (see _scheduleBadgeRecheck()) only knows the three
 * categories `sync-saved` carries data for, and a plain replace would write
 * Contributor back as "unranked", erasing this device's record of it and
 * making the next app load re-announce a badge it had already announced. A
 * different account's snapshot is replaced, not merged into — its steps say
 * nothing about this one.
 * @param {ReturnType<typeof computeBadges>} badges - only the categories this check actually computed
 * @param {string?} uid
 * @returns {void}
 */
function _persistBadgeSnapshot(badges, uid) {
  try {
    const steps = { ..._getBadgeSnapshotCache(uid), ...buildBadgeSnapshot(badges) };
    localStorage.setItem(STORAGE_KEY_BADGE_SNAPSHOT, JSON.stringify({ uid: uid || "", steps }));
    localStorage.removeItem(STORAGE_KEY_BADGE_SNAPSHOT_LEGACY);
  } catch {
    /* localStorage unavailable (private browsing quota, etc.) — non-fatal */
  }
}

// In-session badge recheck (see _scheduleBadgeRecheck()) — how long to wait
// after a badge-relevant action before actually running the check, so a burst
// of them (tapping "mark as visited" down a list of places) collapses into one
// check instead of one per tap. Long enough to coalesce a realistic burst,
// short enough that the notice still reads as a response to what the user just
// did rather than something unrelated arriving later.
const BADGE_RECHECK_DEBOUNCE_MS = 2000;
let _badgeRecheckTimer = null;
// A check is currently mid-flight (it always makes at least one network call,
// so this is a real window). Two overlapping checks would BOTH diff against
// the same not-yet-updated snapshot and both show the same notice, so a second
// request arriving during one is deferred rather than run alongside it.
let _badgeCheckRunning = false;
let _badgeRecheckQueued = false;

// The three categories computable from a `sync-saved` response ALONE:
// Reviewer/Explorer from its lifetime counters, Veteran from its firstSeenAt.
// The in-session recheck covers exactly these, which is why it needs one
// request rather than three — Contributor is the only category that requires
// the submitted-places/edits fetches, and it can't change in-session anyway
// (see _checkBadgeLevelUps()).
const SYNC_SAVED_BADGE_KEYS = ["reviewer", "explorer", "veteran"];

/**
 * Check for a badge level-up since the last check and show one closable
 * showBadgeNotice() per category that crossed. Runs on every app load/sign-in
 * resolution (see _handleSignIn() below) AND, in-session, shortly after any
 * action that can actually raise one of these counts (see
 * _scheduleBadgeRecheck()). Deliberately not gated behind a Profile-pane
 * visit, so a level-up is surfaced to someone just using the map, not only if
 * they happen to check Profile.
 *
 * `keys` selects which categories this run is allowed to judge, and defaults
 * to all four. Contributor's counts need their own two fetches and are
 * filtered to `status === "live"` — a place/edit submission earns badge credit
 * only once a moderator has actually approved it, not at submit time (a
 * still-pending or rejected submission hasn't added anything real yet). Since
 * approval happens out-of-band (a moderator acting while the submitter isn't
 * even in the app), the app-load run is the only one that can ever notice a
 * Contributor crossing — there is no in-session action to hook it to, unlike
 * Reviewer/Explorer. So the in-session recheck passes
 * SYNC_SAVED_BADGE_KEYS and skips those two fetches entirely; the snapshot it
 * writes MERGES (see _persistBadgeSnapshot()), so leaving Contributor unjudged
 * leaves its recorded step untouched rather than erasing it.
 *
 * Serialized, never concurrent: an overlapping call is deferred (and re-run
 * once this one finishes, via _scheduleBadgeRecheck() — which re-fetches, so
 * the deferred run still sees fresh counts) rather than diffing against the
 * same stale snapshot and duplicating a notice.
 *
 * Fire-and-forget from _handleSignIn() — never awaited, so a slow or failed
 * fetch here can't delay entering cloud-scoped mode.
 * @param {{lifetimeReviewCount?: number, lifetimeVisitedCount?: number, firstSeenAt?: string|null}} result - the sync-saved response
 * @param {{uid?: string|null, keys?: string[]}} [opts] - uid: whose snapshot to
 *   diff against/write (see _getBadgeSnapshotCache()); keys: categories this
 *   run may judge, all four when omitted.
 * @returns {Promise<void>}
 */
async function _checkBadgeLevelUps(result, { uid = null, keys = null } = {}) {
  if (_badgeCheckRunning) {
    _badgeRecheckQueued = true;
    return;
  }
  _badgeCheckRunning = true;
  try {
    await _runBadgeLevelUpCheck(result, uid, keys);
  } finally {
    _badgeCheckRunning = false;
  }
  if (_badgeRecheckQueued) {
    _badgeRecheckQueued = false;
    _scheduleBadgeRecheck();
  }
}

/**
 * _checkBadgeLevelUps()'s actual body, split out so the serialization guard
 * above wraps it without an early-return path being able to skip the
 * `_badgeCheckRunning` reset.
 * @param {{lifetimeReviewCount?: number, lifetimeVisitedCount?: number, firstSeenAt?: string|null}} result
 * @param {string?} uid
 * @param {string[]?} keys - null = all categories
 * @returns {Promise<void>}
 */
async function _runBadgeLevelUpCheck(result, uid, keys) {
  // Only fetched when Contributor is actually being judged — the two calls
  // exist solely to resolve its approved-submission counts.
  const needsContributor = !keys || keys.includes("contributor");
  const [placesResult, editsResult] = needsContributor
    ? await Promise.all([fetchMySubmittedPlaces(), fetchMySubmittedEdits()])
    : [{ submissions: [] }, { submissions: [] }];
  const approvedPlacesCount = placesResult.submissions.filter((s) => s.status === "live").length;
  const approvedEditsCount = editsResult.submissions.filter((s) => s.status === "live").length;
  const badges = computeBadges({
    lifetimeReviewCount: Number(result.lifetimeReviewCount) || 0,
    lifetimeVisitedCount: Number(result.lifetimeVisitedCount) || 0,
    placesAddedCount: approvedPlacesCount,
    editsCount: approvedEditsCount,
    firstSeenAt: result.firstSeenAt || null,
  });
  // Categories this run wasn't given the data to judge are dropped BEFORE
  // both the diff and the snapshot write — never judged against counts of 0
  // (which would report no crossing, harmlessly) and never persisted as such
  // (which would NOT be harmless — see _persistBadgeSnapshot()).
  const judged = keys ? badges.filter((b) => keys.includes(b.key)) : badges;
  const levelUps = diffBadgeLevelUps(_getBadgeSnapshotCache(uid), judged);
  for (const b of levelUps) {
    showBadgeNotice({ categoryLabel: b.label, tierName: b.tierName, levelRoman: b.levelRoman, glyph: b.glyph, level: b.level });
  }
  _persistBadgeSnapshot(judged, uid);
}

/**
 * Queue a debounced in-session badge check — call this right after any action
 * that can actually raise a badge count, so crossing a threshold while the app
 * is open is announced there and then instead of waiting for the next app load
 * or a sign-in on another device (reported: "I just added the review that
 * earned it, why am I only told next session?").
 *
 * Only wired to actions whose count the SERVER has already incremented by the
 * time we get here — a new review (EVT.MY_REVIEW_SUBMITTED, dispatched after
 * /api/reviews resolved, and Code.gs's _incrementLifetimeReviewCount() runs
 * inside that same request) and a new visited mark (the VISITED_TOGGLED
 * background save's own onSuccess, likewise after Code.gs's
 * _recordLifetimeVisit()). Hooking anything earlier than the mutation's own
 * success would re-read the counters before they'd moved and find nothing.
 *
 * Not wired to un-marking a visit or deleting a review: both lifetime counters
 * are deliberately never decremented server-side, so neither can produce a
 * level-up and a check would only burn requests. Nor to submitting a place/
 * edit — those earn Contributor credit at APPROVAL, not submission, which is
 * out-of-band by nature (see _checkBadgeLevelUps()'s doc comment) and stays an
 * app-load-only transition.
 * @returns {void}
 */
function _scheduleBadgeRecheck() {
  clearTimeout(_badgeRecheckTimer);
  _badgeRecheckTimer = setTimeout(_recheckBadgesNow, BADGE_RECHECK_DEBOUNCE_MS);
}

/**
 * Re-fetch this account's badge counters and run the level-up check — the
 * debounce target of _scheduleBadgeRecheck() above.
 *
 * Needs its own sync-saved round-trip because the lifetime counters the
 * badges are computed from (`lifetimeReviewCount`/`lifetimeVisitedCount`,
 * Code.gs's AccountMeta columns) live only server-side and aren't returned by
 * the individual save/submit responses — this module's in-memory cloud mirror
 * tracks the CURRENT saved-places set, which is deliberately a different thing
 * from the never-decremented lifetime totals. That ONE request is the whole
 * cost of an in-session check: it carries everything the three in-session
 * categories need (SYNC_SAVED_BADGE_KEYS).
 *
 * Silently does nothing while signed out (badges are an account concept) or if
 * the account changed while the fetch was in flight — same `_syncGeneration`
 * guard every other async path in this module uses. `uid` is captured
 * alongside the token, before the round-trip, for the same reason
 * _handleSignIn() captures it there: it must be the identity the fetched data
 * actually belongs to, not whoever happens to be cached once it returns.
 * @returns {Promise<void>}
 */
async function _recheckBadgesNow() {
  const generation = _syncGeneration;
  const auth = await _getAuthModule();
  const account = auth.getCachedAccount();
  if (!account) return;
  const idToken = await auth.getIdToken();
  if (!idToken) return;
  const uid = account.uid;
  const result = await _callAccountApi("sync-saved", {}, idToken);
  if (generation !== _syncGeneration || !result.success) return;
  await _checkBadgeLevelUps(result, { uid, keys: SYNC_SAVED_BADGE_KEYS });
}

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
 * @param {string[]} visitedIds
 * @param {number} generation - _syncGeneration captured when this import began
 * @returns {Promise<void>}
 */
async function _pushLocalDataToCloud(idToken, favIds, pins, home, visitedIds, generation) {
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
  for (const placeId of visitedIds) {
    if (generation !== _syncGeneration) return;
    await _callAccountApi("save", { kind: "visited", placeId }, idToken);
  }
}

/**
 * Put places.js/utils.js into cloud-scoped mode with the given data and
 * announce it to the UI. The one place every sign-in path (fresh server
 * state, or a just-accepted local import) funnels through.
 * @param {string[]} favIds
 * @param {Array<{lat:number,lng:number,name:string}>} pins
 * @param {{lat:number,lng:number,name:string}|null} home
 * @param {string[]} visitedIds
 * @returns {void}
 */
function _enterCloudState(favIds, pins, home, visitedIds) {
  enterCloudFavourites(favIds);
  enterCloudVisited(visitedIds);
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
  exitCloudVisited();
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
 * after it resolves — the network round-trip below plus a possible
 * confirm-dialog wait both happen BEFORE
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
  setVisitedSyncPending(true);
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
      const visitedIds = saved.filter((s) => s.kind === "visited").map((s) => s.placeId);
      _enterCloudState(favIds, pins, home, visitedIds);
      // Fire-and-forget — never blocks entering cloud mode. All 4 categories
      // (no `keys`): this is the one run that can notice a Contributor
      // crossing, since approval happens while the user isn't in the app.
      // `uid` is the one captured above, alongside the token this `result`
      // came from — see _getBadgeSnapshotCache() for why the snapshot is
      // account-scoped.
      _checkBadgeLevelUps(result, { uid });
      return;
    }

    // Not yet resolved and the cloud account is empty — check whether THIS
    // device has anything worth offering to import.
    const localFavIds = getFavouriteIds();
    const localPins = getSavedPins();
    const localHome = getHomeLocation();
    const localVisitedIds = getVisitedIds();
    const localCount = localFavIds.length + localPins.length + (localHome ? 1 : 0) + localVisitedIds.length;

    if (localCount === 0) {
      // Nothing to import and nothing decided — enter empty cloud mode
      // without marking this account resolved, so a different device that
      // DOES have local data can still be offered the prompt later.
      _enterCloudState([], [], null, []);
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
      await _pushLocalDataToCloud(idToken, localFavIds, localPins, localHome, localVisitedIds, generation);
      if (generation !== _syncGeneration) return;
    }
    // Either way, this account's one-time decision is now made — never offer
    // this prompt again, on any device.
    await _callAccountApi("resolve-import", {}, idToken);
    if (generation !== _syncGeneration) return;
    _enterCloudState(
      confirmed ? localFavIds : [],
      confirmed ? localPins : [],
      confirmed ? localHome : null,
      confirmed ? localVisitedIds : [],
    );
  } finally {
    _syncing = false;
    setFavouritesSyncPending(false);
    setPinsHomeSyncPending(false);
    setVisitedSyncPending(false);
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

  // A new review is the other in-session action that can earn a badge (the
  // Reviewer category). EVT.MY_REVIEW_SUBMITTED fires from reviews.js's
  // submitReview() only after /api/reviews has confirmed the write, which is
  // the same request Code.gs increments the lifetime review counter inside —
  // so by the time this runs the count this reads has already moved. Editing
  // an existing review dispatches the same event but deliberately does NOT
  // increment that counter server-side, so the check just finds no crossing
  // and shows nothing; not worth distinguishing here, since the alternative
  // (trusting a client-side "was this an edit?" guess) could miss a real
  // level-up. See _scheduleBadgeRecheck().
  window.addEventListener(EVT.MY_REVIEW_SUBMITTED, () => _scheduleBadgeRecheck());

  window.addEventListener(EVT.FAVOURITE_TOGGLED, (e) => {
    const { placeId, saved } = e.detail || {};
    if (!placeId) return;
    _backgroundSync("favorite", saved ? "save" : "unsave", { placeId }, {
      // No toast on success — favouriting has never shown one at all (the
      // star icon's own fill/unfill is the confirmation) — but SAVED_SYNCED
      // still fires so anything deriving state from the server's saved-places
      // list (src/profile.js's contribution stats) knows a mutation actually
      // landed. Previously only the onFailure rollback below fired this event,
      // which meant a *successful* toggle never told anyone — see this
      // function's own SAVED_SYNCED-on-success fix, 2026-08-03 (Profile's
      // "Saved pins"/"Favourites" counts staying stale until a full reload —
      // see docs/PREFERENCE_LOG.md).
      onSuccess: () => window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} })),
      onFailure: () => {
        setFavouriteState(placeId, !saved);
        window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} }));
        showToast(saved ? "Couldn't save favourite" : "Couldn't remove favourite", "error", "Please try again");
      },
    });
  });

  // Same shape as EVT.FAVOURITE_TOGGLED above — no success toast (the
  // button's own fill/unfill is the confirmation), but SAVED_SYNCED still
  // fires so src/profile.js's badge/stats computation picks up the change
  // without waiting for a full Profile reload.
  window.addEventListener(EVT.VISITED_TOGGLED, (e) => {
    const { placeId, visited } = e.detail || {};
    if (!placeId) return;
    _backgroundSync("visited", visited ? "save" : "unsave", { placeId }, {
      onSuccess: () => {
        window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} }));
        // Only a NEW mark can move the Explorer badge — the server's lifetime
        // visited SET is never shrunk by an un-mark, and re-marking a place
        // already in it doesn't grow it either (the check simply finds no
        // crossing in that case, so no notice). Scheduled from onSuccess
        // specifically: the counter this reads has only just been incremented
        // by the request that resolved into this callback.
        if (visited) _scheduleBadgeRecheck();
      },
      onFailure: () => {
        setVisitedState(placeId, !visited);
        window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} }));
        showToast(visited ? "Couldn't mark as visited" : "Couldn't remove visited mark", "error", "Please try again");
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
      // SAVED_SYNCED fires here too (not just onFailure below) — this is the
      // ONLY signal anything gets that a pin save/unsave actually landed
      // server-side. Without it, src/profile.js's contribution stats (which
      // read the server's saved-places list, not this module's in-memory
      // mirror) had no way to know a *successful* toggle happened and stayed
      // stale until the next full page reload happened to outlast this
      // fire-and-forget request. See docs/PREFERENCE_LOG.md, 2026-08-03.
      onSuccess: () => { confirmToast(); window.dispatchEvent(new CustomEvent(EVT.SAVED_SYNCED, { detail: {} })); },
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
  // Home's own success toast is shown at the call site, src/search.js, where
  // it can distinguish signed-out device storage from signed-in account sync.
  // Only the failure/rollback path belongs in this function.
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
