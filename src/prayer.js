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
      let nearest = null, minDist = Infinity;
      for (const mosque of mosques) {
        const dist = haversineDistance(userLat, userLng, mosque.lat, mosque.lng);
        if (dist < minDist) { minDist = dist; nearest = mosque; }
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
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 120000 }),
      );
      lat = pos.coords.latitude; lng = pos.coords.longitude;
    } catch (_) {}
  }
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
