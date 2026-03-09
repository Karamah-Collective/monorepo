// Register service worker for instant tile/shell caching (stale-while-revalidate).
// Must be registered from a module at the same origin; /sw.js scope covers everything.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* non-critical */ });
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
import "./map-controls.js";
import "./directions.js";
import { loadPlacesData, placesLoaded } from "./places.js";
import "./search.js";
import "./contact.js";
import { initPrayerTimes } from "./prayer.js";
import { loadTransitCache } from "./transit-stops.js";
import { initTutorial } from "./tutorial.js";

document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length > 1 && !e.target.closest("#map")) e.preventDefault();
  },
  { passive: false },
);

window.addEventListener("offline", showOfflineBanner);
window.addEventListener("online", () => { hideOfflineBanner(); showToast("Back online", "check"); });

map.on("load", () => {
  const loadPromise = loadPlacesData();
  loadTransitCache();
  initPrayerTimes();
  checkGeoNotice();
  // Show first-run tutorial after a short delay so the UI has settled
  // Early-dev notice shows after tutorial finishes (or immediately for returning users)
  setTimeout(
    () =>
      initTutorial(() => {
        showEarlyDevNotice();
        // Show loading toast only after tutorial/intro finishes, if places still loading
        if (!placesLoaded) {
          showLoadingToast("Loading places…", "Fetching latest data");
          loadPromise.then(() => hideLoadingToast());
        }
      }),
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
