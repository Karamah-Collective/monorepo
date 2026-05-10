import { map, scheduleMapViewportSync } from "./map-init.js";
import { PLACE_CONFIG, makePlaceMarkerHTML, getThemeRailShopPurple } from "./icons.js";
import { esc, escA, copyToClipboard, showToast, hideLoadingToast, buildShareUrl, shareUrl, encryptToken, decryptToken, _decodeLegacyToken, decodeCompactRoute, decodeCompactPin, initSheetDrag, animateSheetHeight, getSavedPins, removeSavedPin, haversineDistance, loadRecaptcha, fadeAndRemovePopup, requestLocation, getHomeLocation, getCurrentLocationState } from "./utils.js";
import { RECAPTCHA_SITE_KEY, isInsideFinland } from "./config.js";
import { setActiveTab, refreshHeatmapSource, isHeatmapActive, syncHomeMarker } from "./map-controls.js";
import { dir, placeDestMarker, updateGoButton, openDirPanel, stopPick, loadSharedRoute } from "./directions.js";
import { DAY_NAMES, DAY_NAMES_SHORT, FREQUENCY_OPTIONS, ORDINAL_OPTIONS, buildPattern, parsePattern, formatRecurrence, resolveOccurrences, nextOccurrence } from "./event-recurrence.js";

export let placesData = [];
export let tagsData = {};
export let eventsData = [];
export let placesLoaded = false;

/** Returns place.sponsor if sponsorship is active today, otherwise null. */
export function activeSponsor(place) {
  if (!place.sponsor || place.boycott) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (place.sponsor.startDate && today < place.sponsor.startDate) return null;
  if (place.sponsor.endDate && today > place.sponsor.endDate) return null;
  return place.sponsor;
}
let placeMarkers = [];
let savedPinMarkers = [];

// Sort subtag arrays (e.g. cuisine) alphabetically by label.
// Called after every tagsData assignment so all consumers get sorted data.
function sortSubtags() {
  for (const key in tagsData) {
    if (key.indexOf("_") !== -1 && Array.isArray(tagsData[key])) {
      tagsData[key].sort((a, b) => a.label.localeCompare(b.label));
    }
  }
}
let _activePlacePopupId = null;
let _activePlacePopup = null;
export let activeTypeFilter = "all";
export let activeTagFilters = new Set();

/** Place types grouped under the "Religious" tab (everything except mosques). */
const RELIGIOUS_TYPES = new Set(["prayer_room", "cemetery"]);
let activeSortField = "default"; // "default" | "name" | "distance" | "date"
let activeSortDir = "asc";       // "asc" | "desc"
let userSortLat = null;
let userSortLng = null;
let placeSearchQuery = "";       // inline places-panel search text
const collapsedCityGroups = new Set();
let _lastGroupedData = new Map();
let _editOriginalPlace = null;


function clearActivePlacePopup() {
  if (_activePlacePopup) {
    try { _activePlacePopup.remove(); } catch (_) {}
    _activePlacePopup = null;
  }
  _activePlacePopupId = null;
  document.querySelectorAll(".place-popup-wrap.maplibregl-popup").forEach((p) => p.remove());
}

/** Padding that places the marker at ~75% from the top so the popup opens above it. */
function _mobilePadding() {
  return { top: Math.round(window.innerHeight / 2), bottom: 0, left: 0, right: 0 };
}

let _sheetCloseRAF1 = 0;
let _sheetCloseRAF2 = 0;
let _mobilePlaceFocusLocked = false;
let _mobilePlaceFocusUnlockTimer = 0;
let _mobilePlaceFocusToken = 0;

function isPhoneViewport() {
  return window.innerWidth <= 768;
}

function unlockMobilePlaceFocus() {
  _mobilePlaceFocusLocked = false;
  clearTimeout(_mobilePlaceFocusUnlockTimer);
  _mobilePlaceFocusUnlockTimer = 0;
}

function lockMobilePlaceFocus(fallbackMs = 650) {
  if (!isPhoneViewport()) return true;
  if (_mobilePlaceFocusLocked) return false;
  _mobilePlaceFocusLocked = true;
  clearTimeout(_mobilePlaceFocusUnlockTimer);
  _mobilePlaceFocusUnlockTimer = setTimeout(() => {
    unlockMobilePlaceFocus();
  }, fallbackMs);
  return true;
}

function focusPlaceOnPhone(place, token) {
  clearActivePlacePopup();
  map.stop();

  const targetZoom = Math.max(map.getZoom(), 15);
  let settled = false;
  const finish = () => {
    if (settled || token !== _mobilePlaceFocusToken) return;
    settled = true;
    unlockMobilePlaceFocus();
    showPlacePopup(place, { skipMove: true });
    scheduleMapViewportSync();
  };

  map.once("moveend", finish);
  map.easeTo({
    center: [place.lng, place.lat],
    zoom: targetZoom,
    duration: 280,
    essential: true,
    padding: _mobilePadding(),
  });
}

function runAfterPlacesSheetClose(task) {
  // Cancel any in-flight chain from a previous rapid click
  cancelAnimationFrame(_sheetCloseRAF1);
  cancelAnimationFrame(_sheetCloseRAF2);
  closePlacesSheet();
  _sheetCloseRAF1 = requestAnimationFrame(() => {
    _sheetCloseRAF1 = 0;
    scheduleMapViewportSync();
    _sheetCloseRAF2 = requestAnimationFrame(() => {
      _sheetCloseRAF2 = 0;
      task();
      // No sync here — showPlacePopup's flyTo handles its own rendering,
      // and extra resize calls exhaust mobile GPU memory.
    });
  });
}

// When a tag's name is phrased as an absence ("No Alcohol"), the false-state chip
// would read "✗ No Alcohol" — a confusing double negative. Map tag IDs to the label
// that should be shown when the value is false so the chip always states a fact.
const TAG_NEG_LABELS = {
  no_alcohol: "Serves alcohol",
};
// Also remap display labels for the true-state where the stored label is negative-phrased.
const TAG_POS_LABELS = {
  no_alcohol: "Alcohol-free",
};

// Tags whose true-state should use an amber/warn chip instead of green.
const WARN_TAGS = new Set(["partially_halal"]);

// Expandable tag groups where only one child may be selected at a time (radio behaviour).
const EXCLUSIVE_GROUPS = new Set(["halal_status"]);

// Returns all displayable tags for a type, replacing expandable parent tags with their subtags.
// Convention: if tagsData[type + "_" + tag.id] exists, tag is expandable.
function getDisplayTags(type) {
  const base = tagsData[type] || [];
  const result = [];
  for (const tag of base) {
    const subKey = `${type}_${tag.id}`;
    if (tagsData[subKey]) {
      result.push(...(tagsData[subKey] || []));
    } else {
      result.push(tag);
    }
  }
  return result;
}

// Returns structured tags for the filter bar — expandable parents stay as groups.
function getFilterBarTags(type) {
  const base = tagsData[type] || [];
  const items = [];
  for (const tag of base) {
    const subKey = `${type}_${tag.id}`;
    if (tagsData[subKey]) {
      items.push({ group: true, parent: tag, children: tagsData[subKey] || [] });
    } else {
      items.push({ group: false, tag });
    }
  }
  return items;
}

const SORT_FIELD_LABELS = { default: "Most Relevant", name: "Name", distance: "Distance", date: "Date" };

function extractCityFromAddress(address) {
  const raw = String(address || "").trim();
  if (!raw) return "";

  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "";

  let tail = parts[parts.length - 1];
  if (/^finland$/i.test(tail) && parts.length > 1) tail = parts[parts.length - 2];
  return tail.replace(/^\d{5}\s+/, "").trim();
}

function getPlaceCity(place) {
  return String(place.city || extractCityFromAddress(place.address) || "Other places").trim();
}

// Fixed priority so cities always appear in a sensible geographic order
// when there's no home/current-location anchor.
// Lower number = higher priority. Unlisted cities get 99.
const CITY_PRIORITY = new Map([
  ["Helsinki", 1],
  ["Espoo", 2],
  ["Vantaa", 3],
  ["Kauniainen", 4],
  ["Turku", 10],
  ["Tampere", 11],
  ["Oulu", 12],
  ["Jyväskylä", 13],
  ["Kuopio", 14],
  ["Lahti", 15],
  ["Pori", 16],
  ["Joensuu", 17],
  ["Vaasa", 18],
  ["Rovaniemi", 19],
]);
function _cityPriority(city) { return CITY_PRIORITY.get(city) ?? 99; }

function normalizePlacesData(places) {
  return (places || []).map((place) => ({ ...place, city: getPlaceCity(place) }));
}

function getViewportCityCounts(places) {
  if (!map?.getBounds) return new Map();
  const bounds = map.getBounds();
  if (!bounds) return new Map();

  const counts = new Map();
  places.forEach((place) => {
    if (!bounds.contains([place.lng, place.lat])) return;
    const city = getPlaceCity(place);
    counts.set(city, (counts.get(city) || 0) + 1);
  });
  return counts;
}

function getMostRelevantAnchor() {
  const current = getCurrentLocationState();
  if (current.active && current.lat !== null && current.lng !== null) return current;

  const home = getHomeLocation();
  if (home && home.lat !== null && home.lng !== null) return home;

  return null;
}

function getCityMinDistances(places, anchor) {
  const distances = new Map();
  if (!anchor) return distances;

  places.forEach((place) => {
    const city = getPlaceCity(place);
    const dist = haversineDistance(anchor.lat, anchor.lng, place.lat, place.lng);
    const current = distances.get(city);
    if (current === undefined || dist < current) distances.set(city, dist);
  });
  return distances;
}

function compareMostRelevantPlaces(a, b, anchor, viewportCounts, cityDistances) {
  // Featured places get a slight boost within the same city
  const aFeatured = activeSponsor(a) ? 1 : 0;
  const bFeatured = activeSponsor(b) ? 1 : 0;

  const aCity = getPlaceCity(a);
  const bCity = getPlaceCity(b);

  if (anchor) {
    const aDist = cityDistances.get(aCity) ?? Number.POSITIVE_INFINITY;
    const bDist = cityDistances.get(bCity) ?? Number.POSITIVE_INFINITY;
    if (aDist !== bDist) return aDist - bDist;
  }

  const aVisible = viewportCounts.get(aCity) || 0;
  const bVisible = viewportCounts.get(bCity) || 0;
  if (aVisible !== bVisible) return bVisible - aVisible;

  const cityCmp = _cityPriority(aCity) - _cityPriority(bCity);
  if (cityCmp) return cityCmp;
  if (_cityPriority(aCity) === 99 && _cityPriority(bCity) === 99) {
    const alpha = aCity.localeCompare(bCity);
    if (alpha) return alpha;
  }

  // Featured boost: within same city group, featured places float to top
  if (aFeatured !== bFeatured) return bFeatured - aFeatured;

  // Per-item distance within the same city (non-featured tiebreak)
  if (anchor) {
    const itemDistA = haversineDistance(anchor.lat, anchor.lng, a.lat, a.lng);
    const itemDistB = haversineDistance(anchor.lat, anchor.lng, b.lat, b.lng);
    if (itemDistA !== itemDistB) return itemDistA - itemDistB;
  }
  return a.name.localeCompare(b.name);
}

function applySort(arr) {
  const a = [...arr];
  if (activeSortField === "default") {
    const anchor = getMostRelevantAnchor();
    const viewportCounts = getViewportCityCounts(a);
    const cityDistances = getCityMinDistances(a, anchor);
    return a.sort((x, y) => compareMostRelevantPlaces(x, y, anchor, viewportCounts, cityDistances));
  }
  switch (activeSortField) {
    case "name":
      return a.sort((x, y) => activeSortDir === "asc"
        ? x.name.localeCompare(y.name)
        : y.name.localeCompare(x.name));
    case "distance":
      if (userSortLat === null) return a;
      return a.sort((x, y) => {
        const da = haversineDistance(userSortLat, userSortLng, x.lat, x.lng);
        const db = haversineDistance(userSortLat, userSortLng, y.lat, y.lng);
        return activeSortDir === "asc" ? da - db : db - da;
      });
    case "date":
      return a.sort((x, y) => activeSortDir === "asc" ? String(x.id).localeCompare(String(y.id)) : String(y.id).localeCompare(String(x.id)));
    default: return a;
  }
}

let favourites = new Set(JSON.parse(localStorage.getItem("hf_favs") || "[]"));
function saveFavourites() { localStorage.setItem("hf_favs", JSON.stringify([...favourites])); }
export function isFavourite(id) { return favourites.has(id); }
export function toggleFavourite(id) {
  if (favourites.has(id)) favourites.delete(id); else favourites.add(id);
  saveFavourites();
}

// Recently viewed
const RECENT_KEY = "hf_recent";
let recentIds = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
function trackRecentlyViewed(id) {
  recentIds = [id, ...recentIds.filter((x) => x !== id)].slice(0, 5);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds)); } catch (_) {}
}

// User location for distance badges
let userLocLat = null, userLocLng = null;

// Resolve the best available location: live GPS (priority) → home (fallback).
// Sets userLocLat/Lng so distance badges and sort work.
function _resolveUserLocation() {
  const live = getCurrentLocationState();
  if (live.active && live.lat !== null) {
    userLocLat = live.lat;
    userLocLng = live.lng;
    return;
  }
  // Fall back to home when live location is inactive
  const home = getHomeLocation();
  if (home && home.lat !== null) {
    userLocLat = home.lat;
    userLocLng = home.lng;
  }
}

async function tryGetUserLocation() {
  // Always refresh from live/home first
  _resolveUserLocation();
  if (userLocLat !== null || !navigator.geolocation) return;
  // Only silently grab location if already granted — don't trigger a prompt
  // just for distance badges. The prompt should appear on explicit user actions.
  try {
    const perm = await navigator.permissions.query({ name: "geolocation" });
    if (perm.state !== "granted") return;
  } catch (_) { /* permissions API not supported — skip silent grab */ return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocLat = pos.coords.latitude;
      userLocLng = pos.coords.longitude;
      const list = document.getElementById("places-list");
      if (list && list.children.length) renderPlacesList();
    },
    () => {},
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
  );
}
function formatDist(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

const _starPath = `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`;

function _highlightMatch(escaped, q) {
  if (!q) return escaped;
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(new RegExp(`(${safe})`, "gi"), "<mark>$1</mark>");
}

function _buildCard(p, i) {
  const cfg = PLACE_CONFIG[p.type] || PLACE_CONFIG.mosque;
  const cssColor = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)", cemetery: "var(--cemetery)" }[p.type] || cfg.color;
  const typeTags = getDisplayTags(p.type);
  const posTags = typeTags.filter((t) => p.tags?.[t.id] === true);
  const posCount = posTags.length;
  const tagSummary = posCount ? `${posCount} tag${posCount > 1 ? "s" : ""}` : "0 tags";
  const tagNames = posTags.map((t) => t.label);
  const faved = isFavourite(p.id);
  const distBadge = userLocLat !== null
    ? `<span class="pl-dist">${formatDist(haversineDistance(userLocLat, userLocLng, p.lat, p.lng))}</span>`
    : "";
  const boycottBadge = p.boycott
    ? `<span class="pl-boycott-chip">Boycott Watch</span>`
    : "";
  const sponsorBadge = activeSponsor(p)
    ? `<span class="pl-sponsor-chip">Featured</span>`
    : "";
  const placeEvents = eventsData.filter((ev) => ev.placeId === p.id);
  const evCount = placeEvents.length;
  const isFeatured = !!activeSponsor(p);

  // Build expandable events drawer for places with events
  let evDrawerBody = "";
  if (evCount) {
    const evCards = placeEvents.map((ev) => {
      const dateStr = _formatEventDate(ev);
      const timeStr = ev.time ? ev.time + (ev.endTime ? `–${ev.endTime}` : "") : "";
      const linkBtn = ev.url
        ? `<a href="${escA(ev.url)}" target="_blank" rel="noopener noreferrer" class="pp-ev-link" title="Event page"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`
        : "";
      const recurIcon = ev.recurring
        ? `<svg class="pp-ev-recur-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`
        : "";
      return `<div class="pp-ev-card" data-ev-id="${escA(ev.id)}" data-ev-url="${escA(ev.url || '')}" role="button" tabindex="0"><div class="pp-ev-info"><span class="pp-ev-title">${esc(ev.title)}</span><span class="pp-ev-meta">${recurIcon}${esc(dateStr)}${timeStr ? ` · ${esc(timeStr)}` : ""}</span></div>${linkBtn}</div>`;
    }).join("");
    evDrawerBody = `<div class="pl-ev-drawer" data-place-id="${p.id}"><div class="pl-ev-body"><div class="pl-ev-body-inner">${evCards}</div></div></div>`;
  }

  // Dot gets data-ev-count for event badge rendering via CSS ::after
  const dotAttrs = evCount ? ` data-ev-count="${evCount}" role="button" tabindex="0" aria-label="${evCount} event${evCount > 1 ? "s" : ""}, tap to expand" aria-expanded="false"` : "";

  return `<li class="pl-card${isFeatured ? ' pl-card--featured' : ''}${evCount ? ' pl-card--has-events' : ''}" data-idx="${i}" data-place-id="${p.id}" style="--place-c:${cssColor};--i:${i}">
    <span class="pl-dot"${dotAttrs} style="background:${cssColor}"><svg viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg></span>
    <span class="pl-name">${_highlightMatch(esc(p.name), placeSearchQuery.trim())}${boycottBadge}${sponsorBadge}</span>
    <span class="pl-addr">${_highlightMatch(esc(p.address), placeSearchQuery.trim())}${distBadge}</span>
    <div class="pl-meta">
      <span class="pl-tags-summary" style="--type-c:${cssColor}" data-type="${esc(cfg.label)}" data-tags='${JSON.stringify(tagNames).replace(/'/g, "&#39;")}'>${tagSummary}</span>
    </div>
    <div class="pl-acts">
      <button class="pl-dir-btn" data-lat="${p.lat}" data-lng="${p.lng}" data-name="${escA(p.name)}" aria-label="Directions to ${escA(p.name)}" title="Directions">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-6 6"/><path d="M4 20v-6a4 4 0 0 1 4-4h12"/></svg>
      </button>
      <button class="pl-fav-btn${faved ? " active" : ""}" data-fav-id="${p.id}" aria-label="${faved ? "Remove from saved" : "Save place"}">
        <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${faved ? "currentColor" : "none"}">${_starPath}</svg>
      </button>
    </div>
    ${evDrawerBody}
  </li>`;
}

const CACHE_KEY = 'hf_places_v1';

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c.places?.length) return c;
  } catch { /* corrupted */ }
  return null;
}

function writeCache(places, tags) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ places, tags })); }
  catch { /* quota exceeded — ignore */ }
}

/** Strip sponsor fields so stale cache/static data never shows outdated sponsors.
 *  Live API (Google Sheets) is the only source of truth for sponsor status. */
function stripSponsorFields(places) {
  for (const p of places) delete p.sponsor;
  return places;
}

async function fetchFresh() {
  const urls = ['/api/places?action=all'];
  // Local dev: config.local.js provides SHEETS_URL as direct GAS fallback
  // (CF Functions aren't running on localhost, so /api/places 404s)
  try {
    const cfg = await import("./config.local.js");
    if (cfg.SHEETS_URL) urls.push(`${cfg.SHEETS_URL}?action=all`);
  } catch { /* config.local.js absent in production — expected */ }
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.places?.length) {
          console.log(`[Places] Fetched ${data.places.length} places from ${url}`);
          return data;
        }
      }
    } catch (err) {
      console.warn(`[Places] Fetch from ${url} failed:`, err.message);
    }
  }
  return null;
}


export async function loadPlacesData() {
  try {
    placesLoaded = false;

    // 1. Instant load from localStorage cache (returning visitors)
    const cached = readCache();
    if (cached) {
      placesData = stripSponsorFields(normalizePlacesData(cached.places));
      tagsData = cached.tags || {};
      sortSubtags();
      placesLoaded = true;
      hideLoadingToast();
      addPlaceMarkers();
      renderPlacesList();
      updatePlacesBadge();
      checkShareUrl();
      renderEventsPill();
      console.log(`[Places] Instant load: ${placesData.length} places from cache`);

      // 2. Background refresh — update only if data changed
      fetchFresh().then(data => {
        if (!data) return;
        const oldCount = placesData.length;
        const newCount = data.places.length;
        const countChanged = newCount !== oldCount;
        const dataChanged = JSON.stringify(data.places) !== JSON.stringify(placesData);
        
        if (countChanged || dataChanged) {
          console.log(`[Places] Background update: ${newCount} places (was ${oldCount})`);
          if (countChanged) {
            console.log(`[Places] → ${newCount > oldCount ? "added" : "removed"} ${Math.abs(newCount - oldCount)} place(s)`);
          }
          placesData = normalizePlacesData(data.places);
          tagsData = data.tags || {};
          sortSubtags();
          addPlaceMarkers();
          renderPlacesList();
          updatePlacesBadge();
          renderPromosPill();
        }
        if (data.events) { eventsData = data.events; renderEventsPill(); }
        writeCache(normalizePlacesData(data.places), data.tags || {});
      });
      return;
    }

    // 3. First visit — load bundled static JSON instantly (served from CF CDN edge)
    try {
      const [pRes, tRes] = await Promise.all([fetch('data/places.json'), fetch('data/tags.json')]);
      if (pRes.ok && tRes.ok) {
        placesData = stripSponsorFields(normalizePlacesData(await pRes.json()));
        tagsData = await tRes.json();
        sortSubtags();
        console.log(`[Places] First-visit instant load: ${placesData.length} places from static JSON`);
      }
    } catch { /* static files missing — fall through */ }

    placesLoaded = true;
    hideLoadingToast();
    addPlaceMarkers();
    renderPlacesList();
    updatePlacesBadge();
    checkShareUrl();
    renderPromosPill();
    renderEventsPill();


    // 4. Background refresh from API — update cache + UI if data changed
    fetchFresh().then(data => {
      if (!data) return;
      const oldCount = placesData.length;
      const newCount = data.places.length;
      const countChanged = newCount !== oldCount;
      const dataChanged = JSON.stringify(data.places) !== JSON.stringify(placesData);
      
      if (countChanged || dataChanged) {
        console.log(`[Places] Background update: ${newCount} places (was ${oldCount})`);
        if (countChanged) {
          console.log(`[Places] → ${newCount > oldCount ? "added" : "removed"} ${Math.abs(newCount - oldCount)} place(s)`);
        }
        placesData = normalizePlacesData(data.places);
        tagsData = data.tags || {};
        sortSubtags();
        addPlaceMarkers();  // Full refresh removes old + adds new
        renderPlacesList();
        updatePlacesBadge();
        renderPromosPill();
      }
      if (data.events) { eventsData = data.events; renderEventsPill(); }
      writeCache(normalizePlacesData(data.places), data.tags || {});
    });
  } catch (err) {
    console.warn("[Places] Failed to load:", err.message);
    placesLoaded = true;
    hideLoadingToast();
  }
}

// ── Marker clustering ──────────────────────────────────────────────────────────
// Zoom < CLUSTER_ZOOM: GeoJSON cluster circles rendered by MapLibre.
// Zoom ≥ CLUSTER_ZOOM: individual HTML pin markers (existing behaviour).
const CLUSTER_ZOOM = 10;
let _clusterLayersReady = false;

function _buildPlacesGeoJSON(places) {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { id: p.id, type: p.type },
    })),
  };
}

const CLUSTER_LAYER_IDS = ["places-cluster-circle", "places-cluster-inner", "places-cluster-count", "places-unclustered"];

const HEATMAP_PIN_ZOOM = 14.5;

export function updateMarkerVisibility() {
  const isHeatmap = isHeatmapActive;
  const zoom = map.getZoom();
  const shouldHide = isHeatmap ? zoom < HEATMAP_PIN_ZOOM : zoom < CLUSTER_ZOOM;
  placeMarkers.forEach((marker) => {
    const el = marker.getElement();
    if (el) el.classList.toggle("mk-hidden", shouldHide);
  });
  const clusterVis = (isHeatmap && zoom < HEATMAP_PIN_ZOOM) ? "none" : "visible";
  CLUSTER_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", clusterVis);
  });
}

function _setupClusterLayers(geojson) {
  map.addSource("places-cluster", {
    type: "geojson",
    data: geojson,
    cluster: true,
    clusterMaxZoom: CLUSTER_ZOOM - 1,
    clusterRadius: 40,
  });

  /* ── Cluster donut: outer ring (accent glow) ── */
  map.addLayer({
    id: "places-cluster-circle",
    type: "circle",
    source: "places-cluster",
    filter: ["has", "point_count"],
    maxzoom: CLUSTER_ZOOM,
    paint: {
      "circle-color": "#08705B",
      "circle-opacity": 0.18,
      "circle-radius": ["step", ["get", "point_count"], 26, 10, 32, 30, 38],
      "circle-stroke-width": 0,
    },
  });

  /* ── Cluster donut: inner filled disc ── */
  map.addLayer({
    id: "places-cluster-inner",
    type: "circle",
    source: "places-cluster",
    filter: ["has", "point_count"],
    maxzoom: CLUSTER_ZOOM,
    paint: {
      "circle-color": "#08705B",
      "circle-opacity": 0.92,
      "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 24],
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "rgba(255,255,255,0.85)",
    },
  });

  map.addLayer({
    id: "places-cluster-count",
    type: "symbol",
    source: "places-cluster",
    filter: ["has", "point_count"],
    maxzoom: CLUSTER_ZOOM,
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Bold"],
      "text-size": ["step", ["get", "point_count"], 12, 10, 13, 30, 14],
    },
    paint: { "text-color": "#fff" },
  });

  // Isolated dot for a place that isn't grouped with any neighbours at the current zoom
  map.addLayer({
    id: "places-unclustered",
    type: "circle",
    source: "places-cluster",
    filter: ["!", ["has", "point_count"]],
    maxzoom: CLUSTER_ZOOM,
    paint: {
      "circle-color": ["match", ["get", "type"],
        "mosque",      "#1FA86A",
        "prayer_room", "#00B9E4",
        "restaurant",  "#FF6319",
        "shop",        getThemeRailShopPurple(),
        "#08705B",
      ],
      "circle-radius": 7,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  });

  // Cluster click → zoom in to expand
  const _clusterClickHandler = (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["places-cluster-circle", "places-cluster-inner"] });
    if (!features.length) return;
    const clusterId = features[0].properties.cluster_id;
    map.getSource("places-cluster").getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.flyTo({ center: features[0].geometry.coordinates, zoom: Math.max(zoom + 0.5, CLUSTER_ZOOM), duration: 500 });
    });
  };
  map.on("click", "places-cluster-circle", _clusterClickHandler);
  map.on("click", "places-cluster-inner", _clusterClickHandler);

  // Unclustered dot click → open place popup (or close if already open)
  map.on("click", "places-unclustered", (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const place = placesData.find((p) => p.id === feature.properties.id);
    if (!place) return;
    if (_activePlacePopupId === place.id) {
      clearActivePlacePopup();
    } else {
      showPlacePopup(place);
    }
  });

  ["places-cluster-circle", "places-cluster-inner", "places-unclustered"].forEach((layer) => {
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  });

  map.on("zoom", updateMarkerVisibility);
  _clusterLayersReady = true;
}

export function addPlaceMarkers() {
  placeMarkers.forEach((m) => m.remove());
  placeMarkers = [];
  savedPinMarkers.forEach((m) => m.remove());
  savedPinMarkers = [];

  let filtered =
    activeTypeFilter === "all"
      ? placesData
      : activeTypeFilter === "saved"
        ? placesData.filter((p) => isFavourite(p.id))
        : activeTypeFilter === "religious"
          ? placesData.filter((p) => RELIGIOUS_TYPES.has(p.type))
          : placesData.filter((p) => p.type === activeTypeFilter);

  if (activeTagFilters.size) {
    filtered = filtered.filter((p) =>
      [...activeTagFilters].every((tagId) => p.tags?.[tagId] === true),
    );
  }

  // Update or create the GeoJSON cluster source
  const clusterGeoJSON = _buildPlacesGeoJSON(filtered);
  if (map.getSource("places-cluster")) {
    map.getSource("places-cluster").setData(clusterGeoJSON);
  } else {
    _setupClusterLayers(clusterGeoJSON);
  }

  filtered.forEach((place) => {
    const el = document.createElement("div");
    el.className = "place-mk-wrap mk-hidden";
    el.innerHTML = makePlaceMarkerHTML(place.type);
    // Sponsor glow on the puck — basic gets gold border, featured gets glow, spotlight gets pulse
    // Higher z-index so sponsored pins render on top when overlapping
    const sp = activeSponsor(place);
    if (sp) {
      const puck = el.querySelector(".place-mk");
      if (puck) {
        if (sp.tier === "spotlight") { puck.classList.add("place-mk--sponsored", "place-mk--spotlight"); el.style.zIndex = "4"; }
        else if (sp.tier === "featured") { puck.classList.add("place-mk--sponsored"); el.style.zIndex = "3"; }
        else { puck.classList.add("place-mk--sponsor-basic"); el.style.zIndex = "2"; }
      }
    }
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([place.lng, place.lat]).addTo(map);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (_activePlacePopupId === place.id) {
        clearActivePlacePopup();
      } else {
        showPlacePopup(place);
      }
    });
    placeMarkers.push(marker);
  });

  // Always show saved custom pins (dropped pins) that don't overlap with a place
  const placeCoords = new Set(placesData.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`));
  getSavedPins().filter(pin => isInsideFinland(pin.lat, pin.lng)).forEach((pin) => {
    if (placeCoords.has(`${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`)) return;
    const el = document.createElement("div");
    el.className = "place-mk-wrap mk-hidden";
    el.innerHTML = `<div class="custom-mk"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg></div>`;
    el.dataset.pinId = pin.id;
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([pin.lng, pin.lat]).addTo(map);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("hf:show-search-marker", { detail: { lng: pin.lng, lat: pin.lat } }));
    });
    savedPinMarkers.push(marker);
  });

  // Fade markers in after DOM commits the initial hidden state
  requestAnimationFrame(() => {
    requestAnimationFrame(() => updateMarkerVisibility());
  });
  refreshHeatmapSource();
  syncHomeMarker();
}

// Remove a single savedPinMarker from the map when user dismisses the popup
// (also removes from hf_saved_pins so pin doesn't reappear on refresh)
window.addEventListener("hf:remove-saved-pin-marker", (e) => {
  const { id } = e.detail;
  const idx = savedPinMarkers.findIndex(m => m.getElement()?.dataset?.pinId === id);
  if (idx !== -1) {
    savedPinMarkers[idx].remove();
    savedPinMarkers.splice(idx, 1);
  }
  // Refresh list if user is on the saved tab so the entry disappears
  if (activeTypeFilter === "saved") renderPlacesList();
});

/** Formats an event date for display. Uses structured recurrence when available. */
function _formatEventDate(ev) {
  if (ev.recurring && ev.recurrence) {
    const label = formatRecurrence(ev.recurrence);
    if (label !== ev.recurrence) return label; // structured pattern resolved
    return ev.recurrence; // legacy free-text fallback
  }
  if (!ev.date) return "";
  const d = new Date(ev.date + "T00:00:00");
  const opts = { month: "short", day: "numeric" };
  const today = new Date();
  if (d.getFullYear() !== today.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-GB", opts);
}

/**
 * Compute the next upcoming date for any event (one-time or recurring).
 * Returns a Date or null if no upcoming occurrence.
 */
function _nextEventDate(ev) {
  if (ev.recurring && ev.recurrence) {
    return nextOccurrence(ev.recurrence) || null;
  }
  if (ev.date) {
    const d = new Date(ev.date + "T00:00:00");
    return d >= _todayMidnight() ? d : null;
  }
  return null;
}

/** Midnight today (cached per call stack). */
function _todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Builds a compact event card HTML string for popup/list use. */
function _buildEventCard(ev) {
  const dateStr = _formatEventDate(ev);
  const timeStr = ev.time ? ev.time + (ev.endTime ? `–${ev.endTime}` : "") : "";
  const recurIcon = ev.recurring
    ? `<svg class="pp-ev-recur-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`
    : "";
  const linkBtn = ev.url
    ? `<a href="${escA(ev.url)}" target="_blank" rel="noopener noreferrer" class="pp-ev-link" title="Open registration / event page"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`
    : "";
  return `<div class="pp-ev-card" data-ev-id="${escA(ev.id)}" data-ev-url="${escA(ev.url || '')}" role="button" tabindex="0">
    <div class="pp-ev-info">
      <span class="pp-ev-title">${esc(ev.title)}</span>
      <span class="pp-ev-meta">${recurIcon}${dateStr ? `<span class="pp-ev-date">${esc(dateStr)}</span>` : ""}${timeStr ? `<span class="pp-ev-time">${esc(timeStr)}</span>` : ""}</span>
    </div>
    ${linkBtn ? `<div class="pp-ev-actions">${linkBtn}</div>` : ""}
  </div>`;
}

export function showPlacePopup(place, { skipMove = false } = {}) {
  trackRecentlyViewed(place.id);
  const cfg = PLACE_CONFIG[place.type] || PLACE_CONFIG.mosque;
  const cssColor = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)", cemetery: "var(--cemetery)" }[place.type] || cfg.color;
  const typeTags = getDisplayTags(place.type);

  const root = document.createElement("div");
  root.className = "pp";

  const inner = document.createElement("div");
  inner.className = "pp-inner";

  // Header: icon + type badge
  const hdr = document.createElement("div");
  hdr.className = "pp-hdr";
  hdr.innerHTML =
    `<span class="pp-icon" style="color:${cssColor}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">${cfg.icon}</svg></span>` +
    `<span class="pp-badge" style="background:color-mix(in srgb, ${cssColor} 12%, transparent);color:${cssColor}">${cfg.label}</span>` +
    (activeSponsor(place) ? `<span class="pp-sponsor-badge" title="This place is featured by us. All listings are community-sourced — being featured does not affect halal verification.">Featured</span>` : ``);
  inner.appendChild(hdr);

  // Tap-to-show tooltip on mobile for the Featured badge
  const featBadge = hdr.querySelector(".pp-sponsor-badge");
  if (featBadge) {
    featBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      showToast("Featured place", "info", "All listings are community-sourced");
    });
  }

  // Title
  const title = document.createElement("div");
  title.className = "pp-title";
  title.textContent = place.name;
  inner.appendChild(title);

  // Address
  const addr = document.createElement("div");
  addr.className = "pp-addr";
  addr.textContent = place.address;
  inner.appendChild(addr);

  // Tags (plain text labels, no icons)
  if (typeTags.length) {
    const chips = typeTags
      .filter((tag) => place.tags?.[tag.id] !== undefined)
      .map((tag) => {
        const val = place.tags[tag.id];
        const cls = val === true
          ? (WARN_TAGS.has(tag.id) ? "pp-chip-warn" : "pp-chip-yes")
          : "pp-chip-no";
        const label = val === true
          ? (TAG_POS_LABELS[tag.id] || tag.label)
          : (TAG_NEG_LABELS[tag.id] || tag.negLabel || tag.label);
        return `<span class="pp-chip ${cls}">${esc(label)}</span>`;
      })
      .join("");
    if (chips) {
      const tagsEl = document.createElement("div");
      tagsEl.className = "pp-tags";
      tagsEl.innerHTML = chips;
      inner.appendChild(tagsEl);
    }
  }

  if (place.boycott) {
    const callout = document.createElement("div");
    callout.className = "pp-boycott-callout";
    callout.innerHTML =
      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` +
      `<span>Boycott: Supports genocide in Gaza</span>`;
    inner.appendChild(callout);
  }

  if (place.notes) {
    const notes = document.createElement("div");
    notes.className = "pp-notes";
    notes.textContent = place.notes;
    inner.appendChild(notes);
  }

  // Events section — only for mosques/prayer rooms with active events
  const placeEvents = eventsData.filter((ev) => ev.placeId === place.id);
  if (placeEvents.length || place.type === "mosque") {
    const eventsSection = document.createElement("div");
    eventsSection.className = "pp-events";
    const hdrHTML = `<div class="pp-events-hdr"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>Events</span><button class="pp-ev-add-btn" type="button" title="Submit an event" aria-label="Submit event"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button></div>`;
    const listHTML = placeEvents.length
      ? `<div class="pp-events-list">${placeEvents.map((ev) => _buildEventCard(ev)).join("")}</div>`
      : `<p class="pp-ev-empty">No events yet</p>`;
    eventsSection.innerHTML = hdrHTML + listHTML;
    // Attach add-event handler
    eventsSection.querySelector(".pp-ev-add-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openEventOverlay(place.id);
    });
    // Event card clicks — open URL or highlight in events overlay
    eventsSection.querySelectorAll(".pp-ev-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("a")) return; // let link clicks through
        e.stopPropagation();
        const url = card.dataset.evUrl;
        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        } else {
          _openEventsOverlayToEvent(card.dataset.evId);
        }
      });
    });
    inner.appendChild(eventsSection);
  }

  const actions = document.createElement("div");
  actions.className = "pp-actions";

  const dirBtn = document.createElement("button");
  dirBtn.className = "pp-dir-btn";
  dirBtn.title = "Get directions";
  dirBtn.setAttribute("aria-label", "Get directions");
  dirBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-6 6"/><path d="M4 20v-6a4 4 0 0 1 4-4h12"/></svg>`;
  dirBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dir.dest = { lat: place.lat, lng: place.lng, name: place.name };
    document.getElementById("dir-to").value = place.name;
    placeDestMarker(place.lng, place.lat);
    updateGoButton();
    fadeAndRemovePopup(popup);
    closePlacesSheet();
    openDirPanel();
  });

  const shareBtn = document.createElement("button");
  shareBtn.className = "pp-share-btn";
  shareBtn.title = "Share this place";
  shareBtn.setAttribute("aria-label", "Share this place");
  shareBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

  function doShare(e) {
    e.preventDefault();
    e.stopPropagation();
    shareUrl(buildShareUrl(place), place.name, `${place.name} – Halal Finder Helsinki`);
  }
  shareBtn.addEventListener("click", doShare);

  const editBtn = document.createElement("button");
  editBtn.className = "pp-edit-btn";
  editBtn.title = "Suggest an edit";
  editBtn.setAttribute("aria-label", "Suggest an edit");
  editBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  editBtn.addEventListener("click", (e) => { e.stopPropagation(); openEditOverlay(place); });

  actions.appendChild(dirBtn);
  actions.appendChild(shareBtn);
  actions.appendChild(editBtn);
  inner.appendChild(actions);
  root.appendChild(inner);

  // Fav button (absolute positioned, top-right)
  const _isFav = isFavourite(place.id);
  const _starSVG = (filled) =>
    `<svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${filled ? "currentColor" : "none"}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  const favBtn = document.createElement("button");
  favBtn.className = `pp-fav-btn${_isFav ? " active" : ""}`;
  favBtn.setAttribute("aria-label", _isFav ? "Remove from saved" : "Save place");
  favBtn.innerHTML = _starSVG(_isFav);
  favBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavourite(place.id);
    const saved = isFavourite(place.id);
    favBtn.classList.toggle("active", saved);
    favBtn.setAttribute("aria-label", saved ? "Remove from saved" : "Save place");
    favBtn.innerHTML = _starSVG(saved);
    const listBtn = document.querySelector(`.pl-fav-btn[data-fav-id="${place.id}"]`);
    if (listBtn) {
      listBtn.classList.toggle("active", saved);
      listBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${saved ? "currentColor" : "none"}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    }
    if (activeTypeFilter === "saved" && !saved) { addPlaceMarkers(); renderPlacesList(); }
  });
  root.appendChild(favBtn);

  // Promo copy button — beside fav star, only for sponsors with a CTA (promo code)
  const popupSponsor = activeSponsor(place);
  if (popupSponsor?.cta) {
    const promoBtn = document.createElement("button");
    promoBtn.className = "pp-promo-btn";
    promoBtn.title = "Copy promo";
    promoBtn.setAttribute("aria-label", "Copy promo code");
    promoBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
    promoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyToClipboard(popupSponsor.cta);
      const sub = popupSponsor.text || null;
      showToast(popupSponsor.cta, "check", sub);
    });
    root.appendChild(promoBtn);
  }

  clearActivePlacePopup();

  // Track the open popup id for toggle-close
  _activePlacePopupId = place.id;

  const popup = new maplibregl.Popup({ offset: [0, -42], closeButton: false, maxWidth: "300px", className: "place-popup-wrap" })
    .setLngLat([place.lng, place.lat])
    .setDOMContent(root)
    .addTo(map);

  _activePlacePopup = popup;

  popup.on("close", () => {
    if (_activePlacePopupId === place.id) _activePlacePopupId = null;
    if (_activePlacePopup === popup) _activePlacePopup = null;
  });

  if (skipMove) return;

  map.stop();
  const targetZoom = Math.max(map.getZoom(), 15);
  if (isPhoneViewport()) {
    map.easeTo({
      center: [place.lng, place.lat],
      zoom: targetZoom,
      duration: 320,
      essential: true,
      padding: _mobilePadding(),
    });
    return;
  }
  map.flyTo({ center: [place.lng, place.lat], zoom: targetZoom, duration: 600 });
}

function openPlaceAfterSheetClose(place) {
  if (isPhoneViewport()) {
    if (!lockMobilePlaceFocus(900)) return;
    const token = ++_mobilePlaceFocusToken;
    runAfterPlacesSheetClose(() => focusPlaceOnPhone(place, token));
    return;
  }
  runAfterPlacesSheetClose(() => showPlacePopup(place));
}

export function checkShareUrl() {
  const hash = location.hash.slice(1);
  let mapView = null, placeToken = null;

  if (hash) {
    const ampIdx = hash.indexOf("&");
    const viewStr = ampIdx >= 0 ? hash.slice(0, ampIdx) : hash;
    const rest = ampIdx >= 0 ? hash.slice(ampIdx + 1) : "";
    const parts = viewStr.split("/");
    if (parts.length === 3) {
      const [z, la, lo] = parts.map(Number);
      if (!isNaN(z) && !isNaN(la) && !isNaN(lo)) mapView = { zoom: z, lat: la, lng: lo };
    }
    for (const seg of rest.split("&")) {
      if (seg.startsWith("p=")) placeToken = seg.slice(2);
    }
  }

  // Always check query params (they work alongside hash-based links)
  const params = new URLSearchParams(location.search);

  // ?r=<token> — route link (compact binary or legacy base64-JSON)
  const routeToken = params.get("r");
  if (routeToken) {
    // Try compact binary first (byte 0 != '{'), then legacy JSON
    const cr = decodeCompactRoute(routeToken);
    if (cr) {
      history.replaceState(null, "", location.pathname);
      loadSharedRoute({
        olat: cr.olat, olng: cr.olng, oname: cr.oname || null,
        dlat: cr.dlat, dlng: cr.dlng, dname: cr.dname || null,
        mode: cr.mode, tmode: cr.tmode || null,
        tdate: cr.tdate || null, ttime: cr.ttime || null,
        waypoints: cr.waypoints?.length ? cr.waypoints : null,
        itinIdx: cr.itinIdx,
        _compressedItinerary: cr._compressedItinerary || null,
      });
      return;
    }
    try {
      const padded = routeToken.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(padded));
      const [olat, olng] = (payload.o || []).map(parseFloat);
      const [dlat, dlng] = (payload.d || []).map(parseFloat);
      if (!isNaN(olat) && !isNaN(olng) && !isNaN(dlat) && !isNaN(dlng)) {
        history.replaceState(null, "", location.pathname);
        loadSharedRoute({
          olat, olng, oname: payload.on || null,
          dlat, dlng, dname: payload.dn || null,
          mode: payload.m || "transit",
          tmode: payload.tm || null,
          tdate: payload.td || null,
          ttime: payload.tt || null,
        });
        return;
      }
    } catch { /* malformed token — fall through */ }
  }

  // ?route=1 — legacy plain-text shared route link (keep for backwards compat)
  if (params.get("route") === "1") {
    const olat = parseFloat(params.get("olat"));
    const olng = parseFloat(params.get("olng"));
    const dlat = parseFloat(params.get("dlat"));
    const dlng = parseFloat(params.get("dlng"));
    if (!isNaN(olat) && !isNaN(olng) && !isNaN(dlat) && !isNaN(dlng)) {
      history.replaceState(null, "", location.pathname);
      loadSharedRoute({
        olat, olng, oname: params.get("on") || null,
        dlat, dlng, dname: params.get("dn") || null,
        mode: params.get("mode") || "transit",
        tmode: params.get("tmode") || null,
        tdate: params.get("tdate") || null,
        ttime: params.get("ttime") || null,
      });
      return;
    }
  }

  // ?p=<token> — compact pin/stop link
  const pinToken = params.get("p");
  if (pinToken) {
    const cp = decodeCompactPin(pinToken);
    if (cp && !isNaN(cp.lat) && !isNaN(cp.lng) && isInsideFinland(cp.lat, cp.lng)) {
      map.flyTo({ center: [cp.lng, cp.lat], zoom: cp.zoom, speed: 1.4 });
      map.once("moveend", () => {
        const eventName = cp.isStop ? "hf:open-stop" : "hf:show-search-marker";
        window.dispatchEvent(new CustomEvent(eventName, { detail: { lng: cp.lng, lat: cp.lat, openPopup: true } }));
      });
      history.replaceState(null, "", location.pathname);
      return;
    }
  }

  // ?place=<id> — shared place link (new format)
  const qPlaceId = params.get("place");
  if (qPlaceId) {
    const place = placesData.find((p) => String(p.id) === qPlaceId);
    if (place) {
      if (mapView) { map.jumpTo({ center: [mapView.lng, mapView.lat], zoom: mapView.zoom }); showPlacePopup(place); }
      else { map.flyTo({ center: [place.lng, place.lat], zoom: 16, speed: 1.4 }); map.once("moveend", () => showPlacePopup(place)); }
    }
    history.replaceState(null, "", location.pathname);
    return;
  }

  // ?lat=X&lng=Y&z=Z — shared pin/stop location (new format)
  const qLat = params.get("lat");
  const qLng = params.get("lng");
  if (qLat && qLng) {
    const la = parseFloat(qLat), lo = parseFloat(qLng);
    const z = parseFloat(params.get("z")) || 16;
    const isStop = params.get("type") === "stop";
    if (!isNaN(la) && !isNaN(lo) && isInsideFinland(la, lo)) {
      map.flyTo({ center: [lo, la], zoom: z, speed: 1.4 });
      map.once("moveend", () => {
        const eventName = isStop ? "hf:open-stop" : "hf:show-search-marker";
        window.dispatchEvent(new CustomEvent(eventName, { detail: { lng: lo, lat: la, openPopup: true } }));
      });
    }
    history.replaceState(null, "", location.pathname);
    return;
  }

  // Legacy: ?p=<token> (encrypted share link)
  if (!placeToken && !mapView) {
    placeToken = params.get("p") || null;
  }

  if (placeToken) {
    const data = decryptToken(placeToken) || _decodeLegacyToken(placeToken);
    if (!data) return;
    let place = data.id != null
      ? placesData.find((p) => p.id === data.id)
      : placesData.find((p) => p.name === data.n && p.type === data.t);
    if (!place && placesData.length) {
      place = placesData.reduce((best, p) => {
        const d = (p.lat - data.a) ** 2 + (p.lng - data.o) ** 2;
        const bd = (best.lat - data.a) ** 2 + (best.lng - data.o) ** 2;
        return d < bd ? p : best;
      });
    }
    if (!place) return;
    if (mapView) { map.jumpTo({ center: [mapView.lng, mapView.lat], zoom: mapView.zoom }); showPlacePopup(place); }
    else { map.flyTo({ center: [place.lng, place.lat], zoom: 16, speed: 1.4 }); map.once("moveend", () => showPlacePopup(place)); }
    // Clear hash so the popup isn't re-opened on refresh
    history.replaceState(null, "", location.pathname + location.search);
  }
}

export function updatePlacesBadge() {
  const b = document.getElementById("places-badge");
  if (placesData.length) { b.textContent = placesData.length; b.classList.remove("hide"); }
  else { b.classList.add("hide"); }
}

const placesSheet = document.getElementById("places-sheet");
const scrim = document.getElementById("scrim");

export function openPlacesSheet() {
  if (placesSheet._hideTimeout) { clearTimeout(placesSheet._hideTimeout); placesSheet._hideTimeout = null; }
  const dirPanel = document.getElementById("dir-panel");
  if (dirPanel._animCleanup) { clearTimeout(dirPanel._animCleanup); dirPanel._animCleanup = null; }
  dirPanel.classList.add("shut");
  dirPanel.removeAttribute("style");
  placesSheet.hidden = false;
  stopPick();
  scrim.classList.remove("hide");
  setActiveTab("places-btn");
  tryGetUserLocation();
  renderTagFilterBar();
  if (_placesDirty) _placesDirty = false;
  renderPlacesList();
  placesSnap.open();                           // measure content → set initial snap height → reveal
  scheduleMapViewportSync();
}

export function closePlacesSheet() {
  // Cancel any pending animateSheetHeight cleanup that could corrupt a future open
  if (placesSheet._animCleanup) { clearTimeout(placesSheet._animCleanup); placesSheet._animCleanup = null; }
  if (placesSheet._hideTimeout) { clearTimeout(placesSheet._hideTimeout); placesSheet._hideTimeout = null; }
  placesSnap.close();                            // cleanup → reflow → adds .shut with real transition
  scrim.classList.add("hide");
  setActiveTab(null);
  scheduleMapViewportSync();
  placesSheet._hideTimeout = setTimeout(() => { placesSheet.hidden = true; placesSnap.cleanup(); placesSheet._hideTimeout = null; }, 400);
}

document.getElementById("places-btn").addEventListener("click", () =>
  placesSheet.classList.contains("shut") ? openPlacesSheet() : closePlacesSheet(),
);
document.getElementById("places-close").addEventListener("click", closePlacesSheet);

const placesSnap = initSheetDrag(placesSheet, closePlacesSheet);

let _placesDirty = false;

// Re-sync userSortLat/Lng from the best location source (live > home > null).
function _resolveSortLocation() {
  const live = getCurrentLocationState();
  if (live.active && live.lat !== null) {
    userSortLat = live.lat;
    userSortLng = live.lng;
  } else {
    const home = getHomeLocation();
    if (home && home.lat !== null) {
      userSortLat = home.lat;
      userSortLng = home.lng;
    } else {
      userSortLat = null;
      userSortLng = null;
    }
  }
}

function refreshPlacesSort() {
  if (activeSortField !== "default" && activeSortField !== "distance") return;

  // If distance sort is active but no location source remains, fall back
  if (activeSortField === "distance" && userSortLat === null) {
    activeSortField = "default";
    updateSortButton();
    showToast("Location unavailable", "loc", "Switched to Most Relevant");
  }

  if (!placesSheet.classList.contains("shut")) {
    if (activeSortField === "distance" || activeSortField === "default") {
      renderPlacesList();
    }
    return;
  }
  _placesDirty = false;
}

window.addEventListener("hf:home-updated", () => {
  _resolveUserLocation();
  _resolveSortLocation();
  refreshPlacesSort();
});
window.addEventListener("hf:current-location-updated", () => {
  _resolveUserLocation();
  _resolveSortLocation();
  refreshPlacesSort();
});

document.getElementById("places-type-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".pf-chip");
  if (!chip) return;
  document.querySelectorAll(".pf-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  activeTypeFilter = chip.dataset.type;
  activeTagFilters.clear();
  // Update search placeholder if search is open, re-run filter with same query
  if (_tfRow.classList.contains("pl-searching")) {
    _plSearchInput.placeholder = _SEARCH_PLACEHOLDERS[activeTypeFilter] || _SEARCH_PLACEHOLDERS.all;
  }
  renderTagFilterBar();
  document.getElementById("places-scroll").scrollTop = 0;
  _crossFadePlacesList();
  placesSnap.softRemeasure();
  requestAnimationFrame(() => addPlaceMarkers());
});

const tfToggle = document.getElementById("tf-toggle");
const tfChips = document.getElementById("tag-filter-chips");
const tfCount = document.getElementById("tf-count");
const sortToggle = document.getElementById("sort-toggle");
const sortDropdown = document.getElementById("sort-dropdown");
const sortLabel = document.getElementById("sort-label");
const placesClearBtn = document.getElementById("places-clear-filters");

// ── Inline places search ─────────────────────────────────────────────────────
const _tfRow = document.getElementById("tf-row");
const _plSearchWrap = document.getElementById("pl-search-wrap");
const _plSearchInput = document.getElementById("pl-search-input");
const _plSearchIcnBtn = document.getElementById("pl-search-icn-btn");
let _plSearchDebounce = 0;

const _SEARCH_PLACEHOLDERS = {
  all: "Search places\u2026",
  mosque: "Search mosques\u2026",
  religious: "Search spaces\u2026",
  restaurant: "Search restaurants\u2026",
  shop: "Search shops\u2026",
  saved: "Search saved\u2026",
};

function _openPlaceSearch() {
  _tfRow.classList.add("pl-searching");
  _plSearchWrap.classList.add("open");
  _plSearchInput.placeholder = _SEARCH_PLACEHOLDERS[activeTypeFilter] || _SEARCH_PLACEHOLDERS.all;
  setTimeout(() => _plSearchInput.focus(), 60);
}

function _closePlaceSearch() {
  _tfRow.classList.remove("pl-searching");
  _plSearchWrap.classList.remove("open");
  if (placeSearchQuery) {
    placeSearchQuery = "";
    _plSearchInput.value = "";
    renderPlacesList();
  }
  _plSearchInput.value = "";
}

// Icon toggles open/close
_plSearchIcnBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (_plSearchWrap.classList.contains("open")) {
    _closePlaceSearch();
    _plSearchInput.blur();
  } else {
    _openPlaceSearch();
  }
});

// Click outside closes search
document.addEventListener("click", (e) => {
  if (_plSearchWrap.classList.contains("open") && !e.target.closest("#pl-search-wrap")) {
    _closePlaceSearch();
  }
});

_plSearchInput.addEventListener("input", () => {
  clearTimeout(_plSearchDebounce);
  _plSearchDebounce = setTimeout(() => {
    placeSearchQuery = _plSearchInput.value;
    renderPlacesList();
  }, 120);
});

_plSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    _closePlaceSearch();
    _plSearchInput.blur();
  }
});

function updateClearButton() {
  const dirty = activeTypeFilter !== "all" || activeTagFilters.size > 0 || activeSortField !== "default" || placeSearchQuery;
  placesClearBtn.classList.toggle("hide", !dirty);
}

placesClearBtn.addEventListener("click", () => {
  activeTypeFilter = "all";
  document.querySelectorAll(".pf-chip").forEach((c) => c.classList.toggle("active", c.dataset.type === "all"));
  activeTagFilters.clear();
  activeSortField = "default";
  activeSortDir = "asc";
  placeSearchQuery = "";
  _plSearchInput.value = "";
  _closePlaceSearch();
  updateSortButton();
  renderTagFilterBar();
  addPlaceMarkers();
  document.getElementById("places-scroll").scrollTop = 0;
  _crossFadePlacesList();
  placesSnap.softRemeasure();
  updateClearButton();
});

function updateSortButton() {
  const isActive = activeSortField !== "default";
  const arrowChar = activeSortDir === "asc" ? "\u2191" : "\u2193";
  sortLabel.textContent = isActive ? `${SORT_FIELD_LABELS[activeSortField]} ${arrowChar}` : SORT_FIELD_LABELS.default;
  sortToggle.classList.toggle("has-active", isActive);
  sortDropdown.querySelectorAll("[data-sort-field]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.sortField === activeSortField),
  );
  sortDropdown.querySelectorAll("[data-sort-dir]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sortDir === activeSortDir);
    btn.disabled = activeSortField === "default";
  });
  updateClearButton();
}

function closeSortDropdown() {
  sortDropdown.classList.add("shut");
  sortToggle.classList.remove("open");
}

sortToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  if (_plSearchWrap.classList.contains("open")) {
    _closePlaceSearch();
    _plSearchInput.blur();
    setTimeout(() => sortToggle.click(), 350);
    return;
  }
  const isOpen = !sortDropdown.classList.contains("shut");
  sortDropdown.classList.toggle("shut", isOpen);
  sortToggle.classList.toggle("open", !isOpen);
});

sortDropdown.addEventListener("click", (e) => {
  const opt = e.target.closest(".sort-opt");
  if (!opt || opt.disabled) return;

  if (opt.dataset.sortField !== undefined) {
    const field = opt.dataset.sortField;
    if (field === "distance") {
      if (userSortLat === null) {
        // Try live GPS first
        requestLocation().then((pos) => {
          userSortLat = pos.coords.latitude;
          userSortLng = pos.coords.longitude;
          userLocLat = pos.coords.latitude;
          userLocLng = pos.coords.longitude;
          activeSortField = "distance";
          updateSortButton();
          animateSheetHeight(placesSheet, () => renderPlacesList());
        }).catch(() => {
          // Fall back to home location
          const home = getHomeLocation();
          if (home && home.lat !== null) {
            userSortLat = home.lat;
            userSortLng = home.lng;
            userLocLat = home.lat;
            userLocLng = home.lng;
            activeSortField = "distance";
            updateSortButton();
            animateSheetHeight(placesSheet, () => renderPlacesList());
          } else {
            showToast("Enable location or set a home address", "loc", "Needed to sort by distance");
          }
        });
        return;
      }
    }
    activeSortField = field;
    updateSortButton();
    animateSheetHeight(placesSheet, () => renderPlacesList());
    if (field === "default") closeSortDropdown();
  } else if (opt.dataset.sortDir !== undefined) {
    activeSortDir = opt.dataset.sortDir;
    updateSortButton();
    animateSheetHeight(placesSheet, () => renderPlacesList());
    closeSortDropdown();
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#sort-wrap")) closeSortDropdown();
  if (!e.target.closest(".pl-tags-summary") && !e.target.closest(".pl-tag-tip")) hideTagTip();
});

function renderTagFilterBar() {
  const typePlaces =
    activeTypeFilter === "all" ? placesData
      : activeTypeFilter === "religious" ? placesData.filter((p) => RELIGIOUS_TYPES.has(p.type))
        : placesData.filter((p) => p.type === activeTypeFilter);
  const count = typePlaces.length;
  const items = (activeTypeFilter !== "all" && activeTypeFilter !== "saved")
    ? (activeTypeFilter === "religious"
      ? [...RELIGIOUS_TYPES].flatMap((t) => getFilterBarTags(t))
      : getFilterBarTags(activeTypeFilter))
    : [];
  const totalTags = items.reduce((n, it) => n + (it.group ? it.children.length : 1), 0);

  // Filter: show when tags exist and at least 1 place
  const showFilter = totalTags > 0 && count > 0;
  tfToggle.classList.toggle("hide", !showFilter);
  if (!showFilter) {
    tfToggle.classList.remove("open");
    tfChips.classList.add("shut");
  } else {
    updateTagCount();
    let html = "<div class=\"tf-chips-inner\">";
    for (const it of items) {
      if (it.group) {
        const activeCount = it.children.filter(c => activeTagFilters.has(c.id)).length;
          html += `<button class="tf-chip tf-group-toggle${activeCount ? " has-active" : ""}" data-group="${it.parent.id}">${esc(it.parent.label)}<span class="tf-group-count${activeCount ? "" : " hide"}">${activeCount}</span><svg class="tf-group-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>`;
          html += `<div class="tf-group-chips shut" data-group-for="${it.parent.id}"${EXCLUSIVE_GROUPS.has(it.parent.id) ? " data-exclusive" : ""}><div class="tf-group-inner">`;
          html += it.children.map(c => `<button class="tf-chip${activeTagFilters.has(c.id) ? " active" : ""}" data-tag="${c.id}">${esc(c.label)}</button>`).join("");
          html += `</div>`;
          html += `</div>`;
      } else {
        html += `<button class="tf-chip${activeTagFilters.has(it.tag.id) ? " active" : ""}" data-tag="${it.tag.id}">${esc(it.tag.label)}</button>`;
      }
    }
    html += `</div>`;
    tfChips.innerHTML = html;
  }

  // Sort: show only when 2+ places
  sortToggle.classList.toggle("hide", count < 2);
  if (count < 2) closeSortDropdown();
  updateClearButton();
}

function updateTagCount() {
  if (activeTagFilters.size) {
    const countText = String(activeTagFilters.size);
    tfCount.textContent = countText;
    tfCount.classList.toggle("one-digit", countText.length === 1);
    tfCount.classList.remove("hide");
    tfToggle.classList.add("has-active");
  } else {
    tfCount.classList.add("hide");
    tfCount.classList.remove("one-digit");
    tfToggle.classList.remove("has-active");
  }
}

// Smooth slide helper: animates element height from current to target
function slideHeight(el, to, onDone) {
  const from = el.offsetHeight;
  // Collapse uses ease-in so the last few % don't creep; expand keeps the spring settle
  if (to === 0) el.style.transition = "height 0.25s cubic-bezier(0.4, 0, 1, 1)";
  el.style.height = from + "px";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.height = to + "px";
      if (onDone) {
        const done = (e) => {
          if (e.propertyName !== "height" || e.target !== el) return;
          el.removeEventListener("transitionend", done);
          el.style.transition = "";
          onDone();
        };
        el.addEventListener("transitionend", done);
      }
    });
  });
}

function syncPlacesSnap() {
  requestAnimationFrame(() => placesSnap.softRemeasure());
}

tfToggle.addEventListener("click", () => {
  if (_plSearchWrap.classList.contains("open")) {
    _closePlaceSearch();
    _plSearchInput.blur();
    setTimeout(() => tfToggle.click(), 350);
    return;
  }
  const isOpen = !tfChips.classList.contains("shut");
  if (isOpen) {
    // Closing: animate height to 0, then add .shut
    slideHeight(tfChips, 0, () => {
      tfChips.classList.add("shut");
      tfChips.style.height = "";
      syncPlacesSnap();
    });
  } else {
    // Opening: remove .shut, measure natural height, animate from 0
    tfChips.classList.remove("shut");
    const inner = tfChips.querySelector(".tf-chips-inner");
    const h = inner ? inner.offsetHeight : 0;
    tfChips.style.height = "0px";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tfChips.style.height = h + "px";
        const done = (e) => {
          if (e.propertyName !== "height" || e.target !== tfChips) return;
          tfChips.style.height = "";
          tfChips.removeEventListener("transitionend", done);
          syncPlacesSnap();
        };
        tfChips.addEventListener("transitionend", done);
      });
    });
  }
  tfToggle.classList.toggle("open", !isOpen);
});

document.getElementById("tag-filter-chips").addEventListener("click", (e) => {
  // Expand/collapse a subtag group
  const groupBtn = e.target.closest(".tf-group-toggle");
  if (groupBtn) {
    const gid = groupBtn.dataset.group;
    const panel = tfChips.querySelector(`.tf-group-chips[data-group-for="${gid}"]`);
    if (panel) {
      const isOpen = !panel.classList.contains("shut");
      // Accordion: collapse any other open group first
      if (!isOpen) {
        tfChips.querySelectorAll(".tf-group-chips:not(.shut)").forEach(other => {
          if (other === panel) return;
          other.scrollTop = 0;
          const otherGid = other.dataset.groupFor;
          slideHeight(other, 0, () => { other.classList.add("shut"); other.style.height = ""; syncPlacesSnap(); });
          const otherToggle = tfChips.querySelector(`.tf-group-toggle[data-group="${otherGid}"]`);
          if (otherToggle) otherToggle.classList.remove("open");
        });
      }
      if (isOpen) {
        panel.scrollTop = 0;
        slideHeight(panel, 0, () => { panel.classList.add("shut"); panel.style.height = ""; syncPlacesSnap(); });
      } else {
        panel.classList.remove("shut");
        const inner = panel.querySelector(".tf-group-inner");
        const firstChip = panel.querySelector(".tf-chip");
        const chipH = firstChip ? firstChip.offsetHeight : 30;
        const gap = inner ? (parseFloat(getComputedStyle(inner).rowGap) || 5) : 5;
        const threeRowH = chipH * 3 + gap * 2;
        const fullH = inner ? inner.offsetHeight : panel.scrollHeight;
        const targetH = Math.min(fullH, threeRowH);
        panel.style.height = "0px";
        requestAnimationFrame(() => { requestAnimationFrame(() => {
          panel.style.height = targetH + "px";
          const clear = (ev) => {
            if (ev.propertyName !== "height" || ev.target !== panel) return;
            panel.removeEventListener("transitionend", clear);
            syncPlacesSnap();
            // Scroll-bounce hint (phone only — on desktop the scrollbar is always visible)
            if (fullH > threeRowH && window.matchMedia("(max-width: 768px)").matches) {
              panel.scrollTo({ top: 24, behavior: "smooth" });
              setTimeout(() => panel.scrollTo({ top: 0, behavior: "smooth" }), 300);
            }
          };
          panel.addEventListener("transitionend", clear);
        }); });
      }
      groupBtn.classList.toggle("open", !isOpen);
    }
    return;
  }
  const chip = e.target.closest(".tf-chip");
  if (!chip) return;
  const tagId = chip.dataset.tag;
  const groupPanel = chip.closest(".tf-group-chips");
  // Exclusive group: deselect siblings before toggling
  if (groupPanel?.hasAttribute("data-exclusive") && !activeTagFilters.has(tagId)) {
    groupPanel.querySelectorAll(".tf-chip.active").forEach(c => {
      if (c !== chip) { activeTagFilters.delete(c.dataset.tag); c.classList.remove("active"); }
    });
  }
  if (activeTagFilters.has(tagId)) { activeTagFilters.delete(tagId); chip.classList.remove("active"); }
  else { activeTagFilters.add(tagId); chip.classList.add("active"); }
  // Update group count badge
  if (groupPanel) {
    const gid = groupPanel.dataset.groupFor;
    const toggle = tfChips.querySelector(`.tf-group-toggle[data-group="${gid}"]`);
    if (toggle) {
      const cnt = groupPanel.querySelectorAll(".tf-chip.active").length;
      const badge = toggle.querySelector(".tf-group-count");
      if (badge) { badge.textContent = cnt; badge.classList.toggle("hide", !cnt); }
      toggle.classList.toggle("has-active", cnt > 0);
    }
  }
  updateTagCount();
  addPlaceMarkers();
  document.getElementById("places-scroll").scrollTop = 0;
  _crossFadePlacesList();
  placesSnap.softRemeasure();                    // update drag cap for filtered content
  updateClearButton();
});

function _placeSkeletonHTML(count = 6) {
  return Array.from({ length: count }, (_, i) =>
    `<li class="pl-skeleton" style="--i:${i}"><div class="skel-bone skel-icon"></div><div class="skel-body"><div class="skel-bone skel-line skel-line-long"></div><div class="skel-bone skel-line skel-line-short"></div></div><div class="skel-bone skel-badge"></div></li>`
  ).join("");
}

const CROSSFADE_MS = 150;
let _crossFadeTimer = 0;

/**
 * Cross-fade the places list: fade out → swap content → fade in with stagger.
 * Falls back to instant swap on mobile or when the sheet is closed.
 */
function _crossFadePlacesList() {
  const scroll = document.getElementById("places-scroll");
  if (window.innerWidth <= 768 || placesSheet.classList.contains("shut")) {
    animateSheetHeight(placesSheet, () => renderPlacesList());
    return;
  }
  clearTimeout(_crossFadeTimer);
  scroll.classList.add("pl-fading");
  _crossFadeTimer = setTimeout(() => {
    animateSheetHeight(placesSheet, () => renderPlacesList());
    requestAnimationFrame(() => scroll.classList.remove("pl-fading"));
  }, CROSSFADE_MS);
}

function renderPlacesList() {
  const list = document.getElementById("places-list");
  const empty = document.getElementById("places-empty");
  const ct = document.getElementById("places-ct");

  // Show skeleton placeholders while data is still loading
  if (!placesLoaded) {
    empty.classList.add("hide");
    ct.textContent = "";
    list.innerHTML = _placeSkeletonHTML();
    return;
  }

  let filtered =
    activeTypeFilter === "all"
      ? placesData
      : activeTypeFilter === "saved"
        ? placesData.filter((p) => isFavourite(p.id))
        : activeTypeFilter === "religious"
          ? placesData.filter((p) => RELIGIOUS_TYPES.has(p.type))
          : placesData.filter((p) => p.type === activeTypeFilter);

  if (activeTagFilters.size) {
    filtered = filtered.filter((p) =>
      [...activeTagFilters].every((tagId) => p.tags?.[tagId] === true),
    );
  }

  // Hide entire toolbar row when the tab has no data to search/sort/filter
  const _preSearchCount = filtered.length +
    (activeTypeFilter === "saved" ? getSavedPins().length : 0);
  _tfRow.classList.toggle("hide", _preSearchCount === 0);
  if (_preSearchCount === 0 && _plSearchWrap.classList.contains("open")) {
    _closePlaceSearch();
  }

  // Inline search filter
  const q = placeSearchQuery.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const addr = (p.address || "").toLowerCase();
      return name.includes(q) || addr.includes(q);
    });
  }

  const sorted = applySort(filtered);
  let customPins = activeTypeFilter === "saved" ? getSavedPins() : [];
  if (q && customPins.length) {
    customPins = customPins.filter((pin) =>
      (pin.name || "").toLowerCase().includes(q) || (pin.id || "").toLowerCase().includes(q),
    );
  }
  const totalCount = sorted.length + customPins.length;

  if (!totalCount) {
    list.innerHTML = "";
    ct.textContent = "";
    empty.classList.remove("hide");
    if (activeTypeFilter === "saved") {
      empty.innerHTML = `
        <div class="empty-anim">
          <svg class="empty-pin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/><circle cx="12" cy="9" r="2.5"/></svg>
          <div class="empty-ping"></div>
        </div>
        <div class="empty-text">
          <span class="empty-title">Nothing saved yet</span>
          <span class="empty-sub">Tap ★ on any place or pin to save it here</span>
        </div>`;
    } else if (q) {
      empty.innerHTML = `
        <div class="empty-anim">
          <svg class="empty-pin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <div class="empty-ping"></div>
        </div>
        <div class="empty-text">
          <span class="empty-title">No matches for &ldquo;${esc(placeSearchQuery.trim())}&rdquo;</span>
          <span class="empty-sub">Try a different search term</span>
        </div>`;
    } else {
      empty.innerHTML = `
        <div class="empty-anim">
          <svg class="empty-pin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
          <div class="empty-ping"></div>
        </div>
        <div class="empty-text">
          <span class="empty-title">No places found</span>
          <span class="empty-sub">Try other filters · <button id="suggest-place-btn-empty" class="empty-suggest btn-inline">Suggest one</button></span>
        </div>`;
    }
    return;
  }

  empty.classList.add("hide");
  ct.textContent = `${totalCount} place${totalCount > 1 ? "s" : ""}`;

  const buildGroupedPlacesHTML = (sorted) => {
    const groups = new Map();
    sorted.forEach((place) => {
      const city = getPlaceCity(place);
      if (!groups.has(city)) groups.set(city, []);
      groups.get(city).push(place);
    });

    _lastGroupedData = groups;
    let animationIndex = 0;
    return [...groups.entries()].map(([city, group]) => {
      const collapsed = collapsedCityGroups.has(city);
      const cards = collapsed ? "" : group.map((place) => _buildCard(place, animationIndex++)).join("");
      if (collapsed) animationIndex += group.length;
      return `<li class="pl-section-hdr pl-city-hdr${collapsed ? " is-collapsed" : ""}" data-city-group="${escA(city)}"><button class="pl-city-toggle" type="button"><svg class="pl-city-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg><span class="pl-city-name">${esc(city)}</span></button><span class="pl-city-count">${group.length}</span></li><li class="pl-city-group-body${collapsed ? " shut" : ""}" data-city-group-body="${escA(city)}"${collapsed ? ' data-lazy="1"' : ''}><div class="pl-city-group-inner"><ul class="pl-city-group-list">${cards}</ul></div></li>`;
    }).join("");
  };

  const regularHTML = activeSortField === "default"
    ? buildGroupedPlacesHTML(sorted)
    : sorted.map((p, i) => _buildCard(p, i)).join("");

  const pinHTML = customPins
    .map((pin, pi) => `<li class="pl-card" data-custom-pin-id="${escA(pin.id)}" style="--place-c:var(--accent);--i:${sorted.length + pi}">
      <span class="pl-dot" style="background:var(--accent)"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg></span>
      <span class="pl-name">${esc(pin.name)}</span>
      <span class="pl-addr">${esc(pin.id)}</span>
      <div class="pl-meta">
        <span class="pl-tags-summary" style="--type-c:var(--accent)" data-type="Dropped Pin" data-tags="[]">0 tags</span>
      </div>
      <div class="pl-acts">
        <button class="pl-dir-btn" data-lat="${pin.lat}" data-lng="${pin.lng}" data-name="${escA(pin.name)}" aria-label="Directions to ${escA(pin.name)}" title="Directions">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-6 6"/><path d="M4 20v-6a4 4 0 0 1 4-4h12"/></svg>
        </button>
        <button class="pl-fav-btn active pl-unsave-pin-btn" data-pin-id="${escA(pin.id)}" aria-label="Remove from saved">
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="currentColor">${_starPath}</svg>
        </button>
      </div>
    </li>`)
    .join("");

  // Recently viewed section (skip on saved tab and when searching)
  let recentHtml = "";
  if (activeTypeFilter !== "saved" && !q && recentIds.length) {
    const recentPlaces = recentIds.map((id) => filtered.find((p) => p.id === id)).filter(Boolean);
    if (recentPlaces.length) {
      const recentCollapsed = collapsedCityGroups.has("__recent__");
      const recentCards = recentPlaces.map((p, i) => _buildCard(p, i)).join("");
      const mainHdr = (regularHTML || pinHTML)
        ? `<li class="pl-section-hdr pl-section-hdr--main">All places</li>`
        : "";
      recentHtml = `<li class="pl-section-hdr pl-city-hdr${recentCollapsed ? " is-collapsed" : ""}" data-city-group="__recent__"><button class="pl-city-toggle" type="button"><svg class="pl-city-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg><span class="pl-city-name">Recently viewed</span></button><span class="pl-city-count">${recentPlaces.length}</span></li><li class="pl-city-group-body${recentCollapsed ? " shut" : ""}" data-city-group-body="__recent__"><div class="pl-city-group-inner"><ul class="pl-city-group-list">${recentCards}</ul></div></li>${mainHdr}`;
    }
  }

  list.innerHTML = recentHtml + regularHTML + pinHTML;

  // Render sponsored carousel at the top of the places list
  _renderSponsorCarousel(filtered);
}

// ── Events Button + Overlay ──────────────────────────────────────────────────
const _eventsPill = document.getElementById("events-pill");
const _eventsOverlay = document.getElementById("events-overlay");
const _eventsList = document.getElementById("events-list");
const _evFilteredList = document.getElementById("ev-filtered-list");
const _evEmptyState = document.getElementById("ev-empty-state");
const _evMosqueFilter = document.getElementById("ev-mosque-filter");

let _evActiveFilter = "upcoming";
let _evNearbySort = false;

export function renderEventsPill() {
  if (!eventsData.length) {
    _eventsPill.classList.add("hide");
    return;
  }
  _eventsPill.classList.remove("hide");
  _populateEvMosqueFilter();
  _renderEventsList();
}

/** Populate the mosque dropdown filter with mosques that have events. */
function _populateEvMosqueFilter() {
  if (!_evMosqueFilter) return;
  const mosqueIds = new Set(eventsData.map((ev) => ev.placeId));
  const mosques = placesData.filter((p) => mosqueIds.has(p.id));
  _evMosqueFilter.innerHTML = `<option value="">All mosques</option>` +
    mosques.map((m) => `<option value="${escA(m.id)}">${esc(m.name)}</option>`).join("");
}

/**
 * Filter events based on the active date filter and mosque filter.
 * @returns {Array<{ev: object, nextDate: Date|null, dist: number|null}>}
 */
function _filterEvents() {
  const today = _todayMidnight();
  const mosqueId = _evMosqueFilter ? _evMosqueFilter.value : "";

  // Date range for this-week and this-month
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  // Get user location for proximity
  const loc = getCurrentLocationState();
  const hasLoc = loc.active && loc.lat != null && loc.lng != null;

  return eventsData.map((ev) => {
    const nd = _nextEventDate(ev);
    const place = placesData.find((p) => p.id === ev.placeId);
    const dist = hasLoc && place && place.lat && place.lng
      ? haversineDistance(loc.lat, loc.lng, place.lat, place.lng)
      : null;
    return { ev, nextDate: nd, dist, place };
  }).filter(({ ev, nextDate }) => {
    // Mosque filter
    if (mosqueId && ev.placeId !== mosqueId) return false;

    // Date filter
    switch (_evActiveFilter) {
      case "today":
        if (!nextDate) return false;
        return nextDate.getTime() === today.getTime();
      case "this-week":
        if (!nextDate) return false;
        return nextDate >= today && nextDate <= endOfWeek;
      case "this-month":
        if (!nextDate) return false;
        return nextDate >= today && nextDate <= endOfMonth;
      case "upcoming":
        // Show all future events (recurring always pass)
        if (ev.recurring) return true;
        return nextDate != null;
      case "all":
        return true;
      default:
        return true;
    }
  }).sort((a, b) => {
    // If nearby sort active, sort by distance
    if (_evNearbySort && a.dist != null && b.dist != null) {
      return a.dist - b.dist;
    }
    // Default: by next occurrence date
    if (a.nextDate && b.nextDate) return a.nextDate - b.nextDate;
    if (a.nextDate) return -1;
    if (b.nextDate) return 1;
    return 0;
  });
}

function _renderEventsList() {
  if (!_evFilteredList) return;
  const filtered = _filterEvents();

  if (!filtered.length) {
    _evFilteredList.innerHTML = "";
    _evEmptyState.classList.remove("hide");
    return;
  }
  _evEmptyState.classList.add("hide");

  _evFilteredList.innerHTML = filtered.map(({ ev, nextDate, dist, place }) => {
    const placeName = place ? esc(place.name) : "";
    const dateStr = _formatEventDate(ev);
    const timeStr = ev.time ? ev.time + (ev.endTime ? `–${ev.endTime}` : "") : "";
    const recurBadge = ev.recurring
      ? `<span class="ev-recur-badge">${esc(formatRecurrence(ev.recurrence) || "Recurring")}</span>`
      : "";
    const nextDateBadge = nextDate
      ? `<span class="ev-date-badge">${esc(nextDate.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" }))}</span>`
      : (dateStr && !ev.recurring ? `<span class="ev-date-badge">${esc(dateStr)}</span>` : "");
    const distBadge = dist != null
      ? `<span class="ev-dist-badge">${dist < 1 ? Math.round(dist * 1000) + " m" : dist.toFixed(1) + " km"}</span>`
      : "";
    return `<div class="ev-overlay-card" role="button" tabindex="0" data-place-id="${ev.placeId}" data-ev-url="${escA(ev.url || "")}" data-ev-id="${escA(ev.id)}">
      <div class="ev-overlay-top">
        <div class="ev-overlay-info">
          <span class="ev-overlay-title">${esc(ev.title)}</span>
          ${placeName ? `<span class="ev-overlay-mosque">${placeName}</span>` : ""}
        </div>
        <div class="ev-overlay-actions">
          <button type="button" class="ev-overlay-edit-btn" data-ev-id="${escA(ev.id)}" title="Suggest an edit" aria-label="Suggest event edit"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          ${ev.url ? `<a href="${escA(ev.url)}" target="_blank" rel="noopener noreferrer" class="ev-overlay-link-btn" title="Open event page" aria-label="Open event page"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : ""}
        </div>
      </div>
      <div class="ev-overlay-meta">
        ${recurBadge}${nextDateBadge}${timeStr ? `<span class="ev-time-badge">${esc(timeStr)}</span>` : ""}${distBadge}
      </div>
      ${ev.description ? `<p class="ev-overlay-desc">${esc(ev.description)}</p>` : ""}
    </div>`;
  }).join("");
}

// ── Filter bar event handlers ────────────────────────────────────────────────
document.getElementById("ev-filter-bar")?.addEventListener("click", (e) => {
  const chip = e.target.closest(".ev-filter-chip");
  if (!chip) return;
  const filter = chip.dataset.filter;

  if (filter === "nearby") {
    // Toggle proximity sort
    _evNearbySort = !_evNearbySort;
    chip.classList.toggle("active", _evNearbySort);
    if (_evNearbySort) {
      const loc = getCurrentLocationState();
      if (!loc.active || loc.lat == null) {
        requestLocation();
        showToast("Getting your location…", "info");
      }
    }
  } else {
    // Date filter chips — mutual exclusion
    document.querySelectorAll("#ev-filter-bar .ev-filter-chip:not(.ev-filter-proximity)").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    _evActiveFilter = filter;
  }
  _renderEventsList();
});

_evMosqueFilter?.addEventListener("change", () => _renderEventsList());

_eventsPill.addEventListener("click", () => {
  _eventsOverlay.classList.remove("hide");
});

/**
 * Opens the events overlay and scrolls to / highlights a specific event.
 * @param {string} evId - The event ID to highlight.
 */
function _openEventsOverlayToEvent(evId) {
  _eventsOverlay.classList.remove("hide");
  _renderEventsList();
  requestAnimationFrame(() => {
    const card = _eventsList.querySelector(`.ev-overlay-card[data-ev-id="${CSS.escape(evId)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("ev-overlay-card--highlight");
    setTimeout(() => card.classList.remove("ev-overlay-card--highlight"), 1800);
  });
}

document.getElementById("events-close").addEventListener("click", () => {
  _eventsOverlay.classList.add("hide");
});

document.getElementById("events-add-btn").addEventListener("click", () => {
  _eventsOverlay.classList.add("hide");
  openEventOverlay();
});

_eventsOverlay.addEventListener("click", (e) => {
  if (e.target === _eventsOverlay) _eventsOverlay.classList.add("hide");
});

_eventsList.addEventListener("click", (e) => {
  // Handle edit button click first
  const editBtn = e.target.closest(".ev-overlay-edit-btn");
  if (editBtn) {
    e.stopPropagation();
    const ev = eventsData.find((x) => x.id === editBtn.dataset.evId);
    if (ev) {
      _eventsOverlay.classList.add("hide");
      openEventOverlay(null, ev);
    }
    return;
  }
  // Let link button clicks through to the <a> handler
  if (e.target.closest(".ev-overlay-link-btn")) return;
  const card = e.target.closest(".ev-overlay-card");
  if (!card) return;
  const url = card.dataset.evUrl;
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    const pid = card.dataset.placeId;
    const place = placesData.find((p) => p.id === pid);
    if (place) {
      _eventsOverlay.classList.add("hide");
      openPlaceAfterSheetClose(place);
    }
  }
});

// ── Promos Button + Overlay ──────────────────────────────────────────────────
const _promosPill = document.getElementById("promos-pill");
const _promosOverlay = document.getElementById("promos-overlay");
const _promosList = document.getElementById("promos-list");

function _getPromoPlaces() {
  return placesData.filter(p => { const s = activeSponsor(p); return s && s.cta; });
}

export function renderPromosPill() {
  const promos = _getPromoPlaces();
  if (!promos.length) {
    _promosPill.classList.add("hide");
    return;
  }
  _promosPill.classList.remove("hide");
  _promosList.innerHTML = promos.map(p => {
    const cfg = PLACE_CONFIG[p.type] || PLACE_CONFIG.mosque;
    const cssColor = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)", cemetery: "var(--cemetery)" }[p.type] || cfg.color;
    return `<button class="promo-item" data-promo-code="${escA(p.sponsor.cta)}" data-promo-text="${escA(p.sponsor.text || "")}">
      <span class="promo-dot" style="background:${cssColor}"><svg viewBox="0 0 24 24" width="14" height="14" fill="#fff">${cfg.icon}</svg></span>
      <span class="promo-name">${esc(p.name)}</span>
      <span class="promo-addr">${esc(p.address)}</span>
      <div class="promo-code-wrap">
        <span class="promo-code">${esc(p.sponsor.cta)}</span>
        ${p.sponsor.text ? `<span class="promo-text">${esc(p.sponsor.text)}</span>` : ""}
      </div>
    </button>`;
  }).join("");
}

_promosPill.addEventListener("click", () => {
  _promosOverlay.classList.remove("hide");
});

document.getElementById("promos-close").addEventListener("click", () => {
  _promosOverlay.classList.add("hide");
});

_promosOverlay.addEventListener("click", (e) => {
  if (e.target === _promosOverlay) _promosOverlay.classList.add("hide");
});

_promosList.addEventListener("click", (e) => {
  const btn = e.target.closest(".promo-item");
  if (!btn) return;
  e.stopPropagation();
  const code = btn.dataset.promoCode;
  const text = btn.dataset.promoText;
  copyToClipboard(code);
  showToast(code, "check", text || null);
});

// ── Sponsored Carousel in places list ───────────────────────────────────────
let _carouselAutoTimer = 0;
let _carouselResumeTimer = 0;
let _carouselAutoActive = false;
let _carouselAnimId = 0;

function _renderSponsorCarousel(filteredPlaces) {
  const scroll = document.getElementById("places-scroll");
  const old = scroll.querySelector(".sponsor-carousel");
  if (old) old.remove();
  _clearCarouselAuto();

  const sponsored = filteredPlaces.filter(p => activeSponsor(p));
  if (!sponsored.length) return;

  const carousel = document.createElement("div");
  carousel.className = "sponsor-carousel";

  // Section header matching the city-group pattern
  const hdr = `<div class="sponsor-carousel-hdr"><svg class="sponsor-carousel-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><span>Sponsored</span><span class="pl-city-count">${sponsored.length}</span></div>`;

  const cards = sponsored.map(p => {
    const cfg = PLACE_CONFIG[p.type] || PLACE_CONFIG.mosque;
    const cssColor = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)", cemetery: "var(--cemetery)" }[p.type] || cfg.color;
    return `<button class="sponsor-card" data-place-id="${p.id}"><span class="sponsor-card-dot" style="background:${cssColor}"><svg viewBox="0 0 24 24" width="14" height="14" fill="#fff">${cfg.icon}</svg></span><div class="sponsor-card-body"><span class="sponsor-card-name">${esc(p.name)}</span><span class="sponsor-card-addr">${esc(p.address)}</span></div></button>`;
  }).join("");

  // 5x duplicated for seamless infinite loop — gives plenty of runway
  // for fast manual swipes before the normalize jump fires
  const loopCards = sponsored.length > 1 ? cards + cards + cards + cards + cards : cards;
  carousel.innerHTML = `${hdr}<div class="sponsor-carousel-viewport"><div class="sponsor-carousel-track">${loopCards}</div></div>`;

  const list = document.getElementById("places-list");
  scroll.insertBefore(carousel, list);

  const track = carousel.querySelector(".sponsor-carousel-track");
  const viewport = carousel.querySelector(".sponsor-carousel-viewport");
  const count = sponsored.length;
  let touchCooldownActive = false;

  if (count > 1) {
    requestAnimationFrame(() => {
      _setCarouselToMiddle(track, count);
      _startCarouselAuto(track, count);
    });
  }

  // Click → open place popup
  track.addEventListener("click", (e) => {
    const card = e.target.closest(".sponsor-card");
    if (!card) return;
    const place = placesData.find(p => p.id === card.dataset.placeId);
    if (place) { closePlacesSheet(); showPlacePopup(place); }
  });

  // Desktop: mouse wheel over carousel → scroll horizontally, not vertically
  viewport.addEventListener("wheel", (e) => {
    if (!track.scrollWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      track.scrollLeft += e.deltaY;
    }
    _pauseCarouselAuto(track, count);
  }, { passive: false });

  // Normalize loop position after manual scroll settles
  track.addEventListener("scroll", () => {
    // Skip recentering during auto-scroll and touch interaction —
    // modifying scrollLeft mid-momentum kills native inertia on mobile.
    if (!_carouselAutoActive && !touchCooldownActive) {
      _recenterCarouselLoop(track, count);
    }
  }, { passive: true });

  // Desktop: pause while cursor hovers over the carousel area
  viewport.addEventListener("mouseenter", () => _pauseCarouselAuto(track, count));
  viewport.addEventListener("mouseleave", () => {
    _clearCarouselAuto();
    _carouselResumeTimer = setTimeout(() => {
      if (track.isConnected && count > 1) _startCarouselAuto(track, count);
    }, 600);
  });

  // Mobile: 4s cooldown from last touch — no snap, no auto-scroll during cooldown
  let _touchCooldownTimer = 0;
  const touchPause = () => {
    touchCooldownActive = true;
    _clearCarouselAuto();
    clearTimeout(_touchCooldownTimer);
  };
  const touchRelease = () => {
    touchCooldownActive = true;
    _clearCarouselAuto();
    clearTimeout(_touchCooldownTimer);
    _touchCooldownTimer = setTimeout(() => {
      if (!track.isConnected || count < 2) return;
      touchCooldownActive = false;
      _recenterCarouselLoop(track, count);
      // Resume auto-scroll after cooldown
      if (track.isConnected && count > 1) _startCarouselAuto(track, count);
    }, 4000);
  };
  viewport.addEventListener("touchstart", touchPause, { passive: true });
  viewport.addEventListener("touchend", touchRelease, { passive: true });
}

function _startCarouselAuto(track, count) {
  _clearCarouselAuto();
  _carouselAutoActive = true;

  const advance = () => {
    if (!track.isConnected || count < 2) {
      _clearCarouselAuto();
      return;
    }

    const metrics = _getCarouselMetrics(track, count);
    if (!metrics) {
      _clearCarouselAuto();
      return;
    }

    // Recenter into a safe forward band first, then use our own rAF
    // animation instead of scrollTo({ behavior: "smooth" }) which on
    // mobile can be cancelled/reversed by scroll-event recentering.
    _recenterCarouselLoop(track, count);
    const aligned = _prepareCarouselForwardAdvance(track, count, metrics);
    const nextLeft = aligned + metrics.span;
    _animateCarouselTo(track, nextLeft, 1000);

    // Schedule next advance (keep looping forever)
    _carouselAutoTimer = window.setTimeout(advance, 2800);
  };

  _carouselAutoTimer = window.setTimeout(advance, 1200);
}

function _pauseCarouselAuto(track, count) {
  _clearCarouselAuto();
  _carouselResumeTimer = setTimeout(() => {
    if (track.isConnected && count > 1) _startCarouselAuto(track, count);
  }, 2500);
}

function _clearCarouselAuto() {
  _carouselAutoActive = false;
  if (_carouselAnimId) { cancelAnimationFrame(_carouselAnimId); _carouselAnimId = 0; }
  if (_carouselAutoTimer) { clearTimeout(_carouselAutoTimer); _carouselAutoTimer = 0; }
  if (_carouselResumeTimer) { clearTimeout(_carouselResumeTimer); _carouselResumeTimer = 0; }
}

function _getCarouselMetrics(track, count) {
  const card = track.querySelector(".sponsor-card");
  if (!card || count < 2) return null;
  const style = getComputedStyle(track);
  const gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 0;
  const span = card.offsetWidth + gap;
  return { span, oneSet: span * count };
}

function _setCarouselToMiddle(track, count) {
  const metrics = _getCarouselMetrics(track, count);
  if (!metrics) return;
  track.scrollLeft = _getCarouselLoopBounds(metrics).centre;
}

function _getCarouselLoopBounds(metrics) {
  return {
    min: metrics.oneSet,
    centre: metrics.oneSet * 2,
    max: metrics.oneSet * 3,
  };
}

function _recenterCarouselLoop(track, count) {
  const metrics = _getCarouselMetrics(track, count);
  if (!metrics) return null;
  const bounds = _getCarouselLoopBounds(metrics);

  while (track.scrollLeft < bounds.min) {
    track.scrollLeft += metrics.oneSet;
  }
  while (track.scrollLeft >= bounds.max) {
    track.scrollLeft -= metrics.oneSet;
  }

  return metrics;
}

function _getAlignedCarouselLeft(track, count) {
  const metrics = _getCarouselMetrics(track, count);
  if (!metrics) return track.scrollLeft;
  const bounds = _getCarouselLoopBounds(metrics);
  const offset = track.scrollLeft - bounds.centre;
  let aligned = bounds.centre + Math.round(offset / metrics.span) * metrics.span;
  // Clamp into [min, max) — Math.round can overshoot at boundaries
  if (aligned >= bounds.max) aligned -= metrics.oneSet;
  if (aligned < bounds.min) aligned += metrics.oneSet;
  return aligned;
}

function _prepareCarouselForwardAdvance(track, count, metrics) {
  const bounds = _getCarouselLoopBounds(metrics);
  let alignedLeft = _getAlignedCarouselLeft(track, count);

  // Keep the starting point inside the middle loop band with enough room to
  // advance one full card to the right without wrapping the absolute scroll
  // position backwards.
  while (alignedLeft + metrics.span >= bounds.max) {
    alignedLeft -= metrics.oneSet;
  }
  while (alignedLeft < bounds.min) {
    alignedLeft += metrics.oneSet;
  }

  if (track.scrollLeft !== alignedLeft) {
    track.scrollLeft = alignedLeft;
  }

  return alignedLeft;
}

function _getForwardCarouselLeft(alignedLeft, metrics) {
  const bounds = _getCarouselLoopBounds(metrics);
  let nextLeft = alignedLeft + metrics.span;
  while (nextLeft >= bounds.max) {
    nextLeft -= metrics.oneSet;
  }
  while (nextLeft < bounds.min) {
    nextLeft += metrics.oneSet;
  }
  return nextLeft;
}

// Manual rAF animation — immune to mobile browser smooth-scroll quirks
function _animateCarouselTo(track, target, duration) {
  if (_carouselAnimId) cancelAnimationFrame(_carouselAnimId);
  const start = track.scrollLeft;
  const dist = target - start;
  if (Math.abs(dist) < 1) { _carouselAnimId = 0; return; }
  const t0 = performance.now();
  // Cubic ease-out — gentle deceleration, feels natural on mobile
  const ease = t => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const p = Math.min((now - t0) / duration, 1);
    track.scrollLeft = start + dist * ease(p);
    if (p < 1) _carouselAnimId = requestAnimationFrame(frame);
    else _carouselAnimId = 0;
  }
  _carouselAnimId = requestAnimationFrame(frame);
}

// Snaps scrollLeft to the nearest card-aligned position
function _snapToNearestCard(track, count) {
  const metrics = _recenterCarouselLoop(track, count);
  if (!metrics) return;
  const aligned = _getAlignedCarouselLeft(track, count);
  _animateCarouselTo(track, aligned, 300);
}

function openSuggestOverlay() { document.getElementById("suggest-overlay").classList.remove("hide"); }
let _eventEditMode = false;
let _eventEditOriginal = null;

/**
 * Open the event form overlay in add or edit mode.
 * @param {string} [preselectedPlaceId] - Pre-select this mosque in add mode
 * @param {object} [editEvent] - If provided, opens in edit mode pre-filled with this event
 */
function openEventOverlay(preselectedPlaceId, editEvent) {
  const overlay = document.getElementById("event-overlay");
  const form = document.getElementById("event-form");
  const mosqueSelect = document.getElementById("ev-mosque");
  const heading = document.getElementById("ev-heading");
  const submitBtn = document.getElementById("ev-submit");
  form.reset();

  // Set mode
  _eventEditMode = !!editEvent;
  _eventEditOriginal = editEvent || null;
  document.getElementById("ev-edit-id").value = editEvent ? editEvent.id : "";

  // Update heading and submit button text
  heading.textContent = _eventEditMode ? "Suggest Edit" : "Submit Event";
  submitBtn.textContent = _eventEditMode ? "Submit Edit Suggestion" : "Submit Event";

  // Reset schedule chips to one-time
  _evScheduleMode = "oneTime";
  overlay.querySelectorAll(".ev-schedule-chips .ev-sched-chip").forEach((c) => c.classList.remove("active"));
  overlay.querySelector('.ev-schedule-chips .ev-sched-chip[data-value="oneTime"]')?.classList.add("active");
  // Populate mosque dropdown with approved mosques/prayer rooms
  const mosques = placesData.filter((p) => p.type === "mosque" || p.type === "prayer_room");
  const selectedPlaceId = editEvent ? editEvent.placeId : preselectedPlaceId;
  mosqueSelect.innerHTML = `<option value="" disabled selected>Select a mosque…</option>` +
    mosques.map((m) => `<option value="${escA(m.id)}"${m.id === selectedPlaceId ? " selected" : ""}>${esc(m.name)}</option>`).join("");
  // Show one-time fields by default
  document.getElementById("ev-onetime-fields").classList.remove("hide");
  document.getElementById("ev-recurring-fields").classList.add("hide");
  // Init recurring form chips
  _initRecurringFormChips();
  document.getElementById("ev-recurrence-preview")?.classList.add("hide");
  // Hide sub-fields
  document.getElementById("ev-day-picker")?.classList.add("hide");
  document.getElementById("ev-monthly-opts")?.classList.add("hide");
  document.getElementById("ev-biweekly-anchor")?.classList.add("hide");

  // Pre-fill fields in edit mode
  if (editEvent) {
    document.getElementById("ev-title").value = editEvent.title || "";
    document.getElementById("ev-desc").value = editEvent.description || "";
    document.getElementById("ev-url").value = editEvent.url || "";
    document.getElementById("ev-time").value = editEvent.time || "";
    document.getElementById("ev-end-time").value = editEvent.endTime || "";

    if (editEvent.recurring && editEvent.recurrence) {
      // Switch to recurring mode
      _evScheduleMode = "recurring";
      overlay.querySelectorAll(".ev-schedule-chips .ev-sched-chip").forEach((c) => c.classList.remove("active"));
      overlay.querySelector('.ev-schedule-chips .ev-sched-chip[data-value="recurring"]')?.classList.add("active");
      document.getElementById("ev-onetime-fields").classList.add("hide");
      document.getElementById("ev-recurring-fields").classList.remove("hide");
      _prefillRecurringFromPattern(editEvent.recurrence);
    } else {
      // One-time: pre-fill date
      document.getElementById("ev-date").value = editEvent.date || "";
    }
  }

  overlay.classList.remove("hide");
}

/** Pre-fill recurring form chips from a stored pattern string. */
function _prefillRecurringFromPattern(pattern) {
  const parsed = parsePattern(pattern);
  if (!parsed) return;

  _evFrequency = parsed.type === "monthly-date" || parsed.type === "monthly-day" ? "monthly" : parsed.type;

  // Activate frequency button
  document.querySelectorAll("#ev-freq-chips .ev-seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === _evFrequency);
  });

  if (parsed.days) {
    _evDaysOfWeek = new Set(parsed.days);
    _buildDayChips(".ev-day-ring:not(.ev-monthly-day-dow)", _evDaysOfWeek);
  }
  if (parsed.type === "monthly-date" && parsed.monthDates) {
    _evMonthlyType = "date";
    _evMonthDates = new Set(parsed.monthDates);
    _buildMonthDateChips();
  }
  if (parsed.type === "monthly-day") {
    _evMonthlyType = "day";
    if (parsed.ordinals) { _evOrdinals = new Set(parsed.ordinals); _buildOrdinalChips(); }
    if (parsed.days) { _evMonthlyDows = new Set(parsed.days); _buildDayChips(".ev-monthly-day-dow", _evMonthlyDows); }
    // Set monthly toggle to "day"
    _eventOverlay.querySelectorAll(".ev-mtog").forEach((c) => c.classList.remove("active"));
    _eventOverlay.querySelector('.ev-mtog[data-value="day"]')?.classList.add("active");
  }
  if (parsed.type === "biweekly" && parsed.anchor) {
    const anchorInput = document.getElementById("ev-anchor-date");
    if (anchorInput) anchorInput.value = parsed.anchor;
  }

  _syncRecurringFields();
}
document.getElementById("suggest-place-btn").addEventListener("click", () => {
  document.getElementById("suggest-form").reset();
  sgTypeSelect.classList.add("placeholder");
  clearPinLocation();
  renderSuggestTags();
  openSuggestOverlay();
});
// suggest-place-btn-empty is rendered dynamically, use delegation
document.getElementById("places-scroll").addEventListener("click", (e) => {
  if (e.target.closest("#suggest-place-btn-empty")) {
    document.getElementById("suggest-form").reset();
    sgTypeSelect.classList.add("placeholder");
    clearPinLocation();
    renderSuggestTags();
    openSuggestOverlay();
  }
});

/* ── Add Place from dropped pin ── */
const sgPinBadge = document.getElementById("sg-pin-badge");
const sgLatInput = document.getElementById("sg-lat");
const sgLngInput = document.getElementById("sg-lng");

const sgNameInput = document.getElementById("sg-name");
const sgGmapsInput = document.getElementById("sg-gmaps");
const sgNameReq = document.getElementById("sg-name-req");
const sgGmapsReq = document.getElementById("sg-gmaps-req");

function setPinLocation(lat, lng, address) {
  sgLatInput.value = lat;
  sgLngInput.value = lng;
  sgPinBadge.classList.remove("hide");
  if (address) document.getElementById("sg-address").value = address;
  // Pin mode: name required, gmaps optional
  sgNameInput.required = true;
  sgNameReq.classList.remove("hide");
  sgGmapsInput.required = false;
  sgGmapsReq.classList.add("hide");
}

function clearPinLocation() {
  sgLatInput.value = "";
  sgLngInput.value = "";
  sgPinBadge.classList.add("hide");
  // Default mode: gmaps required, name optional
  sgNameInput.required = false;
  sgNameReq.classList.add("hide");
  sgGmapsInput.required = true;
  sgGmapsReq.classList.remove("hide");
}

document.getElementById("sg-pin-clear").addEventListener("click", clearPinLocation);

window.addEventListener("hf:add-place-from-pin", (e) => {
  const { lat, lng, address } = e.detail;
  document.getElementById("suggest-form").reset();
  sgTypeSelect.classList.add("placeholder");
  renderSuggestTags();
  setPinLocation(lat, lng, address);
  openSuggestOverlay();
});

/* ── Floating tag tooltip ── */
const tagTip = document.createElement("div");
tagTip.className = "pl-tag-tip";
document.getElementById("app").appendChild(tagTip);
let tagTipTarget = null;

function showTagTip(el) {
  const raw = el.dataset.tags;
  if (!raw) return;
  tagTipTarget = el;
  const typeName = el.dataset.type || "";
  const typeColor = getComputedStyle(el).getPropertyValue("--type-c").trim() || "";
  const cfg = Object.values(PLACE_CONFIG).find(c => c.label === typeName);
  const iconSVG = cfg ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="${typeColor || "currentColor"}">${cfg.icon}</svg>` : "";
  tagTip.style.setProperty("--type-c", typeColor);
  try {
    const tags = JSON.parse(raw);
    const typeHTML = typeName ? `<div class="pl-tag-type">${iconSVG}${esc(typeName)}</div>` : "";
    const tagHTML = tags.length
      ? tags.map(t => `<span class="pl-tag-chip">${esc(t)}</span>`).join("")
      : '<span class="pl-tag-chip pl-tag-empty">No tags yet</span>';
    tagTip.innerHTML = typeHTML + `<div class="pl-tag-list">${tagHTML}</div>`;
  } catch { tagTip.textContent = raw; }
  tagTip.classList.add("show");
  const r = el.getBoundingClientRect();
  const tipW = tagTip.offsetWidth;
  let left = r.right - tipW;
  if (left < 8) left = 8;
  if (left + tipW > window.innerWidth - 8) left = window.innerWidth - 8 - tipW;
  const spaceBelow = window.innerHeight - r.bottom - 12;
  if (spaceBelow >= tagTip.offsetHeight + 6) {
    tagTip.style.top = `${r.bottom + 6}px`;
    tagTip.style.bottom = "";
  } else {
    tagTip.style.top = "";
    tagTip.style.bottom = `${window.innerHeight - r.top + 6}px`;
  }
  tagTip.style.left = `${left}px`;
}

function hideTagTip() {
  tagTipTarget = null;
  tagTip.classList.remove("show");
}

/* Tag tooltip: hover on desktop, tap-toggle on mobile (no mouseenter) */
const _hasHover = window.matchMedia("(hover: hover)").matches;
if (_hasHover) {
  document.getElementById("places-list").addEventListener("mouseenter", (e) => {
    const el = e.target.closest(".pl-tags-summary");
    if (el) showTagTip(el);
  }, true);
  document.getElementById("places-list").addEventListener("mouseleave", (e) => {
    const el = e.target.closest(".pl-tags-summary");
    if (el && el === tagTipTarget) hideTagTip();
  }, true);
}
document.getElementById("places-scroll").addEventListener("scroll", hideTagTip, { passive: true });

document.getElementById("places-list").addEventListener("click", (e) => {
  const cityToggle = e.target.closest(".pl-city-toggle");
  if (cityToggle) {
    e.stopPropagation();
    const cityHdr = cityToggle.closest(".pl-city-hdr[data-city-group]");
    if (!cityHdr) return;
    const city = cityHdr.dataset.cityGroup;
    const body = document.querySelector(`.pl-city-group-body[data-city-group-body="${CSS.escape(city)}"]`);
    if (!body) return;
    const scrollEl = document.getElementById("places-scroll");
    const prevScroll = scrollEl.scrollTop;
    const collapsed = collapsedCityGroups.has(city);
    if (collapsed) {
      // Inject lazy content while SHUT so grid knows its full target height
      // before the transition starts — prevents the instant-snap on expand
      if (body.dataset.lazy) {
        const list = body.querySelector(".pl-city-group-list");
        const group = _lastGroupedData.get(city);
        if (group && list) list.innerHTML = group.map((p, i) => _buildCard(p, i)).join("");
        delete body.dataset.lazy;
        // Force reflow so browser measures content at 0fr before transitioning to 1fr
        void body.offsetHeight;
      }
      collapsedCityGroups.delete(city);
      cityHdr.classList.remove("is-collapsed");
      body.classList.remove("shut");
    } else {
      collapsedCityGroups.add(city);
      cityHdr.classList.add("is-collapsed");
      body.classList.add("shut");
    }
    scrollEl.scrollTop = prevScroll;
    requestAnimationFrame(() => {
      placesSnap.softRemeasure();
      // Re-assert after softRemeasure's height:auto reflow, which can reset scrollTop on iOS
      scrollEl.scrollTop = prevScroll;
    });
    return;
  }

  // Toggle event drawer via the category dot (on event cards only)
  const dot = e.target.closest(".pl-card--has-events .pl-dot");
  if (dot) {
    e.stopPropagation();
    const card = dot.closest(".pl-card");
    const drawer = card?.querySelector(".pl-ev-drawer");
    if (!drawer) return;
    const expanded = drawer.classList.toggle("open");
    dot.setAttribute("aria-expanded", expanded);
    return;
  }

  // Prevent clicks inside event drawer body from opening the place popup
  // — but catch event card clicks to open the events overlay
  const evCard = e.target.closest(".pl-ev-body .pp-ev-card");
  if (evCard) {
    e.stopPropagation();
    const url = evCard.dataset.evUrl;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      _openEventsOverlayToEvent(evCard.dataset.evId);
    }
    return;
  }
  if (e.target.closest(".pl-ev-body")) {
    e.stopPropagation();
    return;
  }

  // Toggle tag tooltip on tap/click
  const tagEl = e.target.closest(".pl-tags-summary");
  if (tagEl) {
    e.stopPropagation();
    if (tagTipTarget === tagEl) { hideTagTip(); } else { showTagTip(tagEl); }
    return;
  }
  // Dismiss any open tag tooltip
  hideTagTip();

  // Quick directions from list card
  const dirBtn = e.target.closest(".pl-dir-btn");
  if (dirBtn) {
    e.stopPropagation();
    const { lat, lng, name } = dirBtn.dataset;
    dir.dest = { lat: +lat, lng: +lng, name };
    document.getElementById("dir-to").value = name;
    placeDestMarker(+lng, +lat);
    updateGoButton();
    closePlacesSheet();
    openDirPanel();
    return;
  }
  // Unsave a custom dropped pin
  const unsaveBtn = e.target.closest(".pl-unsave-pin-btn");
  if (unsaveBtn) {
    e.stopPropagation();
    removeSavedPin(unsaveBtn.dataset.pinId);
    addPlaceMarkers();
    renderPlacesList();
    return;
  }
  // Toggle favourite on a regular place
  const favBtn = e.target.closest(".pl-fav-btn");
  if (favBtn) {
    e.stopPropagation();
    const id = +favBtn.dataset.favId;
    toggleFavourite(id);
    const saved = isFavourite(id);
    favBtn.classList.toggle("active", saved);
    favBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${saved ? "currentColor" : "none"}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    if (activeTypeFilter === "saved" && !saved) { addPlaceMarkers(); renderPlacesList(); }
    return;
  }
  // Click on a custom dropped pin row — fly to and open its popup
  const pinLi = e.target.closest("li[data-custom-pin-id]");
  if (pinLi) {
    const pin = getSavedPins().find(p => p.id === pinLi.dataset.customPinId);
    if (pin) {
      runAfterPlacesSheetClose(() => {
        window.dispatchEvent(new CustomEvent("hf:show-search-marker", { detail: { lng: pin.lng, lat: pin.lat } }));
        map.flyTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
      });
    }
    return;
  }
  // Click on a regular place row
  const li = e.target.closest("li[data-place-id]");
  if (!li) return;
  const placeId = li.dataset.placeId;
  const place = placesData.find((p) => String(p.id) === placeId);
  if (place) openPlaceAfterSheetClose(place);
});

document.getElementById("suggest-close").addEventListener("click", () => {
  document.getElementById("suggest-overlay").classList.add("hide");
  clearPinLocation();
});
document.getElementById("suggest-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) { document.getElementById("suggest-overlay").classList.add("hide"); clearPinLocation(); }
});

const sgTypeSelect = document.getElementById("sg-type");
const sgTagsContainer = document.getElementById("sg-tags");

function renderSuggestTags() {
  const type = sgTypeSelect.value;
  const tagsSection = document.getElementById("sg-tags-section");
  if (!type) { tagsSection.style.display = "none"; sgTagsContainer.innerHTML = ""; return; }
  tagsSection.style.display = "";
  const tags = tagsData[type] || [];
  sgTagsContainer.innerHTML = tags
    .map((t) => {
      const subKey = `${type}_${t.id}`;
      const subtags = tagsData[subKey];
      if (subtags) {
        const isExclusive = EXCLUSIVE_GROUPS.has(t.id);
        const subChips = subtags.map((s) =>
          `<button type="button" class="sg-subtag" data-tag="${s.id}">${esc(s.label)}</button>`
        ).join("");
        const addRow = t.id === "cuisine" ? `<div class="sg-cuisine-add-row"><input type="text" class="sg-cuisine-input" placeholder="Add cuisine…" maxlength="40" /><button type="button" class="sg-cuisine-add-btn">Add</button></div>` : "";
        return (
          `<button type="button" class="sg-tag sg-tag-expand" data-expand="${t.id}">` +
          `<span class="sg-tag-label">${esc(t.label)}</span>` +
          `<svg class="sg-expand-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>` +
          `</button>` +
          `<div class="sg-subtags shut" data-parent="${t.id}"${isExclusive ? " data-exclusive" : ""}>` +
          `<div class="sg-subtags-inner">` +
          `<div class="sg-subtag-chips">${subChips}</div>` +
          addRow +
          `</div>` +
          `</div>`
        );
      }
      // Regular tri-state tag
      const posLabel = TAG_POS_LABELS[t.id] || t.label;
      const negLabel = TAG_NEG_LABELS[t.id] || t.negLabel || t.label;
      return (
        `<button type="button" class="sg-tag" data-tag="${t.id}" data-state="neutral" data-pos-label="${esc(posLabel)}" data-neg-label="${esc(negLabel)}">` +
        `<svg class="sg-tag-icon sg-yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` +
        `<svg class="sg-tag-icon sg-no" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>` +
        `<span class="sg-tag-label">${esc(posLabel)}</span></button>`
      );
    }).join("");
}

sgTypeSelect.addEventListener("change", renderSuggestTags);
sgTypeSelect.addEventListener("change", () => sgTypeSelect.classList.toggle("placeholder", !sgTypeSelect.value));
sgTypeSelect.classList.toggle("placeholder", !sgTypeSelect.value);
renderSuggestTags();

sgTagsContainer.addEventListener("click", (e) => {
  // Expand/collapse group (accordion: only one open at a time)
  const expandBtn = e.target.closest(".sg-tag-expand");
  if (expandBtn) {
    const parentId = expandBtn.dataset.expand;
    const panel = sgTagsContainer.querySelector(`.sg-subtags[data-parent="${parentId}"]`);
    if (panel) {
      const opening = panel.classList.contains("shut");
      if (opening) {
        sgTagsContainer.querySelectorAll(".sg-subtags:not(.shut)").forEach(other => {
          if (other === panel) return;
          other.classList.add("shut");
          const oid = other.dataset.parent;
          const otherBtn = sgTagsContainer.querySelector(`.sg-tag-expand[data-expand="${oid}"]`);
          if (otherBtn) otherBtn.classList.remove("open");
        });
      }
      panel.classList.toggle("shut");
      expandBtn.classList.toggle("open");
    }
    return;
  }
  // Toggle subtag selection
  const subtag = e.target.closest(".sg-subtag");
  if (subtag) {
    const panel = subtag.closest(".sg-subtags");
    if (panel?.hasAttribute("data-exclusive") && !subtag.classList.contains("active")) {
      panel.querySelectorAll(".sg-subtag.active").forEach(s => s.classList.remove("active"));
    }
    subtag.classList.toggle("active");
    return;
  }
  // Add custom cuisine
  const addBtn = e.target.closest(".sg-cuisine-add-btn");
  if (addBtn) {
    const row = addBtn.closest(".sg-cuisine-add-row");
    const input = row.querySelector(".sg-cuisine-input");
    const label = input.value.trim();
    if (!label) return;
    const id = "cuisine_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!id || id === "cuisine_") return;
    const chips = addBtn.closest(".sg-subtags").querySelector(".sg-subtag-chips");
    // Check by ID
    if (chips.querySelector(`[data-tag="${id}"]`)) {
      chips.querySelector(`[data-tag="${id}"]`).classList.add("active");
      input.value = "";
      return;
    }
    // Check by label (case-insensitive) against all existing chips
    const labelLower = label.toLowerCase();
    const existing = [...chips.querySelectorAll(".sg-subtag")].find(
      (c) => c.textContent.trim().toLowerCase() === labelLower
    );
    if (existing) {
      existing.classList.add("active");
      input.value = "";
      return;
    }
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sg-subtag active";
    chip.dataset.tag = id;
    chip.dataset.custom = "true";
    chip.dataset.label = label;
    chip.textContent = label;
    chips.appendChild(chip);
    input.value = "";
    return;
  }
  // Tri-state toggle for regular tags
  const btn = e.target.closest(".sg-tag");
  if (!btn) return;
  const states = ["neutral", "yes", "no"];
  const next = states[(states.indexOf(btn.dataset.state) + 1) % 3];
  btn.dataset.state = next;
  const labelEl = btn.querySelector(".sg-tag-label");
  if (labelEl) {
    labelEl.textContent = next === "no" ? (btn.dataset.negLabel || labelEl.textContent) : (btn.dataset.posLabel || labelEl.textContent);
  }
});

// Allow Enter key to add custom cuisine in suggest form
sgTagsContainer.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList.contains("sg-cuisine-input")) {
    e.preventDefault();
    const addBtn = e.target.closest(".sg-cuisine-add-row").querySelector(".sg-cuisine-add-btn");
    if (addBtn) addBtn.click();
  }
});

const suggestForm = document.getElementById("suggest-form");
suggestForm.querySelectorAll("[required]").forEach((el) => {
  el.addEventListener("input", () => el.classList.remove("invalid"));
  if (el.tagName === "SELECT") el.addEventListener("change", () => el.classList.remove("invalid"));
});
// Also listen on fields that toggle required dynamically
sgNameInput.addEventListener("input", () => sgNameInput.classList.remove("invalid"));
sgGmapsInput.addEventListener("input", () => sgGmapsInput.classList.remove("invalid"));

suggestForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  let hasEmpty = false;
  suggestForm.querySelectorAll("[required]").forEach((el) => {
    if (!el.value || !el.value.trim()) { el.classList.add("invalid"); hasEmpty = true; }
    else el.classList.remove("invalid");
  });
  if (hasEmpty) return;

  // Must have either a Google Maps link or pin coordinates
  const gmaps = document.getElementById("sg-gmaps").value.trim();
  const pinLat = sgLatInput.value.trim();
  const pinLng = sgLngInput.value.trim();
  if (!gmaps && !pinLat) {
    showToast("Location needed", "error", "Drop a pin or paste a Google Maps link.");
    return;
  }

  const submitBtn = document.getElementById("sg-submit");
  const btnOriginal = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Sending…</span>';

  const name = document.getElementById("sg-name").value.trim();
  const type = sgTypeSelect.value;
  const address = document.getElementById("sg-address").value.trim();
  const notes = document.getElementById("sg-notes").value.trim();

  const yesTags = [], noTags = [];
  sgTagsContainer.querySelectorAll(".sg-tag:not(.sg-tag-expand)").forEach((btn) => {
    const tagId = btn.dataset.tag;
    if (btn.dataset.state === "yes") yesTags.push(tagId);
    else if (btn.dataset.state === "no") noTags.push(tagId);
  });
  // Collect selected cuisine subtags
  sgTagsContainer.querySelectorAll(".sg-subtag.active").forEach((btn) => {
    yesTags.push(btn.dataset.tag);
  });
  const tagsStr = [...yesTags, ...noTags.map(t => "!" + t)].join(",");

  // Collect any user-added custom cuisines to persist to Tags sheet
  const newCuisines = [];
  sgTagsContainer.querySelectorAll('.sg-subtag.active[data-custom="true"]').forEach((btn) => {
    newCuisines.push({ id: btn.dataset.tag, label: btn.dataset.label });
  });

  // Build payload — include pin lat/lng when available
  const payload = { token: null, formType: "new", name, type, address, tags: tagsStr, gmaps, notes };
  if (newCuisines.length) payload.newCuisines = newCuisines;
  if (pinLat && pinLng) {
    payload.pinLat = parseFloat(pinLat);
    payload.pinLng = parseFloat(pinLng);
  }

  try {
    await loadRecaptcha(RECAPTCHA_SITE_KEY);
    const token = await new Promise((resolve) =>
      grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "suggest_place" }).then(resolve)),
    );
    payload.token = token;
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("suggest-form").reset();
      sgTypeSelect.classList.add("placeholder");
      clearPinLocation();
      renderSuggestTags();
      document.getElementById("suggest-overlay").classList.add("hide");
      setTimeout(() => showToast("Suggestion submitted", "check", "JazakAllah Khair!"), 200);
    } else {
      showToast("Submission failed", "error", data.error || "Please try again.");
    }
  } catch (err) {
    console.error("Suggest form error:", err);
    showToast("Submission failed", "error", "Check your connection.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = btnOriginal;
  }
});

const edTypeSelect = document.getElementById("ed-type");
const edTagsContainer = document.getElementById("ed-tags");

function renderEditTags(type, existingTags) {
  const tags = tagsData[type] || [];
  edTagsContainer.innerHTML = tags
    .map((t) => {
      const subKey = `${type}_${t.id}`;
      const subtags = tagsData[subKey];
      if (subtags) {
        const isExclusive = EXCLUSIVE_GROUPS.has(t.id);
        const hasAny = subtags.some((s) => existingTags?.[s.id] === true);
        const subChips = subtags.map((s) => {
          const isActive = existingTags?.[s.id] === true;
          return `<button type="button" class="sg-subtag${isActive ? " active" : ""}" data-tag="${s.id}">${esc(s.label)}</button>`;
        }).join("");
        const addRow = t.id === "cuisine" ? `<div class="sg-cuisine-add-row"><input type="text" class="sg-cuisine-input" placeholder="Add cuisine…" maxlength="40" /><button type="button" class="sg-cuisine-add-btn">Add</button></div>` : "";
        return (
          `<button type="button" class="sg-tag sg-tag-expand${hasAny ? " open" : ""}" data-expand="${t.id}">` +
          `<span class="sg-tag-label">${esc(t.label)}</span>` +
          `<svg class="sg-expand-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>` +
          `</button>` +
          `<div class="sg-subtags${hasAny ? "" : " shut"}" data-parent="${t.id}"${isExclusive ? " data-exclusive" : ""}>` +
          `<div class="sg-subtags-inner">` +
          `<div class="sg-subtag-chips">${subChips}</div>` +
          addRow +
          `</div>` +
          `</div>`
        );
      }
      // Regular tri-state tag
      const existingVal = existingTags?.[t.id];
      const state = existingVal === true ? "yes" : existingVal === false ? "no" : "neutral";
      const posLabel = TAG_POS_LABELS[t.id] || t.label;
      const negLabel = TAG_NEG_LABELS[t.id] || t.negLabel || t.label;
      const displayLabel = state === "no" ? negLabel : posLabel;
      return (
        `<button type="button" class="sg-tag" data-tag="${t.id}" data-state="${state}" data-pos-label="${esc(posLabel)}" data-neg-label="${esc(negLabel)}">` +
        `<svg class="sg-tag-icon sg-yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` +
        `<svg class="sg-tag-icon sg-no" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>` +
        `<span class="sg-tag-label">${esc(displayLabel)}</span></button>`
      );
    }).join("");
}

function openEditOverlay(place) {
  _editOriginalPlace = place;
  document.getElementById("ed-place-id").value = place.id;
  document.getElementById("ed-name").value = place.name || "";
  document.getElementById("ed-address").value = place.address || "";
  document.getElementById("ed-notes").value = place.notes || "";
  edTypeSelect.value = place.type || "mosque";
  renderEditTags(place.type, place.tags || {});
  document.getElementById("edit-overlay").classList.remove("hide");
}

edTypeSelect.addEventListener("change", () => renderEditTags(edTypeSelect.value, {}));

edTagsContainer.addEventListener("click", (e) => {
  // Expand/collapse group (accordion: only one open at a time)
  const expandBtn = e.target.closest(".sg-tag-expand");
  if (expandBtn) {
    const parentId = expandBtn.dataset.expand;
    const panel = edTagsContainer.querySelector(`.sg-subtags[data-parent="${parentId}"]`);
    if (panel) {
      const opening = panel.classList.contains("shut");
      if (opening) {
        edTagsContainer.querySelectorAll(".sg-subtags:not(.shut)").forEach(other => {
          if (other === panel) return;
          other.classList.add("shut");
          const oid = other.dataset.parent;
          const otherBtn = edTagsContainer.querySelector(`.sg-tag-expand[data-expand="${oid}"]`);
          if (otherBtn) otherBtn.classList.remove("open");
        });
      }
      panel.classList.toggle("shut");
      expandBtn.classList.toggle("open");
    }
    return;
  }
  // Toggle subtag selection
  const subtag = e.target.closest(".sg-subtag");
  if (subtag) {
    const panel = subtag.closest(".sg-subtags");
    if (panel?.hasAttribute("data-exclusive") && !subtag.classList.contains("active")) {
      panel.querySelectorAll(".sg-subtag.active").forEach(s => s.classList.remove("active"));
    }
    subtag.classList.toggle("active");
    return;
  }
  // Add custom cuisine
  const addBtn = e.target.closest(".sg-cuisine-add-btn");
  if (addBtn) {
    const row = addBtn.closest(".sg-cuisine-add-row");
    const input = row.querySelector(".sg-cuisine-input");
    const label = input.value.trim();
    if (!label) return;
    const id = "cuisine_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!id || id === "cuisine_") return;
    const chips = addBtn.closest(".sg-subtags").querySelector(".sg-subtag-chips");
    // Check by ID
    if (chips.querySelector(`[data-tag="${id}"]`)) {
      chips.querySelector(`[data-tag="${id}"]`).classList.add("active");
      input.value = "";
      return;
    }
    // Check by label (case-insensitive) against all existing chips
    const labelLower = label.toLowerCase();
    const existing = [...chips.querySelectorAll(".sg-subtag")].find(
      (c) => c.textContent.trim().toLowerCase() === labelLower
    );
    if (existing) {
      existing.classList.add("active");
      input.value = "";
      return;
    }
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sg-subtag active";
    chip.dataset.tag = id;
    chip.dataset.custom = "true";
    chip.dataset.label = label;
    chip.textContent = label;
    chips.appendChild(chip);
    input.value = "";
    return;
  }
  // Tri-state toggle for regular tags
  const btn = e.target.closest(".sg-tag");
  if (!btn) return;
  const states = ["neutral", "yes", "no"];
  const next = states[(states.indexOf(btn.dataset.state) + 1) % 3];
  btn.dataset.state = next;
  const labelEl = btn.querySelector(".sg-tag-label");
  if (labelEl) {
    labelEl.textContent = next === "no" ? (btn.dataset.negLabel || labelEl.textContent) : (btn.dataset.posLabel || labelEl.textContent);
  }
});

// Allow Enter key to add custom cuisine in edit form
edTagsContainer.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList.contains("sg-cuisine-input")) {
    e.preventDefault();
    const addBtn = e.target.closest(".sg-cuisine-add-row").querySelector(".sg-cuisine-add-btn");
    if (addBtn) addBtn.click();
  }
});

document.getElementById("edit-close").addEventListener("click", () => {
  document.getElementById("edit-overlay").classList.add("hide");
});
document.getElementById("edit-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) document.getElementById("edit-overlay").classList.add("hide");
});

document.getElementById("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const submitBtn = document.getElementById("ed-submit");
  const btnOriginal = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Sending…</span>';

  const placeId = document.getElementById("ed-place-id").value;
  const name = document.getElementById("ed-name").value.trim();
  const type = edTypeSelect.value;
  const address = document.getElementById("ed-address").value.trim();
  const notes = document.getElementById("ed-notes").value.trim();
  const gmaps = document.getElementById("ed-gmaps").value.trim();

  const yesTags = [], noTags = [];
  edTagsContainer.querySelectorAll(".sg-tag:not(.sg-tag-expand)").forEach((btn) => {
    const tagId = btn.dataset.tag;
    if (btn.dataset.state === "yes") yesTags.push(tagId);
    else if (btn.dataset.state === "no") noTags.push(tagId);
  });
  // Collect selected cuisine subtags
  edTagsContainer.querySelectorAll(".sg-subtag.active").forEach((btn) => {
    yesTags.push(btn.dataset.tag);
  });
  const tagsStr = [...yesTags, ...noTags.map(t => "!" + t)].join(",");

  // Collect any user-added custom cuisines to persist to Tags sheet
  const newCuisines = [];
  edTagsContainer.querySelectorAll('.sg-subtag.active[data-custom="true"]').forEach((btn) => {
    newCuisines.push({ id: btn.dataset.tag, label: btn.dataset.label });
  });

  const orig = _editOriginalPlace || {};
  const diffs = [];
  if (name && name !== orig.name) diffs.push(`Name: "${orig.name || ""}" → "${name}"`);
  if (type !== orig.type) {
    const oL = PLACE_CONFIG[orig.type]?.label || orig.type;
    const nL = PLACE_CONFIG[type]?.label || type;
    diffs.push(`Type: ${oL} → ${nL}`);
  }
  if (address && address !== orig.address) diffs.push(`Address: "${orig.address || ""}" → "${address}"`);
  if (gmaps) diffs.push("Maps link: added/updated");
  if (notes !== (orig.notes || "")) {
    if (!orig.notes && notes) diffs.push(`Notes added: "${notes}"`);
    else if (orig.notes && !notes) diffs.push("Notes removed");
    else if (notes) diffs.push(`Notes: "${orig.notes}" → "${notes}"`);
  }
  if (type === orig.type) {
    const tagDiffs = [];
    // Check regular tags
    (tagsData[type] || []).forEach((t) => {
      if (tagsData[`${type}_${t.id}`]) return; // skip expandable parents
      const origVal = orig.tags?.[t.id];
      const origState = origVal === true ? "yes" : origVal === false ? "no" : "neutral";
      const newState = yesTags.includes(t.id) ? "yes" : noTags.includes(t.id) ? "no" : "neutral";
      if (origState !== newState) {
        const icon = { yes: "✓ has", no: "✗ missing", neutral: "? unset" };
        tagDiffs.push(`${t.label}: ${icon[origState]} → ${icon[newState]}`);
      }
    });
    // Check subtag changes (cuisine, halal_status, etc.)
    const displayTags = getDisplayTags(type);
    const baseIds = new Set((tagsData[type] || []).map(t => t.id));
    const groupSubtags = displayTags.filter((t) => !baseIds.has(t.id));
    groupSubtags.forEach((t) => {
      const wasSet = orig.tags?.[t.id] === true;
      const isSet = yesTags.includes(t.id);
      if (wasSet && !isSet) tagDiffs.push(`${t.label}: removed`);
      else if (!wasSet && isSet) tagDiffs.push(`${t.label}: added`);
    });
    if (tagDiffs.length) diffs.push(`Tags: ${tagDiffs.join(" | ")}`);
  } else if (yesTags.length || noTags.length) {
    diffs.push(`Tags (new type): ${tagsStr}`);
  }
  const changesSummary = diffs.length ? diffs.join("\n") : "(no changes detected)";

  try {
    await loadRecaptcha(RECAPTCHA_SITE_KEY);
    const token = await new Promise((resolve) =>
      grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "edit_place" }).then(resolve)),
    );
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, formType: "edit", placeId, name, type, address, tags: tagsStr, gmaps, notes, changesSummary, newCuisines: newCuisines.length ? newCuisines : undefined }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("edit-overlay").classList.add("hide");
      setTimeout(() => showToast("Edit submitted", "check", "JazakAllah Khair!"), 200);
    } else {
      showToast("Submission failed", "error", data.error || "Please try again.");
    }
  } catch (err) {
    console.error("Edit form error:", err);
    showToast("Submission failed", "error", "Check your connection.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = btnOriginal;
  }
});

// ── Event Submission Form ────────────────────────────────────────────────────
const _eventOverlay = document.getElementById("event-overlay");
const _eventForm = document.getElementById("event-form");

document.getElementById("event-close").addEventListener("click", () => {
  _eventOverlay.classList.add("hide");
});
_eventOverlay.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) _eventOverlay.classList.add("hide");
});

// ── Schedule toggle: one-time vs recurring ───────────────────────────────────
let _evScheduleMode = "oneTime";

// Recurring form state
let _evFrequency = "";
let _evDaysOfWeek = new Set();
let _evMonthlyType = "date";
let _evMonthDates = new Set();
let _evOrdinals = new Set();
let _evMonthlyDows = new Set();

/** Build chip HTML for a list of options (single-select). */
function _buildChipSet(options, containerSelector, activeValue) {
  const el = _eventOverlay.querySelector(containerSelector);
  if (!el) return;
  el.innerHTML = options.map((o) =>
    `<button type="button" class="ev-sched-chip${o.value === String(activeValue) ? " active" : ""}" data-value="${o.value}">${esc(o.label)}</button>`
  ).join("");
}

/** Single-letter day initials for the compact circular picker. */
const _DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/** Populate the circular day-of-week buttons (multi-select via Set). */
function _buildDayChips(container, activeSet) {
  const el = typeof container === "string" ? _eventOverlay.querySelector(container) : container;
  if (!el) return;
  el.innerHTML = DAY_NAMES_SHORT.map((name, i) =>
    `<button type="button" class="ev-day-btn${activeSet.has(i) ? " active" : ""}" data-value="${i}" title="${esc(name)}">${_DAY_INITIALS[i]}</button>`
  ).join("");
}

/** Populate month-date buttons 1-31 in a 7-column grid (multi-select). */
function _buildMonthDateChips() {
  const el = _eventOverlay.querySelector(".ev-mdate-grid");
  if (!el) return;
  el.innerHTML = Array.from({ length: 31 }, (_, i) => i + 1).map((d) =>
    `<button type="button" class="ev-mdate-btn${_evMonthDates.has(d) ? " active" : ""}" data-value="${d}">${d}</button>`
  ).join("");
}

/** Populate ordinal pill buttons (multi-select via Set). */
function _buildOrdinalChips() {
  const el = _eventOverlay.querySelector(".ev-ord-row");
  if (!el) return;
  el.innerHTML = ORDINAL_OPTIONS.map((o) =>
    `<button type="button" class="ev-ord-btn${_evOrdinals.has(+o.value) ? " active" : ""}" data-value="${o.value}">${esc(o.label)}</button>`
  ).join("");
}

/** Update the recurrence preview text. */
function _updateRecurrencePreview() {
  const preview = document.getElementById("ev-recurrence-preview");
  if (!preview) return;
  if (!_evFrequency) { preview.classList.add("hide"); return; }
  const pattern = _buildCurrentPattern();
  if (!pattern) { preview.classList.add("hide"); return; }
  const label = formatRecurrence(pattern);
  const nd = nextOccurrence(pattern);
  const nextStr = nd ? ` · Next: ${nd.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" })}` : "";
  preview.textContent = label + nextStr;
  preview.classList.remove("hide");
}

/** Build the structured pattern from current form state. */
function _buildCurrentPattern() {
  switch (_evFrequency) {
    case "daily":
      return buildPattern("daily");
    case "weekly":
      return _evDaysOfWeek.size ? buildPattern("weekly", { days: [..._evDaysOfWeek] }) : null;
    case "biweekly": {
      const anchor = document.getElementById("ev-anchor-date")?.value || undefined;
      return _evDaysOfWeek.size ? buildPattern("biweekly", { days: [..._evDaysOfWeek], anchor }) : null;
    }
    case "monthly":
      if (_evMonthlyType === "date") {
        return _evMonthDates.size ? buildPattern("monthly", { monthlyType: "date", monthDates: [..._evMonthDates] }) : null;
      }
      return (_evOrdinals.size && _evMonthlyDows.size)
        ? buildPattern("monthly", { monthlyType: "day", ordinals: [..._evOrdinals], days: [..._evMonthlyDows] })
        : null;
    default:
      return null;
  }
}

/** Show/hide fields based on frequency. */
function _syncRecurringFields() {
  const dayPicker = document.getElementById("ev-day-picker");
  const monthlyOpts = document.getElementById("ev-monthly-opts");
  const biweeklyAnchor = document.getElementById("ev-biweekly-anchor");

  dayPicker?.classList.toggle("hide", !["weekly", "biweekly"].includes(_evFrequency));
  monthlyOpts?.classList.toggle("hide", _evFrequency !== "monthly");
  biweeklyAnchor?.classList.toggle("hide", _evFrequency !== "biweekly");

  // Monthly sub-fields
  const monthDatePicker = document.getElementById("ev-monthly-date-picker");
  const monthDayPicker = document.getElementById("ev-monthly-day-picker");
  if (_evFrequency === "monthly") {
    monthDatePicker?.classList.toggle("hide", _evMonthlyType !== "date");
    monthDayPicker?.classList.toggle("hide", _evMonthlyType !== "day");
  }

  _updateRecurrencePreview();
}

/** Initialize all recurring event form chips. */
function _initRecurringFormChips() {
  // Frequency segmented bar
  const freqContainer = document.getElementById("ev-freq-chips");
  if (freqContainer) {
    freqContainer.innerHTML = FREQUENCY_OPTIONS.map((o) =>
      `<button type="button" class="ev-seg-btn" data-value="${o.value}">${esc(o.label)}</button>`
    ).join("");
  }

  // Reset state
  _evFrequency = "";
  _evDaysOfWeek = new Set();
  _evMonthlyType = "date";
  _evMonthDates = new Set();
  _evOrdinals = new Set();
  _evMonthlyDows = new Set();

  // Day circles (weekly/biweekly)
  _buildDayChips(".ev-day-ring:not(.ev-monthly-day-dow)", _evDaysOfWeek);

  // Month date grid
  _buildMonthDateChips();

  // Ordinal pills
  _buildOrdinalChips();

  // Monthly day-of-week circles
  _buildDayChips(".ev-monthly-day-dow", _evMonthlyDows);

  // Reset monthly toggle
  _eventOverlay.querySelectorAll(".ev-mtog").forEach((c) => c.classList.remove("active"));
  _eventOverlay.querySelector('.ev-mtog[data-value="date"]')?.classList.add("active");
}

// Main schedule toggle (one-time / recurring)
_eventOverlay.querySelector(".ev-schedule-chips")?.addEventListener("click", (e) => {
  const chip = e.target.closest(".ev-sched-chip");
  if (!chip) return;
  _eventOverlay.querySelectorAll(".ev-schedule-chips .ev-sched-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  _evScheduleMode = chip.dataset.value;
  const isRecurring = _evScheduleMode === "recurring";
  document.getElementById("ev-onetime-fields").classList.toggle("hide", isRecurring);
  document.getElementById("ev-recurring-fields").classList.toggle("hide", !isRecurring);
});

// Frequency segmented bar clicks
document.getElementById("ev-freq-chips")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-seg-btn");
  if (!btn) return;
  document.querySelectorAll("#ev-freq-chips .ev-seg-btn").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  _evFrequency = btn.dataset.value;
  _syncRecurringFields();
});

// Day-of-week circular buttons (weekly/biweekly) — toggle multi-select
document.getElementById("ev-day-picker")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-day-btn");
  if (!btn) return;
  const val = +btn.dataset.value;
  if (_evDaysOfWeek.has(val)) {
    _evDaysOfWeek.delete(val);
    btn.classList.remove("active");
  } else {
    _evDaysOfWeek.add(val);
    btn.classList.add("active");
  }
  _updateRecurrencePreview();
});

// Monthly toggle (Date / Day)
_eventOverlay.querySelector(".ev-monthly-toggle")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-mtog");
  if (!btn) return;
  _eventOverlay.querySelectorAll(".ev-mtog").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  _evMonthlyType = btn.dataset.value;
  _syncRecurringFields();
});

// Month date grid buttons (1-31) — toggle multi-select
_eventOverlay.querySelector(".ev-mdate-grid")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-mdate-btn");
  if (!btn) return;
  const val = +btn.dataset.value;
  if (_evMonthDates.has(val)) {
    _evMonthDates.delete(val);
    btn.classList.remove("active");
  } else {
    _evMonthDates.add(val);
    btn.classList.add("active");
  }
  _updateRecurrencePreview();
});

// Ordinal pill buttons (1st, 2nd, …, Last) — toggle multi-select
_eventOverlay.querySelector(".ev-ord-row")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-ord-btn");
  if (!btn) return;
  const val = +btn.dataset.value;
  if (_evOrdinals.has(val)) {
    _evOrdinals.delete(val);
    btn.classList.remove("active");
  } else {
    _evOrdinals.add(val);
    btn.classList.add("active");
  }
  _updateRecurrencePreview();
});

// Monthly day-of-week circular buttons — toggle multi-select
_eventOverlay.querySelector(".ev-monthly-day-dow")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-day-btn");
  if (!btn) return;
  const val = +btn.dataset.value;
  if (_evMonthlyDows.has(val)) {
    _evMonthlyDows.delete(val);
    btn.classList.remove("active");
  } else {
    _evMonthlyDows.add(val);
    btn.classList.add("active");
  }
  _updateRecurrencePreview();
});

// Biweekly anchor date change
document.getElementById("ev-anchor-date")?.addEventListener("change", () => _updateRecurrencePreview());

// ── Form submission ──────────────────────────────────────────────────────────
_eventForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mosqueSelect = document.getElementById("ev-mosque");
  const titleInput = document.getElementById("ev-title");
  const placeId = mosqueSelect.value;
  const title = titleInput.value.trim();

  // Validate required
  let valid = true;
  if (!placeId) { mosqueSelect.classList.add("invalid"); valid = false; }
  if (!title) { titleInput.classList.add("invalid"); valid = false; }

  const isRecurring = _evScheduleMode === "recurring";

  // One-time: date is mandatory
  const dateInput = document.getElementById("ev-date");
  if (!isRecurring && !dateInput.value) {
    dateInput.classList.add("invalid");
    valid = false;
  }

  // Recurring: must have a valid frequency selected
  if (isRecurring) {
    if (!_evFrequency) {
      showToast("Select a frequency", "error");
      valid = false;
    } else if (["weekly", "biweekly"].includes(_evFrequency) && !_evDaysOfWeek.size) {
      showToast("Select at least one day", "error");
      valid = false;
    } else if (_evFrequency === "monthly" && _evMonthlyType === "date" && !_evMonthDates.size) {
      showToast("Select at least one date", "error");
      valid = false;
    } else if (_evFrequency === "monthly" && _evMonthlyType === "day" && (!_evOrdinals.size || !_evMonthlyDows.size)) {
      showToast("Select which week and day", "error");
      valid = false;
    }
  }

  if (!valid) return;

  const submitBtn = document.getElementById("ev-submit");
  const btnOriginal = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="btn-spinner"></span>`;

  const recurrencePattern = isRecurring ? (_buildCurrentPattern() || "") : "";

  // Build changes summary for edit mode
  let changesSummary = "";
  if (_eventEditMode && _eventEditOriginal) {
    const orig = _eventEditOriginal;
    const diffs = [];
    if (title !== (orig.title || "")) diffs.push(`Title: "${orig.title || ""}" → "${title}"`);
    if (placeId !== (orig.placeId || "")) diffs.push(`Mosque changed`);
    const newDesc = document.getElementById("ev-desc").value.trim();
    if (newDesc !== (orig.description || "")) diffs.push(newDesc ? `Description updated` : `Description removed`);
    const newDate = isRecurring ? "" : dateInput.value;
    if (newDate !== (orig.date || "")) diffs.push(`Date: "${orig.date || ""}" → "${newDate}"`);
    const newTime = document.getElementById("ev-time").value;
    if (newTime !== (orig.time || "")) diffs.push(`Time: "${orig.time || ""}" → "${newTime}"`);
    const newEndTime = document.getElementById("ev-end-time").value;
    if (newEndTime !== (orig.endTime || "")) diffs.push(`End time: "${orig.endTime || ""}" → "${newEndTime}"`);
    const wasRecurring = !!orig.recurring;
    if (isRecurring !== wasRecurring) diffs.push(`Schedule: ${wasRecurring ? "recurring" : "one-time"} → ${isRecurring ? "recurring" : "one-time"}`);
    if (isRecurring && recurrencePattern !== (orig.recurrence || "")) diffs.push(`Recurrence pattern changed`);
    const newUrl = document.getElementById("ev-url").value.trim();
    if (newUrl !== (orig.url || "")) diffs.push(newUrl ? `URL updated` : `URL removed`);
    changesSummary = diffs.length ? diffs.join("\n") : "(no changes detected)";
  }

  const isEditMode = _eventEditMode && _eventEditOriginal;
  const payload = {
    token: null,
    formType: isEditMode ? "event-edit" : "event",
    placeId,
    title,
    description: document.getElementById("ev-desc").value.trim(),
    eventDate: isRecurring ? "" : dateInput.value,
    eventTime: document.getElementById("ev-time").value,
    endTime: document.getElementById("ev-end-time").value,
    recurring: isRecurring,
    recurrencePattern,
    url: document.getElementById("ev-url").value.trim(),
  };
  if (isEditMode) {
    payload.eventId = _eventEditOriginal.id;
    payload.changesSummary = changesSummary;
  }

  try {
    await loadRecaptcha(RECAPTCHA_SITE_KEY);
    const token = await new Promise((resolve) =>
      grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: isEditMode ? "edit_event" : "submit_event" }).then(resolve)),
    );
    payload.token = token;
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      _eventForm.reset();
      _eventEditMode = false;
      _eventEditOriginal = null;
      _eventOverlay.classList.add("hide");
      const msg = isEditMode ? "Edit suggestion submitted" : "Event submitted";
      setTimeout(() => showToast(msg, "check", "It will appear after review."), 200);
    } else {
      showToast("Submission failed", "error", data.error || "Please try again.");
    }
  } catch (err) {
    console.error("Event form error:", err);
    showToast("Submission failed", "error", "Check your connection.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = btnOriginal;
  }
});

// Clear invalid state on input
_eventForm.querySelectorAll("input, select, textarea").forEach((el) => {
  el.addEventListener("input", () => el.classList.remove("invalid"));
  if (el.tagName === "SELECT") el.addEventListener("change", () => el.classList.remove("invalid"));
});
