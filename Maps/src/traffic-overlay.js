/**
 * Loads traffic node data from Overpass API and keeps the "traffic_nodes"
 * GeoJSON source up to date as the user pans or zooms.
 *
 * Features fetched: traffic signals, stop/give-way signs, pedestrian crossings,
 * speed-calming nodes (bumps/humps/tables), and mini-roundabouts.
 * Only active at zoom >= MIN_ZOOM to avoid flooding Overpass at city scale.
 */

import { map } from "./map-init.js";
import { esc } from "./utils.js";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const MIN_ZOOM       = 15;
const DEBOUNCE_MS    = 700;
const WARM_DEBOUNCE_MS = 1800;
const OVERPASS_CLIENT_TIMEOUT_MS = 6500;
const OVERPASS_QUERY_TIMEOUT_SECONDS = 7;
const SOURCE_ID      = "traffic_nodes";
const LAYER_IDS      = ["traffic-detail-halo", "traffic-detail-icons", "traffic-detail-labels"];
const ICON_CANVAS_SIZE = 64;
const ICON_CENTER = ICON_CANVAS_SIZE / 2;
const ICON_PIXEL_RATIO = 2;
const TRAFFIC_COLOR_SIGNAL = "#d64545";
const TRAFFIC_COLOR_STOP = "#c62828";
const TRAFFIC_COLOR_YIELD = "#d97706";
const TRAFFIC_COLOR_CROSSING = "#1a73b8";
const TRAFFIC_COLOR_CALMING = "#8c4799";
const TRAFFIC_COLOR_ROUNDABOUT = "#08705b";
const TRAFFIC_COLOR_FALLBACK = "#52525b";
const TRAFFIC_COLOR_SURFACE = "#ffffff";
const TRAFFIC_COLOR_INK = "#111111";
const TRAFFIC_COLOR_SIGNAL_HOUSING = "#20242a";
const TRAFFIC_COLOR_LIGHT_EDGE = "rgba(255,255,255,0.74)";
const TRAFFIC_COLOR_ROAD_STRIP = "rgba(17,17,17,0.20)";
const CACHE_TTL_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const CACHE_MAX_KEYS = 160;
const CACHE_GRID_DEGREES = 0.02;
const COORD_PRECISION = 5;
const CACHE_PREFIX = "hf_traffic_detail:";
const CACHE_INDEX_KEY = "hf_traffic_detail:index";

let _debounceTimer     = null;
let _warmDebounceTimer = null;
let _lastBboxKey       = null;
let _abortController   = null;
let _enabled           = false;
let _initialized       = false;
let _trafficPopup      = null;
const _memoryCache = new Map();

const EMPTY_GEOJSON = { type: "FeatureCollection", features: [] };
const TRAFFIC_META = {
  traffic_signals: {
    icon: "traffic-signal",
    label: "Traffic signal",
    summary: "Signalized junction or crossing control.",
  },
  stop: {
    icon: "traffic-stop",
    label: "Stop sign",
    summary: "Full stop required before entering the junction.",
  },
  give_way: {
    icon: "traffic-yield",
    label: "Give way",
    summary: "Yield to crossing or priority traffic.",
  },
  crossing: {
    icon: "traffic-crossing",
    label: "Pedestrian crossing",
    summary: "Marked crossing point for people walking.",
  },
  bump: {
    icon: "traffic-calming",
    label: "Traffic calming",
    summary: "Speed bump or raised calming feature.",
  },
  hump: {
    icon: "traffic-calming",
    label: "Traffic calming",
    summary: "Speed hump or raised calming feature.",
  },
  table: {
    icon: "traffic-calming",
    label: "Raised table",
    summary: "Raised table used to slow traffic.",
  },
  cushion: {
    icon: "traffic-calming",
    label: "Speed cushion",
    summary: "Speed cushion used to slow traffic.",
  },
  mini_roundabout: {
    icon: "traffic-roundabout",
    label: "Mini roundabout",
    summary: "Small roundabout or circular priority junction.",
  },
  unknown: {
    icon: "traffic-other",
    label: "Traffic detail",
    summary: "Mapped street-level traffic feature.",
  },
};

function _typeLabel() {
  return [
    "match",
    ["get", "type"],
    "traffic_signals", "Signal",
    "stop", "Stop",
    "give_way", "Yield",
    "crossing", "Crossing",
    "bump", "Calming",
    "hump", "Calming",
    "table", "Raised",
    "cushion", "Cushion",
    "mini_roundabout", "Roundabout",
    "Traffic",
  ];
}

function _typeIcon() {
  return [
    "match",
    ["get", "type"],
    "traffic_signals", "traffic-signal",
    "stop", "traffic-stop",
    "give_way", "traffic-yield",
    "crossing", "traffic-crossing",
    "bump", "traffic-calming",
    "hump", "traffic-calming",
    "table", "traffic-calming",
    "cushion", "traffic-calming",
    "mini_roundabout", "traffic-roundabout",
    "traffic-other",
  ];
}

function _drawBase(ctx) {
  ctx.clearRect(0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
  ctx.shadowColor = "rgba(17, 17, 17, 0.24)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
}

function _drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function _drawOctagon(ctx, cx, cy, radius) {
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = Math.PI / 8 + (Math.PI * 2 * i) / 8;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function _drawTriangle(ctx, cx, cy, radius) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + radius);
  ctx.lineTo(cx - radius * 0.96, cy - radius * 0.68);
  ctx.lineTo(cx + radius * 0.96, cy - radius * 0.68);
  ctx.closePath();
}

function _makeIcon(drawFn) {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_CANVAS_SIZE;
  canvas.height = ICON_CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  _drawBase(ctx);
  drawFn(ctx);
  return ctx.getImageData(0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
}

function _registerTrafficImages() {
  const icons = {
    "traffic-signal": (ctx) => {
      _drawRoundedRect(ctx, 18, 7, 28, 50, 14);
      ctx.fillStyle = TRAFFIC_COLOR_SIGNAL_HOUSING;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = TRAFFIC_COLOR_SURFACE;
      ctx.stroke();
      [[TRAFFIC_COLOR_SIGNAL, 20], [TRAFFIC_COLOR_YIELD, 32], [TRAFFIC_COLOR_ROUNDABOUT, 44]].forEach(([color, y]) => {
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(ICON_CENTER, y, 5.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = TRAFFIC_COLOR_LIGHT_EDGE;
        ctx.stroke();
      });
    },
    "traffic-stop": (ctx) => {
      _drawOctagon(ctx, ICON_CENTER, ICON_CENTER, 24);
      ctx.fillStyle = TRAFFIC_COLOR_STOP;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = TRAFFIC_COLOR_SURFACE;
      ctx.stroke();
      ctx.fillStyle = TRAFFIC_COLOR_SURFACE;
      ctx.font = "700 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("STOP", ICON_CENTER, ICON_CENTER + 1);
    },
    "traffic-yield": (ctx) => {
      _drawTriangle(ctx, ICON_CENTER, ICON_CENTER + 2, 25);
      ctx.fillStyle = TRAFFIC_COLOR_YIELD;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = TRAFFIC_COLOR_SURFACE;
      ctx.stroke();
      _drawTriangle(ctx, ICON_CENTER, ICON_CENTER + 2, 16);
      ctx.fillStyle = TRAFFIC_COLOR_SURFACE;
      ctx.fill();
    },
    "traffic-crossing": (ctx) => {
      _drawRoundedRect(ctx, 9, 13, 46, 38, 12);
      ctx.fillStyle = TRAFFIC_COLOR_CROSSING;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = TRAFFIC_COLOR_SURFACE;
      ctx.stroke();
      ctx.save();
      _drawRoundedRect(ctx, 9, 13, 46, 38, 12);
      ctx.clip();
      ctx.translate(ICON_CENTER, ICON_CENTER);
      ctx.rotate(-0.18);
      ctx.beginPath();
      ctx.fillStyle = TRAFFIC_COLOR_ROAD_STRIP;
      ctx.fillRect(-26, -6, 52, 18);
      ctx.fillStyle = TRAFFIC_COLOR_SURFACE;
      [-21, -10, 1, 12].forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, 14);
        ctx.lineTo(x + 7, -9);
        ctx.lineTo(x + 15, -9);
        ctx.lineTo(x + 8, 14);
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
    },
    "traffic-calming": (ctx) => {
      _drawRoundedRect(ctx, 9, 18, 46, 28, 14);
      ctx.fillStyle = TRAFFIC_COLOR_CALMING;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = TRAFFIC_COLOR_SURFACE;
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(18, 34);
      ctx.quadraticCurveTo(26, 22, 34, 34);
      ctx.quadraticCurveTo(40, 42, 47, 34);
      ctx.stroke();
    },
    "traffic-roundabout": (ctx) => {
      ctx.beginPath();
      ctx.arc(ICON_CENTER, ICON_CENTER, 23, 0, Math.PI * 2);
      ctx.fillStyle = TRAFFIC_COLOR_ROUNDABOUT;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = TRAFFIC_COLOR_SURFACE;
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(ICON_CENTER, ICON_CENTER, 11, 0.35, Math.PI * 1.82);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(42, 21);
      ctx.lineTo(47, 31);
      ctx.lineTo(36, 29);
      ctx.closePath();
      ctx.fillStyle = TRAFFIC_COLOR_SURFACE;
      ctx.fill();
    },
    "traffic-other": (ctx) => {
      ctx.beginPath();
      ctx.arc(ICON_CENTER, ICON_CENTER, 22, 0, Math.PI * 2);
      ctx.fillStyle = TRAFFIC_COLOR_FALLBACK;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = TRAFFIC_COLOR_SURFACE;
      ctx.stroke();
      ctx.fillStyle = TRAFFIC_COLOR_SURFACE;
      ctx.font = "700 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("i", ICON_CENTER, ICON_CENTER - 1);
    },
  };

  Object.entries(icons).forEach(([name, drawFn]) => {
    if (map.hasImage?.(name)) return;
    map.addImage(name, _makeIcon(drawFn), { pixelRatio: ICON_PIXEL_RATIO });
  });
}

function _ensureSource() {
  if (map.getSource(SOURCE_ID)) return;
  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: EMPTY_GEOJSON,
  });
}

function _ensureLayers() {
  _ensureSource();
  _registerTrafficImages();
  const beforeId = map.getLayer("label_road") ? "label_road" : undefined;

  if (!map.getLayer("traffic-detail-halo")) {
    map.addLayer({
      id: "traffic-detail-halo",
      type: "circle",
      source: SOURCE_ID,
      minzoom: MIN_ZOOM,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 8, 17, 10.5, 19, 13],
        "circle-color": [
          "match",
          ["get", "type"],
          "traffic_signals", TRAFFIC_COLOR_SIGNAL,
          "stop", TRAFFIC_COLOR_STOP,
          "give_way", TRAFFIC_COLOR_YIELD,
          "crossing", TRAFFIC_COLOR_CROSSING,
          "bump", TRAFFIC_COLOR_CALMING,
          "hump", TRAFFIC_COLOR_CALMING,
          "table", TRAFFIC_COLOR_CALMING,
          "cushion", TRAFFIC_COLOR_CALMING,
          "mini_roundabout", TRAFFIC_COLOR_ROUNDABOUT,
          TRAFFIC_COLOR_FALLBACK,
        ],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0.16, 19, 0.24],
        "circle-blur": 0.25,
      },
      layout: {
        visibility: _enabled ? "visible" : "none",
      },
    }, beforeId);
  }

  if (!map.getLayer("traffic-detail-icons")) {
    map.addLayer({
      id: "traffic-detail-icons",
      type: "symbol",
      source: SOURCE_ID,
      minzoom: MIN_ZOOM,
      layout: {
        visibility: _enabled ? "visible" : "none",
        "icon-image": _typeIcon(),
        "icon-size": ["interpolate", ["linear"], ["zoom"], 15, 0.72, 17, 0.88, 19, 1.04],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    }, beforeId);
  }

  if (!map.getLayer("traffic-detail-labels")) {
    map.addLayer({
      id: "traffic-detail-labels",
      type: "symbol",
      source: SOURCE_ID,
      minzoom: 17,
      layout: {
        visibility: _enabled ? "visible" : "none",
        "text-field": _typeLabel(),
        "text-size": ["interpolate", ["linear"], ["zoom"], 17, 9, 19, 11],
        "text-font": ["Noto Sans Regular"],
        "text-offset": [0, 1.7],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-ignore-placement": false,
      },
      paint: {
        "text-color": TRAFFIC_COLOR_INK,
        "text-halo-color": TRAFFIC_COLOR_SURFACE,
        "text-halo-width": 1.2,
      },
    }, beforeId);
  }

  _refreshLayerOrder();
}

function _setLayerVisibility(visible) {
  _ensureLayers();
  LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  });
}

function _refreshLayerOrder() {
  const beforeId = map.getLayer("label_road") ? "label_road" : undefined;
  if (!beforeId) return;
  LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.moveLayer(id, beforeId);
  });
}

/**
 * Builds an Overpass QL query for traffic nodes within the given bounding box.
 * @param {number} s - South latitude
 * @param {number} w - West longitude
 * @param {number} n - North latitude
 * @param {number} e - East longitude
 * @returns {string}
 */
function _buildQuery(s, w, n, e) {
  const bbox = `${s},${w},${n},${e}`;
  return (
    `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SECONDS}];(` +
    `node["highway"="traffic_signals"](${bbox});` +
    `node["highway"="stop"](${bbox});` +
    `node["highway"="give_way"](${bbox});` +
    `node["highway"="crossing"]["crossing"!="no"](${bbox});` +
    `node["traffic_calming"~"^(bump|hump|table|cushion)$"](${bbox});` +
    `node["highway"="mini_roundabout"](${bbox});` +
    `);out body;`
  );
}

function _makeAbortError() {
  try {
    return new DOMException("Aborted", "AbortError");
  } catch {
    const err = new Error("Aborted");
    err.name = "AbortError";
    return err;
  }
}

async function _fetchOverpassEndpoint(endpoint, body, signal) {
  if (signal.aborted) throw _makeAbortError();

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), OVERPASS_CLIENT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal:  controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(timeoutId);
    signal.removeEventListener("abort", onAbort);
  }
}

async function _fetchFirstOverpass(body, signal) {
  if (signal.aborted) throw _makeAbortError();

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    return await Promise.any(
      OVERPASS_ENDPOINTS.map((endpoint) => _fetchOverpassEndpoint(endpoint, body, controller.signal))
    );
  } finally {
    signal.removeEventListener("abort", onAbort);
    controller.abort();
  }
}

/**
 * Converts Overpass API elements into a GeoJSON FeatureCollection.
 * @param {Array<{lat: number, lon: number, tags: Object}>} elements
 * @returns {GeoJSON.FeatureCollection}
 */
function _toGeoJSON(elements) {
  return {
    type: "FeatureCollection",
    features: elements.map(el => {
      const tags = el.tags || {};
      const type = tags.highway || tags.traffic_calming || "unknown";
      const meta = TRAFFIC_META[type] || TRAFFIC_META.unknown;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [el.lon, el.lat] },
        properties: {
          type,
          icon: meta.icon,
          label: meta.label,
          summary: meta.summary,
        },
      };
    }),
  };
}

function _trafficPopupColor(type) {
  return ({
    traffic_signals: TRAFFIC_COLOR_SIGNAL,
    stop: TRAFFIC_COLOR_STOP,
    give_way: TRAFFIC_COLOR_YIELD,
    crossing: TRAFFIC_COLOR_CROSSING,
    bump: TRAFFIC_COLOR_CALMING,
    hump: TRAFFIC_COLOR_CALMING,
    table: TRAFFIC_COLOR_CALMING,
    cushion: TRAFFIC_COLOR_CALMING,
    mini_roundabout: TRAFFIC_COLOR_ROUNDABOUT,
  })[type] || TRAFFIC_COLOR_FALLBACK;
}

function _trafficPopupIcon(type) {
  const color = esc(_trafficPopupColor(type));
  const glyphs = {
    stop: `<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" fill="none" stroke="${color}" stroke-width="2.3" stroke-linejoin="round"/><path d="M7 12h10" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`,
    give_way: `<path d="M12 20 3.5 5h17z" fill="none" stroke="${color}" stroke-width="2.3" stroke-linejoin="round"/><path d="M9 10h6" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/>`,
    crossing: `<path d="M4 17h16" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/><path d="M7 16l2-8M11 16l2-8M15 16l2-8" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/>`,
    bump: `<path d="M3 16h18" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/><path d="M6 16c2.2-7 9.8-7 12 0" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/>`,
    hump: `<path d="M3 16h18" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/><path d="M6 16c2.2-7 9.8-7 12 0" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/>`,
    table: `<path d="M4 16h16" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/><path d="M7 16v-5h10v5" fill="none" stroke="${color}" stroke-width="2.3" stroke-linejoin="round"/>`,
    cushion: `<path d="M4 16h16" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/><path d="M6 16c2-5 5-5 7 0 1.4 3 3.5 3 5 0" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/>`,
    mini_roundabout: `<path d="M7.5 16.8a6.4 6.4 0 1 1 8.7.4" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/><path d="M16.2 17.2l.2-4 3.2 2.4" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`,
    traffic_signals: `<path d="M12 3.5v17" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/><path d="M7.5 5.5h9v13h-9z" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="12" cy="9" r="1.8" fill="${color}"/><circle cx="12" cy="15" r="1.8" fill="${color}"/>`,
  };
  return `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">${glyphs[type] || glyphs.traffic_signals}</svg>`;
}

function _onTrafficClick(e) {
  const feature = e.features?.[0];
  if (!feature) return;
  const props = feature.properties || {};
  const coords = feature.geometry?.coordinates?.slice();
  if (!coords) return;
  const type = String(props.type || "unknown");

  _trafficPopup?.remove();
  _trafficPopup = new maplibregl.Popup({
    closeButton: false,
    focusAfterOpen: false,
    maxWidth: "260px",
    offset: [0, -18],
    className: "place-popup-wrap traffic-popup-wrap",
  })
    .setLngLat(coords)
    .setHTML(`
      <div class="pp pp--traffic">
        <div class="pp-inner traffic-pop">
          <div class="pp-hdr traffic-pop-hdr">
            <span class="pp-icon traffic-pop-icon">${_trafficPopupIcon(type)}</span>
            <span class="pp-badge traffic-pop-badge">${esc(props.label || "Traffic detail")}</span>
          </div>
          <div class="traffic-pop-body">${esc(props.summary || "Mapped street-level traffic feature.")}</div>
        </div>
      </div>
    `)
    .addTo(map);
}

function _setTrafficCursor(cursor) {
  map.getCanvas().style.cursor = cursor;
}

function _snapCoord(value, direction) {
  const snapped = direction === "up"
    ? Math.ceil(value / CACHE_GRID_DEGREES) * CACHE_GRID_DEGREES
    : Math.floor(value / CACHE_GRID_DEGREES) * CACHE_GRID_DEGREES;
  return Number(snapped.toFixed(COORD_PRECISION));
}

/**
 * Returns a snapped bbox that is stable across small pans.
 * @param {maplibregl.LngLatBounds} bounds
 * @returns {{key: string, s: number, w: number, n: number, e: number}}
 */
function _trafficCacheBounds(bounds) {
  const s = _snapCoord(bounds.getSouth(), "down");
  const w = _snapCoord(bounds.getWest(), "down");
  const n = _snapCoord(bounds.getNorth(), "up");
  const e = _snapCoord(bounds.getEast(), "up");
  return {
    key: [s, w, n, e].map((coord) => coord.toFixed(COORD_PRECISION)).join(","),
    s,
    w,
    n,
    e,
  };
}

function _cacheStorageKey(key) {
  return `${CACHE_PREFIX}${key}`;
}

function _getCacheIndex() {
  try {
    const raw = window.localStorage?.getItem(CACHE_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function _setCacheIndex(keys) {
  try {
    window.localStorage?.setItem(CACHE_INDEX_KEY, JSON.stringify(keys.slice(0, CACHE_MAX_KEYS)));
  } catch {}
}

function _rememberCacheKey(key) {
  const keys = [key, ..._getCacheIndex().filter((item) => item !== key)];
  keys.slice(CACHE_MAX_KEYS).forEach((staleKey) => {
    _memoryCache.delete(staleKey);
    try {
      window.localStorage?.removeItem(_cacheStorageKey(staleKey));
    } catch {}
  });
  _setCacheIndex(keys);
}

function _getCachedFeatureCollection(key) {
  const cached = _memoryCache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    _rememberCacheKey(key);
    return cached.data;
  }
  if (cached) _memoryCache.delete(key);

  try {
    const raw = window.localStorage?.getItem(_cacheStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || Date.now() - parsed.createdAt >= CACHE_TTL_MS) {
      window.localStorage?.removeItem(_cacheStorageKey(key));
      return null;
    }
    _memoryCache.set(key, parsed);
    _rememberCacheKey(key);
    return parsed.data;
  } catch {
    return null;
  }
}

function _setCachedFeatureCollection(key, data) {
  const cached = { createdAt: Date.now(), data };
  _memoryCache.set(key, cached);
  _rememberCacheKey(key);
  try {
    window.localStorage?.setItem(_cacheStorageKey(key), JSON.stringify(cached));
  } catch {}
}

function _setTrafficData(data) {
  map.getSource(SOURCE_ID)?.setData(data);
}

/**
 * Fetches traffic nodes for the current viewport and updates the map source.
 * Races Overpass mirrors in parallel so one slow mirror cannot stall the layer.
 * @param {{warm?: boolean}} [options] - Whether to fetch for cache warming only.
 * @returns {Promise<void>}
 */
async function _fetchNodes(options = {}) {
  const warm = Boolean(options.warm);
  if (!_enabled && !warm) return;
  if (map.getZoom() < MIN_ZOOM) return;

  const bounds = _trafficCacheBounds(map.getBounds());
  const key    = bounds.key;
  if (key === _lastBboxKey) return;

  const cached = _getCachedFeatureCollection(key);
  if (cached) {
    _setTrafficData(cached);
    _lastBboxKey = key;
    return;
  }

  _abortController?.abort();
  _abortController = new AbortController();
  const requestController = _abortController;

  const s    = bounds.s.toFixed(COORD_PRECISION);
  const w    = bounds.w.toFixed(COORD_PRECISION);
  const n    = bounds.n.toFixed(COORD_PRECISION);
  const e    = bounds.e.toFixed(COORD_PRECISION);
  const body = `data=${encodeURIComponent(_buildQuery(s, w, n, e))}`;

  try {
    const json = await _fetchFirstOverpass(body, requestController.signal);
    const geojson = _toGeoJSON(json.elements || []);
    _setTrafficData(geojson);
    _setCachedFeatureCollection(key, geojson);
    _lastBboxKey = key;
  } catch (err) {
    if (requestController.signal.aborted || err.name === "AbortError") return;
    console.warn("Traffic overlay: all Overpass mirrors failed or timed out.", err.message);
  }
}

function _onViewChange() {
  if (!_enabled) {
    _scheduleWarmFetch();
    return;
  }
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(_fetchNodes, DEBOUNCE_MS);
}

function _scheduleWarmFetch() {
  if (_enabled || map.getZoom() < MIN_ZOOM) return;
  clearTimeout(_warmDebounceTimer);
  _warmDebounceTimer = setTimeout(() => _fetchNodes({ warm: true }), WARM_DEBOUNCE_MS);
}

/**
 * Enables or disables the traffic-detail map layers and fetch loop.
 * @param {boolean} enabled - Whether the traffic-detail overlay should be visible.
 * @returns {void}
 */
export function setTrafficDetailOverlay(enabled) {
  _enabled = Boolean(enabled);
  clearTimeout(_debounceTimer);
  clearTimeout(_warmDebounceTimer);

  if (!_enabled) {
    _abortController?.abort();
    _trafficPopup?.remove();
    _trafficPopup = null;
    _setLayerVisibility(false);
    return;
  }

  _ensureLayers();
  _setLayerVisibility(true);
  _fetchNodes();
}

/**
 * Returns whether the traffic-detail overlay is currently enabled.
 * @returns {boolean} True when traffic details are active.
 */
export function isTrafficDetailOverlayActive() {
  return _enabled;
}

/**
 * Repositions traffic-detail layers above base imagery and below labels.
 * @returns {void}
 */
export function refreshTrafficDetailOverlayLayers() {
  if (!_enabled) return;
  _ensureLayers();
  _refreshLayerOrder();
}

/**
 * Attaches map event listeners and runs the initial viewport fetch.
 * Call once after the map "load" event fires.
 */
export function initTrafficOverlay() {
  if (_initialized) return;
  _initialized = true;
  _ensureLayers();
  _setLayerVisibility(_enabled);
  map.on("moveend", _onViewChange);
  map.on("zoomend", _onViewChange);
  map.on("click", "traffic-detail-icons", _onTrafficClick);
  map.on("mouseenter", "traffic-detail-icons", () => _setTrafficCursor("pointer"));
  map.on("mouseleave", "traffic-detail-icons", () => _setTrafficCursor(""));
  if (_enabled) _fetchNodes();
  else _scheduleWarmFetch();
}
