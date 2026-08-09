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
  showEarlyDevNotice,
  showLoadingToast,
  hideLoadingToast,
  showOfflineBanner,
  hideOfflineBanner,
  showToast,
} from "./utils.js";
import { preloadSatelliteSource, centerStoredHomeIfAvailable, syncHomeMarker } from "./map-controls.js";
import "./directions.js";
import "./navigation.js"; // registers nav hooks with directions.js
import { loadPlacesData, placesLoaded } from "./places.js";
import "./search.js";
import { initMenuAccount, initMenuPreferences } from "./menu.js";
// Non-critical modules loaded lazily after map.on("load") for faster startup

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

function initPhoneMapChromeCompact(collapsePrayerForMapInteraction) {
  const mq = window.matchMedia?.("(max-width: 768px)");
  const canvasTarget = map.getCanvasContainer?.() || map.getCanvas?.();
  if (!mq || !canvasTarget) return;

  const COMPACT_START_DELAY_MS = 120;
  const COMPACT_RESTORE_GRACE_MS = 5000;
  const PHONE_CHROME_SELECTOR = [
    "#tab-bar",
    "#search-card",
    "#locate-pill-wrap",
    "#zoom-pill",
    "#prayer-snack",
    "#eid-pill",
    "#events-pill",
    "#promos-pill",
    "#route-snackbar",
  ].join(",");
  let endTimer = 0;
  let beginTimer = 0;
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
    if (compactActive || beginTimer) return;
    beginTimer = setTimeout(() => {
      beginTimer = 0;
      collapsePrayerForMapInteraction?.();
      setCompact(true);
    }, COMPACT_START_DELAY_MS);
  };
  const endSoon = (delay = COMPACT_RESTORE_GRACE_MS) => {
    clearTimeout(beginTimer);
    beginTimer = 0;
    clearTimeout(endTimer);
    endTimer = setTimeout(() => setCompact(false), delay);
  };
  const restoreForChromeInteraction = (e) => {
    if (!mq.matches || !e.target?.closest?.(PHONE_CHROME_SELECTOR)) return;
    clearTimeout(beginTimer);
    clearTimeout(endTimer);
    beginTimer = 0;
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
    clearTimeout(beginTimer);
    clearTimeout(endTimer);
    beginTimer = 0;
    endTimer = 0;
    if (!mq.matches) setCompact(false);
  });
}

map.on("load", async () => {
  preloadSatelliteSource();
  syncHomeMarker();
  if (!hasIncomingSharedState()) centerStoredHomeIfAvailable({ instant: true });

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

  const loadPromise = loadPlacesData();

  // Lazy-load non-critical modules in parallel after first paint
  const [
    { loadTransitCache },
    { initPrayerTimes, collapsePrayerForMapInteraction },
    { initStyleEditor },
    _contact, // side-effect import — attaches event listeners
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

  loadTransitCache();
  initPhoneMapChromeCompact(collapsePrayerForMapInteraction);
  initPrayerTimes();
  initStyleEditor();
  initEidPrayers();
  initWishlist();
  preloadWishes();
  // initGpsSim(); // DEV-ONLY — comment out before deploying, restore after
  initTrafficOverlay();
  checkGeoNotice();
  // Account sign-in (Firebase) — non-critical, so it's wired here rather than
  // eagerly, same as the other lazy-loaded modules above.
  initMenuAccount();
  // Preferences section (prayer method/madhab, reduce-motion) — prayer.js is
  // already loaded by the Promise.all above, so this dynamic import just
  // resolves to the cached module instead of loading it a second time.
  initMenuPreferences();
  // Profile pane content (contribution-profile plan Phase 4, merged into
  // src/menu.js's single account sheet 2026-08-03) — src/menu.js already
  // statically imports loadProfileContent from profile.js (same "small,
  // non-CDN core module" pattern as its places.js import), so by the time
  // this dynamic import resolves it's almost certainly already cached; this
  // call is what actually wires up its own listeners/state.
  initProfile();
  // Show first-run tutorial after a short delay so the UI has settled
  // Early-dev notice shows after tutorial finishes (or immediately for returning users)
  // NOTE: Disabled — keep code for future re-enable
  setTimeout(
    async () => {
      const { initTutorial } = await import("./tutorial.js");
      initTutorial(() => {
        // showEarlyDevNotice(); // disabled
        // Show loading toast only after tutorial/intro finishes, if places still loading
        if (!placesLoaded) {
          showLoadingToast("Loading places…", "Fetching latest data");
          loadPromise.then(() => hideLoadingToast());
        }
      });
    },
    800,
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
