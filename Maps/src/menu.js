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
import { initSheetDrag, esc, escA, isReduceMotionActive, setReduceMotionOverride, animateElementHeight, crossFadeSwap, showWelcomeGreeting, emailPasswordErrorMessage, oauthSignInErrorToast, showLinkedProviderToast, showToast } from "./utils.js";
import { EVT } from "./events.js";
import { setActiveTab } from "./map-controls.js";
import { loadProfileContent } from "./profile.js";
import { EMAIL_SIGNIN_BTN_HTML, GOOGLE_SIGNIN_BTN_HTML, MICROSOFT_SIGNIN_BTN_HTML, FACEBOOK_SIGNIN_BTN_HTML, APPLE_SIGNIN_BTN_HTML, EMAIL_PASSWORD_SIGNIN_BTN_HTML, EYE_SHOW_ICON_SVG, EYE_HIDE_ICON_SVG, BACK_CHEVRON_ICON_SVG } from "./icons.js";

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
const PASSWORD_MIN_LENGTH = 6; // mirrors Firebase Auth's own minimum — checked client-side only for fast feedback, server-side (Firebase) is authoritative

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
  setActiveTab("menu-pill");
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
  if (document.getElementById("menu-pill")?.classList.contains("active-tab")) {
    setActiveTab(null);
  }
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
    showLinkedProviderToast(magicLinkResult.linkedProvider);
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

/**
 * Re-sync BOTH the inner `#mp-height-wrap` (via `_syncPaneHeight()`) and the
 * outer `#menu-sheet` itself (via `menuSnap.remeasure()`) to the Menu pane's
 * Account section's real, current rendered height. Never called directly any
 * more (see the `_menuAccountResizeObserver` right below this function,
 * which is what actually calls it now) — kept as its own named function
 * purely so both steps stay bundled under one clearly-documented name.
 *
 * `_animateMenuPanelHeight()` only tweens `.menu-account-panel`'s OWN height
 * (a descendant, several levels below `#mp-height-wrap`); it never touches
 * `#mp-height-wrap` (JS-pinned by `_syncPaneHeight()`, mirrored 1:1 by
 * `#mp-pane-track`'s `height: 100%` + `overflow: hidden` — see styles.css)
 * or `#menu-sheet`'s own snap height (owned by `menuSnap`/`initSheetDrag()`
 * in utils.js). Left alone, `#mp-height-wrap` stays pinned at whatever
 * height it was last explicitly set to — so once the email/password panel's
 * own growth un-clips past that stale, smaller cap (`#mp-pane-track`'s
 * `overflow: hidden` swallows the excess) or, on collapse, shrinks back down
 * while `#mp-height-wrap`/`#menu-sheet` stay pinned at the earlier (larger)
 * height, the sheet is left oversized with dead space below the now-shorter
 * content — the reported bug.
 *
 * **Root cause of why a PRIOR fix attempt (calling this synchronously,
 * immediately after `_animateMenuPanelHeight()` returned, from every
 * toggle/back-link handler) did not actually work, confirmed live by the
 * user despite that fix's confident reasoning:** that reasoning claimed a
 * synchronous `offsetHeight`/`scrollHeight` read, taken right after setting
 * a new inline `height` on a transitioning element, always reflects the new
 * FINAL target rather than a mid-transition value — and generalized this
 * from `animateElementHeight()`'s OWN internal measurements, which
 * genuinely are always safe this way. But look closer at HOW
 * `animateElementHeight()` gets away with that: every one of its own
 * `offsetHeight` reads happens while the element's `transition` is
 * explicitly `"none"` (disabled) — it disables the transition, measures,
 * THEN re-enables the transition and sets the final value, and never reads
 * that element's geometry again afterward. `_syncPaneHeight(menuPaneEl)`
 * does something categorically different: it reads `menuPaneEl.offsetHeight`
 * — an ANCESTOR of `.menu-account-panel` — in the very same script tick
 * `.menu-account-panel`'s OWN height transition was just re-enabled AND
 * retargeted by the PRECEDING `_animateMenuPanelHeight()` call. At that
 * instant zero real time has elapsed on that transition's timeline and no
 * rendering frame has been produced for the new target yet, so a forced,
 * synchronous reflow of an ancestor whose size depends on that
 * just-(re)started transition does not reliably report the transition's END
 * value — unlike reading the SAME element with its OWN transition
 * temporarily disabled, this is reading a DIFFERENT element THROUGH an
 * already-active transition on a descendant, which is exactly the
 * genuinely-ambiguous case the previous round's reasoning quietly assumed
 * away. That's the actual, confirmed-by-rereading gap, and it explains the
 * live symptom precisely: the resync ran once, synchronously, captured a
 * still-essentially-unchanged (stale) height, and nothing ever corrected it
 * afterward once the panel's OWN transition had genuinely finished settling.
 *
 * **The actual fix, assumption-free regardless of any CSS-transition-timing
 * subtlety:** stop trying to measure through a just-triggered transition at
 * all. A `ResizeObserver` only ever invokes its callback once the browser
 * has ACTUALLY computed a real layout for a real, current rendering
 * opportunity — whether that reflects an instant, non-transitioned change
 * (reduce motion) or one genuine frame of an in-progress CSS transition.
 * Re-running this exact same `_syncPaneHeight()` + `menuSnap.remeasure()`
 * pair from a ResizeObserver callback needs no theory about WHEN a
 * synchronous read is safe, because every read it does happens strictly
 * after a real layout pass — always correct for that frame. And since
 * ResizeObserver keeps firing for every subsequent frame
 * `.menu-account-panel`'s own height is still actively changing,
 * `#mp-height-wrap` (and, via `menuSnap.remeasure()`, `#menu-sheet` itself on
 * mobile — on desktop `#menu-sheet` uses `fit-content` and needs no JS
 * resize at all once `#mp-height-wrap` is correct, see `initSheetDrag()`)
 * continuously, smoothly chases the real value in lockstep with the panel's
 * own animation, all the way to settlement, instead of committing to one
 * unreliable guess at t=0 and never revisiting it.
 * @returns {void}
 */
function _resyncMenuSheetHeight() {
  if (_activePane !== "menu") return;
  _syncPaneHeight(menuPaneEl);
  menuSnap.remeasure();
}

/**
 * Fires `_resyncMenuSheetHeight()` any time the Account section's own
 * rendered size genuinely changes, for ANY reason (email/password panel
 * toggle open/closed, the toggle's "check your email" content swap,
 * sign-in/out re-render, the async post-load resync, ...) — see
 * `_resyncMenuSheetHeight()`'s own doc comment just above for why this
 * replaces the previous approach of manually calling it, synchronously,
 * right after each individual DOM change (that approach read stale,
 * pre-transition heights and left the sheet oversized). Observes
 * `#menu-account-body`, not `.menu-account-panel` — `#menu-account-body` is
 * a stable node across every `_renderAccountSection()` re-render (only its
 * `innerHTML` is ever replaced, the node itself never is), so this only
 * needs to be set up once, at module load, rather than re-observing a fresh
 * element after every render. Guarded against the sheet being closed/hidden
 * — while closed, `menuPaneEl.offsetHeight` would read 0 (a `[hidden]`
 * ancestor has no box at all), which would otherwise incorrectly pin
 * `#mp-height-wrap` to 0 the moment the sheet re-opens and this fires again.
 */
const _menuAccountResizeObserver = new ResizeObserver(() => {
  if (menuSheet.hidden || menuSheet.classList.contains("shut")) return;
  _resyncMenuSheetHeight();
});
_menuAccountResizeObserver.observe(accountBody);

function _buildSignedOutHTML() {
  // Google, Microsoft, Facebook, Apple, and email are five equal-weight peer
  // sign-in options in one row/grid — none should read as the primary choice
  // over any other. All share .rv-action-btn (44px height); the 3-column
  // grid layout (2026-08-05, later round — was 2-column) that puts however
  // many of these five are actually visible (currently 3: Google, Microsoft,
  // the un-hidden email option) into a single row lives in
  // .menu-account-signin-row (styles.css). Each
  // OAuth provider keeps its full logo + "Continue with X" label (each
  // brand's own guidelines require both together for recognizability, and
  // the exact text can't be abbreviated — see .btn-google in
  // docs/DESIGN_SYSTEM.md). The email option is "Continue with email" —
  // deliberately mirroring the OAuth buttons' own phrasing so all five read
  // as parallel, equally-weighted actions rather than one being the "real"
  // option and the others secondary afterthoughts. Its border/text color are
  // overridden (styles.css) to this app's higher-contrast neutral tokens
  // (--text-2 border, --text label) instead of .btn-secondary's default
  // subtle look. Also carries its own envelope icon (EMAIL_SIGNIN_BTN_HTML)
  // so it still matches the OAuth buttons' icon+label structure — an earlier
  // icon-only-for-email version read as a different app's button sitting
  // beside the others. This is now a second, deliberate exception to the
  // Button content rule (see .btn-google in docs/DESIGN_SYSTEM.md for the
  // first) for the same reason: peer sign-in options need to visually match
  // each other more than any one needs to match this app's default
  // plain-text-button convention.
  // menu-password-signin-toggle/-panel (added 2026-08-05) is a SEPARATE
  // traditional email + password mechanism from the magic-link toggle/panel
  // right above it — the magic-link one stays fully intact but hidden (see
  // the "Temporarily hidden (2026-08-02)" CSS comment); this new one is what
  // actually renders in that row right now (its own .btn-password class is
  // NOT caught by that hide rule — see styles.css). One button handles both
  // first-time signup and returning sign-in via an explicit mode toggle link
  // (see _wireSignedOutView()) rather than silently guessing from the error
  // code, since auth/invalid-credential alone can't reliably distinguish
  // "no such account" from "wrong password" across Firebase SDK versions.
  // menu-email-signin-back / menu-password-signin-back (added this round):
  // each expanded panel's own "Back to sign-in options" link — clicking it
  // re-collapses the panel and restores menu-account-signin-row, the
  // opposite of what the row's own toggle button (now hidden, along with
  // every other row button, while its panel is open) just did. See
  // _wireSignedOutView()/_wirePasswordSignIn() for the collapse/restore
  // wiring, and .rv-back-link in styles.css for why this is a distinct
  // template from .rv-resend-link right below it in each panel.
  return `<div class="menu-account-panel">
    <div id="menu-account-signin-row" class="menu-account-signin-row">
      <button id="menu-google-signin" class="rv-action-btn btn-google" type="button" aria-label="Continue with Google" title="Google">${GOOGLE_SIGNIN_BTN_HTML}</button>
      <button id="menu-microsoft-signin" class="rv-action-btn btn-microsoft" type="button" aria-label="Continue with Microsoft" title="Microsoft">${MICROSOFT_SIGNIN_BTN_HTML}</button>
      <button id="menu-facebook-signin" class="rv-action-btn btn-facebook" type="button" aria-label="Continue with Facebook" title="Facebook">${FACEBOOK_SIGNIN_BTN_HTML}</button>
      <button id="menu-apple-signin" class="rv-action-btn btn-apple" type="button" aria-label="Continue with Apple" title="Apple">${APPLE_SIGNIN_BTN_HTML}</button>
      <button id="menu-email-signin-toggle" class="rv-action-btn btn-secondary" type="button" aria-label="Continue with email link" title="Email link">${EMAIL_SIGNIN_BTN_HTML}</button>
      <button id="menu-password-signin-toggle" class="rv-action-btn btn-password" type="button" aria-label="Continue with email" title="Email">${EMAIL_PASSWORD_SIGNIN_BTN_HTML}</button>
    </div>
    <div id="menu-email-signin-panel" class="rv-verify-step rv-panel-divider hide">
      <button id="menu-email-signin-back" class="rv-back-link" type="button">${BACK_CHEVRON_ICON_SVG}Back to sign-in options</button>
      <div class="rv-field">
        <label class="rv-field-label" for="menu-email-input">Email address</label>
        <input id="menu-email-input" class="rv-input" type="email" placeholder="you@example.com" maxlength="254" autocomplete="email" />
      </div>
      <button id="menu-email-send" class="rv-action-btn btn-primary" type="button">Send sign-in link</button>
      <p id="menu-email-error" class="rv-verify-error hide"></p>
    </div>
    <div id="menu-password-signin-panel" class="rv-verify-step rv-panel-divider hide">
      <button id="menu-password-signin-back" class="rv-back-link" type="button">${BACK_CHEVRON_ICON_SVG}Back to sign-in options</button>
      <div id="menu-password-name-field" class="rv-field hide">
        <label class="rv-field-label" for="menu-password-name-input">Full name</label>
        <input id="menu-password-name-input" class="rv-input" type="text" placeholder="Your name" maxlength="100" autocomplete="name" />
      </div>
      <div class="rv-field">
        <label class="rv-field-label" for="menu-password-email-input">Email address</label>
        <input id="menu-password-email-input" class="rv-input" type="email" placeholder="you@example.com" maxlength="254" autocomplete="email" />
      </div>
      <div class="rv-field">
        <label class="rv-field-label" for="menu-password-input">Password</label>
        <div class="rv-field-input-wrap">
          <input id="menu-password-input" class="rv-input" type="password" placeholder="••••••••" maxlength="128" autocomplete="current-password" />
          <button id="menu-password-toggle-visibility" class="clear-btn rv-field-input-btn" type="button" aria-label="Show password">${EYE_SHOW_ICON_SVG}</button>
        </div>
      </div>
      <button id="menu-password-forgot" class="rv-resend-link" type="button">Forgot password?</button>
      <button id="menu-password-submit" class="rv-action-btn btn-primary" type="button">Sign in</button>
      <button id="menu-password-mode-toggle" class="rv-resend-link" type="button">New here? Create an account</button>
      <p id="menu-password-error" class="rv-verify-error hide"></p>
    </div>
  </div>`;
}

// Trailing chevron on the compact "Profile →" row — signals "navigates to
// another page", matching this app's existing rightward-navigation affordance
// shape (no prior "go to sub-page" row existed in Menu to alias onto, so this
// is a new, minimal icon rather than a repurposed one).
const _PROFILE_CHEVRON_SVG = `<svg class="menu-profile-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;

function _accountAvatarHTML(photoURL, initial) {
  return photoURL
    ? `<span class="menu-account-avatar menu-account-avatar--photo" data-avatar-fallback="${escA(initial)}"><img src="${escA(photoURL)}" alt="" referrerpolicy="no-referrer"></span>`
    : `<div class="menu-account-avatar">${esc(initial)}</div>`;
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

function _buildSignedInHTML(account) {
  const label = account.displayName || account.email || "Signed in";
  const initial = (account.displayName || account.email || "?").trim().charAt(0).toUpperCase();
  // Google supplies photoURL automatically; Microsoft sign-in never does
  // (see the note on _cacheAccount() in src/auth.js) — falls back to the
  // initial-letter avatar for Microsoft and magic-link accounts alike.
  const avatarHTML = _accountAvatarHTML(account.photoURL, initial);
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
  const signinRow = document.getElementById("menu-account-signin-row");
  const googleBtn = document.getElementById("menu-google-signin");
  const microsoftBtn = document.getElementById("menu-microsoft-signin");
  const facebookBtn = document.getElementById("menu-facebook-signin");
  const appleBtn = document.getElementById("menu-apple-signin");
  const emailToggle = document.getElementById("menu-email-signin-toggle");
  const emailPanel = document.getElementById("menu-email-signin-panel");
  const emailBackBtn = document.getElementById("menu-email-signin-back");
  const emailInput = document.getElementById("menu-email-input");
  const sendBtn = document.getElementById("menu-email-send");
  const errorMsg = document.getElementById("menu-email-error");

  function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.remove("hide"); }
  function hideError() { errorMsg.classList.add("hide"); }
  function showProviderFailure(result, providerLabel) {
    const toast = oauthSignInErrorToast(result, providerLabel);
    if (!toast) return;
    showError(toast.inline);
    showToast(toast.title, "error", toast.sub);
  }
  function showLinkedProviderResult(result) {
    showLinkedProviderToast(result?.linkedProvider);
  }

  googleBtn.addEventListener("click", async () => {
    hideError();
    googleBtn.disabled = true;
    googleBtn.setAttribute("aria-label", "Signing in with Google");
    googleBtn.innerHTML = `<span class="btn-spinner"></span>`;
    const result = await _auth.signInWithGoogle();
    if (result.success) {
      // Same welcome-greeting convention as the reviews sign-in prompt
      // (src/reviews.js's _showSignInPrompt) — this is the primary sign-in
      // entry point, so a visible confirmation matters most here.
      showWelcomeGreeting(result.account, result.isNewUser);
      showLinkedProviderResult(result);
    } else {
      googleBtn.disabled = false;
      googleBtn.setAttribute("aria-label", "Continue with Google");
      googleBtn.innerHTML = GOOGLE_SIGNIN_BTN_HTML;
      showProviderFailure(result, "Google");
    }
    // On success, EVT.AUTH_CHANGED also fires and _renderAccountSection() re-runs.
  });

  microsoftBtn.addEventListener("click", async () => {
    hideError();
    microsoftBtn.disabled = true;
    microsoftBtn.setAttribute("aria-label", "Signing in with Microsoft");
    microsoftBtn.innerHTML = `<span class="btn-spinner"></span>`;
    const result = await _auth.signInWithMicrosoft();
    if (result.success) {
      showWelcomeGreeting(result.account, result.isNewUser);
      showLinkedProviderResult(result);
    } else {
      microsoftBtn.disabled = false;
      microsoftBtn.setAttribute("aria-label", "Continue with Microsoft");
      microsoftBtn.innerHTML = MICROSOFT_SIGNIN_BTN_HTML;
      showProviderFailure(result, "Microsoft");
    }
  });

  facebookBtn.addEventListener("click", async () => {
    hideError();
    facebookBtn.disabled = true;
    facebookBtn.setAttribute("aria-label", "Signing in with Facebook");
    facebookBtn.innerHTML = `<span class="btn-spinner"></span>`;
    const result = await _auth.signInWithFacebook();
    if (result.success) {
      showWelcomeGreeting(result.account, result.isNewUser);
      showLinkedProviderResult(result);
    } else {
      facebookBtn.disabled = false;
      facebookBtn.setAttribute("aria-label", "Continue with Facebook");
      facebookBtn.innerHTML = FACEBOOK_SIGNIN_BTN_HTML;
      // Facebook's popup-cancel surfaces through the same generic Firebase
      // Auth SDK error codes every popup-based provider uses (this isn't a
      // per-provider error — it's the SDK's own popup lifecycle handling),
      // so no extra error code is needed here beyond Google/Microsoft's.
      showProviderFailure(result, "Facebook");
    }
  });

  appleBtn.addEventListener("click", async () => {
    hideError();
    appleBtn.disabled = true;
    appleBtn.setAttribute("aria-label", "Signing in with Apple");
    appleBtn.innerHTML = `<span class="btn-spinner"></span>`;
    const result = await _auth.signInWithApple();
    if (result.success) {
      showWelcomeGreeting(result.account, result.isNewUser);
      showLinkedProviderResult(result);
    } else {
      appleBtn.disabled = false;
      appleBtn.setAttribute("aria-label", "Continue with Apple");
      appleBtn.innerHTML = APPLE_SIGNIN_BTN_HTML;
      // Same reasoning as Facebook's cancel check above — Apple's popup
      // cancel is the same generic Firebase Auth SDK code too.
      showProviderFailure(result, "Apple");
    }
  });

  // Opening the panel collapses the row of other sign-in options (Google/
  // Microsoft/Facebook/Apple/password) rather than stacking the panel below
  // them — on mobile this sheet has limited height, and the prior
  // append-below behavior made the row + panel stack eat most of it. The
  // panel's own "Back to sign-in options" link (emailBackBtn) reverses this,
  // so opening it by accident is never a dead end.
  // crossFadeSwap() (src/utils.js) cross-fades signinRow/emailPanel's own
  // opacity BEFORE the actual .hide toggling below runs — without it, .hide's
  // instant `display: none` made the row visibly pop out of existence while
  // _animateMenuPanelHeight()'s height-tween smoothly resized the panel
  // around it in the same tick. See crossFadeSwap()'s own doc comment for
  // why the fade and the height-tween are sequenced, not run concurrently.
  emailToggle.addEventListener("click", () => {
    crossFadeSwap(signinRow, emailPanel, () => {
      _animateMenuPanelHeight(() => {
        signinRow.classList.add("hide");
        emailPanel.classList.remove("hide");
      });
    });
  });

  emailBackBtn.addEventListener("click", () => {
    crossFadeSwap(emailPanel, signinRow, () => {
      _animateMenuPanelHeight(() => {
        emailPanel.classList.add("hide");
        signinRow.classList.remove("hide");
      });
    });
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

  _wirePasswordSignIn();
}

/**
 * Wire the traditional email + password panel: the toggle button that opens
 * it, the show/hide password button, the signin/signup mode-switch link, and
 * the submit button that calls either signInWithEmailPassword or
 * signUpWithEmailPassword depending on the currently-selected mode. A
 * private helper (rather than inlined in _wireSignedOutView() directly)
 * purely to keep that function's own length in check — see src/reviews.js's
 * near-identical wiring for the review-form sign-in gate's copy of this same
 * panel.
 *
 * The "Full name" field (#menu-password-name-field, added 2026-08-05, later
 * round) is the mirror case of forgotLink below: forgotLink only makes
 * sense in "signin" mode, this field only makes sense in "signup" mode
 * (mirrored via the same updateModeUI() toggle) — an existing password
 * account already has whatever name it was created with; every other
 * sign-in provider (Google/Microsoft/Facebook/Apple) supplies a displayName
 * automatically, so this is the one path that has to ask for it directly.
 * @returns {void}
 */
function _wirePasswordSignIn() {
  const signinRow = document.getElementById("menu-account-signin-row");
  const toggle = document.getElementById("menu-password-signin-toggle");
  const panel = document.getElementById("menu-password-signin-panel");
  const backBtn = document.getElementById("menu-password-signin-back");
  const nameField = document.getElementById("menu-password-name-field");
  const nameInput = document.getElementById("menu-password-name-input");
  const emailInput = document.getElementById("menu-password-email-input");
  const passwordInput = document.getElementById("menu-password-input");
  const visibilityBtn = document.getElementById("menu-password-toggle-visibility");
  const submitBtn = document.getElementById("menu-password-submit");
  const modeToggle = document.getElementById("menu-password-mode-toggle");
  const forgotLink = document.getElementById("menu-password-forgot");
  const errorMsg = document.getElementById("menu-password-error");

  let mode = "signin"; // "signin" | "signup" — see _updateModeUI() below

  function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.remove("hide"); }
  function hideError() { errorMsg.classList.add("hide"); }

  function updateModeUI() {
    submitBtn.textContent = mode === "signin" ? "Sign in" : "Create account";
    modeToggle.textContent = mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in";
    // Only relevant while signing in to an existing account — a signup has
    // no password yet to reset.
    forgotLink.classList.toggle("hide", mode !== "signin");
    // Mirror case of forgotLink above: only relevant for a brand-new
    // signup — an existing account already has a name (or not, but there's
    // nothing to re-collect on sign-in either way). Google/Microsoft/
    // Facebook/Apple all supply a displayName from the provider for free;
    // this is the one sign-in path that needs to ask for it directly (see
    // src/auth.js's signUpWithEmailPassword()).
    nameField.classList.toggle("hide", mode !== "signup");
  }

  // Same collapse-the-row-when-a-panel-opens behavior as the magic-link
  // toggle in _wireSignedOutView() above — see that handler's comment, and
  // crossFadeSwap()'s own doc comment (utils.js) for why the row's own
  // opacity fade is sequenced before, not concurrent with, the height-tween.
  toggle.addEventListener("click", () => {
    crossFadeSwap(signinRow, panel, () => {
      _animateMenuPanelHeight(() => {
        signinRow.classList.add("hide");
        panel.classList.remove("hide");
      });
    });
  });

  backBtn.addEventListener("click", () => {
    crossFadeSwap(panel, signinRow, () => {
      _animateMenuPanelHeight(() => {
        panel.classList.add("hide");
        signinRow.classList.remove("hide");
      });
    });
  });

  visibilityBtn.addEventListener("click", () => {
    const showing = passwordInput.type === "text";
    passwordInput.type = showing ? "password" : "text";
    visibilityBtn.innerHTML = showing ? EYE_SHOW_ICON_SVG : EYE_HIDE_ICON_SVG;
    visibilityBtn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  });

  modeToggle.addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    hideError();
    updateModeUI();
  });

  // Neutral outcome regardless of whether the typed email is actually
  // registered — see src/auth.js's sendPasswordReset() doc comment for why
  // this must never reveal that. Unlike the earlier pass, an empty/invalid
  // email never triggers a native window.prompt() — this panel already has
  // its own visible email input right above the password field (unlike the
  // magic-link cross-device case, which has no email field on screen at all
  // when it prompts), so staying inside this same custom-styled UI just
  // means focusing that input and showing the panel's own inline error.
  forgotLink.addEventListener("click", async () => {
    hideError();
    const email = emailInput.value.trim();
    if (!email.includes("@")) {
      emailInput.focus();
      showError("Enter your email address above first");
      return;
    }
    forgotLink.disabled = true;
    await _auth.sendPasswordReset(email);
    forgotLink.disabled = false;
    showToast("Check your email", "check", "If an account exists for that email, a reset link is on its way.");
  });

  submitBtn.addEventListener("click", async () => {
    hideError();
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (mode === "signup" && !name) { showError("Please enter your name"); nameInput.focus(); return; }
    if (!email.includes("@")) { showError("Please enter a valid email address"); return; }
    if (password.length < PASSWORD_MIN_LENGTH) { showError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`); return; }

    submitBtn.disabled = true;
    const busyLabel = mode === "signin" ? "Signing in…" : "Creating account…";
    submitBtn.innerHTML = `<span class="btn-spinner"></span> ${busyLabel}`;
    const result = mode === "signin"
      ? await _auth.signInWithEmailPassword(email, password)
      : await _auth.signUpWithEmailPassword(name, email, password);
    if (result.success) {
      showWelcomeGreeting(result.account, result.isNewUser);
      showLinkedProviderToast(result.linkedProvider);
      // On success, EVT.AUTH_CHANGED also fires and _renderAccountSection() re-runs.
    } else {
      submitBtn.disabled = false;
      updateModeUI();
      showError(emailPasswordErrorMessage(result.error, mode));
    }
  });
}

function _wireSignedInView() {
  _wireAccountAvatarFallback(document.getElementById("menu-profile-link"));

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
