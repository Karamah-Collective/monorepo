import { map } from "./map-init.js";
import { checkGeoNotice, showEarlyDevNotice } from "./utils.js";
import "./map-controls.js";
import "./directions.js";
import { loadPlacesData } from "./places.js";
import "./search.js";
import { initPrayerTimes } from "./prayer.js";
import { loadTransitCache } from "./transit-stops.js";
import { initTutorial } from "./tutorial.js";

document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1 && !e.target.closest("#map")) e.preventDefault();
}, { passive: false });

map.on("load", () => {
  loadPlacesData();
  loadTransitCache();
  initPrayerTimes();
  checkGeoNotice();
  // Show first-run tutorial after a short delay so the UI has settled
  // Early-dev notice shows after tutorial finishes (or immediately for returning users)
  setTimeout(() => initTutorial(showEarlyDevNotice), 800);

  // Privacy overlay wiring
  const privacyOverlay = document.getElementById("privacy-overlay");
  document.getElementById("privacy-close").addEventListener("click", () => privacyOverlay.classList.add("hide"));
  privacyOverlay.addEventListener("click", (e) => { if (e.target === privacyOverlay) privacyOverlay.classList.add("hide"); });
  document.getElementById("privacy-link").addEventListener("click", (e) => { e.preventDefault(); privacyOverlay.classList.remove("hide"); });
});