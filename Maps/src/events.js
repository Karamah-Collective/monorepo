/**
 * Central registry of `CustomEvent` names for the accounts/sync features
 * introduced in docs/ACCOUNTS_AND_REDESIGN_PLAN.md (Phases 5-8).
 *
 * Per the code-quality convention (§I.7 in .github/agents/the-architect.agent.md),
 * new `window.dispatchEvent`/`addEventListener` call sites should reference a
 * name from here instead of a raw string literal. Pre-existing `hf:*` events
 * elsewhere in the codebase (e.g. `hf:reviews-loaded`, `hf:home-updated`) predate
 * this registry and are intentionally left as string literals — retrofitting
 * every existing event name is a larger refactor out of scope for this change.
 */
export const EVT = {
  /** Fired on window whenever the signed-in Firebase account changes (sign-in,
   *  sign-out, or auth state restored on load). detail: { account: {uid,email,displayName}|null } */
  AUTH_CHANGED: "hf:auth-changed",
  /** Fired on window whenever a signed-in user's server-synced favourites/
   *  saved pins/home location have just changed: on sign-in/sign-out (a full
   *  merge with the server-synced copies), and — since 2026-08-03, see
   *  docs/PREFERENCE_LOG.md's "Saved pins" stats-staleness fix — after EVERY
   *  individual favourite/pin background save-or-unsave request resolves,
   *  success or failure alike (src/account-sync.js's _backgroundSync()
   *  callbacks). Anything that derives its own state from the server's
   *  saved-places list rather than this module's in-memory mirror (e.g.
   *  src/profile.js's contribution stats) should listen for this rather than
   *  assuming its own last-fetched snapshot is still current. detail: {} */
  SAVED_SYNCED: "hf:saved-synced",
  /** Fired by toggleFavourite() (places.js) on every toggle, signed in or not —
   *  src/account-sync.js listens to fire a background save/unsave when signed in.
   *  detail: { placeId: string, saved: boolean } */
  FAVOURITE_TOGGLED: "hf:favourite-toggled",
  /** Fired by toggleSavedPin() (utils.js) on every toggle, same pattern as
   *  FAVOURITE_TOGGLED above. detail: { lat: number, lng: number, name: string, saved: boolean } */
  SAVED_PIN_TOGGLED: "hf:saved-pin-toggled",
  /** Fired by toggleVisited() (places.js) on every toggle, signed in or not —
   *  same pattern as FAVOURITE_TOGGLED above, just a different `kind`
   *  ("visited" vs "favorite") on the SavedPlaces row. This is a manual,
   *  unverified "I've been here" mark (no GPS check, no confirmed date) —
   *  purely a badge-eligibility signal (see account-profile.js's Explorer
   *  category), NOT the future location-verified visitor-timeline feature.
   *  src/account-sync.js listens to fire a background save/unsave when
   *  signed in. detail: { placeId: string, visited: boolean } */
  VISITED_TOGGLED: "hf:visited-toggled",
  /** Fired by submitReview() (reviews.js) after a review write actually
   *  succeeds server-side — narrower and rarer than the generic (pre-EVT-registry)
   *  `hf:reviews-loaded`, which fires for ANY place's rating cache being
   *  hydrated/patched, not just the current user's own submission. src/menu.js
   *  listens for this to keep the account menu's "Your reviews" list live
   *  without re-fetching on every unrelated `hf:reviews-loaded` firing.
   *  detail: { placeId: string, rating: number, text: string, status?: string } */
  MY_REVIEW_SUBMITTED: "hf:my-review-submitted",
  /** Fired by src/account-sync.js's _handleSignIn() once it has determined
   *  whether the signed-in account has any prior server-side data (saved
   *  places/pins/home, or an already-resolved local-import decision) —
   *  fires on every sign-in resolution, including a plain session restore on
   *  page load, not just a fresh interactive sign-in. src/utils.js's
   *  showWelcomeGreeting() listens for this (one-shot, per call) to correct
   *  a "Welcome back" greeting to "Welcome" for the "erased data, signed
   *  back in with the same credentials" edge case, where Firebase's own
   *  isNewUser flag incorrectly says "returning" (see docs/PREFERENCE_LOG.md's
   *  Phase 7 welcome-toast writeup for the full rationale).
   *  `uid` identifies WHICH account this resolution is for — required so a
   *  listener registered for one sign-in attempt can ignore a same-named
   *  event that actually resolved for a different account that signed in
   *  shortly after (found by adversarial review — see
   *  docs/PREFERENCE_LOG.md's cross-account welcome-toast-misattribution
   *  writeup). Never compare on generation/session epoch alone; compare on
   *  `uid`, since a listener must react only to ITS OWN account's
   *  resolution, not merely "the next resolution to fire".
   *  detail: { uid: string, hasPriorData: boolean } */
  ACCOUNT_DATA_RESOLVED: "hf:account-data-resolved",
  /** Fired by src/profile.js when it needs to close the WHOLE merged
   *  Menu/Profile sheet (e.g. navigating away to view a place from a review
   *  row, or right after "Erase my data" succeeds) rather than just its own
   *  pane — src/menu.js owns the merged sheet's lifecycle (it's the only
   *  module that ever calls initSheetDrag()/openMenuSheet()/closeMenuSheet()
   *  for it) and listens for this. Event-based (rather than profile.js
   *  importing closeMenuSheet from src/menu.js directly) to avoid a circular
   *  import: src/menu.js already statically imports loadProfileContent from
   *  src/profile.js (same avoid-circular-imports-via-events convention
   *  src/account-sync.js's own header comment documents for its own
   *  places.js/utils.js imports). Navigating BETWEEN the two panes (Menu ↔
   *  Profile) needs no event at all any more — that's a same-module pane
   *  swap entirely inside src/menu.js now that both panes live in one
   *  physical sheet. detail: {} */
  ACCOUNT_SHEET_CLOSE: "hf:account-sheet-close",
  /** Fired by src/profile.js's loadProfileContent() right after its first,
   *  synchronous _renderCard() call — on the very first Profile visit in a
   *  session, that call swaps the identity card from a one-line "Loading…"
   *  placeholder to the real (noticeably taller) avatar/name/email/sign-out
   *  card, BEFORE the async reviews/submissions/account-meta fetch even
   *  starts. Without a resync at that exact point, src/menu.js's
   *  _syncPaneHeight() (called once already, at pane-switch time) has
   *  already pinned #mp-height-wrap to the shorter "Loading…" measurement —
   *  so the now-taller card pushes everything below it (down through "Your
   *  data") past that pinned height, clipped by #mp-pane-track's
   *  overflow:hidden until the second, post-fetch sync corrects it (reported
   *  as "Your data looks cropped while Profile is loading, self-corrects
   *  once it finishes" — see docs/PREFERENCE_LOG.md). Event-based rather
   *  than profile.js importing menu.js's private _syncPaneHeight() directly,
   *  same avoid-circular-imports convention as ACCOUNT_SHEET_CLOSE above.
   *  detail: {} */
  PROFILE_CARD_RENDERED: "hf:profile-card-rendered",
};
