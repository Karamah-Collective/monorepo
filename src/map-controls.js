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
      map.flyTo({ center: HELSINKI, zoom: 13, duration: 600 });
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

export function enable3D() {
  is3DActive = true;
  map.setTerrain({ source: "terrain-dem", exaggeration: 1.3 });
  if (!map.getLayer("sky-layer")) {
    map.addLayer({
      id: "sky-layer",
      type: "sky",
      paint: { "sky-type": "atmosphere", "sky-atmosphere-sun": [0, 0], "sky-atmosphere-sun-intensity": 15 },
    });
  }
  map.setLayoutProperty("building", "visibility", "none");
  map.setLayoutProperty("building_shadow", "visibility", "none");
  map.setLayoutProperty("building_outline", "visibility", "none");
  if (!map.getLayer("building-3d")) {
    map.addLayer(
      {
        id: "building-3d",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": "#dfe1e8",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.85,
        },
      },
      "label_road",
    );
  } else {
    map.setLayoutProperty("building-3d", "visibility", "visible");
  }
}

export function disable3D() {
  is3DActive = false;
  map.setTerrain(null);
  if (map.getLayer("sky-layer")) map.removeLayer("sky-layer");
  if (map.getLayer("building-3d")) map.setLayoutProperty("building-3d", "visibility", "none");
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
  map.flyTo({ center: HELSINKI, zoom: 13, bearing: 0, pitch: 0, duration: 600 });
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
