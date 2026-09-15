// ─── GPS Simulation Module ──────────────────────────────────────────────
// Simulated GPS signal for testing navigation without physically moving.
// Desktop: mouse cursor = GPS position. Mobile: tap to set position.
// Route Playback: auto-walk along a computed route at configurable speed.
//
// Activation:
//   - Shift+G keyboard shortcut (desktop)
//   - ?sim URL parameter (auto-activates on load — ideal for phones)
//   - Tap the GPS SIM badge to stop
//
// How it works:
//   1. Mouse/tap position on the map → map.unproject() → lat/lng
//   2. setCurrentLocationState() dispatches "hf:current-location-updated"
//   3. Navigation.js picks it up via the same event — step advancement,
//      off-route detection, rerouting all run exactly as with real GPS
//   4. Places.js uses it for distance sorting
//
// The app is completely unaware this is simulated. It treats every update
// identically to a real hardware GPS fix.

import { map } from "./map-init.js";
import { setCurrentLocationState, clearCurrentLocationState, haversineDistance } from "./utils.js";
import { dir, decodePolyline } from "./directions.js";

// ─── Constants ──────────────────────────────────────────────────────
const SIM_THROTTLE_MS = 100;  // feed position every 100 ms (10 Hz)
const SIM_ACCURACY = 5;       // metres — high-precision simulated fix

/** @type {{ label: string, mps: number }[]} */
const PLAYBACK_SPEEDS = [
  { label: "\u{1F6B6}", mps: 1.4 },     // 🚶 ~5 km/h
  { label: "\u{1F6B2}", mps: 4.2 },     // 🚲 ~15 km/h
  { label: "\u{1F697}", mps: 11.1 },    // 🚗 ~40 km/h
  { label: "\u26A1",    mps: 27.8 },    // ⚡ ~100 km/h
];
const DEFAULT_SPEED_IDX = 2; // drive

// ─── State ──────────────────────────────────────────────────────────
let _active = false;
let _marker = null;
let _indicatorEl = null;
let _controlsEl = null;
let _lastFeedTime = 0;

// Route playback state
let _playbackRunning = false;
let _playbackPaused = false;
let _playbackRafId = null;
let _playbackCoords = [];       // [lng,lat][] route to follow
let _playbackCumDist = [];      // cumulative distance in metres at each coord
let _playbackTotalM = 0;
let _playbackProgressM = 0;
let _playbackSpeedIdx = DEFAULT_SPEED_IDX;
let _playbackLastTs = 0;

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

  // Crosshair cursor signals sim mode (desktop)
  map.getCanvas().style.cursor = "crosshair";

  _showIndicator();
  _showControls();
  _ensureMarker();

  map.on("mousemove", _onMouseMove);
  map.on("click", _onMapClick);
}

function _stopSim() {
  _active = false;
  _stopPlayback();

  map.getCanvas().style.cursor = "";
  _hideIndicator();
  _hideControls();

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
    locBtn.click();
  }
}

// ─── Mouse/touch handlers ───────────────────────────────────────────

function _onMouseMove(e) {
  if (!_active || _playbackRunning) return;

  const now = Date.now();
  if (now - _lastFeedTime < SIM_THROTTLE_MS) return;
  _lastFeedTime = now;

  _feedPosition(e.lngLat.lat, e.lngLat.lng);
}

function _onMapClick(e) {
  if (!_active || _playbackRunning) return;
  _feedPosition(e.lngLat.lat, e.lngLat.lng);
}

// ─── Core position feed ─────────────────────────────────────────────

function _feedPosition(lat, lng) {
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

// ─── Route Playback Engine ──────────────────────────────────────────

/**
 * Build the playback coordinate list from the current route.
 * @returns {boolean} True if a route was found and coords built.
 */
function _buildPlaybackRoute() {
  _playbackCoords = [];
  _playbackCumDist = [0];
  _playbackTotalM = 0;

  // Direct routes (drive/walk/cycle)
  if (dir.directRouteCoords && dir.directRouteCoords.length >= 2) {
    _playbackCoords = dir.directRouteCoords.slice();
  }
  // Transit routes — decode all leg polylines
  else if (dir.itineraries.length > 0 && dir.activeIdx >= 0) {
    const itin = dir.itineraries[dir.activeIdx];
    if (!itin || !itin.legs) return false;
    for (const leg of itin.legs) {
      if (!leg.legGeometry?.points) continue;
      const coords = decodePolyline(leg.legGeometry.points, leg.legGeometry.precision || 5);
      coords.forEach(c => _playbackCoords.push(c));
    }
  }

  if (_playbackCoords.length < 2) return false;

  // Build cumulative distance array (metres)
  let total = 0;
  for (let i = 1; i < _playbackCoords.length; i++) {
    const [ax, ay] = _playbackCoords[i - 1]; // [lng, lat]
    const [bx, by] = _playbackCoords[i];
    total += haversineDistance(ay, ax, by, bx) * 1000; // km → m
    _playbackCumDist.push(total);
  }
  _playbackTotalM = total;

  return true;
}

/**
 * Interpolate a [lng, lat] position along the playback route at a given metre offset.
 * @param {number} distM - Distance in metres from route start.
 * @returns {number[]} [lng, lat]
 */
function _interpolateAtM(distM) {
  if (distM <= 0) return _playbackCoords[0];
  if (distM >= _playbackTotalM) return _playbackCoords[_playbackCoords.length - 1];

  // Binary search for the segment containing distM
  let lo = 0, hi = _playbackCumDist.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (_playbackCumDist[mid] <= distM) lo = mid;
    else hi = mid;
  }

  const segStart = _playbackCumDist[lo];
  const segEnd = _playbackCumDist[hi];
  const segLen = segEnd - segStart;
  const t = segLen > 0 ? (distM - segStart) / segLen : 0;

  const [ax, ay] = _playbackCoords[lo];
  const [bx, by] = _playbackCoords[hi];
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

function _startPlayback() {
  if (!_active) return;
  if (!_buildPlaybackRoute()) return;

  _playbackRunning = true;
  _playbackPaused = false;
  _playbackProgressM = 0;
  _playbackLastTs = 0;

  // Place marker at route start
  const [lng, lat] = _playbackCoords[0];
  _feedPosition(lat, lng);

  _updateControlsState();
  _playbackRafId = requestAnimationFrame(_playbackFrame);
}

function _stopPlayback() {
  _playbackRunning = false;
  _playbackPaused = false;
  if (_playbackRafId) {
    cancelAnimationFrame(_playbackRafId);
    _playbackRafId = null;
  }
  _playbackLastTs = 0;
  _playbackProgressM = 0;
  _updateControlsState();
}

function _togglePlaybackPause() {
  if (!_playbackRunning) return;
  _playbackPaused = !_playbackPaused;
  if (!_playbackPaused) {
    _playbackLastTs = 0; // reset dt to avoid time jump
    _playbackRafId = requestAnimationFrame(_playbackFrame);
  }
  _updateControlsState();
}

function _playbackFrame(timestamp) {
  if (!_playbackRunning || _playbackPaused) return;

  if (_playbackLastTs === 0) {
    _playbackLastTs = timestamp;
    _playbackRafId = requestAnimationFrame(_playbackFrame);
    return;
  }

  const dt = (timestamp - _playbackLastTs) / 1000;
  _playbackLastTs = timestamp;

  const speed = PLAYBACK_SPEEDS[_playbackSpeedIdx].mps;
  _playbackProgressM += speed * dt;

  if (_playbackProgressM >= _playbackTotalM) {
    // Reached destination
    const end = _playbackCoords[_playbackCoords.length - 1];
    _feedPosition(end[1], end[0]);
    _stopPlayback();
    return;
  }

  const [lng, lat] = _interpolateAtM(_playbackProgressM);
  _feedPosition(lat, lng);

  _playbackRafId = requestAnimationFrame(_playbackFrame);
}

function _setPlaybackSpeed(idx) {
  _playbackSpeedIdx = idx;
  _updateControlsState();
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
    '<button class="gps-sim-close" title="Stop GPS sim" aria-label="Stop GPS simulation">',
    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    '</button>',
  ].join("");
  _indicatorEl.title = "GPS simulation active";

  // Close button stops sim
  _indicatorEl.querySelector(".gps-sim-close").addEventListener("click", (e) => {
    e.stopPropagation();
    _stopSim();
  });

  document.getElementById("app").appendChild(_indicatorEl);
}

function _hideIndicator() {
  if (_indicatorEl) {
    _indicatorEl.remove();
    _indicatorEl = null;
  }
}

// ─── Playback Controls ─────────────────────────────────────────────

function _showControls() {
  if (_controlsEl) return;

  _controlsEl = document.createElement("div");
  _controlsEl.className = "gps-sim-controls";

  // Play/Pause button
  const playBtn = document.createElement("button");
  playBtn.className = "gps-sim-play-btn";
  playBtn.title = "Play route";
  playBtn.setAttribute("aria-label", "Play route simulation");
  playBtn.addEventListener("click", () => {
    if (!_playbackRunning) _startPlayback();
    else _togglePlaybackPause();
  });
  _controlsEl.appendChild(playBtn);

  // Speed buttons
  const speedGroup = document.createElement("div");
  speedGroup.className = "gps-sim-speeds";
  PLAYBACK_SPEEDS.forEach((sp, i) => {
    const btn = document.createElement("button");
    btn.className = "gps-sim-speed-btn";
    btn.textContent = sp.label;
    btn.title = `${Math.round(sp.mps * 3.6)} km/h`;
    btn.setAttribute("aria-label", `${Math.round(sp.mps * 3.6)} km/h`);
    btn.dataset.idx = i;
    btn.addEventListener("click", () => _setPlaybackSpeed(i));
    speedGroup.appendChild(btn);
  });
  _controlsEl.appendChild(speedGroup);

  // Stop button
  const stopBtn = document.createElement("button");
  stopBtn.className = "gps-sim-stop-btn";
  stopBtn.title = "Stop playback";
  stopBtn.setAttribute("aria-label", "Stop route playback");
  stopBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
  stopBtn.addEventListener("click", _stopPlayback);
  _controlsEl.appendChild(stopBtn);

  _updateControlsState();
  document.getElementById("app").appendChild(_controlsEl);
}

function _hideControls() {
  if (_controlsEl) {
    _controlsEl.remove();
    _controlsEl = null;
  }
}

function _updateControlsState() {
  if (!_controlsEl) return;

  const playBtn = _controlsEl.querySelector(".gps-sim-play-btn");
  const stopBtn = _controlsEl.querySelector(".gps-sim-stop-btn");
  const hasRoute = (dir.directRouteCoords && dir.directRouteCoords.length >= 2) ||
    (dir.itineraries.length > 0 && dir.activeIdx >= 0);

  // Play/pause icon
  if (_playbackRunning && !_playbackPaused) {
    playBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
    playBtn.title = "Pause";
  } else {
    playBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>';
    playBtn.title = hasRoute ? "Play route" : "No route to play";
  }
  playBtn.disabled = !hasRoute && !_playbackRunning;

  // Speed buttons
  _controlsEl.querySelectorAll(".gps-sim-speed-btn").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.idx) === _playbackSpeedIdx);
  });

  // Stop button
  stopBtn.style.display = _playbackRunning ? "" : "none";
}

// ─── Keyboard shortcut + URL param ──────────────────────────────────

/**
 * Initialise GPS sim. Keyboard shortcut (Shift+G) + ?sim URL param auto-activate.
 * @returns {void}
 */
export function initGpsSim() {
  // Keyboard shortcut: Shift+G
  document.addEventListener("keydown", (e) => {
    if (e.key === "G" && e.shiftKey && !e.target.closest("input, textarea, select")) {
      e.preventDefault();
      toggleGpsSim();
    }
  });

  // Auto-activate via URL parameter ?sim (for phone testing)
  if (new URL(window.location.href).searchParams.has("sim")) {
    // Delay slightly so the map and location services are ready
    setTimeout(() => {
      if (!_active) _startSim();
    }, 1500);
  }
}
