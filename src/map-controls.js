import { map } from "./map-init.js";
import { HELSINKI } from "./config.js";
import { showToast, showLoadingToast, hideLoadingToast } from "./utils.js";

let locMarker = null;
let locWatchId = null;

export let currentStyleMode = "default";
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

export function setMapStyle(mode) {
  if (mode === currentStyleMode) return;

  if (!origLabelPaint.label_road) {
    LABEL_IDS.forEach((id) => {
      origLabelPaint[id] = {
        color: map.getPaintProperty(id, "text-color"),
        halo: map.getPaintProperty(id, "text-halo-color"),
        haloW: map.getPaintProperty(id, "text-halo-width"),
      };
    });
  }

  if (map.getLayer("style-raster")) map.removeLayer("style-raster");
  if (is3DActive) disable3D();

  if (mode === "default") {
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
  } else if (mode === "satellite") {
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
    map.setMaxPitch(0);
    map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
  }

  currentStyleMode = mode;
  document.querySelectorAll(".style-opt").forEach((el) => el.classList.toggle("active", el.dataset.style === mode));
  document.getElementById("style-picker-btn")?.classList.toggle("active", mode !== "default");
  document.getElementById("style-panel")?.classList.add("hide");
  console.log(`[Style] Switched to ${mode}`);
}

// Style picker toggle
document.getElementById("style-picker-btn")?.addEventListener("click", () => {
  document.getElementById("style-panel")?.classList.toggle("hide");
});
document.querySelectorAll(".style-opt").forEach((btn) => {
  btn.addEventListener("click", () => setMapStyle(btn.dataset.style));
});
document.addEventListener("click", (e) => {
  const picker = document.getElementById("style-picker");
  if (picker && !picker.contains(e.target)) document.getElementById("style-panel")?.classList.add("hide");
});

// Home / zoom / locate buttons
document.getElementById("home-btn").addEventListener("click", () => {
  if (currentStyleMode !== "default") setMapStyle("default");
  if (is3DActive) disable3D();
  map.flyTo({ center: HELSINKI, zoom: 12.2, bearing: 0, pitch: 0, duration: 600 });
});
document.getElementById("zoomin-btn").addEventListener("click", () => map.zoomIn({ duration: 300 }));
document.getElementById("zoomout-btn").addEventListener("click", () => map.zoomOut({ duration: 300 }));
document.getElementById("locate-btn").addEventListener("click", showCurrentLocation);

map.on("moveend", updateUrlHash);

map.on("pitchend", () => {
  if (currentStyleMode !== "default") return;
  const p = map.getPitch();
  if (p > 10 && !is3DActive) enable3D();
  else if (p <= 10 && is3DActive) disable3D();
});
