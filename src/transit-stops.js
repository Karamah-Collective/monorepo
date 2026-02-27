import { map } from "./map-init.js";
import { DIGITRANSIT_URL, DT_API_KEY } from "./config.js";
import { TRANSIT_COLORS, modeIcon } from "./icons.js";
import { esc, escA } from "./utils.js";

const HKI_BBOX = "59.90,24.30,60.70,25.80";
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

function classifyStop(el) {
  const t = el.tags || {};
  if (t.station === "subway" || t.railway === "subway_entrance") return "metro";
  if (t.railway === "tram_stop") return "tram";
  if (t.railway === "station" || t.railway === "halt") {
    if (t.subway === "yes" || t.station === "subway") return "metro";
    return "train";
  }
  if (t.amenity === "ferry_terminal") return "ferry";
  return "bus";
}

function stopRank(type) {
  return { train: 3, metro: 3, ferry: 2, tram: 1 }[type] || 0;
}

function deduplicateStops(features) {
  const NAME_CELL = 0.001;
  const nameGroups = new Map();
  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates;
    const { name, type } = f.properties;
    const key = name
      ? `${name}_${type}_${Math.round(lng / NAME_CELL)}_${Math.round(lat / NAME_CELL)}`
      : `anon_${lng}_${lat}`;
    if (!nameGroups.has(key)) nameGroups.set(key, []);
    nameGroups.get(key).push(f);
  }
  const merged = [];
  for (const group of nameGroups.values()) {
    group.sort((a, b) => {
      if (b.properties.rank !== a.properties.rank) return b.properties.rank - a.properties.rank;
      if (a.properties.code && !b.properties.code) return -1;
      if (!a.properties.code && b.properties.code) return 1;
      return 0;
    });
    merged.push(group[0]);
  }
  const cellSize = 0.0004;
  const cells = new Map();
  for (const f of merged) {
    const [lng, lat] = f.geometry.coordinates;
    const code = f.properties.code;
    const key = code
      ? `code_${code}`
      : `${f.properties.type}_${Math.round(lng / cellSize)}_${Math.round(lat / cellSize)}`;
    const existing = cells.get(key);
    if (!existing || f.properties.rank > existing.properties.rank) cells.set(key, f);
  }
  return Array.from(cells.values());
}

async function loadTransitStopsFromAPI(retries = 0) {
  const query = `[out:json][timeout:30];(node["railway"="station"]["station"!="abandoned"](${HKI_BBOX});node["railway"="halt"](${HKI_BBOX});node["railway"="tram_stop"](${HKI_BBOX});node["station"="subway"](${HKI_BBOX});node["railway"="subway_entrance"](${HKI_BBOX});node["amenity"="ferry_terminal"](${HKI_BBOX});node["amenity"="bus_station"](${HKI_BBOX});node["highway"="bus_stop"]["bus"="yes"](${HKI_BBOX});node["highway"="bus_stop"]["public_transport"="platform"](${HKI_BBOX}););out body;`;
  const server = OVERPASS_SERVERS[retries % OVERPASS_SERVERS.length];
  console.log(`[Transit] Fallback: loading from ${server} (attempt ${retries + 1})…`);
  try {
    const resp = await fetch(server, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.elements || !data.elements.length) throw new Error("Empty response");
    console.log(`[Transit] Got ${data.elements.length} stops from Overpass`);
    const features = deduplicateStops(
      data.elements
        .filter((el) => {
          if (!el.tags || !(el.tags.name || el.tags["name:en"])) return false;
          const type = classifyStop(el);
          if ((type === "bus" || type === "tram") && !el.tags.ref) return false;
          return true;
        })
        .map((el) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [el.lon, el.lat] },
          properties: {
            name: el.tags.name || el.tags["name:en"],
            code: el.tags.ref || "",
            type: classifyStop(el),
            rank: stopRank(classifyStop(el)),
            routes: "[]",
          },
        })),
    );
    processTransitStops({ type: "FeatureCollection", features });
  } catch (err) {
    console.warn(`[Transit] Attempt ${retries + 1} failed:`, err.message);
    if (retries < 5) {
      setTimeout(() => loadTransitStopsFromAPI(retries + 1), 1000 * (retries + 1));
    } else {
      console.error("[Transit] All attempts exhausted. Transit stops unavailable.");
    }
  }
}

export async function loadTransitCache() {
  console.log("[Transit] Loading cached stops…");
  try {
    const resp = await fetch("scripts/transit-cache.json", { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const cache = await resp.json();
    console.log(`[Transit] Cache v${cache.version}, ${cache.stopCount} stops, generated ${cache.generated}`);
    const geojson = cache.geojson;
    for (const f of geojson.features) {
      f.properties.routes = JSON.stringify(f.properties.routes || []);
    }
    processTransitStops(geojson);
  } catch (err) {
    console.warn("[Transit] Cache load failed:", err.message, "— falling back to Overpass API");
    loadTransitStopsFromAPI();
  }
}

function processTransitStops(geojson) {
  if (!geojson?.features?.length) return;
  if (map.getSource("transit-stops")) { console.log("[Transit] Source already exists, skipping"); return; }

  map.addSource("transit-stops", { type: "geojson", data: geojson });

  map.addLayer({
    id: "transit-major-bg",
    type: "circle",
    source: "transit-stops",
    filter: [">=", ["get", "rank"], 2],
    minzoom: 11,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 10, 19, 14],
      "circle-color": ["match", ["get", "type"], "train", TRANSIT_COLORS.train, "metro", TRANSIT_COLORS.metro, "ferry", TRANSIT_COLORS.ferry, "#999"],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
      "circle-opacity": 0.95,
    },
  });
  map.addLayer({
    id: "transit-major-label",
    type: "symbol",
    source: "transit-stops",
    filter: [">=", ["get", "rank"], 2],
    minzoom: 12,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13],
      "text-anchor": "left",
      "text-offset": [1, 0],
      "text-max-width": 8,
      "text-optional": true,
    },
    paint: {
      "text-color": ["match", ["get", "type"], "train", TRANSIT_COLORS.train, "metro", TRANSIT_COLORS.metro, "ferry", TRANSIT_COLORS.ferry, "#555"],
      "text-halo-color": "#fff",
      "text-halo-width": 1.5,
    },
  });
  map.addLayer({
    id: "transit-tram-bg",
    type: "circle",
    source: "transit-stops",
    filter: ["==", ["get", "type"], "tram"],
    minzoom: 14,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 3.5, 18, 8],
      "circle-color": TRANSIT_COLORS.tram,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#fff",
      "circle-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "transit-tram-label",
    type: "symbol",
    source: "transit-stops",
    filter: ["==", ["get", "type"], "tram"],
    minzoom: 15,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-anchor": "left",
      "text-offset": [0.8, 0],
      "text-max-width": 7,
      "text-optional": true,
    },
    paint: { "text-color": TRANSIT_COLORS.tram, "text-halo-color": "#fff", "text-halo-width": 1.2 },
  });
  map.addLayer({
    id: "transit-bus-bg",
    type: "circle",
    source: "transit-stops",
    filter: ["==", ["get", "type"], "bus"],
    minzoom: 15,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2.5, 18, 6],
      "circle-color": TRANSIT_COLORS.bus,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
      "circle-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "transit-bus-label",
    type: "symbol",
    source: "transit-stops",
    filter: ["==", ["get", "type"], "bus"],
    minzoom: 16.5,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 10,
      "text-anchor": "left",
      "text-offset": [0.7, 0],
      "text-max-width": 7,
      "text-optional": true,
    },
    paint: { "text-color": TRANSIT_COLORS.bus, "text-halo-color": "#fff", "text-halo-width": 1.2 },
  });

  let _stopPopupId = 0;
  ["transit-major-bg", "transit-tram-bg", "transit-bus-bg"].forEach((layerId) => {
    map.on("click", layerId, (e) => {
      const f = e.features[0];
      const { name, type, code } = f.properties;
      const color = TRANSIT_COLORS[type] || "#007AC9";
      const lngLat = f.geometry.coordinates.slice();
      const modeKey = { bus: "BUS", tram: "TRAM", metro: "SUBWAY", train: "RAIL", ferry: "FERRY" }[type] || "BUS";
      const svgIcon = modeIcon(modeKey, 20);
      const popId = ++_stopPopupId;
      const routesDivId = `stop-routes-${popId}`;

      const displayName = name || "Unnamed stop";
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      const codeStr = code ? `<span class="sp-code">${esc(code)}</span>` : "";
      const html = `
        <div class="sp" style="--sc:${color}">
          <div class="sp-head">
            <span class="sp-icon">${svgIcon}</span>
            <div class="sp-title">${esc(displayName)}</div>
            <div class="sp-sub">${typeLabel} ${codeStr}</div>
          </div>
          <div class="sp-routes" id="${routesDivId}"></div>
        </div>`;

      const popup = new maplibregl.Popup({ offset: 14, maxWidth: "320px", className: "stop-popup-wrap" })
        .setLngLat(lngLat)
        .setHTML(html)
        .addTo(map);

      const popEl = popup.getElement();
      let tip = null;
      popEl.addEventListener("pointerenter", (ev) => {
        const badge = ev.target.closest(".sp-chip[data-tip]");
        if (!badge) return;
        if (!tip) { tip = document.createElement("div"); tip.className = "sp-tip"; document.body.appendChild(tip); }
        tip.textContent = badge.dataset.tip;
        const rect = badge.getBoundingClientRect();
        tip.style.left = rect.left + rect.width / 2 + "px";
        tip.style.top = rect.top - 8 + "px";
        tip.style.transform = "translate(-50%, -100%)";
        requestAnimationFrame(() => tip.classList.add("visible"));
      }, true);
      popEl.addEventListener("pointerleave", (ev) => {
        const badge = ev.target.closest(".sp-chip[data-tip]");
        if (badge && tip) tip.classList.remove("visible");
      }, true);
      popup.on("close", () => { if (tip) { tip.remove(); tip = null; } });

      const routesJson = f.properties.routes;
      let cachedRoutes = [];
      if (Array.isArray(routesJson)) cachedRoutes = routesJson;
      else { try { cachedRoutes = routesJson ? JSON.parse(routesJson) : []; } catch (_) {} }

      if (cachedRoutes.length > 0) {
        renderStopRoutes(routesDivId, cachedRoutes, color);
      } else {
        const el = document.getElementById(routesDivId);
        if (el) el.innerHTML = '<span class="sp-loading"><span class="sp-spin"></span>Loading…</span>';
        const expectedMode = { bus: "BUS", tram: "TRAM", metro: "SUBWAY", train: "RAIL", ferry: "FERRY" }[type] || null;
        fetchStopRoutes(lngLat[1], lngLat[0], code, expectedMode)
          .then((routes) => {
            const compact = (routes || []).map((r) => ({ s: r.shortName || "?", m: r.mode, l: r.longName || "", t: r.type || 0 }));
            const seen = new Set();
            const unique = compact.filter((r) => { const k = `${r.s}_${r.m}`; if (seen.has(k)) return false; seen.add(k); return true; });
            renderStopRoutes(routesDivId, unique, color);
          })
          .catch(() => {
            const el = document.getElementById(routesDivId);
            if (el) el.innerHTML = '<span class="sp-empty">Could not load routes</span>';
          });
      }
    });
    map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
  });
  console.log(`[Transit] Loaded ${geojson.features.length} transit stops`);
}

function renderStopRoutes(divId, routes, fallbackColor) {
  const el = document.getElementById(divId);
  if (!el) return;
  if (!routes || routes.length === 0) { el.innerHTML = '<span class="sp-empty">No routes</span>'; return; }
  const modeOrder = { RAIL: 0, SUBWAY: 1, FERRY: 2, TRAM: 3, BUS: 4 };
  routes.sort((a, b) => (modeOrder[a.m] ?? 5) - (modeOrder[b.m] ?? 5));
  let lastMode = null;
  el.innerHTML = routes
    .map((r) => {
      const isTrunk = r.m === "BUS" && r.t === 702;
      const rColor = isTrunk
        ? TRANSIT_COLORS.trunk
        : TRANSIT_COLORS[{ BUS: "bus", TRAM: "tram", SUBWAY: "metro", RAIL: "train", FERRY: "ferry" }[r.m] || "bus"] || fallbackColor;
      const longText = r.l || "";
      const tipAttr = longText ? ` data-tip="${escA(longText)}"` : "";
      const num = esc(r.s || "?");
      const showDest = ["RAIL", "SUBWAY", "FERRY"].includes(r.m) && longText;
      const label = showDest
        ? `${num} <small>${esc(longText.split("–").pop().split("-").pop().trim().substring(0, 18))}</small>`
        : num;
      let sep = "";
      if (lastMode !== null && lastMode !== r.m) sep = '<span class="sp-sep"></span>';
      lastMode = r.m;
      return `${sep}<span class="sp-chip" style="--rc:${rColor}"${tipAttr}>${label}</span>`;
    })
    .join("");
}

async function fetchStopRoutes(lat, lon, stopCode, expectedMode) {
  const filterMode = (routes) => {
    if (!routes) return [];
    return expectedMode ? routes.filter((r) => r.mode === expectedMode) : routes;
  };
  const needStation = !stopCode && ["SUBWAY", "RAIL", "FERRY"].includes(expectedMode);
  const query = `{
    nearest(lat: ${lat}, lon: ${lon}, maxResults: 15, maxDistance: 400, filterByPlaceTypes: [STOP]) {
      edges { node { place { ... on Stop { name code gtfsId routes { shortName mode longName type } } } distance } }
    }
    ${needStation ? `stations: nearest(lat: ${lat}, lon: ${lon}, maxResults: 3, maxDistance: 500, filterByPlaceTypes: [STATION]) {
      edges { node { place { ... on Stop { name gtfsId stops { name code routes { shortName mode longName type } } } } distance } }
    }` : ""}
  }`;
  const resp = await fetch(DIGITRANSIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "digitransit-subscription-key": DT_API_KEY },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await resp.json();
  const edges = json?.data?.nearest?.edges || [];
  if (stopCode) {
    for (const edge of edges) {
      const place = edge.node?.place;
      if (place?.code === stopCode && place?.routes) return filterMode(place.routes);
    }
  }
  if (expectedMode) {
    for (const edge of edges) {
      const place = edge.node?.place;
      if (place?.routes?.some((r) => r.mode === expectedMode)) return filterMode(place.routes);
    }
  }
  if (needStation) {
    const stationEdges = json?.data?.stations?.edges || [];
    for (const edge of stationEdges) {
      const childStops = edge.node?.place?.stops || [];
      for (const stop of childStops) {
        if (stop.routes?.some((r) => r.mode === expectedMode)) return filterMode(stop.routes);
      }
    }
  }
  const nearest = edges[0]?.node?.place;
  return filterMode(nearest?.routes || []);
}
// 