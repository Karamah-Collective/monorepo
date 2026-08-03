/**
 * Reviews — in-app community rating & review system.
 *
 * Writing a review requires signing in (Google or email magic link, see
 * src/auth.js) — this replaces the legacy anonymous email-OTP flow for new
 * reviews going forward (docs/ACCOUNTS_AND_REDESIGN_PLAN.md Phase 7). Users
 * who already hold a still-valid OTP verification token from before this
 * change keep working via that token for continuity (isVerified() below) —
 * only the *entry point* that mints new tokens has moved to sign-in.
 *
 * Data stored in Google Sheets "Reviews" worksheet, proxied via /api/reviews.
 */
import { esc, showToast, animateElementHeight, isReduceMotionActive, showWelcomeGreeting } from "./utils.js";
import { EVT } from "./events.js";
import { EMAIL_SIGNIN_BTN_HTML, GOOGLE_SIGNIN_BTN_HTML, MICROSOFT_SIGNIN_BTN_HTML } from "./icons.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY_REVIEWS = "hf_reviews_v1";
const STORAGE_KEY_VERIFY_TOKEN = "hf_verify_token";
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

function _animateReviewCardHeight(overlay, changeFn) {
  const card = overlay?.querySelector(".rv-overlay-card");
  animateElementHeight(card, changeFn, { skip: overlay?.classList.contains("hide") });
}

// ─── Email Verification Token ────────────────────────────────────────────────

/**
 * Get the stored verification token if still valid.
 * @returns {{token: string, expiresAt: number} | null}
 */
function _getVerificationToken() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VERIFY_TOKEN);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.token || !data.expiresAt) return null;
    if (Date.now() > data.expiresAt) {
      localStorage.removeItem(STORAGE_KEY_VERIFY_TOKEN);
      return null;
    }
    return data;
  } catch {
    localStorage.removeItem(STORAGE_KEY_VERIFY_TOKEN);
    return null;
  }
}

/**
 * Store a verification token in localStorage.
 * @param {string} token
 * @param {number} expiresAt - Unix ms timestamp
 */
function _storeVerificationToken(token, expiresAt) {
  try {
    localStorage.setItem(STORAGE_KEY_VERIFY_TOKEN, JSON.stringify({ token, expiresAt }));
  } catch { /* quota */ }
}

/**
 * Check if the user is currently verified.
 * @returns {boolean}
 */
export function isVerified() {
  return _getVerificationToken() !== null;
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
  const urls = [_withCacheBust("/api/reviews")];

  try {
    const cfg = await import("./config.local.js");
    if (cfg.SHEETS_URL) urls.push(_withCacheBust(`${cfg.SHEETS_URL}?action=reviews`));
  } catch {
    // config.local.js absent in production — expected
  }

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
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
    } catch {
      continue;
    }
  }
}

function _withCacheBust(url) {
  const freshUrl = new URL(url, window.location.origin);
  freshUrl.searchParams.set("_", Date.now().toString());
  return freshUrl.href;
}

function _hydrateMap(data) {
  _reviewsMap.clear();
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

// ─── Review Submission ───────────────────────────────────────────────────────

/**
 * Resolve the current identity to attach to a reviews API call: a Firebase
 * ID token when signed in (preferred — see src/auth.js), falling back to a
 * still-valid legacy OTP verification token for continuity.
 * @returns {Promise<{idToken: string}|{verifyToken: string}|null>}
 */
async function _resolveReviewIdentity() {
  const auth = await _getAuthModule();
  if (auth.getCachedAccount()) {
    const idToken = await auth.getIdToken();
    if (idToken) return { idToken };
  }
  const verification = _getVerificationToken();
  if (verification) return { verifyToken: verification.token };
  return null;
}

/**
 * Submit a review for a place. Requires the caller to be signed in (Google or
 * email magic link) or hold a still-valid legacy OTP verification token.
 * @param {string} placeId
 * @param {number} rating - 1 to 5
 * @param {string} text - optional review text
 * @returns {Promise<{success: boolean, status?: string, error?: string}>}
 */
export async function submitReview(placeId, rating, text) {
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
      return { success: true, status: result.status };
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
  const auth = await _getAuthModule();
  if (!auth.getCachedAccount()) return { reviews: [] };
  const idToken = await auth.getIdToken();
  if (!idToken) return { reviews: [] };

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "my-reviews", idToken }),
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
  const auth = await _getAuthModule();
  const idToken = auth.getCachedAccount() ? await auth.getIdToken() : null;
  if (!idToken) return { success: false, error: "invalid_token" };

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", placeId, idToken }),
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
 * fresh review, instead of a second bespoke edit UI.
 * @param {string} placeId
 * @param {string} placeName
 * @param {{rating: number, text: string}} existing
 */
export function openReviewsOverlayForEdit(placeId, placeName, existing) {
  openReviewsOverlay(placeId, placeName);
  const overlay = document.getElementById("reviews-overlay");
  const list = overlay?.querySelector(".rv-list");
  if (!list) return;
  overlay.querySelectorAll(".rv-write-trigger").forEach((btn) => btn.remove());
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
  const textReviews = reviews
    .filter((r) => _getReviewText(r).length > 0)
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

  const reviewCards = textReviews.length
    ? `<div class="rv-list">${textReviews.map((r) => _buildReviewCard(r)).join("")}</div>`
    : `<div class="rv-list"><div class="rv-empty"><p class="rv-empty-text">No text reviews yet</p></div></div>`;

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
 * Show the review form — gated on sign-in (Google/email link) unless the
 * caller still holds a valid legacy OTP token from before Phase 7.
 * @param {string} placeId
 * @param {HTMLElement} overlay
 * @returns {Promise<void>}
 */
async function _showReviewForm(placeId, overlay) {
  overlay.querySelectorAll(".rv-write-trigger").forEach((btn) => btn.remove());

  const list = overlay.querySelector(".rv-list");

  if (isVerified()) {
    _showRatingForm(placeId, overlay, list);
    return;
  }

  const auth = await _getAuthModule();
  if (auth.getCachedAccount()) {
    _showRatingForm(placeId, overlay, list);
    return;
  }

  _showSignInPrompt(placeId, overlay, list, auth);
}

/**
 * Show the sign-in gate (Google popup, or an email magic link) that replaces
 * the legacy anonymous OTP flow as the entry point for new reviewers.
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
  googleBtn.innerHTML = GOOGLE_SIGNIN_BTN_HTML;
  signinRow.appendChild(googleBtn);

  const microsoftBtn = document.createElement("button");
  microsoftBtn.type = "button";
  microsoftBtn.className = "rv-action-btn btn-microsoft";
  microsoftBtn.innerHTML = MICROSOFT_SIGNIN_BTN_HTML;
  signinRow.appendChild(microsoftBtn);

  const emailToggle = document.createElement("button");
  emailToggle.type = "button";
  emailToggle.className = "rv-action-btn btn-secondary";
  emailToggle.disabled = false;
  emailToggle.innerHTML = EMAIL_SIGNIN_BTN_HTML;
  signinRow.appendChild(emailToggle);

  const emailStep = document.createElement("div");
  emailStep.className = "rv-verify-step hide";

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

  emailToggle.addEventListener("click", () => {
    _animateReviewCardHeight(overlay, () => emailStep.classList.toggle("hide"));
  });

  googleBtn.addEventListener("click", async () => {
    hideError();
    googleBtn.disabled = true;
    googleBtn.innerHTML = `<span class="btn-spinner"></span> Signing in…`;

    const result = await auth.signInWithGoogle();
    if (result.success) {
      showWelcomeGreeting(result.account, result.isNewUser);
      _animateReviewCardHeight(overlay, () => {
        container.remove();
        _showRatingForm(placeId, overlay, insertBefore);
      });
    } else {
      googleBtn.disabled = false;
      googleBtn.innerHTML = GOOGLE_SIGNIN_BTN_HTML;
      // Don't show an error for a simple popup-close/cancel — that's not a failure.
      if (result.error !== "auth/popup-closed-by-user" && result.error !== "auth/cancelled-popup-request") {
        showError("Sign-in failed. Please try again.");
      }
    }
  });

  microsoftBtn.addEventListener("click", async () => {
    hideError();
    microsoftBtn.disabled = true;
    microsoftBtn.innerHTML = `<span class="btn-spinner"></span> Signing in…`;

    const result = await auth.signInWithMicrosoft();
    if (result.success) {
      showWelcomeGreeting(result.account, result.isNewUser);
      _animateReviewCardHeight(overlay, () => {
        container.remove();
        _showRatingForm(placeId, overlay, insertBefore);
      });
    } else {
      microsoftBtn.disabled = false;
      microsoftBtn.innerHTML = MICROSOFT_SIGNIN_BTN_HTML;
      if (result.error !== "auth/popup-closed-by-user" && result.error !== "auth/cancelled-popup-request") {
        showError("Sign-in failed. Please try again.");
      }
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

  _insertReviewPanel(insertBefore, container);
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

    const result = await submitReview(placeId, ratingAtSubmit, text);

    if (result.success) {
      if (result.status === "updated") {
        showToast("Review updated", "check");
      } else if (!result.status) {
        showToast("Review submitted", "check", "Will appear after moderation");
      } else {
        showToast("Review published", "check");
      }
      return;
    }

    const msgs = {
      already_reviewed: "You've already reviewed this place",
      rate_limited: "Too many reviews today. Try again tomorrow.",
      invalid_place: "Place not found",
      invalid_rating: "Invalid rating",
      invalid_token: "Session expired. Please sign in again.",
      text_too_short: `Minimum ${MIN_TEXT_LEN} characters for text`,
      network_error: "Network error. Try again.",
    };
    showToast(msgs[result.error] || "Submission failed", "error");
    if (result.error === "invalid_token") {
      localStorage.removeItem(STORAGE_KEY_VERIFY_TOKEN);
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
    const releaseHeightLock = () => {
      panel.removeEventListener("transitionend", onPanelTransitionEnd);
      clearTimeout(releaseTimer);
      if (card.isConnected) card.style.removeProperty("height");
    };
    const onPanelTransitionEnd = (e) => {
      if (e.target === panel && e.propertyName === "grid-template-rows") releaseHeightLock();
    };
    panel.addEventListener("transitionend", onPanelTransitionEnd);
    releaseTimer = setTimeout(releaseHeightLock, WRITE_PANEL_OPEN_RELEASE_FALLBACK_MS);
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
