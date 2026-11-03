import { map } from "./map-init.js";
import {
  dir,
  dirTravelMode,
  findRoutesDirect,
  getActiveDirectRoute,
  maneuverIconSvg,
  stepInstruction,
  _otpManeuverIcon,
  _otpStepInstruction,
} from "./directions.js";
import { ensureLocationTracking, setNavigationCameraActive } from "./map-controls.js";
import { navigatePhonePage } from "./phone-pages.js";
import { getCurrentLocationState, showToast } from "./utils.js";
import {
  buildRouteModel,
  haversineMeters,
  processRoutePosition,
  nextInstruction,
} from "./navigation-core.js";

const NAV_TARGET_X = 0.5;
const NAV_TARGET_Y = 0.62;
const NAV_CAMERA_MS = 240;
const NAV_ARRIVAL_M = 35;
const NAV_REROUTE_COOLDOWN_MS = 15000;
const NAV_REROUTE_FIXES = 2;

const hud = document.getElementById("nav-hud");
const speedometer = document.getElementById("nav-speed");
const statusEl = document.getElementById("nav-status");
const turnIcon = document.getElementById("nav-turn-icon");
const turnDistance = document.getElementById("nav-turn-distance");
const turnInstruction = document.getElementById("nav-turn-instruction");
const nextInstructionEl = document.getElementById("nav-next-instruction");
const speedValue = document.getElementById("nav-speed-value");
const followButton = document.getElementById("nav-recenter");
const muteButton = document.getElementById("nav-mute");
const overviewButton = document.getElementById("nav-overview");
const snackbarStart = document.getElementById("snackbar-nav");

let active = false;
let following = true;
let muted = false;
let route = null;
let position = null;
let previousLocation = null;
let lastStepIndex = -1;
let lastSample = null;
let offRouteFixes = 0;
let lastRerouteAt = 0;
let rerouting = false;
let cameraRaf = 0;
let pendingCameraLocation = null;
let progressSource = null;

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.max(1, Math.round(meters / 5) * 5)} m`;
  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
}

function formatSpeed(speedMs) {
  if (!Number.isFinite(speedMs) || speedMs < 0.5) return "0";
  return String(Math.round(speedMs * 3.6));
}

function formatStep(step, index) {
  if (!step) return "Continue";
  if (step.maneuver) return stepInstruction(step);
  return _otpStepInstruction(step, index === 0, index === route.steps.length - 1);
}

function stepIcon(step, index) {
  if (!step) return maneuverIconSvg("continue", "straight");
  if (step.maneuver) return maneuverIconSvg(step.maneuver.type, step.maneuver.modifier || "");
  return _otpManeuverIcon(step, index === 0, index === route.steps.length - 1);
}

function setFollowing(next) {
  following = !!next;
  followButton?.classList.toggle("is-active", following);
  followButton?.setAttribute("aria-label", following ? "Following location" : "Recenter on location");
  followButton?.setAttribute("aria-pressed", String(following));
  document.body.classList.toggle("nav-following", following);
  if (following && position) queueCamera(position);
}

function updateStatus(text, tone = "") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function updateFollowButton() {
  if (!followButton) return;
  followButton.classList.toggle("is-active", following);
  followButton.setAttribute("aria-pressed", String(following));
  followButton.setAttribute("aria-label", following ? "Following location" : "Recenter on location");
}

function renderWaiting() {
  if (!turnDistance) return;
  turnDistance.textContent = "GPS";
  turnInstruction.textContent = "Waiting for a location fix";
  nextInstructionEl.textContent = "Keep the map visible while location starts";
  turnIcon.innerHTML = maneuverIconSvg("depart", "");
  updateStatus("Waiting for GPS");
}

function renderPosition(location, processed) {
  if (!route || !processed) return;
  position = processed;
  const instruction = nextInstruction(route, processed);
  const step = instruction.step;
  const stepIndex = instruction.nextIndex;
  turnDistance.textContent = formatDistance(instruction.distanceMeters);
  turnInstruction.textContent = formatStep(step, stepIndex);
  turnIcon.innerHTML = stepIcon(step, stepIndex);
  const after = route.steps[stepIndex + 1];
  nextInstructionEl.textContent = after ? `Then ${formatStep(after, stepIndex + 1)}` : `Arrive in ${formatDistance(Math.max(0, route.totalDistance - processed.alongMeters))}`;
  if (stepIndex !== lastStepIndex) {
    if (lastStepIndex >= 0 && !muted) speak(formatStep(step, stepIndex));
    lastStepIndex = stepIndex;
  }
  if (processed.deviated || processed.wrongMovement) {
    offRouteFixes += 1;
    updateStatus(rerouting ? "Recalculating route…" : "Off route", "warning");
    if (offRouteFixes >= NAV_REROUTE_FIXES) void reroute(location);
  } else {
    offRouteFixes = 0;
    updateStatus(following ? "Following route" : "Map paused");
  }
  updateProgress(processed);
  updateSpeed(location);
  queueCamera(location);
  if (processed.progress > 0.96 && haversineMeters(location, route.coords.at(-1)) <= Math.max(NAV_ARRIVAL_M, processed.posTolerance)) {
    showToast("Arrived at destination", "check");
    stopNavigation();
  }
}

function updateSpeed(location) {
  let speed = Number(location.speed);
  const timestamp = Number(location.timestamp) || Date.now();
  if ((!Number.isFinite(speed) || speed < 0) && lastSample) {
    const elapsed = Math.max(0.25, (timestamp - lastSample.timestamp) / 1000);
    speed = haversineMeters(lastSample, location) / elapsed;
  }
  if (speedValue) speedValue.textContent = formatSpeed(speed);
  lastSample = { ...location, timestamp };
}

function updateProgress(processed) {
  if (!progressSource || !route) return;
  const coords = route.coords.slice(0, processed.segmentIndex + 1);
  if (processed.point) coords.push([processed.point.lng, processed.point.lat]);
  if (coords.length < 2) return;
  progressSource.setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
}

function queueCamera(location) {
  if (!active || !following || !location) return;
  pendingCameraLocation = location;
  if (cameraRaf) return;
  cameraRaf = requestAnimationFrame(() => {
    cameraRaf = 0;
    const next = pendingCameraLocation;
    pendingCameraLocation = null;
    if (!next || !active || !following) return;
    keepLocationAtTarget(next);
  });
}

function keepLocationAtTarget(location) {
  const container = map.getContainer();
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;
  const projected = map.project([location.lng, location.lat]);
  const centerPx = map.project(map.getCenter());
  const target = { x: width * NAV_TARGET_X, y: height * NAV_TARGET_Y };
  const center = map.unproject([
    centerPx.x + projected.x - target.x,
    centerPx.y + projected.y - target.y,
  ]);
  const camera = { center, duration: NAV_CAMERA_MS, essential: true };
  if (Number.isFinite(Number(location.heading)) && Number(location.speed || 0) > 2) {
    camera.bearing = Number(location.heading);
  }
  map.easeTo(camera);
}

function handleUserMapGesture(event) {
  if (active && event?.originalEvent && following) setFollowing(false);
}

function overview() {
  if (!route?.coords?.length) return;
  setFollowing(false);
  const bounds = new maplibregl.LngLatBounds();
  route.coords.forEach((coord) => bounds.extend(coord));
  map.fitBounds(bounds, { padding: { top: 150, bottom: 150, left: 80, right: 80 }, duration: 500 });
}

function speak(text) {
  if (muted || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.volume = 0.9;
  window.speechSynthesis.speak(utterance);
}

async function reroute(location) {
  if (rerouting || Date.now() - lastRerouteAt < NAV_REROUTE_COOLDOWN_MS || !dir.dest) return;
  rerouting = true;
  lastRerouteAt = Date.now();
  updateStatus("Recalculating route…", "warning");
  try {
    dir.origin = { lat: location.lat, lng: location.lng, name: "Current location" };
    await findRoutesDirect(dirTravelMode);
    const data = getActiveDirectRoute();
    const nextRoute = buildRouteModel(data || {});
    if (!nextRoute) throw new Error("No route returned");
    route = nextRoute;
    position = null;
    lastStepIndex = -1;
    offRouteFixes = 0;
    mountProgressLayer();
    updateStatus("Following route");
  } catch {
    updateStatus("Route unavailable", "warning");
    showToast("Could not recalculate route", "warning");
  } finally {
    rerouting = false;
  }
}

function mountProgressLayer() {
  if (map.getLayer("nav-progress-ln")) map.removeLayer("nav-progress-ln");
  if (map.getSource("nav-progress-src")) map.removeSource("nav-progress-src");
  map.addSource("nav-progress-src", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: route.coords.slice(0, 2) } } });
  map.addLayer({
    id: "nav-progress-ln",
    type: "line",
    source: "nav-progress-src",
    paint: { "line-color": "#0b806c", "line-width": 8, "line-opacity": 0.88 },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  progressSource = map.getSource("nav-progress-src");
}

function removeProgressLayer() {
  progressSource = null;
  if (map.getLayer("nav-progress-ln")) map.removeLayer("nav-progress-ln");
  if (map.getSource("nav-progress-src")) map.removeSource("nav-progress-src");
}

export function startNavigation() {
  if (active) return true;
  const data = getActiveDirectRoute();
  const nextRoute = buildRouteModel(data || {});
  if (!nextRoute || dirTravelMode === "transit") {
    showToast("Choose a walking, cycling, or driving route first", "warning");
    return false;
  }
  route = nextRoute;
  if (window.innerWidth <= 768) navigatePhonePage("map");
  active = true;
  following = true;
  position = null;
  previousLocation = null;
  lastSample = null;
  lastStepIndex = -1;
  offRouteFixes = 0;
  document.body.classList.add("nav-mode", "nav-following");
  setNavigationCameraActive(true);
  hud?.classList.remove("hide");
  speedometer?.classList.remove("hide");
  updateFollowButton();
  renderWaiting();
  mountProgressLayer();
  const current = getCurrentLocationState();
  if (current.active) handleLocation({ detail: { location: current } });
  ensureLocationTracking({ zoomOnFirstFix: false, silent: true });
  return true;
}

export function stopNavigation() {
  if (!active) return;
  active = false;
  route = null;
  position = null;
  previousLocation = null;
  pendingCameraLocation = null;
  if (cameraRaf) cancelAnimationFrame(cameraRaf);
  cameraRaf = 0;
  document.body.classList.remove("nav-mode", "nav-following");
  setNavigationCameraActive(false);
  hud?.classList.add("hide");
  speedometer?.classList.add("hide");
  removeProgressLayer();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

export function isNavigationActive() {
  return active;
}

function handleLocation(event) {
  if (!active) return;
  const location = event.detail?.location;
  if (!location?.active || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return;
  const processed = processRoutePosition(location, route, {
    segmentIndex: position?.segmentIndex || 0,
    previousLocation,
  });
  previousLocation = location;
  if (processed) renderPosition(location, processed);
}

window.addEventListener("hf:current-location-updated", handleLocation);
window.addEventListener("hf:start-navigation-requested", startNavigation);
map.on("dragstart", handleUserMapGesture);
map.on("rotatestart", handleUserMapGesture);
map.on("pitchstart", handleUserMapGesture);
map.on("zoomstart", handleUserMapGesture);

snackbarStart?.addEventListener("click", (event) => {
  event.stopPropagation();
  startNavigation();
});
document.getElementById("nav-stop")?.addEventListener("click", stopNavigation);
followButton?.addEventListener("click", () => setFollowing(true));
overviewButton?.addEventListener("click", overview);
muteButton?.addEventListener("click", () => {
  muted = !muted;
  muteButton.setAttribute("aria-pressed", String(muted));
  muteButton.setAttribute("aria-label", muted ? "Unmute navigation" : "Mute navigation");
  muteButton.classList.toggle("is-muted", muted);
});
document.getElementById("snackbar-close")?.addEventListener("click", stopNavigation);
document.getElementById("dir-clear-route")?.addEventListener("click", stopNavigation);
document.querySelectorAll(".mode-opt").forEach((button) => button.addEventListener("click", stopNavigation));
