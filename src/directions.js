import { map } from "./map-init.js";
import { DIGITRANSIT_URL, DIGITRANSIT_WALTTI_URL, TRANSITOUS_URL, DT_API_KEY, NOMINATIM_VB, NOMINATIM_REV, DIGITRANSIT_GEO_URL, DIGITRANSIT_REV_URL } from "./config.js";
import { esc, escA, copyToClipboard, showToast, shareUrl, encodeCompactRoute, decompressItinerary, showLoadingToast, hideLoadingToast, initSheetDrag, initSegPill, haversineDistance, requestLocation } from "./utils.js";
import { MODE_PATHS, modeIcon, typeIcon, getThemeRailShopPurple, getThemeWalkColor } from "./icons.js";
import { setActiveTab } from "./map-controls.js";
import { placesData, activeTagFilters, closePlacesSheet } from "./places.js";
import { scoreMosque } from "./prayer.js";

// Navigation module hooks — set by navigation.js to avoid circular import
let _navHooks = { startNav: () => {}, stop: () => {}, pause: () => {}, resume: () => false, isActive: () => false, isPaused: () => false };
export function setNavHooks(hooks) { _navHooks = hooks; }
// Called by navigation.js when nav stops — re-shows snackbar if route is still active
export function onNavStopped() { updateSnackbar(); }

// --- State ---
export let dirTravelMode = "drive";
let routeRequested = false;
export let findingNearestMosque = false;
export function setFindingNearestMosque(v) { findingNearestMosque = v; }

export const OSRM_URLS = {
  drive: "https://routing.openstreetmap.de/routed-car/route/v1/driving",
  cycle: "https://routing.openstreetmap.de/routed-bike/route/v1/bike",
  walk: "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
};
function osrmColor(mode) { return mode === "walk" ? getThemeWalkColor() : OSRM_COLORS[mode]; }
const OSRM_COLORS = { cycle: "#1FA86A", drive: "#FF6319" };
const OSRM_CSS_COLORS = { walk: "var(--walk)", cycle: "var(--hsl-tram)", drive: "var(--hsl-trunk)" };
export const OSRM_LABELS = { walk: "Walking", cycle: "Cycling", drive: "Driving" };
const OSRM_ALT_COLORS = { walk: "#94A3B8", cycle: "#34D399", drive: "#FBBF24" };
const ALT_ROUTE_OPACITY = 0.4;
const ALT_ROUTE_WIDTH = 4;
const ROAD_CORRIDOR_OPACITY = 0.18;
const ROAD_CORRIDOR_WIDTH_ADD = 10;

export const dir = {
  origin: null, dest: null, pickField: null,
  itineraries: [], activeIdx: -1, directInfo: null,
  originMarker: null, destMarker: null,
  waypoints: [], waypointMarkers: [],
  routeLayers: [], routeSources: [], usingFallback: false,
  directRouteCoords: null, // [lng,lat][] for direct routes — used by navigation
  directSteps: null,       // raw OSRM/OTP steps — used by navigation
  directMaxspeeds: null,   // OSRM per-segment maxspeed annotations
};

// --- DOM refs ---
const dirPanel = document.getElementById("dir-panel");
const dirFrom = document.getElementById("dir-from");
const dirTo = document.getElementById("dir-to");
const dirGo = document.getElementById("dir-go");
const dirEmpty = document.getElementById("dir-empty");
const dirLoad = document.getElementById("dir-loading");
const dirErr = document.getElementById("dir-error");
const dirItins = document.getElementById("dir-itineraries");
const routeSnackbar = document.getElementById("route-snackbar");
const snackTags = document.getElementById("snack-tags");
const dirClearBtn = document.getElementById("dir-clear-route");
const dirShareBtn = document.getElementById("dir-share-route");
const dirWaypointsCt = document.getElementById("dir-waypoints");
const dirAddStopBtn = document.getElementById("dir-add-stop");
const MAX_WAYPOINTS = 3;

// --- Waypoints ---
function _createWaypointEl(idx) {
  const wrap = document.createElement("div");
  wrap.className = "dir-field-wrap";
  wrap.dataset.wpIdx = idx;
  wrap.innerHTML = `<div class="dir-field" id="dir-field-wp-${idx}">
    <span class="dir-dot waypoint">${idx + 1}</span>
    <input id="dir-wp-${idx}" type="text" placeholder="Stop ${idx + 1} — tap map or type" autocomplete="off"/>
    <button class="dir-field-btn dir-wp-remove" data-wp-idx="${idx}" title="Remove stop" aria-label="Remove stop">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  </div>
  <ul id="dir-wp-${idx}-suggest" class="dir-suggest hide"></ul>`;
  return wrap;
}

function _renderWaypoints() {
  dirWaypointsCt.innerHTML = "";
  dir.waypoints.forEach((wp, i) => {
    const el = _createWaypointEl(i);
    dirWaypointsCt.appendChild(el);
    const input = el.querySelector(`#dir-wp-${i}`);
    if (wp) input.value = wp.name || "";
    setupDirAutocomplete(input, el.querySelector(`#dir-wp-${i}-suggest`), `wp-${i}`);
  });
  dirAddStopBtn.classList.toggle("hide", dir.waypoints.length >= MAX_WAYPOINTS);
  dirSnap.remeasure();
}

function addWaypoint() {
  if (dir.waypoints.length >= MAX_WAYPOINTS) return;
  dir.waypoints.push(null);
  _renderWaypoints();
  startPick(`wp-${dir.waypoints.length - 1}`);
}

function removeWaypoint(idx) {
  dir.waypoints.splice(idx, 1);
  if (dir.waypointMarkers[idx]) { dir.waypointMarkers[idx].remove(); }
  dir.waypointMarkers.splice(idx, 1);
  _renderWaypoints();
  updateGoButton();
}

function placeWaypointMarker(idx, lng, lat) {
  if (dir.waypointMarkers[idx]) dir.waypointMarkers[idx].remove();
  const el = document.createElement("div");
  el.className = "dir-waypoint-marker";
  el.textContent = idx + 1;
  dir.waypointMarkers[idx] = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
}

function clearWaypointMarkers() {
  dir.waypointMarkers.forEach(m => { if (m) m.remove(); });
  dir.waypointMarkers = [];
}

dirAddStopBtn.addEventListener("click", addWaypoint);
dirWaypointsCt.addEventListener("click", (e) => {
  const btn = e.target.closest(".dir-wp-remove");
  if (btn) { e.stopPropagation(); removeWaypoint(+btn.dataset.wpIdx); }
});

// --- Panel open/close ---
export function openDirPanel() {
  if (dirPanel._hideTimeout) { clearTimeout(dirPanel._hideTimeout); dirPanel._hideTimeout = null; }
  closePlacesSheet();
  if (_navHooks.isActive()) _navHooks.pause();
  dirPanel.hidden = false;
  dirPanel.style.height = "";
  document.getElementById("scrim").classList.remove("hide");
  routeSnackbar.classList.add("hide");
  setActiveTab("dir-btn");
  if (dir.originMarker) dir.originMarker.getElement().style.display = "";
  if (dir.destMarker) dir.destMarker.getElement().style.display = "";
  dir.waypointMarkers.forEach(m => { if (m) m.getElement().style.display = ""; });
  if (!dir.pickField) startPick("from");
  dirSnap.open();
}

export function closeDirPanel() {
  if (dirPanel._animCleanup) { clearTimeout(dirPanel._animCleanup); dirPanel._animCleanup = null; }
  if (dirPanel._hideTimeout) { clearTimeout(dirPanel._hideTimeout); dirPanel._hideTimeout = null; }
  dirSnap.close();                               // cleanup → reflow → adds .shut with real transition
  document.getElementById("scrim").classList.add("hide");
  stopPick();
  // If nav was paused (user opened panel via expand), resume it on close
  if (_navHooks.isPaused()) { _navHooks.resume(); }
  updateSnackbar();
  setActiveTab(null);
  if ((dir.activeIdx < 0 || !dir.itineraries[dir.activeIdx]) && !dir.directInfo) {
    if (dir.originMarker) dir.originMarker.getElement().style.display = "none";
    if (dir.destMarker) dir.destMarker.getElement().style.display = "none";
    dir.waypointMarkers.forEach(m => { if (m) m.getElement().style.display = "none"; });
  }
  dirPanel._hideTimeout = setTimeout(() => { dirPanel.hidden = true; dirSnap.cleanup(); dirPanel._hideTimeout = null; }, 400);
}

export function fullCloseDirPanel() {
  unfocusRoute();
  closeDirPanel();
  clearRoute();
  exitResultsMode();
  if (dir.originMarker) { dir.originMarker.remove(); dir.originMarker = null; }
  if (dir.destMarker) { dir.destMarker.remove(); dir.destMarker = null; }
  clearWaypointMarkers();
  dir.waypoints = [];
  dirWaypointsCt.innerHTML = "";
  dirAddStopBtn.classList.remove("hide");
}

document.getElementById("dir-btn").addEventListener("click", () =>
  dirPanel.classList.contains("shut") ? openDirPanel() : closeDirPanel(),
);
document.getElementById("dir-close").addEventListener("click", closeDirPanel);

const dirSnap = initSheetDrag(dirPanel, closeDirPanel);

function getDirPanelContentHeight() {
  let height = 0;
  for (const child of dirPanel.children) {
    if (!child.offsetWidth && !child.offsetHeight) continue;
    const styles = getComputedStyle(child);
    const ownHeight = parseFloat(styles.flexGrow) > 0 ? child.scrollHeight : child.offsetHeight;
    height += ownHeight + parseFloat(styles.marginTop) + parseFloat(styles.marginBottom);
  }
  return height;
}

function maybeExpandResultsFullscreen() {
  if (window.innerWidth > 768) return;
  if (dirPanel.classList.contains("shut") || dirPanel.classList.contains("route-focused")) return;
  if (!dirPanel.classList.contains("results-shown") || dirPanel.classList.contains("search-editing")) return;
  if (!(dir.directInfo || dir.itineraries.length === 1)) return;

  const contentRatio = getDirPanelContentHeight() / window.innerHeight;
  if (contentRatio < 0.75) return;

  dirPanel.classList.add("full");
  dirPanel.style.height = "";
}

function syncResultsPanelHeight() {
  dirSnap.remeasure();
  maybeExpandResultsFullscreen();
}

// Auto-remeasure sheet height after animated sections finish transitioning
const dirTimeBar = document.getElementById("dir-time-bar");
dirTimeBar.addEventListener("transitionend", (e) => {
  if (e.propertyName === "grid-template-rows") dirSnap.remeasure();
});
const dirCustomRow_el = document.getElementById("dir-custom-time-row");
dirCustomRow_el.addEventListener("transitionend", (e) => {
  if (e.propertyName === "grid-template-rows") dirSnap.remeasure();
});

dirPanel.dataset.travelMode = "drive";

// Sliding pill highlight for transport mode
const moveModePill = initSegPill(document.getElementById("dir-mode-toggle"));

document.querySelectorAll(".mode-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-opt").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    moveModePill(btn);
    dirTravelMode = btn.dataset.mode;

    // Apply real mode change
    dirPanel.dataset.travelMode = dirTravelMode;
    dirTimeBar.classList.toggle("show", dirTravelMode === "transit");
    if (dirTravelMode === "transit") {
      const activeTime = document.querySelector("#dir-time-toggle .time-opt.active");
      if (activeTime) moveTimePill(activeTime);
    }

    clearRoute();
    dir.itineraries = [];
    dir.activeIdx = -1;
    dir.directInfo = null;
    dirItins.innerHTML = "";
    dirEmpty.classList.remove("hide");
    dirLoad.classList.add("hide");
    dirErr.classList.add("hide");
    exitResultsMode();

    // remeasure handles the smooth height transition from current → target
    dirSnap.remeasure();

    // Auto-reload only if routes were already shown (user clicked Find Routes)
    if (dir.origin && dir.dest && routeRequested) findRoutes();
  });
});

document.querySelector(".snack-body").addEventListener("click", () => {
  if (dirPanel.classList.contains("shut")) openDirPanel();
});
document.getElementById("snackbar-nav").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!_navHooks.isActive() && !_navHooks.resume()) _navHooks.startNav();
});
document.getElementById("snackbar-close").addEventListener("click", (e) => {
  e.stopPropagation();
  fullCloseDirPanel();
  dir.origin = null;
  dir.dest = null;
  dirFrom.value = "";
  dirTo.value = "";
  dir.itineraries = [];
  dir.activeIdx = -1;
  dirItins.innerHTML = "";
  dirEmpty.classList.remove("hide");
  exitResultsMode();
  updateGoButton();
  routeRequested = false;
  findingNearestMosque = false;
});

dirClearBtn.addEventListener("click", () => {
  // Remove focused state directly (skip unfocusRoute's async transition)
  dirPanel.classList.remove("route-focused");
  document.querySelectorAll(".itin-card").forEach(c => c.classList.remove("focused", "card-hidden"));

  clearRoute();
  dir.itineraries = [];
  dir.activeIdx = -1;
  dir.origin = null;
  dir.dest = null;
  dirFrom.value = "";
  dirTo.value = "";
  if (dir.originMarker) { dir.originMarker.remove(); dir.originMarker = null; }
  if (dir.destMarker) { dir.destMarker.remove(); dir.destMarker = null; }
  clearWaypointMarkers();
  dir.waypoints = [];
  dirWaypointsCt.innerHTML = "";
  dirAddStopBtn.classList.remove("hide");
  dirItins.innerHTML = "";
  dirEmpty.classList.remove("hide");
  exitResultsMode();
  startPick("from");
  routeRequested = false;
  findingNearestMosque = false;

  // remeasure handles the smooth transition from current → target
  dirSnap.remeasure();
});

async function _buildRouteShareUrl() {
  if (!dir.origin || !dir.dest) return null;
  const hasTime = dirTravelMode === "transit" && !dirUseNow;
  const validWaypoints = dir.waypoints.filter(Boolean);
  const activeItin = dirTravelMode === "transit" && dir.activeIdx >= 0
    ? dir.itineraries[dir.activeIdx] : null;
  const token = await encodeCompactRoute({
    olat: dir.origin.lat, olng: dir.origin.lng,
    dlat: dir.dest.lat, dlng: dir.dest.lng,
    mode: dirTravelMode,
    oname: dir.origin.name ? dir.origin.name.slice(0, 60) : "",
    dname: dir.dest.name ? dir.dest.name.slice(0, 60) : "",
    tmode: dirTimeMode,
    tdate: hasTime ? getDateValue() : null,
    ttime: hasTime ? getTimeValue() : null,
    waypoints: validWaypoints.length ? validWaypoints : null,
    itinerary: activeItin,
  });
  return `${location.origin}${location.pathname}?r=${token}`;
}

dirShareBtn.addEventListener("click", async () => {
  const url = await _buildRouteShareUrl();
  if (!url) return;
  const title = `${dir.origin?.name || "Origin"} → ${dir.dest?.name || "Destination"}`;
  shareUrl(url, title, `${title} – Halal Finder`);
});

let _pendingItinIdx = null;
export function loadSharedRoute({ olat, olng, oname, dlat, dlng, dname, mode, tmode, tdate, ttime, waypoints, itinIdx, _compressedItinerary }) {
  _pendingItinIdx = itinIdx != null ? itinIdx : null;
  dir.origin = { lat: olat, lng: olng, name: oname || `${olat.toFixed(4)}, ${olng.toFixed(4)}` };
  dir.dest = { lat: dlat, lng: dlng, name: dname || `${dlat.toFixed(4)}, ${dlng.toFixed(4)}` };
  dirFrom.value = dir.origin.name;
  dirTo.value = dir.dest.name;
  placeOriginMarker(olng, olat);
  placeDestMarker(dlng, dlat);

  // Restore waypoints
  if (waypoints?.length) {
    dir.waypoints = waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng, name: wp.name || `${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}` }));
    dir.waypoints.forEach((wp, i) => placeWaypointMarker(i, wp.lng, wp.lat));
    _renderWaypoints();
  }

  // Set mode — replicate the full mode-toggle click behaviour
  const validModes = ["drive", "transit", "cycle", "walk"];
  if (validModes.includes(mode)) {
    dirTravelMode = mode;
    let activeBtn;
    document.querySelectorAll("#dir-mode-toggle .mode-opt").forEach(b => {
      const match = b.dataset.mode === mode;
      b.classList.toggle("active", match);
      if (match) activeBtn = b;
    });
    if (activeBtn) moveModePill(activeBtn);
    dirPanel.dataset.travelMode = mode;
    dirTimeBar.classList.toggle("show", mode === "transit");
    if (mode === "transit") {
      // Restore depart/arrive toggle
      if (tmode === "depart" || tmode === "arrive") {
        dirTimeMode = tmode;
        let activeTimeBtn;
        dirTimeToggles.forEach(b => {
          const match = b.dataset.mode === tmode;
          b.classList.toggle("active", match);
          if (match) activeTimeBtn = b;
        });
        if (activeTimeBtn) moveTimePill(activeTimeBtn);
      } else {
        const activeTime = document.querySelector("#dir-time-toggle .time-opt.active");
        if (activeTime) moveTimePill(activeTime);
      }
      // Restore custom date/time if shared
      if (tdate && ttime) {
        dirUseNow = false;
        dirTimeNow.classList.remove("active");
        dirCustomRow.classList.add("show");
        calSelectedDate = tdate;
        const [h, min] = ttime.split(":").map(Number);
        tpSelectedH = h; tpSelectedM = min;
        // Sync drum picker indices to match
        const [y, m, d] = tdate.split("-").map(Number);
        selDate = drumDates.findIndex(dd => dd.year === y && dd.month === m - 1 && dd.day === d);
        if (selDate < 0) selDate = 1; // fallback to Today
        selHour = drumHours.findIndex(hh => hh.value === h);
        if (selHour < 0) selHour = 0;
        selMin = drumMinutes.findIndex(mm => mm.value >= min);
        if (selMin < 0) selMin = 0;
        _syncPickerToState();
      }
    }
  }

  updateGoButton();
  openDirPanel();

  // Embedded transit itinerary — decompress and render directly (no API re-query)
  if (_compressedItinerary) {
    _pendingItinIdx = null;
    routeRequested = true;
    showDirLoading();
    dirPanel.classList.remove("search-editing");
    decompressItinerary(_compressedItinerary).then(itin => {
      dir.usingFallback = false;
      dir.itineraries = [itin];
      renderItineraries();
    }).catch(() => {
      setTimeout(() => findRoutes(), 100);
    });
    return;
  }

  // No embedded itinerary — re-query
  setTimeout(() => findRoutes(), 300);
}

dirItins.addEventListener("click", (e) => {
  // Direct-card clicks are handled by _bindDirectCardClicks — skip them here
  if (e.target.closest(".direct-card")) return;
  if (e.target.closest(".itin-navigate")) {
    e.stopPropagation();
    closeDirPanel();
    if (!_navHooks.isActive() && !_navHooks.resume()) _navHooks.startNav();
    return;
  }
  const stepEl = e.target.closest(".direct-step");
  if (stepEl && dir.directInfo?.stepGeometries) {
    const idx = parseInt(stepEl.dataset.stepIdx, 10);
    if (!isNaN(idx)) highlightDirectStep(idx, stepEl);
  }
});

// Scrim click — dismiss whichever panel is open
document.getElementById("scrim").addEventListener("click", () => {
  if (!dirPanel.classList.contains("shut")) closeDirPanel();
  else closePlacesSheet();
});

// --- Pick mode ---
export function startPick(field) {
  if (dir.activeIdx >= 0) return;
  dir.pickField = field;
  document.querySelectorAll(".dir-field").forEach((f) => f.classList.remove("picking"));
  let target;
  if (field === "from") target = dirFrom.parentElement;
  else if (field === "to") target = dirTo.parentElement;
  else if (field.startsWith("wp-")) target = document.getElementById(`dir-field-${field}`);
  if (target) target.classList.add("picking");
  map.getCanvas().classList.add("map-click-mode");
  updateGoButton();
}

export function stopPick() {
  dir.pickField = null;
  document.querySelectorAll(".dir-field").forEach((f) => f.classList.remove("picking"));
  map.getCanvas().classList.remove("map-click-mode");
}

export function updateGoButton() {
  dirGo.disabled = !(dir.origin && dir.dest);
}

dirFrom.addEventListener("focus", () => startPick("from"));
dirTo.addEventListener("focus", () => { startPick("to"); findingNearestMosque = false; });

// --- Autocomplete ---
const dirFromSuggest = document.getElementById("dir-from-suggest");
const dirToSuggest = document.getElementById("dir-to-suggest");
let dirSugDebounce = null;
const DIR_SUGGEST_MIN_QUERY_LENGTH = 2;
const DIR_SUGGEST_DEBOUNCE_MS = 300;
const DIR_SUGGEST_LIMIT = 5;
const DIR_LOCAL_SUGGEST_LIMIT = 4;
const _dirLocalTypeCls = {
  mosque: { type: "place_of_worship", cls: "amenity" },
  prayer_room: { type: "place_of_worship", cls: "amenity" },
  restaurant: { type: "restaurant", cls: "amenity" },
  shop: { type: "shop", cls: "shop" },
  cemetery: { type: "cemetery", cls: "amenity" },
};

function getDirInputForField(field) {
  if (field === "from") return dirFrom;
  if (field === "to") return dirTo;
  if (field?.startsWith("wp-")) return document.getElementById(`dir-wp-${field.slice(3)}`);
  return null;
}

function _normalizeDirSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function _searchLocalDirPlaces(query) {
  if (!placesData.length) return [];

  const normalizedQuery = _normalizeDirSearchText(query);
  if (!normalizedQuery) return [];

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const results = placesData
    .map((place) => {
      const normalizedName = _normalizeDirSearchText(place.name);
      const normalizedAddr = _normalizeDirSearchText(place.address);
      const haystack = `${normalizedName} ${normalizedAddr} ${place.type}`;
      if (!terms.every((term) => haystack.includes(term))) return null;

      const prefixBoost = normalizedName.startsWith(normalizedQuery) ? 4 : 0;
      const nameHitBoost = normalizedName.includes(normalizedQuery) ? 2 : 0;
      const score = prefixBoost + nameHitBoost;
      const icon = _dirLocalTypeCls[place.type] || { type: place.type, cls: "amenity" };

      return {
        lat: place.lat,
        lng: place.lng,
        name: place.name,
        addr: place.address,
        type: icon.type,
        cls: icon.cls,
        _score: score,
        _local: true,
      };
    })
    .filter(Boolean);

  results.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return a.name.localeCompare(b.name);
  });

  return results.slice(0, DIR_LOCAL_SUGGEST_LIMIT);
}

function _mergeDirSearchResults(localItems, apiItems) {
  const merged = [];
  const seen = new Set();

  const addItem = (item) => {
    if (!item) return;
    const key = `${_normalizeDirSearchText(item.name)}|${item.lat?.toFixed?.(5) || item.lat}|${item.lng?.toFixed?.(5) || item.lng}`;
    const nameKey = _normalizeDirSearchText(item.name);
    if (seen.has(key) || seen.has(nameKey)) return;
    seen.add(key);
    seen.add(nameKey);
    merged.push(item);
  };

  localItems.forEach(addItem);
  apiItems.forEach(addItem);
  return merged.slice(0, DIR_SUGGEST_LIMIT);
}

async function _searchDirLocations(query) {
  const localItems = _searchLocalDirPlaces(query);
  let apiItems = await _dtGeoSearch(query);
  if (!apiItems.length) apiItems = await _nominatimSearch(query);
  return _mergeDirSearchResults(localItems, apiItems);
}

function moveDirFocusToField(field, previousInput = null) {
  startPick(field);
  const nextInput = getDirInputForField(field);
  if (!nextInput) return;

  if (previousInput && previousInput !== nextInput) {
    previousInput.blur();
    if (typeof previousInput.setSelectionRange === "function") {
      previousInput.setSelectionRange(0, 0);
    }
  }

  requestAnimationFrame(() => {
    nextInput.focus({ preventScroll: true });
    if (typeof nextInput.setSelectionRange === "function") {
      const caret = nextInput.value.length;
      nextInput.setSelectionRange(caret, caret);
    }
  });
}

function setupDirAutocomplete(inputEl, suggestEl, field) {
  inputEl.addEventListener("input", () => {
    if (field === "from") dir.origin = null;
    else if (field === "to") dir.dest = null;
    else if (field.startsWith("wp-")) dir.waypoints[parseInt(field.slice(3), 10)] = null;
    routeRequested = false;
    updateGoButton();
    clearTimeout(dirSugDebounce);
    const q = inputEl.value.trim();
    if (q.length < DIR_SUGGEST_MIN_QUERY_LENGTH) { suggestEl.classList.add("hide"); return; }
    dirSugDebounce = setTimeout(() => dirGeoSearch(q, suggestEl, field), DIR_SUGGEST_DEBOUNCE_MS);
  });
  inputEl.addEventListener("focus", () => {
    if (field.startsWith("wp-")) startPick(field);
  });
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") suggestEl.classList.add("hide");
    if (e.key === "Enter") {
      e.preventDefault();
      suggestEl.classList.add("hide");
      const f = suggestEl.querySelector("li[data-lat]");
      if (f) f.click();
    }
  });
  suggestEl.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-lat]");
    if (!li) return;
    const lat = +li.dataset.lat, lng = +li.dataset.lng, name = li.dataset.name;
    inputEl.value = name;
    suggestEl.classList.add("hide");
    if (field === "from") {
      dir.origin = { lat, lng, name };
      placeOriginMarker(lng, lat);
      autoSetNearestMosque(lat, lng);
      if (!dir.dest) {
        const nextField = dir.waypoints.length ? (dir.waypoints[0] ? "to" : "wp-0") : "to";
        moveDirFocusToField(nextField, inputEl);
      }
    } else if (field.startsWith("wp-")) {
      const wpIdx = parseInt(field.slice(3), 10);
      dir.waypoints[wpIdx] = { lat, lng, name };
      placeWaypointMarker(wpIdx, lng, lat);
      const nextEmpty = dir.waypoints.findIndex((w, i) => i > wpIdx && !w);
      if (nextEmpty >= 0) moveDirFocusToField(`wp-${nextEmpty}`, inputEl);
      else if (!dir.dest) moveDirFocusToField("to", inputEl);
      else stopPick();
    } else {
      dir.dest = { lat, lng, name };
      placeDestMarker(lng, lat);
      stopPick();
      inputEl.blur();
    }
    updateGoButton();
  });
}

async function dirGeoSearch(q, suggestEl, field) {
  try {
    const items = await _searchDirLocations(q);
    if (!items.length) {
      suggestEl.innerHTML = '<li class="ds-none">No places found</li>';
      suggestEl.classList.remove("hide");
      return;
    }
    suggestEl.innerHTML = items
      .map((r) => `<li data-lat="${r.lat}" data-lng="${r.lng}" data-name="${escA(r.name)}"><span class="ds-icon">${typeIcon(r.type, r.cls)}</span><div class="ds-text"><div class="ds-name">${esc(r.name)}</div><div class="ds-addr">${esc(r.addr)}</div></div></li>`)
      .join("");
    suggestEl.classList.remove("hide");
  } catch {
    suggestEl.classList.add("hide");
  }
}

async function _dtGeoSearch(q) {
  try {
    const url = `${DIGITRANSIT_GEO_URL}?text=${encodeURIComponent(q)}&focus.point.lat=60.1699&focus.point.lon=24.9384&size=5&lang=en&boundary.country=FIN`;
    const res = await fetch(url, {
      headers: DT_API_KEY ? { "digitransit-subscription-key": DT_API_KEY } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features || []).map((f) => {
      const parts = (f.properties.label || "").split(",");
      const layer = f.properties.layer || "";
      return {
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        name: f.properties.name || parts[0].trim(),
        addr: parts.slice(1, 3).join(",").trim(),
        type: layer === "venue" ? "amenity" : layer === "address" ? "house" : "road",
        cls:  layer === "venue" ? "amenity" : layer === "address" ? "building" : layer === "street" ? "highway" : "place",
      };
    });
  } catch { return []; }
}

async function _nominatimSearch(q) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1&countrycodes=fi&viewbox=${NOMINATIM_VB}&bounded=1`,
      { headers: { "Accept-Language": "en" } },
    );
    if (!res.ok) return [];
    return (await res.json()).map((r) => ({
      lat: +r.lat, lng: +r.lon,
      name: r.display_name.split(",")[0],
      addr: r.display_name.split(",").slice(1, 3).join(", ").trim(),
      type: r.type, cls: r.class,
    }));
  } catch { return []; }
}

setupDirAutocomplete(dirFrom, dirFromSuggest, "from");
setupDirAutocomplete(dirTo, dirToSuggest, "to");

document.addEventListener("click", (e) => {
  if (!e.target.closest(".dir-field-wrap")) {
    dirFromSuggest.classList.add("hide");
    dirToSuggest.classList.add("hide");
  }
});

function closeOpenPanelOnMapInteract() {
  if (dir.pickField) return;
  const placesSheet = document.getElementById("places-sheet");
  if (!dirPanel.classList.contains("shut")) { closeDirPanel(); return; }
  if (!placesSheet.classList.contains("shut")) {
    closePlacesSheet();
  }
}
map.getCanvas().addEventListener("touchstart", closeOpenPanelOnMapInteract, { passive: true });
if (window.matchMedia("(hover: hover)").matches) {
  map.on("mousedown", closeOpenPanelOnMapInteract);
}

map.on("click", async (e) => {
  if (!dir.pickField) return;
  const { lng, lat } = e.lngLat;
  const field = dir.pickField;
  const name = await reverseGeocode(lat, lng);
  if (field === "from") {
    dir.origin = { lat, lng, name };
    dirFrom.value = name;
    placeOriginMarker(lng, lat);
    autoSetNearestMosque(lat, lng);
    if (dir.waypoints.length) startPick(dir.waypoints[0] ? "to" : "wp-0");
    else startPick("to");
  } else if (field.startsWith("wp-")) {
    const wpIdx = parseInt(field.slice(3), 10);
    dir.waypoints[wpIdx] = { lat, lng, name };
    const wpInput = document.getElementById(`dir-wp-${wpIdx}`);
    if (wpInput) wpInput.value = name;
    placeWaypointMarker(wpIdx, lng, lat);
    // Move to next empty waypoint, or dest
    const nextEmpty = dir.waypoints.findIndex((w, i) => i > wpIdx && !w);
    if (nextEmpty >= 0) startPick(`wp-${nextEmpty}`);
    else if (!dir.dest) startPick("to");
    else stopPick();
  } else {
    dir.dest = { lat, lng, name };
    dirTo.value = name;
    placeDestMarker(lng, lat);
    stopPick();
  }
  updateGoButton();
});

// --- Geocoding ---
export async function reverseGeocode(lat, lng) {
  // Digitransit reverse geocoding (Pelias) — primary; Nominatim fallback
  try {
    const res = await fetch(`${DIGITRANSIT_REV_URL}?point.lat=${lat}&point.lon=${lng}&size=1&lang=en`, {
      headers: DT_API_KEY ? { "digitransit-subscription-key": DT_API_KEY } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const p = data.features?.[0]?.properties;
      if (p) {
        const road = p.street || p.name || "";
        const num = p.housenumber || "";
        const postcode = p.postalcode || "";
        const city = p.locality || "";
        let base = road ? (num ? `${road} ${num}` : road) : p.label?.split(",")[0];
        if (!base) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        if (postcode) base += `, ${postcode}`;
        if (city) base += `, ${city}`;
        return base;
      }
    }
  } catch {}
  try {
    const res = await fetch(`${NOMINATIM_REV}&lat=${lat}&lon=${lng}`, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    if (data.address) {
      const a = data.address;
      const city = a.city || a.town || a.village || a.municipality || "";
      if (a.road) {
        let addr = `${a.road}${a.house_number ? " " + a.house_number : ""}`;
        if (a.postcode) addr += `, ${a.postcode}`;
        if (city) addr += `, ${city}`;
        return addr;
      }
      return data.display_name.split(",")[0];
    }
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

// --- Markers ---
export function placeOriginMarker(lng, lat) {
  if (dir.originMarker) dir.originMarker.remove();
  const el = document.createElement("div");
  el.className = "dir-origin-marker";
  dir.originMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
}

export function placeDestMarker(lng, lat) {
  if (dir.destMarker) dir.destMarker.remove();
  const el = document.createElement("div");
  el.className = "dir-dest-marker";
  dir.destMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
}

document.querySelector(".dir-my-loc").addEventListener("click", () => {
  showLoadingToast("Finding your location\u2026");

  requestLocation().then((pos) => {
    hideLoadingToast();
    const { latitude: lat, longitude: lng } = pos.coords;
    reverseGeocode(lat, lng).then(name => {
      dir.origin = { lat, lng, name };
      dirFrom.value = name;
      placeOriginMarker(lng, lat);
      autoSetNearestMosque(lat, lng);
      updateGoButton();
      if (!dir.dest) startPick("to");
    });
  }).catch((e) => {
    hideLoadingToast();
    showDirError("Location unavailable");
    showToast("Location is off", "loc", e.message);
  });
});

document.getElementById("dir-swap").addEventListener("click", () => {
  [dir.origin, dir.dest] = [dir.dest, dir.origin];
  dir.waypoints.reverse();
  dir.waypointMarkers.reverse();
  dirFrom.value = dir.origin?.name || "";
  dirTo.value = dir.dest?.name || "";
  if (dir.origin) placeOriginMarker(dir.origin.lng, dir.origin.lat);
  else if (dir.originMarker) { dir.originMarker.remove(); dir.originMarker = null; }
  if (dir.dest) placeDestMarker(dir.dest.lng, dir.dest.lat);
  else if (dir.destMarker) { dir.destMarker.remove(); dir.destMarker = null; }
  // Update waypoint marker labels after reversal
  dir.waypointMarkers.forEach((m, i) => { if (m) m.getElement().textContent = i + 1; });
  if (dir.waypoints.length) _renderWaypoints();
  updateGoButton();
});

// --- Date/time drum picker ---
const dirTimeToggles = document.querySelectorAll(".time-opt");
const dirTimeNow = document.getElementById("dir-time-now");
const dirDatetimeLabel = document.getElementById("dir-datetime-label");
const dirCustomRow = document.getElementById("dir-custom-time-row");
let dirTimeMode = "depart";
let dirUseNow = true;
let calSelectedDate, tpSelectedH, tpSelectedM;

/* ── Drum picker constants ──── */
const DRUM_CELL_H  = 28;
const DRUM_VISIBLE = 5;
const DRUM_COL_H   = DRUM_CELL_H * DRUM_VISIBLE;
const DRUM_CENTER  = 2;
const DRUM_DAYS    = 60;
const DRUM_PAST_H  = 3;
const DRUM_MIN_STEP = 5;
const DRUM_SNAP_DUR = 280;
const DRUM_SPRING   = "cubic-bezier(0.32, 0.72, 0, 1)";

const _pad   = n => String(n).padStart(2, "0");
const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const WDAYS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function _todayMidnight() { const d = new Date(); d.setHours(0,0,0,0); return d; }

/* ── Build data arrays ──── */
let drumDates = [], drumHours = [], drumMinutes = [];
let selDate = 0, selHour = 0, selMin = 0;

function buildDrumData() {
  drumDates = [];
  // Start from yesterday so past-hour selections (up to DRUM_PAST_H) work
  for (let i = -1; i < DRUM_DAYS; i++) {
    const d = new Date(_todayMidnight().getTime() + i * 864e5);
    drumDates.push({
      label: i === -1 ? "Yesterday"
           : i === 0 ? "Today"
           : `${WDAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`,
      year: d.getFullYear(), month: d.getMonth(), day: d.getDate()
    });
  }
  drumHours = [];
  for (let h = 0; h < 24; h++) drumHours.push({ label: _pad(h), value: h });
  drumMinutes = [];
  for (let m = 0; m < 60; m += DRUM_MIN_STEP) drumMinutes.push({ label: _pad(m), value: m });
}

/* ── Create overlay DOM ──── */
const drumOverlay = document.createElement("div");
drumOverlay.id = "drum-overlay";
drumOverlay.className = "picker-overlay hide";
drumOverlay.innerHTML = [
  '<div class="drum-wrap" id="drum-wrap">',
    '<div class="drum-highlight-top" id="drum-ht"></div>',
    '<div class="drum-highlight-bottom" id="drum-hb"></div>',
    '<div class="drum-col" id="drum-date-col"><div class="drum-col-inner" id="drum-date-inner"></div></div>',
    '<span class="drum-sep">\u00b7</span>',
    '<div class="drum-col" id="drum-hour-col"><div class="drum-col-inner" id="drum-hour-inner"></div></div>',
    '<span class="drum-sep">:</span>',
    '<div class="drum-col" id="drum-min-col"><div class="drum-col-inner" id="drum-min-inner"></div></div>',
  '</div>',
  '<div class="drum-toast" id="drum-toast">Cannot go back more than 3 hours</div>'
].join("");
document.body.appendChild(drumOverlay);

const drumDateInner = document.getElementById("drum-date-inner");
const drumHourInner = document.getElementById("drum-hour-inner");
const drumMinInner  = document.getElementById("drum-min-inner");
const drumToast     = document.getElementById("drum-toast");

/* Position highlight lines */
document.getElementById("drum-ht").style.top = (DRUM_CENTER * DRUM_CELL_H) + "px";
document.getElementById("drum-hb").style.top = ((DRUM_CENTER + 1) * DRUM_CELL_H) + "px";
document.querySelectorAll(".drum-col").forEach(c => c.style.height = DRUM_COL_H + "px");

/* ── Render helpers ──── */
function _idxToOff(idx) { return -(idx - DRUM_CENTER) * DRUM_CELL_H; }
function _offToIdx(off) { return Math.round(-(off / DRUM_CELL_H) + DRUM_CENTER); }

function _setTransform(inner, px, animate) {
  inner.style.transition = animate ? `transform ${DRUM_SNAP_DUR}ms ${DRUM_SPRING}` : "none";
  inner.style.transform = `translateY(${px}px)`;
}

function renderDrumCol(inner, items, idx) {
  inner.innerHTML = "";
  items.forEach((item, i) => {
    const el = document.createElement("button");
    el.className = "drum-cell";
    el.textContent = item.label;
    el.style.height = DRUM_CELL_H + "px";
    el.dataset.idx = i;
    inner.appendChild(el);
  });
  _setTransform(inner, _idxToOff(idx), false);
  _applyTiers(inner, idx);
}

function _applyTiers(inner, idx) {
  inner.querySelectorAll(".drum-cell").forEach((c, i) => {
    const dist = Math.abs(i - idx);
    c.dataset.tier = dist > 2 ? "3" : String(dist);
    c.classList.remove("past");
  });
  _markPast();
}

function _pastFloorMs() {
  return Date.now() - DRUM_PAST_H * 36e5;
}

function _markPast() {
  const floor = new Date(_pastFloorMs());
  const floorH = floor.getHours();
  const floorM = floor.getMinutes();
  const floorDayStart = new Date(floor.getFullYear(), floor.getMonth(), floor.getDate()).getTime();
  // Mark date cells that are entirely before the floor day
  drumDateInner.querySelectorAll(".drum-cell").forEach(c => {
    const dd = drumDates[+c.dataset.idx];
    if (dd) {
      const dayEnd = new Date(dd.year, dd.month, dd.day, 23, 59).getTime();
      if (dayEnd < _pastFloorMs()) c.classList.add("past");
    }
  });
  const selD = drumDates[selDate];
  const selDayStart = new Date(selD.year, selD.month, selD.day).getTime();
  if (selDayStart < floorDayStart) {
    // Entire day is before the floor day — mark all hours past
    drumHourInner.querySelectorAll(".drum-cell").forEach(c => c.classList.add("past"));
    drumMinInner.querySelectorAll(".drum-cell").forEach(c => c.classList.add("past"));
  } else if (selDayStart === floorDayStart) {
    drumHourInner.querySelectorAll(".drum-cell").forEach(c => {
      if (drumHours[+c.dataset.idx].value < floorH) c.classList.add("past");
    });
    if (drumHours[selHour].value === floorH) {
      drumMinInner.querySelectorAll(".drum-cell").forEach(c => {
        if (drumMinutes[+c.dataset.idx].value < floorM) c.classList.add("past");
      });
    }
  }
  // Future dates: nothing marked past
}

function _isSelPast() {
  const d = drumDates[selDate];
  return new Date(d.year, d.month, d.day, drumHours[selHour].value, drumMinutes[selMin].value).getTime() < _pastFloorMs();
}

function _enforceNoPast() {
  if (!_isSelPast()) return;
  const floor = new Date(_pastFloorMs());
  const floorDayStart = new Date(floor.getFullYear(), floor.getMonth(), floor.getDate()).getTime();
  // Find the earliest allowed date index
  const floorDateIdx = drumDates.findIndex(dd => new Date(dd.year, dd.month, dd.day).getTime() >= floorDayStart);
  if (floorDateIdx === -1) return;
  if (selDate < floorDateIdx) {
    selDate = floorDateIdx;
    _snapCol(drumDateInner, selDate);
  }
  const selD = drumDates[selDate];
  const selDayStart = new Date(selD.year, selD.month, selD.day).getTime();
  if (selDayStart === floorDayStart) {
    const floorH = floor.getHours();
    const floorM = floor.getMinutes();
    if (drumHours[selHour].value < floorH) {
      selHour = _clamp(drumHours.findIndex(h => h.value >= floorH), 0, drumHours.length - 1);
      _snapCol(drumHourInner, selHour);
    }
    if (drumHours[selHour].value === floorH) {
      const ni = drumMinutes.findIndex(m => m.value >= floorM);
      if (ni === -1) {
        selHour = _clamp(selHour + 1, 0, drumHours.length - 1);
        selMin = 0;
        _snapCol(drumHourInner, selHour);
      } else { selMin = ni; }
      _snapCol(drumMinInner, selMin);
    }
  }
  _syncPickerToState();
}

function _snapCol(inner, idx) {
  _setTransform(inner, _idxToOff(idx), true);
  _applyTiers(inner, idx);
}



let _toastTimer;
function _flashToast() {
  drumToast.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => drumToast.classList.remove("show"), 1600);
}

function _onDrumSelect(colId, newIdx) {
  const oldD = selDate, oldH = selHour, oldM = selMin;
  if (colId === "date") selDate = _clamp(newIdx, 0, drumDates.length - 1);
  else if (colId === "hour") selHour = _clamp(newIdx, 0, drumHours.length - 1);
  else selMin = _clamp(newIdx, 0, drumMinutes.length - 1);

  if (_isSelPast()) {
    _flashToast();
    selDate = oldD; selHour = oldH; selMin = oldM;
    _snapCol(drumDateInner, selDate);
    _snapCol(drumHourInner, selHour);
    _snapCol(drumMinInner, selMin);
    return;
  }

  if (colId === "date") _snapCol(drumDateInner, selDate);
  else if (colId === "hour") _snapCol(drumHourInner, selHour);
  else _snapCol(drumMinInner, selMin);

  if (colId === "date") {
    _applyTiers(drumHourInner, selHour);
    _applyTiers(drumMinInner, selMin);
    _enforceNoPast();
  }
  if (colId === "hour") {
    _applyTiers(drumMinInner, selMin);
    _enforceNoPast();
  }
  _syncPickerToState();
}

/* ── Drag / Swipe (pointer events — unified mouse + touch) ──── */
function _attachDrumDrag(colEl, inner, getItems, colId, getIdx) {
  let dragging = false, startY = 0, baseOff = 0, curOff = 0;
  let lastY = 0, lastT = 0, velocity = 0;

  function currentOff() { return _idxToOff(getIdx()); }

  function begin(y) {
    dragging = true; startY = y; lastY = y; lastT = Date.now();
    velocity = 0; baseOff = currentOff(); curOff = baseOff;
    inner.style.transition = "none";
  }

  function move(y) {
    if (!dragging) return;
    const dy = y - startY, nowT = Date.now(), dt = nowT - lastT;
    if (dt > 0) velocity = (y - lastY) / dt;
    lastY = y; lastT = nowT;
    curOff = baseOff + dy;
    const items = getItems();
    const minOff = _idxToOff(items.length - 1);
    const maxOff = _idxToOff(0);
    if (curOff > maxOff) curOff = maxOff + (curOff - maxOff) * 0.3;
    if (curOff < minOff) curOff = minOff + (curOff - minOff) * 0.3;
    inner.style.transform = `translateY(${curOff}px)`;
    const liveIdx = _clamp(_offToIdx(curOff), 0, items.length - 1);
    _applyTiers(inner, liveIdx);
  }

  function end() {
    if (!dragging) return;
    dragging = false;
    const items = getItems();
    const projected = curOff + velocity * 120;
    const snapIdx = _clamp(_offToIdx(projected), 0, items.length - 1);
    _onDrumSelect(colId, snapIdx);
  }

  colEl.addEventListener("pointerdown", e => {
    e.preventDefault();
    colEl.setPointerCapture(e.pointerId);
    begin(e.clientY);
  });
  colEl.addEventListener("pointermove", e => {
    if (!dragging) return;
    e.preventDefault();
    move(e.clientY);
  });
  colEl.addEventListener("pointerup", () => end());
  colEl.addEventListener("pointercancel", () => end());

  inner.addEventListener("click", e => {
    const cell = e.target.closest(".drum-cell");
    if (!cell || cell.classList.contains("past")) return;
    if (Math.abs(e.clientY - startY) > 4) return;
    _onDrumSelect(colId, +cell.dataset.idx);
  });

  colEl.addEventListener("wheel", e => {
    e.preventDefault();
    const d = e.deltaY > 0 ? 1 : -1;
    _onDrumSelect(colId, getIdx() + d);
  }, { passive: false });
}

/* ── Sync internal state to external vars (for routing) ──── */
function _syncPickerToState() {
  const d = drumDates[selDate];
  calSelectedDate = `${d.year}-${_pad(d.month + 1)}-${_pad(d.day)}`;
  tpSelectedH = drumHours[selHour].value;
  tpSelectedM = drumMinutes[selMin].value;
  dirDatetimeLabel.textContent = `${d.label}, ${drumHours[selHour].label}:${drumMinutes[selMin].label}`;
}

function setDefaultDatetime() {
  buildDrumData();
  const now = new Date();
  selDate = 1; // index 1 = Today (index 0 = Yesterday)
  selHour = drumHours.findIndex(h => h.value === now.getHours());
  selMin  = drumMinutes.findIndex(m => m.value >= Math.ceil(now.getMinutes() / DRUM_MIN_STEP) * DRUM_MIN_STEP);
  if (selMin === -1) { selMin = 0; selHour = _clamp(selHour + 1, 0, drumHours.length - 1); }
  _syncPickerToState();
}

function getDateValue() { return calSelectedDate; }
function getTimeValue() { return `${_pad(tpSelectedH)}:${_pad(tpSelectedM)}`; }

function openDrumPicker(triggerEl) {
  if (!drumOverlay.classList.contains("hide")) { drumOverlay.classList.add("hide"); return; }
  // Rebuild data each time to keep dates fresh
  buildDrumData();
  renderDrumCol(drumDateInner, drumDates, selDate);
  renderDrumCol(drumHourInner, drumHours, selHour);
  renderDrumCol(drumMinInner, drumMinutes, selMin);
  _enforceNoPast();
  positionOverlay(drumOverlay, triggerEl);
  drumOverlay.classList.remove("hide");
}

function markNotNow() {
  dirUseNow = false;
  dirTimeNow.classList.remove("active");
  dirCustomRow.classList.add("show");
}

function closePickerOverlays() {
  drumOverlay.classList.add("hide");
}

function positionOverlay(overlay, triggerEl) {
  const r = triggerEl.getBoundingClientRect();
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    // Position above the trigger so it stays visible
    const bottomGap = window.innerHeight - r.top + 6;
    overlay.style.bottom = bottomGap + "px";
    overlay.style.top = "auto";
    overlay.style.left = "";
    overlay.style.width = "";
  } else {
    overlay.style.left = r.left + "px";
    overlay.style.top = r.bottom + 6 + "px";
    overlay.style.bottom = "";
    overlay.style.width = Math.max(r.width, 280) + "px";
  }
}

document.getElementById("datetime-trigger").addEventListener("click", (e) => {
  e.stopPropagation();
  markNotNow();
  openDrumPicker(e.currentTarget);
});

document.addEventListener("click", (e) => {
  if (!drumOverlay.contains(e.target) && !e.target.closest("#datetime-trigger")) drumOverlay.classList.add("hide");
});
drumOverlay.addEventListener("click", (e) => e.stopPropagation());

/* Init drum drag handlers */
_attachDrumDrag(document.getElementById("drum-date-col"), drumDateInner, () => drumDates, "date", () => selDate);
_attachDrumDrag(document.getElementById("drum-hour-col"), drumHourInner, () => drumHours, "hour", () => selHour);
_attachDrumDrag(document.getElementById("drum-min-col"), drumMinInner, () => drumMinutes, "min", () => selMin);

/* Refresh past-time markers periodically */
setInterval(() => { _markPast(); if (_isSelPast()) _enforceNoPast(); }, 30000);

setDefaultDatetime();

// Sliding pill highlight for depart/arrive toggle
const moveTimePill = initSegPill(document.getElementById("dir-time-toggle"));

dirTimeToggles.forEach((btn) => {
  btn.addEventListener("click", () => {
    dirTimeToggles.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    moveTimePill(btn);
    dirTimeMode = btn.dataset.mode;
  });
});

dirTimeNow.addEventListener("click", () => {
  dirUseNow = !dirUseNow;
  dirTimeNow.classList.toggle("active", dirUseNow);

  dirCustomRow.classList.toggle("show", !dirUseNow);
  if (dirUseNow) { setDefaultDatetime(); closePickerOverlays(); }

  dirSnap.remeasure();
});

// --- Routing ---
export function decodePolyline(encoded, precision) {
  const factor = Math.pow(10, precision || 5);
  const coords = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}

async function autoResolveLocation(inputEl) {
  const q = inputEl.value.trim();
  if (!q) return null;
  const items = await _searchDirLocations(q);
  if (items.length) return { lat: items[0].lat, lng: items[0].lng, name: items[0].name };
  return null;
}

// Returns the correct Digitransit routing endpoint for a given pair of coordinates,
// or null if the route spans multiple/unknown regions (caller should use Transitous).
function pickTransitEndpoint(lat1, lon1, lat2, lon2) {
  const inHSL    = (la, lo) => la >= 59.9 && la <= 60.75 && lo >= 24.0 && lo <= 26.0;
  // Waltti bounding boxes for all supported Finnish transit cities
  const WALTTI = [
    [60.15, 21.70, 60.70, 22.60], // Turku
    [61.30, 23.30, 61.70, 24.20], // Tampere
    [60.85, 25.45, 61.15, 25.95], // Lahti
    [62.10, 25.50, 62.40, 26.10], // Jyväskylä
    [62.75, 27.40, 63.05, 27.95], // Kuopio
    [64.85, 25.20, 65.15, 25.75], // Oulu
    [62.50, 29.55, 62.72, 29.95], // Joensuu
    [60.95, 28.00, 61.20, 28.40], // Lappeenranta
    [60.90, 24.30, 61.10, 24.65], // Hämeenlinna
    [60.38, 26.75, 60.55, 27.10], // Kotka
    [60.78, 26.55, 60.98, 26.95], // Kouvola
    [61.60, 27.10, 61.75, 27.50], // Mikkeli
    [63.00, 21.45, 63.20, 21.80], // Vaasa
    [61.40, 21.60, 61.65, 22.00], // Pori
    [66.40, 25.55, 66.60, 25.95], // Rovaniemi
    [64.13, 27.60, 64.30, 27.95], // Kajaani
    [63.80, 23.00, 63.90, 23.25], // Kokkola
    [62.70, 22.75, 62.87, 22.95], // Seinäjoki
  ];
  const inWaltti = (la, lo) => WALTTI.some(([s, w, n, e]) => la >= s && la <= n && lo >= w && lo <= e);
  if (inHSL(lat1, lon1)    && inHSL(lat2, lon2))    return DIGITRANSIT_URL;
  if (inWaltti(lat1, lon1)  && inWaltti(lat2, lon2)) return DIGITRANSIT_WALTTI_URL;
  return null; // cross-regional or outside known areas
}

dirGo.addEventListener("click", findRoutes);

export async function findRoutes() {
  setGoLoading(true);
  routeRequested = true;
  // New route calculation invalidates any paused navigation state
  if (_navHooks.isPaused()) _navHooks.stop();
  if (!dir.origin && dirFrom.value.trim()) {
    showDirLoading();
    const r = await autoResolveLocation(dirFrom);
    if (r) { dir.origin = r; dirFrom.value = r.name; placeOriginMarker(r.lng, r.lat); autoSetNearestMosque(r.lat, r.lng); }
  }
  if (!dir.dest && dirTo.value.trim()) {
    showDirLoading();
    const r = await autoResolveLocation(dirTo);
    if (r) { dir.dest = r; dirTo.value = r.name; placeDestMarker(r.lng, r.lat); }
  }
  updateGoButton();
  if (!dir.origin) { showDirError("Select an origin on the map or type a place"); return; }
  if (!dir.dest) { showDirError("Select a destination on the map or type a place"); return; }

  // Auto-resolve any waypoint inputs that were typed but not geocoded
  for (let i = 0; i < dir.waypoints.length; i++) {
    if (!dir.waypoints[i]) {
      const wpInput = document.getElementById(`dir-wp-${i}`);
      if (wpInput?.value.trim()) {
        const r = await autoResolveLocation(wpInput);
        if (r) { dir.waypoints[i] = r; wpInput.value = r.name; placeWaypointMarker(i, r.lng, r.lat); }
      }
    }
  }
  // Remove null waypoints (empty rows the user didn't fill)
  const validWaypoints = dir.waypoints.filter(Boolean);

  if (dirTravelMode !== "transit") { await findRoutesDirect(dirTravelMode); return; }

  // Transit with waypoints — chain A→B segments
  if (validWaypoints.length > 0) {
    await _findTransitWithWaypoints(validWaypoints);
    return;
  }

  showDirLoading();
  dirPanel.classList.remove("search-editing");
  const selectedTime = dirUseNow
    ? new Date().toISOString()
    : new Date(`${getDateValue()}T${getTimeValue()}`).toISOString();
  const dateTimeParam = dirTimeMode === "depart" ? `earliestDeparture: "${selectedTime}"` : `latestArrival: "${selectedTime}"`;
  const query = `{
  planConnection(
    origin: {location: {coordinate: {latitude: ${dir.origin.lat}, longitude: ${dir.origin.lng}}}}
    destination: {location: {coordinate: {latitude: ${dir.dest.lat}, longitude: ${dir.dest.lng}}}}
    first: 5
    dateTime: {${dateTimeParam}}
  ) { edges { node { start end legs {
    mode start { scheduledTime } end { scheduledTime }
    from { name stop { code zoneId } } to { name stop { code zoneId } }
    intermediateStops { name code zoneId lat lon }
    trip { routeShortName tripHeadsign route { type color textColor } }
    legGeometry { points } duration distance
  } } } }
}`;
  const dtEndpoint = pickTransitEndpoint(dir.origin.lat, dir.origin.lng, dir.dest.lat, dir.dest.lng);
  if (!dtEndpoint) {
    // Cross-regional or unknown area — skip Digitransit, go straight to Transitous
    console.warn("[Transit] Route spans multiple/unknown regions, using Transitous…");
    await findRoutesTransitous();
    return;
  }
  try {
    const res = await fetch(dtEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/graphql", "digitransit-subscription-key": DT_API_KEY },
      body: query,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`dt_${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error("dt_query");
    const edges = json.data?.planConnection?.edges;
    if (!edges || !edges.length) throw new Error("dt_empty");
    dir.usingFallback = false;
    dir.itineraries = edges.map((e) => e.node);
    renderItineraries();
  } catch (err) {
    console.warn("[Transit] Digitransit unavailable (" + (err.message || err) + "), trying Transitous…");
    await findRoutesTransitous();
  }
}

function _encPolyline2Pts(lat1, lon1, lat2, lon2) {
  function enc(val) {
    let v = Math.round(val * 1e5);
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (v >= 0x20) { s += String.fromCharCode(((v & 0x1f) | 0x20) + 63); v >>>= 5; }
    return s + String.fromCharCode(v + 63);
  }
  return enc(lat1) + enc(lon1) + enc(lat2 - lat1) + enc(lon2 - lon1);
}

function normalizeMOTISItinerary(itin) {
  const stopCode = (id) => (id ? id.split(":").pop() : null);
  return {
    start: itin.startTime, end: itin.endTime,
    legs: itin.legs.map((leg) => ({
      mode: leg.mode, duration: leg.duration, distance: leg.distance || 0,
      start: { scheduledTime: leg.scheduledStartTime },
      end: { scheduledTime: leg.scheduledEndTime },
      from: { name: leg.from?.name || "", stop: leg.from?.stopId ? { code: stopCode(leg.from.stopId), zoneId: null } : null },
      to: { name: leg.to?.name || "", stop: leg.to?.stopId ? { code: stopCode(leg.to.stopId), zoneId: null } : null },
      intermediateStops: (leg.intermediateStops || []).map((s) => ({ name: s.name || "", code: stopCode(s.stopId), zoneId: null, lat: s.lat ?? null, lon: s.lon ?? null })),
      trip: leg.routeShortName || leg.headsign ? { routeShortName: leg.routeShortName || null, tripHeadsign: leg.headsign || null, route: { type: leg.routeType || 0 } } : null,
      legGeometry: leg.legGeometry?.points
        ? { points: leg.legGeometry.points, precision: leg.legGeometry.precision || 6 }
        : { points: _encPolyline2Pts(leg.from?.lat ?? 0, leg.from?.lon ?? 0, leg.to?.lat ?? 0, leg.to?.lon ?? 0), precision: 5 },
    })),
  };
}

async function findRoutesTransitous() {
  const arriveBy = dirTimeMode === "arrive";
  const time = dirUseNow ? new Date().toISOString() : new Date(`${getDateValue()}T${getTimeValue()}`).toISOString();
  const params = new URLSearchParams({ fromPlace: `${dir.origin.lat},${dir.origin.lng}`, toPlace: `${dir.dest.lat},${dir.dest.lng}`, time, arriveBy: arriveBy ? "true" : "false", numItineraries: "5", transitModes: "TRANSIT" });
  try {
    const res = await fetch(`${TRANSITOUS_URL}?${params}`, {
      headers: { Referer: "https://halal-map.pages.dev/" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const itins = json.itineraries;
    if (!itins || !itins.length) { showDirError("No routes found"); return; }
    dir.usingFallback = true;
    dir.itineraries = itins.map(normalizeMOTISItinerary);
  } catch (err) {
    showDirError("No routes found");
    console.error("[Transitous] Failed:", err.message);
    return;
  }
  renderItineraries();
}

// Transit routing with intermediate waypoints — chain A→B segments sequentially
async function _findTransitWithWaypoints(waypoints) {
  showDirLoading();
  dirPanel.classList.remove("search-editing");
  const stops = [dir.origin, ...waypoints, dir.dest];
  let departureTime = dirUseNow
    ? new Date().toISOString()
    : new Date(`${getDateValue()}T${getTimeValue()}`).toISOString();
  const combinedLegs = [];
  let usedFallback = false;

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i], to = stops[i + 1];
    const itin = await _transitSegment(from, to, departureTime);
    if (!itin) {
      showDirError(`No route found for segment: ${esc(from.name)} → ${esc(to.name)}`);
      return;
    }
    if (itin._fallback) usedFallback = true;
    combinedLegs.push(...itin.legs);
    // Use next segment's departure as 2 min after this segment's arrival
    const lastLeg = itin.legs[itin.legs.length - 1];
    const arrivalMs = new Date(lastLeg.end.scheduledTime).getTime();
    departureTime = new Date(arrivalMs + 120000).toISOString();
  }

  const startTime = combinedLegs[0].start.scheduledTime;
  const endTime = combinedLegs[combinedLegs.length - 1].end.scheduledTime;
  dir.usingFallback = usedFallback;
  dir.itineraries = [{ start: startTime, end: endTime, legs: combinedLegs }];
  renderItineraries();
}

// Route a single transit segment (Digitransit primary, Transitous fallback)
async function _transitSegment(from, to, departureTime) {
  const dateTimeParam = `earliestDeparture: "${departureTime}"`;
  const query = `{ planConnection(
    origin: {location: {coordinate: {latitude: ${from.lat}, longitude: ${from.lng}}}}
    destination: {location: {coordinate: {latitude: ${to.lat}, longitude: ${to.lng}}}}
    first: 1
    dateTime: {${dateTimeParam}}
  ) { edges { node { start end legs {
    mode start { scheduledTime } end { scheduledTime }
    from { name stop { code zoneId } } to { name stop { code zoneId } }
    intermediateStops { name code zoneId lat lon }
    trip { routeShortName tripHeadsign route { type color textColor } }
    legGeometry { points } duration distance
  } } } } }`;
  const dtEndpoint = pickTransitEndpoint(from.lat, from.lng, to.lat, to.lng);
  if (dtEndpoint) {
    try {
      const res = await fetch(dtEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/graphql", "digitransit-subscription-key": DT_API_KEY },
        body: query,
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const json = await res.json();
        if (!json.errors) {
          const node = json.data?.planConnection?.edges?.[0]?.node;
          if (node) return node;
        }
      }
    } catch {}
  }
  // Transitous fallback
  try {
    const params = new URLSearchParams({
      fromPlace: `${from.lat},${from.lng}`, toPlace: `${to.lat},${to.lng}`,
      time: departureTime, arriveBy: "false",
      numItineraries: "1", transitModes: "TRANSIT",
    });
    const res = await fetch(`${TRANSITOUS_URL}?${params}`, {
      headers: { Referer: "https://halal-map.pages.dev/" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.itineraries?.length) {
        const itin = normalizeMOTISItinerary(json.itineraries[0]);
        itin._fallback = true;
        return itin;
      }
    }
  } catch {}
  return null;
}

// --- Route rendering helpers ---
export function fmtTime(d) { return d.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }); }
export function fmtDist(m) { if (m >= 1000) return (m / 1000).toFixed(1) + " km"; if (m >= 100) return Math.round(m / 10) * 10 + " m"; return Math.round(m) + " m"; }
function isTrunkBus(leg) { return leg.mode === "BUS" && leg.trip?.route?.type === 702; }
function modeClass(m, leg) {
  if (leg && isTrunkBus(leg)) return "trunk";
  return { WALK: "walk", BUS: "bus", TRAM: "tram", SUBWAY: "subway", METRO: "subway", RAIL: "rail", FERRY: "ferry", FUNICULAR: "funicular" }[m] || "bus";
}
function legColor(m, leg) {
  if (leg?.trip?.route?.color) return "#" + leg.trip.route.color;
  if (leg && isTrunkBus(leg)) return "#FF6319";
  return { WALK: getThemeWalkColor(), BUS: "#1A73B8", TRAM: "#1FA86A", SUBWAY: "#FF6319", METRO: "#FF6319", RAIL: getThemeRailShopPurple(), FERRY: "#00B9E4" }[m] || "#1A73B8";
}
// CSS variable version for HTML panels (auto-adapts to dark mode)
export function legCssColor(m, leg) {
  if (leg?.trip?.route?.color) return "#" + leg.trip.route.color;
  if (leg && isTrunkBus(leg)) return "var(--hsl-trunk)";
  return { WALK: "var(--walk)", BUS: "var(--hsl-bus)", TRAM: "var(--hsl-tram)", SUBWAY: "var(--hsl-metro)", METRO: "var(--hsl-metro)", RAIL: "var(--hsl-rail)", FERRY: "var(--hsl-ferry)" }[m] || "var(--accent)";
}

export function dirModeIconSvg(mode, size = 20) {
  const s = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  if (mode === "walk") return `<svg ${s}>${MODE_PATHS.WALK}</svg>`;
  if (mode === "cycle") return `<svg ${s}><circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/><path d="M5.5 17.5L9 10h5.5l3.5 7.5M9 10l3.5 7.5"/><circle cx="13.5" cy="7" r="2" fill="currentColor" stroke="none"/></svg>`;
  if (mode === "drive") return `<svg ${s}><path d="M3 17V12.5l2.5-6h13l2.5 6V17a1 1 0 01-1 1H4a1 1 0 01-1-1z"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/><path d="M3 13h18"/></svg>`;
  return modeIcon("BUS", size);
}

export function bearingName(deg) {
  return ["north","north-east","east","south-east","south","south-west","west","north-west"][Math.round((deg || 0) / 45) % 8];
}

export function stepInstruction(step) {
  const type = step.maneuver.type, mod = step.maneuver.modifier || "", road = step.name || step.ref || "";
  const on = road ? ` on ${road}` : "", onto = road ? ` onto ${road}` : "";
  const modText = { "sharp left": "sharp left", left: "left", "slight left": "slightly left", straight: "straight", "slight right": "slightly right", right: "right", "sharp right": "sharp right", uturn: "U-turn" }[mod] || mod;
  const exitNum = step.maneuver.exit ? ` exit ${step.maneuver.exit}` : "";
  switch (type) {
    case "depart": return `Head ${bearingName(step.maneuver.bearing_after)}${on}`;
    case "arrive": return mod === "left" ? "Destination is on the left" : mod === "right" ? "Destination is on the right" : "Arrive at destination";
    case "turn": return `Turn ${modText}${onto}`;
    case "new name": return `Continue${onto}`;
    case "continue": return `Continue ${modText}${on}`;
    case "merge": return `Merge ${modText}${onto}`;
    case "on ramp": return `Take the ramp${modText ? " " + modText : ""}${on}`;
    case "off ramp": return `Take exit${step.destinations ? " towards " + step.destinations : ""}${onto}`;
    case "fork": return `Keep ${modText} at the fork${onto}`;
    case "end of road": return `Turn ${modText} at end of road${onto}`;
    case "roundabout": case "rotary": return `At the roundabout, take${exitNum} exit${onto}`;
    case "roundabout turn": return `At the roundabout, turn ${modText}`;
    case "exit roundabout": case "exit rotary": return `Exit the roundabout${onto}`;
    case "use lane": return `Use lane to go ${modText}${onto}`;
    default: return road ? `Continue${on}` : type;
  }
}

export function maneuverIconSvg(type, mod) {
  const a = `width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"`;
  if (type === "depart") return `<svg ${a}><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`;
  if (type === "arrive") return `<svg ${a}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg>`;
  if (type === "roundabout" || type === "rotary" || type === "roundabout turn" || type === "exit roundabout" || type === "exit rotary") return `<svg ${a}><path d="M12 5a7 7 0 1 0 7 7"/><path d="M15 2l4 3-4 3"/></svg>`;
  if (type === "merge") return `<svg ${a}><path d="M12 21V8M5 3l7 5 7-5"/></svg>`;
  if (type === "fork") {
    if (mod && mod.includes("left")) return `<svg ${a}><path d="M12 21V8M5 3l7 5"/><path d="M5 3v6h5"/></svg>`;
    return `<svg ${a}><path d="M12 21V8M19 3l-7 5"/><path d="M19 3v6h-5"/></svg>`;
  }
  if (type === "on ramp" || type === "off ramp") return `<svg ${a}><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
  if (mod === "uturn") return `<svg ${a}><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/></svg>`;
  if (mod === "sharp left") return `<svg ${a}><path d="M18 18l-9-9m0 0v7m0-7h7"/></svg>`;
  if (mod === "left") return `<svg ${a}><path d="M17 12H5M11 6l-6 6 6 6"/></svg>`;
  if (mod === "slight left") return `<svg ${a}><path d="M7 7l9 9"/><path d="M7 15V7h8"/></svg>`;
  if (mod === "slight right") return `<svg ${a}><path d="M17 7l-9 9"/><path d="M9 7h8v8"/></svg>`;
  if (mod === "right") return `<svg ${a}><path d="M7 12h12M13 6l6 6-6 6"/></svg>`;
  if (mod === "sharp right") return `<svg ${a}><path d="M6 18l9-9m0 0v7m0-7h-7"/></svg>`;
  return `<svg ${a}><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
}

function stepSegType(manType) {
  if (manType === "roundabout" || manType === "rotary") return "roundabout";
  if (manType === "depart" || manType === "arrive") return "endpoint";
  return "normal";
}

// --- OTP step helpers (Digitransit direct routing) ---
export function _otpStepInstruction(step, isFirst, isLast) {
  const road = step.streetName && step.streetName !== "road" && step.streetName !== "Track" ? step.streetName : "";
  const on = road ? ` on ${road}` : "", onto = road ? ` onto ${road}` : "";
  const rd = step.relativeDirection;
  if (isFirst) return `Head ${(step.absoluteDirection || "NORTH").toLowerCase().replace("_", "-")}${on}`;
  if (isLast) return "Arrive at destination";
  if (!rd || rd === "CONTINUE") return `Continue${on}`;
  if (rd === "ELEVATOR") return `Take elevator${on}`;
  if (rd === "ENTER_STATION") return `Enter station${on}`;
  if (rd === "EXIT_STATION") return `Exit station${on}`;
  if (rd === "LEFT") return `Turn left${onto}`;
  if (rd === "RIGHT") return `Turn right${onto}`;
  if (rd === "SLIGHTLY_LEFT") return `Turn slightly left${onto}`;
  if (rd === "SLIGHTLY_RIGHT") return `Turn slightly right${onto}`;
  if (rd === "HARD_LEFT") return `Turn sharp left${onto}`;
  if (rd === "HARD_RIGHT") return `Turn sharp right${onto}`;
  if (rd === "UTURN_LEFT" || rd === "UTURN_RIGHT") return `Make a U-turn${on}`;
  if (rd === "CIRCLE_CLOCKWISE" || rd === "CIRCLE_COUNTERCLOCKWISE") return `At the roundabout, continue${on}`;
  return `Continue${on}`;
}

export function _otpManeuverIcon(step, isFirst, isLast) {
  const rd = step.relativeDirection;
  if (isFirst) return maneuverIconSvg("depart", "");
  if (isLast) return maneuverIconSvg("arrive", "");
  if (!rd || rd === "CONTINUE" || rd === "ELEVATOR" || rd === "ENTER_STATION" || rd === "EXIT_STATION") return maneuverIconSvg("new name", "straight");
  if (rd === "LEFT") return maneuverIconSvg("turn", "left");
  if (rd === "RIGHT") return maneuverIconSvg("turn", "right");
  if (rd === "SLIGHTLY_LEFT") return maneuverIconSvg("turn", "slight left");
  if (rd === "SLIGHTLY_RIGHT") return maneuverIconSvg("turn", "slight right");
  if (rd === "HARD_LEFT") return maneuverIconSvg("turn", "sharp left");
  if (rd === "HARD_RIGHT") return maneuverIconSvg("turn", "sharp right");
  if (rd === "UTURN_LEFT" || rd === "UTURN_RIGHT") return maneuverIconSvg("turn", "uturn");
  if (rd === "CIRCLE_CLOCKWISE" || rd === "CIRCLE_COUNTERCLOCKWISE") return maneuverIconSvg("roundabout", "");
  return maneuverIconSvg("continue", "straight");
}

async function _dtDirectRouteSeg(mode, from, to) {
  const dtMode = { walk: "WALK", cycle: "BICYCLE", drive: "CAR" }[mode];
  const query = `{ planConnection(
    origin: {location: {coordinate: {latitude: ${from.lat}, longitude: ${from.lng}}}}
    destination: {location: {coordinate: {latitude: ${to.lat}, longitude: ${to.lng}}}}
    first: 1 transportModes: [{mode: ${dtMode}}]
  ) { edges { node { start end legs {
    mode duration distance legGeometry { points }
    steps { streetName absoluteDirection relativeDirection distance lon lat }
  } } } } }`;
  const res = await fetch(DIGITRANSIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/graphql", "digitransit-subscription-key": DT_API_KEY },
    body: query,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`dt_${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error("dt_query");
  const node = json.data?.planConnection?.edges?.[0]?.node;
  if (!node) throw new Error("dt_empty");
  return node;
}

async function _dtDirectRoute(mode) {
  const stops = [dir.origin, ...dir.waypoints.filter(Boolean), dir.dest];
  const segments = [];
  for (let i = 0; i < stops.length - 1; i++) {
    segments.push(_dtDirectRouteSeg(mode, stops[i], stops[i + 1]));
  }
  const nodes = await Promise.all(segments);
  const allCoords = [];
  let totalDuration = 0, totalDistance = 0;
  const allSteps = [];
  for (const node of nodes) {
    node.legs.forEach((leg) => decodePolyline(leg.legGeometry.points, 5).forEach((c) => allCoords.push(c)));
    totalDuration += node.legs.reduce((s, l) => s + l.duration, 0);
    totalDistance += node.legs.reduce((s, l) => s + l.distance, 0);
    allSteps.push(...node.legs.flatMap((leg) => leg.steps || []));
  }
  const stepsHTML = allSteps.map((step, i) => {
    const isFirst = i === 0, isLast = i === allSteps.length - 1;
    const inst = _otpStepInstruction(step, isFirst, isLast);
    const icon = _otpManeuverIcon(step, isFirst, isLast);
    const iconClass = isFirst ? "step-depart" : isLast ? "step-arrive"
      : (step.relativeDirection === "CIRCLE_CLOCKWISE" || step.relativeDirection === "CIRCLE_COUNTERCLOCKWISE") ? "step-roundabout" : "";
    const dist = step.distance > 5 ? fmtDist(step.distance) : "";
    return `<div class="direct-step" data-step-idx="${i}"><div class="step-icon-wrap ${iconClass}">${icon}</div><div class="step-text-col"><div class="step-inst">${esc(inst)}</div>${dist ? `<div class="step-meta">${dist}</div>` : ""}</div></div>`;
  }).join("");
  return {
    coords: allCoords, duration: totalDuration, distance: totalDistance, stepsHTML,
    stepGeometries: null, stepFeatures: null,
    srcData: { type: "Feature", geometry: { type: "LineString", coordinates: allCoords } },
    rawSteps: allSteps.map((step, i) => ({
      source: "otp",
      instruction: _otpStepInstruction(step, i === 0, i === allSteps.length - 1),
      iconHtml: _otpManeuverIcon(step, i === 0, i === allSteps.length - 1),
      distance: step.distance || 0,
      name: (step.streetName && step.streetName !== "road" && step.streetName !== "Track") ? step.streetName : "",
      lat: step.lat, lng: step.lon,
      isFirst: i === 0, isLast: i === allSteps.length - 1,
    })),
  };
}

async function _osrmDirectRoute(mode) {
  const points = [
    `${dir.origin.lng},${dir.origin.lat}`,
    ...dir.waypoints.filter(Boolean).map(wp => `${wp.lng},${wp.lat}`),
    `${dir.dest.lng},${dir.dest.lat}`,
  ].join(";");
  const hasWaypoints = dir.waypoints.filter(Boolean).length > 0;
  const altParam = hasWaypoints ? "" : "&alternatives=3";
  const url = `${OSRM_URLS[mode]}/${points}?overview=full&geometries=geojson&steps=true${altParam}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Routing error ${res.status}`);
  const json = await res.json();
  if (json.code !== "Ok" || !json.routes?.length) throw new Error("No route found");
  return json.routes.map(route => _osrmProcessRoute(route, mode));
}

/**
 * Process a single OSRM route object into the standard data shape.
 * @param {Object} route - OSRM route object
 * @param {string} mode - "drive" | "cycle" | "walk"
 * @returns {Object}
 */
function _osrmProcessRoute(route, mode) {
  const maxspeeds = route.legs?.flatMap(leg => leg.annotation?.maxspeed || []) || [];
  const allSteps = route.legs.flatMap(leg => leg.steps || []);
  const altColor = OSRM_ALT_COLORS[mode];
  let segIdx = 0;
  const stepFeatures = allSteps.filter((s) => s.geometry?.coordinates?.length > 1)
    .map((s) => ({ type: "Feature", geometry: s.geometry, properties: { segType: stepSegType(s.maneuver.type), idx: segIdx++ } }));
  const srcData = stepFeatures.length ? { type: "FeatureCollection", features: stepFeatures } : route.geometry;
  const stepsHTML = allSteps.map((step, si) => {
    const stype = step.maneuver.type, smod = step.maneuver.modifier || "";
    const iconClass = stype === "roundabout" || stype === "rotary" || stype === "exit roundabout" || stype === "exit rotary" ? "step-roundabout" : stype === "arrive" ? "step-arrive" : stype === "depart" ? "step-depart" : "";
    const dist = step.distance > 5 ? fmtDist(step.distance) : "";
    const dur = step.duration >= 30 ? Math.round(step.duration / 60) + " min" : "";
    const meta = [dist, dur].filter(Boolean).join(" · ");
    return `<div class="direct-step" data-step-idx="${si}"><div class="step-icon-wrap ${iconClass}">${maneuverIconSvg(stype, smod)}</div><div class="step-text-col"><div class="step-inst">${esc(stepInstruction(step))}</div>${meta ? `<div class="step-meta">${meta}</div>` : ""}</div></div>`;
  }).join("");
  return {
    coords: route.geometry.coordinates, duration: route.duration, distance: route.distance, stepsHTML,
    stepGeometries: allSteps.map((s) => s.geometry), stepFeatures, altColor, srcData, maxspeeds,
    rawSteps: allSteps.map((step, si) => ({
      source: "osrm",
      instruction: stepInstruction(step),
      iconHtml: maneuverIconSvg(step.maneuver.type, step.maneuver.modifier || ""),
      distance: step.distance || 0,
      duration: step.duration || 0,
      lat: step.maneuver.location[1],
      lng: step.maneuver.location[0],
      maneuverType: step.maneuver.type,
      maneuverMod: step.maneuver.modifier || "",
      name: step.name || "",
      geometry: step.geometry,
      isFirst: si === 0, isLast: si === allSteps.length - 1,
    })),
  };
}

export async function findRoutesDirect(mode) {
  showDirLoading();
  dirPanel.classList.remove("search-editing");
  // Query Digitransit + OSRM in parallel to collect multiple route options
  const [dtResult, osrmResult] = await Promise.allSettled([
    _dtDirectRoute(mode).then(d => [d]),
    _osrmDirectRoute(mode),
  ]);
  const dtRoutes = dtResult.status === "fulfilled" ? dtResult.value : [];
  const osrmRoutes = osrmResult.status === "fulfilled" ? osrmResult.value : [];
  if (!dtRoutes.length && !osrmRoutes.length) {
    showDirError("Could not find route");
    return;
  }
  // Merge: DT first (typically more accurate locally), then OSRM alts
  // Deduplicate by skipping OSRM routes whose distance is within 5% of an existing route
  const allRoutes = [...dtRoutes];
  for (const osrmRt of osrmRoutes) {
    const dominated = allRoutes.some(r => Math.abs(r.distance - osrmRt.distance) / (r.distance || 1) < 0.05);
    if (!dominated) allRoutes.push(osrmRt);
  }
  // If DT failed, OSRM routes are all we have
  if (!allRoutes.length) allRoutes.push(...osrmRoutes);
  clearRoute();
  dir._directAlts = allRoutes;
  dir._directMode = mode;

  const color = osrmColor(mode);
  const cssColor = OSRM_CSS_COLORS[mode];

  // --- Draw alt route lines on map (all except primary, which is drawn by _drawDirectPrimary) ---
  allRoutes.forEach((alt, i) => {
    if (i === 0) return; // primary drawn separately
    const srcId = `dir-alt-src-${i - 1}`, lnId = `dir-alt-ln-${i - 1}`, casId = `dir-alt-cas-${i - 1}`;
    const geoData = { type: "Feature", geometry: { type: "LineString", coordinates: alt.coords } };
    map.addSource(srcId, { type: "geojson", data: geoData });
    map.addLayer({ id: casId, type: "line", source: srcId, paint: { "line-color": "#ffffff", "line-width": mode === "walk" ? 6 : 7, "line-opacity": 0.5 }, layout: { "line-cap": "round", "line-join": "round" } });
    map.addLayer({ id: lnId, type: "line", source: srcId, paint: { "line-color": color, "line-width": ALT_ROUTE_WIDTH, "line-opacity": ALT_ROUTE_OPACITY, "line-dasharray": mode === "walk" ? [1.5, 2] : [1] }, layout: { "line-cap": "round", "line-join": "round" } });
    dir.routeSources.push(srcId);
    dir.routeLayers.push(casId, lnId);
  });

  // --- Draw primary route ---
  _drawDirectPrimary(allRoutes[0], mode, color);

  // --- Fit bounds to primary route ---
  const { coords } = allRoutes[0];
  const bounds = new maplibregl.LngLatBounds();
  coords.forEach((c) => bounds.extend(c));
  const mob = window.innerWidth <= 768;
  const sheetPad = mob ? Math.round(window.innerHeight * 0.55) + 32 : 0;
  map.fitBounds(bounds, { padding: mob ? { top: 90, bottom: sheetPad, left: 40, right: 40 } : { top: 80, bottom: 80, left: 60, right: 540 }, duration: 600 });

  // --- Store navigation data for primary ---
  const data = allRoutes[0];
  const durMin = Math.round(data.duration / 60);
  const distKm = (data.distance / 1000).toFixed(1);
  dir.directInfo = { mode, durMin, distKm, stepGeometries: data.stepGeometries };
  dir.directRouteCoords = data.coords;
  dir.directSteps = data.rawSteps || null;
  dir.directMaxspeeds = data.maxspeeds || null;
  dir.activeIdx = 0;

  // --- Render route cards ---
  dirEmpty.classList.add("hide");
  dirLoad.classList.add("hide");
  dirErr.classList.add("hide");
  dirItins.innerHTML = allRoutes.map((rt, i) => {
    const rtDurMin = Math.round(rt.duration / 60);
    const rtDistKm = (rt.distance / 1000).toFixed(1);
    const durLabel = rtDurMin < 60 ? `${rtDurMin} min` : `${Math.floor(rtDurMin / 60)}h ${rtDurMin % 60}m`;
    return `<div class="itin-card direct-card${i === 0 ? " active" : ""}" data-direct-idx="${i}" style="--dc:${cssColor}">
        <div class="itin-header"><div class="itin-dur">${durLabel}</div><div class="itin-time">${fmtTime(new Date())} → ${fmtTime(new Date(Date.now() + rt.duration * 1000))}</div><button class="itin-navigate" title="Start navigation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button><button class="itin-expand direct-expand" title="Full screen directions"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button><div class="itin-walk">${dirModeIconSvg(mode, 12)} ${OSRM_LABELS[mode]} · ${rtDistKm} km</div></div>
        <div class="itin-chain"><span class="leg-badge mode-${mode}">${dirModeIconSvg(mode, 14)}</span></div>
        <div class="itin-legs"><div class="itin-legs-inner"><div class="direct-steps">${rt.stepsHTML}</div></div></div>
      </div>`;
  }).join("");
  document.getElementById("dir-btn").classList.add("route-active");
  dirClearBtn.classList.remove("hide");
  dirShareBtn.classList.remove("hide");
  _bindDirectCardClicks();
  enterResultsMode();
  updateSnackbar();
}

/**
 * Draw the primary direct route layers on the map (corridor + casing + line + highlight).
 * @param {Object} data - Processed route data
 * @param {string} mode - "drive" | "cycle" | "walk"
 * @param {string} color - Route line color
 */
function _drawDirectPrimary(data, mode, color) {
  const { coords, srcData, stepFeatures } = data;
  const altColor = data.altColor || OSRM_ALT_COLORS[mode];

  // Remove existing primary layers
  ["dir-highlight-ln", "dir-direct-ln", "dir-direct-cas", "dir-corridor-ln"].forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  ["dir-direct-src", "dir-highlight-src", "dir-corridor-src"].forEach(id => {
    if (map.getSource(id)) map.removeSource(id);
  });
  // Remove from tracking arrays (they'll be re-added below)
  dir.routeLayers = dir.routeLayers.filter(id => !["dir-highlight-ln", "dir-direct-ln", "dir-direct-cas", "dir-corridor-ln"].includes(id));
  dir.routeSources = dir.routeSources.filter(id => !["dir-direct-src", "dir-highlight-src", "dir-corridor-src"].includes(id));

  // Road corridor
  const corridorData = { type: "Feature", geometry: { type: "LineString", coordinates: coords } };
  const corridorWidth = (mode === "walk" ? 4 : 5) + ROAD_CORRIDOR_WIDTH_ADD;
  map.addSource("dir-corridor-src", { type: "geojson", data: corridorData });
  map.addLayer({ id: "dir-corridor-ln", type: "line", source: "dir-corridor-src", paint: { "line-color": color, "line-width": corridorWidth, "line-opacity": ROAD_CORRIDOR_OPACITY }, layout: { "line-cap": "round", "line-join": "round" } });

  // Main route: casing + line
  map.addSource("dir-direct-src", { type: "geojson", data: srcData });
  map.addLayer({ id: "dir-direct-cas", type: "line", source: "dir-direct-src", paint: { "line-color": "#ffffff", "line-width": mode === "walk" ? 8 : 9, "line-opacity": 0.95 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({
    id: "dir-direct-ln", type: "line", source: "dir-direct-src",
    paint: {
      "line-color": stepFeatures?.length ? ["case", ["==", ["get", "segType"], "roundabout"], getThemeRailShopPurple(), ["==", ["%", ["get", "idx"], 2], 0], color, altColor] : color,
      "line-width": mode === "walk" ? 4 : 5, "line-dasharray": mode === "walk" ? [1.5, 2] : [1], "line-opacity": 0.9,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });

  // Step highlight
  map.addSource("dir-highlight-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "dir-highlight-ln", type: "line", source: "dir-highlight-src", paint: { "line-color": color, "line-width": mode === "walk" ? 10 : 12, "line-opacity": 0.45 }, layout: { "line-cap": "round", "line-join": "round" } });

  dir.routeSources.push("dir-direct-src", "dir-highlight-src", "dir-corridor-src");
  dir.routeLayers.push("dir-corridor-ln", "dir-direct-cas", "dir-direct-ln", "dir-highlight-ln");
}

/**
 * Select a direct route card — redraws the primary route and updates navigation data.
 * @param {number} idx - Index in dir._directAlts
 */
function _selectDirectRoute(idx) {
  const alts = dir._directAlts;
  if (!alts || !alts[idx]) return;
  if (dir.activeIdx === idx) return;
  dir.activeIdx = idx;
  const data = alts[idx];
  const mode = dir._directMode;
  const color = osrmColor(mode);

  // Update active card
  document.querySelectorAll(".itin-card.direct-card").forEach((c) => {
    c.classList.toggle("active", parseInt(c.dataset.directIdx) === idx);
  });

  // Redraw primary route on map
  _drawDirectPrimary(data, mode, color);

  // Update alt route visibility — make previously-active alt visible, hide newly-active
  alts.forEach((alt, i) => {
    if (i === 0) return; // alt layers use i-1 indexing
    const lnId = `dir-alt-ln-${i - 1}`, casId = `dir-alt-cas-${i - 1}`;
    if (i === idx) {
      // This is now the primary — hide its alt line
      if (map.getLayer(lnId)) map.setPaintProperty(lnId, "line-opacity", 0);
      if (map.getLayer(casId)) map.setPaintProperty(casId, "line-opacity", 0);
    } else {
      // Not primary — show as alt
      if (map.getLayer(lnId)) map.setPaintProperty(lnId, "line-opacity", ALT_ROUTE_OPACITY);
      if (map.getLayer(casId)) map.setPaintProperty(casId, "line-opacity", 0.5);
    }
  });
  // If the previously active was index 0, show it as alt (it had no alt layer, so draw one)
  // Handle by drawing route 0 as an alt if it's deselected
  _ensureAltLayerForRoute0(alts, mode, color, idx);

  // Update navigation data
  const durMin = Math.round(data.duration / 60);
  const distKm = (data.distance / 1000).toFixed(1);
  dir.directInfo = { mode, durMin, distKm, stepGeometries: data.stepGeometries };
  dir.directRouteCoords = data.coords;
  dir.directSteps = data.rawSteps || null;
  dir.directMaxspeeds = data.maxspeeds || null;

  // Fit bounds to new route
  const bounds = new maplibregl.LngLatBounds();
  data.coords.forEach((c) => bounds.extend(c));
  const mob = window.innerWidth <= 768;
  const sheetPad = mob ? Math.round(window.innerHeight * 0.55) + 32 : 0;
  map.fitBounds(bounds, { padding: mob ? { top: 90, bottom: sheetPad, left: 40, right: 40 } : { top: 80, bottom: 80, left: 60, right: 540 }, duration: 600 });

  updateSnackbar();
  if (dirPanel.classList.contains("results-shown") && !dirPanel.classList.contains("route-focused")) {
    syncResultsPanelHeight();
  }
}

/**
 * Ensure route 0 has an alt layer when it's deselected (since it starts as primary with no alt layer).
 */
function _ensureAltLayerForRoute0(alts, mode, color, activeIdx) {
  const srcId = "dir-alt-src-r0", casId = "dir-alt-cas-r0", lnId = "dir-alt-ln-r0";
  if (activeIdx === 0) {
    // Route 0 is primary again — hide its alt layer
    if (map.getLayer(lnId)) map.setPaintProperty(lnId, "line-opacity", 0);
    if (map.getLayer(casId)) map.setPaintProperty(casId, "line-opacity", 0);
    return;
  }
  if (!alts[0]) return;
  if (map.getSource(srcId)) {
    // Already exists — just make it visible
    map.getSource(srcId).setData({ type: "Feature", geometry: { type: "LineString", coordinates: alts[0].coords } });
    if (map.getLayer(lnId)) map.setPaintProperty(lnId, "line-opacity", ALT_ROUTE_OPACITY);
    if (map.getLayer(casId)) map.setPaintProperty(casId, "line-opacity", 0.5);
    return;
  }
  const geoData = { type: "Feature", geometry: { type: "LineString", coordinates: alts[0].coords } };
  map.addSource(srcId, { type: "geojson", data: geoData });
  const beforeLayer = map.getLayer("dir-corridor-ln") ? "dir-corridor-ln" : undefined;
  map.addLayer({ id: casId, type: "line", source: srcId, paint: { "line-color": "#ffffff", "line-width": mode === "walk" ? 6 : 7, "line-opacity": 0.5 }, layout: { "line-cap": "round", "line-join": "round" } }, beforeLayer);
  map.addLayer({ id: lnId, type: "line", source: srcId, paint: { "line-color": color, "line-width": ALT_ROUTE_WIDTH, "line-opacity": ALT_ROUTE_OPACITY, "line-dasharray": mode === "walk" ? [1.5, 2] : [1] }, layout: { "line-cap": "round", "line-join": "round" } });
  dir.routeSources.push(srcId);
  dir.routeLayers.push(casId, lnId);
}

/**
 * Bind click handlers on direct route cards (called after cards are rendered or appended).
 */
function _bindDirectCardClicks() {
  dirItins.querySelectorAll(".itin-card.direct-card").forEach((card) => {
    card.onclick = (e) => {
      const idx = parseInt(card.dataset.directIdx);
      if (e.target.closest(".itin-navigate")) {
        e.stopPropagation();
        _selectDirectRoute(idx);
        closeDirPanel();
        if (!_navHooks.isActive() && !_navHooks.resume()) _navHooks.startNav();
        return;
      }
      if (e.target.closest(".itin-expand")) {
        e.stopPropagation();
        _selectDirectRoute(idx);
        _focusDirectRoute(idx);
        return;
      }
      // Step highlight within a card
      const stepEl = e.target.closest(".direct-step");
      if (stepEl && dir.directInfo?.stepGeometries) {
        _selectDirectRoute(idx);
        const stepIdx = parseInt(stepEl.dataset.stepIdx, 10);
        if (!isNaN(stepIdx)) highlightDirectStep(stepIdx, stepEl);
        return;
      }
      _selectDirectRoute(idx);
    };
  });
}

/**
 * Focus (expand full-screen) a direct route card.
 * @param {number} idx - Index in dir._directAlts
 */
function _focusDirectRoute(idx) {
  const data = dir._directAlts?.[idx];
  if (!data) return;
  const mode = dir._directMode;
  const durMin = Math.round(data.duration / 60);
  const distKm = (data.distance / 1000).toFixed(1);
  document.getElementById("focused-origin").textContent = dir.origin?.name || "Origin";
  document.getElementById("focused-dest").textContent = dir.dest?.name || "Destination";
  const chainEl = document.getElementById("focused-chain");
  chainEl.innerHTML = `<span class="leg-badge mode-${mode}">${dirModeIconSvg(mode, 14)}</span>`;
  document.getElementById("focused-meta").innerHTML = `<span>${durMin < 60 ? durMin + " min" : Math.floor(durMin / 60) + "h " + (durMin % 60) + "m"}</span><span>·</span><span>${fmtTime(new Date())} → ${fmtTime(new Date(Date.now() + data.duration * 1000))}</span><span>·</span><span>${distKm} km</span>`;
  const isMobile_fr = window.innerWidth <= 768;
  const shouldSync_fr = isMobile_fr && !dirPanel.classList.contains("shut");
  const beforeH_fr = shouldSync_fr ? dirPanel.offsetHeight : 0;
  dirPanel.classList.add("route-focused");
  document.querySelectorAll(".itin-card.direct-card").forEach((c) => {
    const cardIdx = parseInt(c.dataset.directIdx);
    if (cardIdx === idx) { c.classList.add("focused", "active"); c.classList.remove("card-hidden"); }
    else { c.classList.add("card-hidden"); }
  });
  if (shouldSync_fr) {
    dirPanel.style.transition = "none";
    dirPanel.style.height = beforeH_fr + "px";
    void dirPanel.offsetHeight;
    dirPanel.style.transition = "";
    dirPanel.style.height = window.innerHeight + "px";
  } else {
    dirSnap.remeasure();
  }
}

function renderItineraries() {
  dirEmpty.classList.add("hide"); dirLoad.classList.add("hide"); dirErr.classList.add("hide");
  dirItins.innerHTML = ""; dir.activeIdx = -1;
  if (dir.usingFallback) dirItins.insertAdjacentHTML("afterbegin", '<div class="fallback-notice">⚠ Regional transit routing unavailable — showing community transit data (Transitous). Times may be less accurate.</div>');
  dir.itineraries.forEach((itin, idx) => {
    const card = document.createElement("div");
    card.className = "itin-card"; card.dataset.idx = idx;
    card.style.setProperty("--i", idx);
    const startT = new Date(itin.start), endT = new Date(itin.end);
    const durMin = Math.round((endT - startT) / 60000);
    const walkSec = itin.legs.filter((l) => l.mode === "WALK").reduce((s, l) => s + l.duration, 0);
    const transitLegs = itin.legs.filter((l) => l.mode !== "WALK").length;
    const hdr = document.createElement("div");
    hdr.className = "itin-header";
    hdr.innerHTML = `<div class="itin-dur">${durMin} min</div><div class="itin-time">${fmtTime(startT)} → ${fmtTime(endT)}</div><button class="itin-navigate" title="Start navigation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button><button class="itin-expand" title="Expand route"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button><div class="itin-walk">${modeIcon("WALK", 12)} ${Math.round(walkSec / 60)} min walk · ${transitLegs > 1 ? transitLegs - 1 + " transfer" + (transitLegs > 2 ? "s" : "") : "direct"}</div>`;
    const chain = document.createElement("div"); chain.className = "itin-chain";
    itin.legs.forEach((leg, li) => {
      if (li > 0) chain.insertAdjacentHTML("beforeend", '<span class="leg-arrow">›</span>');
      const badge = document.createElement("span");
      badge.className = `leg-badge ${modeClass(leg.mode, leg)}`;
      if (leg.trip?.route?.color) badge.style.background = `#${leg.trip.route.color}`;
      badge.innerHTML = leg.trip?.routeShortName ? `${modeIcon(leg.mode, 12)} ${esc(leg.trip.routeShortName)}` : modeIcon(leg.mode, 14);
      chain.appendChild(badge);
    });
    const legsDiv = document.createElement("div"); legsDiv.className = "itin-legs";
    const legsInner = document.createElement("div"); legsInner.className = "itin-legs-inner";
    itin.legs.forEach((leg) => {
      const isTransit = leg.mode !== "WALK";
      const stops = isTransit && leg.intermediateStops ? leg.intermediateStops : [];
      const hasStops = stops.length > 0;
      const row = document.createElement("div");
      row.className = "leg-row" + (hasStops ? " leg-expandable" : "");
      const color = legCssColor(leg.mode, leg);
      const fromTime = fmtTime(new Date(leg.start.scheduledTime)), toTime = fmtTime(new Date(leg.end.scheduledTime));
      const durL = Math.round(leg.duration / 60), distM = Math.round(leg.distance);
      let modeName = leg.mode === "WALK" ? `Walk ${distM >= 1000 ? (distM / 1000).toFixed(1) + " km" : distM + " m"}` : `${leg.trip?.routeShortName || leg.mode} → ${leg.trip?.tripHeadsign || leg.to.name}`;
      const expandHint = hasStops ? ` <span class="leg-expand-hint">${stops.length} stop${stops.length > 1 ? "s" : ""} <span class="leg-chevron">›</span></span>` : "";
      let interHtml = "";
      if (hasStops) {
        interHtml = '<div class="leg-intermediate"><div class="leg-inter-inner">' + stops.map((s) => `<div class="leg-inter-stop"><span class="leg-inter-dot" style="background:${color}"></span><span class="leg-inter-name">${esc(s.name || "Stop")}${s.code ? " <small>(" + esc(s.code) + ")</small>" : ""}${(s.zoneId && /^[A-Z]$/.test(s.zoneId)) ? ' <span class="zone-badge zone-' + s.zoneId.toLowerCase() + ' zone-inline">' + esc(s.zoneId) + "</span>" : ""}</span></div>`).join("") + "</div></div>";
      }
      row.innerHTML = `<div class="leg-timeline"><span class="leg-icon" style="background:${color}">${modeIcon(leg.mode, 12)}</span><div class="leg-line" style="background:${color}"></div></div><div class="leg-info"><div class="leg-mode-name">${esc(modeName)}${expandHint}</div><div class="leg-stops"><span class="leg-stop-time">${fromTime}</span> ${esc(leg.from.name)}${leg.from.stop?.code ? " <small>(" + esc(leg.from.stop.code) + ")</small>" : ""}${(leg.from.stop?.zoneId && /^[A-Z]$/.test(leg.from.stop.zoneId)) ? ' <span class="zone-badge zone-' + leg.from.stop.zoneId.toLowerCase() + ' zone-inline">' + esc(leg.from.stop.zoneId) + "</span>" : ""}</div>${interHtml}<div class="leg-stops"><span class="leg-stop-time">${toTime}</span> ${esc(leg.to.name)}${leg.to.stop?.code ? " <small>(" + esc(leg.to.stop.code) + ")</small>" : ""}${(leg.to.stop?.zoneId && /^[A-Z]$/.test(leg.to.stop.zoneId)) ? ' <span class="zone-badge zone-' + leg.to.stop.zoneId.toLowerCase() + ' zone-inline">' + esc(leg.to.stop.zoneId) + "</span>" : ""}</div><div class="leg-dist">${durL} min</div></div>`;
      if (hasStops) {
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          row.closest(".itin-card").querySelectorAll(".leg-expandable.leg-open").forEach((el) => { if (el !== row) el.classList.remove("leg-open"); });
          row.classList.toggle("leg-open");
        });
      }
      legsInner.appendChild(row);
    });
    legsDiv.appendChild(legsInner);
    const zones = new Set();
    itin.legs.forEach((leg) => {
      if (leg.from.stop?.zoneId && /^[A-Z]$/.test(leg.from.stop.zoneId)) zones.add(leg.from.stop.zoneId);
      if (leg.to.stop?.zoneId && /^[A-Z]$/.test(leg.to.stop.zoneId)) zones.add(leg.to.stop.zoneId);
      if (leg.intermediateStops) leg.intermediateStops.forEach((s) => { if (s.zoneId && /^[A-Z]$/.test(s.zoneId)) zones.add(s.zoneId); });
    });
    const zoneDiv = document.createElement("div"); zoneDiv.className = "itin-zones";
    if (zones.size) {
      const sorted = [...zones].sort();
      zoneDiv.innerHTML = `<span class="itin-zones-label">Zones</span>${sorted.map((z) => `<span class="zone-badge zone-${z.toLowerCase()}">${esc(z)}</span>`).join("")}`;
    }
    card.appendChild(hdr); card.appendChild(chain);
    if (zones.size) card.appendChild(zoneDiv);
    card.appendChild(legsDiv);
    dirItins.appendChild(card);
    card.addEventListener("click", (e) => {
      if (e.target.closest(".itin-navigate")) { e.stopPropagation(); selectItinerary(idx); closeDirPanel(); if (!_navHooks.isActive() && !_navHooks.resume()) _navHooks.startNav(); return; }
      if (e.target.closest(".itin-expand")) { e.stopPropagation(); selectItinerary(idx); focusRoute(idx); return; }
      selectItinerary(idx);
    });
  });
  // Enter results mode AFTER cards are built so the panel measures correct height
  if (dir.itineraries.length) {
    const pending = _pendingItinIdx;
    _pendingItinIdx = null;
    selectItinerary(pending != null && pending < dir.itineraries.length ? pending : 0);
  }
  enterResultsMode();
}

function selectItinerary(idx) {
  if (dir.activeIdx === idx) return;
  dir.activeIdx = idx;
  document.querySelectorAll(".itin-card").forEach((c, i) => c.classList.toggle("active", i === idx));
  drawRoute(dir.itineraries[idx]);
  if (dirPanel.classList.contains("results-shown") && !dirPanel.classList.contains("route-focused")) {
    syncResultsPanelHeight();
  }
}

function focusRoute(idx) {
  const itin = dir.itineraries[idx]; if (!itin) return;
  const startT = new Date(itin.start), endT = new Date(itin.end);
  const durMin = Math.round((endT - startT) / 60000);
  const walkSec = itin.legs.filter((l) => l.mode === "WALK").reduce((s, l) => s + l.duration, 0);
  const transitLegs = itin.legs.filter((l) => l.mode !== "WALK").length;
  document.getElementById("focused-origin").textContent = dir.origin?.name || "Origin";
  document.getElementById("focused-dest").textContent = dir.dest?.name || "Destination";
  const chainEl = document.getElementById("focused-chain"); chainEl.innerHTML = "";
  itin.legs.forEach((leg, li) => {
    if (li > 0) chainEl.insertAdjacentHTML("beforeend", '<span class="leg-arrow">›</span>');
    const badge = document.createElement("span");
    badge.className = `leg-badge ${modeClass(leg.mode, leg)}`;
    if (leg.trip?.route?.color) badge.style.background = `#${leg.trip.route.color}`;
    badge.innerHTML = leg.trip?.routeShortName ? `${modeIcon(leg.mode, 12)} ${esc(leg.trip.routeShortName)}` : modeIcon(leg.mode, 14);
    chainEl.appendChild(badge);
  });
  const transfers = transitLegs > 1 ? transitLegs - 1 + " transfer" + (transitLegs > 2 ? "s" : "") : "Direct";
  document.getElementById("focused-meta").innerHTML = `<span>${durMin} min</span><span>·</span><span>${fmtTime(startT)} → ${fmtTime(endT)}</span><span>·</span><span>${transfers}</span><span>·</span><span>${modeIcon("WALK", 12)} ${Math.round(walkSec / 60)} min walk</span>`;
  const isMobile_fr = window.innerWidth <= 768;
  const shouldSync_fr = isMobile_fr && !dirPanel.classList.contains("shut");
  const beforeH_fr = shouldSync_fr ? dirPanel.offsetHeight : 0;
  dirPanel.classList.add("route-focused");
  document.querySelectorAll(".itin-card").forEach((c, i) => {
    if (i === idx) { c.classList.add("focused", "active"); c.classList.remove("card-hidden"); }
    else { c.classList.add("card-hidden"); }
  });
  if (shouldSync_fr) {
    // Animate from current height to full viewport
    dirPanel.style.transition = "none";
    dirPanel.style.height = beforeH_fr + "px";
    void dirPanel.offsetHeight;
    dirPanel.style.transition = "";
    dirPanel.style.height = window.innerHeight + "px";
  } else {
    dirSnap.remeasure();
  }
}

function unfocusRoute() {
  dirPanel.classList.remove("route-focused");
  document.querySelectorAll(".itin-card").forEach((c) => { c.classList.remove("focused", "card-hidden"); });
  // remeasure handles the smooth transition from full-screen back to snap height
  dirSnap.remeasure();
}

function highlightDirectStep(idx, stepEl) {
  document.querySelectorAll(".direct-step.selected").forEach((el) => el.classList.remove("selected"));
  stepEl.classList.add("selected");
  const geom = dir.directInfo?.stepGeometries?.[idx];
  if (!geom || !map.getSource("dir-highlight-src")) return;
  map.getSource("dir-highlight-src").setData({ type: "Feature", geometry: geom });
  if (geom?.coordinates?.length >= 2) {
    const coords = geom.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    const isMobile = window.innerWidth <= 768;
    const panelH = isMobile && !dirPanel.classList.contains("shut") ? dirPanel.getBoundingClientRect().height : 0;
    map.easeTo({ center: mid, duration: 400, padding: { top: 0, right: 0, bottom: panelH, left: 0 } });
  }
}

document.getElementById("dir-focused-back").addEventListener("click", unfocusRoute);
document.getElementById("dir-focused-close").addEventListener("click", () => { unfocusRoute(); closeDirPanel(); });

export function clearRoute() {
  if (_navHooks.isActive()) _navHooks.stop();
  dir.routeLayers.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
  dir.routeSources.forEach((id) => { if (map.getSource(id)) map.removeSource(id); });
  dir.routeLayers = []; dir.routeSources = []; dir.directInfo = null;
  dir.directRouteCoords = null; dir.directSteps = null; dir.directMaxspeeds = null;
  dir._directAlts = null; dir._directMode = null;
  document.getElementById("dir-btn").classList.remove("route-active");
  routeSnackbar.classList.add("hide");
  dirClearBtn.classList.add("hide");
  dirShareBtn.classList.add("hide");
}

function updateSnackbar() {
  // Don't show the snackbar when navigation HUD is active
  if (_navHooks.isActive()) { routeSnackbar.classList.add("hide"); return; }
  if (dir.activeIdx >= 0 && dirPanel.classList.contains("shut")) {
    document.getElementById("snackbar-from").textContent = dir.origin?.name || "Origin";
    document.getElementById("snackbar-to").textContent = dir.dest?.name || "Destination";
    if (dir.directInfo) {
      const { mode, durMin, distKm } = dir.directInfo;
      snackTags.innerHTML = [
        `<span class="snack-tag snack-tag-mode">${esc(OSRM_LABELS[mode])}</span>`,
        `<span class="snack-tag snack-tag-dur">${durMin} min</span>`,
        `<span class="snack-tag snack-tag-dist">${distKm} km</span>`,
      ].join("");
      routeSnackbar.classList.remove("hide");
    } else if (dir.itineraries[dir.activeIdx]) {
      const itin = dir.itineraries[dir.activeIdx];
      const startT = new Date(itin.start), endT = new Date(itin.end);
      const durMin = Math.round((endT - startT) / 60000);
      const transitLegs = itin.legs.filter((l) => l.mode !== "WALK");
      const chainHtml = transitLegs.length
        ? transitLegs.map((l) => `<span class="snack-tc-badge" style="background:${legCssColor(l.mode, l)}">${esc(l.trip?.routeShortName || l.mode.charAt(0))}</span>`).join('<span class="snack-tc-arrow">›</span>')
        : `<span class="snack-tc-walk">Walk</span>`;
      snackTags.innerHTML = [
        `<span class="snack-tag snack-tag-mode">${chainHtml}</span>`,
        `<span class="snack-tag snack-tag-dur">${durMin} min</span>`,
      ].join("");
      routeSnackbar.classList.remove("hide");
    } else {
      routeSnackbar.classList.add("hide");
    }
  } else {
    routeSnackbar.classList.add("hide");
  }
}

function drawRoute(itin) {
  clearRoute();
  const bounds = new maplibregl.LngLatBounds();
  itin.legs.forEach((leg, i) => {
    const coords = decodePolyline(leg.legGeometry.points, leg.legGeometry.precision);
    if (!coords.length) return;
    coords.forEach((c) => bounds.extend(c));
    const srcId = `dir-src-${i}`, casingId = `dir-cas-${i}`, lineId = `dir-ln-${i}`;
    const isWalk = leg.mode === "WALK", mapColor = isWalk ? getThemeWalkColor() : legColor(leg.mode, leg);
    map.addSource(srcId, { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } } });
    map.addLayer({ id: casingId, type: "line", source: srcId, paint: { "line-color": "#ffffff", "line-width": isWalk ? 8 : 9, "line-opacity": 0.95 }, layout: { "line-cap": "round", "line-join": "round" } });
    map.addLayer({ id: lineId, type: "line", source: srcId, paint: { "line-color": mapColor, "line-width": isWalk ? 4 : 5, "line-dasharray": isWalk ? [1.5, 2] : [1], "line-opacity": isWalk ? 0.9 : 0.85 }, layout: { "line-cap": "round", "line-join": "round" } });
    dir.routeSources.push(srcId); dir.routeLayers.push(casingId, lineId);
  });
  if (!bounds.isEmpty()) {
    const mob = window.innerWidth <= 768;
    const sheetPad = mob ? Math.round(window.innerHeight * 0.55) + 32 : 0;
    map.fitBounds(bounds, { padding: mob ? { top: 90, bottom: sheetPad, left: 40, right: 40 } : { top: 80, bottom: 80, left: 60, right: 540 }, duration: 600 });
  }
  document.getElementById("dir-btn").classList.add("route-active");
  dirClearBtn.classList.remove("hide");
  dirShareBtn.classList.remove("hide");
  updateSnackbar();
}

// --- Results mode ---
const dirSumFrom = document.getElementById("dir-sum-from");
const dirSumTo = document.getElementById("dir-sum-to");
const dirSumEdit = document.getElementById("dir-sum-edit");

// --- Go button loading state ---
let _goOrigHTML = null;
function setGoLoading(loading) {
  if (loading) {
    if (!_goOrigHTML) _goOrigHTML = dirGo.innerHTML;
    dirGo.disabled = true;
    dirGo.innerHTML = '<span class="btn-spinner"></span><span>Finding…</span>';
  } else {
    if (_goOrigHTML) { dirGo.innerHTML = _goOrigHTML; _goOrigHTML = null; }
    dirGo.disabled = !(dir.origin && dir.dest);
  }
}

function enterResultsMode() {
  const wpNames = dir.waypoints.filter(Boolean).map(w => w.name);
  dirSumFrom.textContent = dir.origin?.name || "Origin";
  dirSumTo.textContent = wpNames.length
    ? wpNames.join(" → ") + " → " + (dir.dest?.name || "Destination")
    : dir.dest?.name || "Destination";
  setGoLoading(false);

  // Apply class changes — on mobile this hides inputs/mode-bar/go, shows summary
  dirPanel.classList.add("results-shown");
  dirPanel.classList.remove("search-editing");

  // Let remeasure handle snapping to the correct height with smooth CSS transition.
  // This avoids transitioning to raw content height (which could be huge for
  // step-by-step routes) and then snapping down — remeasure caps correctly.
  syncResultsPanelHeight();
}
function exitResultsMode() { dirPanel.classList.remove("results-shown", "search-editing"); }
dirSumEdit.addEventListener("click", () => { dirPanel.classList.toggle("search-editing"); dirSnap.remeasure(); });

function _itinSkeletonHTML() {
  return Array.from({ length: 3 }, (_, i) =>
    `<div class="itin-skeleton" style="--i:${i}"><div class="itin-skel-header"><div class="skel-bone itin-skel-dur"></div><div class="skel-bone skel-line itin-skel-time"></div></div><div class="itin-skel-chain"><div class="skel-bone itin-skel-badge"></div><div class="skel-bone itin-skel-badge"></div><div class="skel-bone itin-skel-badge"></div></div></div>`
  ).join("");
}
function showDirLoading() { dirEmpty.classList.add("hide"); dirErr.classList.add("hide"); dirItins.innerHTML = _itinSkeletonHTML(); }
function showDirError(msg) { setGoLoading(false); dirLoad.classList.add("hide"); dirEmpty.classList.add("hide"); dirErr.textContent = msg; dirErr.classList.remove("hide"); }

// --- Nearest mosque from origin ---
export function findNearestMosqueFromOrigin(originLat, originLng) {
  let mosques = placesData.filter((p) => p.type === "mosque");
  if (activeTagFilters.size) {
    mosques = mosques.filter((p) => [...activeTagFilters].every((tagId) => p.tags?.[tagId] === true));
  }
  if (mosques.length === 0) {
    alert(activeTagFilters.size ? "No mosques match the active filters." : "No mosques found in the database.");
    return;
  }
  let nearest = null, minScore = Infinity;
  for (const mosque of mosques) {
    const s = scoreMosque(mosque, originLat, originLng);
    if (s < minScore) { minScore = s; nearest = mosque; }
  }
  if (nearest) {
    dir.dest = { lat: nearest.lat, lng: nearest.lng, name: nearest.name };
    dirTo.value = nearest.name;
    placeDestMarker(nearest.lng, nearest.lat);
    updateGoButton();
    if (dir.origin) {
      map.fitBounds(new maplibregl.LngLatBounds().extend([dir.origin.lng, dir.origin.lat]).extend([nearest.lng, nearest.lat]), { padding: 80, duration: 600 });
    }
  }
}

export async function autoSetNearestMosque(originLat, originLng) {
  if (!findingNearestMosque) return;
  let mosques = placesData.filter((p) => p.type === "mosque");
  if (activeTagFilters.size) {
    mosques = mosques.filter((p) => [...activeTagFilters].every((tagId) => p.tags?.[tagId] === true));
  }
  if (mosques.length === 0) return;
  let nearest = null, minScore = Infinity;
  for (const mosque of mosques) {
    const s = scoreMosque(mosque, originLat, originLng);
    if (s < minScore) { minScore = s; nearest = mosque; }
  }
  if (nearest) {
    dir.dest = { lat: nearest.lat, lng: nearest.lng, name: nearest.name };
    dirTo.value = nearest.name;
    placeDestMarker(nearest.lng, nearest.lat);
    updateGoButton();
    findingNearestMosque = false;
  }
}

// Mosque destination button in directions panel
const mosqueDestBtn = document.querySelector(".dir-mosque-dest");
if (mosqueDestBtn) {
  mosqueDestBtn.addEventListener("click", () => {
    if (dir.origin) {
      findNearestMosqueFromOrigin(dir.origin.lat, dir.origin.lng);
    } else {
      const originField = document.getElementById("dir-field-from");
      const wasPicking = originField.classList.contains("picking");
      if (wasPicking) originField.classList.remove("picking");
      originField.classList.remove("origin-needed");
      void originField.offsetWidth;
      originField.classList.add("origin-needed");
      originField.addEventListener("animationend", () => {
        originField.classList.remove("origin-needed");
        if (wasPicking) originField.classList.add("picking");
      }, { once: true });
      document.getElementById("dir-from").focus();
    }
  });
}
