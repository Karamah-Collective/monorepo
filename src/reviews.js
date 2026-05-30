/**
 * Reviews — in-app community rating & review system.
 *
 * Users verify via email OTP, then rate places (1–5 stars) with optional text.
 * Verified reviews go live immediately. Verification token persists 7 days.
 *
 * Data stored in Google Sheets "Reviews" worksheet, proxied via /api/reviews.
 */
import { RECAPTCHA_SITE_KEY } from "./config.js";
import { esc, escA, showToast, loadRecaptcha, animateElementHeight } from "./utils.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY_REVIEWS = "hf_reviews_v1";
const STORAGE_KEY_VERIFY_TOKEN = "hf_verify_token";
const CACHE_TTL_MS = 300_000; // 5 min local cache
const MAX_TEXT_LEN = 500;
const MIN_TEXT_LEN = 20;
const OTP_RESEND_COOLDOWN_MS = 30_000;
const OVERLAY_CLEAR_DELAY_MS = 420;
const REVIEW_PANEL_ANIMATION_MS = 280;

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

/**
 * Send OTP to an email address.
 * @param {string} email
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function _sendOTP(email) {
  await loadRecaptcha(RECAPTCHA_SITE_KEY);
  const token = await new Promise((resolve) =>
    grecaptcha.ready(() =>
      grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "review_verify" }).then(resolve)
    )
  );

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send-otp", email, token }),
    });
    const result = await res.json();
    if (result.success) return { success: true };
    return { success: false, error: result.error };
  } catch {
    return { success: false, error: "network_error" };
  }
}

/**
 * Verify an OTP and obtain a signed token.
 * @param {string} email
 * @param {string} otp
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function _verifyOTP(email, otp) {
  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify-otp", email, otp }),
    });
    const result = await res.json();
    if (result.success && result.token) {
      _storeVerificationToken(result.token, result.expiresAt);
      return { success: true };
    }
    return { success: false, error: result.error };
  } catch {
    return { success: false, error: "network_error" };
  }
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
 * Submit a review for a place. Requires email-verified token.
 * @param {string} placeId
 * @param {number} rating - 1 to 5
 * @param {string} text - optional review text
 * @returns {Promise<{success: boolean, status?: string, error?: string}>}
 */
export async function submitReview(placeId, rating, text) {
  const verification = _getVerificationToken();
  if (!verification) return { success: false, error: "invalid_token" };

  const payload = {
    action: "submit",
    placeId,
    rating,
    text: text || "",
    verifyToken: verification.token,
  };

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    if (result.success) {
      _updateLocalReview(placeId, rating, text, result.status);
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
  const verification = _getVerificationToken();
  if (!verification) return { reviewed: false };

  const payload = {
    action: "check",
    placeId,
    verifyToken: verification.token,
  };

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

  if (!activePanel || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
 * Show the review form — with email verification gate if not verified.
 * @param {string} placeId
 * @param {HTMLElement} overlay
 */
function _showReviewForm(placeId, overlay) {
  overlay.querySelectorAll(".rv-write-trigger").forEach((btn) => btn.remove());

  const list = overlay.querySelector(".rv-list");

  if (isVerified()) {
    _showRatingForm(placeId, overlay, list);
  } else {
    _showVerificationForm(placeId, overlay, list);
  }
}

/**
 * Show email verification UI (email input → OTP input).
 */
function _showVerificationForm(placeId, overlay, insertBefore) {
  const container = document.createElement("div");
  container.className = "rv-verify-form";
  container.appendChild(_buildFormHideButton(overlay));

  // State
  let _email = "";
  let _lastSendTime = 0;

  // ─── Email Step ─────────────────────────────────────────────────────
  const emailStep = document.createElement("div");
  emailStep.className = "rv-verify-step";
  emailStep.innerHTML = [
    `<div class="rv-verify-header">`,
    `<div class="rv-verify-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></div>`,
    `<p class="rv-verify-title">Verify your email</p>`,
    `<p class="rv-verify-desc">A 6-digit code will be sent to confirm your identity</p>`,
    `</div>`,
  ].join("");

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

  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "rv-action-btn btn-primary";
  sendBtn.textContent = "Send verification code";
  sendBtn.disabled = true;

  emailInput.addEventListener("input", () => {
    sendBtn.disabled = !emailInput.value.includes("@");
  });

  emailStep.appendChild(sendBtn);
  container.appendChild(emailStep);

  // ─── OTP Step ───────────────────────────────────────────────────────
  const otpStep = document.createElement("div");
  otpStep.className = "rv-verify-step rv-otp-step hide";
  otpStep.innerHTML = [
    `<div class="rv-verify-header">`,
    `<div class="rv-verify-icon rv-verify-icon--success"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg></div>`,
    `<p class="rv-verify-title">Check your inbox</p>`,
    `<p class="rv-verify-desc rv-otp-email-hint">Code sent — enter it below</p>`,
    `</div>`,
  ].join("");

  // Individual OTP digit boxes
  const otpBoxes = document.createElement("div");
  otpBoxes.className = "rv-otp-boxes";
  const otpDigits = [];
  for (let i = 0; i < 6; i++) {
    const digit = document.createElement("input");
    digit.type = "text";
    digit.inputMode = "numeric";
    digit.pattern = "[0-9]";
    digit.maxLength = 1;
    digit.className = "rv-otp-digit";
    digit.autocomplete = i === 0 ? "one-time-code" : "off";
    digit.setAttribute("aria-label", `Digit ${i + 1}`);
    otpDigits.push(digit);
    otpBoxes.appendChild(digit);
  }
  otpStep.appendChild(otpBoxes);

  // OTP digit navigation logic
  otpDigits.forEach((input, idx) => {
    input.addEventListener("input", (e) => {
      const val = e.target.value.replace(/\D/g, "");
      if (val.length > 0) {
        input.value = val[0];
        if (idx < 5) otpDigits[idx + 1].focus();
      } else {
        input.value = "";
      }
      _checkOtpComplete();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && idx > 0) {
        otpDigits[idx - 1].focus();
        otpDigits[idx - 1].value = "";
        _checkOtpComplete();
      }
    });
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      for (let j = 0; j < pasted.length && j < 6; j++) {
        otpDigits[j].value = pasted[j];
      }
      const focusIdx = Math.min(pasted.length, 5);
      otpDigits[focusIdx].focus();
      _checkOtpComplete();
    });
  });

  const verifyBtn = document.createElement("button");
  verifyBtn.type = "button";
  verifyBtn.className = "rv-action-btn btn-primary";
  verifyBtn.textContent = "Verify";
  verifyBtn.disabled = true;
  otpStep.appendChild(verifyBtn);

  function _checkOtpComplete() {
    const full = otpDigits.every((d) => d.value.length === 1);
    verifyBtn.disabled = !full;
  }

  function _getOtpValue() {
    return otpDigits.map((d) => d.value).join("");
  }

  const resendLink = document.createElement("button");
  resendLink.type = "button";
  resendLink.className = "rv-resend-link";
  resendLink.textContent = "Resend code";
  resendLink.disabled = true;
  otpStep.appendChild(resendLink);

  container.appendChild(otpStep);

  // Error display
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

  // Send OTP handler
  async function handleSend() {
    hideError();
    _email = emailInput.value.trim().toLowerCase();
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span class="btn-spinner"></span> Sending...`;

    const result = await _sendOTP(_email);

    if (result.success) {
      _lastSendTime = Date.now();
      _animateReviewCardHeight(overlay, () => {
        emailStep.classList.add("hide");
        otpStep.classList.remove("hide");
        const hint = otpStep.querySelector(".rv-otp-email-hint");
        if (hint) hint.textContent = `Code sent to ${_email}`;
      });
      requestAnimationFrame(() => otpDigits[0].focus());
      _startResendCooldown(resendLink);
    } else {
      const msgs = {
        invalid_email: "Please enter a valid email address",
        rate_limited_email: "Too many codes requested. Try again later.",
        rate_limited_ip: "Too many requests. Try again later.",
        quota_exhausted: "Verification unavailable right now. Please try again later.",
        email_send_failed: "Could not send email. Try again later.",
        network_error: "Network error. Check your connection.",
      };
      showError(msgs[result.error] || "Could not send code. Try again.");
      sendBtn.disabled = false;
      sendBtn.textContent = "Send verification code";
    }
  }

  sendBtn.addEventListener("click", handleSend);
  emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !sendBtn.disabled) handleSend();
  });

  // Verify OTP handler
  async function handleVerify() {
    hideError();
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = `<span class="btn-spinner"></span> Verifying...`;

    const result = await _verifyOTP(_email, _getOtpValue());

    if (result.success) {
      _animateReviewCardHeight(overlay, () => {
        container.remove();
        _showRatingForm(placeId, overlay, insertBefore);
      });
      showToast("Email verified", "check");
    } else {
      const msgs = {
        wrong_otp: "Incorrect code. Please try again.",
        otp_expired: "Code expired. Request a new one.",
        too_many_attempts: "Too many attempts. Request a new code.",
        invalid_otp: "Enter a 6-digit code.",
        network_error: "Network error. Check your connection.",
      };
      showError(msgs[result.error] || "Verification failed. Try again.");
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Verify";
      if (result.error === "otp_expired" || result.error === "too_many_attempts") {
        _animateReviewCardHeight(overlay, () => {
          otpStep.classList.add("hide");
          emailStep.classList.remove("hide");
          otpDigits.forEach((d) => { d.value = ""; });
          sendBtn.disabled = false;
          sendBtn.textContent = "Send verification code";
        });
      }
    }
  }

  verifyBtn.addEventListener("click", handleVerify);
  // Submit on last digit entry
  otpDigits[5].addEventListener("input", () => {
    setTimeout(() => { if (!verifyBtn.disabled) handleVerify(); }, 50);
  });

  // Resend handler
  resendLink.addEventListener("click", async () => {
    hideError();
    resendLink.disabled = true;
    const result = await _sendOTP(_email);
    if (result.success) {
      _lastSendTime = Date.now();
      _startResendCooldown(resendLink);
      showToast("Code resent", "check");
    } else {
      showError("Could not resend. Try again later.");
      resendLink.disabled = false;
    }
  });

  _insertReviewPanel(insertBefore, container);
  requestAnimationFrame(() => emailInput.focus());
}

/**
 * Start the resend cooldown timer on the resend link.
 * @param {HTMLElement} resendLink
 */
function _startResendCooldown(resendLink) {
  resendLink.disabled = true;
  let remaining = Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000);
  resendLink.textContent = `Resend code (${remaining}s)`;
  const interval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(interval);
      resendLink.disabled = false;
      resendLink.textContent = "Resend code";
    } else {
      resendLink.textContent = `Resend code (${remaining}s)`;
    }
  }, 1000);
}

/**
 * Show the actual rating + text form (after email verification).
 * @param {string} placeId
 * @param {HTMLElement} overlay
 * @param {HTMLElement} insertBefore
 */
function _showRatingForm(placeId, overlay, insertBefore) {
  const form = document.createElement("div");
  form.className = "rv-form";
  form.appendChild(_buildFormHideButton(overlay));

  // Header
  const header = document.createElement("div");
  header.className = "rv-form-header";
  header.innerHTML = [
    `<p class="rv-form-title">How was your experience?</p>`,
    `<p class="rv-form-subtitle">Tap a star to rate</p>`,
  ].join("");
  form.appendChild(header);

  let selectedRating = 0;
  const RATING_LABELS = ["", "Terrible", "Poor", "Okay", "Good", "Excellent"];

  const ratingLabel = document.createElement("span");
  ratingLabel.className = "rv-rating-label";
  ratingLabel.textContent = "";

  const starInput = _buildStarInput((rating) => {
    selectedRating = rating;
    ratingLabel.textContent = RATING_LABELS[rating] || "";
    submitBtn.disabled = rating === 0;
  });

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

  const charCounter = document.createElement("span");
  charCounter.className = "rv-char-count";
  charCounter.textContent = `0/${MAX_TEXT_LEN}`;

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
  submitBtn.textContent = "Submit review";
  submitBtn.disabled = true;

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

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="btn-spinner"></span> Submitting…`;

    const result = await submitReview(placeId, selectedRating, text);

    if (result.success) {
      if (result.status === "updated") {
        showToast("Review updated", "check");
      } else if (!result.status) {
        showToast("Review submitted", "check", "Will appear after moderation");
      } else {
        showToast("Review published", "check");
      }
      closeReviewsOverlay();
    } else {
      const msgs = {
        already_reviewed: "You've already reviewed this place",
        rate_limited: "Too many reviews today. Try again tomorrow.",
        invalid_place: "Place not found",
        invalid_rating: "Invalid rating",
        invalid_token: "Session expired. Please verify again.",
        text_too_short: `Minimum ${MIN_TEXT_LEN} characters for text`,
        network_error: "Network error. Try again.",
      };
      if (result.error === "invalid_token") {
        localStorage.removeItem(STORAGE_KEY_VERIFY_TOKEN);
        _animateReviewCardHeight(overlay, () => {
          form.remove();
          const list = overlay.querySelector(".rv-list");
          if (list) _showVerificationForm(placeId, overlay, list);
        });
        showToast(msgs[result.error], "error");
        return;
      }
      showToast(msgs[result.error] || "Submission failed", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit review";
    }
  });

  form.appendChild(submitBtn);
  form.appendChild(note);

  _insertReviewPanel(insertBefore, form);
}

// ─── Initialization ──────────────────────────────────────────────────────────

function _insertReviewPanel(insertBefore, contentEl) {
  // Lock the card at its current height so the expanding panel doesn't push
  // review cards downward — the form reveals within the scroll area instead.
  const card = insertBefore.closest(".rv-overlay-card");
  if (card) card.style.height = `${card.offsetHeight}px`;

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
  requestAnimationFrame(() => {
    requestAnimationFrame(() => panel.classList.remove("shut"));
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
