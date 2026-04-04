/**
 * Wishlist — community feature request board.
 *
 * Users browse, vote on, and submit wishes. Data stored in Google Sheets
 * via Apps Script, proxied through /api/wishes. Votes can be toggled
 * per device per wish (localStorage + server-side state).
 */
import { RECAPTCHA_SITE_KEY } from "./config.js";
import { animateSheetHeight, esc, showToast, loadRecaptcha } from "./utils.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY_VOTED = "hf_wish_votes";
const STORAGE_KEY_DEVICE = "hf_device_id";
const SUBMIT_COOLDOWN = 60_000;
const FETCH_CACHE_MS = 120_000;
const OVERFLOW_EPSILON_PX = 1;

// ─── State ────────────────────────────────────────────────────────────────────
let _wishes = [];
let _lastFetch = 0;
let _lastSubmit = 0;
let _expanded = new Set();

// ─── DOM refs (set in init) ───────────────────────────────────────────────────
let _overlay, _formOverlay, _card, _list, _addBtn, _formEl;

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

function _setVoteState(wishId, isVoted, exactVotes) {
  const voted = _getVoted();
  const wish = _wishes.find((entry) => entry.id === wishId);
  const wasVoted = voted.has(wishId);

  if (isVoted) voted.add(wishId);
  else voted.delete(wishId);
  _saveVoted(voted);

  if (!wish) return;

  if (typeof exactVotes === "number") {
    wish.votes = Math.max(0, exactVotes);
    return;
  }

  if (wasVoted === isVoted) return;
  wish.votes = Math.max(0, (wish.votes || 0) + (isVoted ? 1 : -1));
}

// ─── Init ─────────────────────────────────────────────────────────────────────
/**
 * Wire up the wishlist overlay. Called once after lazy-load.
 */
export function initWishlist() {
  _overlay     = document.getElementById("wish-overlay");
  _formOverlay = document.getElementById("wish-form-overlay");
  _card        = document.getElementById("wish-card");
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

function _animateWishCard(changeFn) {
  if (!_card) {
    changeFn();
    return;
  }
  animateSheetHeight(_card, changeFn);
}

function _syncExpandableDescriptions() {
  _list.querySelectorAll(".wish-card").forEach((card) => {
    const wishId = card.dataset.id;
    const descEl = card.querySelector(".wish-desc");
    const toggleEl = card.querySelector(".wish-expand");

    if (!descEl || !toggleEl) return;

    descEl.classList.remove("wish-desc--open");
    const isOverflowing = (descEl.scrollHeight - descEl.clientHeight) > OVERFLOW_EPSILON_PX;

    if (!isOverflowing) {
      _expanded.delete(wishId);
      toggleEl.hidden = true;
      return;
    }

    const isOpen = _expanded.has(wishId);
    descEl.classList.toggle("wish-desc--open", isOpen);
    toggleEl.hidden = false;
    toggleEl.textContent = isOpen ? "Show less" : "Read more";
  });
}

// ─── Fetch wishes ─────────────────────────────────────────────────────────────
async function _fetchWishesApi() {
  const urls = ["/api/wishes"];

  try {
    const cfg = await import("./config.local.js");
    if (cfg.SHEETS_URL) urls.push(`${cfg.SHEETS_URL}?action=wishes`);
  } catch {
    // config.local.js absent in production — expected
  }

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const wishes = Array.isArray(data) ? data : (data.wishes || []);
      if (Array.isArray(wishes)) return wishes;
    } catch {
      continue;
    }
  }

  return null;
}

async function _fetchWishes() {
  if (Date.now() - _lastFetch < FETCH_CACHE_MS && _wishes.length) {
    _render();
    return;
  }
  _animateWishCard(() => {
    _list.innerHTML = `<div class="wish-loading">Loading wishes…</div>`;
  });
  try {
    const wishes = await _fetchWishesApi();
    if (!wishes) throw new Error();
    _wishes = wishes;
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
    _animateWishCard(() => {
      _list.innerHTML = `<div class="wish-empty">No wishes yet — be the first!</div>`;
    });
    return;
  }

  _animateWishCard(() => {
    _list.innerHTML = _wishes.map((w) => {
      const isVoted = voted.has(w.id);
      const isOpen = _expanded.has(w.id);
      const desc = w.description || "";

      return `<div class="wish-card" data-id="${esc(w.id)}">
        <div class="wish-card-body">
          <h4 class="wish-title">${esc(w.title)}</h4>
          ${desc ? `<p class="wish-desc ${isOpen ? "wish-desc--open" : ""}">${esc(desc)}</p>
          <button class="wish-expand" data-id="${esc(w.id)}" hidden>${isOpen ? "Show less" : "Read more"}</button>` : ""}
        </div>
        <button class="wish-vote ${isVoted ? "wish-vote--voted" : ""}" data-id="${esc(w.id)}" aria-label="${isVoted ? "Remove vote" : "Vote"}" aria-pressed="${isVoted ? "true" : "false"}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${isVoted ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 9V5a3 3 0 0 0-3-3l-1 4-4 4v11h11.28a2 2 0 0 0 1.98-1.74l1-7A2 2 0 0 0 18.28 10H14Z"/>
            <path d="M6 10H3v11h3"/>
          </svg>
          <span class="wish-vote-count">${w.votes || 0}</span>
        </button>
      </div>`;
    }).join("");

    _syncExpandableDescriptions();

    _list.querySelectorAll(".wish-vote").forEach((btn) => {
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
  });
}

// ─── Vote ─────────────────────────────────────────────────────────────────────
async function _handleVote(wishId) {
  const voted = _getVoted();
  const wasVoted = voted.has(wishId);
  const nextVoted = !wasVoted;

  // Optimistic UI
  _setVoteState(wishId, nextVoted);
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
      _setVoteState(wishId, wasVoted);
      _render();
      showToast(nextVoted ? "Vote failed" : "Could not remove vote", "error", data.error || "Try again");
      return;
    }

    _setVoteState(wishId, Boolean(data.voted), data.votes);
    _render();
  } catch {
    _setVoteState(wishId, wasVoted);
    _render();
    showToast(nextVoted ? "Vote failed" : "Could not remove vote", "error", "Check your connection");
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
