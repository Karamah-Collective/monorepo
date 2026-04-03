// ─── GPS Simulation Module ──────────────────────────────────────────────
// Turns the mouse cursor into a simulated GPS signal for testing navigation
// without physically moving. Activate with Shift+G or the GPS SIM button.
//
// How it works:
//   1. Mouse position on the map → map.unproject() → lat/lng
//   2. setCurrentLocationState() dispatches "hf:current-location-updated"
//   3. Navigation.js picks it up via the same event — step advancement,
//      off-route detection, rerouting all run exactly as with real GPS
//   4. Places.js uses it for distance sorting
//
// The app is completely unaware this is simulated. It treats every update
// identically to a real hardware GPS fix.

import { map } from "./map-init.js";
import { setCurrentLocationState, clearCurrentLocationState } from "./utils.js";

// ─── Constants ──────────────────────────────────────────────────────
const SIM_THROTTLE_MS = 100;  // feed position every 100 ms (10 Hz)
const SIM_ACCURACY = 5;       // metres — high-precision simulated fix

// ─── State ──────────────────────────────────────────────────────────
let _active = false;
let _marker = null;
let _indicatorEl = null;
let _lastFeedTime = 0;

/**
 * Toggle GPS simulation on/off.
 * @returns {void}
 */
export function toggleGpsSim() {
  if (_active) {
    _stopSim();
  } else {
    _startSim();
  }
}

/**
 * Whether GPS sim is currently active.
 * @returns {boolean}
 */
export function isGpsSimActive() {
  return _active;
}

function _startSim() {
  _active = true;

  // Stop real GPS tracking if active — avoids competing location sources
  // and duplicate markers. showCurrentLocation() toggles tracking off when
  // locWatchId is set and position is visible.
  _stopRealGpsIfActive();

  // Crosshair cursor signals sim mode
  map.getCanvas().style.cursor = "crosshair";

  _showIndicator();
  _ensureMarker();

  map.on("mousemove", _onMouseMove);
  map.on("click", _onMapClick);
}

function _stopSim() {
  _active = false;

  map.getCanvas().style.cursor = "";
  _hideIndicator();

  if (_marker) { _marker.remove(); _marker = null; }

  clearCurrentLocationState();

  map.off("mousemove", _onMouseMove);
  map.off("click", _onMapClick);
}

/**
 * Stop the real geolocation watch if it's currently active.
 * Uses the locate button's "tracking" class as a reliable indicator.
 */
function _stopRealGpsIfActive() {
  const locBtn = document.getElementById("locate-btn");
  if (locBtn && locBtn.classList.contains("tracking")) {
    // Clicking the locate button while tracking toggles GPS off
    locBtn.click();
  }
}

// ─── Mouse handlers ─────────────────────────────────────────────────

function _onMouseMove(e) {
  if (!_active) return;

  const now = Date.now();
  if (now - _lastFeedTime < SIM_THROTTLE_MS) return;
  _lastFeedTime = now;

  _feedPosition(e.lngLat.lat, e.lngLat.lng);
}

function _onMapClick(e) {
  if (!_active) return;
  // Click gives an immediate, precise fix (useful for testing exact points)
  _feedPosition(e.lngLat.lat, e.lngLat.lng);
}

// ─── Core position feed ─────────────────────────────────────────────

function _feedPosition(lat, lng) {
  // This is the single integration point. setCurrentLocationState dispatches
  // "hf:current-location-updated" — the exact same event real GPS produces.
  setCurrentLocationState({ lat, lng, accuracy: SIM_ACCURACY, active: true });

  if (_marker) {
    _marker.setLngLat([lng, lat]);
  }
}

// ─── Marker (reuses existing loc-marker CSS) ────────────────────────

function _ensureMarker() {
  if (_marker) return;

  const el = document.createElement("div");
  el.className = "loc-marker";
  el.innerHTML = '<div class="loc-ring"></div><div class="loc-puck"></div>';

  const center = map.getCenter();
  _marker = new maplibregl.Marker({ element: el })
    .setLngLat([center.lng, center.lat])
    .addTo(map);
}

// ─── Indicator badge ────────────────────────────────────────────────

function _showIndicator() {
  if (_indicatorEl) return;

  _indicatorEl = document.createElement("div");
  _indicatorEl.className = "gps-sim-badge";
  _indicatorEl.innerHTML = [
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
    '<circle cx="12" cy="12" r="3"/>',
    '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    '</svg>',
    '<span>GPS SIM</span>',
  ].join("");
  _indicatorEl.title = "GPS simulation active \u2014 mouse = GPS (Shift+G to toggle)";

  document.getElementById("app").appendChild(_indicatorEl);
}

function _hideIndicator() {
  if (_indicatorEl) {
    _indicatorEl.remove();
    _indicatorEl = null;
  }
}

// ─── Keyboard shortcut ──────────────────────────────────────────────

/**
 * Initialise GPS sim keyboard shortcut (Shift+G).
 * @returns {void}
 */
export function initGpsSim() {
  document.addEventListener("keydown", (e) => {
    // Shift+G — but not when typing in an input/textarea
    if (e.key === "G" && e.shiftKey && !e.target.closest("input, textarea, select")) {
      e.preventDefault();
      toggleGpsSim();
    }
  });
}
