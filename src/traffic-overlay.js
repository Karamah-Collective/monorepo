/**
 * Loads traffic node data from Overpass API and keeps the "traffic_nodes"
 * GeoJSON source up to date as the user pans or zooms.
 *
 * Features fetched: traffic signals, stop/give-way signs, pedestrian crossings,
 * speed-calming nodes (bumps/humps/tables), and mini-roundabouts.
 * Only active at zoom >= MIN_ZOOM to avoid flooding Overpass at city scale.
 */

import { map } from "./map-init.js";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const MIN_ZOOM       = 15;
const DEBOUNCE_MS    = 700;
const BBOX_PRECISION = 2; // degrees, for dedup key

let _debounceTimer     = null;
let _lastBboxKey       = null;
let _abortController   = null;

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
    `[out:json][timeout:20];(` +
    `node["highway"="traffic_signals"](${bbox});` +
    `node["highway"="stop"](${bbox});` +
    `node["highway"="give_way"](${bbox});` +
    `node["highway"="crossing"]["crossing"!="no"](${bbox});` +
    `node["traffic_calming"~"^(bump|hump|table|cushion)$"](${bbox});` +
    `node["highway"="mini_roundabout"](${bbox});` +
    `);out body;`
  );
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
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [el.lon, el.lat] },
        properties: {
          type: tags.highway || tags.traffic_calming || "unknown",
        },
      };
    }),
  };
}

/**
 * Returns a coarse bbox key used to skip redundant fetches.
 * @param {maplibregl.LngLatBounds} bounds
 * @returns {string}
 */
function _bboxKey(bounds) {
  return [
    bounds.getSouth().toFixed(BBOX_PRECISION),
    bounds.getWest().toFixed(BBOX_PRECISION),
    bounds.getNorth().toFixed(BBOX_PRECISION),
    bounds.getEast().toFixed(BBOX_PRECISION),
  ].join(",");
}

/**
 * Fetches traffic nodes for the current viewport and updates the map source.
 * Tries each Overpass endpoint in order, stopping on the first success.
 */
async function _fetchNodes() {
  if (map.getZoom() < MIN_ZOOM) return;

  const bounds = map.getBounds();
  const key    = _bboxKey(bounds);
  if (key === _lastBboxKey) return;

  _abortController?.abort();
  _abortController = new AbortController();

  const s    = bounds.getSouth().toFixed(5);
  const w    = bounds.getWest().toFixed(5);
  const n    = bounds.getNorth().toFixed(5);
  const e    = bounds.getEast().toFixed(5);
  const body = `data=${encodeURIComponent(_buildQuery(s, w, n, e))}`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal:  _abortController.signal,
      });
      if (!res.ok) continue;
      const json = await res.json();
      map.getSource("traffic_nodes")?.setData(_toGeoJSON(json.elements || []));
      _lastBboxKey = key;
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
      console.warn(`Traffic overlay: endpoint failed (${endpoint}) —`, err.message);
    }
  }
}

function _onViewChange() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(_fetchNodes, DEBOUNCE_MS);
}

/**
 * Attaches map event listeners and runs the initial viewport fetch.
 * Call once after the map "load" event fires.
 */
export function initTrafficOverlay() {
  map.on("moveend", _onViewChange);
  map.on("zoomend", _onViewChange);
  _fetchNodes();
}
