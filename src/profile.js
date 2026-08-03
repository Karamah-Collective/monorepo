/**
 * Profile pane content — the signed-in user's own account hub: identity
 * card, contribution stats, verified-reviewer badge, "member since", "Your
 * reviews" (moved here from src/menu.js's old in-menu Account panel),
 * "Your submitted places"/"Your submitted edits" (each with a status pill
 * and a submission-status notification toast on load), and the "Erase my
 * data"/"Export your data" actions — docs/ACCOUNTS_AND_REDESIGN_PLAN.md's
 * contribution-profile follow-on plan, Phases 4 and 7.
 *
 * This file owns only the Profile PANE's content and behavior, not any
 * sheet lifecycle — src/menu.js is the shell that owns the single merged
 * #menu-sheet (open/close, drag, the shared header/back-button), and calls
 * this file's loadProfileContent() every time it slides to the Profile
 * pane. Always entered that way — never any other origin — so the shared
 * header's close button permanently shows the back-arrow convention while
 * the Profile pane is active (see src/menu.js's _updateHeaderForPane(),
 * which mirrors src/places.js's _setPlaceSheetCloseAsBack()/
 * _resetPlaceSheetCloseButton() for #place-sheet).
 *
 * A handful of actions here need to close the WHOLE merged sheet (viewing a
 * place from a review row, or right after "Erase my data") — done by
 * dispatching EVT.ACCOUNT_SHEET_CLOSE rather than importing closeMenuSheet
 * from src/menu.js directly, to avoid a circular import (menu.js already
 * statically imports loadProfileContent from this file).
 *
 * auth.js is dynamically imported (own _getAuthModule() helper, matching
 * every other file that touches it — reviews.js/account-sync.js/places.js/
 * account-profile.js all have their own separate instance of this exact
 * helper, by established convention) so its heavy Firebase CDN modules stay
 * lazy. reviews.js and places.js are imported statically here instead —
 * both are already eagerly loaded via places.js's own top-level import graph
 * (places.js already statically imports several things from reviews.js), so
 * a dynamic import of either here would just resolve to the same
 * already-cached module namespace with no lazy-load benefit, only the added
 * complexity of an await.
 */
import { esc, escA, showToast, showConfirmDialog } from "./utils.js";
import { EVT } from "./events.js";
import {
  placesData,
  openPlaceSheet,
  fetchMySubmittedPlaces,
  fetchMySubmittedEdits,
  diffSubmissionStatuses,
  getSubmissionStatusCache,
  updateSubmissionStatusCache,
} from "./places.js";
import { fetchMyReviews, buildStarDisplay, deleteReview, openReviewsOverlayForEdit } from "./reviews.js";
import { computeContributionStats, isVerifiedContributor, formatMemberSince } from "./account-profile.js";

const ACCOUNT_API = "/api/account";

// Icons reused as showConfirmDialog()'s icon-circle content — same shapes
// already used on their own triggering buttons, just larger, so the dialog
// visually matches its trigger (mirrors src/menu.js's own TRASH_ICON_SVG/
// SIGNOUT_ICON_SVG convention, which this replaces the review-delete/
// sign-out copies of, now that both actions live here instead).
const TRASH_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>`;
const SIGNOUT_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

// The merged sheet's own id — only ever read here to guard against
// rendering into a stale/gone context (see loadProfileContent() below), not
// to drive its open/close, which src/menu.js exclusively owns.
const menuSheetEl = document.getElementById("menu-sheet");
const cardBody = document.getElementById("profile-card-body");
const statsGrid = document.getElementById("profile-stats-grid");
const submittedPlacesEl = document.getElementById("profile-submitted-places");
const submittedEditsEl = document.getElementById("profile-submitted-edits");
const myReviewsEl = document.getElementById("profile-my-reviews");
const exportBtn = document.getElementById("profile-export-btn");
const eraseBtn = document.getElementById("profile-erase-btn");

let _auth = null; // lazily-loaded src/auth.js module namespace
let _account = null;

// Populated by loadProfileContent() and reused by the Export action so it
// doesn't need to re-fetch everything a second time — the page's own render
// pass and the export are always working from the same already-fetched
// snapshot.
let _reviewsCache = [];
let _submittedPlacesCache = [];
let _submittedEditsCache = [];
let _accountMetaCache = { saved: [], firstSeenAt: null };
let _verifiedCache = false;

let _authModulePromise = null;
function _getAuthModule() {
  if (!_authModulePromise) _authModulePromise = import("./auth.js");
  return _authModulePromise;
}

/**
 * Close the whole merged Menu/Profile sheet — used when an action here
 * navigates the user away from the account hub entirely (viewing a place,
 * or right after erasing data), not just switching back to the Menu pane.
 * @returns {void}
 */
function _closeAccountSheet() {
  window.dispatchEvent(new CustomEvent(EVT.ACCOUNT_SHEET_CLOSE, { detail: {} }));
}

/**
 * Wire up the Profile pane's always-signed-in-only content. Call once,
 * after map load (same lazy-load-after-map-load convention as
 * initWishlist()/initEidPrayers() — see src/app.js).
 * @returns {Promise<void>}
 */
export async function initProfile() {
  _auth = await _getAuthModule();
  _account = _auth.getCachedAccount();

  window.addEventListener(EVT.AUTH_CHANGED, (e) => {
    _account = e.detail?.account || null;
    // No further action needed here on sign-out — src/menu.js's own
    // EVT.AUTH_CHANGED listener closes the merged sheet if the Profile pane
    // is the one on screen at the time, since it's the module that owns the
    // sheet's lifecycle.
  });

  exportBtn?.addEventListener("click", _handleExport);
  eraseBtn?.addEventListener("click", _handleErase);
}

// ─── Content loading ─────────────────────────────────────────────────────────

/**
 * (Re)load the Profile pane's content. Called every time the Profile pane
 * becomes active (src/menu.js's _goToProfilePane()), not just on first
 * visit, so a submission that flipped from pending to live/rejected since
 * the last visit is caught and its notification toast shown (see
 * _handleSubmissionNotifications() below).
 * @returns {Promise<void>}
 */
export async function loadProfileContent() {
  if (!_account) return; // shouldn't happen — Profile is only ever reachable while signed in
  _renderCard();

  const [reviewsResult, placesResult, editsResult, meta, verified] = await Promise.all([
    fetchMyReviews(),
    fetchMySubmittedPlaces(),
    fetchMySubmittedEdits(),
    _fetchAccountMeta(),
    isVerifiedContributor(),
  ]);
  // The merged sheet may have been closed (or the account signed out) while
  // these were in flight — bail rather than render into a stale/gone sheet
  // or hand a signed-out account's data to a subsequent viewer.
  if (!_account || menuSheetEl.classList.contains("shut")) return;

  _reviewsCache = reviewsResult.reviews;
  _submittedPlacesCache = placesResult.submissions;
  _submittedEditsCache = editsResult.submissions;
  _accountMetaCache = meta;
  _verifiedCache = verified;

  _renderCard(); // re-render with "member since"/verified badge now resolved
  _renderStats();
  _renderSubmissionList(submittedPlacesEl, _submittedPlacesCache, "You haven't submitted any places yet.");
  _renderSubmissionList(submittedEditsEl, _submittedEditsCache, "You haven't submitted any edits yet.");
  _renderMyReviews();

  // Diff-then-toast-then-persist, in that order, exactly as places.js's own
  // diffSubmissionStatuses()/updateSubmissionStatusCache() doc comments
  // specify — never persist before the toasts have actually been shown, so
  // a rendering failure above can't silently swallow a detected transition.
  _handleSubmissionNotifications("new", _submittedPlacesCache);
  _handleSubmissionNotifications("edit", _submittedEditsCache);
}

/**
 * Fetch this account's AccountMeta (currently just `saved`/`firstSeenAt`)
 * directly via /api/account's existing "sync-saved" action — the same
 * request src/account-sync.js's own _handleSignIn() makes, but read
 * independently here since account-sync.js exposes no getter for its
 * result (by design — it only keeps an in-memory cloud-mode mirror via
 * places.js/utils.js, not the raw server rows or firstSeenAt).
 * @returns {Promise<{saved: Array, firstSeenAt: string|null}>}
 */
async function _fetchAccountMeta() {
  const idToken = await _auth.getIdToken();
  if (!idToken) return { saved: [], firstSeenAt: null };
  try {
    const res = await fetch(ACCOUNT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync-saved", idToken }),
    });
    const result = await res.json();
    return {
      saved: Array.isArray(result.saved) ? result.saved : [],
      firstSeenAt: result.firstSeenAt || null,
    };
  } catch {
    return { saved: [], firstSeenAt: null };
  }
}

// ─── Identity card (avatar, name, email, verified badge, member since, sign out) ──

function _renderCard() {
  if (!_account) return;
  const label = _account.displayName || _account.email || "Signed in";
  const initial = (_account.displayName || _account.email || "?").trim().charAt(0).toUpperCase();
  // Google supplies photoURL automatically; Microsoft sign-in never does
  // (see the note on _cacheAccount() in src/auth.js) — falls back to the
  // initial-letter avatar for Microsoft and magic-link accounts alike.
  const avatarHTML = _account.photoURL
    ? `<img class="menu-account-avatar pf-card-avatar" src="${escA(_account.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="menu-account-avatar pf-card-avatar">${esc(initial)}</div>`;
  const memberSince = formatMemberSince(_accountMetaCache.firstSeenAt);
  // Profile is only ever reachable while _account is truthy, which is
  // itself defined identically to isVerifiedContributor() ("signed in via
  // Firebase at all") — so this is always true in practice here, but goes
  // through the shared helper anyway rather than re-deriving the rule
  // locally, per its own doc comment's stated purpose (one place, reused
  // consistently by every UI surface that shows this badge).
  const verifiedBadge = _verifiedCache
    ? `<span class="sponsor-badge verified-badge">Verified</span>`
    : "";

  cardBody.innerHTML = `<div class="menu-account-profile">
    ${avatarHTML}
    <div class="menu-account-info">
      <span class="menu-account-name">${esc(label)} ${verifiedBadge}</span>
      ${_account.displayName && _account.email ? `<span class="menu-account-email">${esc(_account.email)}</span>` : ""}
      ${memberSince ? `<span class="pf-member-since">Member since ${esc(memberSince)}</span>` : ""}
    </div>
    <button id="profile-signout" class="btn-roundel" type="button" aria-label="Sign out" title="Sign out">
      ${SIGNOUT_ICON_SVG}
    </button>
  </div>`;

  document.getElementById("profile-signout").addEventListener("click", _handleSignOut);
}

async function _handleSignOut() {
  const confirmed = await showConfirmDialog({
    title: "Sign out?",
    message: "You'll need to sign back in for reviews and sync.",
    confirmLabel: "Sign out",
    cancelLabel: "Cancel",
    variant: "default",
    icon: SIGNOUT_ICON_SVG,
  });
  if (!confirmed) return;
  const result = await _auth.signOut();
  if (result.success) {
    showToast("Signed out", "check");
  } else {
    showToast("Couldn't sign out", "error", "Please try again");
  }
}

// ─── Contribution stats ──────────────────────────────────────────────────────

const STAT_DEFS = [
  { key: "reviewCount", label: "Reviews" },
  { key: "favoriteCount", label: "Favourites" },
  { key: "pinCount", label: "Saved pins" },
  { key: "placesAddedCount", label: "Places added" },
  { key: "editsCount", label: "Edits made" },
];

function _renderStats() {
  const stats = computeContributionStats({
    reviews: _reviewsCache,
    savedPlaces: _accountMetaCache.saved,
    submittedPlaces: _submittedPlacesCache,
    submittedEdits: _submittedEditsCache,
  });
  statsGrid.innerHTML = STAT_DEFS.map(
    (d) => `<div class="pf-stat-card">
      <span class="pf-stat-num">${esc(String(stats[d.key] ?? 0))}</span>
      <span class="pf-stat-label">${esc(d.label)}</span>
    </div>`,
  ).join("");
}

// ─── Submitted places / edits (status pill + reject-reason surfacing) ───────

const STATUS_LABELS = { pending: "Pending", live: "Live", rejected: "Rejected" };

function _buildSubmissionRow(item) {
  const status = item.status === "live" || item.status === "rejected" ? item.status : "pending";
  const name = item.name || "Untitled";
  const hasReason = status === "rejected" && item.rejectReason;
  // Native title= tooltip for desktop hover; the <p> below covers mobile,
  // where hover tooltips aren't discoverable at all.
  const titleAttr = hasReason ? ` title="${escA(item.rejectReason)}"` : "";
  const reasonHtml = hasReason ? `<p class="pf-submission-reason">${esc(item.rejectReason)}</p>` : "";
  return `<div class="pf-submission-item">
    <div class="pf-submission-row">
      <span class="pf-submission-name">${esc(name)}</span>
      <span class="status-pill status-pill--${status}"${titleAttr}>${STATUS_LABELS[status]}</span>
    </div>
    ${reasonHtml}
  </div>`;
}

function _renderSubmissionList(container, list, emptyText) {
  if (!container) return;
  if (!list.length) {
    container.innerHTML = `<p class="menu-placeholder">${esc(emptyText)}</p>`;
    return;
  }
  container.innerHTML = list.map((item) => _buildSubmissionRow(item)).join("");
}

/**
 * Diff a freshly-fetched submissions list against its last-seen-status
 * cache and show one toast per detected pending→(live|rejected) transition,
 * then persist the new snapshot. Diff → toast → persist, never the reverse
 * (see places.js's diffSubmissionStatuses()/updateSubmissionStatusCache()
 * doc comments for why).
 * @param {"new"|"edit"} kind
 * @param {Array<{id: string, name?: string, status: string}>} currentList
 * @returns {void}
 */
function _handleSubmissionNotifications(kind, currentList) {
  const previous = getSubmissionStatusCache(kind);
  const changes = diffSubmissionStatuses(previous, currentList);
  const noun = kind === "new" ? "place" : "edit";
  for (const change of changes) {
    const name = change.name || `your submitted ${noun}`;
    if (change.newStatus === "live") {
      showToast(`Your submission for ${name} was approved!`, "check");
    } else if (change.newStatus === "rejected") {
      showToast(`Your submission for ${name} wasn't accepted`, "error");
    }
  }
  updateSubmissionStatusCache(kind, currentList);
}

// ─── Your reviews (moved from src/menu.js's old in-menu Account panel) ──────

function _renderMyReviews() {
  if (!myReviewsEl) return;
  if (!_reviewsCache.length) {
    myReviewsEl.innerHTML = `<p class="menu-placeholder">You haven't written any reviews yet.</p>`;
    return;
  }
  myReviewsEl.innerHTML = _reviewsCache.map((r) => _buildMyReviewRow(r)).join("");
  _wireMyReviewRows(myReviewsEl, _reviewsCache);
}

function _buildMyReviewRow(r) {
  const rating = Number(r.rating) || 0;
  return `<div class="rv-review-card acc-review-row" data-place-id="${esc(r.placeId)}">
    <div class="rv-review-body">
      <div class="rv-review-meta">
        <span class="rv-review-stars">${buildStarDisplay(rating, "12")}</span>
        <span class="rv-review-score">${rating.toFixed(1)}</span>
        <span class="rv-review-time">${esc(_timeAgo(r.timestamp))}</span>
      </div>
      <button class="acc-review-place-name" type="button" data-place-id="${esc(r.placeId)}">${esc(r.placeName || "Unknown place")}</button>
      ${r.text ? `<p class="rv-review-text">${esc(r.text)}</p>` : ""}
    </div>
    <div class="acc-review-actions">
      <button class="btn-roundel acc-review-edit" type="button" data-place-id="${esc(r.placeId)}" aria-label="Edit review" title="Edit review">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn-roundel-danger acc-review-delete" type="button" data-place-id="${esc(r.placeId)}" aria-label="Delete review" title="Delete review">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
      </button>
    </div>
  </div>`;
}

function _wireMyReviewRows(list, reviews) {
  const byPlaceId = new Map(reviews.map((r) => [r.placeId, r]));

  list.querySelectorAll(".acc-review-place-name").forEach((btn) => {
    btn.addEventListener("click", () => {
      const place = placesData.find((p) => p.id === btn.dataset.placeId);
      if (!place) return;
      _closeAccountSheet();
      openPlaceSheet(place);
    });
  });

  list.querySelectorAll(".acc-review-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = byPlaceId.get(btn.dataset.placeId);
      if (!r) return;
      const place = placesData.find((p) => p.id === r.placeId);
      _closeAccountSheet();
      openReviewsOverlayForEdit(r.placeId, place?.name || r.placeName, { rating: r.rating, text: r.text });
    });
  });

  list.querySelectorAll(".acc-review-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = byPlaceId.get(btn.dataset.placeId);
      const place = r && placesData.find((p) => p.id === r.placeId);
      _confirmAndDeleteReview(btn, place?.name || r?.placeName || "");
    });
  });
}

/**
 * Real Yes/No confirmation before deleting a review (see
 * docs/DESIGN_SYSTEM.md). Uses the shared showConfirmDialog() component
 * (src/utils.js), the same one used for sign-out and "Erase my data".
 * @param {HTMLButtonElement} btn
 * @param {string} placeName
 * @returns {Promise<void>}
 */
async function _confirmAndDeleteReview(btn, placeName) {
  const confirmed = await showConfirmDialog({
    title: placeName ? `Delete your review for ${placeName}?` : "Delete this review?",
    message: "This can't be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    variant: "danger",
    icon: TRASH_ICON_SVG,
  });
  if (!confirmed) return;
  await _performDelete(btn);
}

/**
 * Optimistic delete: the row disappears the instant the user confirms,
 * before the server has actually acknowledged it — if the request fails,
 * the row is restored to its exact original position and a failure toast
 * explains why.
 * @param {HTMLButtonElement} btn
 * @returns {Promise<void>}
 */
async function _performDelete(btn) {
  const placeId = btn.dataset.placeId;
  const row = btn.closest(".acc-review-row");
  const nextSibling = row?.nextElementSibling || null;

  row?.remove();
  let emptyPlaceholder = null;
  if (myReviewsEl && !myReviewsEl.querySelector(".acc-review-row")) {
    emptyPlaceholder = document.createElement("p");
    emptyPlaceholder.className = "menu-placeholder";
    emptyPlaceholder.textContent = "You haven't written any reviews yet.";
    myReviewsEl.appendChild(emptyPlaceholder);
  }

  const result = await deleteReview(placeId);
  if (!result.success) {
    emptyPlaceholder?.remove();
    if (row && myReviewsEl) myReviewsEl.insertBefore(row, nextSibling);
    showToast("Couldn't delete review", "error", "Please try again");
  } else {
    _reviewsCache = _reviewsCache.filter((r) => r.placeId !== placeId);
  }
}

/** Small local relative-time formatter — mirrors reviews.js's/menu.js's own private one. */
function _timeAgo(timestamp) {
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
  return `${Math.floor(days / 365)}y ago`;
}

// ─── Erase my data / Export your data ────────────────────────────────────────

/**
 * "Erase my data" — deletes every Sheets row matching this account's
 * emailHash (functions/api/account.js's "erase-data" action → Code.gs's
 * handleAccountErase()), then unconditionally signs out. Per this project's
 * explicit design decision (docs/PREFERENCE_LOG.md), sign-out never depends
 * on the erase call's success or failure, and a separate best-effort
 * deleteUser() attempt (auth.js) never gates anything either — this app has
 * no Admin SDK infra to force that server-side, and Firebase's deleteUser()
 * commonly fails with auth/requires-recent-login for a session that's been
 * open a while.
 * @returns {Promise<void>}
 */
async function _handleErase() {
  const confirmed = await showConfirmDialog({
    variant: "danger",
    title: "Erase your data?",
    message: "This permanently removes your reviews, saved places, and submissions, and signs you out. This can't be undone.",
    confirmLabel: "Erase",
    cancelLabel: "Cancel",
    icon: TRASH_ICON_SVG,
  });
  if (!confirmed) return;

  const idToken = await _auth.getIdToken();
  if (idToken) {
    try {
      await fetch(ACCOUNT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "erase-data", idToken }),
      });
    } catch {
      // Best-effort — sign-out below happens unconditionally regardless of
      // whether this actually reached the server.
    }
  }

  // Attempted BEFORE sign-out, while auth.currentUser still exists to act
  // on — silent/best-effort, never awaited for its own success/failure by
  // anything the user sees.
  try { await _auth.deleteCurrentUserBestEffort(); } catch { /* ignore */ }

  await _auth.signOut();
  _closeAccountSheet();
  showToast("Your data has been erased", "check");
}

/**
 * "Export your data" — bundles the already-fetched reviews/saved-places/
 * submitted-places/submitted-edits/account-meta for this session's Profile
 * render into one JSON file and triggers a browser download. Purely
 * client-side; no new backend endpoint.
 * @returns {void}
 */
function _handleExport() {
  const data = {
    exportedAt: new Date().toISOString(),
    account: _account ? { email: _account.email, displayName: _account.displayName } : null,
    memberSince: _accountMetaCache.firstSeenAt || null,
    reviews: _reviewsCache,
    savedPlaces: _accountMetaCache.saved,
    submittedPlaces: _submittedPlacesCache,
    submittedEdits: _submittedEditsCache,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `halal-finder-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Data exported", "check");
}
