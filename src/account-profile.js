/**
 * Account contribution profile — pure aggregation/formatting helpers for the
 * dedicated Profile page (docs/ACCOUNTS_AND_REDESIGN_PLAN.md Phase 3/4).
 *
 * Parallels src/account-sync.js's scope (a small, focused module kept out of
 * src/menu.js, which is already large, and out of src/profile.js, a later
 * phase) but does no fetching or side effects of its own — every input here
 * is an array already fetched elsewhere: fetchMyReviews() (reviews.js), the
 * sync-saved response's `saved` list (account-sync.js), and
 * fetchMySubmittedPlaces()/fetchMySubmittedEdits() (places.js).
 */

// "Member since" display, e.g. "August 2026" — index into this by
// Date#getMonth() (0-based).
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Tally a signed-in user's contribution activity into simple counts for the
 * Profile page's stats grid. Pure function — no fetching, no side effects;
 * every input is an array the caller already has from an existing fetch.
 * @param {Object} [input]
 * @param {Array} [input.reviews] - fetchMyReviews()'s `reviews` array (reviews.js)
 * @param {Array<{kind: string}>} [input.savedPlaces] - the `saved` array from
 *   account-sync.js's sync-saved response (each row's `kind` is
 *   "favorite" | "pin" | "home")
 * @param {Array} [input.submittedPlaces] - fetchMySubmittedPlaces()'s
 *   `submissions` array (places.js)
 * @param {Array} [input.submittedEdits] - fetchMySubmittedEdits()'s
 *   `submissions` array (places.js)
 * @returns {{reviewCount: number, favoriteCount: number, pinCount: number, hasHome: boolean, placesAddedCount: number, editsCount: number}}
 */
export function computeContributionStats({ reviews = [], savedPlaces = [], submittedPlaces = [], submittedEdits = [] } = {}) {
  const reviewList = Array.isArray(reviews) ? reviews : [];
  const saved = Array.isArray(savedPlaces) ? savedPlaces : [];
  const places = Array.isArray(submittedPlaces) ? submittedPlaces : [];
  const edits = Array.isArray(submittedEdits) ? submittedEdits : [];

  return {
    reviewCount: reviewList.length,
    favoriteCount: saved.filter((s) => s.kind === "favorite").length,
    pinCount: saved.filter((s) => s.kind === "pin").length,
    hasHome: saved.some((s) => s.kind === "home"),
    placesAddedCount: places.length,
    editsCount: edits.length,
  };
}

/**
 * Format an account's AccountMeta.firstSeenAt ISO timestamp (Phase 6) for the
 * Profile page's "Member since" display, e.g. "August 2026".
 *
 * No existing date-formatting utility in this codebase covers a plain
 * month/year calendar display — src/utils.js has none, and the closest
 * precedents (menu.js's/reviews.js's `_timeAgo`/`_relativeTime`) are relative
 * ("3mo ago"), module-private, and duplicated between the two files rather
 * than a shared exported utility — so this is the simplest correct formatter
 * for the job rather than a new general-purpose date utility.
 * @param {string?} firstSeenAt - ISO 8601 timestamp, or null/undefined if unknown
 * @returns {string} e.g. "August 2026", or "" if firstSeenAt is missing/invalid
 */
export function formatMemberSince(firstSeenAt) {
  if (!firstSeenAt) return "";
  const d = new Date(firstSeenAt);
  if (isNaN(d.getTime())) return "";
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
