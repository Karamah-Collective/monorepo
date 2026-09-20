// Register service worker for instant tile/shell caching (stale-while-revalidate).
// For localhost dev, actively unregister it so testing always hits current files
// rather than a stale cached shell from a previous run.
const _isLocalDevHost = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
if ("serviceWorker" in navigator) {
  if (_isLocalDevHost) {
    navigator.serviceWorker.getRegistrations().then((regs) =>
      Promise.all(regs.map((reg) => reg.unregister())),
    ).catch(() => {});
    if (window.caches) {
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("hf-")).map((key) => caches.delete(key))),
      ).catch(() => {});
    }
  } else {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* non-critical */ });
  }
}

import { map } from "./map-init.js";
import {
  checkGeoNotice,
  showOfflineBanner,
  hideOfflineBanner,
  showToast,
  isReduceMotionActive,
} from "./utils.js";
import {
  preloadSatelliteSource,
  centerStoredHomeIfAvailable,
  centerVisitorCityIfAvailable,
  syncHomeMarker,
} from "./map-controls.js";
import "./directions.js";
import "./navigation.js"; // registers nav hooks with directions.js
import { loadPlacesData, preloadPlacesData } from "./places.js";
import { appSettingsReady, renderAppNotice } from "./app-settings.js";
import "./search.js";
import { initMenuAccount, initMenuPreferences } from "./menu.js";
// Non-critical modules loaded lazily after map.on("load") for faster startup

const WELCOME_LOGO_URL = "/LOGO%20-%20Manarah.svg";
const WELCOME_REVEAL_SETTLE_MS = 180;
const WELCOME_OVERLAY_EXIT_MS = 420;
const SOFT_CITY_START_BUDGET_MS = 900;
const WELCOME_LOGO_TIMEOUT_MS = 2000;
const WELCOME_MIN_VISIBLE_MS = 1100;
const TUTORIAL_DELAY_MS = 800;
const _welcomeStartedAt = performance.now();

function _getWelcomeLogoPathFill(path) {
  return (path.getAttribute("fill") || path.closest("[fill]")?.getAttribute("fill") || "").trim().toLowerCase();
}

function _prepareWelcomeLogo(svg) {
  if (!svg) return null;
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("aria-label", "Manarah");
  svg.setAttribute("role", "img");
  svg.classList.add("welcome-logo");

  const art = document.createElementNS("http://www.w3.org/2000/svg", "g");
  art.classList.add("welcome-logo-art");
  [...svg.children]
    .filter((child) => child.tagName.toLowerCase() !== "defs")
    .forEach((child) => art.appendChild(child));
  svg.appendChild(art);

  art.querySelectorAll("path").forEach((path) => {
    const isGoldPath = _getWelcomeLogoPathFill(path) === "#b19761";
    path.classList.add(isGoldPath ? "welcome-logo-gold" : "welcome-logo-word");
  });

  return svg;
}

async function _loadWelcomeLogo() {
  const stage = document.getElementById("welcome-logo-stage");
  if (!stage) return false;
  const response = await fetch(WELCOME_LOGO_URL);
  if (!response.ok) return false;
  const template = document.createElement("template");
  template.innerHTML = (await response.text()).trim();
  const logo = _prepareWelcomeLogo(template.content.querySelector("svg"));
  if (!logo) return false;
  stage.replaceChildren(logo);
  return true;
}

function _startWelcomeLogo() {
  const welcome = document.getElementById("welcome-screen");
  if (!welcome || welcome.hidden) return false;
  welcome.classList.add("is-running");
  return true;
}

async function _prepareWelcomeScreen() {
  const logoReady = _withSoftTimeout(_loadWelcomeLogo().catch(() => false), WELCOME_LOGO_TIMEOUT_MS)
    .then((loaded) => loaded && _startWelcomeLogo());
  const settings = await appSettingsReady;
  if (!settings.welcomeEnabled) {
    await _hideWelcomeScreen();
    return false;
  }
  await logoReady;
  const remaining = Math.max(0, WELCOME_MIN_VISIBLE_MS - (performance.now() - _welcomeStartedAt));
  if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
  return true;
}

function _hideWelcomeScreen() {
  const welcome = document.getElementById("welcome-screen");
  if (!welcome || welcome.hidden) return Promise.resolve();
  if (isReduceMotionActive()) {
    welcome.hidden = true;
    welcome.remove();
    return Promise.resolve();
  }
  welcome.setAttribute("aria-hidden", "true");
  welcome.classList.add("is-closing");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (event) => {
      if (event && (event.target !== welcome || event.animationName !== "welcomeOverlayExit")) return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      welcome.removeEventListener("animationend", finish);
      welcome.hidden = true;
      welcome.remove();
      resolve();
    };
    const timer = setTimeout(finish, WELCOME_OVERLAY_EXIT_MS);
    welcome.addEventListener("animationend", finish);
  });
}

function _afterWelcomeIdle() {
  return new Promise((resolve) => {
    const schedule = window.requestIdleCallback
      ? (callback) => window.requestIdleCallback(callback, { timeout: WELCOME_REVEAL_SETTLE_MS })
      : (callback) => setTimeout(callback, WELCOME_REVEAL_SETTLE_MS);
    requestAnimationFrame(() => schedule(resolve));
  });
}

// Fetch real startup data while tiles and the welcome animation are loading.
preloadPlacesData();
const welcomeReady = _prepareWelcomeScreen();
void _prepareStartupView();

function _withSoftTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([promise, new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  })]).finally(() => clearTimeout(timer));
}

async function _prepareStartupView() {
  let interacted = false;
  const onMove = (event) => { if (event.originalEvent) interacted = true; };
  map.on("movestart", onMove);
  try {
    const settings = await appSettingsReady;
    renderAppNotice();
    if (interacted || hasIncomingSharedState() || centerStoredHomeIfAvailable({ instant: true })) return;
    map.jumpTo({ center: [settings.defaultLng, settings.defaultLat], zoom: settings.defaultZoom });
    if (settings.autoCityEnabled) {
      let withinBudget = true;
      await _withSoftTimeout(centerVisitorCityIfAvailable({
        instant: true,
        canApply: () => withinBudget && !interacted && !!document.getElementById("welcome-screen"),
      }), SOFT_CITY_START_BUDGET_MS);
      withinBudget = false;
    }
  } catch {
    console.warn("Startup centering unavailable; keeping the current map view.");
  } finally { map.off("movestart", onMove); }
}

async function _loadStartupModules() {
  const [
    { loadTransitCache },
    { initPrayerTimes, collapsePrayerForMapInteraction },
    { initStyleEditor },
    _contact, // side-effect import - attaches event listeners
    { initEidPrayers },
    { initGpsSim },
    { initWishlist, preloadWishes },
    { initTrafficOverlay },
    { initProfile },
  ] = await Promise.all([
    import("./transit-stops.js"),
    import("./prayer.js"),
    import("./map-style-editor.js"),
    import("./contact.js"),
    import("./eid-prayers.js"),
    import("./gps-sim.js"),
    import("./wishlist.js"),
    import("./traffic-overlay.js"),
    import("./profile.js"),
  ]);

  await _yieldStartupFrame();
  loadTransitCache();
  initPhoneMapChromeCompact(collapsePrayerForMapInteraction);
  await _yieldStartupFrame();
  initPrayerTimes();
  initStyleEditor();
  initEidPrayers();
  await _yieldStartupFrame();
  initWishlist();
  preloadWishes();
  initGpsSim(); // DEV-ONLY - comment out before deploying, restore after
  initTrafficOverlay();
  checkGeoNotice();
  await _yieldStartupFrame();
  // Account sign-in (Firebase) - non-critical, so it's wired here rather than
  // eagerly, same as the other lazy-loaded modules above.
  initMenuAccount();
  // Preferences section (prayer method/madhab, reduce-motion) - prayer.js is
  // already loaded by the Promise.all above, so this dynamic import just
  // resolves to the cached module instead of loading it a second time.
  initMenuPreferences();
  // Profile pane content (contribution-profile plan Phase 4, merged into
  // src/menu.js's single account sheet 2026-08-03) - src/menu.js already
  // statically imports loadProfileContent from profile.js (same "small,
  // non-CDN core module" pattern as its places.js import), so by the time
  // this dynamic import resolves it's almost certainly already cached; this
  // call is what actually wires up its own listeners/state.
  initProfile();
}

function _yieldStartupFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function hasIncomingSharedState() {
  const params = new URLSearchParams(location.search);
  if (
    params.has("r") ||
    params.has("route") ||
    params.has("p") ||
    params.has("place") ||
    params.has("eid") ||
    (params.has("lat") && params.has("lng"))
  ) {
    return true;
  }
  return location.hash.includes("&p=");
}

document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());

// Prevent pinch-zoom outside the map. Only attach non-passive handler when
// multi-touch is actually happening so single-finger taps stay fast.
let _pinchActive = false;
document.addEventListener("touchstart", (e) => {
  _pinchActive = e.touches.length > 1;
}, { passive: true });
document.addEventListener(
  "touchmove",
  (e) => {
    if (_pinchActive && e.touches.length > 1 && !e.target.closest("#map")) e.preventDefault();
  },
  { passive: false },
);

// ─── Global fast-tap: fire click immediately on touchend for interactive ───
// Mobile browsers sometimes delay or swallow click events inside scrollable
// containers, during CSS transitions, or when touch-action inheritance is
// mismatched. This handler synthesises an immediate click to guarantee
// responsiveness. A guard prevents double-fire with the native click.
(function fastTap() {
  if (!('ontouchstart' in window)) return;
  let _startX, _startY, _startTarget, _startTime;
  const MOVE_LIMIT = 10; // px – treat as scroll if finger moves more
  const TIME_LIMIT = 400; // ms – ignore stale touches
  let _suppressClick = 0; // timestamp of last synthetic click

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { _startTarget = null; return; }
    const t = e.touches[0];
    _startX = t.clientX;
    _startY = t.clientY;
    _startTarget = e.target;
    _startTime = Date.now();
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!_startTarget || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - _startX) > MOVE_LIMIT ||
        Math.abs(t.clientY - _startY) > MOVE_LIMIT) {
      _startTarget = null; // finger moved – this is a scroll/drag
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const tgt = _startTarget;
    _startTarget = null;
    if (!tgt) return;
    if (Date.now() - _startTime > TIME_LIMIT) return;
    // Only fast-tap interactive elements
    const interactive = tgt.closest(
      'button, [role="button"], .pf-chip, .tf-chip, .tf-group-toggle, ' +
      '.tut-start-btn, .tut-nav-btn, .tut-close, .tab, .pl-card, ' +
      '.itin-card, .leg-expandable, .direct-step, .sort-opt, .style-opt, .cal-day, .tp-cell, ' +
      '.time-chip, .sp-chip, .prayer-hdr-btn, .prayer-snack-clickable, ' +
      '#results-list li, .dir-suggest li, .pl-fav-btn, #eid-banner .snack-body, #snackbar-body, ' +
      '.wish-vote, .wish-expand, a'
    );
    if (!interactive) return;
    // Don't fast-tap inputs/textareas (they need default focus behavior)
    if (tgt.closest('input, textarea, select')) return;
    const ct = e.changedTouches[0];
    e.preventDefault(); // prevent the browser's delayed click
    _suppressClick = Date.now();
    // Auto-clear in case e.preventDefault() fully blocks the native click
    // (which would otherwise reset _suppressClick in the capture handler).
    setTimeout(() => { _suppressClick = 0; }, 500);
    interactive.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
      clientX: ct.clientX, clientY: ct.clientY,
    }));
  }, { passive: false });

  // Suppress the native click that arrives ~300ms later for fast-tapped elements.
  // Without this guard the handler fires twice.
  document.addEventListener('click', (e) => {
    if (_suppressClick && Date.now() - _suppressClick < 500) {
      if (e.isTrusted) {
        e.stopImmediatePropagation();
        e.preventDefault();
        _suppressClick = 0;
      }
      // Synthetic (dispatched) clicks pass through — guard stays active for native
    }
  }, { capture: true });
})();

window.addEventListener("offline", showOfflineBanner);
window.addEventListener("online", () => { hideOfflineBanner(); showToast("Back online", "check"); });

function _wrapChromeZone(id, elementIds) {
  if (document.getElementById(id)) return;
  const elements = elementIds.map((elementId) => document.getElementById(elementId)).filter(Boolean);
  if (!elements.length) return;
  const zone = document.createElement("div");
  zone.id = id;
  zone.className = "phone-chrome-zone";
  elements[0].before(zone);
  elements.forEach((el) => zone.appendChild(el));
}

function initPhoneMapChromeCompact(collapsePrayerForMapInteraction) {
  const mq = window.matchMedia?.("(max-width: 768px)");
  const canvasTarget = map.getCanvasContainer?.() || map.getCanvas?.();
  if (!mq || !canvasTarget) return;

  _wrapChromeZone("phone-chrome-top-zone", ["prayer-snack", "eid-pill", "events-pill", "promos-pill"]);
  _wrapChromeZone("phone-chrome-right-zone", ["locate-pill-wrap", "search-card", "zoom-pill"]);
  _wrapChromeZone("phone-chrome-bottom-zone", ["tab-bar"]);

  const COMPACT_RESTORE_GRACE_MS = 3000;
  const PHONE_CHROME_SELECTOR = [
    "#phone-chrome-top-zone",
    "#phone-chrome-right-zone",
    "#phone-chrome-bottom-zone",
    "#route-snackbar",
  ].join(",");
  let endTimer = 0;
  let compactActive = false;
  const setCompact = (active) => {
    if (!mq.matches) {
      document.body.classList.remove("map-interacting");
      compactActive = false;
      return;
    }
    compactActive = active;
    document.body.classList.toggle("map-interacting", active);
  };
  const begin = () => {
    if (!mq.matches) return;
    clearTimeout(endTimer);
    if (compactActive) return;
    collapsePrayerForMapInteraction?.();
    setCompact(true);
  };
  const endSoon = (delay = COMPACT_RESTORE_GRACE_MS) => {
    clearTimeout(endTimer);
    endTimer = setTimeout(() => setCompact(false), delay);
  };
  const restoreForChromeInteraction = (e) => {
    if (!mq.matches || !e.target?.closest?.(PHONE_CHROME_SELECTOR)) return;
    clearTimeout(endTimer);
    endTimer = 0;
    setCompact(false);
  };
  const beginFromMapEvent = (e) => {
    if (e?.originalEvent) begin();
  };

  canvasTarget.addEventListener("pointerdown", begin, { passive: true });
  window.addEventListener("pointerup", () => endSoon(), { passive: true });
  window.addEventListener("pointercancel", () => endSoon(), { passive: true });
  canvasTarget.addEventListener("touchstart", begin, { passive: true });
  window.addEventListener("touchend", () => endSoon(), { passive: true });
  window.addEventListener("touchcancel", () => endSoon(), { passive: true });
  document.addEventListener("pointerdown", restoreForChromeInteraction, { capture: true, passive: true });
  document.addEventListener("touchstart", restoreForChromeInteraction, { capture: true, passive: true });
  document.addEventListener("focusin", restoreForChromeInteraction, { capture: true });

  map.on("dragstart", beginFromMapEvent);
  map.on("zoomstart", beginFromMapEvent);
  map.on("rotatestart", beginFromMapEvent);
  map.on("pitchstart", beginFromMapEvent);
  map.on("dragend", () => endSoon());
  map.on("zoomend", () => endSoon());
  map.on("rotateend", () => endSoon());
  map.on("pitchend", () => endSoon());

  mq.addEventListener?.("change", () => {
    clearTimeout(endTimer);
    endTimer = 0;
    if (!mq.matches) setCompact(false);
  });
}

map.on("load", async () => {
  preloadSatelliteSource();
  syncHomeMarker();

  // Mask everything outside Finland — placed just below the first label layer.
  // Water and bridges are then promoted above the mask so seas/lakes/bridges stay visible,
  // while all labels (road, park, poi, village, town, city, country) remain on top.
  map.addSource("finland-mask", {
    type: "geojson",
    data: "/data/finland-outside-mask.geojson",
  });
  map.addLayer(
    {
      id: "finland-mask",
      type: "fill",
      source: "finland-mask",
      paint: {
        "fill-color": [
          "interpolate", ["linear"], ["zoom"],
          7, "#d3e3bb",
          9, "#ffffff",
        ],
        "fill-opacity": 1,
      },
    },
    "label_road",                // ← inserted right below all labels
  );

  // Lift water, bridges, and country borders above the mask so they remain visible.
  // Using "label_road" keeps them below all label layers.
  map.moveLayer("water",               "label_road");
  map.moveLayer("water_shoreline",     "label_road");
  map.moveLayer("waterway",            "label_road");
  map.moveLayer("bridge_minor_casing", "label_road");
  map.moveLayer("bridge_minor",        "label_road");
  map.moveLayer("bridge_major_casing", "label_road");
  map.moveLayer("bridge_major",        "label_road");
  map.moveLayer("admin_country",       "label_road");

  const appLoadingReady = Promise.allSettled([
    loadPlacesData(),
    _loadStartupModules(),
  ]);

  const [welcomeEnabled, startupResults] = await Promise.all([welcomeReady, appLoadingReady]);
  if (startupResults.some((result) => result.status === "rejected")) {
    console.warn("Some optional app features could not be initialized.");
  }
  if (welcomeEnabled) await _hideWelcomeScreen();
  await _afterWelcomeIdle();

  // Admins can pause onboarding; the tutorial still honors its first-run flag.
  const settings = await appSettingsReady;
  if (settings.tutorialEnabled) setTimeout(
    async () => {
      const { initTutorial } = await import("./tutorial.js");
      initTutorial(() => {
        // showEarlyDevNotice(); // disabled
      });
    },
    TUTORIAL_DELAY_MS,
  );

  // Privacy overlay wiring
  const privacyOverlay = document.getElementById("privacy-overlay");
  document
    .getElementById("privacy-close")
    .addEventListener("click", () => privacyOverlay.classList.add("hide"));
  privacyOverlay.addEventListener("click", (e) => {
    if (e.target === privacyOverlay) privacyOverlay.classList.add("hide");
  });
  document.getElementById("privacy-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    privacyOverlay.classList.remove("hide");
  });
  // Same overlay, reachable from the Menu sheet's Support row too.
  document.getElementById("menu-privacy-pill").addEventListener("click", () => {
    privacyOverlay.classList.remove("hide");
  });
});
