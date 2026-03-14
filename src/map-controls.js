import { map } from "./map-init.js";
import { HELSINKI } from "./config.js";
import { showToast, showLoadingToast, hideLoadingToast } from "./utils.js";
import { placesData, updateMarkerVisibility } from "./places.js";

let locMarker = null;
let locWatchId = null;

export let currentTheme = "light";     // "light" | "dark"
export let isSatelliteActive = false;
export let isHeatmapActive = false;
export let is3DActive = false;

const VECTOR_BASE_IDS = [
  "background", "landcover_grass", "landcover_wood", "landcover_farmland",
  "landcover_sand", "landcover_ice", "landuse_residential", "landuse_industrial",
  "landuse_hospital", "landuse_school", "landuse_cemetery", "landuse_pitch",
  "park", "waterway", "water", "aeroway_fill", "aeroway_runway",
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

/* ── Heatmap scoring ── */
const TYPE_BASE = { mosque: 10, prayer_room: 7, shop: 5, restaurant: 4 };
const TAG_SCORE = {
  daily_prayers: 5, jummah: 3, taraweeh: 1, eid_prayer: 1,
  janaza: 0.5, quran_classes: 1, female_prayer: 2, female_wudu: 1,
  wudu: 1, quran_available: 0.5,
  fully_halal: 3, partially_halal: 1, no_alcohol: 1.5,
  halal_meat: 3, halal_butchery: 2, halal_groceries: 2,
  asian_products: 0.5, african_products: 0.5, arab_products: 0.5, halal_certified: 2,
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

export function showCurrentLocation() {
  if (!navigator.geolocation) {
    showToast("Location not available", "loc", "Your browser doesn't support location");
    return;
  }
  const locBtn = document.getElementById("locate-btn");

  if (locWatchId !== null) {
    navigator.geolocation.clearWatch(locWatchId);
    locWatchId = null;
    if (locMarker) { locMarker.remove(); locMarker = null; }
    locBtn.classList.remove("tracking");
    return;
  }

  locBtn.classList.add("tracking");
  showLoadingToast("Finding your location\u2026");
  let firstFix = true;

  locWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (firstFix) hideLoadingToast();
      if (!locMarker) {
        const el = document.createElement("div");
        el.className = "loc-marker";
        el.innerHTML = '<div class="loc-ring"></div><div class="loc-dot"></div>';
        locMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      } else {
        locMarker.setLngLat([lng, lat]);
      }
      if (firstFix) {
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
        firstFix = false;
      }
    },
    () => {
      hideLoadingToast();
      showToast("Location is off", "loc", "Enable location permission");
      locBtn.classList.remove("tracking");
      locWatchId = null;
      map.flyTo({ center: HELSINKI, zoom: 12.2, duration: 600 });
    },
    { enableHighAccuracy: true, timeout: 8000 },
  );
}

export function setActiveTab(id) {
  document.querySelectorAll("#tab-bar .tab").forEach((t) => t.classList.remove("active-tab"));
  if (id) {
    const t = document.getElementById(id);
    if (t) t.classList.add("active-tab");
  }
}

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

// ── Theme: switch between light and dark ──────────────────────────
export function setTheme(theme) {
  if (theme === currentTheme) return;
  currentTheme = theme;
  const isDark = theme === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  document.getElementById("map").classList.toggle("dark-mode", isDark);
  try { localStorage.setItem("theme", theme); } catch (_) {}
  _syncStyleButtons();
  console.log(`[Style] Theme → ${theme}`);
}

// ── Restore saved theme on load (before first render to avoid flash) ──
(function restoreSavedTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      currentTheme = "dark";
      document.body.classList.add("dark-mode");
      document.getElementById("map")?.classList.add("dark-mode");
      _syncStyleButtons();
    }
  } catch (_) {}
})();

// ── Satellite toggle ──────────────────────────────────────────────
export function toggleSatellite() {
  if (!origLabelPaint.label_road) _snapshotLabels();
  isSatelliteActive = !isSatelliteActive;
  document.getElementById("map").classList.toggle("satellite-active", isSatelliteActive);

  if (isSatelliteActive) {
    const was3D = is3DActive;
    if (is3DActive) disable3D();

    VECTOR_BASE_IDS.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    });
    if (!map.getSource("esri-satellite")) {
      map.addSource("esri-satellite", {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, Maxar, Earthstar Geographics',
      });
    }
    map.addLayer(
      { id: "style-raster", type: "raster", source: "esri-satellite", paint: { "raster-opacity": 1 } },
      "label_road",
    );
    LABEL_IDS.forEach((id) => {
      map.setPaintProperty(id, "text-color", "#ffffff");
      map.setPaintProperty(id, "text-halo-color", "rgba(0,0,0,0.75)");
      map.setPaintProperty(id, "text-halo-width", 1.5);
    });
    // Keep heatmap above satellite raster
    if (isHeatmapActive && map.getLayer("heatmap-layer")) {
      map.moveLayer("heatmap-layer", "label_road");
    }
    map.setMaxPitch(0);
    map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
  } else {
    if (map.getLayer("style-raster")) map.removeLayer("style-raster");

    VECTOR_BASE_IDS.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    });
    LABEL_IDS.forEach((id) => {
      const o = origLabelPaint[id];
      if (o) {
        map.setPaintProperty(id, "text-color", o.color);
        map.setPaintProperty(id, "text-halo-color", o.halo);
        map.setPaintProperty(id, "text-halo-width", o.haloW);
      }
    });
    map.setMaxPitch(85);
  }

  updateMarkerVisibility();
  _syncStyleButtons();
  console.log(`[Style] Satellite ${isSatelliteActive ? "ON" : "OFF"}`);
}

// ── Heatmap toggle ────────────────────────────────────────────────
export function toggleHeatmap() {
  isHeatmapActive = !isHeatmapActive;

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
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.85, 16, 0.45],
        },
      }, "label_road");

      // Click heatmap hotspot → zoom in closer
      map.on("click", "heatmap-layer", (e) => {
        if (!isHeatmapActive) return;
        const zoom = map.getZoom();
        const target = Math.min(zoom + 2, 15);
        if (target > zoom) {
          map.flyTo({ center: e.lngLat, zoom: target, duration: 500 });
        }
      });
      map.on("mouseenter", "heatmap-layer", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "heatmap-layer", () => { map.getCanvas().style.cursor = ""; });
    } else {
      map.setLayoutProperty("heatmap-layer", "visibility", "visible");
      // Ensure heatmap renders above satellite raster
      if (isSatelliteActive && map.getLayer("style-raster")) {
        map.moveLayer("heatmap-layer", "label_road");
      }
    }
  } else {
    if (map.getLayer("heatmap-layer")) map.setLayoutProperty("heatmap-layer", "visibility", "none");
  }

  updateMarkerVisibility();
  _syncStyleButtons();
  console.log(`[Style] Heatmap ${isHeatmapActive ? "ON" : "OFF"}`);
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
  document.querySelectorAll(".style-opt").forEach((el) => {
    const s = el.dataset.style;
    if (s === "light" || s === "dark") {
      el.classList.toggle("active", s === currentTheme);
    } else if (s === "satellite") {
      el.classList.toggle("active", isSatelliteActive);
    } else if (s === "heatmap") {
      el.classList.toggle("active", isHeatmapActive);
    }
  });
  const isNonDefault = isSatelliteActive || isHeatmapActive;
  document.getElementById("style-picker-btn")?.classList.toggle("active", isNonDefault);
  document.getElementById("tools-toggle")?.classList.toggle("style-active", isNonDefault);
}

export function refreshHeatmapSource() {
  if (!isHeatmapActive) return;
  const src = map.getSource("heatmap-src");
  if (src) src.setData(buildHeatmapGeoJSON());
}

// Style picker toggle
document.getElementById("style-picker-btn")?.addEventListener("click", () => {
  document.getElementById("style-panel")?.classList.toggle("hide");
});
document.querySelectorAll(".style-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    const s = btn.dataset.style;
    if (s === "light" || s === "dark") setTheme(s);
    else if (s === "satellite") toggleSatellite();
    else if (s === "heatmap") toggleHeatmap();
  });
});
document.addEventListener("click", (e) => {
  const picker = document.getElementById("style-picker");
  if (picker && !picker.contains(e.target)) document.getElementById("style-panel")?.classList.add("hide");
});

// Home / zoom / locate buttons
document.getElementById("home-btn").addEventListener("click", () => {
  if (isSatelliteActive) toggleSatellite();
  if (isHeatmapActive) toggleHeatmap();
  if (is3DActive) disable3D();
  setActiveTab(null);
  map.flyTo({ center: HELSINKI, zoom: 12.2, bearing: 0, pitch: 0, duration: 600 });
});
document.getElementById("zoomin-btn").addEventListener("click", () => map.zoomIn({ duration: 300 }));
document.getElementById("zoomout-btn").addEventListener("click", () => map.zoomOut({ duration: 300 }));
document.getElementById("locate-btn").addEventListener("click", showCurrentLocation);

map.on("moveend", updateUrlHash);

map.on("zoomend", () => setActiveTab(null));

map.on("pitchend", () => {
  if (isSatelliteActive) return;
  const p = map.getPitch();
  if (p > 10 && !is3DActive) enable3D();
  else if (p <= 10 && is3DActive) disable3D();
});
