import { map } from "./map-init.js";
import { showToast, haversineDistance, requestLocation } from "./utils.js";
import { dir, openDirPanel, placeOriginMarker, placeDestMarker, updateGoButton, reverseGeocode, setFindingNearestMosque } from "./directions.js";
import { placesData, activeTagFilters, closePlacesSheet } from "./places.js";

// --- Constants / state ---
const PRAYER_NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const HELSINKI_LAT = 60.1699;
const HELSINKI_LNG = 24.9384;

function isFriday() { return new Date().getDay() === 5; }
function prayerDisplayName(name) { return (name === "Dhuhr" && isFriday()) ? "Jumu\u2019ah" : name; }

// --- Time-format preference (Menu sheet \u2192 Preferences \u2192 "12-hour prayer times") ---
const TIME_FORMAT_KEY = "hf_prayer_time_format"; // "12" | "24", default "24" (matches previous hardcoded behavior)
const DEFAULT_TIME_FORMAT = "24";

/** @returns {"12"|"24"} the currently-selected prayer time display format. */
export function getPrayerTimeFormat() {
  return localStorage.getItem(TIME_FORMAT_KEY) === "12" ? "12" : DEFAULT_TIME_FORMAT;
}
/** @param {"12"|"24"} format @returns {void} */
export function setPrayerTimeFormat(format) {
  localStorage.setItem(TIME_FORMAT_KEY, format === "12" ? "12" : "24");
}
/**
 * Format a prayer time Date per the current 12h/24h preference.
 * @param {Date} date
 * @returns {string}
 */
function _formatPrayerTime(date) {
  return getPrayerTimeFormat() === "12"
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

let prayerTimesToday = null;
let sunriseTime = null;
let isRamadan = false;
let prayerWatchInterval = null;
let lastAlertedPrayer = null;
// Last coordinates used to fetch prayer times \u2014 reused by refreshPrayerTimes()
// so changing a Preferences dropdown re-fetches without a fresh geolocation
// prompt (initPrayerTimes() only ever reads location silently, on launch).
let _lastLat = HELSINKI_LAT;
let _lastLng = HELSINKI_LNG;

// --- Prayer calculation preferences (Menu sheet \u2192 Preferences) ---
// Aladhan API `method`/`school` params \u2014 see src/menu.js for the UI. Defaults
// (method 3, school 0) match this app's previous hardcoded call exactly, so
// nothing changes for existing users until they actively pick something else.
const PRAYER_METHOD_KEY = "hf_prayer_method";
const PRAYER_SCHOOL_KEY = "hf_prayer_school";
const DEFAULT_PRAYER_METHOD = "3"; // Muslim World League
const DEFAULT_PRAYER_SCHOOL = "0"; // Shafi / standard Asr calculation

/**
 * Aladhan `method` parameter values \u2014 fetched directly from
 * https://api.aladhan.com/v1/methods (not guessed) on 2026-08-02. Method 99
 * ("CUSTOM") is intentionally excluded \u2014 it requires extra angle parameters
 * this app doesn't collect a UI for.
 */
export const PRAYER_METHODS = [
  { id: "0", label: "Shia Ithna-Ashari, Leva Institute, Qum" },
  { id: "1", label: "University of Islamic Sciences, Karachi" },
  { id: "2", label: "Islamic Society of North America (ISNA)" },
  { id: "3", label: "Muslim World League" },
  { id: "4", label: "Umm Al-Qura University, Makkah" },
  { id: "5", label: "Egyptian General Authority of Survey" },
  { id: "7", label: "Institute of Geophysics, University of Tehran" },
  { id: "8", label: "Gulf Region" },
  { id: "9", label: "Kuwait" },
  { id: "10", label: "Qatar" },
  { id: "11", label: "Majlis Ugama Islam Singapura, Singapore" },
  { id: "12", label: "Union Organization Islamic de France" },
  { id: "13", label: "Diyanet \u0130\u015fleri Ba\u015fkanl\u0131\u011f\u0131, Turkey" },
  { id: "14", label: "Spiritual Administration of Muslims of Russia" },
  { id: "15", label: "Moonsighting Committee Worldwide" },
  { id: "16", label: "Dubai" },
  { id: "17", label: "Jabatan Kemajuan Islam Malaysia (JAKIM)" },
  { id: "18", label: "Tunisia" },
  { id: "19", label: "Algeria" },
  { id: "20", label: "Kementerian Agama Republik Indonesia" },
  { id: "21", label: "Morocco" },
  { id: "22", label: "Comunidade Islamica de Lisboa" },
  { id: "23", label: "Ministry of Awqaf, Islamic Affairs and Holy Places, Jordan" },
];

/** @returns {string} the currently-selected Aladhan `method` id (default "3"). */
export function getPrayerMethod() {
  return localStorage.getItem(PRAYER_METHOD_KEY) || DEFAULT_PRAYER_METHOD;
}
/** @returns {string} the currently-selected Aladhan `school` id (default "0"). */
export function getPrayerSchool() {
  return localStorage.getItem(PRAYER_SCHOOL_KEY) || DEFAULT_PRAYER_SCHOOL;
}
/** @param {string} id Aladhan `method` id to persist. @returns {void} */
export function setPrayerMethod(id) { localStorage.setItem(PRAYER_METHOD_KEY, String(id)); }
/** @param {string} id Aladhan `school` id to persist (0 = Shafi, 1 = Hanafi). @returns {void} */
export function setPrayerSchool(id) { localStorage.setItem(PRAYER_SCHOOL_KEY, String(id)); }

// --- Prayer-contextual mosque scoring ---
// Returns an effective "cost" for a mosque — lower is better.
// Starts with haversine distance, then applies multipliers
// based on the current prayer window and mosque capabilities.
export function scoreMosque(mosque, userLat, userLng) {
  const dist = haversineDistance(userLat, userLng, mosque.lat, mosque.lng);
  let score = Math.max(dist, 0.05); // floor to avoid zero-divide
  const tags = mosque.tags || {};

  // Small baseline bonus for mosques that host all five daily prayers
  if (tags.daily_prayers) score *= 0.85;

  // Friday Dhuhr → strongly prefer mosques with Jummah
  if (isFriday() && _isInPrayerWindow("Dhuhr")) {
    score *= tags.jummah ? 0.3 : 1.5;
  }

  // Ramadan → prefer mosques with Taraweeh (after Isha)
  if (isRamadan && _isInPrayerWindow("Isha")) {
    score *= tags.taraweeh ? 0.4 : 1.0;
  }

  // Eid day → prefer mosques that host Eid prayer
  if (tags.eid_prayer && _isEidWindow()) {
    score *= 0.4;
  }

  return score;
}

// True if `name` is the current prayer or the upcoming one within 30 min
function _isInPrayerWindow(name) {
  if (!prayerTimesToday?.[name]) return false;
  const now = Date.now();
  const prayerMs = prayerTimesToday[name].getTime();
  // Window: from 30 min before prayer until the *next* prayer starts
  const idx = PRAYER_NAMES.indexOf(name);
  const nextPrayer = idx < PRAYER_NAMES.length - 1 ? prayerTimesToday[PRAYER_NAMES[idx + 1]] : null;
  const windowEnd = nextPrayer ? nextPrayer.getTime() : prayerMs + 3 * 3600000;
  return now >= prayerMs - 30 * 60000 && now < windowEnd;
}

function _isEidWindow() {
  // Approximate: 1 Shawwal (after Ramadan) or 10 Dhul-Hijjah.
  // We detect the day after Ramadan ends (isRamadan was true yesterday).
  // For simplicity, check if today's Hijri month is 10 (Shawwal) day 1,
  // or month 12 (Dhul-Hijjah) day 10. This relies on Aladhan data which
  // we may not have parsed deeply, so just return false for now — the tag
  // bonus is a mild preference, not a hard filter.
  return false;
}

// --- Fetch & parse ---
async function fetchPrayerTimes(lat, lng) {
  const ts = Math.floor(Date.now() / 1000);
  const method = getPrayerMethod();
  const school = getPrayerSchool();
  const url = `https://api.aladhan.com/v1/timings/${ts}?latitude=${lat}&longitude=${lng}&method=${method}&school=${school}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`Aladhan HTTP ${resp.status}`);
  return (await resp.json()).data;
}

function parsePrayerTimings(raw) {
  const today = new Date();
  const result = {};
  for (const name of PRAYER_NAMES) {
    const [h, m] = raw[name].split(":").map(Number);
    result[name] = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0);
  }
  if (raw.Sunrise) {
    const [h, m] = raw.Sunrise.split(":").map(Number);
    sunriseTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0);
  }
  return result;
}

function getCurrentPrayer() {
  if (!prayerTimesToday) return null;
  const now = new Date();
  if (prayerTimesToday.Fajr <= now && sunriseTime && now < sunriseTime) return { name: "Fajr", time: prayerTimesToday.Fajr };
  if (sunriseTime && now >= sunriseTime && now < prayerTimesToday.Dhuhr) return null;
  for (let i = PRAYER_NAMES.length - 1; i >= 0; i--) {
    if (prayerTimesToday[PRAYER_NAMES[i]] <= now) return { name: PRAYER_NAMES[i], time: prayerTimesToday[PRAYER_NAMES[i]] };
  }
  return { name: "Isha", time: prayerTimesToday.Isha };
}

function getNextPrayer() {
  if (!prayerTimesToday) return null;
  const now = new Date();
  if (prayerTimesToday.Fajr <= now && sunriseTime && now < sunriseTime) return { name: "Dhuhr", time: prayerTimesToday.Dhuhr };
  for (const name of PRAYER_NAMES) {
    if (prayerTimesToday[name] > now) return { name, time: prayerTimesToday[name] };
  }
  const tomorrow = new Date(prayerTimesToday.Fajr);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { name: "Fajr", time: tomorrow };
}

function formatPrayerCountdown(date) {
  const diffMin = Math.round((date - new Date()) / 60000);
  if (diffMin < 1) return "in less than a minute";
  if (diffMin < 60) return `in ${diffMin} min`;
  const h = Math.floor(diffMin / 60), m = diffMin % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}

function showPrayerToast(name) { showToast(`Time for ${prayerDisplayName(name)}`, "clock"); }

function showPrayerSnack(text, autoHide = false) {
  const el = document.getElementById("prayer-snack");
  document.getElementById("prayer-snack-title").textContent = text;
  el.classList.remove("hide", "collapsed");
  if (autoHide) setTimeout(() => dismissPrayerSnack(), 4000);
}

function dismissPrayerSnack() {
  const el = document.getElementById("prayer-snack");
  if (el.classList.contains("collapsed")) return;
  el.classList.remove("expanded");
  el.classList.add("collapsed");
}

export function collapsePrayerForMapInteraction() {
  dismissPrayerSnack();
}

function startPrayerWatcher() {
  if (prayerWatchInterval) clearInterval(prayerWatchInterval);
  prayerWatchInterval = setInterval(() => {
    if (!prayerTimesToday) return;
    const now = new Date();
    for (const name of PRAYER_NAMES) {
      const diffMin = (now - prayerTimesToday[name]) / 60000;
      if (diffMin >= 0 && diffMin < 1 && lastAlertedPrayer !== name) {
        lastAlertedPrayer = name;
        showPrayerToast(name);
        return;
      }
    }
    const snackEl = document.getElementById("prayer-snack");
    if (!snackEl.classList.contains("hide")) {
      const next = getNextPrayer();
      if (next) document.getElementById("prayer-snack-title").textContent = `${prayerDisplayName(next.name)} ${formatPrayerCountdown(next.time)}`;
    }
  }, 30000);
}

/**
 * Check if device likely has compass/orientation support.
 * @returns {boolean}
 */
function _hasOrientationSupport() {
  return typeof DeviceOrientationEvent !== "undefined" && window.innerWidth < 769;
}

/**
 * Lazy-load qibla.js and open the overlay.
 */
async function _openQiblaOverlay() {
  try {
    const { openQibla } = await import("./qibla.js");
    openQibla();
  } catch (err) {
    console.error("[Prayer] Failed to load Qibla module:", err);
  }
}

/**
 * Rebuild the expanded prayer-times list's contents in place. Shared by
 * togglePrayerExpanded() (opening the list) and refreshPrayerTimes()
 * (re-rendering it live if it's already open when a Preferences change
 * re-fetches today's times).
 * @returns {void}
 */
function _renderExpandedPrayerList() {
  const listEl = document.getElementById("prayer-times-inner");
  listEl.innerHTML = "";
  if (!prayerTimesToday) {
    listEl.innerHTML = Array.from({ length: 5 }, () =>
      '<div class="prayer-skel-item"><div class="skel-bone skel-line prayer-skel-name"></div><div class="skel-bone skel-line prayer-skel-time"></div></div>'
    ).join("");
    return;
  }
  const current = getCurrentPrayer(), next = getNextPrayer();
  for (const name of PRAYER_NAMES) {
    const time = prayerTimesToday[name];
    const timeStr = _formatPrayerTime(time);
    const item = document.createElement("div");
    item.className = "prayer-time-item";
    if (current?.name === name) item.classList.add("current");
    if (next?.name === name) item.classList.add("next");
    const nameEl = document.createElement("div"); nameEl.className = "prayer-time-name"; nameEl.textContent = prayerDisplayName(name);
    const timeEl = document.createElement("div"); timeEl.className = "prayer-time-value"; timeEl.textContent = timeStr;
    item.appendChild(nameEl); item.appendChild(timeEl);
    listEl.appendChild(item);
  }
  // Qibla button — mobile only, needs compass sensor
  if (_hasOrientationSupport()) {
    const qiblaBtn = document.createElement("button");
    qiblaBtn.className = "qibla-btn";
    qiblaBtn.textContent = "Qibla";
    qiblaBtn.addEventListener("click", _openQiblaOverlay);
    listEl.appendChild(qiblaBtn);
  }
}

function togglePrayerExpanded() {
  const el = document.getElementById("prayer-snack");
  const isExpanded = el.classList.toggle("expanded");
  if (isExpanded) {
    _renderExpandedPrayerList();
  } else {
    const inner = document.getElementById("prayer-times-inner");
    setTimeout(() => { if (!el.classList.contains("expanded")) inner.innerHTML = ""; }, 350);
  }
}

// Finds nearest mosque using device location, then sets up directions
function findNearestMosque() {
  setFindingNearestMosque(true);
  requestLocation().then(
    async (pos) => {
      const userLat = pos.coords.latitude, userLng = pos.coords.longitude;
      let mosques = placesData.filter((p) => p.type === "mosque" || p.tags?.space_type_mosque === true);
      if (activeTagFilters.size) mosques = mosques.filter((p) => [...activeTagFilters].every((tagId) => p.tags?.[tagId] === true));
      if (mosques.length === 0) {
        alert(activeTagFilters.size ? "No mosques match the active filters." : "No mosques found in the database.");
        setFindingNearestMosque(false);
        return;
      }
      let nearest = null, minScore = Infinity;
      for (const mosque of mosques) {
        const s = scoreMosque(mosque, userLat, userLng);
        if (s < minScore) { minScore = s; nearest = mosque; }
      }
      if (nearest) {
        const originName = await reverseGeocode(userLat, userLng);
        dir.origin = { lat: userLat, lng: userLng, name: originName };
        document.getElementById("dir-from").value = originName;
        placeOriginMarker(userLng, userLat);
        dir.dest = { lat: nearest.lat, lng: nearest.lng, name: nearest.name };
        document.getElementById("dir-to").value = nearest.name;
        placeDestMarker(nearest.lng, nearest.lat);
        updateGoButton();
        dismissPrayerSnack();
        closePlacesSheet();
        openDirPanel();
        setFindingNearestMosque(false);
        map.fitBounds(new maplibregl.LngLatBounds().extend([userLng, userLat]).extend([nearest.lng, nearest.lat]), { padding: 80, duration: 600 });
      }
    },
    (error) => {
      console.error("Geolocation error:", error);
      showToast("Location is off", "loc", error.message);
      dismissPrayerSnack();
      closePlacesSheet();
      openDirPanel();
      setFindingNearestMosque(false);
    },
  );
}

/**
 * Fetch + parse today's prayer times for the given coordinates and update
 * every dependent bit of UI (Ramadan suhoor/iftar labels, the collapsed
 * snack's countdown text, the prayer watcher, and — if already open — the
 * expanded prayer-times list). Shared by initPrayerTimes() (first load) and
 * refreshPrayerTimes() (re-fetch after a Preferences change).
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<void>}
 */
async function _loadAndApplyPrayerTimes(lat, lng) {
  try {
    const data = await fetchPrayerTimes(lat, lng);
    prayerTimesToday = parsePrayerTimings(data.timings);
    isRamadan = Number(data.date?.hijri?.month?.number) === 9;
    _applyPrayerTimesToUI();
  } catch (err) {
    console.warn("[Prayer] Could not fetch prayer times:", err.message);
  }
}

/**
 * Push whatever is currently in `prayerTimesToday`/`isRamadan` out to every
 * dependent bit of UI (Ramadan suhoor/iftar labels, the collapsed snack's
 * countdown text, the prayer watcher, and — if already open — the expanded
 * prayer-times list). Separated from the fetch itself so a display-only
 * change (e.g. the 12-hour/24-hour time-format preference) can re-render
 * without a network round-trip — see refreshPrayerTimeDisplay().
 * @returns {void}
 */
function _applyPrayerTimesToUI() {
  if (!prayerTimesToday) return;
  const snackEl = document.getElementById("prayer-snack");
  if (isRamadan) {
    snackEl.classList.add("ramadan-active");
    document.getElementById("ramadan-suhoor").textContent = _formatPrayerTime(prayerTimesToday.Fajr);
    document.getElementById("ramadan-iftar").textContent = _formatPrayerTime(prayerTimesToday.Maghrib);
  } else {
    snackEl.classList.remove("ramadan-active");
  }
  const next = getNextPrayer();
  if (next) showPrayerSnack(`${prayerDisplayName(next.name)} ${formatPrayerCountdown(next.time)}`);
  startPrayerWatcher();
  if (snackEl.classList.contains("expanded")) _renderExpandedPrayerList();
}

/**
 * Re-render already-fetched prayer times with the current time-format
 * preference, with no network re-fetch (unlike refreshPrayerTimes(), which
 * re-fetches because method/school actually change the underlying times).
 * Called by the Menu sheet's Preferences section when the 12-hour/24-hour
 * toggle changes. No-ops if today's times haven't loaded yet.
 * @returns {void}
 */
export function refreshPrayerTimeDisplay() {
  _applyPrayerTimesToUI();
}

export async function initPrayerTimes() {
  let lat = HELSINKI_LAT, lng = HELSINKI_LNG;
  // Only use geolocation if already granted — don't trigger the browser prompt
  // here. This preserves the prompt for explicit user actions (locate button,
  // directions) so it appears when the user actually expects it.
  try {
    const perm = await navigator.permissions.query({ name: "geolocation" });
    if (perm.state === "granted" && navigator.geolocation) {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 120000 }),
      );
      lat = pos.coords.latitude; lng = pos.coords.longitude;
    }
  } catch (_) {}
  _lastLat = lat; _lastLng = lng;
  await _loadAndApplyPrayerTimes(lat, lng);
  window.dispatchEvent(new Event("hf:prayer-ready"));
}

/**
 * Re-fetch today's prayer times using the current calculation-method/madhab
 * preference and the last-known coordinates (no new geolocation prompt).
 * Called by the Menu sheet's Preferences section whenever the user changes
 * either dropdown, so already-displayed times update immediately.
 * @returns {Promise<void>}
 */
export async function refreshPrayerTimes() {
  await _loadAndApplyPrayerTimes(_lastLat, _lastLng);
}

// --- UI listeners ---
document.getElementById("prayer-pill").addEventListener("click", (e) => {
  e.stopPropagation();
  const snack = document.getElementById("prayer-snack");
  if (snack.classList.contains("collapsed")) snack.classList.remove("collapsed");
  else dismissPrayerSnack();
});

document.getElementById("prayer-chevron").addEventListener("click", (e) => {
  e.stopPropagation();
  togglePrayerExpanded();
});

document.querySelector(".prayer-snack-clickable").addEventListener("click", (e) => {
  if (e.target.closest(".prayer-hdr-btn") || e.target.closest("#prayer-pill")) return;
  dismissPrayerSnack();
});

// "Find mosque" button inside the prayer snack
const mosqueBtn = document.getElementById("prayer-mosque-btn");
if (mosqueBtn) mosqueBtn.addEventListener("click", findNearestMosque);

// Outside-click: collapse vertical expansion (keep horizontal state unchanged)
document.addEventListener("click", (e) => {
  const snack = document.getElementById("prayer-snack");
  if (!snack.classList.contains("expanded")) return;
  if (e.target.closest("#prayer-snack")) return;
  snack.classList.remove("expanded");
  const inner = document.getElementById("prayer-times-inner");
  setTimeout(() => { if (!snack.classList.contains("expanded")) inner.innerHTML = ""; }, 350);
});
