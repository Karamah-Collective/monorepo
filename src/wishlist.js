/**
 * Wishlist — community feature request board.
 *
 * Users browse, upvote, and submit wishes. Data stored in Google Sheets
 * via Apps Script, proxied through /api/wishes. One vote per device
 * per wish (localStorage + server-side dedup).
 */
import { RECAPTCHA_SITE_KEY } from "./config.js";
import { esc, showToast, loadRecaptcha } from "./utils.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY_VOTED = "hf_wish_votes";
const STORAGE_KEY_DEVICE = "hf_device_id";
const SUBMIT_COOLDOWN = 60_000;
const FETCH_CACHE_MS = 120_000;

// ─── State ────────────────────────────────────────────────────────────────────
let _wishes = [];
let _lastFetch = 0;
let _lastSubmit = 0;
let _expanded = new Set();

// ─── DOM refs (set in init) ───────────────────────────────────────────────────
let _overlay, _formOverlay, _list, _addBtn, _formEl;

// ─── Device ID (stable per browser profile) ──────────────────────────────────
function _getDeviceId() {
  let id = localStorage.getItem(STORAGE_KEY_DEVICE);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(STORAGE_KEY_DEVICE, id);
  }
  return id;
}

// ─── Voted set (fast client-side check) ──────────────────────────────────────
function _getVoted() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_VOTED) || "[]")); }
  catch { return new Set(); }
}
function _saveVoted(set) {
  localStorage.setItem(STORAGE_KEY_VOTED, JSON.stringify([...set]));
}

// ─── Init ─────────────────────────────────────────────────────────────────────
/**
 * Wire up the wishlist overlay. Called once after lazy-load.
 */
export function initWishlist() {
  _overlay     = document.getElementById("wish-overlay");
  _formOverlay = document.getElementById("wish-form-overlay");
  _list        = document.getElementById("wish-list");
  _addBtn      = document.getElementById("wish-add-btn");
  _formEl      = document.getElementById("wish-form");

  // Open overlay
  document.getElementById("wish-pill").addEventListener("click", _open);

  // Close overlay (X buttons + backdrop tap)
  document.getElementById("wish-close").addEventListener("click", _close);
  document.getElementById("wish-form-close").addEventListener("click", _closeForm);
  _overlay.addEventListener("click", (e) => { if (e.target === _overlay) _close(); });
  _formOverlay.addEventListener("click", (e) => { if (e.target === _formOverlay) _closeForm(); });

  // Add button → show form
  _addBtn.addEventListener("click", _showForm);

  // Form submission
  _formEl.addEventListener("submit", _handleSubmit);

  // Clear validation on input
  _formEl.querySelectorAll("[required]").forEach((el) => {
    el.addEventListener("input", () => el.classList.remove("invalid"));
  });
}

// ─── Open / Close ─────────────────────────────────────────────────────────────
function _open() {
  _overlay.classList.remove("hide");
  _fetchWishes();
}

function _close() {
  _overlay.classList.add("hide");
}

function _showForm() {
  _formOverlay.classList.remove("hide");
  _formEl.reset();
}

function _closeForm() {
  _formOverlay.classList.add("hide");
}

// ─── Fetch wishes ─────────────────────────────────────────────────────────────
async function _fetchWishes() {
  if (Date.now() - _lastFetch < FETCH_CACHE_MS && _wishes.length) {
    _render();
    return;
  }
  _list.innerHTML = `<div class="wish-loading">Loading wishes…</div>`;
  try {
    const res = await fetch("/api/wishes");
    if (!res.ok) throw new Error();
    const data = await res.json();
    _wishes = Array.isArray(data) ? data : (data.wishes || []);
    _wishes.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    _lastFetch = Date.now();
  } catch {
    _list.innerHTML = `<div class="wish-empty">Could not load wishes</div>`;
    return;
  }
  _render();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function _render() {
  const voted = _getVoted();

  if (!_wishes.length) {
    _list.innerHTML = `<div class="wish-empty">No wishes yet — be the first!</div>`;
    return;
  }

  _list.innerHTML = _wishes.map((w) => {
    const isVoted = voted.has(w.id);
    const isOpen = _expanded.has(w.id);
    const desc = w.description || "";
    const shortDesc = desc.length > 100 ? desc.slice(0, 100) + "…" : desc;
    const hasMore = desc.length > 100;

    return `<div class="wish-card" data-id="${esc(w.id)}">
      <div class="wish-card-body">
        <h4 class="wish-title">${esc(w.title)}</h4>
        <p class="wish-desc ${isOpen ? "wish-desc--open" : ""}">${esc(isOpen ? desc : shortDesc)}</p>
        ${hasMore ? `<button class="wish-expand" data-id="${esc(w.id)}">${isOpen ? "Show less" : "Read more"}</button>` : ""}
      </div>
      <button class="wish-vote ${isVoted ? "wish-vote--voted" : ""}" data-id="${esc(w.id)}" ${isVoted ? "disabled" : ""} aria-label="Upvote">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isVoted ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7"/>
        </svg>
        <span class="wish-vote-count">${w.votes || 0}</span>
      </button>
    </div>`;
  }).join("");

  // Attach listeners
  _list.querySelectorAll(".wish-vote:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => _handleVote(btn.dataset.id));
  });
  _list.querySelectorAll(".wish-expand").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (_expanded.has(id)) _expanded.delete(id);
      else _expanded.add(id);
      _render();
    });
  });
}

// ─── Vote ─────────────────────────────────────────────────────────────────────
async function _handleVote(wishId) {
  const voted = _getVoted();
  if (voted.has(wishId)) return;

  // Optimistic UI
  const wish = _wishes.find((w) => w.id === wishId);
  if (wish) wish.votes = (wish.votes || 0) + 1;
  voted.add(wishId);
  _saveVoted(voted);
  _render();

  try {
    await loadRecaptcha(RECAPTCHA_SITE_KEY);
    const token = await new Promise((resolve) =>
      grecaptcha.ready(() =>
        grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "wish_vote" }).then(resolve)
      )
    );

    const res = await fetch("/api/wishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "vote", token, wishId, deviceId: _getDeviceId() }),
    });

    const data = await res.json();
    if (!data.success) {
      // Revert optimistic update
      if (wish) wish.votes = Math.max(0, (wish.votes || 1) - 1);
      voted.delete(wishId);
      _saveVoted(voted);
      _render();
      if (data.error === "Already voted") {
        // Server knows we voted; keep it in local set
        voted.add(wishId);
        _saveVoted(voted);
        _render();
      }
    }
  } catch {
    // Network error — revert
    if (wish) wish.votes = Math.max(0, (wish.votes || 1) - 1);
    voted.delete(wishId);
    _saveVoted(voted);
    _render();
    showToast("Vote failed", "error", "Check your connection");
  }
}

// ─── Submit wish ──────────────────────────────────────────────────────────────
async function _handleSubmit(e) {
  e.preventDefault();

  if (Date.now() - _lastSubmit < SUBMIT_COOLDOWN) {
    showToast("Please wait", "error", "Try again in a minute");
    return;
  }

  let hasEmpty = false;
  _formEl.querySelectorAll("[required]").forEach((el) => {
    if (!el.value.trim()) { el.classList.add("invalid"); hasEmpty = true; }
    else el.classList.remove("invalid");
  });
  if (hasEmpty) return;

  const title = document.getElementById("wish-title").value.trim();
  const description = document.getElementById("wish-desc").value.trim();

  const submitBtn = document.getElementById("wish-submit");
  const origHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Submitting…</span>';

  try {
    await loadRecaptcha(RECAPTCHA_SITE_KEY);
    const token = await new Promise((resolve) =>
      grecaptcha.ready(() =>
        grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "wish_add" }).then(resolve)
      )
    );

    const res = await fetch("/api/wishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", token, title, description }),
    });

    const data = await res.json();
    if (data.success) {
      _lastSubmit = Date.now();
      _formEl.reset();
      _lastFetch = 0; // force refresh
      _closeForm();
      _fetchWishes();
      showToast("Wish submitted!", "check", "Thanks for your input");
    } else {
      showToast("Submission failed", "error", data.error || "Try again");
    }
  } catch {
    showToast("Submission failed", "error", "Check your connection");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = origHtml;
  }
}
