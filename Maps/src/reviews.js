/**
 * Reviews — in-app community rating & review system.
 *
 * Writing a review requires signing in (Google, Microsoft, Facebook, Apple,
 * or email magic link — see src/auth.js) — the legacy anonymous email-OTP
 * flow has been fully retired (docs/D1_MIGRATION_PLAN.md): the backend no
 * longer accepts a verifyToken at all, so this module is
 * Firebase-idToken-only end to end.
 *
 * Data stored in Cloudflare D1, proxied via /api/reviews.
 */
import { esc, escA, showToast, animateElementHeight, crossFadeSwap, isReduceMotionActive, showWelcomeGreeting, emailPasswordErrorMessage, oauthSignInErrorToast, showLinkedProviderToast } from "./utils.js";
import { EVT } from "./events.js";
import { EMAIL_SIGNIN_BTN_HTML, GOOGLE_SIGNIN_BTN_HTML, MICROSOFT_SIGNIN_BTN_HTML, FACEBOOK_SIGNIN_BTN_HTML, APPLE_SIGNIN_BTN_HTML, EMAIL_PASSWORD_SIGNIN_BTN_HTML, EYE_SHOW_ICON_SVG, EYE_HIDE_ICON_SVG, BACK_CHEVRON_ICON_SVG } from "./icons.js";
import { getPhotoTagOptions, photoTagLabel } from "./photo-tags.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY_REVIEWS = "hf_reviews_v1";
const CACHE_TTL_MS = 300_000; // 5 min local cache
const MAX_TEXT_LEN = 500;
const MIN_TEXT_LEN = 20;
const OVERLAY_CLEAR_DELAY_MS = 420;
// Matches .rv-write-panel's grid-template-rows transition duration
// (styles.css, var(--t-spring) = 0.35s) so _restoreReviewSummary() waits for
// the shut-collapse to actually finish before swapping in the summary HTML.
const REVIEW_PANEL_ANIMATION_MS = 350;
// Fallback for releasing _insertReviewPanel()'s temporary height lock if a
// "transitionend" never fires (e.g. .rv-write-panel's grid-template-rows
// transition gets interrupted, or reduced-motion collapses its duration to
// 0 so no transition event fires at all). Comfortably longer than the
// panel's own var(--t-spring) (0.35s) CSS transition (styles.css .rv-write-panel).
const WRITE_PANEL_OPEN_RELEASE_FALLBACK_MS = 450;
const PASSWORD_MIN_LENGTH = 6; // mirrors Firebase Auth's own minimum — checked client-side only for fast feedback, server-side (Firebase) is authoritative
// Client-side throttle on the "resend verification email" button on the
// unverified-password blocking screen — purely to stop rapid re-clicking;
// Firebase's own Spark-plan quota (1,000 verification emails/day) isn't the
// constraint here, this is just sane UI debounce. Mirrors this app's
// existing 60s submission-cooldown convention elsewhere.
const VERIFY_RESEND_COOLDOWN_MS = 60_000;
const MAX_REVIEW_IMAGES = 3;
const MAX_REVIEW_IMAGE_BYTES = 5 * 1024 * 1024;
const REVIEW_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const LOCAL_REVIEW_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// auth.js is dynamically imported (never a static top-level import) so the
// heavy Firebase CDN modules it pulls in stay lazy — only fetched the first
// time a reviews action actually needs sign-in state, not on every page load.
let _authModulePromise = null;
function _getAuthModule() {
  if (!_authModulePromise) _authModulePromise = import("./auth.js");
  return _authModulePromise;
}

// ─── State ────────────────────────────────────────────────────────────────────
/** @type {Map<string, {avg: number, count: number, items: Array}>} */
let _reviewsMap = new Map();
let _lastFetch = 0;
let _activeOverlayPlaceId = null;
let _activeOverlayPlaceName = "";
let _overlayClearTimer = null;
const _loadedReviewImagePlaces = new Set();
const _loadingReviewImagePlaces = new Set();
const _placeImageAvailability = new Map();
const _placePhotoContexts = new Map();

// `.rv-overlay-card` can also be mid-flight in _insertReviewPanel()'s own
// entrance-reveal height tween when this runs (e.g. the user taps the email/
// password toggle, or its "Back to sign-in options" link, before that reveal
// finishes) — animateElementHeight()'s own `_heightAnimCleanup` handshake is
// what settles that safely; see _insertReviewPanel()'s `releaseHeightLock`.
//
// **Why this suspends `.rv-overlay-card`'s own `overflow: hidden` for the
// duration of the tween (2026-08-05, "reviews sign-in panel feels less
// smooth than the Menu sheet's" investigation):** confirmed by reading, not
// guessed — the sign-in-row-to-email/password-panel swap already goes
// through the identical primitives as src/menu.js's own equivalent
// (`crossFadeSwap()` + this function, exactly like `_animateMenuPanelHeight()`
// there — `_insertReviewPanel()`'s own FLIP system is NOT involved in this
// swap at all, it only runs once, for inserting the whole sign-in prompt
// card in the first place), and both `.rv-overlay-card` and
// `.menu-account-panel` share the identical `height var(--t-spring)`
// transition — so timing/easing are not the difference. The difference is
// architectural: `.menu-account-panel` has no `overflow`/`max-height` of its
// own, and nothing between it and its ancestor chain clips it either (once
// `#mp-height-wrap` is kept in sync — see menu.js's `_resyncMenuSheetHeight()`
// — its "outer wrap" always has room), so when the panel opens (a GROW),
// `changeFn()` reveals the taller content BEFORE the box's own animated
// height has caught up, and since nothing clips it, that content is simply
// visible immediately while empty space around it fills in — reads as
// smooth. `.rv-overlay-card`, by contrast, is BOTH the thing being
// height-tweened AND the thing that clips (`overflow: hidden`, needed for
// its rounded corners and to enforce `max-height: min(620px, 85vh)` against
// a long review list) — so during that exact same window (box smaller than
// its already-updated content), the growing panel is genuinely masked,
// un-clipping progressively as the box catches up. That "reveal from behind
// a moving mask" is a visibly different, more abrupt-feeling technique for
// the identical timing curve. Fix: suspend `overflow` for exactly the
// tween's own duration (restored the instant it settles, via the new
// `onSettled` option on `animateElementHeight()`) so growing content is
// never clipped, matching `.menu-account-panel`'s feel — `overflow: hidden`
// is back in force at every OTHER moment (including the tween's own
// resting start/end points, where content and box height already match, so
// there's nothing to overflow regardless), so the rounded-corner masking
// and the `max-height` cap against a genuinely long review list are
// unaffected.
function _animateReviewCardHeight(overlay, changeFn) {
  const card = overlay?.querySelector(".rv-overlay-card");
  // Settle any tween already in flight on this card FIRST — its own
  // `onSettled` (below) restores `overflow` — before this new one suspends
  // it again; otherwise animateElementHeight()'s own internal
  // `_heightAnimCleanup` re-entrancy guard would run AFTER the line below,
  // immediately undoing it.
  if (card?._heightAnimCleanup) card._heightAnimCleanup();
  if (card) card.style.overflow = "visible";
  animateElementHeight(card, changeFn, {
    skip: overlay?.classList.contains("hide"),
    onSettled: () => { if (card?.isConnected) card.style.removeProperty("overflow"); },
  });
}

// ─── Data Loading ────────────────────────────────────────────────────────────

/**
 * Load reviews data from cache or API.
 * @returns {Promise<void>}
 */
export async function loadReviews() {
  // Try localStorage cache first
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REVIEWS);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.ts && Date.now() - cached.ts < CACHE_TTL_MS && cached.data) {
        _hydrateMap(cached.data);
        _lastFetch = cached.ts;
      }
    }
  } catch { /* corrupted cache */ }

  // Background fetch fresh data
  _fetchReviews();
}

async function _fetchReviews() {
  try {
    const res = await fetch(_withCacheBust("/api/reviews"), { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      if (json.reviews) {
        _hydrateMap(json.reviews);
        _lastFetch = Date.now();
        try {
          localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify({ ts: _lastFetch, data: json.reviews }));
        } catch { /* quota */ }
        window.dispatchEvent(new Event("hf:reviews-loaded"));
        _refreshActiveOverlay();
        return;
      }
    }
  } catch { /* network/API unavailable; keep cached reviews if present */ }
}

function _withCacheBust(url) {
  const freshUrl = new URL(url, window.location.origin);
  freshUrl.searchParams.set("_", Date.now().toString());
  return freshUrl.href;
}

function _hydrateMap(data) {
  _reviewsMap.clear();
  _loadedReviewImagePlaces.clear();
  for (const [placeId, info] of Object.entries(data)) {
    _reviewsMap.set(placeId, info);
  }
}

/**
 * Hydrate reviews from externally-fetched data (e.g. action=all response).
 * @param {Object} reviewsData - { placeId: { avg, count, items } }
 */
export function hydrateReviews(reviewsData) {
  if (!reviewsData || typeof reviewsData !== "object") return;
  _hydrateMap(reviewsData);
  _lastFetch = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify({ ts: _lastFetch, data: reviewsData }));
  } catch { /* quota */ }
  window.dispatchEvent(new Event("hf:reviews-loaded"));
  _refreshActiveOverlay();
}

// ─── Public Getters ──────────────────────────────────────────────────────────

/**
 * Get review aggregate for a place.
 * @param {string} placeId
 * @returns {{avg: number, count: number} | null}
 */
export function getPlaceRating(placeId) {
  const data = _reviewsMap.get(placeId);
  if (!data) return null;
  if (!data.count && Array.isArray(data.items) && data.items.length) {
    const ratedItems = data.items.filter((item) => Number(item.rating) >= 1 && Number(item.rating) <= 5);
    if (!ratedItems.length) return null;
    const sum = ratedItems.reduce((total, item) => total + Number(item.rating), 0);
    const communityItems = ratedItems.filter((item) => item.source !== "google");
    const googleItems = ratedItems.filter((item) => item.source === "google");
    const communitySum = communityItems.reduce((total, item) => total + Number(item.rating), 0);
    const googleSum = googleItems.reduce((total, item) => total + Number(item.rating), 0);
    return {
      avg: sum / ratedItems.length,
      count: ratedItems.length,
      sources: {
        community: {
          avg: communityItems.length ? communitySum / communityItems.length : 0,
          count: communityItems.length,
        },
        google: {
          avg: googleItems.length ? googleSum / googleItems.length : 0,
          count: googleItems.length,
        },
      },
    };
  }
  if (!data.count) return null;
  return { avg: data.avg, count: data.count, sources: data.sources || null };
}

/**
 * Get all reviews for a place (for overlay).
 * @param {string} placeId
 * @returns {Array<{rating: number, text: string, timestamp: string}>}
 */
export function getPlaceReviews(placeId) {
  const data = _reviewsMap.get(placeId);
  return data?.items || [];
}

/**
 * Record the D1-derived image-availability flag carried by a place record.
 * @param {string} placeId - Stable app place ID.
 * @param {boolean|undefined} hasImages - Whether an approved community image exists.
 * @param {{type?: string, tags?: object}|null} [placeContext=null] - Category context for photo tags.
 * @returns {void}
 */
export function registerPlaceMediaAvailability(placeId, hasImages, placeContext = null) {
  if (typeof hasImages === "boolean") _placeImageAvailability.set(String(placeId), hasImages);
  if (placeContext) _placePhotoContexts.set(String(placeId), placeContext);
}

// ─── Review Submission ───────────────────────────────────────────────────────

/**
 * Return whether reviews should use the loopback-only development identity.
 * @returns {boolean} True only on a local browser hostname.
 */
function _isLocalReviewMode() {
  return LOCAL_REVIEW_HOSTS.has(window.location.hostname);
}

/**
 * Resolve the current identity to attach to a reviews API call: a Firebase
 * ID token when signed in, the loopback development marker locally, or null.
 * @returns {Promise<{idToken: string, localReview?: boolean}|null>}
 */
async function _resolveReviewIdentity() {
  if (_isLocalReviewMode()) return { idToken: "", localReview: true };
  const auth = await _getAuthModule();
  if (!auth.getCachedAccount()) return null;
  const idToken = await auth.getIdToken();
  return idToken ? { idToken } : null;
}

/**
 * Submit a review for a place. Requires the caller to be signed in (Google or
 * email magic link).
 * @param {string} placeId
 * @param {number} rating - 1 to 5
 * @param {string} text - optional review text
 * @param {Array<{file: File, photoTag: string}>} [images=[]] - optional tagged community photos selected for upload
 * @returns {Promise<{success: boolean, status?: string, error?: string, uploaded?: number, imageError?: string}>}
 */
export async function submitReview(placeId, rating, text, images = []) {
  const identity = await _resolveReviewIdentity();
  if (!identity) return { success: false, error: "invalid_token" };

  const payload = { action: "submit", placeId, rating, text: text || "", ...identity };

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    if (result.success) {
      _updateLocalReview(placeId, rating, text, result.status);
      // Narrower than the generic hf:reviews-loaded (dispatched inside
      // _updateLocalReview() below for the currently-open place sheet) —
      // this one specifically tells the account menu's "Your reviews" list
      // (src/menu.js) that THIS user's own review set changed, so it can
      // refetch without reacting to every unrelated rating-cache hydration.
      window.dispatchEvent(new CustomEvent(EVT.MY_REVIEW_SUBMITTED, {
        detail: { placeId, rating, text, status: result.status },
      }));
      let uploaded = 0;
      let imageError = "";
      for (const image of images.slice(0, MAX_REVIEW_IMAGES)) {
        const file = image.file || image;
        const form = new FormData();
        form.append("placeId", placeId);
        form.append("idToken", identity.idToken);
        if (identity.localReview) form.append("localReview", "true");
        form.append("photoTag", image.photoTag || "");
        form.append("image", file, file.name);
        try {
          const uploadResponse = await fetch("/api/review-image", { method: "POST", body: form });
          const uploadResult = await uploadResponse.json();
          if (!uploadResult.success) { imageError = uploadResult.error || "upload_failed"; break; }
          uploaded++;
        } catch { imageError = "network_error"; break; }
      }
      if (uploaded) {
        _placeImageAvailability.set(String(placeId), true);
        _loadedReviewImagePlaces.delete(placeId);
        import("./place-media.js").then(({ invalidatePlaceMediaManifest }) => {
          invalidatePlaceMediaManifest(placeId);
        });
        window.dispatchEvent(new CustomEvent(EVT.PLACE_MEDIA_CHANGED, { detail: { placeId } }));
        _fetchReviews();
      }
      return { success: true, status: result.status, uploaded, imageError };
    }
    return { success: false, error: result.error };
  } catch {
    return { success: false, error: "network_error" };
  }
}

/**
 * Check if the current user has already reviewed a place.
 * @param {string} placeId
 * @returns {Promise<{reviewed: boolean, rating?: number}>}
 */
export async function checkExistingReview(placeId) {
  const identity = await _resolveReviewIdentity();
  if (!identity) return { reviewed: false };

  const payload = { action: "check", placeId, ...identity };

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return { reviewed: false };
  }
}

/**
 * Fetch every review written by the signed-in user, across all places, for
 * the Menu sheet's "Your reviews" list (Phase 7). Signed-out users get an
 * empty list — this is Firebase-authenticated only, no legacy OTP fallback,
 * since an OTP token only ever proves ownership of a single place's review.
 * @returns {Promise<{reviews: Array<{placeId: string, placeName: string, rating: number, text: string, timestamp: string}>}>}
 */
export async function fetchMyReviews() {
  const identity = await _resolveReviewIdentity();
  if (!identity) return { reviews: [] };

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "my-reviews", ...identity }),
    });
    const result = await res.json();
    return { reviews: Array.isArray(result.reviews) ? result.reviews : [] };
  } catch {
    return { reviews: [] };
  }
}

/**
 * Delete the signed-in user's own review for a place (Phase 7). Firebase-
 * authenticated only, matching fetchMyReviews().
 * @param {string} placeId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteReview(placeId) {
  const identity = await _resolveReviewIdentity();
  if (!identity) return { success: false, error: "invalid_token" };

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", placeId, ...identity }),
    });
    const result = await res.json();
    if (result.success) _removeLocalReviewEntry(placeId);
    return result;
  } catch {
    return { success: false, error: "network_error" };
  }
}

/**
 * Open a place's reviews overlay straight into the (pre-filled) edit form,
 * skipping the summary view — used by the Menu sheet's "Your reviews" list
 * (Phase 7) so editing reuses the exact same rating/text form as writing a
 * fresh review, instead of a second bespoke edit UI. Reaching this at all
 * already implies the caller is signed in (Profile is only ever reachable
 * that way), but NOT that the account is verified — this bypasses
 * _showReviewForm()'s own gate entirely, so it re-runs the identical
 * unverified-password check itself before ever showing the editable form.
 * The auth check runs BEFORE openReviewsOverlay() (rather than after, like
 * _showReviewForm() does) specifically so the summary view is never painted
 * first only to be immediately swapped out — this function's whole point is
 * skipping straight to the form.
 * @param {string} placeId
 * @param {string} placeName
 * @param {{rating: number, text: string}} existing
 * @param {{type?: string, tags?: object}|null} [placeContext=null] - Category context for photo tags.
 * @returns {Promise<void>}
 */
export async function openReviewsOverlayForEdit(placeId, placeName, existing, placeContext = null) {
  if (placeContext) _placePhotoContexts.set(String(placeId), placeContext);
  const auth = _isLocalReviewMode() ? null : await _getAuthModule();
  const blocked = auth ? await auth.isCurrentUserUnverifiedPassword() : false;

  openReviewsOverlay(placeId, placeName);
  const overlay = document.getElementById("reviews-overlay");
  const list = overlay?.querySelector(".rv-list");
  if (!list) return;
  overlay.querySelectorAll(".rv-write-trigger").forEach((btn) => btn.remove());

  if (blocked) {
    _showVerifyEmailPrompt(placeId, overlay, list, auth);
    return;
  }
  _showRatingForm(placeId, overlay, list, existing);
}

/**
 * Best-effort local cache adjustment after deleting a review — decrements
 * the cached count so any currently-open summary reflects the delete
 * immediately. Not authoritative; the next full reviews refetch reconciles it.
 * @param {string} placeId
 */
function _removeLocalReviewEntry(placeId) {
  const existing = _reviewsMap.get(placeId);
  if (!existing) return;
  existing.count = Math.max(0, (existing.count || 0) - 1);
  _reviewsMap.set(placeId, existing);
}

function _updateLocalReview(placeId, rating, text, status) {
  if (status !== "yes" && status !== "updated") return;
  const existing = _reviewsMap.get(placeId) || { avg: 0, count: 0, items: [] };

  if (status === "updated") {
    existing.items = existing.items || [];
    const total = existing.avg * existing.count;
    existing.avg = existing.count > 0 ? (total + rating) / (existing.count + 1) : rating;
  } else {
    // New review
    existing.count += 1;
    existing.avg = ((existing.avg * (existing.count - 1)) + rating) / existing.count;
    existing.items = existing.items || [];
  }

  const showText = status === "yes" || status === "updated";
  existing.items.unshift({ rating, text: showText ? (text || "") : "", timestamp: new Date().toISOString() });

  _reviewsMap.set(placeId, existing);
  try {
    const cacheObj = { ts: Date.now(), data: Object.fromEntries(_reviewsMap) };
    localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify(cacheObj));
  } catch { /* quota */ }

  // Announce the patch exactly like _hydrateMap()/hydrateReviews() already do,
  // so the currently-open place sheet's review section (src/places.js's
  // _onReviewsLoaded listener) reflects a just-submitted review immediately
  // instead of only after the next background poll or a full page reload.
  window.dispatchEvent(new Event("hf:reviews-loaded"));
  _refreshActiveOverlay();
}

// ─── UI: Star Rating Component ───────────────────────────────────────────────

const STAR_SVG_FILLED = `<svg width="28" height="28" viewBox="0 0 24 24" fill="var(--review)" stroke="var(--review)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
const STAR_SVG_EMPTY = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--surface-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

/**
 * Build an interactive star rating input.
 * @param {function(number):void} onChange - called with selected rating (1–5)
 * @param {number} [initial=0] - pre-selected rating
 * @returns {HTMLElement}
 */
function _buildStarInput(onChange, initial = 0) {
  const container = document.createElement("div");
  container.className = "rv-star-input";
  container.setAttribute("role", "radiogroup");
  container.setAttribute("aria-label", "Rate this place");

  let selected = initial;
  let hovered = 0;

  function render() {
    container.innerHTML = "";
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `rv-star-btn${i <= selected ? " active" : ""}`;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", i <= selected ? "true" : "false");
      btn.setAttribute("aria-label", `${i} star${i > 1 ? "s" : ""}`);
      const filled = hovered ? i <= hovered : i <= selected;
      btn.innerHTML = filled ? STAR_SVG_FILLED : STAR_SVG_EMPTY;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        selected = i;
        hovered = 0;
        render();
        onChange(i);
      });
      btn.addEventListener("mouseenter", () => {
        hovered = i;
        _updateStarVisuals(container, hovered || selected);
      });
      btn.addEventListener("mouseleave", () => {
        hovered = 0;
        _updateStarVisuals(container, selected);
      });
      container.appendChild(btn);
    }
  }

  render();
  return container;
}

/**
 * Update star button visuals without full re-render (for hover preview).
 * @param {HTMLElement} container
 * @param {number} fillCount
 */
function _updateStarVisuals(container, fillCount) {
  const buttons = container.querySelectorAll(".rv-star-btn");
  buttons.forEach((btn, idx) => {
    btn.innerHTML = (idx + 1) <= fillCount ? STAR_SVG_FILLED : STAR_SVG_EMPTY;
  });
}

/**
 * Build a static star display (read-only).
 * @param {number} rating - average rating
 * @param {string} [size="14"] - SVG size
 * @returns {string} HTML string
 */
export function buildStarDisplay(rating, size = "14") {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  let html = "";
  for (let i = 1; i <= 5; i++) {
    const fillPct = Math.max(0, Math.min(100, (value - (i - 1)) * 100));
    html += `<span class="rv-star-static" style="--star-fill:${fillPct}%">
      <svg class="rv-star-bg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="var(--surface-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      <span class="rv-star-fill"><svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="var(--review)" stroke="var(--review)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></span>
    </span>`;
  }
  return html;
}

// ─── UI: Reviews Overlay ─────────────────────────────────────────────────────

/**
 * Open the reviews overlay for a place.
 * @param {string} placeId
 * @param {string} placeName
 */
export function openReviewsOverlay(placeId, placeName) {
  _activeOverlayPlaceId = placeId;
  _activeOverlayPlaceName = placeName;
  const overlay = document.getElementById("reviews-overlay");
  if (!overlay) return;
  if (_overlayClearTimer) {
    clearTimeout(_overlayClearTimer);
    _overlayClearTimer = null;
  }

  _renderReviewsOverlayContent(overlay, placeId, placeName);
  overlay.offsetHeight;
  overlay.classList.remove("hide");
  _loadReviewImages(placeId, placeName, overlay);
}

async function _loadReviewImages(placeId, placeName, overlay) {
  if (_loadedReviewImagePlaces.has(placeId) || _loadingReviewImagePlaces.has(placeId)) return;
  if (_placeImageAvailability.get(String(placeId)) === false) {
    _loadedReviewImagePlaces.add(placeId);
    return;
  }
  _loadingReviewImagePlaces.add(placeId);
  try {
    const { loadPlaceMediaManifest } = await import("./place-media.js");
    const manifest = await loadPlaceMediaManifest(placeId, { communityOnly: true });
    const imagesByReview = new Map();
    (manifest.communityPhotos || []).forEach((image) => {
      const reviewId = String(image.reviewId || "");
      if (!imagesByReview.has(reviewId)) imagesByReview.set(reviewId, []);
      imagesByReview.get(reviewId).push(image);
    });
    _placeImageAvailability.set(String(placeId), imagesByReview.size > 0);
    const data = _reviewsMap.get(placeId);
    (data?.items || []).forEach((review) => {
      if (review.source !== "google") review.images = imagesByReview.get(String(review.id)) || [];
    });
    _loadedReviewImagePlaces.add(placeId);
    if (_activeOverlayPlaceId === placeId && overlay.isConnected && !overlay.querySelector(".rv-form, .rv-verify-form")) {
      _renderReviewsOverlayContent(overlay, placeId, placeName);
    }
  } catch {
    // Review text and ratings remain complete when optional media is unavailable.
  } finally {
    _loadingReviewImagePlaces.delete(placeId);
  }
}

export function closeReviewsOverlay() {
  const overlay = document.getElementById("reviews-overlay");
  if (overlay) {
    overlay.classList.add("hide");
    if (_overlayClearTimer) clearTimeout(_overlayClearTimer);
    _overlayClearTimer = setTimeout(() => {
      if (overlay.classList.contains("hide")) overlay.innerHTML = "";
      _overlayClearTimer = null;
    }, OVERLAY_CLEAR_DELAY_MS);
  }
  _activeOverlayPlaceId = null;
  _activeOverlayPlaceName = "";
}

function _refreshActiveOverlay() {
  if (!_activeOverlayPlaceId) return;
  const overlay = document.getElementById("reviews-overlay");
  if (!overlay || overlay.classList.contains("hide")) return;
  if (overlay.querySelector(".rv-form, .rv-verify-form")) return;
  openReviewsOverlay(_activeOverlayPlaceId, _activeOverlayPlaceName);
}

function _renderReviewsOverlayContent(overlay, placeId, placeName) {
  const reviews = getPlaceReviews(placeId);
  const ratingData = getPlaceRating(placeId);
  overlay.innerHTML = _buildOverlayContent(placeId, placeName, ratingData, reviews);

  overlay.querySelector(".rv-overlay-close")?.addEventListener("click", closeReviewsOverlay);
  overlay.onclick = (e) => {
    if (e.target === overlay) closeReviewsOverlay();
  };

  overlay.querySelectorAll(".rv-write-trigger").forEach((btn) => {
    btn.addEventListener("click", () => _showReviewForm(placeId, overlay));
  });
  const photoButtons = [...overlay.querySelectorAll(".rv-review-image")];
  photoButtons.forEach((button, index) => {
    const image = button.querySelector("img");
    const settleImage = () => button.classList.remove("skel-bone");
    if (image?.complete) settleImage();
    else {
      image?.addEventListener("load", settleImage, { once: true });
      image?.addEventListener("error", settleImage, { once: true });
    }
    button.addEventListener("click", async () => {
      const { openPhotoViewer } = await import("./place-media.js");
      const photos = photoButtons.map((item) => ({
        url: item.dataset.photoUrl,
        photoTag: item.dataset.photoTag,
        source: "community",
      }));
      openPhotoViewer(photos, placeName, index, button, { variant: "review" });
    });
  });
}

function _restoreReviewSummary(overlay) {
  if (!_activeOverlayPlaceId) return;
  const activePanel = overlay.querySelector(".rv-write-panel");
  const card = overlay.querySelector(".rv-overlay-card");
  const renderSummary = () => {
    if (card) card.style.removeProperty("height");
    _renderReviewsOverlayContent(overlay, _activeOverlayPlaceId, _activeOverlayPlaceName);
  };

  if (!activePanel || isReduceMotionActive()) {
    if (card) card.style.removeProperty("height");
    renderSummary();
    return;
  }

  activePanel.classList.add("shut");
  window.setTimeout(renderSummary, REVIEW_PANEL_ANIMATION_MS);
}

function _buildOverlayContent(placeId, placeName, ratingData, reviews) {
  const avg = ratingData ? ratingData.avg.toFixed(1) : "–";
  const count = ratingData ? ratingData.count : 0;
  const communityReviews = reviews.filter((r) => r.source !== "google");
  const communityCountFallback = communityReviews.length;
  const communityCount = Number(ratingData?.sources?.community?.count ?? communityCountFallback);
  const googleCountFromSources = Number(ratingData?.sources?.google?.count || 0);
  const googleCount = googleCountFromSources > 0 ? googleCountFromSources : Math.max(0, count - communityCount);
  const displayReviews = reviews
    .filter((r) => _getReviewText(r).length > 0 || (Array.isArray(r.images) && r.images.length > 0))
    .sort(_compareReviewPriority);
  const ratedReviews = reviews.filter((r) => _getReviewRating(r) >= 1 && _getReviewRating(r) <= 5);
  const distribution = _calcDistribution(ratedReviews);
  const distributionTotal = Math.max(1, ratedReviews.length || communityCountFallback || 0);

  const distBars = [5, 4, 3, 2, 1].map((stars) => {
    const pct = ((distribution[stars] || 0) / distributionTotal) * 100;
    return `<div class="rv-dist-row">
      <span class="rv-dist-label">${stars}</span>
      <div class="rv-dist-bar"><div class="rv-dist-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join("");

  const sourceSummary = `<div class="rv-source-stats">
            <span class="rv-source-pill rv-source-pill-google">Google ${googleCount}</span>
            <span class="rv-source-pill rv-source-pill-community">Community ${communityCount}</span>
          </div>`;

  const headerWriteBtn = count > 0
    ? `<button class="sheet-action-btn btn-roundel-accent rv-write-trigger rv-header-add" type="button" aria-label="Write a review" title="Write a review">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>`
    : "";
  const bodyWriteBtn = count === 0
    ? `<button class="rv-write-btn rv-write-trigger btn-primary" type="button">Write a review</button>`
    : "";

  const summaryHtml = count > 0 ? `<div class="rv-summary">
        <div class="rv-dist">${distBars}</div>
        <div class="rv-avg-block">
          <span class="rv-avg-num">${avg}</span>
          <div class="rv-avg-stars">${buildStarDisplay(ratingData?.avg || 0, "16")}</div>
          <span class="rv-avg-count">${count} review${count !== 1 ? "s" : ""}</span>
          ${sourceSummary}
        </div>
      </div>` : "";

  const reviewCards = displayReviews.length
    ? `<div class="rv-list">${displayReviews.map((r) => _buildReviewCard(r)).join("")}</div>`
    : `<div class="rv-list"><div class="rv-empty"><p class="rv-empty-text">No written reviews or photos yet</p></div></div>`;

  return `<div class="rv-overlay-card">
    <div class="rv-sheet-drag sheet-drag"><span></span></div>
    <div class="suggest-head rv-header">
      <h3 class="rv-header-title">${esc(placeName)}</h3>
      ${headerWriteBtn}
      <button class="btn-roundel sheet-x rv-overlay-close" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="rv-overlay-body">
      ${summaryHtml}
      ${bodyWriteBtn}
      ${reviewCards}
    </div>
  </div>`;
}

function _buildReviewCard(review) {
  const timeAgo = _relativeTime(review.timestamp);
  const isGoogle = review.source === "google";
  const rating = _getReviewRating(review);
  const text = _getReviewText(review);
  const sourceChip = isGoogle
    ? `<span class="rv-source-chip rv-source-google">Google</span>`
    : `<span class="rv-source-chip rv-source-community">Community</span>`;
  const author = isGoogle && review.authorName ? `<span class="rv-review-author">${esc(review.authorName)}</span>` : "";
  const images = !isGoogle && Array.isArray(review.images) && review.images.length
    ? `<div class="rv-review-images">${review.images.map((image, index) => {
      const tagLabel = photoTagLabel(image.photoTag);
      const tagBadge = tagLabel ? `<span class="rv-review-image-tag">${esc(tagLabel)}</span>` : "";
      const description = tagLabel ? `${tagLabel.toLowerCase()} ` : "";
      return `<button class="rv-review-image skel-bone" type="button" data-photo-url="${escA(image.url)}" data-photo-tag="${escA(image.photoTag || "")}" aria-label="View ${escA(description)}photo ${index + 1}"><img src="${escA(image.url)}" alt="${escA(tagLabel || "Review")} photo for this review" loading="lazy" decoding="async">${tagBadge}</button>`;
    }).join("")}</div>`
    : "";
  return `<div class="rv-review-card">
    <div class="rv-review-body">
      <div class="rv-review-meta">
        <span class="rv-review-stars">${buildStarDisplay(rating, "12")}</span>
        <span class="rv-review-score">${rating.toFixed(1)}</span>
        ${sourceChip}
        ${author}
        <span class="rv-review-time">${esc(timeAgo)}</span>
      </div>
      ${text ? `<p class="rv-review-text">${esc(text)}</p>` : ""}
      ${images}
    </div>
  </div>`;
}

function _compareReviewPriority(a, b) {
  const aSource = a?.source === "google" ? 1 : 0;
  const bSource = b?.source === "google" ? 1 : 0;
  if (aSource !== bSource) return aSource - bSource;
  return new Date(b?.timestamp || 0).getTime() - new Date(a?.timestamp || 0).getTime();
}

function _getReviewText(review) {
  const candidates = [
    review?.text,
    review?.reviewText,
    review?.originalText,
    review?.translatedText,
    review?.original_text,
    review?.translated_text,
    review?.comment,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = value.text ?? value.value ?? value.localizedText ?? "";
      if (typeof nested === "string" && nested.trim()) return nested.trim();
      if (nested && typeof nested === "object" && typeof nested.text === "string" && nested.text.trim()) {
        return nested.text.trim();
      }
    }
  }
  return "";
}

function _getReviewRating(review) {
  const value = review?.rating ?? review?.starRating ?? review?.score ?? 0;
  if (typeof value === "number") return Math.max(0, Math.min(5, value));
  const normalized = String(value || "").trim().toUpperCase();
  const namedRatings = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
    STAR_RATING_ONE: 1,
    STAR_RATING_TWO: 2,
    STAR_RATING_THREE: 3,
    STAR_RATING_FOUR: 4,
    STAR_RATING_FIVE: 5,
  };
  const numeric = Number(normalized);
  return Math.max(0, Math.min(5, namedRatings[normalized] || numeric || 0));
}

function _calcDistribution(reviews) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const rating = Math.round(_getReviewRating(r));
    if (rating >= 1 && rating <= 5) dist[rating]++;
  }
  return dist;
}

function _relativeTime(timestamp) {
  if (!timestamp) return "";
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

// ─── UI: Review Form ─────────────────────────────────────────────────────────

/**
 * Show the review form — gated on sign-in (Google/Microsoft/Facebook/Apple/
 * email link/email+password), and, for an already-signed-in password
 * account, further gated on email verification (see src/auth.js's
 * isCurrentUserUnverifiedPassword() — OAuth/magic-link accounts are never
 * subject to this second check).
 * @param {string} placeId
 * @param {HTMLElement} overlay
 * @returns {Promise<void>}
 */
async function _showReviewForm(placeId, overlay) {
  overlay.querySelectorAll(".rv-write-trigger").forEach((btn) => btn.remove());

  const list = overlay.querySelector(".rv-list");

  if (_isLocalReviewMode()) {
    _showRatingForm(placeId, overlay, list);
    return;
  }

  const auth = await _getAuthModule();
  if (!auth.getCachedAccount()) {
    _showSignInPrompt(placeId, overlay, list, auth);
    return;
  }

  if (await auth.isCurrentUserUnverifiedPassword()) {
    _showVerifyEmailPrompt(placeId, overlay, list, auth);
    return;
  }

  _showRatingForm(placeId, overlay, list);
}

/**
 * Shared "what happens after any sign-in method succeeds" step, called by
 * every one of _showSignInPrompt()'s provider handlers (Google/Microsoft/
 * Facebook/Apple) and _wirePasswordStepEvents()'s password submit handler.
 * Consolidated into one function (rather than duplicated per-provider like
 * the rest of this file's button boilerplate) specifically because this
 * particular step is genuinely identical logic, not provider-specific
 * chrome: show the welcome greeting, then re-check whether the account that
 * JUST signed in is an unverified password account (true for essentially
 * every brand-new signup, and for any previously-unverified account
 * signing back in) and route to the verify-block screen instead of the
 * rating form when it is. For every OAuth/magic-link account this check is
 * always false, so their behavior is completely unchanged.
 * @param {string} placeId
 * @param {HTMLElement} overlay
 * @param {HTMLElement} container - the whole sign-in prompt card, removed on success
 * @param {HTMLElement} insertBefore
 * @param {Object} auth - the already-loaded src/auth.js module namespace
 * @param {{account: Object, isNewUser: boolean}} result - a successful sign-in result
 * @returns {Promise<void>}
 */
async function _afterSignInSuccess(placeId, overlay, container, insertBefore, auth, result) {
  showWelcomeGreeting(result.account, result.isNewUser);
  showLinkedProviderToast(result?.linkedProvider);
  const blocked = await auth.isCurrentUserUnverifiedPassword();
  _animateReviewCardHeight(overlay, () => {
    container.remove();
    if (blocked) _showVerifyEmailPrompt(placeId, overlay, insertBefore, auth);
    else _showRatingForm(placeId, overlay, insertBefore);
  });
}

/**
 * Show the sign-in gate (Google/Microsoft/Facebook/Apple popup, or an email
 * magic link) — the only entry point for writing a review.
 * @param {string} placeId
 * @param {HTMLElement} overlay
 * @param {HTMLElement} insertBefore
 * @param {Object} auth - the already-loaded src/auth.js module namespace
 */
function _showSignInPrompt(placeId, overlay, insertBefore, auth) {
  const container = document.createElement("div");
  container.className = "rv-verify-form";
  container.appendChild(_buildFormHideButton(overlay));

  const header = document.createElement("div");
  header.className = "rv-verify-header";
  header.innerHTML = [
    `<div class="rv-verify-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`,
    `<p class="rv-verify-title">Sign in to write a review</p>`,
    `<p class="rv-verify-desc">One identity, synced across your devices</p>`,
  ].join("");
  container.appendChild(header);

  const signinRow = document.createElement("div");
  signinRow.className = "menu-account-signin-row";
  container.appendChild(signinRow);

  const googleBtn = document.createElement("button");
  googleBtn.type = "button";
  googleBtn.className = "rv-action-btn btn-google";
  googleBtn.setAttribute("aria-label", "Continue with Google");
  googleBtn.title = "Google";
  googleBtn.innerHTML = GOOGLE_SIGNIN_BTN_HTML;
  signinRow.appendChild(googleBtn);

  const microsoftBtn = document.createElement("button");
  microsoftBtn.type = "button";
  microsoftBtn.className = "rv-action-btn btn-microsoft";
  microsoftBtn.setAttribute("aria-label", "Continue with Microsoft");
  microsoftBtn.title = "Microsoft";
  microsoftBtn.innerHTML = MICROSOFT_SIGNIN_BTN_HTML;
  signinRow.appendChild(microsoftBtn);

  const facebookBtn = document.createElement("button");
  facebookBtn.type = "button";
  facebookBtn.className = "rv-action-btn btn-facebook";
  facebookBtn.setAttribute("aria-label", "Continue with Facebook");
  facebookBtn.title = "Facebook";
  facebookBtn.innerHTML = FACEBOOK_SIGNIN_BTN_HTML;
  signinRow.appendChild(facebookBtn);

  const appleBtn = document.createElement("button");
  appleBtn.type = "button";
  appleBtn.className = "rv-action-btn btn-apple";
  appleBtn.setAttribute("aria-label", "Continue with Apple");
  appleBtn.title = "Apple";
  appleBtn.innerHTML = APPLE_SIGNIN_BTN_HTML;
  signinRow.appendChild(appleBtn);

  const emailToggle = document.createElement("button");
  emailToggle.type = "button";
  emailToggle.className = "rv-action-btn btn-secondary";
  emailToggle.disabled = false;
  emailToggle.setAttribute("aria-label", "Continue with email link");
  emailToggle.title = "Email link";
  emailToggle.innerHTML = EMAIL_SIGNIN_BTN_HTML;
  signinRow.appendChild(emailToggle);

  const emailStep = document.createElement("div");
  // rv-panel-divider (2026-08-05, later round) ties this panel visually to
  // signinRow above it once collapsed — the same border-top/padding-top
  // treatment src/menu.js's equivalent panels use, previously scoped to
  // their own IDs only and missing here. See .rv-panel-divider in
  // styles.css.
  emailStep.className = "rv-verify-step rv-panel-divider hide";

  // "Back to sign-in options" link — collapsing signinRow when this panel
  // opens (below) means it can no longer be reopened by tapping the (now
  // hidden) toggle button, so this is the only way back. See .rv-back-link
  // in styles.css and the equivalent pair in src/menu.js's password panel.
  const emailBackBtn = document.createElement("button");
  emailBackBtn.type = "button";
  emailBackBtn.className = "rv-back-link";
  emailBackBtn.innerHTML = `${BACK_CHEVRON_ICON_SVG}Back to sign-in options`;
  emailStep.appendChild(emailBackBtn);

  const emailField = document.createElement("div");
  emailField.className = "rv-field";
  const emailLabel = document.createElement("label");
  emailLabel.className = "rv-field-label";
  emailLabel.textContent = "Email address";
  const emailInput = document.createElement("input");
  emailInput.type = "email";
  emailInput.className = "rv-input";
  emailInput.placeholder = "you@example.com";
  emailInput.maxLength = 254;
  emailInput.autocomplete = "email";
  emailField.appendChild(emailLabel);
  emailField.appendChild(emailInput);
  emailStep.appendChild(emailField);

  const sendLinkBtn = document.createElement("button");
  sendLinkBtn.type = "button";
  sendLinkBtn.className = "rv-action-btn btn-primary";
  sendLinkBtn.textContent = "Send sign-in link";
  emailStep.appendChild(sendLinkBtn);
  container.appendChild(emailStep);

  const errorMsg = document.createElement("p");
  errorMsg.className = "rv-verify-error hide";
  container.appendChild(errorMsg);

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove("hide");
  }
  function hideError() {
    errorMsg.classList.add("hide");
  }
  function showProviderFailure(result, providerLabel) {
    const toast = oauthSignInErrorToast(result, providerLabel);
    if (!toast) return;
    showError(toast.inline);
    showToast(toast.title, "error", toast.sub);
  }

  // Opening the panel collapses signinRow (Google/Microsoft/Facebook/Apple/
  // password) rather than stacking the panel below it — on mobile this
  // overlay card has limited height, and the prior append-below behavior
  // made the row + panel stack eat most of it. emailBackBtn above reverses
  // this, so opening it by accident is never a dead end.
  // crossFadeSwap() (src/utils.js) cross-fades signinRow/emailStep's own
  // opacity BEFORE the actual .hide toggling below runs — without it, .hide's
  // instant `display: none` made the row visibly pop out of existence while
  // _animateReviewCardHeight()'s height-tween smoothly resized the card
  // around it in the same tick. See crossFadeSwap()'s own doc comment for
  // why the fade and the height-tween are sequenced, not run concurrently.
  emailToggle.addEventListener("click", () => {
    crossFadeSwap(signinRow, emailStep, () => {
      _animateReviewCardHeight(overlay, () => {
        signinRow.classList.add("hide");
        emailStep.classList.remove("hide");
      });
    });
  });

  emailBackBtn.addEventListener("click", () => {
    crossFadeSwap(emailStep, signinRow, () => {
      _animateReviewCardHeight(overlay, () => {
        emailStep.classList.add("hide");
        signinRow.classList.remove("hide");
      });
    });
  });

  googleBtn.addEventListener("click", async () => {
    hideError();
    googleBtn.disabled = true;
    googleBtn.setAttribute("aria-label", "Signing in with Google");
    googleBtn.innerHTML = `<span class="btn-spinner"></span>`;

    const result = await auth.signInWithGoogle();
    if (result.success) {
      await _afterSignInSuccess(placeId, overlay, container, insertBefore, auth, result);
    } else {
      googleBtn.disabled = false;
      googleBtn.setAttribute("aria-label", "Continue with Google");
      googleBtn.innerHTML = GOOGLE_SIGNIN_BTN_HTML;
      // Don't show an error for a simple popup-close/cancel — that's not a failure.
      showProviderFailure(result, "Google");
    }
  });

  microsoftBtn.addEventListener("click", async () => {
    hideError();
    microsoftBtn.disabled = true;
    microsoftBtn.setAttribute("aria-label", "Signing in with Microsoft");
    microsoftBtn.innerHTML = `<span class="btn-spinner"></span>`;

    const result = await auth.signInWithMicrosoft();
    if (result.success) {
      await _afterSignInSuccess(placeId, overlay, container, insertBefore, auth, result);
    } else {
      microsoftBtn.disabled = false;
      microsoftBtn.setAttribute("aria-label", "Continue with Microsoft");
      microsoftBtn.innerHTML = MICROSOFT_SIGNIN_BTN_HTML;
      showProviderFailure(result, "Microsoft");
    }
  });

  facebookBtn.addEventListener("click", async () => {
    hideError();
    facebookBtn.disabled = true;
    facebookBtn.setAttribute("aria-label", "Signing in with Facebook");
    facebookBtn.innerHTML = `<span class="btn-spinner"></span>`;

    const result = await auth.signInWithFacebook();
    if (result.success) {
      await _afterSignInSuccess(placeId, overlay, container, insertBefore, auth, result);
    } else {
      facebookBtn.disabled = false;
      facebookBtn.setAttribute("aria-label", "Continue with Facebook");
      facebookBtn.innerHTML = FACEBOOK_SIGNIN_BTN_HTML;
      // Same generic Firebase Auth SDK popup-cancel codes as every other
      // popup-based provider here — not a Facebook-specific error.
      showProviderFailure(result, "Facebook");
    }
  });

  appleBtn.addEventListener("click", async () => {
    hideError();
    appleBtn.disabled = true;
    appleBtn.setAttribute("aria-label", "Signing in with Apple");
    appleBtn.innerHTML = `<span class="btn-spinner"></span>`;

    const result = await auth.signInWithApple();
    if (result.success) {
      await _afterSignInSuccess(placeId, overlay, container, insertBefore, auth, result);
    } else {
      appleBtn.disabled = false;
      appleBtn.setAttribute("aria-label", "Continue with Apple");
      appleBtn.innerHTML = APPLE_SIGNIN_BTN_HTML;
      showProviderFailure(result, "Apple");
    }
  });

  sendLinkBtn.addEventListener("click", async () => {
    hideError();
    const email = emailInput.value.trim();
    if (!email.includes("@")) {
      showError("Please enter a valid email address");
      return;
    }
    sendLinkBtn.disabled = true;
    sendLinkBtn.innerHTML = `<span class="btn-spinner"></span> Sending…`;

    const result = await auth.sendMagicLink(email);
    if (result.success) {
      _animateReviewCardHeight(overlay, () => {
        emailStep.innerHTML = `<p class="rv-verify-desc">Check <strong>${esc(email)}</strong> for a sign-in link, then come back and open this review form again.</p>`;
      });
    } else {
      sendLinkBtn.disabled = false;
      sendLinkBtn.textContent = "Send sign-in link";
      showError("Could not send the link. Please try again.");
    }
  });

  // Traditional email + password sign-in/sign-up — a separate Firebase Auth
  // mechanism from the magic-link emailToggle/emailStep above (which stays
  // fully intact but hidden, see styles.css). Built by its own helper so this
  // already-long function doesn't grow further — see
  // _buildPasswordSignInStep()'s own doc comment.
  const passwordToggle = _buildPasswordSignInStep({
    container, signinRow, overlay, insertBefore, placeId, auth, showError, hideError,
  });
  signinRow.appendChild(passwordToggle);

  _insertReviewPanel(insertBefore, container);
}

/**
 * Show the "verify your email to continue" hard-block screen for a
 * signed-in-but-unverified password account (see src/auth.js's
 * isCurrentUserUnverifiedPassword()) — reached from _showReviewForm() (fresh
 * sign-in already in place), _afterSignInSuccess() (just signed in/up via
 * the password panel), and openReviewsOverlayForEdit() (Profile's "Your
 * reviews" edit action). Reuses the exact same .rv-verify-form/.rv-action-btn/
 * .rv-resend-link/.rv-verify-error scaffolding as _showSignInPrompt() and
 * _insertReviewPanel()'s own reveal animation — this is a THIRD step of the
 * same sign-in gate, not a separate UI pattern.
 * @param {string} placeId
 * @param {HTMLElement} overlay
 * @param {HTMLElement} insertBefore
 * @param {Object} auth - the already-loaded src/auth.js module namespace
 * @returns {void}
 */
function _showVerifyEmailPrompt(placeId, overlay, insertBefore, auth) {
  const container = document.createElement("div");
  container.className = "rv-verify-form";
  container.appendChild(_buildFormHideButton(overlay));

  const email = auth.getCachedAccount()?.email || "your email address";

  const header = document.createElement("div");
  header.className = "rv-verify-header";
  header.innerHTML = [
    `<div class="rv-verify-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></div>`,
    `<p class="rv-verify-title">Verify your email to continue</p>`,
    `<p class="rv-verify-desc">We sent a verification link to <strong>${esc(email)}</strong>. Open it, then come back and tap "I've verified" below.</p>`,
  ].join("");
  container.appendChild(header);

  const errorMsg = document.createElement("p");
  errorMsg.className = "rv-verify-error hide";
  container.appendChild(errorMsg);
  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove("hide");
  }
  function hideError() {
    errorMsg.classList.add("hide");
  }

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "rv-action-btn btn-primary";
  refreshBtn.textContent = "I've verified — refresh";
  container.appendChild(refreshBtn);

  const resendBtn = document.createElement("button");
  resendBtn.type = "button";
  resendBtn.className = "rv-resend-link";
  resendBtn.textContent = "Resend verification email";
  container.appendChild(resendBtn);

  let resendCooldownUntil = 0;
  resendBtn.addEventListener("click", async () => {
    hideError();
    if (Date.now() < resendCooldownUntil || resendBtn.disabled) return;
    resendBtn.disabled = true;
    const result = await auth.resendVerificationEmail();
    if (result.success) {
      resendCooldownUntil = Date.now() + VERIFY_RESEND_COOLDOWN_MS;
      showToast("Verification email sent", "check", "Check your inbox and spam folder");
      setTimeout(() => { resendBtn.disabled = false; }, VERIFY_RESEND_COOLDOWN_MS);
    } else {
      resendBtn.disabled = false;
      showError("Could not resend. Please try again in a moment.");
    }
  });

  refreshBtn.addEventListener("click", async () => {
    hideError();
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = `<span class="btn-spinner"></span> Checking…`;
    const stillUnverified = await auth.isCurrentUserUnverifiedPassword();
    if (!stillUnverified) {
      _animateReviewCardHeight(overlay, () => {
        container.remove();
        _showRatingForm(placeId, overlay, insertBefore);
      });
      return;
    }
    refreshBtn.disabled = false;
    refreshBtn.textContent = "I've verified — refresh";
    showError("Still not verified. Check your inbox, then try again.");
  });

  _insertReviewPanel(insertBefore, container);
}

/**
 * Build and wire the traditional email + password step of the sign-in gate
 * (src/menu.js's #menu-password-signin-panel has the identical structure and
 * behavior for the Account section — kept as two separate, non-shared
 * implementations for the same reason every other provider button here is
 * duplicated rather than factored out: see the file-level convention already
 * established by _showSignInPrompt()'s Google/Microsoft/Facebook/Apple/email
 * blocks above). One submit button handles both first-time signup and
 * returning sign-in via an explicit mode-toggle link, rather than silently
 * guessing from the error code — `auth/invalid-credential` alone can't
 * reliably distinguish "no such account" from "wrong password" across
 * Firebase SDK versions.
 * @param {Object} deps
 * @param {HTMLElement} deps.container - the whole sign-in prompt card (the password step is appended directly to it, alongside emailStep)
 * @param {HTMLElement} deps.signinRow - the row of OAuth/email toggle buttons, collapsed while this step's panel is open
 * @param {HTMLElement} deps.overlay - passed through to _animateReviewCardHeight
 * @param {HTMLElement} deps.insertBefore - passed through to _showRatingForm on success
 * @param {string} deps.placeId
 * @param {Object} deps.auth - the already-loaded src/auth.js module namespace
 * @param {(msg: string) => void} deps.showError
 * @param {() => void} deps.hideError
 * @returns {HTMLButtonElement} the toggle button — caller appends it to signinRow
 */
function _buildPasswordSignInStep({ container, signinRow, overlay, insertBefore, placeId, auth, showError, hideError }) {
  const els = _buildPasswordStepDOM();
  container.appendChild(els.passwordStep);
  _wirePasswordStepEvents({ ...els, container, signinRow, overlay, insertBefore, placeId, auth, showError, hideError });
  return els.passwordToggle;
}

/**
 * Build (but do not insert or wire) every DOM element the email + password
 * step needs. Split out of _buildPasswordSignInStep() purely to keep both
 * halves under this codebase's ~100-line function-size guideline.
 * @returns {Object} every element _wirePasswordStepEvents() and the caller need a reference to
 */
function _buildPasswordStepDOM() {
  const passwordToggle = document.createElement("button");
  passwordToggle.type = "button";
  passwordToggle.className = "rv-action-btn btn-password";
  passwordToggle.setAttribute("aria-label", "Continue with email");
  passwordToggle.title = "Email";
  passwordToggle.innerHTML = EMAIL_PASSWORD_SIGNIN_BTN_HTML;

  const passwordStep = document.createElement("div");
  // See emailStep's identical rv-panel-divider comment in _showSignInPrompt() above.
  passwordStep.className = "rv-verify-step rv-panel-divider hide";

  // "Back to sign-in options" link — same purpose as emailBackBtn in
  // _showSignInPrompt() above, for this separate (non-magic-link) panel.
  const pwBackBtn = document.createElement("button");
  pwBackBtn.type = "button";
  pwBackBtn.className = "rv-back-link";
  pwBackBtn.innerHTML = `${BACK_CHEVRON_ICON_SVG}Back to sign-in options`;
  passwordStep.appendChild(pwBackBtn);

  // "Full name" field — only shown in "signup" mode (the mirror case of
  // pwForgotLink below, which is "signin"-only): an existing password
  // account already has a name, and every OTHER sign-in provider
  // (Google/Microsoft/Facebook/Apple) supplies a displayName automatically,
  // so this is the one path that has to ask for it directly. See
  // src/auth.js's signUpWithEmailPassword(). _wirePasswordStepEvents()'s
  // updatePwModeUI() toggles its "hide" class.
  const pwNameField = document.createElement("div");
  pwNameField.className = "rv-field hide";
  const pwNameLabel = document.createElement("label");
  pwNameLabel.className = "rv-field-label";
  pwNameLabel.textContent = "Full name";
  const pwNameInput = document.createElement("input");
  pwNameInput.type = "text";
  pwNameInput.className = "rv-input";
  pwNameInput.placeholder = "Your name";
  pwNameInput.maxLength = 100;
  pwNameInput.autocomplete = "name";
  pwNameField.appendChild(pwNameLabel);
  pwNameField.appendChild(pwNameInput);
  passwordStep.appendChild(pwNameField);

  const pwEmailField = document.createElement("div");
  pwEmailField.className = "rv-field";
  const pwEmailLabel = document.createElement("label");
  pwEmailLabel.className = "rv-field-label";
  pwEmailLabel.textContent = "Email address";
  const pwEmailInput = document.createElement("input");
  pwEmailInput.type = "email";
  pwEmailInput.className = "rv-input";
  pwEmailInput.placeholder = "you@example.com";
  pwEmailInput.maxLength = 254;
  pwEmailInput.autocomplete = "email";
  pwEmailField.appendChild(pwEmailLabel);
  pwEmailField.appendChild(pwEmailInput);
  passwordStep.appendChild(pwEmailField);

  const pwField = document.createElement("div");
  pwField.className = "rv-field";
  const pwLabel = document.createElement("label");
  pwLabel.className = "rv-field-label";
  pwLabel.textContent = "Password";
  const pwInputWrap = document.createElement("div");
  pwInputWrap.className = "rv-field-input-wrap";
  const pwInput = document.createElement("input");
  pwInput.type = "password";
  pwInput.className = "rv-input";
  pwInput.placeholder = "••••••••";
  pwInput.maxLength = 128;
  pwInput.autocomplete = "current-password";
  const pwVisibilityBtn = document.createElement("button");
  pwVisibilityBtn.type = "button";
  pwVisibilityBtn.className = "clear-btn rv-field-input-btn";
  pwVisibilityBtn.setAttribute("aria-label", "Show password");
  pwVisibilityBtn.innerHTML = EYE_SHOW_ICON_SVG;
  pwInputWrap.appendChild(pwInput);
  pwInputWrap.appendChild(pwVisibilityBtn);
  pwField.appendChild(pwLabel);
  pwField.appendChild(pwInputWrap);
  passwordStep.appendChild(pwField);

  // Only ever shown in "signin" mode (a signup, with no existing password,
  // has nothing to reset) — _wirePasswordStepEvents()'s updatePwModeUI()
  // toggles its "hide" class alongside pwModeToggle's own label swap.
  const pwForgotLink = document.createElement("button");
  pwForgotLink.type = "button";
  pwForgotLink.className = "rv-resend-link";
  pwForgotLink.textContent = "Forgot password?";
  passwordStep.appendChild(pwForgotLink);

  const pwSubmitBtn = document.createElement("button");
  pwSubmitBtn.type = "button";
  pwSubmitBtn.className = "rv-action-btn btn-primary";
  pwSubmitBtn.textContent = "Sign in";
  passwordStep.appendChild(pwSubmitBtn);

  const pwModeToggle = document.createElement("button");
  pwModeToggle.type = "button";
  pwModeToggle.className = "rv-resend-link";
  pwModeToggle.textContent = "New here? Create an account";
  passwordStep.appendChild(pwModeToggle);

  return { passwordToggle, passwordStep, pwBackBtn, pwNameField, pwNameInput, pwEmailInput, pwInput, pwVisibilityBtn, pwForgotLink, pwSubmitBtn, pwModeToggle };
}

/**
 * Wire every event listener for the already-built (and already-inserted)
 * email + password step. Split out of _buildPasswordSignInStep() purely to
 * keep both halves under this codebase's ~100-line function-size guideline —
 * see _buildPasswordStepDOM()'s doc comment.
 * @param {Object} deps - every element from _buildPasswordStepDOM() plus container/signinRow/overlay/insertBefore/placeId/auth/showError/hideError (see _buildPasswordSignInStep()'s own doc comment for those)
 * @returns {void}
 */
function _wirePasswordStepEvents({ passwordToggle, passwordStep, pwBackBtn, pwNameField, pwNameInput, pwEmailInput, pwInput, pwVisibilityBtn, pwForgotLink, pwSubmitBtn, pwModeToggle, container, signinRow, overlay, insertBefore, placeId, auth, showError, hideError }) {
  let pwMode = "signin"; // "signin" | "signup"
  function updatePwModeUI() {
    pwSubmitBtn.textContent = pwMode === "signin" ? "Sign in" : "Create account";
    pwModeToggle.textContent = pwMode === "signin" ? "New here? Create an account" : "Already have an account? Sign in";
    // "Forgot password?" only makes sense while signing in to an existing
    // account — a signup has no password yet to reset.
    pwForgotLink.classList.toggle("hide", pwMode !== "signin");
    // Mirror case of pwForgotLink above: only relevant for a brand-new
    // signup — see pwNameField's own doc comment in _buildPasswordStepDOM().
    pwNameField.classList.toggle("hide", pwMode !== "signup");
  }

  // Same collapse-the-row-when-a-panel-opens behavior as emailToggle in
  // _showSignInPrompt() above — see that handler's comment, and
  // crossFadeSwap()'s own doc comment (utils.js) for why the row's own
  // opacity fade is sequenced before, not concurrent with, the height-tween.
  passwordToggle.addEventListener("click", () => {
    crossFadeSwap(signinRow, passwordStep, () => {
      _animateReviewCardHeight(overlay, () => {
        signinRow.classList.add("hide");
        passwordStep.classList.remove("hide");
      });
    });
  });

  pwBackBtn.addEventListener("click", () => {
    crossFadeSwap(passwordStep, signinRow, () => {
      _animateReviewCardHeight(overlay, () => {
        passwordStep.classList.add("hide");
        signinRow.classList.remove("hide");
      });
    });
  });

  pwVisibilityBtn.addEventListener("click", () => {
    const showing = pwInput.type === "text";
    pwInput.type = showing ? "password" : "text";
    pwVisibilityBtn.innerHTML = showing ? EYE_SHOW_ICON_SVG : EYE_HIDE_ICON_SVG;
    pwVisibilityBtn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  });

  pwModeToggle.addEventListener("click", () => {
    pwMode = pwMode === "signin" ? "signup" : "signin";
    hideError();
    updatePwModeUI();
  });

  // Neutral outcome regardless of whether the typed email is actually
  // registered — see src/auth.js's sendPasswordReset() doc comment for why
  // this must never reveal that. Unlike the earlier pass, an empty/invalid
  // email never triggers a native window.prompt() — this panel already has
  // its own visible email input right above the password field (unlike the
  // magic-link cross-device case, which has no email field on screen at all
  // when it prompts), so staying inside this same custom-styled UI just
  // means focusing that input and showing the panel's own inline error.
  pwForgotLink.addEventListener("click", async () => {
    hideError();
    const email = pwEmailInput.value.trim();
    if (!email.includes("@")) {
      pwEmailInput.focus();
      showError("Enter your email address above first");
      return;
    }
    pwForgotLink.disabled = true;
    await auth.sendPasswordReset(email);
    pwForgotLink.disabled = false;
    showToast("Check your email", "check", "If an account exists for that email, a reset link is on its way.");
  });

  pwSubmitBtn.addEventListener("click", async () => {
    hideError();
    const name = pwNameInput.value.trim();
    const email = pwEmailInput.value.trim();
    const password = pwInput.value;
    if (pwMode === "signup" && !name) {
      showError("Please enter your name");
      pwNameInput.focus();
      return;
    }
    if (!email.includes("@")) {
      showError("Please enter a valid email address");
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      showError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }
    pwSubmitBtn.disabled = true;
    const busyLabel = pwMode === "signin" ? "Signing in…" : "Creating account…";
    pwSubmitBtn.innerHTML = `<span class="btn-spinner"></span> ${busyLabel}`;

    const result = pwMode === "signin"
      ? await auth.signInWithEmailPassword(email, password)
      : await auth.signUpWithEmailPassword(name, email, password);
    if (result.success) {
      await _afterSignInSuccess(placeId, overlay, container, insertBefore, auth, result);
    } else {
      pwSubmitBtn.disabled = false;
      updatePwModeUI();
      showError(emailPasswordErrorMessage(result.error, pwMode));
    }
  });
}

/**
 * Show the actual rating + text form (after sign-in, or when re-opened from
 * the Menu sheet's "Your reviews" list to edit an existing review).
 * @param {string} placeId
 * @param {HTMLElement} overlay
 * @param {HTMLElement} insertBefore
 * @param {{rating: number, text: string}|null} [existing=null] - pre-fills the
 *   form and switches the submit button to "Update review" when editing.
 */
function _showRatingForm(placeId, overlay, insertBefore, existing = null) {
  const form = document.createElement("div");
  form.className = "rv-form";
  form.appendChild(_buildFormHideButton(overlay));

  // Header
  const header = document.createElement("div");
  header.className = "rv-form-header";
  header.innerHTML = [
    `<p class="rv-form-title">${existing ? "Edit your review" : "How was your experience?"}</p>`,
    `<p class="rv-form-subtitle">Tap a star to rate</p>`,
  ].join("");
  form.appendChild(header);

  let selectedRating = existing?.rating || 0;
  const RATING_LABELS = ["", "Terrible", "Poor", "Okay", "Good", "Excellent"];

  const ratingLabel = document.createElement("span");
  ratingLabel.className = "rv-rating-label";
  ratingLabel.textContent = RATING_LABELS[selectedRating] || "";

  const starInput = _buildStarInput((rating) => {
    selectedRating = rating;
    ratingLabel.textContent = RATING_LABELS[rating] || "";
    submitBtn.disabled = rating === 0;
  }, selectedRating);

  form.appendChild(starInput);
  form.appendChild(ratingLabel);

  // Text area group
  const textGroup = document.createElement("div");
  textGroup.className = "rv-text-group";

  const textLabel = document.createElement("label");
  textLabel.className = "rv-text-label";
  textLabel.textContent = "Your review (optional)";

  const textArea = document.createElement("textarea");
  textArea.className = "rv-text-input";
  textArea.placeholder = "Share your experience…";
  textArea.maxLength = MAX_TEXT_LEN;
  textArea.rows = 3;
  textArea.value = existing?.text || "";

  const charCounter = document.createElement("span");
  charCounter.className = "rv-char-count";
  charCounter.textContent = `${textArea.value.length}/${MAX_TEXT_LEN}`;

  textArea.addEventListener("input", () => {
    charCounter.textContent = `${textArea.value.length}/${MAX_TEXT_LEN}`;
  });

  textGroup.appendChild(textLabel);
  textGroup.appendChild(textArea);
  textGroup.appendChild(charCounter);
  form.appendChild(textGroup);

  const imageGroup = document.createElement("div");
  imageGroup.className = "rv-image-group";
  const imageInput = document.createElement("input");
  imageInput.className = "rv-image-input";
  imageInput.type = "file";
  imageInput.accept = "image/jpeg,image/png,image/webp";
  imageInput.multiple = true;
  const imagePicker = document.createElement("label");
  imagePicker.className = "rv-image-picker btn-secondary";
  imagePicker.textContent = "Add photos";
  imagePicker.appendChild(imageInput);
  const imageHint = document.createElement("span");
  imageHint.className = "rv-image-hint";
  imageHint.textContent = `Up to ${MAX_REVIEW_IMAGES} JPG, PNG or WebP photos`;
  const imagePreview = document.createElement("div");
  imagePreview.className = "rv-image-preview";
  const photoTagOptions = getPhotoTagOptions(_placePhotoContexts.get(String(placeId)));
  let selectedImages = [];

  const renderImagePreview = () => {
    imagePreview.innerHTML = "";
    selectedImages.forEach((selection, index) => {
      const item = document.createElement("div");
      item.className = "rv-image-preview-item";
      const visual = document.createElement("div");
      visual.className = "rv-image-preview-visual";
      const img = document.createElement("img");
      img.src = URL.createObjectURL(selection.file);
      img.alt = `Selected review photo ${index + 1}`;
      img.onload = () => URL.revokeObjectURL(img.src);
      const remove = document.createElement("button");
      remove.className = "rv-image-remove";
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove photo ${index + 1}`);
      remove.addEventListener("click", () => {
        selectedImages.splice(index, 1);
        renderImagePreview();
      });
      const details = document.createElement("div");
      details.className = "rv-image-preview-details";
      const tagHeader = document.createElement("div");
      tagHeader.className = "rv-image-tag-header";
      const tagLabel = document.createElement("span");
      tagLabel.className = "rv-image-tag-label";
      tagLabel.textContent = `Photo ${index + 1}`;
      tagHeader.appendChild(tagLabel);
      const tagOptions = document.createElement("div");
      tagOptions.className = "rv-image-tag-options";
      tagOptions.setAttribute("role", "group");
      tagOptions.setAttribute("aria-label", `Label for photo ${index + 1}`);
      photoTagOptions.forEach((option) => {
        const tagButton = document.createElement("button");
        tagButton.className = "rv-image-tag-option";
        tagButton.type = "button";
        tagButton.textContent = option.label;
        const updateSelectedState = () => {
          const selected = selection.photoTag === option.value;
          tagButton.classList.toggle("is-selected", selected);
          tagButton.setAttribute("aria-pressed", String(selected));
        };
        updateSelectedState();
        tagButton.addEventListener("click", () => {
          selection.photoTag = selection.photoTag === option.value ? "" : option.value;
          tagOptions.querySelectorAll(".rv-image-tag-option").forEach((button) => {
            const selected = button === tagButton && selection.photoTag === option.value;
            button.classList.toggle("is-selected", selected);
            button.setAttribute("aria-pressed", String(selected));
          });
        });
        tagOptions.appendChild(tagButton);
      });
      details.append(tagHeader, tagOptions);
      remove.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
      visual.append(img, remove);
      item.append(visual, details);
      imagePreview.appendChild(item);
    });
    imagePicker.classList.toggle("hide", selectedImages.length >= MAX_REVIEW_IMAGES);
  };

  imageInput.addEventListener("change", () => {
    const incoming = [...(imageInput.files || [])];
    for (const file of incoming) {
      if (!REVIEW_IMAGE_TYPES.has(file.type)) { showToast("Unsupported photo", "error", "Use JPG, PNG or WebP"); continue; }
      if (file.size > MAX_REVIEW_IMAGE_BYTES) { showToast("Photo is too large", "error", "Maximum 5 MB per photo"); continue; }
      if (selectedImages.length < MAX_REVIEW_IMAGES) selectedImages.push({ file, photoTag: "" });
    }
    imageInput.value = "";
    renderImagePreview();
  });
  imageGroup.append(imagePicker, imageHint, imagePreview);
  form.appendChild(imageGroup);

  const submitBtn = document.createElement("button");
  submitBtn.className = "rv-submit-btn btn-primary";
  submitBtn.type = "button";
  submitBtn.textContent = existing ? "Update review" : "Submit review";
  submitBtn.disabled = selectedRating === 0;

  const note = document.createElement("p");
  note.className = "rv-form-note";
  note.textContent = "Your review will appear immediately.";

  submitBtn.addEventListener("click", async () => {
    if (selectedRating === 0) return;

    const text = textArea.value.trim();
    if (text && text.length < MIN_TEXT_LEN) {
      showToast("Review too short", "error", `Minimum ${MIN_TEXT_LEN} characters`);
      return;
    }

    const ratingAtSubmit = selectedRating;
    // _activeOverlayPlaceName is cleared by closeReviewsOverlay() below —
    // capture it now, before that happens, in case the request fails and
    // this needs to reopen.
    const reopenPlaceName = _activeOverlayPlaceName;

    // Optimistic: close immediately rather than making the user sit through
    // a spinner for the network round-trip — this form's own copy already
    // promises "Your review will appear immediately." If the request
    // actually fails, the exact rating/text is never discarded: the form
    // reopens pre-filled with it below, so nothing the user typed is lost.
    closeReviewsOverlay();
    showToast(existing ? "Updating review…" : "Submitting review…", "check");

    const result = await submitReview(placeId, ratingAtSubmit, text, selectedImages);

    if (result.success) {
      if (result.status === "updated") {
        showToast("Review updated", "check", result.imageError ? "Review saved; some photos could not upload" : "");
      } else if (result.status === "pending") {
        showToast("Review submitted", "check", "Will appear after moderation");
      } else if (!result.status) {
        showToast("Review submitted", "check", "Will appear after moderation");
      } else {
        showToast("Review published", "check", result.imageError ? "Some photos could not upload" : (result.uploaded ? `${result.uploaded} photo${result.uploaded === 1 ? "" : "s"} added` : ""));
      }
      return;
    }

    const msgs = {
      already_reviewed: "You've already reviewed this place",
      rate_limited: "Too many reviews today. Try again tomorrow.",
      invalid_place: "Place not found",
      invalid_rating: "Invalid rating",
      invalid_token: "Session expired. Please sign in again.",
      reviewer_banned: "This account can no longer submit reviews.",
      text_too_short: `Minimum ${MIN_TEXT_LEN} characters for text`,
      network_error: "Network error. Try again.",
    };
    showToast(msgs[result.error] || "Submission failed", "error");
    if (result.error === "invalid_token") {
      // Re-render from scratch — current auth state decides sign-in-gate
      // vs. rating form, same as any other fresh open.
      openReviewsOverlay(placeId, reopenPlaceName);
      return;
    }
    openReviewsOverlayForEdit(placeId, reopenPlaceName, { rating: ratingAtSubmit, text });
  });

  form.appendChild(submitBtn);
  form.appendChild(note);

  _insertReviewPanel(insertBefore, form);
}

// ─── Initialization ──────────────────────────────────────────────────────────

function _insertReviewPanel(insertBefore, contentEl) {
  const panel = document.createElement("div");
  panel.className = "rv-write-panel shut";
  const inner = document.createElement("div");
  inner.className = "rv-write-panel-inner";
  const content = document.createElement("div");
  content.className = "rv-write-panel-content";
  content.appendChild(contentEl);
  inner.appendChild(content);
  panel.appendChild(inner);
  insertBefore.insertAdjacentElement("beforebegin", panel);

  const card = insertBefore.closest(".rv-overlay-card");
  if (!card || isReduceMotionActive()) {
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.remove("shut")));
    return;
  }

  // This reveal FLIP manipulates `card`'s own inline height/transition
  // directly, exactly like utils.js's animateElementHeight() does — so it
  // must participate in that same element's `_heightAnimCleanup` handshake.
  // Without this guard, a call already in flight here would get clobbered by
  // (or itself clobber) a `_animateReviewCardHeight()` call that lands on the
  // very same tick — see the new `card._heightAnimCleanup = releaseHeightLock`
  // assignment below for the other half of this.
  if (card._heightAnimCleanup) card._heightAnimCleanup();

  // FLIP the card's outer height and the panel's own grid-template-rows
  // reveal *together*, from the same frame, so they run as one continuous
  // motion instead of the earlier freeze → invisible-grow → abrupt-snap
  // sequence (the card was pinned at its old height for the panel's entire
  // reveal, then popped to its true size the instant the lock released —
  // two disjoint phases stitched together read as jank). See
  // docs/PREFERENCE_LOG.md.
  //
  // Measurement: pin the card at its current height (so the DOM insert above
  // doesn't itself cause a jump), then momentarily force the panel fully
  // open with transitions disabled to read the card's true post-reveal
  // height, then revert both back to their closed/pinned state before
  // starting the real, visible transition — the same disable-transition /
  // measure / restore idiom animateElementHeight() uses for a single
  // element, applied here across the two elements (card + panel) at once.
  const oldHeight = card.offsetHeight;
  card.style.transition = "none";
  card.style.height = `${oldHeight}px`;
  panel.style.transition = "none";

  panel.classList.remove("shut");
  // Release the pinned height to auto just for this measurement — leaving
  // it pinned at oldHeight here (a bug in an earlier pass) made newHeight
  // always equal oldHeight, silently no-opping the transition below and
  // leaving the release-lock's removeProperty("height") as the only thing
  // that ever actually resized the card — an abrupt snap, not a transition.
  card.style.height = "auto";
  void card.offsetHeight;
  const newHeight = card.offsetHeight;
  card.style.height = `${oldHeight}px`;
  panel.classList.add("shut");
  void card.offsetHeight;

  requestAnimationFrame(() => {
    card.style.removeProperty("transition");
    panel.style.removeProperty("transition");
    card.style.height = `${newHeight}px`;
    panel.classList.remove("shut");

    let releaseTimer;
    // Ends this reveal — normally fired once naturally (panel's own
    // grid-template-rows transitionend, or the fallback timer below), but
    // ALSO wired up as `card._heightAnimCleanup` so it can be forced to run
    // early and synchronously. That second path matters because
    // `_animateReviewCardHeight()`/`animateElementHeight()` (utils.js) can
    // run on this exact same `card` element before this reveal's own
    // var(--t-spring) transition would naturally finish — e.g. the user taps
    // "Continue with email"/"Continue with a password" (or its "Back to
    // sign-in options" link) while the sign-in prompt is still animating in.
    // Previously that left this reveal's own transitionend listener/fallback
    // timer dangling; when it eventually fired — potentially *during* the
    // second, unrelated row-collapse/-expand transition already running on
    // `card` — its `card.style.removeProperty("height")` yanked the explicit
    // height out from under that second transition, snapping it instead of
    // letting it finish smoothly. That extra stutter is exactly why the
    // reviews overlay's sign-in row felt different from src/menu.js's
    // equivalent, which has no competing entrance-reveal animation on its
    // account panel at all. Forcing BOTH this reveal's card-height tween and
    // the panel's own grid-template-rows to their final resting state
    // synchronously (not just clearing the listener/timer) means whatever
    // runs next reads a fully-settled height, not a mid-flight one. See
    // docs/PREFERENCE_LOG.md.
    const releaseHeightLock = () => {
      panel.removeEventListener("transitionend", onPanelTransitionEnd);
      clearTimeout(releaseTimer);
      if (card._heightAnimCleanup === releaseHeightLock) card._heightAnimCleanup = null;
      panel.style.transition = "none";
      panel.classList.remove("shut");
      void panel.offsetHeight;
      panel.style.removeProperty("transition");
      if (card.isConnected) card.style.removeProperty("height");
    };
    const onPanelTransitionEnd = (e) => {
      if (e.target === panel && e.propertyName === "grid-template-rows") releaseHeightLock();
    };
    panel.addEventListener("transitionend", onPanelTransitionEnd);
    releaseTimer = setTimeout(releaseHeightLock, WRITE_PANEL_OPEN_RELEASE_FALLBACK_MS);
    card._heightAnimCleanup = releaseHeightLock;
  });
}

function _buildFormHideButton(overlay) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rv-form-close btn-roundel";
  btn.setAttribute("aria-label", "Hide review form");
  btn.title = "Hide review form";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    _restoreReviewSummary(overlay);
  });
  return btn;
}

/**
 * Initialize the reviews module. Call after map load.
 */
export function initReviews() {
  loadReviews();
}
