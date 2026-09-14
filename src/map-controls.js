import { focusMapPoint, map } from "./map-init.js";
import { HELSINKI } from "./config.js";
import {
  esc,
  getVisitorGeo,
  showToast,
  showLoadingToast,
  hideLoadingToast,
  requestLocation,
  getHomeLocation,
  clearHomeLocation,
  encodeCompactPin,
  shareUrl,
  fadeAndRemovePopup,
  setCurrentLocationState,
  getCurrentLocationState,
  clearCurrentLocationState,
} from "./utils.js";
import { dir, placeOriginMarker, autoSetNearestMosque, updateGoButton, openDirPanel, reverseGeocode, startPick } from "./directions.js";
import { placesData, updateMarkerVisibility } from "./places.js";
import { setTrafficDetailOverlay, refreshTrafficDetailOverlayLayers } from "./traffic-overlay.js";
import { getAppSettings } from "./app-settings.js";

let locMarker = null;
let locWatchId = null;
let homeMarker = null;

// Cache geolocation permission state so we can skip the "Finding location" toast
// when GPS is already known-denied. Resolves in one microtask (from browser cache).
let _geoPermState = null;
navigator.permissions?.query({ name: "geolocation" })
  .then((p) => {
    _geoPermState = p.state;
    p.addEventListener("change", () => { _geoPermState = p.state; });
  })
  .catch(() => {});

const HOME_VIEW_ZOOM = 14.2;
const CITY_VIEW_ZOOM = 12.2;
const HOME_MARKER_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-4a3 3 0 0 1 6 0v4"/></svg>';
const CITY_START_VIEWS = Object.freeze({
  helsinki: [24.9384, 60.1699],
  helsingfors: [24.9384, 60.1699],
  espoo: [24.6559, 60.2055],
  esbo: [24.6559, 60.2055],
  vantaa: [25.0378, 60.2934],
  vanda: [25.0378, 60.2934],
  kauniainen: [24.7276, 60.2124],
  grankulla: [24.7276, 60.2124],
  turku: [22.2666, 60.4518],
  abo: [22.2666, 60.4518],
  tampere: [23.7610, 61.4978],
  oulu: [25.4651, 65.0121],
  lahti: [25.6615, 60.9827],
  kuopio: [27.6782, 62.8924],
  jyvaskyla: [25.7473, 62.2426],
  joensuu: [29.7636, 62.6010],
  vaasa: [21.6158, 63.0951],
  vasa: [21.6158, 63.0951],
  pori: [21.7974, 61.4851],
  lappeenranta: [28.1887, 61.0587],
});

export let currentTheme = "light";     // "light" | "dark" — the actually-applied visual theme
export let themeMode = "auto";        // "light" | "dark" | "auto" — the user's selected Theme option
let _systemThemeMQ = null;             // matchMedia("(prefers-color-scheme: dark)"), created lazily
export let isSatelliteActive = false;

const SAT_SOURCE_ID = "satellite-src";
let origWaterColor = null;   // snapshot for restore
const SAT_TILES = ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"];
const SAT_ATTRIBUTION = '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, Maxar, Earthstar Geographics';
export let isHeatmapActive = false;
export let is3DActive = false;
export let isHybridSatelliteActive = false;
export let mapDetailMode = "standard";
export let markerVisualMode = "default";

const VECTOR_BASE_IDS = [
  "background", "landcover_grass", "landcover_wood", "landcover_farmland",
  "landcover_sand", "landcover_ice", "landuse_residential", "landuse_industrial",
  "landuse_hospital", "landuse_school", "landuse_cemetery", "landuse_pitch",
  "park", "waterway", "water", "water_shoreline", "aeroway_fill", "aeroway_runway",
  "building_shadow", "building", "building_outline",
  "tunnel_path", "tunnel_minor", "tunnel_major",
  "road_path", "road_service", "road_secondary_casing", "road_secondary",
  "road_primary_casing", "road_primary", "road_trunk_casing", "road_trunk",
  "road_motorway_casing", "road_motorway", "rail",
  "bridge_minor_casing", "bridge_minor", "bridge_major_casing", "bridge_major",
  "admin_sub", "admin_country",
];
const LABEL_IDS = [
  "label_road", "label_water", "label_park", "label_poi",
  "label_place_village", "label_place_town", "label_place_city", "label_country",
];
const origLabelPaint = {};
const HYBRID_VECTOR_IDS = [
  "tunnel_path", "tunnel_minor", "tunnel_major",
  "road_path", "road_service", "road_secondary_casing", "road_secondary",
  "road_primary_casing", "road_primary", "road_trunk_casing", "road_trunk",
  "road_motorway_casing", "road_motorway", "rail",
  "bridge_minor_casing", "bridge_minor", "bridge_major_casing", "bridge_major",
  "admin_sub", "admin_country",
];
const MAP_DETAIL_MODES = new Set(["clean", "standard", "detailed"]);
const MARKER_VISUAL_MODES = new Set(["default", "compact", "bold"]);
const DETAIL_LAYER_IDS = [
  "road_path", "road_service", "road_service_casing",
  "tunnel_path", "tunnel_minor",
  "building_shadow", "building_outline",
  "road_crossing_base", "road_crossing_stripes", "oneway_arrows",
  "label_park", "label_poi", "label_place_village", "label_place_town",
];
const DETAIL_HIDDEN_BY_MODE = {
  clean: new Set(DETAIL_LAYER_IDS),
  standard: new Set(),
  detailed: new Set(),
};
const DETAIL_PAINT_LAYER_PROPS = {
  road_path: ["line-opacity"],
  road_service: ["line-opacity"],
  road_secondary: ["line-opacity"],
  road_primary: ["line-opacity"],
  road_trunk: ["line-opacity"],
  road_motorway: ["line-opacity"],
  bridge_minor: ["line-opacity"],
  bridge_major: ["line-opacity"],
  road_crossing_base: ["line-opacity"],
  road_crossing_stripes: ["line-opacity"],
  oneway_arrows: ["text-opacity"],
  building: ["fill-opacity"],
  building_outline: ["line-opacity"],
  building_shadow: ["fill-opacity"],
  label_poi: ["text-halo-width"],
  label_park: ["text-halo-width"],
};
const DETAIL_PAINT_PRESETS = {
  detailed: {
    road_path: { "line-opacity": ["interpolate", ["linear"], ["zoom"], 13.5, 0.25, 15, 1] },
    road_service: { "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.28, 18, 0.72] },
    road_secondary: { "line-opacity": ["interpolate", ["linear"], ["zoom"], 9.5, 0.24, 18, 0.64] },
    road_primary: { "line-opacity": ["interpolate", ["linear"], ["zoom"], 8.5, 0.28, 18, 0.68] },
    road_trunk: { "line-opacity": ["interpolate", ["linear"], ["zoom"], 7.5, 0.28, 18, 0.72] },
    road_motorway: { "line-opacity": ["interpolate", ["linear"], ["zoom"], 7.5, 0.28, 18, 0.74] },
    bridge_minor: { "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.18, 18, 0.48] },
    bridge_major: { "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.18, 18, 0.58] },
    road_crossing_base: { "line-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.25, 15, 1] },
    road_crossing_stripes: { "line-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.25, 15, 0.95] },
    oneway_arrows: { "text-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0.2, 16, 1] },
    building: { "fill-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0.2, 16, 0.95] },
    building_outline: { "line-opacity": ["interpolate", ["linear"], ["zoom"], 15.5, 0.22, 17, 0.9] },
    building_shadow: { "fill-opacity": ["interpolate", ["linear"], ["zoom"], 16, 0, 18, 0.26] },
    label_poi: { "text-halo-width": 1.45 },
    label_park: { "text-halo-width": 1.35 },
  },
};
const _detailPaintSnapshots = {};
let _trafficDetailModeEnabled = false;

/* ── Heatmap scoring ── */
const TYPE_BASE = { mosque: 10, prayer_room: 7, space: 7, shop: 5, service: 5, restaurant: 4, cemetery: 3 };
const TAG_SCORE = {
  daily_prayers: 5, jummah: 3, taraweeh: 1, eid_prayer: 1,
  janaza: 0.5, quran_classes: 1, female_prayer: 2, female_wudu: 1,
  wudu: 1, quran_available: 0.5,
  fully_halal: 3, partially_halal: 1, no_alcohol: 1.5,
  halal_meat: 3, halal_butchery: 2, halal_groceries: 2,
  asian_products: 0.5, african_products: 0.5, arab_products: 0.5, halal_certified: 2,
  service_type_grocery: 2, service_type_butchery: 2, space_type_mosque: 3, space_type_prayer_place: 2, space_type_cemetery: 1,
};

function buildHeatmapGeoJSON() {
  const features = placesData.map((p) => {
    let score = TYPE_BASE[p.type] || 3;
    if (p.tags) {
      for (const [tag, val] of Object.entries(p.tags)) {
        if (val && TAG_SCORE[tag]) score += TAG_SCORE[tag];
      }
    }
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { weight: score },
    };
  });
  const maxW = Math.max(...features.map((f) => f.properties.weight), 1);
  features.forEach((f) => { f.properties.weight = f.properties.weight / maxW; });
  return { type: "FeatureCollection", features };
}

const LOC_ICON_ON = '<path d="M3 11l19-9-9 19-2-8-8-2z"/>';
const LOC_ICON_OFF = '<path d="M3 11l19-9-9 19-2-8-8-2z"/><line x1="6" y1="3" x2="22" y2="18" stroke-width="2"/>';

function setLocateIcon(on) {
  const svg = document.querySelector("#locate-btn svg");
  if (svg) svg.innerHTML = on ? LOC_ICON_ON : LOC_ICON_OFF;
}

let _homePopup = null;

function _buildHomeShareUrl(lat, lng) {
  return `${location.origin}${location.pathname}?p=${encodeCompactPin(+lat, +lng, 15, false)}`;
}

function openHomePopup() {
  const home = getHomeLocation();
  if (!home) return;

  document.querySelectorAll(".maplibregl-popup").forEach((p) => p.remove());
  _homePopup = null;

  const popup = new maplibregl.Popup({ offset: [0, -42], closeButton: false, focusAfterOpen: false, maxWidth: "260px", className: "place-popup-wrap pin-popup-wrap" })
    .setLngLat([home.lng, home.lat])
    .setHTML(`
      <div class="pp pp--pin">
        <div class="pp-inner">
          <div class="pp-hdr">
            <span class="pp-icon" style="color:var(--home)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-4a3 3 0 0 1 6 0v4"/></svg></span>
            <span class="pp-badge" style="background:var(--home-soft);color:var(--home)">Home</span>
          </div>
          <div class="pp-addr">${esc(home.address || home.name)}</div>
          <div class="pp-actions">
            <button class="pp-dir-btn" data-lng="${home.lng}" data-lat="${home.lat}" title="Directions" aria-label="Directions">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-6 6"/><path d="M4 20v-6a4 4 0 0 1 4-4h12"/></svg>
            </button>
            <button class="pp-share-btn" title="Share this location" aria-label="Share this location">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <button class="pp-rm-btn" title="Remove home" aria-label="Remove home">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>
    `)
    .addTo(map);

  _homePopup = popup;

  popup.on("close", () => { _homePopup = null; });

  focusMapPoint([home.lng, home.lat], { method: "flyTo", zoom: Math.max(map.getZoom(), 15), duration: 600 });

  popup.getElement().addEventListener("click", async (ev) => {
    const dirBtn = ev.target.closest(".pp-dir-btn");
    const shrBtn = ev.target.closest(".pp-share-btn");
    const rmBtn  = ev.target.closest(".pp-rm-btn");

    if (dirBtn) {
      const pLng = +dirBtn.dataset.lng, pLat = +dirBtn.dataset.lat;
      const name = home.address || home.name || await reverseGeocode(pLat, pLng);
      dir.origin = { lat: pLat, lng: pLng, name };
      document.getElementById("dir-from").value = name;
      placeOriginMarker(pLng, pLat);
      autoSetNearestMosque(pLat, pLng);
      updateGoButton();
      fadeAndRemovePopup(popup);
      openDirPanel();
      if (!dir.dest) startPick("to");
    } else if (shrBtn) {
      shareUrl(_buildHomeShareUrl(home.lat, home.lng), "Home", "Home – Halal Finder");
    } else if (rmBtn) {
      fadeAndRemovePopup(popup);
      clearHomeLocation();
      showToast("Home removed", "check");
    }
  });
}

export function syncHomeMarker() {
  const home = getHomeLocation();
  if (!home) {
    if (homeMarker) {
      homeMarker.remove();
      homeMarker = null;
    }
    if (_homePopup) { try { _homePopup.remove(); } catch (_) {} _homePopup = null; }
    return;
  }

  if (!homeMarker) {
    const el = document.createElement("div");
    el.className = "place-mk-wrap";
    el.innerHTML = `<div class="home-mk">${HOME_MARKER_SVG}</div>`;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openHomePopup();
    });
    homeMarker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([home.lng, home.lat])
      .addTo(map);
  } else {
    homeMarker.setLngLat([home.lng, home.lat]);
  }
}

export function centerStoredHomeIfAvailable({ instant = false } = {}) {
  const home = getHomeLocation();
  if (!home) return false;

  const view = {
    center: [home.lng, home.lat],
    zoom: HOME_VIEW_ZOOM,
    bearing: 0,
    pitch: 0,
    duration: 600,
  };

  if (instant) {
    focusMapPoint(view.center, { method: "jumpTo", zoom: view.zoom, bearing: view.bearing, pitch: view.pitch });
  } else {
    focusMapPoint(view.center, { ...view, method: "flyTo" });
  }
  return true;
}

function _normalizeCityKey(city) {
  return String(city || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Centers the first map view on the visitor's Cloudflare IP city when known.
 * @param {{ instant?: boolean, canApply?: () => boolean }} [options={}] - Whether to jump instead of animate, plus an optional freshness guard.
 * @returns {Promise<boolean>} True when a recognized Finnish city was applied.
 */
export async function centerVisitorCityIfAvailable({ instant = false, canApply = null } = {}) {
  const geo = await getVisitorGeo();
  if (geo?.country !== "FI") return false;
  if (canApply && !canApply()) return false;

  const center = CITY_START_VIEWS[_normalizeCityKey(geo.city)];
  if (!center) return false;

  const view = {
    center,
    zoom: CITY_VIEW_ZOOM,
    bearing: 0,
    pitch: 0,
    duration: 600,
  };

  if (instant) {
    focusMapPoint(view.center, { method: "jumpTo", zoom: view.zoom, bearing: view.bearing, pitch: view.pitch });
  } else {
    focusMapPoint(view.center, { ...view, method: "flyTo" });
  }
  return true;
}

export function showCurrentLocation() {
  const locBtn = document.getElementById("locate-btn");

  // ── Already tracking ──
  if (locWatchId !== null) {
    const loc = getCurrentLocationState();
    // If we have a fix AND the user's position is off-screen, re-center instead of toggling off
    if (loc.active && loc.lat !== null) {
      const bounds = map.getBounds();
      if (!bounds.contains([loc.lng, loc.lat])) {
        focusMapPoint([loc.lng, loc.lat], { method: "flyTo", zoom: Math.max(map.getZoom(), 15), duration: 800 });
        return;
      }
    }
    // Position is on screen (or no fix) → turn off
    navigator.geolocation.clearWatch(locWatchId);
    locWatchId = null;
    _stopHeadingWatch();
    _cancelLocLerp();
    if (locMarker) { locMarker.remove(); locMarker = null; }
    _locConeEl = null;
    clearCurrentLocationState();
    locBtn.classList.remove("tracking");
    setLocateIcon(false);
    return;
  }

  // iOS 13+ requires DeviceOrientation permission from a user gesture.
  // This click handler IS a user gesture, so request it here before async work.
  _requestOrientationPermission();

  // If the browser has already confirmed geolocation is denied, skip the
  // loading toast and bail immediately \u2014 no need to wait for the async error.
  if (_geoPermState === "denied") {
    locBtn.classList.remove("tracking");
    setLocateIcon(false);
    showToast("Location is off", "loc", "Enable it in browser settings");
    return;
  }

  locBtn.classList.add("tracking");
  setLocateIcon(true);
  showLoadingToast("Finding your location\u2026");
  let firstFix = true;

  function onPosition(pos) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    setCurrentLocationState({ lat, lng, accuracy, active: true });
    if (firstFix) hideLoadingToast();
    if (!locMarker) {
      const el = document.createElement("div");
      el.className = "loc-marker";
      el.innerHTML = '<div class="loc-ring"></div><div class="loc-puck"></div>';
      _locConeEl = el.querySelector(".loc-puck");
      locMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      _locLerpPos = { lng, lat };
      _startHeadingWatch();
    } else {
      _lerpLocMarkerTo(lng, lat);
    }
    _updateGpsHeading(lat, lng);
    const isNavMode = document.body.classList.contains("nav-mode");
    if (firstFix) {
      // Navigation mode owns the camera and applies its own HUD offset.
      if (!isNavMode) {
        focusMapPoint([lng, lat], { method: "flyTo", zoom: Math.max(map.getZoom(), 15), duration: 800 });
      }
      firstFix = false;
    } else if (dir.routeLayers.length > 0 && !isNavMode) {
      // Regular route preview follows the user only when turn-by-turn nav
      // is not active. Navigation mode handles its own camera behavior.
      focusMapPoint([lng, lat], { duration: 600 });
    }
  }

  requestLocation({
    watch: true,
    onPosition,
    onWatch(id) { locWatchId = id; },
  }).catch((e) => {
    hideLoadingToast();
    clearCurrentLocationState();
    showToast("Location is off", "loc", e.message);
    locBtn.classList.remove("tracking");
    setLocateIcon(false);
    locWatchId = null;
    focusMapPoint(HELSINKI, { method: "flyTo", zoom: 12.2, duration: 600 });
  });
}

/* ── Heading (compass direction) ──────────────────────────────────────────── */

let _locConeEl = null;
let _headingCleanup = null;
let _orientationPermissionState = "unknown"; // "unknown" | "granted" | "denied"
let _hasCompassHeading = false;  // true once any compass event delivers a heading

/**
 * Request DeviceOrientation permission (iOS 13+).
 * Must be called inside a user-gesture handler (click/tap).
 */
function _requestOrientationPermission() {
  if (_orientationPermissionState !== "unknown") return;
  if (typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((state) => { _orientationPermissionState = state; })
      .catch(() => { _orientationPermissionState = "denied"; });
  } else {
    // Non-iOS: no permission needed
    _orientationPermissionState = "granted";
  }
}

function _startHeadingWatch() {
  if (_headingCleanup) return;

  let _lastHeading = null;

  function _applyConeRotation(heading) {
    if (heading === null || !_locConeEl) return;
    const mapBearing = map.getBearing();
    const rotation = (heading - mapBearing + 360) % 360;
    _locConeEl.style.transform = `translate(-50%, -50%) rotate(${rotation + 135}deg)`;
    if (!_locConeEl.classList.contains("has-heading")) {
      _locConeEl.classList.add("has-heading");
    }
  }

  function onOrientation(e) {
    let heading = null;
    // iOS Safari: webkitCompassHeading (degrees from north, clockwise)
    if (typeof e.webkitCompassHeading === "number") {
      heading = e.webkitCompassHeading;
    }
    // deviceorientationabsolute: e.absolute is true, alpha is compass heading
    else if (e.absolute && typeof e.alpha === "number") {
      heading = (360 - e.alpha) % 360;
    }
    // Fallback for Android Chrome: non-absolute alpha is still useful as a
    // relative compass value on most devices (backed by magnetometer)
    else if (typeof e.alpha === "number" && e.alpha !== null) {
      heading = (360 - e.alpha) % 360;
    }
    if (heading === null) return;
    _hasCompassHeading = true;
    _lastHeading = heading;
    _applyConeRotation(_lastHeading);
  }

  // Listen for both absolute and regular orientation events.
  // deviceorientationabsolute is preferred (true north) but Chromium-only;
  // deviceorientation fires on all platforms and is our primary fallback.
  if (_orientationPermissionState !== "denied") {
    window.addEventListener("deviceorientationabsolute", onOrientation, true);
    window.addEventListener("deviceorientation", onOrientation, true);
  }

  // Re-apply cone rotation when the map bearing changes
  function onMapRotate() {
    _applyConeRotation(_lastHeading);
  }
  map.on("rotate", onMapRotate);

  // Expose applyConeRotation for GPS-derived heading fallback
  _applyConeFn = _applyConeRotation;

  _headingCleanup = () => {
    window.removeEventListener("deviceorientationabsolute", onOrientation, true);
    window.removeEventListener("deviceorientation", onOrientation, true);
    map.off("rotate", onMapRotate);
    _applyConeFn = null;
  };
}

function _stopHeadingWatch() {
  if (_headingCleanup) { _headingCleanup(); _headingCleanup = null; }
  _hasCompassHeading = false;
  _gpsHeadingPrev = null;
}

/* ── GPS-derived heading fallback ─────────────────────────────────────────── */
// When the device has no magnetometer (or the API is blocked), compute heading
// from successive GPS positions once the user moves > 5 m.

let _applyConeFn = null;
let _gpsHeadingPrev = null;  // { lat, lng, time }
const GPS_HEADING_MIN_DIST = 5; // metres

function _updateGpsHeading(lat, lng) {
  // Only act as fallback — compass takes priority
  if (_hasCompassHeading) { _gpsHeadingPrev = null; return; }

  const now = performance.now();
  if (!_gpsHeadingPrev) {
    _gpsHeadingPrev = { lat, lng, time: now };
    return;
  }

  const dist = _haversineM(_gpsHeadingPrev.lat, _gpsHeadingPrev.lng, lat, lng);
  if (dist < GPS_HEADING_MIN_DIST) return;

  const heading = _bearing(_gpsHeadingPrev.lat, _gpsHeadingPrev.lng, lat, lng);
  _gpsHeadingPrev = { lat, lng, time: now };
  if (_applyConeFn) _applyConeFn(heading);
}

/** Haversine distance in metres between two lat/lng points */
function _haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial bearing (degrees, clockwise from north) between two lat/lng points */
function _bearing(lat1, lng1, lat2, lng2) {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const dLng = (lng2 - lng1) * toRad;
  const y = Math.sin(dLng) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
            Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLng);
  return (Math.atan2(y, x) * toDeg + 360) % 360;
}

/* ── Smooth location interpolation ────────────────────────────────────────── */

let _locLerpPos = null;   // current rendered { lng, lat }
let _locLerpRaf = null;
const LOC_LERP_DURATION = 1000;  // ms for smooth transition

function _lerpLocMarkerTo(lng, lat) {
  if (!locMarker || !_locLerpPos) {
    if (locMarker) locMarker.setLngLat([lng, lat]);
    _locLerpPos = { lng, lat };
    return;
  }

  const from = { lng: _locLerpPos.lng, lat: _locLerpPos.lat };
  const to = { lng, lat };
  const start = performance.now();

  // Cancel any in-progress lerp
  if (_locLerpRaf) cancelAnimationFrame(_locLerpRaf);

  function tick(now) {
    const t = Math.min((now - start) / LOC_LERP_DURATION, 1);
    // Ease-out cubic for natural deceleration
    const ease = 1 - Math.pow(1 - t, 3);
    const cLng = from.lng + (to.lng - from.lng) * ease;
    const cLat = from.lat + (to.lat - from.lat) * ease;
    locMarker.setLngLat([cLng, cLat]);
    _locLerpPos = { lng: cLng, lat: cLat };
    if (t < 1) {
      _locLerpRaf = requestAnimationFrame(tick);
    } else {
      _locLerpRaf = null;
    }
  }

  _locLerpRaf = requestAnimationFrame(tick);
}

function _cancelLocLerp() {
  if (_locLerpRaf) { cancelAnimationFrame(_locLerpRaf); _locLerpRaf = null; }
  _locLerpPos = null;
}

export function setActiveTab(id) {
  document.querySelectorAll("#tab-bar .tab").forEach((t) => t.classList.remove("active-tab"));
  if (id) {
    const t = document.getElementById(id);
    if (t) t.classList.add("active-tab");
  }
}

if (map.loaded()) syncHomeMarker();
else map.on("load", syncHomeMarker);

window.addEventListener("hf:home-updated", () => {
  if (map.loaded()) syncHomeMarker();
  else map.once("load", syncHomeMarker);
});

function updateUrlHash() {
  const { lat, lng } = map.getCenter();
  const z = map.getZoom().toFixed(1);
  history.replaceState(null, "", `#${z}/${lat.toFixed(4)}/${lng.toFixed(4)}`);
}

// ── 3D building helpers ────────────────────────────────────────────
// Feature-ID hash used for pseudo-random per-building variation
const _idHash = ["%", ["+", ["coalesce", ["to-number", ["id"]], 0], 37], 9];

// Height: render_height → levels×3.5 → conservative 5 m fallback
// A low default prevents random heights from masking real OSM data
// for well-mapped structures (cathedrals, towers, building:parts).
const _bldgHeight = [
  "case",
  ["has", "render_height"], ["to-number", ["get", "render_height"]],
  ["has", "levels"],        ["*", ["to-number", ["get", "levels"]], 3.5],
  5,
];

// Base height: critical for stacked building:parts (e.g. cathedral dome on drum)
const _bldgBase = [
  "case",
  ["has", "render_min_height"], ["to-number", ["get", "render_min_height"]],
  0,
];

// Per-building wall colour: OSM colour → 9-bucket Nordic palette keyed by ID
const _wallColor = [
  "case",
  ["has", "colour"], ["get", "colour"],
  ["match", _idHash,
    0, "#eae5db",   // warm cream plaster
    1, "#e0e2ea",   // cool blue-grey concrete
    2, "#ede7dd",   // light sandstone
    3, "#dbe0ea",   // steel blue modern
    4, "#e7e2d6",   // warm stone
    5, "#dfe4e0",   // sage painted concrete
    6, "#ebe6e0",   // warm linen
    7, "#d8dee8",   // slate grey
    /* 8 */ "#e5ddd5", // light terracotta
  ],
];

// Roof shade: slightly darker / cooler than the matching wall bucket
const _roofColor = [
  "case",
  ["has", "colour"], ["get", "colour"],
  ["match", _idHash,
    0, "#d8d3c9",
    1, "#ced1d8",
    2, "#dbd5cb",
    3, "#c9ced8",
    4, "#d5d0c4",
    5, "#cdd2ce",
    6, "#d9d4ce",
    7, "#c6ccd6",
    /* 8 */ "#d3cbc3",
  ],
];

const _3D_LAYER_IDS = ["building-3d-shadow", "building-3d", "building-3d-roof"];
// Show all building geometry; hide_3d outlines are filtered out
const _bldgFilter = ["!=", ["get", "hide_3d"], true];

export function enable3D() {
  // 3D building extrusion is intentionally disabled.
  is3DActive = false;
  return;
  is3DActive = true;

  // Low warm sun → deep face shadows, highlights on sunlit walls
  map.setLight({
    anchor: "map",
    color: "#fdf6e8",
    intensity: 0.6,
    position: [1.5, 195, 25],
  });

  if (!map.getLayer("sky-layer")) {
    map.addLayer({
      id: "sky-layer",
      type: "sky",
      paint: {
        "sky-type": "atmosphere",
        "sky-atmosphere-sun": [195, 25],
        "sky-atmosphere-sun-intensity": 10,
      },
    });
  }

  map.setLayoutProperty("building", "visibility", "none");
  map.setLayoutProperty("building_shadow", "visibility", "none");
  map.setLayoutProperty("building_outline", "visibility", "none");

  // ── Layer 1: ground contact shadow ──
  if (!map.getLayer("building-3d-shadow")) {
    map.addLayer({
      id: "building-3d-shadow",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 15,
      filter: _bldgFilter,
      paint: {
        "fill-color": "#000",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.5, 0.06, 17, 0.12],
        "fill-translate": [2, 3],
        "fill-translate-anchor": "viewport",
      },
    }, "label_road");
  } else {
    map.setLayoutProperty("building-3d-shadow", "visibility", "visible");
  }

  // ── Layer 2: main building walls ──
  if (!map.getLayer("building-3d")) {
    map.addLayer({
      id: "building-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13,
      filter: _bldgFilter,
      paint: {
        "fill-extrusion-color": _wallColor,
        "fill-extrusion-height": _bldgHeight,
        "fill-extrusion-base": _bldgBase,
        "fill-extrusion-opacity": [
          "interpolate", ["linear"], ["zoom"],
          13, 0, 13.5, 0.65, 15, 0.92,
        ],
        "fill-extrusion-vertical-gradient": true,
      },
    }, "label_road");
  } else {
    map.setLayoutProperty("building-3d", "visibility", "visible");
  }

  // ── Layer 3: roof cap (thin slab, distinct shade) ──
  if (!map.getLayer("building-3d-roof")) {
    map.addLayer({
      id: "building-3d-roof",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 14.5,
      filter: _bldgFilter,
      paint: {
        "fill-extrusion-color": _roofColor,
        "fill-extrusion-height": _bldgHeight,
        "fill-extrusion-base": ["-", _bldgHeight, 0.8],
        "fill-extrusion-opacity": [
          "interpolate", ["linear"], ["zoom"],
          14.5, 0, 15.5, 0.95,
        ],
        "fill-extrusion-vertical-gradient": false,
      },
    }, "label_road");
  } else {
    map.setLayoutProperty("building-3d-roof", "visibility", "visible");
  }
}

export function disable3D() {
  is3DActive = false;
  map.setLight({ anchor: "viewport", color: "#fff", intensity: 0, position: [1.15, 210, 30] });
  if (map.getLayer("sky-layer")) map.removeLayer("sky-layer");
  _3D_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  });
  map.setLayoutProperty("building", "visibility", "visible");
  map.setLayoutProperty("building_shadow", "visibility", "visible");
  map.setLayoutProperty("building_outline", "visibility", "visible");
}

// ── Theme: switch between light, dark, and "auto" (follow OS) ──────────────
function _getSystemThemeMQ() {
  if (!_systemThemeMQ) _systemThemeMQ = window.matchMedia("(prefers-color-scheme: dark)");
  return _systemThemeMQ;
}

/** Applies the actual light/dark visual theme (not a mode) to the DOM. */
function _applyResolvedTheme(isDark) {
  currentTheme = isDark ? "dark" : "light";
  document.body.classList.add("theme-transition");
  document.documentElement.classList.toggle("dark-mode", isDark);
  document.body.classList.toggle("dark-mode", isDark);
  document.getElementById("map")?.classList.toggle("dark-mode", isDark);
  setTimeout(() => document.body.classList.remove("theme-transition"), 500);
}

/** Re-applies the resolved OS theme while "auto" mode is selected and the OS preference changes live. */
function _onSystemThemeChange() {
  if (themeMode !== "auto") return;
  _applyResolvedTheme(_getSystemThemeMQ().matches);
  _syncStyleButtons();
}

/**
 * Set the Theme mode: "light", "dark", or "auto" (follow the OS-level
 * `prefers-color-scheme` setting live, same "explicit override on top of
 * the OS preference" shape as utils.js's reduce-motion toggle). "auto" isn't
 * a third visual theme of its own — it resolves to light or dark based on
 * the OS preference and keeps following it for as long as it stays selected.
 * @param {"light"|"dark"|"auto"} mode
 * @returns {void}
 */
export function setTheme(mode) {
  if (mode === themeMode) return;
  themeMode = mode;
  const mq = _getSystemThemeMQ();
  mq.removeEventListener("change", _onSystemThemeChange);
  if (mode === "auto") {
    mq.addEventListener("change", _onSystemThemeChange);
    _applyResolvedTheme(mq.matches);
  } else {
    _applyResolvedTheme(mode === "dark");
  }
  try { localStorage.setItem("theme", mode); } catch (_) {}
  _syncStyleButtons();
}

// ── Restore saved theme on load (before first render to avoid flash) ──
(function restoreSavedTheme() {
  try {
    const saved = localStorage.getItem("theme");
    const defaultTheme = getAppSettings().defaultTheme;
    const restoredMode = saved === "light" || saved === "dark" || saved === "auto" ? saved : defaultTheme;
    themeMode = restoredMode;
    const mq = _getSystemThemeMQ();
    const isDark = restoredMode === "auto" ? mq.matches : restoredMode === "dark";
    if (restoredMode === "auto") mq.addEventListener("change", _onSystemThemeChange);
    currentTheme = isDark ? "dark" : "light";
    document.documentElement.classList.toggle("dark-mode", isDark);
    document.body.classList.toggle("dark-mode", isDark);
    document.getElementById("map")?.classList.toggle("dark-mode", isDark);
    _syncStyleButtons();
  } catch (_) {}
})();

(function restoreMapVisualPreferences() {
  try {
    const savedDetail = localStorage.getItem("map-detail-mode");
    if (MAP_DETAIL_MODES.has(savedDetail)) mapDetailMode = savedDetail;
    else mapDetailMode = getAppSettings().defaultDetailMode;
    const savedMarkers = localStorage.getItem("marker-visual-mode");
    if (MARKER_VISUAL_MODES.has(savedMarkers)) markerVisualMode = savedMarkers;
    else markerVisualMode = getAppSettings().defaultMarkerMode;
  } catch (_) {}
  _applyMarkerVisualClass();
})();

function _applyMarkerVisualClass() {
  document.body.classList.toggle("marker-style-compact", markerVisualMode === "compact");
  document.body.classList.toggle("marker-style-bold", markerVisualMode === "bold");
}

function _applyMapDetail() {
  _syncTrafficDetailForMode();
  if (isSatelliteActive && !isHybridSatelliteActive) return;
  _snapshotDetailPaint();
  _restoreDetailPaint();
  const hidden = DETAIL_HIDDEN_BY_MODE[mapDetailMode] || DETAIL_HIDDEN_BY_MODE.standard;
  DETAIL_LAYER_IDS.forEach((id) => {
    if (!map.getLayer(id)) return;
    map.setLayoutProperty(id, "visibility", hidden.has(id) ? "none" : "visible");
  });
  _applyDetailPaintPreset(mapDetailMode);
}

function _syncTrafficDetailForMode() {
  const enabled = getAppSettings().trafficEnabled && mapDetailMode === "detailed";
  const changed = enabled !== _trafficDetailModeEnabled;
  _trafficDetailModeEnabled = enabled;
  setTrafficDetailOverlay(enabled);
  if (changed && enabled && map.getZoom() < 15) {
    showToast("Zoom in for traffic details", "traffic", "Signals, crossings, stops, and calming appear at street level.");
  }
}

function _snapshotDetailPaint() {
  Object.entries(DETAIL_PAINT_LAYER_PROPS).forEach(([id, props]) => {
    if (!map.getLayer(id) || _detailPaintSnapshots[id]) return;
    _detailPaintSnapshots[id] = {};
    props.forEach((prop) => {
      _detailPaintSnapshots[id][prop] = map.getPaintProperty(id, prop);
    });
  });
}

function _restoreDetailPaint() {
  Object.entries(_detailPaintSnapshots).forEach(([id, props]) => {
    if (!map.getLayer(id)) return;
    Object.entries(props).forEach(([prop, value]) => {
      map.setPaintProperty(id, prop, value);
    });
  });
}

function _applyDetailPaintPreset(mode) {
  const preset = DETAIL_PAINT_PRESETS[mode];
  if (!preset) return;
  Object.entries(preset).forEach(([id, props]) => {
    if (!map.getLayer(id)) return;
    Object.entries(props).forEach(([prop, value]) => {
      map.setPaintProperty(id, prop, value);
    });
  });
}

/**
 * Applies the map-detail preset to vector layers.
 * @param {"clean"|"standard"|"detailed"} mode - Detail preset to apply.
 * @returns {void}
 */
export function setMapDetailMode(mode) {
  if (!MAP_DETAIL_MODES.has(mode)) return;
  mapDetailMode = mode;
  try { localStorage.setItem("map-detail-mode", mode); } catch (_) {}
  _applyMapDetail();
  _syncStyleButtons();
}

/**
 * Applies the marker visual preset to map markers.
 * @param {"default"|"compact"|"bold"} mode - Marker visual preset to apply.
 * @returns {void}
 */
export function setMarkerVisualMode(mode) {
  if (!MARKER_VISUAL_MODES.has(mode)) return;
  markerVisualMode = mode;
  try { localStorage.setItem("marker-visual-mode", mode); } catch (_) {}
  _applyMarkerVisualClass();
  _syncStyleButtons();
}

// Pre-register the satellite raster source so tiles start caching early.
// Called from map "load" — the source exists but no layer renders until toggled.
export function preloadSatelliteSource() {
  if (!map.getSource(SAT_SOURCE_ID)) {
    map.addSource(SAT_SOURCE_ID, {
      type: "raster",
      tiles: SAT_TILES,
      tileSize: 256,
      maxzoom: 19,
      attribution: SAT_ATTRIBUTION,
    });
  }
}

// ── Satellite toggle ──────────────────────────────────────────────
export function toggleSatellite() {
  if (!getAppSettings().satelliteEnabled) return;
  _setSatelliteMode(isSatelliteActive && !isHybridSatelliteActive ? "off" : "satellite");
}

/**
 * Toggles satellite imagery with vector roads and labels restored above it.
 * @returns {void}
 */
export function toggleHybridSatellite() {
  if (!getAppSettings().hybridEnabled) return;
  _setSatelliteMode(isSatelliteActive && isHybridSatelliteActive ? "off" : "hybrid");
}

function _setSatelliteMode(mode) {
  if (!origLabelPaint.label_road) _snapshotLabels();
  isSatelliteActive = mode !== "off";
  isHybridSatelliteActive = mode === "hybrid";
  document.getElementById("map").classList.toggle("satellite-active", isSatelliteActive);

  if (isSatelliteActive) {
    if (is3DActive) disable3D();

    showLoadingToast("Loading satellite imagery…");

    VECTOR_BASE_IDS.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    });
    if (isHybridSatelliteActive) {
      HYBRID_VECTOR_IDS.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
      });
    }

    // Ensure source exists (normally pre-registered on load)
    preloadSatelliteSource();

    if (!map.getLayer("style-raster")) {
      map.addLayer(
        { id: "style-raster", type: "raster", source: SAT_SOURCE_ID, paint: { "raster-opacity": 1 } },
        "label_road",
      );
    } else {
      map.setLayoutProperty("style-raster", "visibility", "visible");
    }
    if (isHybridSatelliteActive) {
      HYBRID_VECTOR_IDS.forEach((id) => {
        if (map.getLayer(id) && map.getLayer("label_road")) map.moveLayer(id, "label_road");
      });
    }
    // Force MapLibre to request tiles immediately
    map.triggerRepaint();

    // Dismiss loading toast once tiles finish loading
    map.once("idle", () => { hideLoadingToast(); });

    // Keep the Finland mask above satellite — dark fill, only covering land.
    // Place it before label_road so labels remain visible above the mask.
    if (map.getLayer("finland-mask")) {
      map.moveLayer("finland-mask", "label_road");
      map.setPaintProperty("finland-mask", "fill-color", "#1a1a1a");
      map.setPaintProperty("finland-mask", "fill-opacity", 0.65);
    }

    // Show water fill above the mask so ocean isn't greyed out.
    // Use a natural ocean colour that matches the satellite aesthetic.
    if (map.getLayer("water")) {
      if (!origWaterColor) origWaterColor = map.getPaintProperty("water", "fill-color");
      map.setLayoutProperty("water", "visibility", "visible");
      map.moveLayer("water", "label_road");
      map.setPaintProperty("water", "fill-color", "#0a1e33");
    }
    // Restyle bridges for satellite — dark semi-transparent to blend with imagery
    const SAT_BRIDGE_COLORS = { bridge_minor_casing: "rgba(60, 60, 60, 0.6)", bridge_major_casing: "rgba(60, 60, 60, 0.6)", bridge_minor: "rgba(120, 115, 105, 0.7)", bridge_major: "rgba(120, 115, 105, 0.7)" };
    for (const id in SAT_BRIDGE_COLORS) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", "visible");
        map.moveLayer(id, "label_road");
        map.setPaintProperty(id, "line-color", SAT_BRIDGE_COLORS[id]);
      }
    }
    // Hide waterways (thin lines not useful in satellite)
    if (map.getLayer("waterway")) {
      map.setLayoutProperty("waterway", "visibility", "none");
    }
    // Keep water labels visible above satellite
    if (map.getLayer("label_water")) {
      map.setLayoutProperty("label_water", "visibility", "visible");
      map.moveLayer("label_water", "label_place_city");
    }

    const visibleSatelliteLabels = isHybridSatelliteActive
      ? LABEL_IDS
      : ["label_place_city", "label_country"];
    LABEL_IDS.forEach(id => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, visibleSatelliteLabels.includes(id) ? "visible" : "none");
      }
    });
    visibleSatelliteLabels.forEach(id => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", "visible");
        map.setPaintProperty(id, "text-color", "#ffffff");
        map.setPaintProperty(id, "text-halo-color", "rgba(0,0,0,0.75)");
        map.setPaintProperty(id, "text-halo-width", 1.5);
      }
    });
    if (isHeatmapActive && map.getLayer("heatmap-layer")) {
      map.moveLayer("heatmap-layer", "label_road");
    }
    _applyMapDetail();
    refreshTrafficDetailOverlayLayers();
    map.setMaxPitch(0);
    map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
  } else {
    if (map.getLayer("style-raster")) {
      map.setLayoutProperty("style-raster", "visibility", "none");
    }

    VECTOR_BASE_IDS.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    });

    // Restore mask to its original position and vector-style paint
    if (map.getLayer("finland-mask")) {
      map.setPaintProperty("finland-mask", "fill-color", [
        "interpolate", ["linear"], ["zoom"], 7, "#d3e3bb", 9, "#ffffff",
      ]);
      map.setPaintProperty("finland-mask", "fill-opacity", 1);
      if (map.getLayer("label_road")) map.moveLayer("finland-mask", "label_road");
    }

    // Restore water, bridges above mask but below labels (same as initial setup in app.js)
    ["water", "water_shoreline", "waterway",
     "bridge_minor_casing", "bridge_minor",
     "bridge_major_casing", "bridge_major",
     "admin_country"].forEach(id => {
      if (map.getLayer(id) && map.getLayer("label_road")) {
        map.moveLayer(id, "label_road");
      }
    });
    // Restore water paint to vector defaults
    if (origWaterColor && map.getLayer("water")) {
      map.setPaintProperty("water", "fill-color", origWaterColor);
    }
    // Restore bridge colors to vector defaults
    const VEC_BRIDGE_COLORS = {
      bridge_minor_casing: "#d7d1c8",
      bridge_major_casing: "#bfb5aa",
      bridge_minor: "#f0ebe3",
      bridge_major: "#e7dccd",
    };
    for (const id in VEC_BRIDGE_COLORS) {
      if (map.getLayer(id)) map.setPaintProperty(id, "line-color", VEC_BRIDGE_COLORS[id]);
    }

    // Restore all label visibility and paint in a single pass
    LABEL_IDS.forEach((id) => {
      if (!map.getLayer(id)) return;
      map.setLayoutProperty(id, "visibility", "visible");
      const o = origLabelPaint[id];
      if (o) {
        map.setPaintProperty(id, "text-color", o.color);
        map.setPaintProperty(id, "text-halo-color", o.halo);
        map.setPaintProperty(id, "text-halo-width", o.haloW);
      }
    });
    _applyMapDetail();
    map.setMaxPitch(85);
    refreshTrafficDetailOverlayLayers();
  }

  updateMarkerVisibility();
  _syncStyleButtons();
}

// ── Heatmap toggle ────────────────────────────────────────────────
const HEATMAP_FADE_MS = 350;
let _heatmapFadeTimer = 0;

export function toggleHeatmap() {
  if (!getAppSettings().heatmapEnabled) return;
  isHeatmapActive = !isHeatmapActive;
  clearTimeout(_heatmapFadeTimer);

  if (isHeatmapActive) {
    const geojson = buildHeatmapGeoJSON();
    if (!map.getSource("heatmap-src")) {
      map.addSource("heatmap-src", { type: "geojson", data: geojson });
    } else {
      map.getSource("heatmap-src").setData(geojson);
    }

    if (!map.getLayer("heatmap-layer")) {
      map.addLayer({
        id: "heatmap-layer",
        type: "heatmap",
        source: "heatmap-src",
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 12, 1, 15, 1.4],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.15, "rgba(26,115,184,0.4)",
            0.35, "rgba(31,168,106,0.55)",
            0.55, "rgba(255,200,0,0.65)",
            0.75, "rgba(255,120,0,0.75)",
            1, "rgba(255,40,40,0.85)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 30, 12, 50, 15, 70],
          "heatmap-opacity": 0,
          "heatmap-opacity-transition": { duration: HEATMAP_FADE_MS, delay: 0 },
        },
      }, "label_road");

      // Fade in after layer is added
      requestAnimationFrame(() => {
        map.setPaintProperty("heatmap-layer", "heatmap-opacity",
          ["interpolate", ["linear"], ["zoom"], 12, 0.85, 16, 0.45]);
      });

      // Click heatmap hotspot → zoom in closer
      map.on("click", "heatmap-layer", (e) => {
        if (!isHeatmapActive) return;
        const zoom = map.getZoom();
        const target = Math.min(zoom + 2, 15);
        if (target > zoom) {
          focusMapPoint(e.lngLat, { method: "flyTo", zoom: target, duration: 500 });
        }
      });
      map.on("mouseenter", "heatmap-layer", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "heatmap-layer", () => { map.getCanvas().style.cursor = ""; });
    } else {
      map.setLayoutProperty("heatmap-layer", "visibility", "visible");
      map.setPaintProperty("heatmap-layer", "heatmap-opacity", 0);
      requestAnimationFrame(() => {
        map.setPaintProperty("heatmap-layer", "heatmap-opacity",
          ["interpolate", ["linear"], ["zoom"], 12, 0.85, 16, 0.45]);
      });
      // Ensure heatmap renders above satellite raster
      if (isSatelliteActive && map.getLayer("style-raster")) {
        map.moveLayer("heatmap-layer", "label_road");
      }
    }
  } else {
    if (map.getLayer("heatmap-layer")) {
      map.setPaintProperty("heatmap-layer", "heatmap-opacity", 0);
      _heatmapFadeTimer = setTimeout(() => {
        if (!isHeatmapActive && map.getLayer("heatmap-layer")) {
          map.setLayoutProperty("heatmap-layer", "visibility", "none");
        }
      }, HEATMAP_FADE_MS);
    }
  }

  refreshTrafficDetailOverlayLayers();
  updateMarkerVisibility();
  _syncStyleButtons();
}

function _snapshotLabels() {
  LABEL_IDS.forEach((id) => {
    origLabelPaint[id] = {
      color: map.getPaintProperty(id, "text-color"),
      halo: map.getPaintProperty(id, "text-halo-color"),
      haloW: map.getPaintProperty(id, "text-halo-width"),
    };
  });
}

function _syncStyleButtons() {
  const settings = getAppSettings();
  document.querySelectorAll(".style-opt").forEach((el) => {
    const s = el.dataset.style;
    const disabled =
      (s === "satellite" && !settings.satelliteEnabled) ||
      (s === "hybrid" && !settings.hybridEnabled) ||
      (s === "heatmap" && !settings.heatmapEnabled);
    el.disabled = disabled;
    el.classList.toggle("disabled", disabled);
    if (s === "light" || s === "dark" || s === "auto") {
      el.classList.toggle("active", s === themeMode);
    } else if (s === "satellite") {
      el.classList.toggle("active", isSatelliteActive && !isHybridSatelliteActive);
    } else if (s === "hybrid") {
      el.classList.toggle("active", isSatelliteActive && isHybridSatelliteActive);
    } else if (s === "heatmap") {
      el.classList.toggle("active", isHeatmapActive);
    } else if (s?.startsWith("detail-")) {
      el.classList.toggle("active", s === `detail-${mapDetailMode}`);
    } else if (s?.startsWith("markers-")) {
      el.classList.toggle("active", s === `markers-${markerVisualMode}`);
    }
  });
  const isNonDefault =
    isSatelliteActive ||
    isHeatmapActive ||
    mapDetailMode !== "standard" ||
    markerVisualMode !== "default";
  document.getElementById("menu-pill")?.classList.toggle("active", isNonDefault);
}

export function refreshHeatmapSource() {
  if (!isHeatmapActive) return;
  const src = map.getSource("heatmap-src");
  if (src) src.setData(buildHeatmapGeoJSON());
}

document.querySelectorAll(".style-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    const s = btn.dataset.style;
    if (s === "light" || s === "dark" || s === "auto") setTheme(s);
    else if (s === "satellite") toggleSatellite();
    else if (s === "hybrid") toggleHybridSatellite();
    else if (s === "heatmap") toggleHeatmap();
    else if (s?.startsWith("detail-")) setMapDetailMode(s.replace("detail-", ""));
    else if (s?.startsWith("markers-")) setMarkerVisualMode(s.replace("markers-", ""));
  });
});

map.on("load", () => {
  _applyMapDetail();
  _syncStyleButtons();
});

// Home / zoom / locate buttons
document.getElementById("home-btn").addEventListener("click", () => {
  if (isSatelliteActive) _setSatelliteMode("off");
  if (isHeatmapActive) toggleHeatmap();
  if (mapDetailMode !== "standard") setMapDetailMode("standard");
  if (is3DActive) disable3D();
  setActiveTab(null);
  if (centerStoredHomeIfAvailable()) return;
  focusMapPoint(HELSINKI, { method: "flyTo", zoom: 12.2, bearing: 0, pitch: 0, duration: 600 });
  showToast("Add home", "home", "Pick an address or pin");
});
document.getElementById("zoomin-btn").addEventListener("click", () => map.zoomIn({ duration: 300 }));
document.getElementById("zoomout-btn").addEventListener("click", () => map.zoomOut({ duration: 300 }));
document.getElementById("locate-btn").addEventListener("click", showCurrentLocation);

map.on("moveend", updateUrlHash);

map.on("zoomend", () => setActiveTab(null));

map.on("pitchend", () => {
  if (is3DActive) disable3D();
  // Keep the map flat in pitched views as well.
});
