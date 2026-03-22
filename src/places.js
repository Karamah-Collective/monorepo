import { map, scheduleMapViewportSync } from "./map-init.js";
import { PLACE_CONFIG, makePlaceMarkerHTML, getThemeRailShopPurple } from "./icons.js";
import { esc, escA, copyToClipboard, showToast, hideLoadingToast, buildShareUrl, shareUrl, encryptToken, decryptToken, _decodeLegacyToken, decodeCompactRoute, decodeCompactPin, initSheetDrag, animateSheetHeight, getSavedPins, removeSavedPin, haversineDistance, loadRecaptcha, fadeAndRemovePopup, requestLocation, getHomeLocation, getCurrentLocationState } from "./utils.js";
import { RECAPTCHA_SITE_KEY, isInsideFinland } from "./config.js";
import { setActiveTab, refreshHeatmapSource, isHeatmapActive, syncHomeMarker } from "./map-controls.js";
import { dir, placeDestMarker, updateGoButton, openDirPanel, stopPick, loadSharedRoute } from "./directions.js";

export let placesData = [];
export let tagsData = {};
export let placesLoaded = false;
let placeMarkers = [];
let savedPinMarkers = [];
let _activePlacePopupId = null;
let _activePlacePopup = null;
export let activeTypeFilter = "all";
export let activeTagFilters = new Set();
let activeSortField = "default"; // "default" | "name" | "distance" | "date"
let activeSortDir = "asc";       // "asc" | "desc"
let userSortLat = null;
let userSortLng = null;
const collapsedCityGroups = new Set();
let _lastGroupedData = new Map();
let _editOriginalPlace = null;
let _lastSubmit = 0;
const SUBMIT_COOLDOWN = 60000; // 60 s between submissions

function clearActivePlacePopup() {
  if (_activePlacePopup) {
    try { _activePlacePopup.remove(); } catch (_) {}
    _activePlacePopup = null;
  }
  _activePlacePopupId = null;
  document.querySelectorAll(".place-popup-wrap.maplibregl-popup").forEach((p) => p.remove());
}

let _sheetCloseRAF1 = 0;
let _sheetCloseRAF2 = 0;
let _mobilePlaceFocusLocked = false;
let _mobilePlaceFocusUnlockTimer = 0;

function isPhoneViewport() {
  return window.innerWidth <= 768;
}

function lockMobilePlaceFocus() {
  if (!isPhoneViewport()) return true;
  if (_mobilePlaceFocusLocked) return false;
  _mobilePlaceFocusLocked = true;
  clearTimeout(_mobilePlaceFocusUnlockTimer);
  _mobilePlaceFocusUnlockTimer = setTimeout(() => {
    _mobilePlaceFocusLocked = false;
    _mobilePlaceFocusUnlockTimer = 0;
  }, 450);
  return true;
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
  const aCity = getPlaceCity(a);
  const bCity = getPlaceCity(b);

  if (anchor) {
    const aDist = cityDistances.get(aCity) ?? Number.POSITIVE_INFINITY;
    const bDist = cityDistances.get(bCity) ?? Number.POSITIVE_INFINITY;
    if (aDist !== bDist) return aDist - bDist;

    const itemDistA = haversineDistance(anchor.lat, anchor.lng, a.lat, a.lng);
    const itemDistB = haversineDistance(anchor.lat, anchor.lng, b.lat, b.lng);
    if (itemDistA !== itemDistB) return itemDistA - itemDistB;
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
async function tryGetUserLocation() {
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

function _buildCard(p, i) {
  const cfg = PLACE_CONFIG[p.type] || PLACE_CONFIG.mosque;
  const cssColor = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)" }[p.type] || cfg.color;
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
  return `<li class="pl-card${p.boycott ? " pl-card--boycott" : ""}" data-idx="${i}" data-place-id="${p.id}" style="--place-c:${cssColor};--i:${i}">
    <span class="pl-dot" style="background:${cssColor}"><svg viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg></span>
    <span class="pl-name">${esc(p.name)}${boycottBadge}</span>
    <span class="pl-addr">${esc(p.address)}${distBadge}</span>
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

async function fetchFresh() {
  const urls = ['/api/places?action=all'];
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
      placesData = normalizePlacesData(cached.places);
      tagsData = cached.tags || {};
      placesLoaded = true;
      hideLoadingToast();
      addPlaceMarkers();
      renderPlacesList();
      updatePlacesBadge();
      checkShareUrl();
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
          addPlaceMarkers();
          renderPlacesList();
          updatePlacesBadge();
        }
        writeCache(normalizePlacesData(data.places), data.tags || {});
      });
      return;
    }

    // 3. First visit — load bundled static JSON instantly (served from CF CDN edge)
    try {
      const [pRes, tRes] = await Promise.all([fetch('data/places.json'), fetch('data/tags.json')]);
      if (pRes.ok && tRes.ok) {
        placesData = normalizePlacesData(await pRes.json());
        tagsData = await tRes.json();
        console.log(`[Places] First-visit instant load: ${placesData.length} places from static JSON`);
      }
    } catch { /* static files missing — fall through */ }

    placesLoaded = true;
    hideLoadingToast();
    addPlaceMarkers();
    renderPlacesList();
    updatePlacesBadge();
    checkShareUrl();

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
        addPlaceMarkers();  // Full refresh removes old + adds new
        renderPlacesList();
        updatePlacesBadge();
      }
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
    if (el) {
      el.style.visibility = shouldHide ? "hidden" : "visible";
      el.style.pointerEvents = shouldHide ? "none" : "auto";
    }
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
      "circle-color": "#1A73B8",
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
      "circle-color": "#1A73B8",
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
        "#1A73B8",
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
    el.className = "place-mk-wrap";
    el.innerHTML = makePlaceMarkerHTML(place.type);
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
    el.className = "place-mk-wrap";
    el.innerHTML = `<div class="custom-mk"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg></div>`;
    el.dataset.pinId = pin.id;
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([pin.lng, pin.lat]).addTo(map);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("hf:show-search-marker", { detail: { lng: pin.lng, lat: pin.lat } }));
    });
    savedPinMarkers.push(marker);
  });

  updateMarkerVisibility();
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

export function showPlacePopup(place) {
  trackRecentlyViewed(place.id);
  const cfg = PLACE_CONFIG[place.type] || PLACE_CONFIG.mosque;
  const cssColor = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)" }[place.type] || cfg.color;
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
    `<span class="pp-badge" style="background:color-mix(in srgb, ${cssColor} 12%, transparent);color:${cssColor}">${cfg.label}</span>`;
  inner.appendChild(hdr);

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
      `<span>On the boycott list for supporting genocide in Gaza</span>`;
    inner.appendChild(callout);
  }

  if (place.notes) {
    const notes = document.createElement("div");
    notes.className = "pp-notes";
    notes.textContent = place.notes;
    inner.appendChild(notes);
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

  map.stop();
  const targetZoom = Math.max(map.getZoom(), 15);
  if (isPhoneViewport()) {
    map.jumpTo({ center: [place.lng, place.lat], zoom: targetZoom });
    scheduleMapViewportSync();
    return;
  }
  map.flyTo({ center: [place.lng, place.lat], zoom: targetZoom, duration: 600 });
}

function openPlaceAfterSheetClose(place) {
  if (!lockMobilePlaceFocus()) return;
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
  placesSheet.classList.add("shut");
  placesSnap.close();                            // nuclear: cancels rAF, wipes all inline styles
  placesSheet.hidden = true;
  scrim.classList.add("hide");
  setActiveTab(null);
  scheduleMapViewportSync();
}

document.getElementById("places-btn").addEventListener("click", () =>
  placesSheet.classList.contains("shut") ? openPlacesSheet() : closePlacesSheet(),
);
document.getElementById("places-close").addEventListener("click", closePlacesSheet);

const placesSnap = initSheetDrag(placesSheet, closePlacesSheet);

let _placesDirty = false;

function refreshDefaultPlacesSort() {
  if (activeSortField !== "default") return;
  if (!placesSheet.classList.contains("shut")) {
    _placesDirty = true;
    return;
  }
  _placesDirty = false;
}

window.addEventListener("hf:home-updated", refreshDefaultPlacesSort);
window.addEventListener("hf:current-location-updated", refreshDefaultPlacesSort);

document.getElementById("places-type-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".pf-chip");
  if (!chip) return;
  document.querySelectorAll(".pf-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  activeTypeFilter = chip.dataset.type;
  activeTagFilters.clear();
  renderTagFilterBar();
  document.getElementById("places-scroll").scrollTop = 0;
  animateSheetHeight(placesSheet, () => renderPlacesList());
  placesSnap.softRemeasure();
  // Defer heavy marker rebuild so the list appears instantly
  requestAnimationFrame(() => addPlaceMarkers());
});

const tfToggle = document.getElementById("tf-toggle");
const tfChips = document.getElementById("tag-filter-chips");
const tfCount = document.getElementById("tf-count");
const sortToggle = document.getElementById("sort-toggle");
const sortDropdown = document.getElementById("sort-dropdown");
const sortLabel = document.getElementById("sort-label");
const placesClearBtn = document.getElementById("places-clear-filters");

function updateClearButton() {
  const dirty = activeTypeFilter !== "all" || activeTagFilters.size > 0 || activeSortField !== "default";
  placesClearBtn.classList.toggle("hide", !dirty);
}

placesClearBtn.addEventListener("click", () => {
  activeTypeFilter = "all";
  document.querySelectorAll(".pf-chip").forEach((c) => c.classList.toggle("active", c.dataset.type === "all"));
  activeTagFilters.clear();
  activeSortField = "default";
  activeSortDir = "asc";
  updateSortButton();
  renderTagFilterBar();
  addPlaceMarkers();
  document.getElementById("places-scroll").scrollTop = 0;
  animateSheetHeight(placesSheet, () => renderPlacesList());
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

function positionSortDropdown() {
  const r = sortToggle.getBoundingClientRect();
  const spaceBelow = window.innerHeight - r.bottom - 12;
  const dh = sortDropdown.offsetHeight || 200;
  if (spaceBelow >= dh) {
    sortDropdown.style.top = `${r.bottom + 6}px`;
    sortDropdown.style.bottom = "";
  } else {
    sortDropdown.style.bottom = `${window.innerHeight - r.top + 6}px`;
    sortDropdown.style.top = "";
  }
  sortDropdown.style.left = `${r.left}px`;
}

sortToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = !sortDropdown.classList.contains("shut");
  if (!isOpen) positionSortDropdown();
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
        requestLocation().then((pos) => {
          userSortLat = pos.coords.latitude;
          userSortLng = pos.coords.longitude;
          userLocLat = pos.coords.latitude;
          userLocLng = pos.coords.longitude;
          activeSortField = "distance";
          updateSortButton();
          animateSheetHeight(placesSheet, () => renderPlacesList());
        }).catch((e) => {
          showToast("Location is off", "loc", e.message);
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
    activeTypeFilter === "all" ? placesData : placesData.filter((p) => p.type === activeTypeFilter);
  const count = typePlaces.length;
  const items = (activeTypeFilter !== "all" && activeTypeFilter !== "saved") ? getFilterBarTags(activeTypeFilter) : [];
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
  el.style.height = from + "px";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.height = to + "px";
      if (onDone) {
        const done = (e) => {
          if (e.propertyName !== "height" || e.target !== el) return;
          el.removeEventListener("transitionend", done);
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
  animateSheetHeight(placesSheet, () => renderPlacesList());
  placesSnap.softRemeasure();                    // update drag cap for filtered content
  updateClearButton();
});

function renderPlacesList() {
  const list = document.getElementById("places-list");
  const empty = document.getElementById("places-empty");
  const ct = document.getElementById("places-ct");

  let filtered =
    activeTypeFilter === "all"
      ? placesData
      : activeTypeFilter === "saved"
        ? placesData.filter((p) => isFavourite(p.id))
        : placesData.filter((p) => p.type === activeTypeFilter);

  if (activeTagFilters.size) {
    filtered = filtered.filter((p) =>
      [...activeTagFilters].every((tagId) => p.tags?.[tagId] === true),
    );
  }

  const sorted = applySort(filtered);
  const customPins = activeTypeFilter === "saved" ? getSavedPins() : [];
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

  // Recently viewed section (skip on saved tab)
  let recentHtml = "";
  if (activeTypeFilter !== "saved" && recentIds.length) {
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
}

function openSuggestOverlay() { document.getElementById("suggest-overlay").classList.remove("hide"); }
document.getElementById("suggest-place-btn").addEventListener("click", () => {
  document.getElementById("suggest-form").reset();
  clearPinLocation();
  renderSuggestTags();
  openSuggestOverlay();
});
// suggest-place-btn-empty is rendered dynamically, use delegation
document.getElementById("places-scroll").addEventListener("click", (e) => {
  if (e.target.closest("#suggest-place-btn-empty")) {
    document.getElementById("suggest-form").reset();
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
  renderSuggestTags();
  setPinLocation(lat, lng, address);
  openSuggestOverlay();
});

/* ── Floating tag tooltip ── */
const tagTip = document.createElement("div");
tagTip.className = "pl-tag-tip";
document.getElementById("places-sheet").appendChild(tagTip);
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

  if (Date.now() - _lastSubmit < SUBMIT_COOLDOWN) {
    showToast("Please wait", "error", "You can submit again in a minute.");
    return;
  }

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
      _lastSubmit = Date.now();
      document.getElementById("suggest-form").reset();
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

  if (Date.now() - _lastSubmit < SUBMIT_COOLDOWN) {
    showToast("Please wait", "error", "You can submit again in a minute.");
    return;
  }

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
      _lastSubmit = Date.now();
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
