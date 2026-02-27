import { map } from "./map-init.js";
import { checkGeoNotice } from "./utils.js";
import "./map-controls.js";
import "./directions.js";
import { loadPlacesData } from "./places.js";
import "./search.js";
import { initPrayerTimes } from "./prayer.js";
import { loadTransitCache } from "./transit-stops.js";

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
});