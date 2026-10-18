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
  openSavedPlacesAtSection,
  fetchMySubmittedPlaces,
  fetchMySubmittedEdits,
  diffSubmissionStatuses,
  getSubmissionStatusCache,
  updateSubmissionStatusCache,
} from "./places.js";
import { fetchMyReviews, buildStarDisplay, deleteReview, openReviewsOverlayForEdit } from "./reviews.js";
import { computeContributionStats, formatMemberSince, computeTopBadge } from "./account-profile.js";
import { HSL_STYLE } from "./map-style.js";
import {
  aggregateTimelineDays,
  deleteVerifiedVisit,
  fetchVisitTimeline,
  getUniqueTimelinePlaces,
  groupTimelineByMonth,
  summarizeTimeline,
} from "./timeline.js";

const ACCOUNT_API = "/api/account";
const TIMELINE_DAYS_IN_WEEK = 7;
const TIMELINE_START_DATE = new Date(2026, 7, 1);
const TIMELINE_MAP_SINGLE_ZOOM = 12;
const TIMELINE_MAP_FIT_PADDING = 28;
const TIMELINE_MAP_RESIZE_DELAY_MS = 240;

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
const profileSheetEl = document.getElementById("profile-sheet");
const cardBody = document.getElementById("profile-card-body");
const statsGrid = document.getElementById("profile-stats-grid");
const submittedPlacesEl = document.getElementById("profile-submitted-places");
const submittedEditsEl = document.getElementById("profile-submitted-edits");
const myReviewsEl = document.getElementById("profile-my-reviews");
const exportBtn = document.getElementById("profile-export-btn");
const eraseBtn = document.getElementById("profile-erase-btn");
const timelinePreviewEl = document.getElementById("profile-timeline-preview");
const timelinePreviewTitleEl = document.getElementById("profile-timeline-preview-title");
const timelinePreviewSummaryEl = document.getElementById("profile-timeline-preview-summary");
const timelineOpenBtn = document.getElementById("profile-timeline-open");
const timelineOverlayEl = document.getElementById("timeline-overlay");
const timelineCardEl = document.getElementById("timeline-card");
const timelineCloseBtn = document.getElementById("timeline-close");
const timelineEl = document.getElementById("profile-timeline");
const timelineSummaryEl = document.getElementById("profile-timeline-summary");
const timelineCalendarEl = document.getElementById("profile-timeline-calendar");
const timelineCalendarSectionEl = timelineCalendarEl?.closest(".timeline-section");
const timelineMapWrapEl = document.getElementById("profile-timeline-map-wrap");
const timelineMapSectionEl = document.getElementById("timeline-map-section");
const timelineMapEl = document.getElementById("profile-timeline-map");
const timelineListEl = document.getElementById("profile-timeline-list");

let _auth = null; // lazily-loaded src/auth.js module namespace
let _account = null;

// Populated by loadProfileContent() and reused by the Export action so it
// doesn't need to re-fetch everything a second time — the page's own render
// pass and the export are always working from the same already-fetched
// snapshot.
let _reviewsCache = [];
let _submittedPlacesCache = [];
let _submittedEditsCache = [];
let _accountMetaCache = { saved: [], firstSeenAt: null, lifetimeReviewCount: 0, lifetimeVisitedCount: 0 };
let _timelineCache = [];
let _timelineGeneration = 0;
let _timelineLoaded = false;
let _timelineLoadFailed = false;
let _timelineOpenToken = 0;

function _afterTimelineOpened(callback) {
  if (!timelineCardEl) { callback(); return; }
  let settled = false;
  let timer = null;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    timelineCardEl?.removeEventListener("transitionend", onEnd);
    callback();
  };
  const onEnd = (event) => {
    if (event.target === timelineCardEl && event.propertyName === "transform") finish();
  };
  const duration = parseFloat(getComputedStyle(timelineCardEl).transitionDuration) * 1000 || 0;
  timelineCardEl.addEventListener("transitionend", onEnd);
  timer = setTimeout(finish, duration + 80);
}
let _timelineMap = null;
let _timelineMapMarkers = [];

function _revokeReviewImageUrls(reviews) {
  for (const review of reviews || []) {
    for (const image of review.images || []) {
      if (typeof image.src === "string" && image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
    }
  }
}

// Whether _accountMetaCache above holds a REAL server response yet, as opposed
// to the all-zeroes initial value. _renderCard() needs this to tell "this
// account has no activity" apart from "this account's activity hasn't arrived
// yet" — the two are indistinguishable from the cache's values alone, and
// treating the second as the first made every account's badge flair flash
// "Newcomer" on open before correcting itself to the real badge a moment
// later. Reset on sign-out/account switch so the next account never inherits
// the previous one's resolved state.
let _accountMetaLoaded = false;

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

function _closeTimelineOverlay() {
  if (!timelineOverlayEl) return;
  _timelineOpenToken += 1;
  timelineOverlayEl.classList.add("hide");
  timelineOverlayEl.setAttribute("aria-hidden", "true");
  _clearTimelineMap();
}

function _openTimelineOverlay() {
  if (!timelineOverlayEl || !_account) return;
  const openToken = ++_timelineOpenToken;
  timelineOverlayEl.classList.remove("hide");
  timelineOverlayEl.setAttribute("aria-hidden", "false");
  if (_timelineLoadFailed) _renderTimelineError();
  else if (_timelineLoaded) _renderTimelineResult({ success: true, visits: _timelineCache });
  else _renderTimelineLoading();
  requestAnimationFrame(() => _timelineMap?.resize());
  _afterTimelineOpened(() => {
    if (openToken === _timelineOpenToken && !timelineOverlayEl.classList.contains("hide")) _closeAccountSheet();
  });
  timelineCloseBtn?.focus();
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
    _revokeReviewImageUrls(_reviewsCache);
    _reviewsCache = [];
    _account = e.detail?.account || null;
    _timelineGeneration += 1;
    _timelineCache = [];
    _timelineLoaded = false;
    _timelineLoadFailed = false;
    _closeTimelineOverlay();
    // Whatever meta is cached belongs to the account that just went away —
    // never to whoever signs in next (see _accountMetaLoaded's declaration).
    _accountMetaLoaded = false;
    // No further action needed here on sign-out — src/menu.js's own
    // EVT.AUTH_CHANGED listener closes the merged sheet if the Profile pane
    // is the one on screen at the time, since it's the module that owns the
    // sheet's lifecycle.
  });

  // Keep the stats grid live while the Profile pane is already open, instead
  // of only ever refreshing on the next full loadProfileContent() re-run
  // (i.e. navigating away and back). SAVED_SYNCED now fires after every
  // individual favourite/pin background save-or-unsave resolves (not just on
  // sign-in/out merges — see events.js's doc comment and account-sync.js's
  // 2026-08-03 fix), so this also closes most of the "Saved pins" count
  // staying stale until a full page reload" gap: as long as the Profile pane
  // is still open by the time that background request resolves, the count
  // self-corrects right here rather than needing a reload to outlast it.
  // This does NOT fully eliminate the underlying race for someone who closes
  // Profile and immediately reopens it before the background request has
  // resolved — that reopen's loadProfileContent() fetches fresh regardless,
  // but a request still legitimately in flight can't be waited on from here
  // (see account-sync.js's own fire-and-forget design note).
  window.addEventListener(EVT.SAVED_SYNCED, () => _refreshStatsLive());
  window.addEventListener(EVT.TIMELINE_UPDATED, () => {
    const timelineOpen = timelineOverlayEl && !timelineOverlayEl.classList.contains("hide");
    if (!_account || !timelineEl || (profileSheetEl.classList.contains("shut") && !timelineOpen)) return;
    _loadTimelineOnly(_account.uid);
  });

  exportBtn?.addEventListener("click", _handleExport);
  eraseBtn?.addEventListener("click", _handleErase);
  timelineOpenBtn?.addEventListener("click", _openTimelineOverlay);
  timelineCloseBtn?.addEventListener("click", _closeTimelineOverlay);
  timelineOverlayEl?.addEventListener("click", (event) => {
    if (event.target === timelineOverlayEl) _closeTimelineOverlay();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && timelineOverlayEl && !timelineOverlayEl.classList.contains("hide")) _closeTimelineOverlay();
  });
}

/**
 * Re-fetch just the account-meta (saved favourites/pins/home) and re-render
 * the stats grid, without the rest of loadProfileContent()'s full
 * reviews/submissions refetch — called on EVT.SAVED_SYNCED so the grid stays
 * live while the Profile pane is already open. A no-op while signed out or
 * while the merged sheet is shut, mirroring loadProfileContent()'s own guard.
 * @returns {Promise<void>}
 */
async function _refreshStatsLive() {
  if (!_account || !profileSheetEl || profileSheetEl.classList.contains("shut")) return;
  const meta = await _fetchAccountMeta();
  // Signed out (or the sheet got closed) while that fetch was in flight —
  // bail rather than render a signed-out account's data or into a gone sheet.
  if (!_account || profileSheetEl.classList.contains("shut")) return;
  _accountMetaCache = meta;
  _accountMetaLoaded = true;
  _renderStats();
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
  const profileUid = _account.uid;
  const timelineGeneration = _timelineGeneration;
  _renderCard();
  _renderTimelineLoading();
  // On a session's first-ever Profile visit, this just swapped the identity
  // card from a short "Loading…" placeholder to the real (taller) card,
  // BEFORE the fetch below even starts — src/menu.js's pane-height sync
  // already ran once at pane-switch time using the shorter measurement, so
  // it needs telling now or the newly-taller card pushes everything below
  // it (down through "Your data") past that pinned height until the second,
  // post-fetch sync corrects it. See EVT.PROFILE_CARD_RENDERED's doc comment.
  window.dispatchEvent(new CustomEvent(EVT.PROFILE_CARD_RENDERED, { detail: {} }));

  const [reviewsResult, placesResult, editsResult, meta, timelineResult] = await Promise.all([
    fetchMyReviews(),
    fetchMySubmittedPlaces(),
    fetchMySubmittedEdits(),
    _fetchAccountMeta(),
    fetchVisitTimeline(),
  ]);
  // The merged sheet may have been closed (or the account signed out) while
  // these were in flight — bail rather than render into a stale/gone sheet
  // or hand a signed-out account's data to a subsequent viewer.
  if (!_account || _account.uid !== profileUid || timelineGeneration !== _timelineGeneration || profileSheetEl.classList.contains("shut")) return;

  _revokeReviewImageUrls(_reviewsCache);
  _reviewsCache = reviewsResult.reviews;
  _submittedPlacesCache = placesResult.submissions;
  _submittedEditsCache = editsResult.submissions;
  _accountMetaCache = meta;
  _accountMetaLoaded = true;
  _timelineCache = timelineResult.visits;
  _timelineLoaded = true;
  _timelineLoadFailed = !timelineResult.success;

  _renderCard(); // re-render with "member since"/top badge now resolved
  _renderStats();
  _renderSubmissionList(submittedPlacesEl, _submittedPlacesCache, "You haven't submitted any places yet.");
  _renderSubmissionList(submittedEditsEl, _submittedEditsCache, "You haven't submitted any edits yet.");
  _renderMyReviews();
  if (timelineOverlayEl && !timelineOverlayEl.classList.contains("hide")) _renderTimelineResult(timelineResult);
  else if (timelineResult.success) _renderTimelinePreview(summarizeTimeline(_timelineCache), _timelineCache.length ? "ready" : "empty");
  else _renderTimelinePreview(null, "error");

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
 * @returns {Promise<{saved: Array, firstSeenAt: string|null, lifetimeReviewCount: number, lifetimeVisitedCount: number}>}
 */
async function _fetchAccountMeta() {
  const idToken = await _auth.getIdToken();
  if (!idToken) return { saved: [], firstSeenAt: null, lifetimeReviewCount: 0, lifetimeVisitedCount: 0 };
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
      // Badge-eligibility lifetime counters (Code.gs's AccountMeta columns) —
      // see account-profile.js's computeBadges() doc comment for why these
      // are separate from the live "saved" counts above.
      lifetimeReviewCount: Number(result.lifetimeReviewCount) || 0,
      lifetimeVisitedCount: Number(result.lifetimeVisitedCount) || 0,
    };
  } catch {
    return { saved: [], firstSeenAt: null, lifetimeReviewCount: 0, lifetimeVisitedCount: 0 };
  }
}

// ─── Identity card (avatar, name, email, member since, sign out) ──

/** Only "live" (approved) submissions count toward the Contributor badge —
 *  see _renderCard()'s computeTopBadge() call for the full rationale. */
function _approvedCount(list) {
  return list.filter((item) => item.status === "live").length;
}

function _accountAvatarHTML(photoURL, initial) {
  return photoURL
    ? `<span class="menu-account-avatar pf-card-avatar menu-account-avatar--photo" data-avatar-fallback="${escA(initial)}"><img src="${escA(photoURL)}" alt="" referrerpolicy="no-referrer"></span>`
    : `<div class="menu-account-avatar pf-card-avatar">${esc(initial)}</div>`;
}

function _wireAccountAvatarFallback(root) {
  root.querySelectorAll(".menu-account-avatar--photo[data-avatar-fallback] img").forEach((img) => {
    img.addEventListener("error", () => {
      const avatar = img.parentElement;
      if (!avatar) return;
      avatar.textContent = avatar.dataset.avatarFallback || "?";
      avatar.classList.remove("menu-account-avatar--photo");
      delete avatar.dataset.avatarFallback;
    }, { once: true });
  });
}

function _renderCard() {
  if (!_account) return;
  const label = _account.displayName || _account.email || "Signed in";
  const initial = (_account.displayName || _account.email || "?").trim().charAt(0).toUpperCase();
  // Google supplies photoURL automatically; Microsoft sign-in never does
  // (see the note on _cacheAccount() in src/auth.js) — falls back to the
  // initial-letter avatar for Microsoft and magic-link accounts alike.
  const avatarHTML = _accountAvatarHTML(_account.photoURL, initial);
  const memberSince = formatMemberSince(_accountMetaCache.firstSeenAt);

  // Compact "flair" pill — the single highest badge across all 4 categories
  // (see account-profile.js's computeTopBadge() doc comment). Deliberately
  // just this one small pill next to the name, not a dedicated section —
  // scaled down after feedback that a full 4-card grid was too much for
  // what's meant to be a flair, not its own destination. Every account with
  // resolved data gets a pill, even at zero activity ("Newcomer") — per user
  // feedback, this never renders empty for a loaded account.
  //
  // Rendered ONLY once the data behind it has actually arrived
  // (_accountMetaLoaded): computeTopBadge() on the pre-fetch cache's zeroes
  // returns "Newcomer" for everyone, so the FIRST render used to flash that
  // at accounts that had long outgrown it before correcting itself a moment
  // later — showing a wrong badge briefly is worse than showing none, since
  // the wrong one reads as the account's real standing. Nothing is
  // substituted in its place (no skeleton/"Loading…" pill): the pill is
  // small flair on a row that also carries the name and email, so its
  // absence for one fetch reads as calm, not broken. memberSince above is
  // deliberately left as-is — it already renders nothing at all until
  // resolved, which is this same rule.
  const topBadge = _accountMetaLoaded ? computeTopBadge({
    lifetimeReviewCount: _accountMetaCache.lifetimeReviewCount,
    lifetimeVisitedCount: _accountMetaCache.lifetimeVisitedCount,
    // Contributor badge credit only counts APPROVED submissions (status
    // "live") — a still-pending or rejected one hasn't added anything real
    // yet. Deliberately different from the stats grid below (_renderStats()),
    // which shows raw submission counts including pending/rejected, since
    // each row there already carries its own status pill. Kept consistent
    // with src/account-sync.js's _checkBadgeLevelUps(), which uses this same
    // approved-only filter for the app-load badge-notification check.
    placesAddedCount: _approvedCount(_submittedPlacesCache),
    editsCount: _approvedCount(_submittedEditsCache),
    firstSeenAt: _accountMetaCache.firstSeenAt,
  }) : null;
  const badgePillHtml = topBadge
    ? `<span class="pf-badge-pill pf-badge-pill--lvl${topBadge.level}">${esc(
        topBadge.unranked ? topBadge.tierName : `${topBadge.tierName} ${topBadge.levelRoman} — ${topBadge.label}`,
      )}</span>`
    : "";

  cardBody.innerHTML = `<div class="menu-account-profile">
    ${avatarHTML}
    <div class="menu-account-info">
      <div class="pf-card-name-row">
        <span class="menu-account-name">${esc(label)}</span>
        ${badgePillHtml}
      </div>
      ${_account.displayName && _account.email ? `<span class="menu-account-email">${esc(_account.email)}</span>` : ""}
      ${memberSince ? `<span class="pf-member-since">Member since ${esc(memberSince)}</span>` : ""}
    </div>
    <button id="profile-signout" class="btn-roundel" type="button" aria-label="Sign out" title="Sign out">
      ${SIGNOUT_ICON_SVG}
    </button>
  </div>`;

  _wireAccountAvatarFallback(cardBody);
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
  { key: "visitedCount", label: "Visited" },
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
    (d) => {
      const jumpTarget = d.key === "pinCount" ? "pins" : d.key === "visitedCount" ? "visited" : "";
      const inner = `
      <span class="pf-stat-num">${esc(String(stats[d.key] ?? 0))}</span>
      <span class="pf-stat-label">${esc(d.label)}</span>`;
      return jumpTarget
        ? `<button class="pf-stat-card pf-stat-card--jump" type="button" data-profile-saved-jump="${jumpTarget}" aria-label="Open ${escA(d.label)} in Saved Places">${inner}</button>`
        : `<div class="pf-stat-card">${inner}</div>`;
    },
  ).join("");
  statsGrid.querySelectorAll("[data-profile-saved-jump]").forEach((btn) =>
    btn.addEventListener("click", _handleSavedStatJump),
  );
}

function _handleSavedStatJump(e) {
  const section = e.currentTarget?.dataset?.profileSavedJump;
  if (section !== "pins" && section !== "visited") return;
  _closeAccountSheet();
  requestAnimationFrame(() => openSavedPlacesAtSection(section));
}

function _renderTimelinePreview(summary, state = "empty") {
  if (!timelinePreviewEl) return;
  if (state === "loading") {
    if (timelinePreviewTitleEl) timelinePreviewTitleEl.textContent = "Verified visits";
    if (timelinePreviewSummaryEl) timelinePreviewSummaryEl.textContent = "Loading…";
    return;
  }
  if (state === "error") {
    if (timelinePreviewTitleEl) timelinePreviewTitleEl.textContent = "Verified visits unavailable";
    if (timelinePreviewSummaryEl) timelinePreviewSummaryEl.textContent = "Open visits to try again.";
    return;
  }
  if (!summary?.totalVisits) {
    if (timelinePreviewTitleEl) timelinePreviewTitleEl.textContent = "Verified visits";
    if (timelinePreviewSummaryEl) timelinePreviewSummaryEl.textContent = "No verified visits yet";
    return;
  }
  const visitLabel = `${summary.totalVisits} visit${summary.totalVisits === 1 ? "" : "s"}`;
  const placeLabel = `${summary.uniquePlaces} place${summary.uniquePlaces === 1 ? "" : "s"}`;
  if (timelinePreviewTitleEl) timelinePreviewTitleEl.textContent = visitLabel;
  if (timelinePreviewSummaryEl) timelinePreviewSummaryEl.textContent = `${placeLabel} · ${summary.activeMonths} active month${summary.activeMonths === 1 ? "" : "s"}`;
}

function _renderTimelineSummary(summary) {
  if (!timelineSummaryEl) return;
  const values = [[summary.totalVisits, "Visits"], [summary.uniquePlaces, "Places"], [summary.activeMonths, "Active months"]];
  timelineSummaryEl.innerHTML = values.map(([value, label]) => `<div class="pf-timeline-summary-card"><span class="pf-timeline-summary-value">${esc(String(value))}</span><span class="pf-timeline-summary-label">${esc(label)}</span></div>`).join("");
}

function _renderTimelineLoading() {
  _clearTimelineMap();
  timelineEl?.classList.remove("pf-timeline--empty");
  if (timelineCalendarSectionEl) timelineCalendarSectionEl.hidden = false;
  _renderTimelinePreview(null, "loading");
  if (timelineSummaryEl) timelineSummaryEl.innerHTML = [1, 2, 3].map(() => `<div class="pf-timeline-summary-card pf-timeline-summary-card--loading" aria-hidden="true"><span></span><span></span></div>`).join("");
  if (timelineCalendarEl) timelineCalendarEl.innerHTML = `<div class="pf-timeline-loading" aria-hidden="true"><span></span><span></span><span></span><span></span></div>`;
  if (timelineListEl) timelineListEl.innerHTML = `<div class="pf-timeline-loading" aria-hidden="true"><span></span><span></span><span></span></div>`;
}

function _formatTimelineDate(visitedAt) {
  const date = new Date(visitedAt);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  return {
    date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date),
    time: new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(date),
  };
}

function _timelineDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function _calendarLevel(count, maximum) {
  if (!count) return 0;
  if (maximum <= 1 || count >= maximum * 0.75) return 4;
  if (count >= maximum * 0.5) return 3;
  if (count >= maximum * 0.25) return 2;
  return 1;
}

function _renderTimelineCalendar(visits) {
  if (!timelineCalendarEl) return;
  const counts = aggregateTimelineDays(visits);
  const maximum = Math.max(0, ...counts.values());
  const now = new Date();
  const firstVisibleDay = new Date(TIMELINE_START_DATE);
  const start = new Date(firstVisibleDay);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(now);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const weekCount = Math.ceil((end.getTime() - start.getTime() + 1) / (TIMELINE_DAYS_IN_WEEK * 24 * 60 * 60 * 1000));
  const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "short" });
  const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const firstVisitDate = visits.map((visit) => new Date(visit.visitedAt)).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => a - b)[0];
  const firstVisitLabel = firstVisitDate
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(firstVisitDate)
    : "1 Aug 2026";
  const weekdayLabels = Array.from({ length: TIMELINE_DAYS_IN_WEEK }, (_, index) => weekdayFormatter.format(new Date(2024, 0, 7 + index)));
  const monthLabels = [];
  const cells = [];
  let previousMonthKey = "";
  for (let week = 0; week < weekCount; week += 1) {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + week * TIMELINE_DAYS_IN_WEEK);
    const monthLabelDate = weekStart < TIMELINE_START_DATE ? TIMELINE_START_DATE : weekStart;
    const monthKey = `${monthLabelDate.getFullYear()}-${monthLabelDate.getMonth()}`;
    monthLabels.push(monthKey === previousMonthKey ? "" : monthFormatter.format(monthLabelDate));
    previousMonthKey = monthKey;
    for (let day = 0; day < TIMELINE_DAYS_IN_WEEK; day += 1) {
      const current = new Date(weekStart);
      current.setDate(weekStart.getDate() + day);
      const count = counts.get(_timelineDayKey(current)) || 0;
      const dayKey = _timelineDayKey(current);
      const beforeStart = current < TIMELINE_START_DATE;
      const label = `${current.toLocaleDateString(undefined, { dateStyle: "full" })}: ${count} verified visit${count === 1 ? "" : "s"}`;
      const future = current > now ? " pf-timeline-calendar-day--future" : "";
      const before = beforeStart ? " pf-timeline-calendar-day--before-start" : "";
      const today = dayKey === _timelineDayKey(now) ? " pf-timeline-calendar-day--today" : "";
      const interactive = count && !beforeStart && current <= now;
      cells.push(`<button type="button" class="pf-timeline-calendar-day${future}${before}${today}" data-level="${_calendarLevel(count, maximum)}" data-day-key="${dayKey}"${interactive ? " data-has-visits=\"true\"" : " disabled"} title="${escA(label)}" aria-label="${escA(label)}"></button>`);
    }
  }
  timelineCalendarEl.innerHTML = `<div class="pf-timeline-activity" aria-label="Verified visits since ${escA(firstVisitLabel)}"><div class="pf-timeline-activity-heading"><span>Activity</span><span class="pf-timeline-activity-range">Since ${esc(firstVisitLabel)}</span></div><div class="pf-timeline-activity-scroll"><div class="pf-timeline-activity-layout"><div class="pf-timeline-weekday-labels" aria-hidden="true">${weekdayLabels.map((label, index) => `<span>${index % 2 === 1 ? esc(label.slice(0, 2)) : ""}</span>`).join("")}</div><div class="pf-timeline-activity-body"><div class="pf-timeline-activity-months" aria-hidden="true">${monthLabels.map((label) => `<span>${esc(label)}</span>`).join("")}</div><div class="pf-timeline-activity-grid">${cells.join("")}</div></div></div></div><div class="pf-timeline-legend" aria-label="Visit intensity legend"><span>Fewer</span><i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><span>More</span></div></div>`;
  timelineCalendarEl.querySelectorAll(".pf-timeline-calendar-day[data-has-visits]").forEach((day) => {
    day.addEventListener("click", () => _scrollTimelineToDay(day.dataset.dayKey));
  });
  requestAnimationFrame(() => {
    const scroll = timelineCalendarEl.querySelector(".pf-timeline-activity-scroll");
    if (scroll) scroll.scrollLeft = scroll.scrollWidth;
  });
}

function _scrollTimelineToDay(dayKey) {
  const events = [...(timelineListEl?.querySelectorAll(".pf-timeline-event") || [])].filter((item) => {
    const visitedAt = item.querySelector("time")?.dateTime;
    return visitedAt && _timelineDayKey(new Date(visitedAt)) === dayKey;
  });
  if (!events.length) return;
  events.forEach((event) => {
    const monthEvents = event.closest(".pf-timeline-events");
    if (!monthEvents?.classList.contains("pf-timeline-events--collapsed")) return;
    monthEvents.classList.remove("pf-timeline-events--collapsed");
    monthEvents.setAttribute("aria-hidden", "false");
    monthEvents.inert = false;
    timelineListEl.querySelector(`[aria-controls="${monthEvents.id}"]`)?.setAttribute("aria-expanded", "true");
  });
  events[0].scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  events.forEach((event) => event.classList.add("pf-timeline-event--day-target"));
  setTimeout(() => events.forEach((event) => event.classList.remove("pf-timeline-event--day-target")), 1400);
}

function _buildTimelineEvent(visit) {
  const formatted = _formatTimelineDate(visit.visitedAt);
  const place = placesData.find((candidate) => candidate.id === visit.placeId);
  const category = place?.category || place?.type || "";
  return `<article class="pf-timeline-event${place ? " pf-timeline-event--clickable" : ""}"${place ? ` data-place-id="${escA(visit.placeId)}" role="button" tabindex="0"` : ""}><div class="pf-timeline-event-rail" aria-hidden="true"><span class="pf-timeline-event-marker"></span></div><div class="pf-timeline-event-content"><div class="pf-timeline-event-heading"><h3>${esc(visit.placeName)}</h3><span class="pf-timeline-confirmed">GPS-confirmed</span></div><time class="pf-timeline-event-time" datetime="${escA(visit.visitedAt)}">${esc(formatted.date)} · ${esc(formatted.time)}</time>${category ? `<span class="pf-timeline-event-category">${esc(category)}</span>` : ""}</div></article>`;
}

function _wireTimelineEvents() {
  timelineListEl?.querySelectorAll(".pf-timeline-event").forEach((event) => {
    event.querySelector(".pf-timeline-confirmed")?.remove();
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn-roundel-danger pf-timeline-event-remove";
    removeButton.setAttribute("aria-label", `Remove visit to ${event.querySelector("h3")?.textContent || "this place"}`);
    removeButton.title = "Remove this visit";
    removeButton.innerHTML = TRASH_ICON_SVG;
    removeButton.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const confirmed = await showConfirmDialog({
        title: "Remove this visit?",
        message: "This removes the selected visit from your timeline.",
        confirmLabel: "Remove",
        cancelLabel: "Keep",
        variant: "danger",
        icon: TRASH_ICON_SVG,
      });
      if (!confirmed) return;
      removeButton.disabled = true;
      const result = await deleteVerifiedVisit(event.dataset.visitId);
      if (!result.success) {
        removeButton.disabled = false;
        showToast("Couldnâ€™t remove this visit", "error", "Please try again");
      } else {
        showToast("Visit removed", "check");
      }
    });
    event.querySelector(".pf-timeline-event-heading")?.appendChild(removeButton);

    if (!event.classList.contains("pf-timeline-event--clickable")) return;
    const open = () => {
      const place = placesData.find((candidate) => candidate.id === event.dataset.placeId);
      if (!place) return;
      _closeAccountSheet();
      openPlaceSheet(place);
    };
    event.addEventListener("click", open);
    event.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
}

function _renderTimelineList(visits) {
  if (!timelineListEl) return;
  if (!visits.length) {
    timelineListEl.innerHTML = `<div class="pf-timeline-empty"><div class="pf-timeline-empty-graphic" aria-hidden="true"><span></span><i></i><span></span><i></i><span></span></div><div class="pf-timeline-empty-copy"><strong>No visits yet</strong><span>Add a nearby place to begin.</span></div><button class="btn-secondary pf-timeline-empty-action" type="button" data-profile-timeline-browse>Explore Manarah</button></div>`;
    timelineListEl.querySelector("[data-profile-timeline-browse]")?.addEventListener("click", () => {
      _closeTimelineOverlay();
      _closeAccountSheet();
    });
    return;
  }
  const groups = groupTimelineByMonth(visits);
  timelineListEl.innerHTML = groups.map((group, index) => {
    const eventsId = `timeline-month-${escA(group.key)}`;
    const expanded = index === 0;
    return `<section class="pf-timeline-month-events"><button class="pf-timeline-month-toggle" type="button" aria-expanded="${expanded}" aria-controls="${eventsId}"><span>${esc(group.label)}</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div id="${eventsId}" class="pf-timeline-events${expanded ? "" : " pf-timeline-events--collapsed"}" aria-hidden="${expanded ? "false" : "true"}"${expanded ? "" : " inert"}><div class="pf-timeline-events-inner">${group.visits.map(_buildTimelineEvent).join("")}</div></div></section>`;
  }).join("");
  timelineListEl.querySelectorAll(".pf-timeline-month-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      const events = document.getElementById(toggle.getAttribute("aria-controls"));
      if (!events) return;
      events.classList.toggle("pf-timeline-events--collapsed", expanded);
      events.setAttribute("aria-hidden", String(expanded));
      events.inert = expanded;
    });
  });
  const renderedVisits = groups.flatMap((group) => group.visits);
  timelineListEl.querySelectorAll(".pf-timeline-event").forEach((event, index) => {
    event.dataset.visitId = renderedVisits[index]?.id || "";
  });
  _wireTimelineEvents();
}

function _clearTimelineMap() {
  _timelineMapMarkers.forEach((marker) => marker.remove());
  _timelineMapMarkers = [];
  _timelineMap?.remove();
  _timelineMap = null;
  if (timelineMapWrapEl) timelineMapWrapEl.hidden = true;
  if (timelineMapSectionEl) timelineMapSectionEl.hidden = true;
}

function _renderTimelineMap(visits) {
  _clearTimelineMap();
  const uniquePlaces = getUniqueTimelinePlaces(visits);
  if (!uniquePlaces.length || !timelineMapWrapEl || !timelineMapEl || !window.maplibregl) return;
  timelineMapWrapEl.hidden = false;
  if (timelineMapSectionEl) timelineMapSectionEl.hidden = false;
  const first = uniquePlaces[0];
  const timelineMap = new window.maplibregl.Map({ container: timelineMapEl, style: HSL_STYLE, center: [first.placeLng, first.placeLat], zoom: uniquePlaces.length === 1 ? TIMELINE_MAP_SINGLE_ZOOM : 2, attributionControl: false });
  _timelineMap = timelineMap;
  uniquePlaces.forEach((visit) => {
    const markerEl = document.createElement("span");
    markerEl.className = "pf-timeline-map-marker";
    markerEl.setAttribute("aria-label", visit.placeName);
    markerEl.title = visit.placeName;
    _timelineMapMarkers.push(new window.maplibregl.Marker({ element: markerEl, anchor: "center" }).setLngLat([visit.placeLng, visit.placeLat]).addTo(timelineMap));
  });
  timelineMap.once("load", () => {
    if (uniquePlaces.length > 1) {
      const bounds = new window.maplibregl.LngLatBounds();
      uniquePlaces.forEach((visit) => bounds.extend([visit.placeLng, visit.placeLat]));
      timelineMap.fitBounds(bounds, { padding: TIMELINE_MAP_FIT_PADDING, maxZoom: TIMELINE_MAP_SINGLE_ZOOM });
    }
    setTimeout(() => timelineMap.resize(), TIMELINE_MAP_RESIZE_DELAY_MS);
  });
}

function _renderTimelineError() {
  if (timelineSummaryEl) timelineSummaryEl.innerHTML = `<div class="pf-timeline-error" role="status"><strong>Your timeline couldn’t be loaded.</strong><button class="btn-secondary" type="button" data-profile-timeline-retry>Try again</button></div>`;
  if (timelineCalendarEl) timelineCalendarEl.innerHTML = "";
  if (timelineListEl) timelineListEl.innerHTML = `<p class="menu-placeholder">Timeline data is temporarily unavailable.</p>`;
  _clearTimelineMap();
  timelineSummaryEl?.querySelector("[data-profile-timeline-retry]")?.addEventListener("click", () => _loadTimelineOnly(_account?.uid));
  _renderTimelinePreview(null, "error");
  window.dispatchEvent(new CustomEvent(EVT.PROFILE_TIMELINE_RENDERED, { detail: { state: "error" } }));
}

function _renderTimelineResult(result) {
  if (!result?.success) { _renderTimelineError(); return; }
  const visits = Array.isArray(result.visits) ? result.visits : [];
  const summary = summarizeTimeline(visits);
  _renderTimelineSummary(summary);
  _renderTimelinePreview(summary, visits.length ? "ready" : "empty");
  timelineEl?.classList.toggle("pf-timeline--empty", !visits.length);
  if (timelineCalendarSectionEl) timelineCalendarSectionEl.hidden = !visits.length;
  if (!visits.length) {
    if (timelineCalendarEl) timelineCalendarEl.innerHTML = "";
    _renderTimelineList(visits);
    _clearTimelineMap();
    window.dispatchEvent(new CustomEvent(EVT.PROFILE_TIMELINE_RENDERED, { detail: { state: "empty" } }));
    return;
  }
  _renderTimelineCalendar(visits);
  _renderTimelineList(visits);
  _renderTimelineMap(visits);
  window.dispatchEvent(new CustomEvent(EVT.PROFILE_TIMELINE_RENDERED, { detail: { state: visits.length ? "ready" : "empty" } }));
}

async function _loadTimelineOnly(profileUid) {
  if (!profileUid || !_account || _account.uid !== profileUid) return;
  const generation = _timelineGeneration;
  const result = await fetchVisitTimeline();
  const timelineOpen = timelineOverlayEl && !timelineOverlayEl.classList.contains("hide");
  if (!_account || _account.uid !== profileUid || generation !== _timelineGeneration || (profileSheetEl.classList.contains("shut") && !timelineOpen)) return;
  _timelineLoaded = true;
  _timelineLoadFailed = !result.success;
  if (result.success) _timelineCache = result.visits;
  if (timelineOverlayEl && !timelineOverlayEl.classList.contains("hide")) _renderTimelineResult(result);
  else if (result.success) _renderTimelinePreview(summarizeTimeline(_timelineCache), _timelineCache.length ? "ready" : "empty");
  else _renderTimelinePreview(null, "error");
}

// ─── Submitted places / edits (status pill + reject-reason surfacing) ───────

const STATUS_LABELS = { pending: "Pending", live: "Live", rejected: "Rejected" };

function _buildSubmissionRow(item) {
  const status = item.status === "live" || item.status === "rejected" ? item.status : "pending";
  // Code.gs's getMySubmittedPlaces() returns this field as `name`;
  // getMySubmittedEdits() returns the same information as `placeName` —
  // reading only `item.name` here meant every edit row fell through to
  // "Untitled" regardless of the actual place name (reported bug). Handles
  // both field names rather than requiring another Code.gs redeploy just to
  // rename one of them for consistency.
  const name = item.name || item.placeName || "Untitled";
  const hasReason = status === "rejected" && item.rejectReason;
  // Native title= tooltip for desktop hover; the <p> below covers mobile,
  // where hover tooltips aren't discoverable at all.
  const titleAttr = hasReason ? ` title="${escA(item.rejectReason)}"` : "";
  const reasonHtml = hasReason ? `<p class="pf-submission-reason">${esc(item.rejectReason)}</p>` : "";
  // Only a "live" submission is guaranteed to have a resolved placeId
  // (getMySubmittedPlaces() only performs its Places-sheet lookup once a
  // row is approved); a still-pending/rejected row has nothing to navigate
  // to yet, so it stays a plain, non-interactive row.
  const clickable = Boolean(item.placeId);
  const clickableAttrs = clickable ? ` data-place-id="${escA(item.placeId)}" role="button" tabindex="0"` : "";
  return `<div class="pf-submission-item${clickable ? " pf-submission-item--clickable" : ""}"${clickableAttrs}>
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
  _wireSubmissionRows(container);
}

/**
 * Clicking/tapping a submitted place or edit row that has a resolved
 * placeId opens that place's sheet, same navigate-away pattern as
 * _wireMyReviewRows() below — closes the whole merged sheet first so the
 * place sheet doesn't stack behind/alongside it.
 * @param {HTMLElement} container
 * @returns {void}
 */
function _wireSubmissionRows(container) {
  container.querySelectorAll(".pf-submission-item--clickable").forEach((row) => {
    const open = () => {
      const place = placesData.find((p) => p.id === row.dataset.placeId);
      if (!place) return;
      _closeAccountSheet();
      openPlaceSheet(place);
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
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
  const images = Array.isArray(r.images) && r.images.length
    ? `<div class="acc-review-images">${r.images.map((image, index) => image.src
      ? `<img src="${escA(image.src)}" alt="Review photo ${index + 1}" loading="lazy">`
      : `<span class="acc-review-image-unavailable" aria-label="Review photo unavailable"></span>`).join("")}</div>`
    : "";
  return `<div class="rv-review-card acc-review-row" data-place-id="${esc(r.placeId)}">
    <div class="rv-review-body">
      <div class="rv-review-meta">
        <span class="rv-review-stars">${buildStarDisplay(rating, "12")}</span>
        <span class="rv-review-score">${rating.toFixed(1)}</span>
        <span class="rv-review-time">${esc(_timeAgo(r.timestamp))}</span>
      </div>
      <button class="acc-review-place-name" type="button" data-place-id="${esc(r.placeId)}">${esc(r.placeName || "Unknown place")}</button>
      ${r.text ? `<p class="rv-review-text">${esc(r.text)}</p>` : ""}
      ${images}
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
      openReviewsOverlayForEdit(r.placeId, place?.name || r.placeName, { rating: r.rating, text: r.text, images: r.images || [] }, place);
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
    showToast("Review deleted", "check");
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
    message: "This permanently removes your reviews, saved places, verified timeline visits, and submissions, and signs you out. This can't be undone.",
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
    verifiedVisits: _timelineCache,
    submittedPlaces: _submittedPlacesCache,
    submittedEdits: _submittedEditsCache,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `manarah-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Data exported", "check");
}
