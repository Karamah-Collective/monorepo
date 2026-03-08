import { map } from "./map-init.js";
import { DIGITRANSIT_URL, TRANSITOUS_URL, DT_API_KEY, NOMINATIM_VB, NOMINATIM_REV, DIGITRANSIT_GEO_URL, DIGITRANSIT_REV_URL } from "./config.js";
import { esc, escA, showToast, showLoadingToast, hideLoadingToast, initSheetDrag, initSegPill, haversineDistance } from "./utils.js";
import { MODE_PATHS, modeIcon, typeIcon } from "./icons.js";
import { setActiveTab } from "./map-controls.js";
import { placesData, activeTagFilters, closePlacesSheet } from "./places.js";

// --- State ---
let dirTravelMode = "drive";
let routeRequested = false;
export let findingNearestMosque = false;
export function setFindingNearestMosque(v) { findingNearestMosque = v; }

const OSRM_URLS = {
  drive: "https://routing.openstreetmap.de/routed-car/route/v1/driving",
  cycle: "https://routing.openstreetmap.de/routed-bike/route/v1/bike",
  walk: "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
};
const OSRM_COLORS = { walk: "#52525b", cycle: "#1FA86A", drive: "#FF6319" };
const OSRM_LABELS = { walk: "Walking", cycle: "Cycling", drive: "Driving" };
const OSRM_ALT_COLORS = { walk: "#94A3B8", cycle: "#34D399", drive: "#FBBF24" };

export const dir = {
  origin: null, dest: null, pickField: null,
  itineraries: [], activeIdx: -1, directInfo: null,
  originMarker: null, destMarker: null,
  routeLayers: [], routeSources: [], usingFallback: false,
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
const snackbarSub = document.getElementById("snackbar-sub");
const dirClearBtn = document.getElementById("dir-clear-route");

// --- Panel open/close ---
export function openDirPanel() {
  document.getElementById("places-sheet").classList.add("shut");
  dirPanel.style.height = "";
  document.getElementById("scrim").classList.remove("hide");
  routeSnackbar.classList.add("hide");
  setActiveTab("dir-btn");
  if (dir.originMarker) dir.originMarker.getElement().style.display = "";
  if (dir.destMarker) dir.destMarker.getElement().style.display = "";
  if (!dir.pickField) startPick("from");
  dirSnap.open();
}

export function closeDirPanel() {
  dirPanel.classList.add("shut");
  dirSnap.close();
  document.getElementById("scrim").classList.add("hide");
  stopPick();
  updateSnackbar();
  setActiveTab(null);
  if (dir.activeIdx < 0 || !dir.itineraries[dir.activeIdx]) {
    if (dir.originMarker) dir.originMarker.getElement().style.display = "none";
    if (dir.destMarker) dir.destMarker.getElement().style.display = "none";
  }
}

export function fullCloseDirPanel() {
  unfocusRoute();
  closeDirPanel();
  clearRoute();
  exitResultsMode();
  if (dir.originMarker) { dir.originMarker.remove(); dir.originMarker = null; }
  if (dir.destMarker) { dir.destMarker.remove(); dir.destMarker = null; }
}

document.getElementById("dir-btn").addEventListener("click", () =>
  dirPanel.classList.contains("shut") ? openDirPanel() : closeDirPanel(),
);
document.getElementById("dir-close").addEventListener("click", closeDirPanel);

const dirSnap = initSheetDrag(dirPanel, closeDirPanel);

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

    // Suppress time-bar transition so it snaps instantly to its new state;
    // `remeasure()` will smoothly animate the sheet height instead.
    dirTimeBar.style.transition = "none";

    // Apply real mode change
    dirPanel.dataset.travelMode = dirTravelMode;
    void dirTimeBar.offsetHeight;                  // commit time-bar layout
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

    // Restore time-bar transition next frame (after panel transition committed)
    requestAnimationFrame(() => { dirTimeBar.style.transition = ""; });

    // Auto-reload only if routes were already shown (user clicked Find Routes)
    if (dir.origin && dir.dest && routeRequested) findRoutes();
  });
});

document.getElementById("snackbar-body").addEventListener("click", () => {
  if (dirPanel.classList.contains("shut")) openDirPanel();
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
  dirItins.innerHTML = "";
  dirEmpty.classList.remove("hide");
  exitResultsMode();
  startPick("from");
  routeRequested = false;
  findingNearestMosque = false;

  // remeasure handles the smooth transition from current → target
  dirSnap.remeasure();
});

dirItins.addEventListener("click", (e) => {
  if (e.target.closest(".direct-expand")) {
    e.stopPropagation();
    if (dir.directInfo) focusDirectRoute();
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
  (field === "from" ? dirFrom.parentElement : dirTo.parentElement).classList.add("picking");
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

function setupDirAutocomplete(inputEl, suggestEl, field) {
  inputEl.addEventListener("input", () => {
    if (field === "from") dir.origin = null; else dir.dest = null;
    routeRequested = false;
    updateGoButton();
    clearTimeout(dirSugDebounce);
    const q = inputEl.value.trim();
    if (q.length < 2) { suggestEl.classList.add("hide"); return; }
    dirSugDebounce = setTimeout(() => dirGeoSearch(q, suggestEl, field), 300);
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
        startPick("to");
        // On mobile, focus destination field to keep keyboard open
        if (window.innerWidth <= 768) setTimeout(() => dirTo.focus(), 80);
      }
    } else {
      dir.dest = { lat, lng, name };
      placeDestMarker(lng, lat);
      stopPick();
    }
    updateGoButton();
  });
}

async function dirGeoSearch(q, suggestEl, field) {
  try {
    // Digitransit geocoding supports partial/prefix matching (Pelias); fall back to Nominatim
    let items = await _dtGeoSearch(q);
    if (!items.length) items = await _nominatimSearch(q);
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
    placesSheet.classList.add("shut");
    placesSheet.classList.remove("full");
    placesSheet.style.height = "";
    document.getElementById("scrim").classList.add("hide");
    setActiveTab(null);
  }
}
map.on("mousedown", closeOpenPanelOnMapInteract);
map.getCanvas().addEventListener("touchstart", closeOpenPanelOnMapInteract, { passive: true });

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
    startPick("to");
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
        return road ? (num ? `${road} ${num}` : road) : p.label?.split(",")[0] || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    }
  } catch {}
  try {
    const res = await fetch(`${NOMINATIM_REV}&lat=${lat}&lon=${lng}`, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    if (data.address) {
      const a = data.address;
      return a.road ? `${a.road}${a.house_number ? " " + a.house_number : ""}` : data.display_name.split(",")[0];
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
  if (!navigator.geolocation) {
    showToast("Location not available", "loc", "Your browser doesn't support location");
    return;
  }
  showLoadingToast("Finding your location\u2026");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      hideLoadingToast();
      const { latitude: lat, longitude: lng } = pos.coords;
      const name = await reverseGeocode(lat, lng);
      dir.origin = { lat, lng, name };
      dirFrom.value = name;
      placeOriginMarker(lng, lat);
      autoSetNearestMosque(lat, lng);
      updateGoButton();
      if (!dir.dest) startPick("to");
    },
    () => {
      hideLoadingToast();
      showDirError("Location access denied");
      showToast("Location is off", "loc", "Enable location to use this feature");
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

document.getElementById("dir-swap").addEventListener("click", () => {
  [dir.origin, dir.dest] = [dir.dest, dir.origin];
  dirFrom.value = dir.origin?.name || "";
  dirTo.value = dir.dest?.name || "";
  if (dir.origin) placeOriginMarker(dir.origin.lng, dir.origin.lat);
  else if (dir.originMarker) { dir.originMarker.remove(); dir.originMarker = null; }
  if (dir.dest) placeDestMarker(dir.dest.lng, dir.dest.lat);
  else if (dir.destMarker) { dir.destMarker.remove(); dir.destMarker = null; }
  updateGoButton();
});

// --- Date/time pickers ---
const dirTimeToggles = document.querySelectorAll(".time-opt");
const dirTimeNow = document.getElementById("dir-time-now");
const dirDate = document.getElementById("dir-date");
const dirTime = document.getElementById("dir-time");
const dirCustomRow = document.getElementById("dir-custom-time-row");
let dirTimeMode = "depart";
let dirUseNow = true;
let calYear, calMonth, calSelectedDate, tpSelectedH, tpSelectedM;

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const calOverlay = document.createElement("div");
calOverlay.id = "cal-overlay";
calOverlay.className = "picker-overlay hide";
calOverlay.innerHTML = `<div class="cal-head"><button id="cal-prev" class="cal-nav" aria-label="Previous month"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button><span id="cal-title"></span><button id="cal-next" class="cal-nav" aria-label="Next month"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button></div><div class="cal-weekdays"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div><div id="cal-grid" class="cal-grid"></div>`;
document.body.appendChild(calOverlay);

const timeOverlay = document.createElement("div");
timeOverlay.id = "time-overlay";
timeOverlay.className = "picker-overlay hide";
timeOverlay.innerHTML = `<div class="tp-wheels"><div class="tp-wheel-wrap"><div class="tp-wheel-label">Hour</div><div class="tp-wheel" id="tp-hours"></div></div><div class="tp-colon">:</div><div class="tp-wheel-wrap"><div class="tp-wheel-label">Min</div><div class="tp-wheel" id="tp-minutes"></div></div></div>`;
document.body.appendChild(timeOverlay);

const calGrid = document.getElementById("cal-grid");
const calTitle = document.getElementById("cal-title");

function setDefaultDatetime() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  calSelectedDate = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  tpSelectedH = now.getHours();
  tpSelectedM = now.getMinutes();
  dirDate.value = formatDisplayDate(calSelectedDate);
  dirTime.value = `${String(tpSelectedH).padStart(2, "0")}:${String(tpSelectedM).padStart(2, "0")}`;
}

function getDateValue() { return calSelectedDate; }
function getTimeValue() { return `${String(tpSelectedH).padStart(2, "0")}:${String(tpSelectedM).padStart(2, "0")}`; }

function formatDisplayDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function renderCalendar(slideDir) {
  calTitle.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;
  calGrid.innerHTML = "";
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  for (let i = offset - 1; i >= 0; i--) {
    const day = daysInPrev - i, pm = calMonth === 0 ? 12 : calMonth, py = calMonth === 0 ? calYear - 1 : calYear;
    calGrid.appendChild(makeCalDay(day, `${py}-${String(pm).padStart(2, "0")}-${String(day).padStart(2, "0")}`, "other-month", todayStr));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calGrid.appendChild(makeCalDay(d, `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, "", todayStr));
  }
  const remaining = (7 - ((offset + daysInMonth) % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const nm = calMonth === 11 ? 1 : calMonth + 2, ny = calMonth === 11 ? calYear + 1 : calYear;
    calGrid.appendChild(makeCalDay(d, `${ny}-${String(nm).padStart(2, "0")}-${String(d).padStart(2, "0")}`, "other-month", todayStr));
  }
  if (slideDir) {
    calGrid.classList.remove("cal-slide-left", "cal-slide-right");
    void calGrid.offsetHeight;
    calGrid.classList.add(slideDir === "left" ? "cal-slide-left" : "cal-slide-right");
    calGrid.addEventListener("animationend", () => calGrid.classList.remove("cal-slide-left", "cal-slide-right"), { once: true });
  }
}

function makeCalDay(label, iso, extraClass, todayStr) {
  const btn = document.createElement("button");
  btn.className = "cal-day";
  if (extraClass) btn.classList.add(extraClass);
  if (iso === todayStr) btn.classList.add("today");
  if (iso === calSelectedDate) btn.classList.add("selected");
  btn.textContent = label;
  btn.addEventListener("click", () => {
    calSelectedDate = iso;
    const [y, m] = iso.split("-").map(Number);
    calYear = y; calMonth = m - 1;
    dirDate.value = formatDisplayDate(iso);
    markNotNow();
    closePickerOverlays();
  });
  return btn;
}

document.getElementById("cal-prev").addEventListener("click", () => {
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar("right");
});
document.getElementById("cal-next").addEventListener("click", () => {
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar("left");
});

function renderTimePicker() {
  const hCol = document.getElementById("tp-hours");
  const mCol = document.getElementById("tp-minutes");
  hCol.innerHTML = ""; mCol.innerHTML = "";
  for (let h = 0; h < 24; h++) {
    const btn = document.createElement("button");
    btn.className = "tp-cell";
    if (h === tpSelectedH) btn.classList.add("selected");
    btn.textContent = String(h).padStart(2, "0");
    btn.addEventListener("click", () => {
      tpSelectedH = h;
      dirTime.value = getTimeValue();
      hCol.querySelectorAll(".tp-cell").forEach((c) => c.classList.remove("selected"));
      btn.classList.add("selected");
      markNotNow();
    });
    hCol.appendChild(btn);
  }
  for (let m = 0; m < 60; m += 5) {
    const btn = document.createElement("button");
    btn.className = "tp-cell";
    if (m === Math.round(tpSelectedM / 5) * 5) btn.classList.add("selected");
    btn.textContent = String(m).padStart(2, "0");
    btn.addEventListener("click", () => {
      tpSelectedM = m;
      dirTime.value = getTimeValue();
      mCol.querySelectorAll(".tp-cell").forEach((c) => c.classList.remove("selected"));
      btn.classList.add("selected");
      markNotNow();
    });
    mCol.appendChild(btn);
  }
  requestAnimationFrame(() => {
    const selH = hCol.querySelector(".selected");
    if (selH) selH.scrollIntoView({ block: "center", behavior: "instant" });
    const selM = mCol.querySelector(".selected");
    if (selM) selM.scrollIntoView({ block: "center", behavior: "instant" });
  });
}

function markNotNow() {
  dirUseNow = false;
  dirTimeNow.classList.remove("active");
  dirCustomRow.classList.add("show");
}

function closePickerOverlays() {
  calOverlay.classList.add("hide");
  timeOverlay.classList.add("hide");
}

function positionOverlay(overlay, triggerEl) {
  const r = triggerEl.getBoundingClientRect();
  overlay.style.left = r.left + "px";
  overlay.style.top = r.bottom + 6 + "px";
  overlay.style.width = Math.max(r.width, 260) + "px";
}

document.getElementById("date-trigger").addEventListener("click", (e) => {
  e.stopPropagation();
  timeOverlay.classList.add("hide");
  if (!calOverlay.classList.contains("hide")) { calOverlay.classList.add("hide"); return; }
  renderCalendar();
  positionOverlay(calOverlay, e.currentTarget);
  calOverlay.classList.remove("hide");
});

document.getElementById("time-trigger").addEventListener("click", (e) => {
  e.stopPropagation();
  calOverlay.classList.add("hide");
  if (!timeOverlay.classList.contains("hide")) { timeOverlay.classList.add("hide"); return; }
  renderTimePicker();
  positionOverlay(timeOverlay, e.currentTarget);
  timeOverlay.classList.remove("hide");
});

document.addEventListener("click", (e) => {
  if (!calOverlay.contains(e.target) && !e.target.closest("#date-trigger")) calOverlay.classList.add("hide");
  if (!timeOverlay.contains(e.target) && !e.target.closest("#time-trigger")) timeOverlay.classList.add("hide");
});
calOverlay.addEventListener("click", (e) => e.stopPropagation());
timeOverlay.addEventListener("click", (e) => e.stopPropagation());

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

  // Suppress custom-row transition so it snaps to final state;
  // remeasure will smoothly animate the sheet height instead.
  dirCustomRow.style.transition = "none";

  dirCustomRow.classList.toggle("show", !dirUseNow);
  if (dirUseNow) { setDefaultDatetime(); closePickerOverlays(); }

  // Commit row layout at final state, then let remeasure animate the sheet
  void dirCustomRow.offsetHeight;
  dirSnap.remeasure();

  // Restore custom-row transition next frame
  requestAnimationFrame(() => { dirCustomRow.style.transition = ""; });
});

// --- Routing ---
function decodePolyline(encoded, precision) {
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
  // Digitransit Pelias primary (partial match); Nominatim fallback
  const items = await _dtGeoSearch(q);
  if (items.length) return { lat: items[0].lat, lng: items[0].lng, name: items[0].name };
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1&countrycodes=fi&viewbox=${NOMINATIM_VB}&bounded=1`,
      { headers: { "Accept-Language": "en" } },
    );
    const results = await res.json();
    if (results.length) {
      const r = results[0];
      return { lat: +r.lat, lng: +r.lon, name: r.display_name.split(",")[0] };
    }
  } catch {}
  return null;
}

dirGo.addEventListener("click", findRoutes);

async function findRoutes() {
  setGoLoading(true);
  routeRequested = true;
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
  if (dirTravelMode !== "transit") { await findRoutesDirect(dirTravelMode); return; }

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
    intermediateStops { name code zoneId }
    trip { routeShortName tripHeadsign route { type } }
    legGeometry { points } duration distance
  } } } }
}`;
  try {
    const res = await fetch(DIGITRANSIT_URL, {
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
      intermediateStops: (leg.intermediateStops || []).map((s) => ({ name: s.name || "", code: stopCode(s.stopId), zoneId: null })),
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

// --- Route rendering helpers ---
function fmtTime(d) { return d.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }); }
function fmtDist(m) { if (m >= 1000) return (m / 1000).toFixed(1) + " km"; if (m >= 100) return Math.round(m / 10) * 10 + " m"; return Math.round(m) + " m"; }
function isTrunkBus(leg) { return leg.mode === "BUS" && leg.trip?.route?.type === 702; }
function modeClass(m, leg) {
  if (leg && isTrunkBus(leg)) return "trunk";
  return { WALK: "walk", BUS: "bus", TRAM: "tram", SUBWAY: "subway", METRO: "subway", RAIL: "rail", FERRY: "ferry", FUNICULAR: "funicular" }[m] || "bus";
}
function legColor(m, leg) {
  if (leg && isTrunkBus(leg)) return "#FF6319";
  return { WALK: "#52525b", BUS: "#1A73B8", TRAM: "#1FA86A", SUBWAY: "#FF6319", METRO: "#FF6319", RAIL: "#8C4799", FERRY: "#00B9E4" }[m] || "#1A73B8";
}

function dirModeIconSvg(mode, size = 20) {
  const s = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  if (mode === "walk") return `<svg ${s}>${MODE_PATHS.WALK}</svg>`;
  if (mode === "cycle") return `<svg ${s}><circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/><path d="M5.5 17.5L9 10h5.5l3.5 7.5M9 10l3.5 7.5"/><circle cx="13.5" cy="7" r="2" fill="currentColor" stroke="none"/></svg>`;
  if (mode === "drive") return `<svg ${s}><path d="M3 17V12.5l2.5-6h13l2.5 6V17a1 1 0 01-1 1H4a1 1 0 01-1-1z"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/><path d="M3 13h18"/></svg>`;
  return modeIcon("BUS", size);
}

function bearingName(deg) {
  return ["north","north-east","east","south-east","south","south-west","west","north-west"][Math.round((deg || 0) / 45) % 8];
}

function stepInstruction(step) {
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

function maneuverIconSvg(type, mod) {
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
  if (mod === "slight left") return `<svg ${a}><path d="M7 17l9-9M7 9v8h8"/></svg>`;
  if (mod === "slight right") return `<svg ${a}><path d="M17 17l-9-9M17 9v8h-8"/></svg>`;
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
function _otpStepInstruction(step, isFirst, isLast) {
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

function _otpManeuverIcon(step, isFirst, isLast) {
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

async function _dtDirectRoute(mode) {
  const dtMode = { walk: "WALK", cycle: "BICYCLE", drive: "CAR" }[mode];
  const query = `{ planConnection(
    origin: {location: {coordinate: {latitude: ${dir.origin.lat}, longitude: ${dir.origin.lng}}}}
    destination: {location: {coordinate: {latitude: ${dir.dest.lat}, longitude: ${dir.dest.lng}}}}
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
  const allCoords = [];
  node.legs.forEach((leg) => decodePolyline(leg.legGeometry.points, 5).forEach((c) => allCoords.push(c)));
  const totalDuration = node.legs.reduce((s, l) => s + l.duration, 0);
  const totalDistance = node.legs.reduce((s, l) => s + l.distance, 0);
  const allSteps = node.legs.flatMap((leg) => leg.steps || []);
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
  };
}

async function _osrmDirectRoute(mode) {
  const url = `${OSRM_URLS[mode]}/${dir.origin.lng},${dir.origin.lat};${dir.dest.lng},${dir.dest.lat}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Routing error ${res.status}`);
  const json = await res.json();
  if (json.code !== "Ok" || !json.routes?.length) throw new Error("No route found");
  const route = json.routes[0];
  const steps = route.legs[0]?.steps || [];
  const altColor = OSRM_ALT_COLORS[mode];
  let segIdx = 0;
  const stepFeatures = steps.filter((s) => s.geometry?.coordinates?.length > 1)
    .map((s) => ({ type: "Feature", geometry: s.geometry, properties: { segType: stepSegType(s.maneuver.type), idx: segIdx++ } }));
  const srcData = stepFeatures.length ? { type: "FeatureCollection", features: stepFeatures } : route.geometry;
  const stepsHTML = steps.map((step, si) => {
    const stype = step.maneuver.type, smod = step.maneuver.modifier || "";
    const iconClass = stype === "roundabout" || stype === "rotary" || stype === "exit roundabout" || stype === "exit rotary" ? "step-roundabout" : stype === "arrive" ? "step-arrive" : stype === "depart" ? "step-depart" : "";
    const dist = step.distance > 5 ? fmtDist(step.distance) : "";
    const dur = step.duration >= 30 ? Math.round(step.duration / 60) + " min" : "";
    const meta = [dist, dur].filter(Boolean).join(" · ");
    return `<div class="direct-step" data-step-idx="${si}"><div class="step-icon-wrap ${iconClass}">${maneuverIconSvg(stype, smod)}</div><div class="step-text-col"><div class="step-inst">${esc(stepInstruction(step))}</div>${meta ? `<div class="step-meta">${meta}</div>` : ""}</div></div>`;
  }).join("");
  return {
    coords: route.geometry.coordinates, duration: route.duration, distance: route.distance, stepsHTML,
    stepGeometries: steps.map((s) => s.geometry), stepFeatures, altColor, srcData,
  };
}

async function findRoutesDirect(mode) {
  showDirLoading();
  dirPanel.classList.remove("search-editing");
  // Digitransit OTP (WALK/BICYCLE/CAR) primary — OSRM demo server fallback
  let data;
  try {
    data = await _dtDirectRoute(mode);
  } catch (err) {
    console.warn("[Direct] Digitransit failed (" + (err.message || err) + "), trying OSRM…");
    try {
      data = await _osrmDirectRoute(mode);
    } catch (err2) {
      showDirError(err2.message || "Could not find route");
      return;
    }
  }
  const { coords, duration, distance, stepsHTML, stepGeometries, srcData, stepFeatures } = data;
  const color = OSRM_COLORS[mode], altColor = data.altColor || OSRM_ALT_COLORS[mode];
  const durMin = Math.round(duration / 60);
  const distKm = (distance / 1000).toFixed(1);
  clearRoute();
  map.addSource("dir-direct-src", { type: "geojson", data: srcData });
  map.addLayer({ id: "dir-direct-cas", type: "line", source: "dir-direct-src", paint: { "line-color": "#ffffff", "line-width": mode === "walk" ? 8 : 9, "line-opacity": 0.95 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({
    id: "dir-direct-ln", type: "line", source: "dir-direct-src",
    paint: {
      "line-color": stepFeatures?.length ? ["case", ["==", ["get", "segType"], "roundabout"], "#8C4799", ["==", ["%", ["get", "idx"], 2], 0], color, altColor] : color,
      "line-width": mode === "walk" ? 4 : 5, "line-dasharray": mode === "walk" ? [1.5, 2] : [1], "line-opacity": 0.9,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addSource("dir-highlight-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "dir-highlight-ln", type: "line", source: "dir-highlight-src", paint: { "line-color": color, "line-width": mode === "walk" ? 10 : 12, "line-opacity": 0.45 }, layout: { "line-cap": "round", "line-join": "round" } });
  dir.routeSources.push("dir-direct-src", "dir-highlight-src");
  dir.routeLayers.push("dir-direct-cas", "dir-direct-ln", "dir-highlight-ln");
  const bounds = new maplibregl.LngLatBounds();
  coords.forEach((c) => bounds.extend(c));
  const mob = window.innerWidth <= 768;
  const sheetPad = mob ? Math.round(window.innerHeight * 0.55) + 32 : 0;
  map.fitBounds(bounds, { padding: mob ? { top: 90, bottom: sheetPad, left: 40, right: 40 } : { top: 80, bottom: 80, left: 60, right: 540 }, duration: 600 });
  dir.directInfo = { mode, durMin, distKm, stepGeometries };
  dir.activeIdx = 0;
  const durLabel = durMin < 60 ? `${durMin} min` : `${Math.floor(durMin / 60)}h ${durMin % 60}m`;
  dirEmpty.classList.add("hide");
  dirLoad.classList.add("hide");
  dirErr.classList.add("hide");
  dirItins.innerHTML = `
      <div class="itin-card direct-card active" style="--dc:${color}">
        <div class="direct-header">
          <div class="direct-mode-icon">${dirModeIconSvg(mode, 20)}</div>
          <div class="direct-summary">
            <span class="direct-dur">${durLabel}</span>
            <span class="direct-meta">${OSRM_LABELS[mode]} · ${distKm} km</span>
          </div>
          <div class="direct-endpoints">
            <span class="direct-ep">${esc(dir.origin.name)}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <span class="direct-ep">${esc(dir.dest.name)}</span>
          </div>
          <button class="direct-expand" title="Full screen directions">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </div>
        <div class="direct-steps">${stepsHTML}</div>
      </div>`;
  document.getElementById("dir-btn").classList.add("route-active");
  dirClearBtn.classList.remove("hide");
  enterResultsMode();
  updateSnackbar();
}

function renderItineraries() {
  dirEmpty.classList.add("hide"); dirLoad.classList.add("hide"); dirErr.classList.add("hide");
  dirItins.innerHTML = ""; dir.activeIdx = -1;
  if (dir.usingFallback) dirItins.insertAdjacentHTML("afterbegin", '<div class="fallback-notice">⚠ HSL routing unavailable — showing community transit data (Transitous). Times may be less accurate.</div>');
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
    hdr.innerHTML = `<div><div class="itin-dur">${durMin} min</div><div class="itin-walk">${modeIcon("WALK", 12)} ${Math.round(walkSec / 60)} min walk · ${transitLegs > 1 ? transitLegs - 1 + " transfer" + (transitLegs > 2 ? "s" : "") : "direct"}</div></div><div class="itin-time">${fmtTime(startT)} → ${fmtTime(endT)}</div><button class="itin-expand" title="Expand route"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>`;
    const chain = document.createElement("div"); chain.className = "itin-chain";
    itin.legs.forEach((leg, li) => {
      if (li > 0) chain.insertAdjacentHTML("beforeend", '<span class="leg-arrow">›</span>');
      const badge = document.createElement("span");
      badge.className = `leg-badge ${modeClass(leg.mode, leg)}`;
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
      const color = legColor(leg.mode, leg);
      const fromTime = fmtTime(new Date(leg.start.scheduledTime)), toTime = fmtTime(new Date(leg.end.scheduledTime));
      const durL = Math.round(leg.duration / 60), distM = Math.round(leg.distance);
      let modeName = leg.mode === "WALK" ? `Walk ${distM >= 1000 ? (distM / 1000).toFixed(1) + " km" : distM + " m"}` : `${leg.trip?.routeShortName || leg.mode} → ${leg.trip?.tripHeadsign || leg.to.name}`;
      const expandHint = hasStops ? ` <span class="leg-expand-hint">${stops.length} stop${stops.length > 1 ? "s" : ""} <span class="leg-chevron">›</span></span>` : "";
      let interHtml = "";
      if (hasStops) {
        interHtml = '<div class="leg-intermediate"><div class="leg-inter-inner">' + stops.map((s) => `<div class="leg-inter-stop"><span class="leg-inter-dot" style="background:${color}"></span><span class="leg-inter-name">${esc(s.name || "Stop")}${s.code ? " <small>(" + esc(s.code) + ")</small>" : ""}${s.zoneId ? ' <span class="zone-badge zone-' + s.zoneId.toLowerCase() + ' zone-inline">' + esc(s.zoneId) + "</span>" : ""}</span></div>`).join("") + "</div></div>";
      }
      row.innerHTML = `<div class="leg-timeline"><span class="leg-icon" style="background:${color}">${modeIcon(leg.mode, 12)}</span><div class="leg-line" style="background:${color}"></div></div><div class="leg-info"><div class="leg-mode-name">${esc(modeName)}${expandHint}</div><div class="leg-stops"><span class="leg-stop-time">${fromTime}</span> ${esc(leg.from.name)}${leg.from.stop?.code ? " <small>(" + esc(leg.from.stop.code) + ")</small>" : ""}${leg.from.stop?.zoneId ? ' <span class="zone-badge zone-' + leg.from.stop.zoneId.toLowerCase() + ' zone-inline">' + esc(leg.from.stop.zoneId) + "</span>" : ""}</div>${interHtml}<div class="leg-stops"><span class="leg-stop-time">${toTime}</span> ${esc(leg.to.name)}${leg.to.stop?.code ? " <small>(" + esc(leg.to.stop.code) + ")</small>" : ""}${leg.to.stop?.zoneId ? ' <span class="zone-badge zone-' + leg.to.stop.zoneId.toLowerCase() + ' zone-inline">' + esc(leg.to.stop.zoneId) + "</span>" : ""}</div><div class="leg-dist">${durL} min</div></div>`;
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
      if (leg.from.stop?.zoneId) zones.add(leg.from.stop.zoneId);
      if (leg.to.stop?.zoneId) zones.add(leg.to.stop.zoneId);
      if (leg.intermediateStops) leg.intermediateStops.forEach((s) => { if (s.zoneId) zones.add(s.zoneId); });
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
      if (e.target.closest(".itin-expand")) { e.stopPropagation(); selectItinerary(idx); focusRoute(idx); return; }
      selectItinerary(idx);
    });
  });
  // Enter results mode AFTER cards are built so the panel measures correct height
  enterResultsMode();
  if (dir.itineraries.length) selectItinerary(0);
}

function selectItinerary(idx) {
  if (dir.activeIdx === idx) return;
  dir.activeIdx = idx;
  document.querySelectorAll(".itin-card").forEach((c, i) => c.classList.toggle("active", i === idx));
  drawRoute(dir.itineraries[idx]);
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

function focusDirectRoute() {
  if (!dir.directInfo) return;
  const { mode, durMin, distKm } = dir.directInfo;
  document.getElementById("focused-origin").textContent = dir.origin?.name || "Origin";
  document.getElementById("focused-dest").textContent = dir.dest?.name || "Destination";
  const chainEl = document.getElementById("focused-chain"); chainEl.innerHTML = "";
  const badge = document.createElement("span"); badge.className = `leg-badge mode-${mode}`;
  badge.innerHTML = dirModeIconSvg(mode, 12); chainEl.appendChild(badge);
  const durLabel = durMin < 60 ? `${durMin} min` : `${Math.floor(durMin / 60)}h ${durMin % 60}m`;
  document.getElementById("focused-meta").innerHTML = `<span>${OSRM_LABELS[mode]}</span><span>·</span><span>${durLabel}</span><span>·</span><span>${distKm} km</span>`;
  const isMobile_fd = window.innerWidth <= 768;
  const shouldSync_fd = isMobile_fd && !dirPanel.classList.contains("shut");
  const beforeH_fd = shouldSync_fd ? dirPanel.offsetHeight : 0;
  dirPanel.classList.add("route-focused");
  document.querySelectorAll(".itin-card").forEach((c) => {
    if (c.classList.contains("direct-card")) { c.classList.add("focused", "active"); c.classList.remove("card-hidden"); }
    else { c.classList.add("card-hidden"); }
  });
  if (shouldSync_fd) {
    dirPanel.style.transition = "none";
    dirPanel.style.height = beforeH_fd + "px";
    void dirPanel.offsetHeight;
    dirPanel.style.transition = "";
    dirPanel.style.height = window.innerHeight + "px";
  } else {
    dirSnap.remeasure();
  }
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
  dir.routeLayers.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
  dir.routeSources.forEach((id) => { if (map.getSource(id)) map.removeSource(id); });
  dir.routeLayers = []; dir.routeSources = []; dir.directInfo = null;
  document.getElementById("dir-btn").classList.remove("route-active");
  routeSnackbar.classList.add("hide");
  dirClearBtn.classList.add("hide");
}

function updateSnackbar() {
  if (dir.activeIdx >= 0 && dirPanel.classList.contains("shut")) {
    document.getElementById("snackbar-from").textContent = dir.origin?.name || "Origin";
    document.getElementById("snackbar-to").textContent = dir.dest?.name || "Destination";
    if (dir.directInfo) {
      const { mode, durMin, distKm } = dir.directInfo;
      snackbarSub.textContent = `${OSRM_LABELS[mode]} · ${durMin} min · ${distKm} km`;
      routeSnackbar.classList.remove("hide");
    } else if (dir.itineraries[dir.activeIdx]) {
      const itin = dir.itineraries[dir.activeIdx];
      const startT = new Date(itin.start), endT = new Date(itin.end);
      const durMin = Math.round((endT - startT) / 60000);
      const modes = itin.legs.filter((l) => l.mode !== "WALK").map((l) => l.trip?.routeShortName || l.mode.charAt(0) + l.mode.slice(1).toLowerCase()).join(" → ");
      snackbarSub.textContent = modes ? `${durMin} min · ${modes}` : `${durMin} min walk`;
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
    const isWalk = leg.mode === "WALK", mapColor = isWalk ? "#1e293b" : legColor(leg.mode, leg);
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
  dirSumFrom.textContent = dir.origin?.name || "Origin";
  dirSumTo.textContent = dir.dest?.name || "Destination";
  setGoLoading(false);

  // Apply class changes — on mobile this hides inputs/mode-bar/go, shows summary
  dirPanel.classList.add("results-shown");
  dirPanel.classList.remove("search-editing");

  // Let remeasure handle snapping to the correct height with smooth CSS transition.
  // This avoids transitioning to raw content height (which could be huge for
  // step-by-step routes) and then snapping down — remeasure caps correctly.
  dirSnap.remeasure();
}
function exitResultsMode() { dirPanel.classList.remove("results-shown", "search-editing"); }
dirSumEdit.addEventListener("click", () => { dirPanel.classList.toggle("search-editing"); dirSnap.remeasure(); });

function showDirLoading() { dirEmpty.classList.add("hide"); dirErr.classList.add("hide"); dirItins.innerHTML = ""; }
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
  let nearest = null, minDist = Infinity;
  for (const mosque of mosques) {
    const dist = haversineDistance(originLat, originLng, mosque.lat, mosque.lng);
    if (dist < minDist) { minDist = dist; nearest = mosque; }
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
  let nearest = null, minDist = Infinity;
  for (const mosque of mosques) {
    const dist = haversineDistance(originLat, originLng, mosque.lat, mosque.lng);
    if (dist < minDist) { minDist = dist; nearest = mosque; }
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
