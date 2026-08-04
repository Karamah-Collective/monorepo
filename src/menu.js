/**
 * Menu/Profile sheet — Account / Map View / Support / Preferences, plus the
 * signed-in user's own Profile page.
 *
 * ONE physical .sheet element (#menu-sheet) with two internal panes,
 * #menu-sheet-body ("Menu") and #profile-sheet-body ("Profile"), riding
 * side-by-side inside #mp-pane-track. This file owns the sheet's entire
 * lifecycle — the only initSheetDrag() instance, the only open()/close(),
 * the shared header (title + close/back button) — and is the "shell";
 * src/profile.js owns only the Profile pane's own content and behavior
 * (identity card, contribution stats, submissions, reviews, erase/export),
 * exposing a single loadProfileContent() for this file to call whenever the
 * Profile pane becomes active.
 *
 * This replaces an earlier two-sheet design (#menu-sheet and #profile-sheet
 * as independent .sheet elements, coordinated via a since-removed
 * swapSheetsHorizontally() helper in src/utils.js) that still visibly
 * "wobbled" on navigation: each sheet auto-sized to ITS OWN content height,
 * and Profile is far taller than Menu, so even a perfectly-synced slide
 * transition had a height reflow happening underneath it. Merging into one
 * sheet with two panes fixed the wobble but (2nd iteration, superseded)
 * relied on flexbox's default `align-items: stretch` to force both panes to
 * share the TALLER pane's height — which eliminated the reflow only by
 * permanently freezing at the worst-case height, leaving a block of dead
 * white space below whichever pane was actually shorter (user-reported).
 * The current (3rd) iteration instead lets each `.mp-pane` size to its own
 * real content (`align-items: flex-start`) and explicitly, smoothly animates
 * `#mp-scroll`'s own height to match ONLY the currently-active pane on every
 * switch — see `_syncPaneHeight()` below, and the CSS comment on
 * `.mp-pane-track`/`#mp-scroll` in styles.css for the full mechanics writeup.
 * See docs/DESIGN_SYSTEM.md's "Menu/Profile merged sheet" entry and
 * docs/PREFERENCE_LOG.md for the complete history across all three rounds.
 *
 * The Map View section reuses #style-panel verbatim (still wired by
 * map-controls.js); the Support section's Contact/Wishlist buttons keep
 * their original #contact-pill/#wish-pill ids so contact.js/wishlist.js
 * need no changes at all — only their DOM location moved.
 *
 * The Account section (docs/ACCOUNTS_AND_REDESIGN_PLAN.md Phase 5/7, later
 * restructured into a dedicated page by the contribution-profile plan's
 * Phase 4) renders a sign-in prompt (Google/Microsoft popup or email magic
 * link) when signed out, or a compact "Profile →" row (avatar + name, tap to
 * slide to the Profile pane) when signed in — the full identity card,
 * contribution stats, "Your reviews"/"Your submitted places"/"Your
 * submitted edits", and the erase/export actions all live in profile.js's
 * pane content, not here. auth.js/account-sync.js are dynamically imported
 * from initMenuAccount() (called after map load, alongside this app's other
 * non-critical post-load modules) so the heavy Firebase CDN modules they
 * pull in stay lazy rather than loading on every page view.
 *
 * The Preferences section holds a prayer-calculation-method dropdown, an Asr
 * madhab dropdown (both persisted in localStorage and read by prayer.js's
 * fetch), and a reduce-motion switch (an explicit override on top of the
 * OS-level `prefers-reduced-motion` media feature — see utils.js's
 * isReduceMotionActive()/setReduceMotionOverride()). Wired from
 * initMenuPreferences(), dynamically importing prayer.js the same lazy way
 * initMenuAccount() imports auth.js/reviews.js.
 */
import { initSheetDrag, esc, escA, isReduceMotionActive, setReduceMotionOverride, animateElementHeight, showWelcomeGreeting } from "./utils.js";
import { EVT } from "./events.js";
import { loadProfileContent } from "./profile.js";
import { EMAIL_SIGNIN_BTN_HTML, GOOGLE_SIGNIN_BTN_HTML, MICROSOFT_SIGNIN_BTN_HTML } from "./icons.js";

const menuSheet = document.getElementById("menu-sheet");
const menuScrim = document.getElementById("scrim");
const sheetTitleEl = document.getElementById("mp-sheet-title");
const sheetCloseBtn = document.getElementById("mp-sheet-close");
const heightWrapEl = document.getElementById("mp-height-wrap");
const paneTrack = document.getElementById("mp-pane-track");
const menuPaneEl = document.getElementById("menu-sheet-body");
const profilePaneEl = document.getElementById("profile-sheet-body");
const accountBody = document.getElementById("menu-account-body");

// Header icon markup for the two pane states — same shapes this app already
// used for #menu-close (X) and src/profile.js's old #profile-sheet-close
// back-arrow, just centralized here now that one physical button serves
// both roles depending on which pane is active.
const _CLOSE_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>`;
const _BACK_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>`;

// Pane-switch height sync (see _syncPaneHeight()) reuses .mp-pane-track's own
// slide duration/easing so the resize and the slide read as one motion — not
// a separate --t-* token, matching how the CSS side of this already
// hardcodes 0.32s var(--ease-expo) rather than a bundled token (see
// styles.css's comment on .mp-pane-track/#mp-scroll).
const RESIZE_RESYNC_DEBOUNCE_MS = 120; // window-resize re-sync debounce (viewport rotation/reflow while sheet is open)

let _activePane = "menu"; // "menu" | "profile" — which pane is currently slid into view
let _auth = null; // lazily-loaded src/auth.js module namespace
let _account = null;
let _prayerMod = null; // lazily-loaded src/prayer.js module namespace (Preferences section)
let _resizeResyncTimer = null; // debounce handle for the window-resize re-sync below

/**
 * Open the merged sheet. Always resets to the Menu pane first (instantly,
 * no slide animation — the sheet isn't visible yet at this point) so
 * reopening after a full close reliably lands back on Menu, never wherever
 * Profile was left showing. `hidden` is cleared BEFORE `_setActivePane()`
 * runs (not after, as an earlier round had it) — `_setActivePane()` needs a
 * real, laid-out `#menu-sheet-body` to measure `offsetHeight` off of, which
 * a `display: none` (`[hidden]`) ancestor would report as 0 for. The sheet
 * is still fully invisible at this point regardless of the `hidden`
 * attribute's state (`.sheet.shut` sets `visibility: hidden`/`opacity: 0`),
 * so there is no flash of the wrong pane either way — `visibility: hidden`
 * (unlike `display: none`) still participates in layout, so this reorder
 * only affects what's measurable, never what's painted.
 * @returns {boolean} true if the sheet was closed and is now opening (a CSS
 *   transition just started); false if it was already open.
 */
export function openMenuSheet() {
  const wasShut = menuSheet.classList.contains("shut");
  menuSheet.hidden = false;
  _setActivePane("menu", { instant: true });
  menuScrim.classList.remove("hide");
  menuSnap.open();
  return wasShut;
}

/**
 * Close the merged sheet.
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
// One button, two roles depending on _activePane — see _updateHeaderForPane().
// Drag-to-dismiss and the scrim (wired generically by initSheetDrag()/the
// scrim's own click handler elsewhere) always close the WHOLE sheet
// regardless of pane; only this button's behavior branches on pane.
sheetCloseBtn.addEventListener("click", () => {
  if (_activePane === "profile") _goToMenuPane();
  else closeMenuSheet();
});

// ─── Pane navigation ──────────────────────────────────────────────────────

/**
 * Slide #mp-pane-track to show the given pane, update the shared header to
 * match, and smoothly resize #mp-scroll to that pane's own natural content
 * height (see _syncPaneHeight()) in the same synchronous call — the slide
 * (a CSS transition on #mp-pane-track's transform) and the height tween (a
 * CSS transition on #mp-scroll's height, driven by animateElementHeight())
 * are two independent transitions on two different elements, both triggered
 * from this one function so they start on the same frame and share the same
 * 0.32s var(--ease-expo) timing — see the CSS comment on
 * .mp-pane-track/#mp-scroll in styles.css for why they're deliberately kept
 * on separate elements rather than one.
 * @param {"menu"|"profile"} pane
 * @param {{instant?: boolean}} [opts] - instant: true skips both the slide
 *   and the height-tween animation (used when opening the sheet fresh, since
 *   nothing is visible yet to animate) — the pane still switches and
 *   #mp-scroll's height is still corrected, just with no transition.
 * @returns {void}
 */
function _setActivePane(pane, { instant = false } = {}) {
  const targetPaneEl = pane === "profile" ? profilePaneEl : menuPaneEl;

  const applySwitch = () => {
    paneTrack.classList.toggle("mp-pane-track--profile", pane === "profile");
    menuPaneEl.inert = pane !== "menu";
    menuPaneEl.setAttribute("aria-hidden", String(pane !== "menu"));
    profilePaneEl.inert = pane !== "profile";
    profilePaneEl.setAttribute("aria-hidden", String(pane !== "profile"));
  };

  if (instant) {
    // Reset the slide with no transition — nothing is visible yet to
    // animate (see openMenuSheet()'s doc comment on why `hidden` is cleared
    // before this runs regardless).
    paneTrack.style.transition = "none";
    applySwitch();
    void paneTrack.offsetHeight; // commit the jump with no transition
    paneTrack.style.transition = "";
    _syncPaneHeight(targetPaneEl, () => {}, { skip: true });
  } else {
    _syncPaneHeight(targetPaneEl, applySwitch);
  }

  _activePane = pane;
  _updateHeaderForPane(pane);
  // Refresh initSheetDrag's drag-snap cap for the pane that's now showing —
  // switching panes changes what #mp-scroll's real content height is now
  // that it tracks only the active pane (round 2's shared-tallest-height
  // approach never needed this, since the cap never changed on a pane
  // switch). Safe to call synchronously right here: _syncPaneHeight() above
  // has already committed #mp-scroll's target height as a real (if not yet
  // painted) style value, and softRemeasure()'s own forced reflow reads
  // exactly that committed value, not a stale one — no race, since nothing
  // has painted between the two calls.
  menuSnap.softRemeasure();
}

/**
 * Smoothly resize #mp-height-wrap to match `paneEl`'s own true natural
 * content height — the "actual fix" for round 2's dead-space bug (see the
 * file-level doc comment above and styles.css's writeup on
 * .mp-height-wrap/.mp-pane-track/#mp-scroll).
 *
 * Targets the dedicated #mp-height-wrap element, NOT #mp-scroll (round 3's
 * mistake) and NOT #mp-pane-track directly (round 4's FIRST attempt at this
 * fix, also wrong — see docs/PREFERENCE_LOG.md for the full history):
 * - Round 3 animated #mp-scroll's own height and pinned #mp-pane-track to
 *   exactly 100% of it — the two heights could never differ, so
 *   #mp-scroll.scrollHeight always equalled its own clientHeight, leaving
 *   nothing for overflow-y: auto to ever scroll (Menu/Profile became
 *   unscrollable on phone).
 * - Fixing that by moving the height target onto #mp-pane-track directly
 *   introduced a NEW bug: animateElementHeight() briefly sets
 *   `element.style.transition = "none"` on whatever element it's given —
 *   on #mp-pane-track that also cancelled its own transform transition (the
 *   slide), so pane switches stopped sliding and just snapped instantly.
 * - #mp-height-wrap exists specifically so the height animation and the
 *   transform/slide animation are never the same element's problem: this
 *   function's target (#mp-height-wrap) carries ONLY the height
 *   transition; #mp-pane-track carries ONLY the transform transition and
 *   mirrors #mp-height-wrap's height via a safe `100%` (safe now because
 *   #mp-height-wrap's own height is independently JS-set and CAN exceed
 *   #mp-scroll's actual rendered size, unlike round 3's #mp-scroll target).
 *
 * Thin wrapper around utils.js's animateElementHeight(), passing a
 * `measureHeight` override rather than relying on its default "set
 * height:auto, remeasure" trick — that trick would still read
 * #mp-pane-track's own natural/auto height, which (both panes being
 * permanently mounted, see styles.css) is STILL the taller sibling's height
 * regardless of which one is active; only `paneEl.offsetHeight` directly is
 * accurate, since `.mp-pane-track`'s `align-items: flex-start` (styles.css)
 * means each `.mp-pane` always reports its own real content height,
 * independent of its sibling.
 * @param {HTMLElement} paneEl - the pane #mp-height-wrap's height should now match.
 * @param {() => void} [changeFn] - DOM mutation to run in lockstep with the
 *   height tween (typically the pane-track slide + inert/aria-hidden
 *   toggle). Omit when only re-measuring already-changed content (e.g. after
 *   Profile's async content finishes loading — see _goToProfilePane()).
 * @param {{skip?: boolean}} [opts] - skip: true applies the new height
 *   instantly with no transition (used for the sheet's fresh-open case, and
 *   automatically also applied whenever reduce-motion is active — see
 *   animateElementHeight()'s own isReduceMotionActive() check).
 * @returns {void}
 */
function _syncPaneHeight(paneEl, changeFn = () => {}, { skip = false } = {}) {
  animateElementHeight(heightWrapEl, changeFn, {
    skip,
    measureHeight: () => paneEl.offsetHeight,
    keepExplicitHeight: true,
  });
}

/**
 * Menu → title "Menu", real close (X). Profile → title "Profile", a
 * back-arrow that returns to the Menu pane instead of closing the sheet —
 * the same "back, not close" convention as src/places.js's
 * _setPlaceSheetCloseAsBack().
 * @param {"menu"|"profile"} pane
 * @returns {void}
 */
function _updateHeaderForPane(pane) {
  if (pane === "profile") {
    sheetTitleEl.textContent = "Profile";
    sheetCloseBtn.innerHTML = _BACK_ICON_SVG;
    sheetCloseBtn.setAttribute("aria-label", "Back to menu");
    sheetCloseBtn.classList.add("mp-sheet-close--back");
  } else {
    sheetTitleEl.textContent = "Menu";
    sheetCloseBtn.innerHTML = _CLOSE_ICON_SVG;
    sheetCloseBtn.setAttribute("aria-label", "Close");
    sheetCloseBtn.classList.remove("mp-sheet-close--back");
  }
}

/**
 * Navigate Menu → Profile: slide to the Profile pane (which also tweens
 * #mp-scroll to Profile's current — likely still-"Loading…"-placeholder —
 * height, see _setActivePane()), then (re)load its real content — every
 * time, not just on first visit, so a submission that flipped from pending
 * to live/rejected since the last visit is caught (see profile.js's
 * loadProfileContent() doc comment).
 *
 * loadProfileContent() typically swaps in real, often taller, content —
 * without a second height sync here, #mp-pane-track's `overflow: hidden`
 * (styles.css) would clip that new content at the old, shorter, placeholder
 * height forever, since #mp-scroll's pinned height only changes when
 * something explicitly asks it to. Guarded by `_activePane === "profile"`:
 * if the user has already navigated back to Menu by the time this async
 * load resolves, resizing #mp-scroll now would incorrectly resize the
 * currently-VISIBLE Menu pane based on Profile's unrelated content — the
 * next time the user actually navigates back to Profile, _setActivePane()
 * will measure its by-then-already-loaded real height correctly on its own,
 * so skipping the resize here loses nothing. softRemeasure() still runs
 * unconditionally afterward — it only updates initSheetDrag()'s drag-snap
 * cap based on whatever #mp-scroll's height actually currently is, which is
 * already correct either way.
 * @returns {Promise<void>}
 */
async function _goToProfilePane() {
  _setActivePane("profile");
  await loadProfileContent();
  if (_activePane === "profile") _syncPaneHeight(profilePaneEl);
  menuSnap.softRemeasure();
}

/**
 * Navigate Profile → Menu (the shared header's back-arrow).
 * @returns {void}
 */
function _goToMenuPane() {
  _setActivePane("menu");
}

// Window resize (viewport rotation, desktop window resize, or a font/zoom
// change) can change a pane's natural content height without any pane switch
// happening — #mp-scroll's pinned height (see _syncPaneHeight()) doesn't
// recompute on its own the way a plain `height: auto` element would, so
// without this it could go stale until the next pane switch. Applied
// instantly (no transition) since a resize snap should feel immediate, not
// animated, and only while the sheet is actually open.
window.addEventListener("resize", () => {
  if (menuSheet.classList.contains("shut")) return;
  clearTimeout(_resizeResyncTimer);
  _resizeResyncTimer = setTimeout(() => {
    if (menuSheet.classList.contains("shut")) return;
    const activePaneEl = _activePane === "profile" ? profilePaneEl : menuPaneEl;
    _syncPaneHeight(activePaneEl, () => {}, { skip: true });
    menuSnap.softRemeasure();
  }, RESIZE_RESYNC_DEBOUNCE_MS);
}, { passive: true });

// ─── Account section ─────────────────────────────────────────────────────────

/**
 * Lazy-load auth.js/account-sync.js and wire up the Account section. Call
 * once, after map load (same lazy-load-after-map-load convention as
 * contact.js/prayer.js/etc — see src/app.js).
 * @returns {Promise<void>}
 */
export async function initMenuAccount() {
  const [auth, { initAccountSync }] = await Promise.all([
    import("./auth.js"),
    import("./account-sync.js"),
  ]);
  _auth = auth;

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
  // initMenuAccount()'s own async work (the dynamic imports + initAuth()
  // above) can easily still be in flight the very first time a user opens
  // the Menu sheet right after page load — #menu-account-body was measured
  // back at _setActivePane()'s initial "instant" sync while it still showed
  // just the "Loading…" placeholder, so #mp-height-wrap ended up pinned to
  // that placeholder's much shorter height. Without a resync here, the sheet
  // stayed stuck at that first-open height forever (reported bug: opens to
  // ~25% height the first time, correct only after closing and reopening,
  // by which point this async work has long since finished). Same
  // _activePane guard as _goToProfilePane()'s own post-async resync — only
  // matters if the user hasn't already navigated to the Profile pane by the
  // time this resolves.
  if (_activePane === "menu") { _syncPaneHeight(menuPaneEl); menuSnap.softRemeasure(); }
  // Only the just-completed-a-magic-link case gets a toast here — a restored
  // already-signed-in session (the far more common case, on every normal page
  // load) stays silent, matching this feature's "purely additive, invisible"
  // background-sync design. The interactive Google/Microsoft popup paths show
  // their own toast right in _wireSignedOutView() instead, since those are a
  // direct user action with their own immediate success/failure branch.
  if (magicLinkResult.completed && _account) {
    showWelcomeGreeting(magicLinkResult.account, magicLinkResult.isNewUser);
  }

  window.addEventListener(EVT.AUTH_CHANGED, (e) => {
    _account = e.detail?.account || null;
    _renderAccountSection();
    // Signing in/out changes the Account section's own height (sign-in
    // buttons vs. a signed-in profile row) — same resync this file's own
    // initMenuAccount() already does after ITS async render, for the exact
    // same reason.
    if (_activePane === "menu") { _syncPaneHeight(menuPaneEl); menuSnap.softRemeasure(); }
    // Profile only ever shows signed-in content; if the account just signed
    // out while its pane was the one on screen, there's nothing left to
    // show — mirrors this sheet's pre-merge behavior (src/profile.js used to
    // close itself here), just centralized where the merged sheet's
    // lifecycle actually lives now.
    if (!_account && _activePane === "profile" && !menuSheet.classList.contains("shut")) {
      closeMenuSheet();
    }
  });
  window.addEventListener(EVT.SAVED_SYNCED, () => {
    // Cross-device sync doesn't change the Account section's own content,
    // but re-rendering is cheap and keeps this future-proof if it ever does.
  });
  // src/profile.js dispatches this when IT needs the whole merged sheet
  // closed (e.g. navigating away to view a place, or right after "Erase my
  // data") — event-based rather than profile.js importing closeMenuSheet
  // directly, to avoid a circular import (this file already statically
  // imports loadProfileContent from profile.js — see EVT.ACCOUNT_SHEET_CLOSE
  // in events.js).
  window.addEventListener(EVT.ACCOUNT_SHEET_CLOSE, () => closeMenuSheet());
  // Same "first-open height stuck at the pre-render measurement" bug as the
  // AUTH_CHANGED/initMenuAccount() resyncs above, just for Profile's own
  // identity card instead of Menu's Account section — see
  // EVT.PROFILE_CARD_RENDERED's doc comment in events.js for the full
  // mechanism (reported: "Your data" cropped only while Profile is still
  // loading, self-correcting once the fetch finishes).
  window.addEventListener(EVT.PROFILE_CARD_RENDERED, () => {
    if (_activePane === "profile") { _syncPaneHeight(profilePaneEl); menuSnap.softRemeasure(); }
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

// Trailing chevron on the compact "Profile →" row — signals "navigates to
// another page", matching this app's existing rightward-navigation affordance
// shape (no prior "go to sub-page" row existed in Menu to alias onto, so this
// is a new, minimal icon rather than a repurposed one).
const _PROFILE_CHEVRON_SVG = `<svg class="menu-profile-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;

function _buildSignedInHTML(account) {
  const label = account.displayName || account.email || "Signed in";
  const initial = (account.displayName || account.email || "?").trim().charAt(0).toUpperCase();
  // Google supplies photoURL automatically; Microsoft sign-in never does
  // (see the note on _cacheAccount() in src/auth.js) — falls back to the
  // initial-letter avatar for Microsoft and magic-link accounts alike.
  const avatarHTML = account.photoURL
    ? `<img class="menu-account-avatar" src="${escA(account.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="menu-account-avatar">${esc(initial)}</div>`;
  // The full identity card, contribution stats, "Your reviews"/submitted
  // places/edits, and erase/export actions all live in the Profile pane
  // (src/profile.js) now — this row is just the doorway to it.
  return `<div class="menu-account-panel">
    <button id="menu-profile-link" class="menu-account-profile menu-profile-link" type="button">
      ${avatarHTML}
      <div class="menu-account-info">
        <span class="menu-account-name">${esc(label)}</span>
      </div>
      ${_PROFILE_CHEVRON_SVG}
    </button>
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
      showWelcomeGreeting(result.account, result.isNewUser);
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
      showWelcomeGreeting(result.account, result.isNewUser);
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
  // Tap the whole row: navigates to the Profile pane via a slide, not a
  // sheet close/open (see _goToProfilePane() above).
  document.getElementById("menu-profile-link").addEventListener("click", () => {
    _goToProfilePane();
  });
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
