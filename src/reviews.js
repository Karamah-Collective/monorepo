/**
 * Reviews — in-app community rating & review system.
 *
 * Users verify via email OTP, then rate places (1–5 stars) with optional text.
 * Verified reviews go live immediately. Verification token persists 7 days.
 *
 * Data stored in Google Sheets "Reviews" worksheet, proxied via /api/reviews.
 */
import { RECAPTCHA_SITE_KEY } from "./config.js";
import { esc, escA, showToast, loadRecaptcha } from "./utils.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY_REVIEWS = "hf_reviews_v1";
const STORAGE_KEY_VERIFY_TOKEN = "hf_verify_token";
const CACHE_TTL_MS = 300_000; // 5 min local cache
const MAX_TEXT_LEN = 500;
const MIN_TEXT_LEN = 20;
const OTP_RESEND_COOLDOWN_MS = 30_000;

// ─── State ────────────────────────────────────────────────────────────────────
/** @type {Map<string, {avg: number, count: number, items: Array}>} */
let _reviewsMap = new Map();
let _lastFetch = 0;
let _activeOverlayPlaceId = null;

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
  const urls = ["/api/reviews"];

  try {
    const cfg = await import("./config.local.js");
    if (cfg.SHEETS_URL) urls.push(`${cfg.SHEETS_URL}?action=reviews`);
  } catch {
    // config.local.js absent in production — expected
  }

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      if (json.reviews) {
        _hydrateMap(json.reviews);
        _lastFetch = Date.now();
        try {
          localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify({ ts: _lastFetch, data: json.reviews }));
        } catch { /* quota */ }
        window.dispatchEvent(new Event("hf:reviews-loaded"));
        return;
      }
    } catch {
      continue;
    }
  }
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

const STAR_SVG_FILLED = `<svg width="28" height="28" viewBox="0 0 24 24" fill="var(--gold)" stroke="var(--gold)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
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
        <div class="rv-avg-block">
          <span class="rv-avg-num">${avg}</span>
          <div class="rv-avg-stars">${buildStarDisplay(ratingData?.avg || 0, "13")}</div>
          <span class="rv-avg-count">${count}</span>
        </div>
        <div class="rv-dist">${distBars}</div>
      </div>` : "";

  const reviewCards = reviews.length
    ? `<div class="rv-list"><span class="rv-list-header">${count} Review${count !== 1 ? "s" : ""}</span>${reviews.map((r) => _buildReviewCard(r)).join("")}</div>`
    : `<div class="rv-list"><div class="rv-empty"><span class="rv-empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></span><p class="rv-empty-text">No reviews yet — be the first!</p></div></div>`;

  return `<div class="rv-overlay-card">
    <div class="rv-header">
      <h3 class="rv-header-title">${esc(placeName)}</h3>
      <button class="rv-close-btn rv-overlay-close" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="rv-overlay-body">
      ${summaryHtml}
      <button class="rv-write-btn btn-primary" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Write a review</button>
      ${reviewCards}
    </div>
  </div>`;
}

function _buildReviewCard(review) {
  const timeAgo = _relativeTime(review.timestamp);
  return `<div class="rv-review-card">
    <span class="rv-review-avatar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
    <div class="rv-review-body">
      <div class="rv-review-meta">
        <span class="rv-review-stars">${buildStarDisplay(review.rating, "12")}</span>
        <span class="rv-review-time">${esc(timeAgo)}</span>
      </div>
      ${review.text ? `<p class="rv-review-text">${esc(review.text)}</p>` : ""}
    </div>
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

/**
 * Show the review form — with email verification gate if not verified.
 * @param {string} placeId
 * @param {HTMLElement} overlay
 */
function _showReviewForm(placeId, overlay) {
  const writeBtn = overlay.querySelector(".rv-write-btn");
  if (writeBtn) writeBtn.remove();

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
      emailStep.classList.add("hide");
      otpStep.classList.remove("hide");
      // Update the hint with the actual email
      const hint = otpStep.querySelector(".rv-otp-email-hint");
      if (hint) hint.textContent = `Code sent to ${_email}`;
      otpDigits[0].focus();
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
      container.remove();
      _showRatingForm(placeId, overlay, insertBefore);
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
        otpStep.classList.add("hide");
        emailStep.classList.remove("hide");
        otpDigits.forEach((d) => { d.value = ""; });
        sendBtn.disabled = false;
        sendBtn.textContent = "Send verification code";
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

  insertBefore.insertAdjacentElement("beforebegin", container);
  emailInput.focus();
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
      }
      showToast(msgs[result.error] || "Submission failed", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit review";
    }
  });

  form.appendChild(submitBtn);
  form.appendChild(note);

  insertBefore.insertAdjacentElement("beforebegin", form);
}

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize the reviews module. Call after map load.
 */
export function initReviews() {
  loadReviews();
}
