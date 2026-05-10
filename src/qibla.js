/**
 * Qibla compass — mobile-only full-screen overlay showing direction to Kaaba.
 * Uses DeviceOrientationEvent for compass heading + Geolocation for bearing calc.
 * Lazy-loaded from prayer.js when user taps the Qibla button.
 */

// --- Constants ---
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;
const DEG = Math.PI / 180;
const SMOOTHING = 0.15;
const LOCK_THRESHOLD_DEG = 5;
const KAABA_RADIUS = 106;

// --- Private state ---
let _overlayEl = null;
let _ringEl = null;
let _kaabaEl = null;
let _bearingValue = null;
let _bearingUnit = null;
let _statusEl = null;
let _qiblaBearing = 0;
let _currentHeading = 0;
let _smoothedHeading = 0;
let _isLocked = false;
let _watchId = null;
let _orientationBound = null;
let _rafId = null;
let _active = false;

/**
 * Calculate bearing from a point to the Kaaba.
 * @param {number} lat - User latitude in degrees
 * @param {number} lng - User longitude in degrees
 * @returns {number} Bearing in degrees (0-360)
 */
function _calcQiblaBearing(lat, lng) {
  const φ1 = lat * DEG;
  const φ2 = KAABA_LAT * DEG;
  const ΔL = (KAABA_LNG - lng) * DEG;
  const x = Math.sin(ΔL) * Math.cos(φ2);
  const y = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(ΔL);
  const bearing = Math.atan2(x, y) / DEG;
  return (bearing + 360) % 360;
}

/**
 * Handle device orientation events.
 * @param {DeviceOrientationEvent} e
 */
function _onOrientation(e) {
  let heading;
  if (typeof e.webkitCompassHeading === "number") {
    heading = e.webkitCompassHeading;
  } else if (e.alpha !== null) {
    heading = (360 - e.alpha) % 360;
  } else {
    return;
  }
  _currentHeading = heading;
}

/**
 * Compute shortest-arc angular difference.
 * @param {number} a - Angle A in degrees
 * @param {number} b - Angle B in degrees
 * @returns {number} Signed difference in degrees (-180 to 180)
 */
function _angleDiff(a, b) {
  let d = a - b;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Animate the compass ring and Kaaba indicator at 60fps.
 * Uses low-pass filter for smooth rotation with "locked on" detection.
 */
function _animate() {
  if (!_active) return;

  // Shortest-path angular interpolation
  let delta = _angleDiff(_currentHeading, _smoothedHeading);
  _smoothedHeading = (_smoothedHeading + delta * SMOOTHING + 360) % 360;

  // Rotate ring so north always points to true north
  _ringEl.style.transform = `rotate(${-_smoothedHeading}deg)`;

  // Kaaba indicator: positioned at Qibla bearing, translated to ring edge
  _kaabaEl.style.transform = `rotate(${_qiblaBearing}deg) translateY(${-KAABA_RADIUS}px)`;

  // Update bearing display
  _bearingValue.textContent = Math.round(_qiblaBearing);

  // Check if phone is pointing at Qibla (within threshold)
  const qiblaRelative = _angleDiff(_qiblaBearing, _smoothedHeading);
  const absOff = Math.abs(qiblaRelative);
  const locked = absOff <= LOCK_THRESHOLD_DEG;

  if (locked !== _isLocked) {
    _isLocked = locked;
    _ringEl.classList.toggle("qibla-locked", locked);
    _overlayEl.classList.toggle("qibla-on-target", locked);
    _statusEl.textContent = locked
      ? "You are facing the Qibla"
      : "Point your phone towards the Qibla";
  }

  _rafId = requestAnimationFrame(_animate);
}

/**
 * Request iOS 13+ DeviceOrientationEvent permission.
 * @returns {Promise<boolean>} true if granted
 */
async function _requestOrientationPermission() {
  if (typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      return result === "granted";
    } catch (_) {
      return false;
    }
  }
  return true;
}

/**
 * Open the Qibla overlay and start tracking.
 */
export async function openQibla() {
  _overlayEl = document.getElementById("qibla-overlay");
  _ringEl = document.getElementById("qibla-ring");
  _kaabaEl = document.getElementById("qibla-kaaba");
  _bearingValue = document.getElementById("qibla-bearing-value");
  _bearingUnit = document.getElementById("qibla-bearing-unit");
  _statusEl = document.getElementById("qibla-status");

  _overlayEl.classList.remove("hide", "qibla-on-target");
  _ringEl.classList.remove("qibla-locked");
  _isLocked = false;
  _statusEl.textContent = "Getting location\u2026";
  _bearingValue.textContent = "--";
  _bearingUnit.textContent = "";

  // 1. Get user location
  let lat, lng;
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }),
    );
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
  } catch (err) {
    _statusEl.textContent = "Location unavailable. Enable GPS and try again.";
    console.error("[Qibla] Geolocation error:", err.message);
    return;
  }

  _qiblaBearing = _calcQiblaBearing(lat, lng);
  _bearingUnit.textContent = "degrees from North";

  // 2. Request orientation permission (iOS)
  _statusEl.textContent = "Starting compass\u2026";
  const granted = await _requestOrientationPermission();
  if (!granted) {
    _statusEl.textContent = "Compass permission denied. Allow motion access in Settings.";
    _bearingValue.textContent = Math.round(_qiblaBearing);
    return;
  }

  // 3. Check availability
  if (typeof DeviceOrientationEvent === "undefined") {
    _statusEl.textContent = "Compass not available on this device.";
    _bearingValue.textContent = Math.round(_qiblaBearing);
    return;
  }

  // 4. Start listening
  _orientationBound = _onOrientation;
  window.addEventListener("deviceorientation", _orientationBound, true);

  _watchId = navigator.geolocation.watchPosition(
    (pos) => {
      _qiblaBearing = _calcQiblaBearing(pos.coords.latitude, pos.coords.longitude);
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 30000 },
  );

  _active = true;
  _statusEl.textContent = "Point your phone towards the Qibla";
  _animate();
}

/**
 * Close the Qibla overlay and stop all tracking.
 */
export function closeQibla() {
  _active = false;
  _isLocked = false;

  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  if (_orientationBound) {
    window.removeEventListener("deviceorientation", _orientationBound, true);
    _orientationBound = null;
  }
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }

  _smoothedHeading = 0;
  _currentHeading = 0;

  const overlay = document.getElementById("qibla-overlay");
  if (overlay) {
    overlay.classList.add("hide");
    overlay.classList.remove("qibla-on-target");
  }
  const ring = document.getElementById("qibla-ring");
  if (ring) ring.classList.remove("qibla-locked");
}

// --- UI listeners ---
document.getElementById("qibla-close")?.addEventListener("click", closeQibla);

document.getElementById("qibla-overlay")?.addEventListener("click", (e) => {
  if (e.target.id === "qibla-overlay") closeQibla();
});
