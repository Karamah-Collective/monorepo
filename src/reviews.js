/**
 * Reviews — in-app community rating & review system.
 *
 * Users rate places (1–5 stars) with optional text. Ratings are published
 * immediately; text reviews go through admin moderation. Anti-abuse uses
 * browser fingerprinting + device ID + server-side IP hashing for triple dedup.
 *
 * Data stored in Google Sheets "Reviews" worksheet, proxied via /api/reviews.
 */
import { RECAPTCHA_SITE_KEY } from "./config.js";
import { esc, escA, showToast, loadRecaptcha, getDeviceId } from "./utils.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY_REVIEWS = "hf_reviews_v1";
const CACHE_TTL_MS = 300_000; // 5 min local cache
const MAX_TEXT_LEN = 500;
const MIN_TEXT_LEN = 20;
const MAX_REVIEWS_PER_DAY = 5;

// ─── State ────────────────────────────────────────────────────────────────────
/** @type {Map<string, {avg: number, count: number, items: Array}>} */
let _reviewsMap = new Map();
let _lastFetch = 0;
let _fingerprint = null;
let _activeOverlayPlaceId = null;

// ─── Fingerprinting ──────────────────────────────────────────────────────────

/**
 * Generate a stable browser fingerprint hash using canvas, WebGL, and hardware signals.
 * Computed once per session, cached in memory (never localStorage to prevent tampering).
 * @returns {Promise<string>} SHA-256 hex hash
 */
async function _computeFingerprint() {
  if (_fingerprint) return _fingerprint;

  const signals = [];

  // Canvas fingerprint
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("HalalFinder:fp", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("HalalFinder:fp", 4, 17);
    signals.push(canvas.toDataURL());
  } catch {
    signals.push("canvas:unsupported");
  }

  // WebGL renderer + vendor
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        signals.push(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "");
        signals.push(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || "");
      }
    }
  } catch {
    signals.push("webgl:unsupported");
  }

  // Screen metrics
  signals.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
  signals.push(String(devicePixelRatio || 1));

  // Hardware
  signals.push(String(navigator.hardwareConcurrency || 0));
  signals.push(String(navigator.deviceMemory || 0));

  // Timezone + language + platform
  try {
    signals.push(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  } catch {
    signals.push("");
  }
  signals.push((navigator.languages || [navigator.language || ""]).join(","));
  signals.push(navigator.platform || "");

  // Hash all signals
  const raw = signals.join("|");
  const data = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  _fingerprint = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return _fingerprint;
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
    const res = await fetch("/api/reviews");
    if (!res.ok) return;
    const json = await res.json();
    if (json.reviews) {
      _hydrateMap(json.reviews);
      _lastFetch = Date.now();
      try {
        localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify({ ts: _lastFetch, data: json.reviews }));
      } catch { /* quota */ }
    }
  } catch { /* offline / error — use cache */ }
}

function _hydrateMap(data) {
  _reviewsMap.clear();
  for (const [placeId, info] of Object.entries(data)) {
    _reviewsMap.set(placeId, info);
  }
}

// ─── Public Getters ──────────────────────────────────────────────────────────

/**
 * Get review aggregate for a place.
 * @param {string} placeId
 * @returns {{avg: number, count: number} | null}
 */
export function getPlaceRating(placeId) {
  const data = _reviewsMap.get(placeId);
  if (!data || !data.count) return null;
  return { avg: data.avg, count: data.count };
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
 * Submit a review for a place.
 * @param {string} placeId
 * @param {number} rating - 1 to 5
 * @param {string} text - optional review text
 * @returns {Promise<{success: boolean, status?: string, error?: string}>}
 */
export async function submitReview(placeId, rating, text) {
  const fingerprint = await _computeFingerprint();
  const deviceId = getDeviceId();
  await loadRecaptcha(RECAPTCHA_SITE_KEY);
  const token = await new Promise((resolve) =>
    grecaptcha.ready(() =>
      grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "review_submit" }).then(resolve)
    )
  );

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit",
        token,
        placeId,
        rating,
        text: text || "",
        deviceId,
        fingerprint,
      }),
    });

    const result = await res.json();
    if (result.success) {
      // Optimistic local update
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
  const fingerprint = await _computeFingerprint();
  const deviceId = getDeviceId();
  await loadRecaptcha(RECAPTCHA_SITE_KEY);
  const token = await new Promise((resolve) =>
    grecaptcha.ready(() =>
      grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "review_check" }).then(resolve)
    )
  );

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "check",
        token,
        placeId,
        deviceId,
        fingerprint,
      }),
    });
    return await res.json();
  } catch {
    return { reviewed: false };
  }
}

function _updateLocalReview(placeId, rating, text, status) {
  const existing = _reviewsMap.get(placeId) || { avg: 0, count: 0, items: [] };

  if (status === "updated") {
    // Replace existing rating in items (last item from this user — we only know locally)
    existing.items = existing.items || [];
    // Recalculate avg: replace one entry
    const total = existing.avg * existing.count;
    // Approximation: we don't know the old rating, just add and trust server to fix on next fetch
    existing.avg = existing.count > 0 ? (total + rating) / (existing.count + 1) : rating;
  } else {
    // New review
    existing.count += 1;
    existing.avg = ((existing.avg * (existing.count - 1)) + rating) / existing.count;
    existing.items = existing.items || [];
  }

  if (!text || status === "live") {
    existing.items.unshift({ rating, text: text || "", timestamp: new Date().toISOString() });
  } else if (text && status === "pending") {
    // Text pending — only show rating in items
    existing.items.unshift({ rating, text: "", timestamp: new Date().toISOString() });
  }

  _reviewsMap.set(placeId, existing);
  // Persist
  try {
    const cacheObj = { ts: Date.now(), data: Object.fromEntries(_reviewsMap) };
    localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify(cacheObj));
  } catch { /* quota */ }
}

// ─── UI: Star Rating Component ───────────────────────────────────────────────

const STAR_SVG_FILLED = `<svg width="24" height="24" viewBox="0 0 24 24" fill="var(--gold)" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
const STAR_SVG_EMPTY = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--surface-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

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

  function render() {
    container.innerHTML = "";
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `rv-star-btn${i <= selected ? " active" : ""}`;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", i <= selected ? "true" : "false");
      btn.setAttribute("aria-label", `${i} star${i > 1 ? "s" : ""}`);
      btn.innerHTML = i <= selected ? STAR_SVG_FILLED : STAR_SVG_EMPTY;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        selected = i;
        render();
        onChange(i);
      });
      container.appendChild(btn);
    }
  }

  render();
  return container;
}

/**
 * Build a static star display (read-only).
 * @param {number} rating - average rating
 * @param {string} [size="14"] - SVG size
 * @returns {string} HTML string
 */
export function buildStarDisplay(rating, size = "14") {
  const full = Math.round(rating);
  let html = "";
  for (let i = 1; i <= 5; i++) {
    const filled = i <= full;
    html += `<svg class="rv-star-static" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? "var(--gold)" : "none"}" stroke="${filled ? "var(--gold)" : "var(--surface-3)"}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
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
  const overlay = document.getElementById("reviews-overlay");
  if (!overlay) return;

  const reviews = getPlaceReviews(placeId);
  const ratingData = getPlaceRating(placeId);

  overlay.innerHTML = _buildOverlayContent(placeId, placeName, ratingData, reviews);
  overlay.classList.remove("hide");

  // Attach event listeners
  overlay.querySelector(".rv-overlay-close").addEventListener("click", closeReviewsOverlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeReviewsOverlay();
  });

  const writeBtn = overlay.querySelector(".rv-write-btn");
  if (writeBtn) {
    writeBtn.addEventListener("click", () => _showReviewForm(placeId, overlay));
  }
}

export function closeReviewsOverlay() {
  const overlay = document.getElementById("reviews-overlay");
  if (overlay) {
    overlay.classList.add("hide");
    overlay.innerHTML = "";
  }
  _activeOverlayPlaceId = null;
}

function _buildOverlayContent(placeId, placeName, ratingData, reviews) {
  const avg = ratingData ? ratingData.avg.toFixed(1) : "–";
  const count = ratingData ? ratingData.count : 0;
  const distribution = _calcDistribution(reviews);

  const distBars = [5, 4, 3, 2, 1].map((stars) => {
    const pct = count > 0 ? ((distribution[stars] || 0) / count) * 100 : 0;
    return `<div class="rv-dist-row">
      <span class="rv-dist-label">${stars}</span>
      <div class="rv-dist-bar"><div class="rv-dist-fill" style="width:${pct}%"></div></div>
      <span class="rv-dist-count">${distribution[stars] || 0}</span>
    </div>`;
  }).join("");

  const summaryHtml = count > 0 ? `<div class="rv-summary">
        <div class="rv-avg-section">
          <span class="rv-avg-num">${avg}</span>
          <div class="rv-avg-stars">${buildStarDisplay(ratingData?.avg || 0, "18")}</div>
          <span class="rv-avg-count">${count} review${count !== 1 ? "s" : ""}</span>
        </div>
        <div class="rv-dist">${distBars}</div>
      </div>` : "";

  const reviewCards = reviews.length
    ? reviews.map((r) => _buildReviewCard(r)).join("")
    : `<p class="rv-empty">No reviews yet</p>`;

  return `<div class="rv-overlay-card">
    <div class="overlay-drag"><span></span></div>
    <div class="suggest-head">
      <h3>${esc(placeName)}</h3>
      <button class="rv-overlay-close sheet-x btn-roundel" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="rv-overlay-body">
      ${summaryHtml}
      <button class="rv-write-btn btn-primary" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Write a review</button>
      <div class="rv-list">${reviewCards}</div>
    </div>
  </div>`;
}

function _buildReviewCard(review) {
  const timeAgo = _relativeTime(review.timestamp);
  return `<div class="rv-review-card">
    <div class="rv-review-stars">${buildStarDisplay(review.rating, "12")}</div>
    ${review.text ? `<p class="rv-review-text">${esc(review.text)}</p>` : ""}
    <span class="rv-review-time">${esc(timeAgo)}</span>
  </div>`;
}

function _calcDistribution(reviews) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    if (r.rating >= 1 && r.rating <= 5) dist[r.rating]++;
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

function _showReviewForm(placeId, overlay) {
  const writeBtn = overlay.querySelector(".rv-write-btn");
  if (writeBtn) writeBtn.remove();

  const list = overlay.querySelector(".rv-list");
  const form = document.createElement("div");
  form.className = "rv-form";

  let selectedRating = 0;

  const starInput = _buildStarInput((rating) => {
    selectedRating = rating;
    submitBtn.disabled = rating === 0;
  });

  const textArea = document.createElement("textarea");
  textArea.className = "rv-text-input";
  textArea.placeholder = "Share your experience (optional, min 20 chars)";
  textArea.maxLength = MAX_TEXT_LEN;
  textArea.rows = 3;

  const charCounter = document.createElement("span");
  charCounter.className = "rv-char-count";
  charCounter.textContent = `0/${MAX_TEXT_LEN}`;

  textArea.addEventListener("input", () => {
    charCounter.textContent = `${textArea.value.length}/${MAX_TEXT_LEN}`;
  });

  const submitBtn = document.createElement("button");
  submitBtn.className = "rv-submit-btn btn-primary";
  submitBtn.type = "button";
  submitBtn.textContent = "Submit review";
  submitBtn.disabled = true;

  const note = document.createElement("p");
  note.className = "rv-form-note";
  note.textContent = "Ratings appear instantly. Text reviews are moderated.";

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
        showToast("Rating updated", "check");
      } else if (result.status === "pending") {
        showToast("Review submitted", "check", "Text will appear after moderation");
      } else {
        showToast("Rating submitted", "check");
      }
      // Refresh overlay
      closeReviewsOverlay();
    } else {
      const msgs = {
        already_reviewed: "You've already reviewed this place",
        rate_limited: "Too many reviews today. Try again tomorrow.",
        invalid_place: "Place not found",
        invalid_rating: "Invalid rating",
        text_too_short: `Minimum ${MIN_TEXT_LEN} characters for text`,
        network_error: "Network error. Try again.",
      };
      showToast(msgs[result.error] || "Submission failed", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit review";
    }
  });

  form.appendChild(starInput);
  form.appendChild(textArea);
  form.appendChild(charCounter);
  form.appendChild(submitBtn);
  form.appendChild(note);

  list.insertAdjacentElement("beforebegin", form);
}

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize the reviews module. Call after map load.
 */
export function initReviews() {
  loadReviews();
}
