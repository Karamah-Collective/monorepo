import { map } from "./map-init.js";
import { dir } from "./directions.js";
import {
  clearCurrentLocationState,
  getCurrentLocationState,
  setCurrentLocationState,
  showToast,
} from "./utils.js";

const badge = document.getElementById("gps-sim-badge");
const moveButton = document.getElementById("gps-sim-move");
const speedSelect = document.getElementById("gps-sim-speed");
const DEFAULT_SPEED_KMH = 30;
const MIN_MARKER_ANIMATION_MS = 120;
const MAX_MARKER_ANIMATION_MS = 650;

let active = false;
let moving = false;
let marker = null;
let markerVisual = null;
let markerAnimationFrame = 0;
let previous = null;
let movementPath = null;
let movementSegment = 0;
let movementOffsetMeters = 0;
let movementLoop = false;
let movementFrame = 0;
let movementLastAt = 0;
let speedKmh = DEFAULT_SPEED_KMH;

function validCoordinate(value) {
  return Number.isFinite(Number(value));
}

function distanceMeters(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * sinLng * sinLng;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function bearingDegrees(a, b) {
  const toRad = Math.PI / 180;
  const dLng = (b.lng - a.lng) * toRad;
  const y = Math.sin(dLng) * Math.cos(b.lat * toRad);
  const x = Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad)
    - Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos(dLng);
  return (Math.atan2(y, x) / toRad + 360) % 360;
}

function toPoint(coordinate) {
  const lng = Array.isArray(coordinate) ? coordinate[0] : coordinate?.lng;
  const lat = Array.isArray(coordinate) ? coordinate[1] : coordinate?.lat;
  return validCoordinate(lat) && validCoordinate(lng)
    ? { lat: Number(lat), lng: Number(lng) }
    : null;
}

function normalizePath(path) {
  const points = Array.isArray(path) ? path.map(toPoint).filter(Boolean) : [];
  return points.length >= 2 ? points : null;
}

function buildDemoPath() {
  const current = previous || getCurrentLocationState();
  const center = current?.active && validCoordinate(current.lat) && validCoordinate(current.lng)
    ? { lat: Number(current.lat), lng: Number(current.lng) }
    : { lat: map.getCenter().lat, lng: map.getCenter().lng };
  const lat = 0.0022;
  const lng = 0.0042;
  return [
    { lat: center.lat, lng: center.lng - lng },
    { lat: center.lat + lat, lng: center.lng - lng * 0.45 },
    { lat: center.lat + lat * 0.7, lng: center.lng + lng * 0.55 },
    { lat: center.lat - lat * 0.65, lng: center.lng + lng },
    { lat: center.lat - lat, lng: center.lng - lng * 0.2 },
    { lat: center.lat, lng: center.lng - lng },
  ];
}

function getActiveRoutePath() {
  const route = dir._directAlts?.[dir.activeIdx];
  return normalizePath(route?.coords);
}

function setBadge(on) {
  badge?.classList.toggle("hide", !on);
  document.body.classList.toggle("gps-sim-active", on);
}

function updateMovementUi() {
  if (speedSelect) speedSelect.value = String(speedKmh);
  if (!moveButton) return;
  moveButton.textContent = moving ? "❚❚" : "▶";
  moveButton.setAttribute("aria-label", moving ? "Pause GPS movement" : "Start GPS movement");
  moveButton.setAttribute("title", `${moving ? "Pause" : "Start"} GPS movement`);
  moveButton.classList.toggle("is-moving", moving);
}

function ensureMarker(lat, lng, duration = 0) {
  if (!marker) {
    const element = document.createElement("div");
    element.className = "loc-marker gps-sim-marker";
    element.innerHTML = '<div class="loc-ring"></div><div class="loc-puck"></div>';
    marker = new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(map);
    markerVisual = { lat, lng };
    return;
  }

  const from = markerVisual || marker.getLngLat();
  if (markerAnimationFrame) cancelAnimationFrame(markerAnimationFrame);
  if (!duration) {
    marker.setLngLat([lng, lat]);
    markerVisual = { lat, lng };
    markerAnimationFrame = 0;
    return;
  }

  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    const next = {
      lat: from.lat + (lat - from.lat) * ease,
      lng: from.lng + (lng - from.lng) * ease,
    };
    marker.setLngLat([next.lng, next.lat]);
    markerVisual = next;
    if (t < 1) markerAnimationFrame = requestAnimationFrame(tick);
    else markerAnimationFrame = 0;
  }
  markerAnimationFrame = requestAnimationFrame(tick);
}

export function setSimulatedLocation(lat, lng, accuracy = 5, options = {}) {
  if (!validCoordinate(lat) || !validCoordinate(lng)) return false;
  if (!active) active = true;
  const next = { lat: Number(lat), lng: Number(lng) };
  const now = Date.now();
  const elapsed = previous ? Math.max(0.05, (now - previous.timestamp) / 1000) : 1;
  const distance = previous ? distanceMeters(previous, next) : 0;
  const measuredSpeed = previous ? distance / elapsed : 0;
  const speed = Number.isFinite(Number(options.speed)) ? Number(options.speed) : measuredSpeed;
  const heading = previous && distance >= 2 ? bearingDegrees(previous, next) : null;
  const markerDuration = previous
    ? Math.min(MAX_MARKER_ANIMATION_MS, Math.max(MIN_MARKER_ANIMATION_MS, elapsed * 900))
    : 0;
  previous = { ...next, timestamp: now };
  setBadge(true);
  ensureMarker(next.lat, next.lng, document.body.classList.contains("nav-mode") ? 0 : markerDuration);
  setCurrentLocationState({
    lat: next.lat,
    lng: next.lng,
    accuracy: Number(accuracy),
    speed,
    heading,
    timestamp: now,
    active: true,
    source: "sim",
  });
  return true;
}

function stopMovement({ silent = false } = {}) {
  moving = false;
  if (movementFrame) cancelAnimationFrame(movementFrame);
  movementFrame = 0;
  movementLastAt = 0;
  updateMovementUi();
  if (!silent) showToast("GPS movement paused", "loc");
}

function nearestPathSegment(path, point) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  path.forEach((candidate, index) => {
    const distance = distanceMeters(point, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return { index: Math.min(bestIndex, path.length - 2), distance: bestDistance };
}

function advanceMovement(meters) {
  let remaining = meters;
  let point = movementPath[movementSegment];
  while (remaining > 0 && movementPath) {
    const next = movementPath[movementSegment + 1];
    const segmentLength = distanceMeters(point, next);
    const segmentRemaining = Math.max(0, segmentLength - movementOffsetMeters);
    if (segmentRemaining <= 0.01) {
      if (movementSegment >= movementPath.length - 2) {
        if (!movementLoop) {
          stopMovement({ silent: true });
          return next;
        }
        movementSegment = 0;
      } else {
        movementSegment += 1;
      }
      movementOffsetMeters = 0;
      point = movementPath[movementSegment];
      continue;
    }

    const used = Math.min(remaining, segmentRemaining);
    movementOffsetMeters += used;
    remaining -= used;
    const ratio = movementOffsetMeters / segmentLength;
    point = {
      lat: point.lat + (next.lat - point.lat) * ratio,
      lng: point.lng + (next.lng - point.lng) * ratio,
    };
    if (movementOffsetMeters >= segmentLength - 0.01 && remaining > 0) movementOffsetMeters = segmentLength;
  }
  return point;
}

function movementTick(now) {
  if (!moving || !active || !movementPath) return;
  const elapsed = movementLastAt ? Math.min(0.25, Math.max(0, (now - movementLastAt) / 1000)) : 0;
  movementLastAt = now;
  const point = advanceMovement((speedKmh / 3.6) * elapsed);
  if (point) setSimulatedLocation(point.lat, point.lng, 5, { speed: speedKmh / 3.6 });
  if (moving) movementFrame = requestAnimationFrame(movementTick);
}

export function startMovement({ speed = speedKmh, path = null, loop = null } = {}) {
  if (!active) startSimulator();
  const requestedSpeed = Number(speed);
  if (Number.isFinite(requestedSpeed) && requestedSpeed > 0) speedKmh = requestedSpeed;
  const routePath = getActiveRoutePath();
  movementPath = normalizePath(path) || routePath || buildDemoPath();
  movementLoop = loop === null ? !routePath : !!loop;
  const current = previous || getCurrentLocationState();
  const start = current?.active && validCoordinate(current.lat) && validCoordinate(current.lng)
    ? { lat: Number(current.lat), lng: Number(current.lng) }
    : movementPath[0];
  const nearest = nearestPathSegment(movementPath, start);
  movementSegment = nearest.index;
  movementOffsetMeters = 0;
  if (nearest.distance > 4) setSimulatedLocation(movementPath[movementSegment].lat, movementPath[movementSegment].lng, 5);
  moving = true;
  movementLastAt = performance.now();
  updateMovementUi();
  if (!movementFrame) movementFrame = requestAnimationFrame(movementTick);
  return true;
}

export function setMovementSpeed(nextSpeed) {
  const value = Number(nextSpeed);
  if (!Number.isFinite(value) || value <= 0) return speedKmh;
  speedKmh = value;
  updateMovementUi();
  return speedKmh;
}

export function stopMovementSimulation() {
  stopMovement();
}

export function isMovementActive() {
  return moving;
}

function applyNavigationVisualLocation(event) {
  if (!document.body.classList.contains("nav-mode") || !marker) return;
  const location = event.detail?.location;
  if (!Number.isFinite(Number(location?.lat)) || !Number.isFinite(Number(location?.lng))) return;
  if (markerAnimationFrame) cancelAnimationFrame(markerAnimationFrame);
  markerAnimationFrame = 0;
  marker.setLngLat([Number(location.lng), Number(location.lat)]);
  markerVisual = { lat: Number(location.lat), lng: Number(location.lng) };
}

window.addEventListener("hf:navigation-visual-location-updated", applyNavigationVisualLocation);

export function startSimulator() {
  if (active) return;
  const current = getCurrentLocationState();
  const center = current.active && current.lat !== null
    ? { lat: current.lat, lng: current.lng }
    : { lat: map.getCenter().lat, lng: map.getCenter().lng };
  active = true;
  previous = null;
  setSimulatedLocation(center.lat, center.lng, 5);
  updateMovementUi();
  showToast("GPS simulator on", "loc", "Shift-click to move or start movement above");
}

export function stopSimulator() {
  if (!active) return;
  stopMovement({ silent: true });
  active = false;
  previous = null;
  if (markerAnimationFrame) cancelAnimationFrame(markerAnimationFrame);
  markerAnimationFrame = 0;
  markerVisual = null;
  if (marker) { marker.remove(); marker = null; }
  setBadge(false);
  clearCurrentLocationState();
}

export function toggleSimulator() {
  if (active) stopSimulator();
  else startSimulator();
  return active;
}

export function isSimulatorActive() {
  return active;
}

moveButton?.addEventListener("click", () => {
  if (moving) stopMovement();
  else startMovement({ speed: speedKmh });
});
speedSelect?.addEventListener("change", () => setMovementSpeed(speedSelect.value));

map.on("click", (event) => {
  if (!active || !event.originalEvent?.shiftKey || dir.pickField) return;
  stopMovement({ silent: true });
  setSimulatedLocation(event.lngLat.lat, event.lngLat.lng, 5);
});

window.addEventListener("keydown", (event) => {
  if (!event.shiftKey || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  const key = event.key.toLowerCase();
  if (key === "g") {
    event.preventDefault();
    toggleSimulator();
  } else if (key === "m" && active) {
    event.preventDefault();
    if (moving) stopMovement();
    else startMovement({ speed: speedKmh });
  }
});

updateMovementUi();

window.__manarahGpsSim = {
  start: startSimulator,
  stop: stopSimulator,
  toggle: toggleSimulator,
  setLocation: setSimulatedLocation,
  startMovement,
  stopMovement: stopMovementSimulation,
  setSpeed: setMovementSpeed,
  isActive: isSimulatorActive,
  isMoving: isMovementActive,
};
