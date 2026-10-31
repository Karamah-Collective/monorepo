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
    // Current (live) count of places marked "visited" — kind==="visited" on
    // the same SavedPlaces rows favorite/pin/home already come from. This is
    // a plain live count for the stats grid; the Explorer BADGE below uses
    // the separate server-side lifetime counter instead (see badges plan),
    // since unmarking a place would otherwise let this number regress.
    visitedCount: saved.filter((s) => s.kind === "visited").length,
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

// ─── Badges (non-location, tiered) ───────────────────────────────────────────
// See the approved plan (badges feature, this session) for the full design
// rationale — summarized here: 6 tiers × 3 levels = 18 steps per category,
// tier shown via icon treatment (fill/ring/accent, src/profile.js), level
// shown via one of 3 universal colors (--badge-lvl-1/2/3, styles.css). A
// user's current tier/level is a complete record on its own — since
// thresholds only increase and every category's underlying count is a true
// lifetime counter (never decreases), reaching e.g. Gold II mathematically
// implies Bronze I through Gold I were already earned. Nothing else needs to
// be stored.

export const TIER_NAMES = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Legend"];
export const LEVEL_ROMAN = ["I", "II", "III"];
const LEVELS_PER_TIER = 3;
const TOTAL_STEPS = TIER_NAMES.length * LEVELS_PER_TIER; // 18

/**
 * Generate an ascending array of `count` thresholds, each roughly
 * `previous × growth` (rounded), starting from `base` — the *increment*
 * between consecutive thresholds keeps growing, so each step is meaningfully
 * harder than the last. Strictly increasing by construction (never a
 * duplicate/decreasing step, even where geometric growth would otherwise
 * round two early, small values to the same integer) — see the plan's
 * "harder each time" requirement.
 * @param {number} base
 * @param {number} growth - > 1
 * @param {number} count
 * @returns {number[]}
 */
export function generateThresholds(base, growth, count) {
  const out = [];
  let prev = 0;
  for (let i = 0; i < count; i++) {
    const raw = Math.round(base * Math.pow(growth, i));
    const val = Math.max(prev + 1, raw);
    out.push(val);
    prev = val;
  }
  return out;
}

/**
 * Resolve a lifetime count against an 18-item ascending thresholds array
 * (`TOTAL_STEPS` = tiers × levels) into a tier/level position, plus what's
 * needed to reach the next one. Generic and category-agnostic on purpose —
 * the eventual location-verified "Visitor"/"Foodie" badges reuse this
 * exact function unchanged, just with their own thresholds array.
 * @param {number} count
 * @param {number[]} thresholds - ascending, length `TOTAL_STEPS`
 * @returns {{tierIndex: number|null, level: number|null, current: number, next: number|null, nextTierIndex: number|null, nextLevel: number|null}}
 */
export function resolveTier(count, thresholds) {
  let stepIndex = -1; // -1 = unranked (below thresholds[0])
  for (let i = 0; i < thresholds.length; i++) {
    if (count >= thresholds[i]) stepIndex = i;
    else break;
  }
  const nextStepIndex = stepIndex + 1 < thresholds.length ? stepIndex + 1 : null;
  return {
    tierIndex: stepIndex >= 0 ? Math.floor(stepIndex / LEVELS_PER_TIER) : null,
    level: stepIndex >= 0 ? (stepIndex % LEVELS_PER_TIER) + 1 : null,
    current: count,
    next: nextStepIndex !== null ? thresholds[nextStepIndex] : null,
    nextTierIndex: nextStepIndex !== null ? Math.floor(nextStepIndex / LEVELS_PER_TIER) : null,
    nextLevel: nextStepIndex !== null ? (nextStepIndex % LEVELS_PER_TIER) + 1 : null,
  };
}

/**
 * The 4 badge categories. Reviewer/Contributor/Explorer generate their 18
 * thresholds from a `{base, growth}` seed (tuned against this app's
 * realistic ceiling — see the plan); Veteran uses a literal, human-legible
 * calendar-days array instead (1/3/6mo, 1/1.5/2yr, ... 15/20/30yr) since
 * "round formula output" reads worse than real calendar milestones for a
 * tenure metric. Extending to a 7th tier later is just appending one more
 * name to TIER_NAMES and bumping TOTAL_STEPS to 21 — every category below
 * regenerates its own thresholds from the same seed/array shape.
 */
export const BADGE_DEFS = [
  { key: "reviewer", label: "Reviewer", glyph: "star", seed: { base: 1, growth: 1.42 } },
  { key: "contributor", label: "Contributor", glyph: "plusPin", seed: { base: 1, growth: 1.36 } },
  { key: "explorer", label: "Explorer", glyph: "heart", seed: { base: 1, growth: 1.46 } },
  {
    key: "veteran", label: "Veteran", glyph: "medal",
    thresholds: [30, 90, 180, 365, 545, 730, 1095, 1460, 1825, 2190, 2555, 2920, 3285, 3650, 4380, 5475, 7300, 10950],
  },
];

function _thresholdsFor(def) {
  return def.thresholds || generateThresholds(def.seed.base, def.seed.growth, TOTAL_STEPS);
}

/**
 * Compute all 4 badges' current tier/level/progress. Pure function — the
 * caller already has every input from existing fetches (lifetime counters
 * from the sync-saved response, Contributor's counts from
 * computeContributionStats()'s own inputs, Veteran's age from firstSeenAt).
 * @param {Object} input
 * @param {number} [input.lifetimeReviewCount]
 * @param {number} [input.lifetimeVisitedCount]
 * @param {number} [input.placesAddedCount]
 * @param {number} [input.editsCount]
 * @param {string?} [input.firstSeenAt] - ISO 8601, same field formatMemberSince() reads
 * @returns {Array<{key: string, label: string, glyph: string, tierIndex: number|null, tierName: string|null, level: number|null, current: number, next: number|null, progressText: string}>}
 */
export function computeBadges({ lifetimeReviewCount = 0, lifetimeVisitedCount = 0, placesAddedCount = 0, editsCount = 0, firstSeenAt = null } = {}) {
  const daysSinceMember = (() => {
    if (!firstSeenAt) return 0;
    const d = new Date(firstSeenAt);
    if (isNaN(d.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  })();

  const COUNTS = {
    reviewer: lifetimeReviewCount,
    contributor: placesAddedCount + editsCount,
    explorer: lifetimeVisitedCount,
    veteran: daysSinceMember,
  };

  return BADGE_DEFS.map((def) => {
    const count = COUNTS[def.key] || 0;
    const thresholds = _thresholdsFor(def);
    const resolved = resolveTier(count, thresholds);
    const tierName = resolved.tierIndex !== null ? TIER_NAMES[resolved.tierIndex] : null;
    const levelRoman = resolved.level !== null ? LEVEL_ROMAN[resolved.level - 1] : null;

    let progressText;
    if (resolved.next === null) {
      progressText = `${TIER_NAMES[TIER_NAMES.length - 1]} ${LEVEL_ROMAN[LEVELS_PER_TIER - 1]} — maxed out`;
    } else {
      const remaining = resolved.next - count;
      const nextLabel = `${TIER_NAMES[resolved.nextTierIndex]} ${LEVEL_ROMAN[resolved.nextLevel - 1]}`;
      progressText = tierName
        ? `${remaining} more to ${nextLabel}`
        : `${remaining} more to earn ${TIER_NAMES[0]} ${LEVEL_ROMAN[0]}`;
    }

    return {
      key: def.key,
      label: def.label,
      glyph: def.glyph,
      tierIndex: resolved.tierIndex,
      tierName,
      level: resolved.level,
      levelRoman,
      current: count,
      next: resolved.next,
      progressText,
    };
  });
}

/**
 * Reduce a computeBadges() result down to the plain {key: step|null} shape
 * persisted between app loads/sign-ins (see src/account-sync.js's
 * _checkBadgeLevelUps()) — `step` is the same tierIndex*LEVELS_PER_TIER +
 * (level-1) encoding resolveTier() already produces internally, kept here so
 * callers never need to know that encoding exists.
 * @param {ReturnType<typeof computeBadges>} badges
 * @returns {Object<string, number|null>}
 */
export function buildBadgeSnapshot(badges) {
  const snapshot = {};
  for (const b of badges) {
    snapshot[b.key] = b.tierIndex === null ? null : b.tierIndex * LEVELS_PER_TIER + (b.level - 1);
  }
  return snapshot;
}

/**
 * Compare a previous buildBadgeSnapshot() result against a freshly-computed
 * computeBadges() result and report every category that crossed to a
 * STRICTLY higher tier/level since the snapshot was taken — the badge
 * equivalent of src/places.js's diffSubmissionStatuses(). A category with no
 * entry in `previousSteps` at all (the very first time this check has ever
 * run, e.g. a brand-new device/browser for this account) is never reported —
 * same "don't retroactively celebrate pre-existing state" rule
 * diffSubmissionStatuses() follows (there, a submission with no previous
 * `oldStatus` is skipped too), so signing into an account that already has
 * plenty of history doesn't fire a wall of achievement notices on its first
 * ever check on a given device.
 * @param {Object<string, number|null>} previousSteps
 * @param {ReturnType<typeof computeBadges>} currentBadges
 * @returns {Array<{key: string, label: string, tierName: string, levelRoman: string, glyph: string, level: number}>}
 */
export function diffBadgeLevelUps(previousSteps, currentBadges) {
  if (!previousSteps || typeof previousSteps !== "object") return [];
  const levelUps = [];
  for (const b of currentBadges) {
    if (!(b.key in previousSteps)) continue;
    const prevStep = typeof previousSteps[b.key] === "number" ? previousSteps[b.key] : -1;
    const currentStep = b.tierIndex === null ? -1 : b.tierIndex * LEVELS_PER_TIER + (b.level - 1);
    if (currentStep > prevStep) {
      levelUps.push({ key: b.key, label: b.label, tierName: b.tierName, levelRoman: b.levelRoman, glyph: b.glyph, level: b.level });
    }
  }
  return levelUps;
}

// Baseline "flair" shown for an account with zero qualifying activity in
// every category — every signed-in account has SOME badge, per user
// feedback ("even at everything at 0, each person has to have a badge").
// Reuses level 1's color (the most muted of the 3) rather than a 4th color
// token, since this is the one state every account starts at, not a 4th
// tier.
const NEWCOMER_LABEL = "Newcomer";

/**
 * Reduce computeBadges()'s 4 categories down to a single "flair" badge — the
 * signed-in user's overall highest tier/level, for a compact pill in the
 * Profile identity card (not a dedicated section: see the badges plan's
 * scope-down after user feedback that the full 4-card grid was too much for
 * what's meant to be a small flair, not its own destination). Ties (equal
 * tier+level in two categories) break by BADGE_DEFS's own declared order
 * (Reviewer > Contributor > Explorer > Veteran) since `computeBadges()`
 * already returns them in that order and this does a stable max-scan.
 * @param {Object} input - same shape computeBadges() takes
 * @returns {{unranked: boolean, label: string|null, tierName: string, levelRoman: string|null, level: number}}
 *   `unranked: true` (tierName "Newcomer", no category/level) when every
 *   category is still unranked — never null, every account gets a badge.
 */
export function computeTopBadge(input) {
  const badges = computeBadges(input);
  let best = null;
  let bestStep = -1;
  for (const b of badges) {
    if (b.tierIndex === null) continue;
    const step = b.tierIndex * LEVELS_PER_TIER + (b.level - 1);
    if (step > bestStep) {
      bestStep = step;
      best = b;
    }
  }
  if (!best) return { unranked: true, label: null, tierName: NEWCOMER_LABEL, levelRoman: null, level: 1 };
  return { unranked: false, label: best.label, tierName: best.tierName, levelRoman: best.levelRoman, level: best.level };
}
