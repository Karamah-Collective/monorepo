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
import { loadPlacesData, placesLoaded } from "./places.js";
import "./search.js";
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
      '#results-list li, .dir-suggest li, .pl-fav-btn, #eid-banner .snack-body, #snackbar-body, a'
    );
    if (!interactive) return;
    // Don't fast-tap inputs/textareas (they need default focus behavior)
    if (tgt.closest('input, textarea, select')) return;
    const ct = e.changedTouches[0];
    e.preventDefault(); // prevent the browser's delayed click
    _suppressClick = Date.now();
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

map.on("load", async () => {
  preloadSatelliteSource();
  syncHomeMarker();
  if (!hasIncomingSharedState()) centerStoredHomeIfAvailable({ instant: true });

  // Mask everything outside Finland — placed just below city/country labels.
  // Water layers are then promoted above the mask so seas/lakes stay visible.
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
          9, "#f0f1f2",
        ],
        "fill-opacity": 1,
      },
    },
    "label_place_city",          // ← inserted right below city labels
  );

  // Lift water + country borders above the mask so they remain visible everywhere
  map.moveLayer("waterway",      "label_place_city");
  map.moveLayer("water",         "label_place_city");
  map.moveLayer("label_water",   "label_place_city");
  map.moveLayer("admin_country", "label_place_city");

  const loadPromise = loadPlacesData();

  // Lazy-load non-critical modules in parallel after first paint
  const [
    { loadTransitCache },
    { initPrayerTimes },
    { initStyleEditor },
    _contact, // side-effect import — attaches event listeners
    { initEidPrayers },
  ] = await Promise.all([
    import("./transit-stops.js"),
    import("./prayer.js"),
    import("./map-style-editor.js"),
    import("./contact.js"),
    import("./eid-prayers.js"),
  ]);

  loadTransitCache();
  initPrayerTimes();
  initStyleEditor();
  initEidPrayers();
  checkGeoNotice();
  // Show first-run tutorial after a short delay so the UI has settled
  // Early-dev notice shows after tutorial finishes (or immediately for returning users)
  setTimeout(
    async () => {
      const { initTutorial } = await import("./tutorial.js");
      initTutorial(() => {
        showEarlyDevNotice();
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
  document.getElementById("privacy-link").addEventListener("click", (e) => {
    e.preventDefault();
    privacyOverlay.classList.remove("hide");
  });

  // ─── Tools Toggle (tablet: collapsible pill group) ─── 
  const toolsBtn = document.getElementById("tools-toggle");
  const iconDots = document.getElementById("tools-icon-grid");
  const iconX    = document.getElementById("tools-icon-x");
  const appEl    = document.getElementById("app");

  toolsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = !appEl.classList.contains("tools-open");
    appEl.classList.toggle("tools-open");
    iconDots.style.display = opening ? "none" : "";
    iconX.style.display    = opening ? "" : "none";

    // If closing, also collapse search if it was open
    if (!opening) {
      const sc = document.getElementById("search-card");
      if (sc && !sc.classList.contains("collapsed")) {
        sc.classList.add("collapsed");
        const inp = document.getElementById("search-input");
        if (inp) { inp.value = ""; inp.blur(); }
        const sd = document.getElementById("search-drop");
        if (sd) sd.classList.add("hide");
        const cb = document.getElementById("clear-input");
        if (cb) cb.classList.add("hide");
      }
      // Close style panel if open
      const sp = document.getElementById("style-panel");
      if (sp) sp.classList.add("hide");
    }
  });
});
