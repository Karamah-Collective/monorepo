import { map } from "./map-init.js";
import { PLACE_CONFIG, makePlaceMarkerHTML } from "./icons.js";
import { esc, escA, copyToClipboard, showToast, hideLoadingToast, buildShareUrl, encryptToken, decryptToken, _decodeLegacyToken, initSheetDrag, getSavedPins, removeSavedPin, haversineDistance, loadRecaptcha } from "./utils.js";
import { RECAPTCHA_SITE_KEY, SHEETS_URL } from "./config.js";
import { setActiveTab, refreshHeatmapSource, isHeatmapActive } from "./map-controls.js";
import { dir, placeDestMarker, updateGoButton, openDirPanel, stopPick } from "./directions.js";

export let placesData = [];
export let tagsData = {};
export let placesLoaded = false;
let placeMarkers = [];
let savedPinMarkers = [];
export let activeTypeFilter = "all";
export let activeTagFilters = new Set();
let activeSortField = "default"; // "default" | "name" | "distance" | "date"
let activeSortDir = "asc";       // "asc" | "desc"
let userSortLat = null;
let userSortLng = null;
let _editOriginalPlace = null;

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

const SORT_FIELD_LABELS = { name: "Name", distance: "Distance", date: "Date" };

function applySort(arr) {
  if (activeSortField === "default") return [...arr].sort((x, y) => x.name.localeCompare(y.name));
  const a = [...arr];
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
function tryGetUserLocation() {
  if (userLocLat !== null || !navigator.geolocation) return;
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
  if (SHEETS_URL) urls.push(`${SHEETS_URL}?action=all`);
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
      placesData = cached.places;
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
          placesData = data.places;
          tagsData = data.tags || {};
          addPlaceMarkers();
          renderPlacesList();
          updatePlacesBadge();
        }
        writeCache(data.places, data.tags || {});
      });
      return;
    }

    // 3. First visit — load bundled static JSON instantly (served from CF CDN edge)
    try {
      const [pRes, tRes] = await Promise.all([fetch('data/places.json'), fetch('data/tags.json')]);
      if (pRes.ok && tRes.ok) {
        placesData = await pRes.json();
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
        placesData = data.places;
        tagsData = data.tags || {};
        addPlaceMarkers();  // Full refresh removes old + adds new
        renderPlacesList();
        updatePlacesBadge();
      }
      writeCache(data.places, data.tags || {});
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
        "shop",        "#8C4799",
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

  // Unclustered dot click → open place popup
  map.on("click", "places-unclustered", (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const place = placesData.find((p) => p.id === feature.properties.id);
    if (place) showPlacePopup(place);
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
    el.addEventListener("click", (e) => { e.stopPropagation(); showPlacePopup(place); });
    placeMarkers.push(marker);
  });

  // Show saved custom pins as map markers when on the saved tab
  if (activeTypeFilter === "saved") {
    getSavedPins().forEach((pin) => {
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
  }

  updateMarkerVisibility();
  refreshHeatmapSource();
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
  const typeTags = getDisplayTags(place.type);

  const root = document.createElement("div");
  root.className = "pp";
  root.style.setProperty("--pc", cfg.color);

  const head = document.createElement("div");
  head.className = "pp-head";
  const _isFavHead = isFavourite(place.id);
  const _starSVGHead = (filled) =>
    `<svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${filled ? "currentColor" : "none"}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  head.innerHTML =
    `<span class="pp-type-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg></span>` +
    `<div class="pp-title">${esc(place.name)}</div>` +
    `<div class="pp-sub">${cfg.label}</div>` +
    `<button class="pp-fav-btn${_isFavHead ? " active" : ""}" aria-label="${_isFavHead ? "Remove from saved" : "Save place"}">${_starSVGHead(_isFavHead)}</button>`;

  const headFavBtn = head.querySelector(".pp-fav-btn");
  headFavBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavourite(place.id);
    const saved = isFavourite(place.id);
    headFavBtn.classList.toggle("active", saved);
    headFavBtn.setAttribute("aria-label", saved ? "Remove from saved" : "Save place");
    headFavBtn.innerHTML = _starSVGHead(saved);
    const listBtn = document.querySelector(`.pl-fav-btn[data-fav-id="${place.id}"]`);
    if (listBtn) {
      listBtn.classList.toggle("active", saved);
      listBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${saved ? "currentColor" : "none"}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    }
    if (activeTypeFilter === "saved" && !saved) { addPlaceMarkers(); renderPlacesList(); }
  });
  root.appendChild(head);

  const body = document.createElement("div");
  body.className = "pp-body";

  const addr = document.createElement("div");
  addr.className = "pp-addr";
  addr.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(place.address)}`;
  body.appendChild(addr);

  if (typeTags.length) {
    const chips = typeTags
      .filter((tag) => place.tags?.[tag.id] !== undefined)
      .map((tag) => {
        const val = place.tags[tag.id];
        const cls = val === true ? "pp-chip-yes" : "pp-chip-no";
        const icon = val === true
          ? `<svg class="pp-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
          : `<svg class="pp-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
        const label = val === true
          ? (TAG_POS_LABELS[tag.id] || tag.label)
          : (TAG_NEG_LABELS[tag.id] || tag.negLabel || tag.label);
        return `<span class="pp-chip ${cls}">${icon}${esc(label)}</span>`;
      })
      .join("");
    if (chips) {
      const tagsEl = document.createElement("div");
      tagsEl.className = "pp-tags";
      tagsEl.innerHTML = chips;
      body.appendChild(tagsEl);
    }
  }

  if (place.notes) {
    const notes = document.createElement("div");
    notes.className = "pp-notes";
    notes.textContent = place.notes;
    body.appendChild(notes);
  }

  const actions = document.createElement("div");
  actions.className = "pp-actions";

  const dirBtn = document.createElement("button");
  dirBtn.className = "pp-dir-btn";
  dirBtn.title = "Get directions";
  dirBtn.setAttribute("aria-label", "Get directions");
  dirBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>`;
  dirBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dir.dest = { lat: place.lat, lng: place.lng, name: place.name };
    document.getElementById("dir-to").value = place.name;
    placeDestMarker(place.lng, place.lat);
    updateGoButton();
    popup.remove();
    document.getElementById("places-sheet").classList.add("shut");
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
    const url = buildShareUrl(place);
    if (navigator.share) {
      navigator.share({ title: place.name, text: `${place.name} – Halal Finder Helsinki`, url })
        .catch((err) => { if (err?.name !== "AbortError") { copyToClipboard(url); showToast("Link copied"); } });
    } else {
      copyToClipboard(url);
      showToast("Link copied");
    }
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
  body.appendChild(actions);
  root.appendChild(body);

  document.querySelectorAll(".maplibregl-popup").forEach((p) => p.remove());

  const popup = new maplibregl.Popup({ offset: [0, -42], closeButton: false, maxWidth: "300px", className: "place-popup-wrap" })
    .setLngLat([place.lng, place.lat])
    .setDOMContent(root)
    .addTo(map);

  map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
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
    if (!isNaN(la) && !isNaN(lo)) {
      map.flyTo({ center: [lo, la], zoom: z, speed: 1.4 });
      map.once("moveend", () => {
        window.dispatchEvent(new CustomEvent("hf:show-search-marker", { detail: { lng: lo, lat: la } }));
      });
    }
    history.replaceState(null, "", location.pathname);
    return;
  }

  // Legacy: ?p=<token> (encrypted share link)
  if (!placeToken && !mapView) {
    placeToken = params.get("p") || null;
  }

  if (mapView && !placeToken) {
    map.jumpTo({ center: [mapView.lng, mapView.lat], zoom: mapView.zoom });
    // Clear hash so the view isn't re-applied on refresh
    history.replaceState(null, "", location.pathname + location.search);
    return;
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
  document.getElementById("dir-panel").classList.add("shut");
  stopPick();
  placesSheet.style.height = "";
  scrim.classList.remove("hide");
  setActiveTab("places-btn");
  tryGetUserLocation();
  renderTagFilterBar();
  renderPlacesList();
  placesSnap.open();                           // measure content → set initial snap height → reveal
}

export function closePlacesSheet() {
  placesSheet.classList.add("shut");
  placesSnap.close();
  scrim.classList.add("hide");
  setActiveTab(null);
}

document.getElementById("places-btn").addEventListener("click", () =>
  placesSheet.classList.contains("shut") ? openPlacesSheet() : closePlacesSheet(),
);
document.getElementById("places-close").addEventListener("click", closePlacesSheet);

const placesSnap = initSheetDrag(placesSheet, closePlacesSheet);

document.getElementById("places-type-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".pf-chip");
  if (!chip) return;
  document.querySelectorAll(".pf-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  activeTypeFilter = chip.dataset.type;
  activeTagFilters.clear();
  renderTagFilterBar();
  addPlaceMarkers();
  renderPlacesList();
  placesSnap.softRemeasure();                    // update drag cap for new tab content
});

const tfToggle = document.getElementById("tf-toggle");
const tfChips = document.getElementById("tag-filter-chips");
const tfCount = document.getElementById("tf-count");
const sortToggle = document.getElementById("sort-toggle");
const sortDropdown = document.getElementById("sort-dropdown");
const sortLabel = document.getElementById("sort-label");

function updateSortButton() {
  const isActive = activeSortField !== "default";
  const arrowChar = activeSortDir === "asc" ? "\u2191" : "\u2193";
  sortLabel.textContent = isActive ? `${SORT_FIELD_LABELS[activeSortField]} ${arrowChar}` : "Sort";
  sortToggle.classList.toggle("open", isActive);
  sortDropdown.querySelectorAll("[data-sort-field]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.sortField === activeSortField),
  );
  sortDropdown.querySelectorAll("[data-sort-dir]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sortDir === activeSortDir);
    btn.disabled = activeSortField === "default";
  });
}

function closeSortDropdown() {
  sortDropdown.classList.add("shut");
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
});

sortDropdown.addEventListener("click", (e) => {
  const opt = e.target.closest(".sort-opt");
  if (!opt || opt.disabled) return;

  if (opt.dataset.sortField !== undefined) {
    const field = opt.dataset.sortField;
    if (field === "distance") {
      if (!navigator.geolocation) {
        showToast("Location not available", "loc", "Your browser doesn't support location");
        return;
      }
      if (userSortLat === null) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            userSortLat = pos.coords.latitude;
            userSortLng = pos.coords.longitude;
            userLocLat = pos.coords.latitude;
            userLocLng = pos.coords.longitude;
            activeSortField = "distance";
            updateSortButton();
            renderPlacesList();
          },
          () => showToast("Location is off", "loc", "Enable location to sort by distance"),
          { enableHighAccuracy: false, timeout: 6000 },
        );
        return;
      }
    }
    activeSortField = field;
    updateSortButton();
    renderPlacesList();
    if (field === "default") closeSortDropdown();
  } else if (opt.dataset.sortDir !== undefined) {
    activeSortDir = opt.dataset.sortDir;
    updateSortButton();
    renderPlacesList();
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
    let html = "";
    for (const it of items) {
      if (it.group) {
        const activeCount = it.children.filter(c => activeTagFilters.has(c.id)).length;
        html += `<button class="tf-chip tf-group-toggle" data-group="${it.parent.id}">${esc(it.parent.label)}<span class="tf-group-count${activeCount ? "" : " hide"}">${activeCount}</span><svg class="tf-group-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>`;
        html += `<div class="tf-group-chips shut" data-group-for="${it.parent.id}">`;
        html += it.children.map(c => `<button class="tf-chip${activeTagFilters.has(c.id) ? " active" : ""}" data-tag="${c.id}">${esc(c.label)}</button>`).join("");
        html += `</div>`;
      } else {
        html += `<button class="tf-chip${activeTagFilters.has(it.tag.id) ? " active" : ""}" data-tag="${it.tag.id}">${esc(it.tag.label)}</button>`;
      }
    }
    tfChips.innerHTML = html;
  }

  // Sort: show only when 2+ places
  sortToggle.classList.toggle("hide", count < 2);
  if (count < 2) closeSortDropdown();
}

function updateTagCount() {
  if (activeTagFilters.size) { tfCount.textContent = activeTagFilters.size; tfCount.classList.remove("hide"); }
  else { tfCount.classList.add("hide"); }
}

tfToggle.addEventListener("click", () => {
  const isOpen = !tfChips.classList.contains("shut");
  tfChips.classList.toggle("shut", isOpen);
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
      panel.classList.toggle("shut", isOpen);
      groupBtn.classList.toggle("open", !isOpen);
    }
    return;
  }
  const chip = e.target.closest(".tf-chip");
  if (!chip) return;
  const tagId = chip.dataset.tag;
  if (activeTagFilters.has(tagId)) { activeTagFilters.delete(tagId); chip.classList.remove("active"); }
  else { activeTagFilters.add(tagId); chip.classList.add("active"); }
  // Update group count badge
  const groupPanel = chip.closest(".tf-group-chips");
  if (groupPanel) {
    const gid = groupPanel.dataset.groupFor;
    const toggle = tfChips.querySelector(`.tf-group-toggle[data-group="${gid}"]`);
    if (toggle) {
      const cnt = groupPanel.querySelectorAll(".tf-chip.active").length;
      const badge = toggle.querySelector(".tf-group-count");
      if (badge) { badge.textContent = cnt; badge.classList.toggle("hide", !cnt); }
    }
  }
  updateTagCount();
  addPlaceMarkers();
  renderPlacesList();
  placesSnap.softRemeasure();                    // update drag cap for filtered content
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

  const _starPath = `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`;
  const _clockIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

  function buildCard(p, i) {
    const cfg = PLACE_CONFIG[p.type] || PLACE_CONFIG.mosque;
    const typeTags = getDisplayTags(p.type);
    const posTags = typeTags.filter((t) => p.tags?.[t.id] === true);
    const posCount = posTags.length;
    const tagSummary = posCount ? `${posCount} tag${posCount > 1 ? "s" : ""}` : "0 tags";
    const tagNames = posTags.map((t) => t.label);
    const faved = isFavourite(p.id);
    const distBadge = userLocLat !== null
      ? `<span class="pl-dist">${formatDist(haversineDistance(userLocLat, userLocLng, p.lat, p.lng))}</span>`
      : "";
    return `<li class="pl-card" data-idx="${i}" data-place-id="${p.id}" style="--place-c:${cfg.color};--i:${i}">
      <span class="pl-dot" style="background:${cfg.color}"><svg viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg></span>
      <span class="pl-name">${esc(p.name)}</span>
      <span class="pl-addr">${esc(p.address)}${distBadge}</span>
      <div class="pl-meta">
        <span class="pl-tags-summary" style="--type-c:${cfg.color}" data-type="${esc(cfg.label)}" data-tags='${JSON.stringify(tagNames).replace(/'/g, "&#39;")}'>${tagSummary}</span>
      </div>
      <button class="pl-fav-btn${faved ? " active" : ""}" data-fav-id="${p.id}" aria-label="${faved ? "Remove from saved" : "Save place"}">
        <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${faved ? "currentColor" : "none"}">${_starPath}</svg>
      </button>
    </li>`;
  }

  const regularHTML = sorted.map((p, i) => buildCard(p, i)).join("");

  const pinHTML = customPins
    .map((pin, pi) => `<li class="pl-card" data-custom-pin-id="${escA(pin.id)}" style="--place-c:var(--accent,#1A73B8);--i:${sorted.length + pi}">
      <span class="pl-dot" style="background:var(--accent,#1A73B8)"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg></span>
      <span class="pl-name">${esc(pin.name)}</span>
      <span class="pl-addr">${esc(pin.id)}</span>
      <div class="pl-meta">
        <span class="pl-tags-summary" style="--type-c:var(--accent,#1A73B8)" data-type="Dropped Pin" data-tags="[]">0 tags</span>
      </div>
      <button class="pl-fav-btn active pl-unsave-pin-btn" data-pin-id="${escA(pin.id)}" aria-label="Remove from saved">
        <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="currentColor">${_starPath}</svg>
      </button>
    </li>`)
    .join("");

  // Recently viewed section (skip on saved tab)
  let recentHtml = "";
  if (activeTypeFilter !== "saved" && recentIds.length) {
    const recentPlaces = recentIds.map((id) => filtered.find((p) => p.id === id)).filter(Boolean);
    if (recentPlaces.length) {
      const recentCards = recentPlaces.map((p, i) => buildCard(p, i)).join("");
      const mainHdr = (regularHTML || pinHTML)
        ? `<li class="pl-section-hdr pl-section-hdr--main">All places</li>`
        : "";
      recentHtml = `<li class="pl-section-hdr">${_clockIcon} Recently viewed</li>${recentCards}${mainHdr}`;
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
  // Toggle tag tooltip on tap/click
  const tagEl = e.target.closest(".pl-tags-summary");
  if (tagEl) {
    e.stopPropagation();
    if (tagTipTarget === tagEl) { hideTagTip(); } else { showTagTip(tagEl); }
    return;
  }
  // Dismiss any open tag tooltip
  hideTagTip();

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
      closePlacesSheet();
      window.dispatchEvent(new CustomEvent("hf:show-search-marker", { detail: { lng: pin.lng, lat: pin.lat } }));
      map.flyTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
    }
    return;
  }
  // Click on a regular place row
  const li = e.target.closest("li[data-place-id]");
  if (!li) return;
  const placeId = li.dataset.placeId;
  const place = placesData.find((p) => String(p.id) === placeId);
  if (place) { closePlacesSheet(); showPlacePopup(place); }
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
        // Expandable group (e.g. Cuisine) — button inline, panel below
        const subChips = subtags.map((s) =>
          `<button type="button" class="sg-subtag" data-tag="${s.id}">${esc(s.label)}</button>`
        ).join("");
        return (
          `<button type="button" class="sg-tag sg-tag-expand" data-expand="${t.id}">` +
          `<span class="sg-tag-label">${esc(t.label)}</span>` +
          `<svg class="sg-expand-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>` +
          `</button>` +
          `<div class="sg-subtags shut" data-parent="${t.id}">` +
          `<div class="sg-subtags-inner">` +
          `<div class="sg-subtag-chips">${subChips}</div>` +
          `<div class="sg-cuisine-add-row">` +
          `<input type="text" class="sg-cuisine-input" placeholder="Add cuisine…" maxlength="40" />` +
          `<button type="button" class="sg-cuisine-add-btn">Add</button>` +
          `</div>` +
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
  // Expand/collapse cuisine group
  const expandBtn = e.target.closest(".sg-tag-expand");
  if (expandBtn) {
    const parentId = expandBtn.dataset.expand;
    const panel = sgTagsContainer.querySelector(`.sg-subtags[data-parent="${parentId}"]`);
    if (panel) {
      panel.classList.toggle("shut");
      expandBtn.classList.toggle("open");
    }
    return;
  }
  // Toggle subtag selection
  const subtag = e.target.closest(".sg-subtag");
  if (subtag) {
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
      clearPinLocation();
      renderSuggestTags();
      document.getElementById("suggest-overlay").classList.add("hide");
      showToast("Suggestion submitted", "check", "JazakAllah Khair!");
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
        // Expandable group (e.g. Cuisine) — button inline, panel below
        const hasAny = subtags.some((s) => existingTags?.[s.id] === true);
        const subChips = subtags.map((s) => {
          const isActive = existingTags?.[s.id] === true;
          return `<button type="button" class="sg-subtag${isActive ? " active" : ""}" data-tag="${s.id}">${esc(s.label)}</button>`;
        }).join("");
        return (
          `<button type="button" class="sg-tag sg-tag-expand${hasAny ? " open" : ""}" data-expand="${t.id}">` +
          `<span class="sg-tag-label">${esc(t.label)}</span>` +
          `<svg class="sg-expand-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>` +
          `</button>` +
          `<div class="sg-subtags${hasAny ? "" : " shut"}" data-parent="${t.id}">` +
          `<div class="sg-subtags-inner">` +
          `<div class="sg-subtag-chips">${subChips}</div>` +
          `<div class="sg-cuisine-add-row">` +
          `<input type="text" class="sg-cuisine-input" placeholder="Add cuisine…" maxlength="40" />` +
          `<button type="button" class="sg-cuisine-add-btn">Add</button>` +
          `</div>` +
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
  // Expand/collapse cuisine group
  const expandBtn = e.target.closest(".sg-tag-expand");
  if (expandBtn) {
    const parentId = expandBtn.dataset.expand;
    const panel = edTagsContainer.querySelector(`.sg-subtags[data-parent="${parentId}"]`);
    if (panel) {
      panel.classList.toggle("shut");
      expandBtn.classList.toggle("open");
    }
    return;
  }
  // Toggle subtag selection
  const subtag = e.target.closest(".sg-subtag");
  if (subtag) {
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
    // Check cuisine subtag changes
    const displayTags = getDisplayTags(type);
    const cuisineSubtags = displayTags.filter((t) => t.id.startsWith("cuisine_"));
    cuisineSubtags.forEach((t) => {
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
      showToast("Edit submitted", "check", "JazakAllah Khair!");
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
