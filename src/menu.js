/**
 * Menu sheet — Account / Map View / Support / Preferences.
 *
 * Consolidates what used to be independent floating side-rail pills (contact,
 * wishlist, map style picker, and the tools-toggle that grouped them on
 * narrow viewports) into one bottom sheet reachable via #menu-pill, so the
 * side rail stays down to just Search + Zoom + Menu on every viewport.
 *
 * The Map View section reuses #style-panel verbatim (still wired by
 * map-controls.js); the Support section's Contact/Wishlist buttons keep
 * their original #contact-pill/#wish-pill ids so contact.js/wishlist.js
 * need no changes at all — only their DOM location moved.
 *
 * The Account section (docs/ACCOUNTS_AND_REDESIGN_PLAN.md Phase 5/7) renders
 * a sign-in prompt (Google popup or email magic link) when signed out, or the
 * signed-in identity + a "Your reviews" list (edit/delete inline) when signed
 * in. auth.js/reviews.js/account-sync.js are all dynamically imported from
 * initMenuAccount() (called after map load, alongside this app's other
 * non-critical post-load modules) so the heavy Firebase CDN modules they pull
 * in stay lazy rather than loading on every page view.
 *
 * The Preferences section holds a prayer-calculation-method dropdown, an Asr
 * madhab dropdown (both persisted in localStorage and read by prayer.js's
 * fetch), and a reduce-motion switch (an explicit override on top of the
 * OS-level `prefers-reduced-motion` media feature — see utils.js's
 * isReduceMotionActive()/setReduceMotionOverride()). Wired from
 * initMenuPreferences(), dynamically importing prayer.js the same lazy way
 * initMenuAccount() imports auth.js/reviews.js.
 */
import { initSheetDrag, esc, escA, showToast, showConfirmDialog, isReduceMotionActive, setReduceMotionOverride, animateElementHeight, buildWelcomeGreeting } from "./utils.js";
import { EVT } from "./events.js";
import { placesData, openPlaceSheet } from "./places.js";
import { EMAIL_SIGNIN_BTN_HTML, GOOGLE_SIGNIN_BTN_HTML, MICROSOFT_SIGNIN_BTN_HTML } from "./icons.js";

// Icons reused as the confirm dialog's icon-circle content (showConfirmDialog(),
// src/utils.js) — same trash/sign-out glyphs already used on the triggering
// buttons themselves, just larger, so the dialog visually matches its trigger.
const TRASH_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>`;
const SIGNOUT_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

const menuSheet = document.getElementById("menu-sheet");
const menuScrim = document.getElementById("scrim");
const menuCloseBtn = document.getElementById("menu-close");
const accountBody = document.getElementById("menu-account-body");

let _auth = null; // lazily-loaded src/auth.js module namespace
let _reviewsMod = null; // lazily-loaded src/reviews.js module namespace
let _account = null;
let _prayerMod = null; // lazily-loaded src/prayer.js module namespace (Preferences section)

/**
 * Open the menu sheet.
 * @returns {boolean} true if the sheet was closed and is now opening (a CSS
 *   transition just started); false if it was already open.
 */
export function openMenuSheet() {
  const wasShut = menuSheet.classList.contains("shut");
  menuSheet.hidden = false;
  menuScrim.classList.remove("hide");
  menuSnap.open();
  return wasShut;
}

/**
 * Close the menu sheet.
 * @returns {boolean} true if it was open and is now closing; false if it was
 *   already shut.
 */
export function closeMenuSheet() {
  const wasOpen = !menuSheet.classList.contains("shut");
  if (menuSheet._hideTimeout) { clearTimeout(menuSheet._hideTimeout); menuSheet._hideTimeout = null; }
  menuSnap.close();
  menuScrim.classList.add("hide");
  menuSheet._hideTimeout = setTimeout(() => {
    menuSheet.hidden = true;
    menuSnap.cleanup();
    menuSheet._hideTimeout = null;
  }, 400);
  return wasOpen;
}

const menuSnap = initSheetDrag(menuSheet, closeMenuSheet);

document.getElementById("menu-pill").addEventListener("click", () =>
  menuSheet.classList.contains("shut") ? openMenuSheet() : closeMenuSheet(),
);
menuCloseBtn.addEventListener("click", closeMenuSheet);

// ─── Account section ─────────────────────────────────────────────────────────

/**
 * Lazy-load auth.js/reviews.js/account-sync.js and wire up the Account
 * section. Call once, after map load (same lazy-load-after-map-load
 * convention as contact.js/prayer.js/etc — see src/app.js).
 * @returns {Promise<void>}
 */
export async function initMenuAccount() {
  const [auth, reviewsMod, { initAccountSync }] = await Promise.all([
    import("./auth.js"),
    import("./reviews.js"),
    import("./account-sync.js"),
  ]);
  _auth = auth;
  _reviewsMod = reviewsMod;

  // initAccountSync() registers its EVT.AUTH_CHANGED listener BEFORE
  // initAuth() runs, not after. initAuth() can synchronously complete (and
  // dispatch EVT.AUTH_CHANGED for) a pending magic-link sign-in as part of
  // its own execution — if account-sync's listener were registered only
  // after initAuth() resolved, that exact "just completed" event would fire
  // into a void with no listener yet attached, silently skipping the Phase 8
  // sign-in merge for every magic-link sign-in (the interactive Google-popup
  // path was never affected, since by the time a user clicks that button,
  // initMenuAccount() — and thus this registration — has long since finished
  // running on page load). Found via the mocked-SDK harness in
  // tests/14-auth-account.spec.js, not caught by code review alone.
  initAccountSync();
  const magicLinkResult = await _auth.initAuth();

  _account = _auth.getCachedAccount();
  _renderAccountSection();
  // Only the just-completed-a-magic-link case gets a toast here — a restored
  // already-signed-in session (the far more common case, on every normal page
  // load) stays silent, matching this feature's "purely additive, invisible"
  // background-sync design. The interactive Google/Microsoft popup paths show
  // their own toast right in _wireSignedOutView() instead, since those are a
  // direct user action with their own immediate success/failure branch.
  if (magicLinkResult.completed && _account) {
    showToast(buildWelcomeGreeting(magicLinkResult.account, magicLinkResult.isNewUser), "check");
  }

  window.addEventListener(EVT.AUTH_CHANGED, (e) => {
    _account = e.detail?.account || null;
    _renderAccountSection();
  });
  window.addEventListener(EVT.SAVED_SYNCED, () => {
    // Cross-device sync doesn't change the Account section's own content,
    // but re-rendering is cheap and keeps this future-proof if it ever does.
  });
}

function _renderAccountSection() {
  accountBody.innerHTML = _account ? _buildSignedInHTML(_account) : _buildSignedOutHTML();
  if (_account) _wireSignedInView();
  else _wireSignedOutView();
}

/**
 * Smoothly animate the Account section's card height across a DOM change
 * (e.g. toggling the email sign-in panel open/closed, or swapping it for the
 * "check your email" message). Thin wrapper around utils.js's
 * animateElementHeight, scoped to .menu-account-panel — this section's own
 * equivalent of reviews.js's _animateReviewCardHeight (which does the same
 * thing for .rv-overlay-card).
 * @param {() => void} changeFn
 * @returns {void}
 */
function _animateMenuPanelHeight(changeFn) {
  const panel = accountBody.querySelector(".menu-account-panel");
  animateElementHeight(panel, changeFn);
}

function _buildSignedOutHTML() {
  // Google and email are two equal-weight peer sign-in options in one row —
  // neither should read as the primary choice over the other. Both share
  // .rv-action-btn (44px height) with flex:1 (equal width split); Google
  // keeps its full logo + "Continue with Google" label (its own branding
  // guidelines require both together for recognizability, and the exact
  // text can't be abbreviated — see .btn-google in docs/DESIGN_SYSTEM.md).
  // The email option is "Continue with email" — deliberately mirroring
  // Google's own phrasing so the two read as parallel, equally-weighted
  // actions rather than one being the "real" option and the other a
  // secondary afterthought. Its border/text color are overridden
  // (styles.css) to this app's higher-contrast neutral tokens (--text-2
  // border, --text label) instead of .btn-secondary's default subtle look.
  // Also carries its own envelope icon (EMAIL_SIGNIN_BTN_HTML) so both
  // buttons in the row match icon+label structure, border color, and font
  // weight exactly — an earlier icon-only-for-Google version read as two
  // different apps' buttons sitting side by side. This is now a second,
  // deliberate exception to the Button content rule (see .btn-google in
  // docs/DESIGN_SYSTEM.md for the first) for the same reason: two peer
  // sign-in options need to visually match each other more than either
  // needs to match this app's default plain-text-button convention.
  return `<div class="menu-account-panel">
    <div class="menu-account-signin-row">
      <button id="menu-google-signin" class="rv-action-btn btn-google" type="button">${GOOGLE_SIGNIN_BTN_HTML}</button>
      <button id="menu-microsoft-signin" class="rv-action-btn btn-microsoft" type="button">${MICROSOFT_SIGNIN_BTN_HTML}</button>
      <button id="menu-email-signin-toggle" class="rv-action-btn btn-secondary" type="button">${EMAIL_SIGNIN_BTN_HTML}</button>
    </div>
    <div id="menu-email-signin-panel" class="rv-verify-step hide">
      <div class="rv-field">
        <label class="rv-field-label" for="menu-email-input">Email address</label>
        <input id="menu-email-input" class="rv-input" type="email" placeholder="you@example.com" maxlength="254" autocomplete="email" />
      </div>
      <button id="menu-email-send" class="rv-action-btn btn-primary" type="button">Send sign-in link</button>
      <p id="menu-email-error" class="rv-verify-error hide"></p>
    </div>
  </div>`;
}

function _buildSignedInHTML(account) {
  const label = account.displayName || account.email || "Signed in";
  const initial = (account.displayName || account.email || "?").trim().charAt(0).toUpperCase();
  // Google supplies photoURL automatically; Microsoft sign-in never does
  // (see the note on _cacheAccount() in src/auth.js) — falls back to the
  // initial-letter avatar for Microsoft and magic-link accounts alike.
  const avatarHTML = account.photoURL
    ? `<img class="menu-account-avatar" src="${escA(account.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="menu-account-avatar">${esc(initial)}</div>`;
  return `<div class="menu-account-panel">
    <div class="menu-account-profile">
      ${avatarHTML}
      <div class="menu-account-info">
        <span class="menu-account-name">${esc(label)}</span>
        ${account.displayName && account.email ? `<span class="menu-account-email">${esc(account.email)}</span>` : ""}
      </div>
      <button id="menu-signout" class="btn-roundel" type="button" aria-label="Sign out" title="Sign out">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
    <div class="menu-section-label menu-reviews-label">Your reviews</div>
    <div id="menu-my-reviews" class="rv-list"><p class="menu-placeholder">Loading…</p></div>
  </div>`;
}

function _wireSignedOutView() {
  const googleBtn = document.getElementById("menu-google-signin");
  const microsoftBtn = document.getElementById("menu-microsoft-signin");
  const emailToggle = document.getElementById("menu-email-signin-toggle");
  const emailPanel = document.getElementById("menu-email-signin-panel");
  const emailInput = document.getElementById("menu-email-input");
  const sendBtn = document.getElementById("menu-email-send");
  const errorMsg = document.getElementById("menu-email-error");

  function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.remove("hide"); }
  function hideError() { errorMsg.classList.add("hide"); }

  googleBtn.addEventListener("click", async () => {
    hideError();
    googleBtn.disabled = true;
    googleBtn.innerHTML = `<span class="btn-spinner"></span> Signing in…`;
    const result = await _auth.signInWithGoogle();
    if (result.success) {
      // Same welcome-greeting convention as the reviews sign-in prompt
      // (src/reviews.js's _showSignInPrompt) — this is the primary sign-in
      // entry point, so a visible confirmation matters most here.
      showToast(buildWelcomeGreeting(result.account, result.isNewUser), "check");
    } else {
      googleBtn.disabled = false;
      googleBtn.innerHTML = GOOGLE_SIGNIN_BTN_HTML;
      if (result.error !== "auth/popup-closed-by-user" && result.error !== "auth/cancelled-popup-request") {
        showError("Sign-in failed. Please try again.");
      }
    }
    // On success, EVT.AUTH_CHANGED also fires and _renderAccountSection() re-runs.
  });

  microsoftBtn.addEventListener("click", async () => {
    hideError();
    microsoftBtn.disabled = true;
    microsoftBtn.innerHTML = `<span class="btn-spinner"></span> Signing in…`;
    const result = await _auth.signInWithMicrosoft();
    if (result.success) {
      showToast(buildWelcomeGreeting(result.account, result.isNewUser), "check");
    } else {
      microsoftBtn.disabled = false;
      microsoftBtn.innerHTML = MICROSOFT_SIGNIN_BTN_HTML;
      if (result.error !== "auth/popup-closed-by-user" && result.error !== "auth/cancelled-popup-request") {
        showError("Sign-in failed. Please try again.");
      }
    }
  });

  emailToggle.addEventListener("click", () => {
    _animateMenuPanelHeight(() => emailPanel.classList.toggle("hide"));
  });

  sendBtn.addEventListener("click", async () => {
    hideError();
    const email = emailInput.value.trim();
    if (!email.includes("@")) {
      showError("Please enter a valid email address");
      return;
    }
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span class="btn-spinner"></span> Sending…`;
    const result = await _auth.sendMagicLink(email);
    if (result.success) {
      _animateMenuPanelHeight(() => {
        emailPanel.innerHTML = `<p class="rv-verify-desc">Check <strong>${esc(email)}</strong> for a sign-in link, then come back and reopen the menu.</p>`;
      });
    } else {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send sign-in link";
      showError("Could not send the link. Please try again.");
    }
  });
}

function _wireSignedInView() {
  document.getElementById("menu-signout").addEventListener("click", async () => {
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
    // EVT.AUTH_CHANGED fires and _renderAccountSection() re-runs on success.
    if (result.success) {
      showToast("Signed out", "check");
    } else {
      showToast("Couldn't sign out", "error", "Please try again");
    }
  });
  _loadAndRenderMyReviews();
}

async function _loadAndRenderMyReviews() {
  const list = document.getElementById("menu-my-reviews");
  if (!list) return;
  const { reviews } = await _reviewsMod.fetchMyReviews();
  // The Account section may have re-rendered (or the sheet closed) while the
  // fetch was in flight — bail if our container isn't in the DOM anymore.
  if (!document.getElementById("menu-my-reviews")) return;

  if (!reviews.length) {
    list.innerHTML = `<p class="menu-placeholder">You haven't written any reviews yet.</p>`;
    return;
  }
  list.innerHTML = reviews.map((r) => _buildMyReviewRow(r)).join("");
  _wireMyReviewRows(list, reviews);
}

function _buildMyReviewRow(r) {
  const rating = Number(r.rating) || 0;
  return `<div class="rv-review-card acc-review-row" data-place-id="${esc(r.placeId)}">
    <div class="rv-review-body">
      <div class="rv-review-meta">
        <span class="rv-review-stars">${_reviewsMod.buildStarDisplay(rating, "12")}</span>
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
      closeMenuSheet();
      openPlaceSheet(place);
    });
  });

  list.querySelectorAll(".acc-review-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = byPlaceId.get(btn.dataset.placeId);
      if (!r) return;
      const place = placesData.find((p) => p.id === r.placeId);
      closeMenuSheet();
      _reviewsMod.openReviewsOverlayForEdit(r.placeId, place?.name || r.placeName, { rating: r.rating, text: r.text });
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
 * Real Yes/No confirmation before deleting a review — replaces the earlier
 * press-twice-to-confirm pattern (see docs/DESIGN_SYSTEM.md for why: the
 * user explicitly asked for a real confirm affordance instead). Uses the
 * shared showConfirmDialog() component (src/utils.js), the same one used for
 * account sign-out.
 * @param {HTMLButtonElement} btn
 * @param {string} placeName - names the place in the dialog so it's clear
 *   which review is about to be removed, not a generic "delete this?" prompt.
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
 * explains why, rather than making the user wait on the network round-trip
 * to see anything happen at all.
 * @param {HTMLButtonElement} btn
 * @returns {Promise<void>}
 */
async function _performDelete(btn) {
  const placeId = btn.dataset.placeId;
  const row = btn.closest(".acc-review-row");
  const list = document.getElementById("menu-my-reviews");
  const nextSibling = row?.nextElementSibling || null;

  row?.remove();
  let emptyPlaceholder = null;
  if (list && !list.querySelector(".acc-review-row")) {
    emptyPlaceholder = document.createElement("p");
    emptyPlaceholder.className = "menu-placeholder";
    emptyPlaceholder.textContent = "You haven't written any reviews yet.";
    list.appendChild(emptyPlaceholder);
  }

  const result = await _reviewsMod.deleteReview(placeId);
  if (!result.success) {
    // Roll back the optimistic removal exactly where it was.
    emptyPlaceholder?.remove();
    if (row && list) list.insertBefore(row, nextSibling);
    // Surface *why* nothing happened — previously this failed silently,
    // which was indistinguishable from the button just not working at all
    // (see the review-delete root-cause writeup in docs/PREFERENCE_LOG.md).
    showToast("Couldn't delete review", "error", "Please try again");
  }
}

// ─── Preferences section ─────────────────────────────────────────────────────

/**
 * Lazy-load prayer.js (dynamic import — by the time this runs, app.js's own
 * post-map-load Promise.all has almost certainly already imported and
 * initialized it, so this just resolves to the cached module namespace
 * rather than forcing a second, earlier load of a module that's deliberately
 * lazy) and wire up the Preferences section's two prayer dropdowns plus the
 * reduce-motion switch. Call once, after map load (same convention as
 * initMenuAccount()) — see src/app.js.
 * @returns {Promise<void>}
 */
export async function initMenuPreferences() {
  _prayerMod = await import("./prayer.js");
  _populatePrayerMethodOptions();
  _restorePreferenceControls();
  _wirePreferencesControls();
}

function _populatePrayerMethodOptions() {
  const select = document.getElementById("pref-prayer-method");
  if (!select) return;
  select.innerHTML = _prayerMod.PRAYER_METHODS.map(
    (m) => `<option value="${esc(m.id)}">${esc(m.label)}</option>`,
  ).join("");
}

function _restorePreferenceControls() {
  const methodSelect = document.getElementById("pref-prayer-method");
  const schoolSelect = document.getElementById("pref-prayer-school");
  if (methodSelect) methodSelect.value = _prayerMod.getPrayerMethod();
  if (schoolSelect) schoolSelect.value = _prayerMod.getPrayerSchool();

  const timeFormatToggle = document.getElementById("pref-time-format-toggle");
  if (timeFormatToggle) _setSwitchState(timeFormatToggle, _prayerMod.getPrayerTimeFormat() === "12");

  const motionToggle = document.getElementById("pref-reduce-motion-toggle");
  if (motionToggle) _setSwitchState(motionToggle, isReduceMotionActive());
}

function _wirePreferencesControls() {
  const methodSelect = document.getElementById("pref-prayer-method");
  const schoolSelect = document.getElementById("pref-prayer-school");
  const timeFormatToggle = document.getElementById("pref-time-format-toggle");
  const motionToggle = document.getElementById("pref-reduce-motion-toggle");

  methodSelect?.addEventListener("change", () => {
    _prayerMod.setPrayerMethod(methodSelect.value);
    _prayerMod.refreshPrayerTimes();
  });

  schoolSelect?.addEventListener("change", () => {
    _prayerMod.setPrayerSchool(schoolSelect.value);
    _prayerMod.refreshPrayerTimes();
  });

  timeFormatToggle?.addEventListener("click", () => {
    const next = _prayerMod.getPrayerTimeFormat() !== "12";
    _prayerMod.setPrayerTimeFormat(next ? "12" : "24");
    _prayerMod.refreshPrayerTimeDisplay();
    _setSwitchState(timeFormatToggle, next);
  });

  motionToggle?.addEventListener("click", () => {
    const next = !isReduceMotionActive();
    setReduceMotionOverride(next);
    _setSwitchState(motionToggle, next);
  });
}

/**
 * Reflect an on/off state onto a `.pref-switch` toggle button.
 * @param {HTMLButtonElement} btn
 * @param {boolean} on
 * @returns {void}
 */
function _setSwitchState(btn, on) {
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-checked", String(on));
}

/** Small local relative-time formatter, mirrors reviews.js's private one. */
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
