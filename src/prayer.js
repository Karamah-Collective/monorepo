import { map } from "./map-init.js";
import { showToast, haversineDistance } from "./utils.js";
import { dir, openDirPanel, placeOriginMarker, placeDestMarker, updateGoButton, reverseGeocode, setFindingNearestMosque } from "./directions.js";
import { placesData, activeTagFilters } from "./places.js";

// --- Constants / state ---
const PRAYER_NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const HELSINKI_LAT = 60.1699;
const HELSINKI_LNG = 24.9384;

function isFriday() { return new Date().getDay() === 5; }
function prayerDisplayName(name) { return (name === "Dhuhr" && isFriday()) ? "Jumu\u2019ah" : name; }

let prayerTimesToday = null;
let sunriseTime = null;
let isRamadan = false;
let prayerWatchInterval = null;
let lastAlertedPrayer = null;

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
  const url = `https://api.aladhan.com/v1/timings/${ts}?latitude=${lat}&longitude=${lng}&method=3`;
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

function togglePrayerExpanded() {
  const el = document.getElementById("prayer-snack");
  const isExpanded = el.classList.toggle("expanded");
  if (isExpanded) {
    const listEl = document.getElementById("prayer-times-inner");
    listEl.innerHTML = "";
    if (!prayerTimesToday) {
      const item = document.createElement("div");
      item.className = "prayer-time-item";
      item.style.justifyContent = "center"; item.style.opacity = "0.6";
      item.textContent = "Loading prayer times…";
      listEl.appendChild(item);
    } else {
      const current = getCurrentPrayer(), next = getNextPrayer();
      for (const name of PRAYER_NAMES) {
        const time = prayerTimesToday[name];
        const timeStr = time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const item = document.createElement("div");
        item.className = "prayer-time-item";
        if (current?.name === name) item.classList.add("current");
        if (next?.name === name) item.classList.add("next");
        const nameEl = document.createElement("div"); nameEl.className = "prayer-time-name"; nameEl.textContent = prayerDisplayName(name);
        const timeEl = document.createElement("div"); timeEl.className = "prayer-time-value"; timeEl.textContent = timeStr;
        item.appendChild(nameEl); item.appendChild(timeEl);
        listEl.appendChild(item);
      }
    }
  } else {
    document.getElementById("prayer-times-inner").innerHTML = "";
  }
}

// Finds nearest mosque using device location, then sets up directions
function findNearestMosque() {
  setFindingNearestMosque(true);
  if (!navigator.geolocation) {
    dismissPrayerSnack();
    document.getElementById("places-sheet").classList.add("shut");
    openDirPanel();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const userLat = pos.coords.latitude, userLng = pos.coords.longitude;
      let mosques = placesData.filter((p) => p.type === "mosque");
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
        document.getElementById("places-sheet").classList.add("shut");
        openDirPanel();
        setFindingNearestMosque(false);
        map.fitBounds(new maplibregl.LngLatBounds().extend([userLng, userLat]).extend([nearest.lng, nearest.lat]), { padding: 80, duration: 600 });
      }
    },
    (error) => {
      console.error("Geolocation error:", error);
      dismissPrayerSnack();
      document.getElementById("places-sheet").classList.add("shut");
      openDirPanel();
    },
  );
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
  try {
    const data = await fetchPrayerTimes(lat, lng);
    prayerTimesToday = parsePrayerTimings(data.timings);
    isRamadan = Number(data.date?.hijri?.month?.number) === 9;
    const snackEl = document.getElementById("prayer-snack");
    if (isRamadan) {
      snackEl.classList.add("ramadan-active");
      document.getElementById("ramadan-suhoor").textContent = prayerTimesToday.Fajr.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      document.getElementById("ramadan-iftar").textContent = prayerTimesToday.Maghrib.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } else {
      snackEl.classList.remove("ramadan-active");
    }
    const next = getNextPrayer();
    if (next) showPrayerSnack(`${prayerDisplayName(next.name)} ${formatPrayerCountdown(next.time)}`);
    startPrayerWatcher();
  } catch (err) {
    console.warn("[Prayer] Could not fetch prayer times:", err.message);
  }
  window.dispatchEvent(new Event("hf:prayer-ready"));
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
