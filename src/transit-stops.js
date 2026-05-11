import { map } from "./map-init.js";
import { DIGITRANSIT_URL, DIGITRANSIT_WALTTI_URL, DT_API_KEY } from "./config.js";
import { TRANSIT_COLORS, modeIcon } from "./icons.js";
import { esc, escA, copyToClipboard, showToast, shareUrl, encodeCompactPin, isPinSaved, toggleSavedPin, pinId, fadeAndRemovePopup } from "./utils.js";
import { dir, placeOriginMarker, autoSetNearestMosque, updateGoButton, openDirPanel, startPick } from "./directions.js";

const _starSVG = (filled) =>
  `<svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${filled ? "currentColor" : "none"}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

function _buildStopShareUrl(lat, lng, name) {
  return `${location.origin}${location.pathname}?p=${encodeCompactPin(+lat, +lng, map.getZoom(), true, name)}`;
}

let _stopPopupId = 0;
let _pendingStopOpen = null;
let _activeStopPopupKey = null;
let _activeStopPopup = null;
let _stopTouchListenersBound = false;
let _suppressStopClickUntil = 0;

const STOP_INTERACTIVE_LAYERS = ["transit-major-bg", "transit-tram-bg", "transit-bus-bg"];

function _toggleStopFeaturePopup(f) {
  const coords = f.geometry.coordinates.slice();
  const key = `${coords[0]},${coords[1]}`;
  if (_activeStopPopupKey === key) {
    if (_activeStopPopup) {
      fadeAndRemovePopup(_activeStopPopup);
      _activeStopPopup = null;
    }
    _activeStopPopupKey = null;
    return;
  }
  _openStopFeaturePopup(f);
}

function _pickNearestStopFeature(features, point) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const feature of features) {
    const [lng, lat] = feature.geometry.coordinates;
    const projected = map.project([lng, lat]);
    const dx = projected.x - point.x;
    const dy = projected.y - point.y;
    const distance = (dx * dx) + (dy * dy);
    if (distance < nearestDist) {
      nearest = feature;
      nearestDist = distance;
    }
  }
  return nearest;
}

function _tryOpenStopPopupFromTouch(clientX, clientY) {
  const canvas = map.getCanvas();
  const rect = canvas.getBoundingClientRect();
  const point = { x: clientX - rect.left, y: clientY - rect.top };
  if (point.x < 0 || point.y < 0 || point.x > rect.width || point.y > rect.height) return false;
  const radius = 22;
  const features = map.queryRenderedFeatures(
    [[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]],
    { layers: STOP_INTERACTIVE_LAYERS },
  );
  if (!features.length) return false;
  const feature = _pickNearestStopFeature(features, point);
  if (!feature) return false;
  _suppressStopClickUntil = Date.now() + 500;
  _toggleStopFeaturePopup(feature);
  return true;
}

function _bindStopTouchHandlers() {
  if (_stopTouchListenersBound) return;
  const canvas = map.getCanvas();
  if (!canvas) return;

  let touchStart = null;
  let touchMoved = false;
  const moveLimit = 12;

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) {
      touchStart = null;
      touchMoved = false;
      return;
    }
    const touch = e.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
    touchMoved = false;
  }, { passive: true });

  canvas.addEventListener("touchmove", (e) => {
    if (!touchStart || e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (
      Math.abs(touch.clientX - touchStart.x) > moveLimit ||
      Math.abs(touch.clientY - touchStart.y) > moveLimit
    ) {
      touchMoved = true;
    }
  }, { passive: true });

  canvas.addEventListener("touchend", (e) => {
    if (!touchStart || touchMoved || e.changedTouches.length !== 1) {
      touchStart = null;
      touchMoved = false;
      return;
    }
    const touch = e.changedTouches[0];
    _tryOpenStopPopupFromTouch(touch.clientX, touch.clientY);
    touchStart = null;
    touchMoved = false;
  }, { passive: true });

  canvas.addEventListener("touchcancel", () => {
    touchStart = null;
    touchMoved = false;
  }, { passive: true });

  _stopTouchListenersBound = true;
}

function _openStopFeaturePopup(f) {
  const { name, type, code, region } = f.properties;
  const CSS_TRANSIT_VAR = { bus: "var(--hsl-bus)", tram: "var(--hsl-tram)", metro: "var(--hsl-metro)", train: "var(--hsl-rail)", ferry: "var(--hsl-ferry)" };
  const color = f.properties.dotColor ||
    ((type === "bus" && region === "turku") ? "var(--hsl-foli)" : (CSS_TRANSIT_VAR[type] || "var(--accent)"));
  const lngLat = f.geometry.coordinates.slice();
  const modeKey = { bus: "BUS", tram: "TRAM", metro: "SUBWAY", train: "RAIL", ferry: "FERRY" }[type] || "BUS";
  const svgIcon = modeIcon(modeKey, 14);
  const popId = ++_stopPopupId;
  const routesDivId = `stop-routes-${popId}`;

  const displayName = name || "Unnamed stop";
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const codeStr = code ? ` <span class="sp-code">${esc(code)}</span>` : "";
  const lat = lngLat[1], lng = lngLat[0];
  const saved = isPinSaved(lat, lng);
  const html = `
        <div class="sp">
          <div class="sp-inner">
            <div class="sp-hdr" style="--stop-c:${color}">
              <span class="sp-icon">${svgIcon}</span>
              <span class="sp-badge">${typeLabel}${codeStr}</span>
            </div>
            <div class="sp-title">${esc(displayName)}</div>
            <div class="sp-routes" id="${routesDivId}"></div>
            <div class="sp-actions">
              <button class="sp-dir-btn" title="Directions" aria-label="Directions">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-6 6"/><path d="M4 20v-6a4 4 0 0 1 4-4h12"/></svg>
              </button>
              <button class="sp-share-btn" title="Share this stop" aria-label="Share this stop">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
              <button class="sp-close-btn" title="Close" aria-label="Close popup">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
              </button>
            </div>
          </div>
          <button class="sp-fav-btn${saved ? ' active' : ''}" aria-label="${saved ? 'Remove from saved' : 'Save stop'}">${_starSVG(saved)}</button>
        </div>`;

  const popup = new maplibregl.Popup({ offset: 14, maxWidth: "320px", focusAfterOpen: false, className: "stop-popup-wrap" })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);

  _activeStopPopupKey = `${lngLat[0]},${lngLat[1]}`;
  _activeStopPopup = popup;

  const popEl = popup.getElement();
  let tip = null;
  let tipBadge = null;
  const _hasHoverTransit = window.matchMedia("(hover: hover)").matches;
  function showBadgeTip(badge) {
    if (!badge) return;
    if (!tip) { tip = document.createElement("div"); tip.className = "sp-tip"; document.body.appendChild(tip); }
    tip.textContent = badge.dataset.tip;
    const rect = badge.getBoundingClientRect();
    tip.style.left = rect.left + rect.width / 2 + "px";
    tip.style.top = rect.top - 8 + "px";
    tip.style.transform = "translate(-50%, -100%)";
    tipBadge = badge;
    requestAnimationFrame(() => tip.classList.add("visible"));
  }
  function hideBadgeTip() { if (tip) tip.classList.remove("visible"); tipBadge = null; }
  if (_hasHoverTransit) {
    popEl.addEventListener("mouseenter", (ev) => {
      const badge = ev.target.closest(".sp-chip[data-tip]");
      if (badge) showBadgeTip(badge);
    }, true);
    popEl.addEventListener("mouseleave", (ev) => {
      const badge = ev.target.closest(".sp-chip[data-tip]");
      if (badge) hideBadgeTip();
    }, true);
  }
  popEl.addEventListener("click", (ev) => {
    const badge = ev.target.closest(".sp-chip[data-tip]");
    if (badge) { if (tipBadge === badge) hideBadgeTip(); else showBadgeTip(badge); return; }
    hideBadgeTip();

    const favBtn  = ev.target.closest(".sp-fav-btn");
    const dirBtn  = ev.target.closest(".sp-dir-btn");
    const shrBtn  = ev.target.closest(".sp-share-btn");
    const clsBtn  = ev.target.closest(".sp-close-btn");

    if (favBtn) {
      const stopName = displayName || `${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}`;
      const nowSaved = !isPinSaved(lat, lng);
      toggleSavedPin(lat, lng, stopName);
      favBtn.classList.toggle("active", nowSaved);
      favBtn.setAttribute("aria-label", nowSaved ? "Remove from saved" : "Save stop");
      favBtn.innerHTML = _starSVG(nowSaved);
      showToast(nowSaved ? "Stop saved" : "Stop removed", "check");
    } else if (dirBtn) {
      const stopName = displayName || `${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}`;
      dir.origin = { lat, lng, name: stopName };
      document.getElementById("dir-from").value = stopName;
      placeOriginMarker(lng, lat);
      autoSetNearestMosque(lat, lng);
      updateGoButton();
      fadeAndRemovePopup(popup);
      openDirPanel();
      if (!dir.dest) startPick("to");
    } else if (shrBtn) {
      shareUrl(_buildStopShareUrl(lat, lng, displayName), displayName, `${displayName} – Halal Finder`);
    } else if (clsBtn) {
      fadeAndRemovePopup(popup);
    }
  }, true);
  popup.on("close", () => {
    if (_activeStopPopupKey === `${lngLat[0]},${lngLat[1]}`) _activeStopPopupKey = null;
    if (_activeStopPopup === popup) _activeStopPopup = null;
    if (tip) { tip.remove(); tip = null; tipBadge = null; }
  });

  const routesJson = f.properties.routes;
  let cachedRoutes = [];
  if (Array.isArray(routesJson)) cachedRoutes = routesJson;
  else { try { cachedRoutes = routesJson ? JSON.parse(routesJson) : []; } catch (_) {} }

  if (cachedRoutes.length > 0) {
    renderStopRoutes(routesDivId, cachedRoutes, color);
  } else {
    const el = document.getElementById(routesDivId);
    if (el) el.innerHTML = '<div class="sp-skel-routes"><div class="skel-bone sp-skel-chip"></div><div class="skel-bone sp-skel-chip"></div><div class="skel-bone sp-skel-chip"></div><div class="skel-bone sp-skel-chip"></div></div>';
    const expectedMode = { bus: "BUS", tram: "TRAM", metro: "SUBWAY", train: "RAIL", ferry: "FERRY" }[type] || null;
    const fetchPromise = f.properties.noCoverage
      ? fetchStopRoutesFromOSM(lngLat[1], lngLat[0])
      : fetchStopRoutes(lngLat[1], lngLat[0], code, expectedMode);
    fetchPromise
      .then((routes) => {
        const compact = (routes || []).map((r) => ({
          s: r.shortName || "?", m: r.mode, l: r.longName || "", t: r.type || 0,
          ...(r.color ? { c: r.color } : {}),
          ...(r.textColor ? { tc: r.textColor } : {}),
        }));
        const seen = new Set();
        const unique = compact.filter((r) => { const k = `${r.s}_${r.m}`; if (seen.has(k)) return false; seen.add(k); return true; });
        const livePrimary = renderStopRoutes(routesDivId, unique, color);
        if (livePrimary) {
          const hdr = popup.getElement()?.querySelector(".sp-hdr");
          if (hdr) hdr.style.setProperty("--stop-c", livePrimary);
        }
      })
      .catch(() => {
        const el = document.getElementById(routesDivId);
        if (el) el.innerHTML = '<span class="sp-empty">Could not load routes</span>';
      });
  }
}

function _triggerStopOpen(lat, lng) {
  const pt = map.project([lng, lat]);
  const R = 18;
  const features = map.queryRenderedFeatures(
    [[pt.x - R, pt.y - R], [pt.x + R, pt.y + R]],
    { layers: ["transit-major-bg", "transit-tram-bg", "transit-bus-bg"] }
  );
  if (features.length) {
    _openStopFeaturePopup(features[0]);
    return;
  }
  // Features may not be rendered yet — try source data directly
  const src = map.getSource("transit-stops");
  if (src) {
    const all = map.querySourceFeatures("transit-stops");
    if (all.length) {
      let best = null, bestD = Infinity;
      for (const f of all) {
        const [fLng, fLat] = f.geometry.coordinates;
        const d = (fLat - lat) ** 2 + (fLng - lng) ** 2;
        if (d < bestD) { bestD = d; best = f; }
      }
      // ~0.0003° ≈ 30 m tolerance
      if (best && bestD < 9e-8) { _openStopFeaturePopup(best); return; }
    }
  }
  // Last resort: wait one idle cycle then retry once before falling back
  const onIdle = () => {
    map.off("idle", onIdle);
    const pt2 = map.project([lng, lat]);
    const found = map.queryRenderedFeatures(
      [[pt2.x - R, pt2.y - R], [pt2.x + R, pt2.y + R]],
      { layers: ["transit-major-bg", "transit-tram-bg", "transit-bus-bg"] }
    );
    if (found.length) { _openStopFeaturePopup(found[0]); }
    else { window.dispatchEvent(new CustomEvent("hf:show-search-marker", { detail: { lng, lat } })); }
  };
  map.on("idle", onIdle);
}

window.addEventListener("hf:open-stop", ({ detail: { lat, lng } }) => {
  if (map.getSource("transit-stops")) {
    _triggerStopOpen(lat, lng);
  } else {
    _pendingStopOpen = { lat, lng };
  }
});

// ── Region bounding boxes (south,west,north,east) ─────────────────────────────
// Each city served by Digitransit HSL or Waltti. Used by Overpass fallback and
// route-endpoint selection. Keep in sync with build-cache.js & directions.js.
const REGION_BBOXES = [
  { id: "hsl",          bbox: "59.90,24.30,60.70,25.80" },
  { id: "turku",        bbox: "60.15,21.70,60.70,22.60" },
  { id: "tampere",      bbox: "61.30,23.30,61.70,24.20" },
  { id: "lahti",        bbox: "60.85,25.45,61.15,25.95" },
  { id: "jyvaskyla",    bbox: "62.10,25.50,62.40,26.10" },
  { id: "kuopio",       bbox: "62.75,27.40,63.05,27.95" },
  { id: "oulu",         bbox: "64.85,25.20,65.15,25.75" },
  { id: "joensuu",      bbox: "62.50,29.55,62.72,29.95" },
  { id: "lappeenranta", bbox: "60.95,28.00,61.20,28.40" },
  { id: "hameenlinna",  bbox: "60.90,24.30,61.10,24.65" },
  { id: "kotka",        bbox: "60.38,26.75,60.55,27.10" },
  { id: "kouvola",      bbox: "60.78,26.55,60.98,26.95" },
  { id: "mikkeli",      bbox: "61.60,27.10,61.75,27.50" },
  { id: "vaasa",        bbox: "63.00,21.45,63.20,21.80" },
  { id: "pori",         bbox: "61.40,21.60,61.65,22.00" },
  { id: "rovaniemi",    bbox: "66.40,25.55,66.60,25.95" },
  { id: "kajaani",      bbox: "64.13,27.60,64.30,27.95" },
  { id: "kokkola",      bbox: "63.80,23.00,63.90,23.25" },
  { id: "seinajoki",   bbox: "62.70,22.75,62.87,22.95" },
];
// Finland-wide bbox for rail stations (VR intercity trains between cities)
const RAIL_BBOX = "59.40,19.00,70.20,31.70";

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
  const bboxes = REGION_BBOXES.map(r => r.bbox);
  const nodeTypes = [
    `node["railway"="station"]["station"!="abandoned"]`,
    `node["railway"="halt"]`,
    `node["railway"="tram_stop"]`,
    `node["station"="subway"]`,
    `node["railway"="subway_entrance"]`,
    `node["amenity"="ferry_terminal"]`,
    `node["amenity"="bus_station"]`,
    `node["highway"="bus_stop"]["bus"="yes"]`,
    `node["highway"="bus_stop"]["public_transport"="platform"]`,
  ];
  // Rail-only types for Finland-wide coverage (intercity VR trains)
  const railTypes = [
    `node["railway"="station"]["station"!="abandoned"]`,
    `node["railway"="halt"]`,
  ];
  const query = `[out:json][timeout:90];(${bboxes.flatMap(bb => nodeTypes.map(t => `${t}(${bb})`)).join(";")};\
${railTypes.map(t => `${t}(${RAIL_BBOX})`).join(";")};);out body;`;
  const server = OVERPASS_SERVERS[retries % OVERPASS_SERVERS.length];
  console.log(`[Transit] Fallback: loading from ${server} (attempt ${retries + 1})…`);
  try {
    const resp = await fetch(server, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(45000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.elements || !data.elements.length) throw new Error("Empty response");
    console.log(`[Transit] Got ${data.elements.length} stops from Overpass`);
    const features = deduplicateStops(
      data.elements
        .filter((el) => {
          if (!el.tags || !(el.tags.name || el.tags["name:en"])) return false;
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

const TRANSIT_CACHE_KEY = "hf_transit_v3";
const TRANSIT_TTL = 24 * 60 * 60 * 1000; // 24 h

export async function loadTransitCache() {
  // Serve from localStorage if cached within the last 24 h
  try {
    const raw = localStorage.getItem(TRANSIT_CACHE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.ts && Date.now() - saved.ts < TRANSIT_TTL) {
        console.log(`[Transit] localStorage hit (age: ${Math.round((Date.now() - saved.ts) / 60000)}m)`);
        for (const f of saved.geojson.features) f.properties._cached = 1;
        processTransitStops(saved.geojson);
        return;
      }
    }
  } catch { /* corrupted entry — fall through */ }

  console.log("[Transit] Loading cached stops…");
  try {
    const resp = await fetch("scripts/transit-cache.json", { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const cache = await resp.json();
    console.log(`[Transit] Cache v${cache.version}, ${cache.stopCount} stops, generated ${cache.generated}`);
    const geojson = cache.geojson;
    for (const f of geojson.features) {
      f.properties.routes = JSON.stringify(f.properties.routes || []);
      f.properties._cached = 1;
    }
    try { localStorage.setItem(TRANSIT_CACHE_KEY, JSON.stringify({ geojson, ts: Date.now() })); }
    catch { /* storage quota exceeded */ }
    processTransitStops(geojson);
  } catch (err) {
    console.warn("[Transit] Cache load failed:", err.message, "— falling back to Overpass API");
    loadTransitStopsFromAPI();
  }
}

function processTransitStops(geojson) {
  if (!geojson?.features?.length) return;
  if (map.getSource("transit-stops")) { console.log("[Transit] Source already exists, skipping"); return; }

  // Precompute dotColor and hasRoutes so we can hide empty stops from the map.
  // Stops from the pre-built cache have full route data; Overpass stops have
  // routes="[]" (unknown), so we default to visible (1) for those.
  let hidden = 0;
  for (const f of geojson.features) {
    const raw = f.properties.routes;
    let routes = [];
    if (Array.isArray(raw)) routes = raw;
    else { try { routes = raw ? JSON.parse(raw) : []; } catch (_) {} }
    const firstColored = routes.find(r => r.c);
    if (firstColored) {
      f.properties.dotColor = `#${firstColored.c}`;
      // Compute a contrast-safe label color for map text.
      // Bright GTFS colors (yellow, cyan, lime) are near-invisible as text on
      // light map backgrounds even with a white halo. Darken those by mixing
      // with a dark tone when relative luminance exceeds the threshold.
      const hex = firstColored.c;
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 0.38) {
        // Mix 72% original + 28% dark (#222) to pull bright colors into readable range
        const dr = Math.round(parseInt(hex.substring(0, 2), 16) * 0.72 + 0x22 * 0.28);
        const dg = Math.round(parseInt(hex.substring(2, 4), 16) * 0.72 + 0x22 * 0.28);
        const db = Math.round(parseInt(hex.substring(4, 6), 16) * 0.72 + 0x22 * 0.28);
        f.properties.labelColor = `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
      }
    }
    // Cache data has confirmed route info; Overpass data has no route info.
    // Hide only stops confirmed to have zero routes (from cache).
    // Stops flagged noCoverage=1 lack GTFS data for their region — keep visible.
    const fromCache = f.properties._cached === 1;
    f.properties.hasRoutes = (fromCache && routes.length === 0 && !f.properties.noCoverage) ? 0 : 1;
    if (!f.properties.hasRoutes) hidden++;
  }
  if (hidden) console.log(`[Transit] Hiding ${hidden} stops with no active routes`);

  map.addSource("transit-stops", { type: "geojson", data: geojson });

  map.addLayer({
    id: "transit-major-bg",
    type: "circle",
    source: "transit-stops",
    filter: ["all", [">=", ["get", "rank"], 2], ["==", ["get", "hasRoutes"], 1]],
    minzoom: 11,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 10, 19, 14],
      "circle-color": ["coalesce", ["get", "dotColor"], ["match", ["get", "type"], "train", TRANSIT_COLORS.train, "metro", TRANSIT_COLORS.metro, "ferry", TRANSIT_COLORS.ferry, "#999"]],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
      "circle-opacity": 0.95,
    },
  });
  map.addLayer({
    id: "transit-major-label",
    type: "symbol",
    source: "transit-stops",
    filter: ["all", [">=", ["get", "rank"], 2], ["==", ["get", "hasRoutes"], 1]],
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
      "text-color": ["coalesce", ["get", "labelColor"], ["get", "dotColor"], ["match", ["get", "type"], "train", TRANSIT_COLORS.train, "metro", TRANSIT_COLORS.metro, "ferry", TRANSIT_COLORS.ferry, "#555"]],
      "text-halo-color": "#fff",
      "text-halo-width": 1.5,
    },
  });
  map.addLayer({
    id: "transit-tram-bg",
    type: "circle",
    source: "transit-stops",
    filter: ["all", ["==", ["get", "type"], "tram"], ["==", ["get", "hasRoutes"], 1]],
    minzoom: 14,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 3.5, 18, 8],
      "circle-color": ["coalesce", ["get", "dotColor"], TRANSIT_COLORS.tram],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#fff",
      "circle-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "transit-tram-label",
    type: "symbol",
    source: "transit-stops",
    filter: ["all", ["==", ["get", "type"], "tram"], ["==", ["get", "hasRoutes"], 1]],
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
    paint: { "text-color": ["coalesce", ["get", "labelColor"], ["get", "dotColor"], TRANSIT_COLORS.tram], "text-halo-color": "#fff", "text-halo-width": 1.2 },
  });
  map.addLayer({
    id: "transit-bus-bg",
    type: "circle",
    source: "transit-stops",
    filter: ["all", ["==", ["get", "type"], "bus"], ["==", ["get", "hasRoutes"], 1]],
    minzoom: 15,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2.5, 18, 6],
      "circle-color": ["coalesce", ["get", "dotColor"], ["match", ["get", "region"], "turku", TRANSIT_COLORS.foli_bus, TRANSIT_COLORS.bus]],
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
      "circle-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "transit-bus-label",
    type: "symbol",
    source: "transit-stops",
    filter: ["all", ["==", ["get", "type"], "bus"], ["==", ["get", "hasRoutes"], 1]],
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
    paint: { "text-color": ["coalesce", ["get", "labelColor"], ["get", "dotColor"], ["match", ["get", "region"], "turku", TRANSIT_COLORS.foli_bus, TRANSIT_COLORS.bus]], "text-halo-color": "#fff", "text-halo-width": 1.2 },
  });

  STOP_INTERACTIVE_LAYERS.forEach((layerId) => {
    map.on("click", layerId, (e) => {
      if (Date.now() < _suppressStopClickUntil) return;
      const f = e.features[0];
      _toggleStopFeaturePopup(f);
    });
    map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
  });

  _bindStopTouchHandlers();

  if (_pendingStopOpen) {
    const { lat, lng } = _pendingStopOpen;
    _pendingStopOpen = null;
    // Give the map one frame to finish rendering the new features
    requestAnimationFrame(() => _triggerStopOpen(lat, lng));
  }
  console.log(`[Transit] Loaded ${geojson.features.length} transit stops`);
}

function renderStopRoutes(divId, routes, fallbackColor) {
  const el = document.getElementById(divId);
  if (!el) return null;
  if (!routes || routes.length === 0) { el.innerHTML = '<span class="sp-empty">No routes</span>'; return null; }
  const modeOrder = { RAIL: 0, SUBWAY: 1, FERRY: 2, TRAM: 3, BUS: 4 };
  routes.sort((a, b) => (modeOrder[a.m] ?? 5) - (modeOrder[b.m] ?? 5));
  const firstColored = routes.find(r => r.c);
  const primaryColor = firstColored ? `#${firstColored.c}` : null;
  let lastMode = null;
  const CSS_MODE_VAR = { BUS: "var(--hsl-bus)", TRAM: "var(--hsl-tram)", SUBWAY: "var(--hsl-metro)", RAIL: "var(--hsl-rail)", FERRY: "var(--hsl-ferry)" };
  el.innerHTML = routes
    .map((r) => {
      const isTrunk = r.m === "BUS" && r.t === 702;
      const rColor = r.c
        ? `#${r.c}`
        : isTrunk
          ? "var(--hsl-trunk)"
          : (CSS_MODE_VAR[r.m] || fallbackColor);
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
  return primaryColor;
}

// Pick the right Digitransit endpoint based on stop coordinates.
// HSL stops use the HSL endpoint; all other Finnish cities use Waltti.
function pickDtEndpoint(lat, lon) {
  // HSL region check (Helsinki / Espoo / Vantaa / etc.)
  if (lat >= 59.9 && lat <= 60.7 && lon >= 24.3 && lon <= 25.8) return DIGITRANSIT_URL;
  return DIGITRANSIT_WALTTI_URL;
}

async function fetchStopRoutes(lat, lon, stopCode, expectedMode) {
  const filterMode = (routes) => {
    if (!routes) return [];
    return expectedMode ? routes.filter((r) => r.mode === expectedMode) : routes;
  };
  const needStation = !stopCode && ["SUBWAY", "RAIL", "FERRY"].includes(expectedMode);
  const query = `{
    nearest(lat: ${lat}, lon: ${lon}, maxResults: 15, maxDistance: 400, filterByPlaceTypes: [STOP]) {
      edges { node { place { ... on Stop { name code gtfsId routes { shortName mode longName type color textColor } } } distance } }
    }
    ${needStation ? `stations: nearest(lat: ${lat}, lon: ${lon}, maxResults: 3, maxDistance: 500, filterByPlaceTypes: [STATION]) {
      edges { node { place { ... on Stop { name gtfsId stops { name code routes { shortName mode longName type color textColor } } } } distance } }
    }` : ""}
  }`;
  const resp = await fetch(pickDtEndpoint(lat, lon), {
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

async function fetchStopRoutesFromOSM(lat, lon) {
  const query = `[out:json][timeout:10];(node(around:80,${lat},${lon})["highway"="bus_stop"];node(around:80,${lat},${lon})["public_transport"="stop_position"];node(around:80,${lat},${lon})["public_transport"="platform"];)->.nearby;rel(bn.nearby)["route"="bus"];out tags;`;
  for (const server of OVERPASS_SERVERS) {
    try {
      const resp = await fetch(server, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      return (data.elements || [])
        .filter(el => el.type === "relation")
        .map(rel => {
          const rawColour = rel.tags?.colour || "";
          const hex = rawColour.replace("#", "");
          const color = /^[0-9a-f]{6}$/i.test(hex) ? hex : null;
          return {
            shortName: rel.tags?.ref || "?",
            mode: "BUS",
            longName: rel.tags?.name || "",
            type: 0,
            color,
          };
        });
    } catch { continue; }
  }
  return [];
}
// 