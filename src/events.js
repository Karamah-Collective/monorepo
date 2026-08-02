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
  /** Fired on window after a signed-in user's local favourites/saved pins/home
   *  location have finished merging with their server-synced copies. detail: {} */
  SAVED_SYNCED: "hf:saved-synced",
  /** Fired by toggleFavourite() (places.js) on every toggle, signed in or not —
   *  src/account-sync.js listens to fire a background save/unsave when signed in.
   *  detail: { placeId: string, saved: boolean } */
  FAVOURITE_TOGGLED: "hf:favourite-toggled",
  /** Fired by toggleSavedPin() (utils.js) on every toggle, same pattern as
   *  FAVOURITE_TOGGLED above. detail: { lat: number, lng: number, name: string, saved: boolean } */
  SAVED_PIN_TOGGLED: "hf:saved-pin-toggled",
};
