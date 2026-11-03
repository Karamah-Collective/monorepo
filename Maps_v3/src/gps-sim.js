import { map } from "./map-init.js";
import { dir } from "./directions.js";
import {
  clearCurrentLocationState,
  getCurrentLocationState,
  setCurrentLocationState,
  showToast,
} from "./utils.js";

const badge = document.getElementById("gps-sim-badge");
let active = false;
let marker = null;
let previous = null;

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

function ensureMarker(lat, lng) {
  if (!marker) {
    const element = document.createElement("div");
    element.className = "loc-marker gps-sim-marker";
    element.innerHTML = '<div class="loc-ring"></div><div class="loc-puck"></div>';
    marker = new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(map);
  } else {
    marker.setLngLat([lng, lat]);
  }
}

function setBadge(on) {
  badge?.classList.toggle("hide", !on);
  document.body.classList.toggle("gps-sim-active", on);
}

export function setSimulatedLocation(lat, lng, accuracy = 5) {
  if (!validCoordinate(lat) || !validCoordinate(lng)) return false;
  if (!active) active = true;
  const next = { lat: Number(lat), lng: Number(lng) };
  const now = Date.now();
  const elapsed = previous ? Math.max(0.25, (now - previous.timestamp) / 1000) : 1;
  const distance = previous ? distanceMeters(previous, next) : 0;
  const speed = previous ? distance / elapsed : 0;
  const heading = previous && distance >= 2 ? bearingDegrees(previous, next) : null;
  previous = { ...next, timestamp: now };
  setBadge(true);
  ensureMarker(next.lat, next.lng);
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

export function startSimulator() {
  if (active) return;
  const current = getCurrentLocationState();
  const center = current.active && current.lat !== null
    ? { lat: current.lat, lng: current.lng }
    : { lat: map.getCenter().lat, lng: map.getCenter().lng };
  active = true;
  previous = null;
  setSimulatedLocation(center.lat, center.lng, 5);
  showToast("GPS simulator on", "loc", "Shift-click the map to move the simulated position");
}

export function stopSimulator() {
  if (!active) return;
  active = false;
  previous = null;
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

map.on("click", (event) => {
  if (!active || !event.originalEvent?.shiftKey || dir.pickField) return;
  setSimulatedLocation(event.lngLat.lat, event.lngLat.lng, 5);
});

window.addEventListener("keydown", (event) => {
  if (!event.shiftKey || event.key.toLowerCase() !== "g") return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  event.preventDefault();
  toggleSimulator();
});

window.__manarahGpsSim = {
  start: startSimulator,
  stop: stopSimulator,
  toggle: toggleSimulator,
  setLocation: setSimulatedLocation,
  isActive: isSimulatorActive,
};
