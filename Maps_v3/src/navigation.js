import { map } from "./map-init.js";
import {
  dir,
  dirTravelMode,
  findRoutesDirect,
  clearRoute,
  keepActiveDirectRouteOnly,
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
  bearingDegrees,
  degreesDelta,
  haversineMeters,
  processRoutePosition,
  nextInstruction,
} from "./navigation-core.js";

const NAV_TARGET_X = 0.5;
const NAV_TARGET_Y = 0.70;
const NAV_MIN_FOLLOW_ZOOM = 15;
const NAV_CAMERA_MIN_MS = 250;
const NAV_CAMERA_SKIP_MS = 10000;
const NAV_HEADING_MIN_SPEED_MS = 2;
const NAV_HEADING_MIN_MOTION_M = 8;
const NAV_HEADING_STRONG_MOTION_M = 12;
const NAV_HEADING_MAX_MOTION_SPEED_MS = 70;
const NAV_HEADING_DEADBAND_DEG = 4;
const NAV_HEADING_MIN_APPLY_DEG = 4;
const NAV_HEADING_MAX_JUMP_DEG = 75;
const NAV_HEADING_AGREE_DEG = 35;
const NAV_HEADING_RATE_DEG_PER_SEC = 120;
const NAV_HEADING_HIGH_SPEED_RATE_DEG_PER_SEC = 180;
const NAV_HEADING_VERY_HIGH_SPEED_RATE_DEG_PER_SEC = 240;
const NAV_HEADING_RESPONSE_MS = 600;
const NAV_HEADING_HIGH_SPEED_RESPONSE_MS = 440;
const NAV_HEADING_VERY_HIGH_SPEED_RESPONSE_MS = 370;
const NAV_ROAD_TURN_DEG = 20;
const NAV_ROAD_DEADBAND_DEG = 2;
const NAV_ROAD_FILTER_MS = 320;
const NAV_ROAD_HIGH_SPEED_FILTER_MS = 160;
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
let cameraMotion = null;
let cameraVisualLocation = null;
let cameraLastTargetAt = 0;
let navigationZoom = null;
let navigationBearing = null;
let navigationBearingTarget = null;
let orientationHasLock = false;
let orientationReference = null;
let bearingLastFrameAt = 0;
let stableRoadBearing = null;
let stableRoadSegment = null;
let roadBearingLastAt = 0;
let navigationSpeed = 0;
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
  if (following) {
    navigationZoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), NAV_MIN_FOLLOW_ZOOM));
    navigationBearing = normalizeBearing(map.getBearing());
    navigationBearingTarget = navigationBearing;
    orientationHasLock = false;
    const current = getCurrentLocationState();
    if (current?.active) {
      updateNavigationBearing(current, position);
      queueCamera(current);
    }
  }
  followButton?.classList.toggle("is-active", following);
  followButton?.setAttribute("aria-label", following ? "Following location" : "Recenter on location");
  followButton?.setAttribute("aria-pressed", String(following));
  if (followButton) followButton.tabIndex = following ? -1 : 0;
  document.body.classList.toggle("nav-following", following);
}

function updateStatus(text, tone = "") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
  document.body.classList.toggle("nav-status-alert", Boolean(tone) || text !== "Following route");
}

function updateFollowButton() {
  if (!followButton) return;
  followButton.classList.toggle("is-active", following);
  followButton.setAttribute("aria-pressed", String(following));
  followButton.setAttribute("aria-label", following ? "Following location" : "Recenter on location");
  followButton.tabIndex = following ? -1 : 0;
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
  updateNavigationBearing(location, processed);
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

function normalizeBearing(value) {
  return (Number(value) % 360 + 360) % 360;
}

function blendBearings(first, second, secondWeight = 0.5) {
  return normalizeBearing(Number(first) + degreesDelta(second, first) * secondWeight);
}

function getMotionBearing(location) {
  const now = performance.now();
  const current = { lat: Number(location.lat), lng: Number(location.lng) };
  if (!orientationReference) {
    orientationReference = { ...current, time: now };
    return null;
  }
  const distance = haversineMeters(orientationReference, current);
  if (distance < NAV_HEADING_MIN_MOTION_M) return null;
  const bearing = bearingDegrees(orientationReference, current);
  const elapsed = Math.max(0.1, (now - orientationReference.time) / 1000);
  orientationReference = { ...current, time: now };
  const speed = distance / elapsed;
  if (speed > NAV_HEADING_MAX_MOTION_SPEED_MS) return { invalid: true };
  return { bearing, distance, speed };
}

function getStableRoadBearing(processed) {
  const raw = Number(processed?.routeBearing);
  if (!Number.isFinite(raw) || processed?.deviated) return null;
  const now = performance.now();
  const segment = Number(processed.segmentIndex);
  if (stableRoadBearing === null) {
    stableRoadBearing = normalizeBearing(raw);
    stableRoadSegment = Number.isFinite(segment) ? segment : null;
    roadBearingLastAt = now;
    return stableRoadBearing;
  }
  const rawDelta = degreesDelta(raw, stableRoadBearing);
  const segmentChanged = Number.isFinite(segment) && stableRoadSegment !== null && segment !== stableRoadSegment;
  stableRoadSegment = Number.isFinite(segment) ? segment : stableRoadSegment;
  const elapsed = Math.min(1000, Math.max(0, now - roadBearingLastAt));
  roadBearingLastAt = now;
  if (Math.abs(rawDelta) <= NAV_ROAD_DEADBAND_DEG) {
    return stableRoadBearing;
  }
  if (segmentChanged && Math.abs(rawDelta) >= NAV_ROAD_TURN_DEG) {
    stableRoadBearing = normalizeBearing(raw);
    return stableRoadBearing;
  }
  const filterMs = navigationSpeed >= 20 ? NAV_ROAD_HIGH_SPEED_FILTER_MS : NAV_ROAD_FILTER_MS;
  const alpha = 1 - Math.exp(-elapsed / filterMs);
  stableRoadBearing = blendBearings(stableRoadBearing, raw, alpha);
  return stableRoadBearing;
}

function resetRoadBearing() {
  stableRoadBearing = null;
  stableRoadSegment = null;
  roadBearingLastAt = 0;
}

function updateNavigationBearing(location, processed) {
  const motion = getMotionBearing(location);
  if (rerouting) return;
  const usableMotion = motion?.invalid ? null : motion;
  const rawSpeed = Number(location.speed);
  const speed = Number.isFinite(rawSpeed) && rawSpeed >= 0 ? rawSpeed : usableMotion?.speed || 0;
  navigationSpeed = speed;
  const signalHeading = Number(location.heading);
  const signal = Number.isFinite(signalHeading) && signalHeading >= 0 && speed >= NAV_HEADING_MIN_SPEED_MS
    ? normalizeBearing(signalHeading)
    : null;

  const road = getStableRoadBearing(processed);
  let candidate = road;
  const motionIsStrong = usableMotion && usableMotion.distance >= NAV_HEADING_STRONG_MOTION_M && speed >= NAV_HEADING_MIN_SPEED_MS;
  if (candidate === null) {
    candidate = signal;
    if (usableMotion) {
      if (signal === null) candidate = usableMotion.bearing;
      else if (Math.abs(degreesDelta(signal, usableMotion.bearing)) <= NAV_HEADING_AGREE_DEG) candidate = blendBearings(signal, usableMotion.bearing, 0.20);
      else if (motionIsStrong) candidate = usableMotion.bearing;
    }
  }
  if (candidate === null) return;

  if (navigationBearing === null) navigationBearing = normalizeBearing(map.getBearing());
  if (navigationBearingTarget === null) navigationBearingTarget = navigationBearing;
  const delta = degreesDelta(candidate, navigationBearingTarget);
  const renderedDelta = degreesDelta(candidate, navigationBearing);
  if (Math.abs(delta) < NAV_HEADING_DEADBAND_DEG && Math.abs(renderedDelta) < NAV_HEADING_MIN_APPLY_DEG) return;
  if (Math.abs(delta) > NAV_HEADING_MAX_JUMP_DEG && orientationHasLock && !motionIsStrong && road === null) return;
  navigationBearingTarget = candidate;
  orientationHasLock = true;
}

function stepNavigationBearing(now) {
  if (navigationBearing === null) navigationBearing = normalizeBearing(map.getBearing());
  if (navigationBearingTarget === null) navigationBearingTarget = navigationBearing;
  const previousBearing = navigationBearing;
  const elapsed = bearingLastFrameAt ? Math.min(100, Math.max(0, now - bearingLastFrameAt)) : 16;
  bearingLastFrameAt = now;
  const delta = degreesDelta(navigationBearingTarget, navigationBearing);
  const rate = navigationSpeed >= 45
    ? NAV_HEADING_VERY_HIGH_SPEED_RATE_DEG_PER_SEC
    : navigationSpeed >= 20
      ? NAV_HEADING_HIGH_SPEED_RATE_DEG_PER_SEC
      : NAV_HEADING_RATE_DEG_PER_SEC;
  const responseMs = navigationSpeed >= 45
    ? NAV_HEADING_VERY_HIGH_SPEED_RESPONSE_MS
    : navigationSpeed >= 20
      ? NAV_HEADING_HIGH_SPEED_RESPONSE_MS
      : NAV_HEADING_RESPONSE_MS;
  const weightedStep = Math.abs(delta) * (1 - Math.exp(-elapsed / responseMs));
  const maxStep = Math.min(weightedStep, rate * elapsed / 1000);
  navigationBearing = Math.abs(delta) <= maxStep
    ? navigationBearingTarget
    : normalizeBearing(navigationBearing + Math.sign(delta) * maxStep);
  return {
    changed: Math.abs(degreesDelta(navigationBearing, previousBearing)) > 0.01,
    moving: Math.abs(degreesDelta(navigationBearingTarget, navigationBearing)) > 0.5,
  };
}

function queueCamera(location) {
  if (!active || !following || !location) return;
  pendingCameraLocation = location;
  if (cameraRaf) return;
  cameraRaf = requestAnimationFrame(stepCamera);
}

function interpolateLocation(from, to, progress) {
  return {
    lat: from.lat + (to.lat - from.lat) * progress,
    lng: from.lng + (to.lng - from.lng) * progress,
    speed: to.speed,
  };
}

function emitNavigationVisualLocation(location) {
  window.dispatchEvent(new CustomEvent("hf:navigation-visual-location-updated", {
    detail: { location: { ...location } },
  }));
}

function stepCamera(now) {
  cameraRaf = 0;
  if (!active || !following) {
    cameraMotion = null;
    pendingCameraLocation = null;
    return;
  }

  // Finish the current frame before replacing its target. This mirrors
  // OsmAnd's stopAnimatingSync(): restart from what is actually rendered.
  if (cameraMotion) {
    const progress = Math.min(1, (now - cameraMotion.startedAt) / cameraMotion.duration);
    cameraVisualLocation = interpolateLocation(cameraMotion.from, cameraMotion.to, 1 - Math.pow(1 - progress, 3));
    if (progress >= 1) cameraMotion = null;
  }

  const next = pendingCameraLocation;
  pendingCameraLocation = null;
  if (next) {
    const fixInterval = cameraLastTargetAt ? now - cameraLastTargetAt : 0;
    const duration = fixInterval > 0 && fixInterval <= NAV_CAMERA_SKIP_MS
      ? Math.max(NAV_CAMERA_MIN_MS, fixInterval)
      : 0;
    cameraLastTargetAt = now;
    const from = cameraVisualLocation || next;
    cameraMotion = duration ? { from, to: next, startedAt: now, duration } : null;
    if (!cameraMotion) cameraVisualLocation = next;
  }

  const { changed: bearingChanged, moving: bearingMoving } = stepNavigationBearing(now);
  if (cameraMotion) {
    const progress = Math.min(1, (now - cameraMotion.startedAt) / cameraMotion.duration);
    cameraVisualLocation = interpolateLocation(cameraMotion.from, cameraMotion.to, 1 - Math.pow(1 - progress, 3));
    keepLocationAtTarget(cameraVisualLocation);
    if (progress < 1) cameraRaf = requestAnimationFrame(stepCamera);
    else cameraMotion = null;
  } else if (cameraVisualLocation && (next || bearingChanged)) {
    keepLocationAtTarget(cameraVisualLocation);
  }
  if (bearingMoving && !cameraRaf) cameraRaf = requestAnimationFrame(stepCamera);
  if (pendingCameraLocation && !cameraRaf) cameraRaf = requestAnimationFrame(stepCamera);
}

function cameraForLocation(location) {
  const container = map.getContainer();
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return { center: map.getCenter(), zoom: navigationZoom ?? map.getZoom(), bearing: navigationBearing ?? map.getBearing() };
  const projected = map.project([location.lng, location.lat]);
  const centerPx = map.project(map.getCenter());
  const target = { x: width * NAV_TARGET_X, y: height * NAV_TARGET_Y };
  const center = map.unproject([
    centerPx.x + projected.x - target.x,
    centerPx.y + projected.y - target.y,
  ]);
  // Keep the current bearing while following. OsmAnd only changes rotation
  // through its separate compass/heading animator, never during route redraw.
  return { center, zoom: navigationZoom ?? map.getZoom(), bearing: navigationBearing ?? map.getBearing() };
}

function keepLocationAtTarget(location) {
  const bearing = navigationBearing ?? map.getBearing();
  if (Math.abs(degreesDelta(bearing, map.getBearing())) > 0.1) {
    map.jumpTo({ bearing, zoom: navigationZoom ?? map.getZoom(), duration: 0, essential: true });
  }
  map.jumpTo({ ...cameraForLocation(location), bearing, duration: 0, essential: true });
  emitNavigationVisualLocation(location);
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
    await findRoutesDirect(dirTravelMode, { preserveView: true });
    const data = getActiveDirectRoute();
    const nextRoute = buildRouteModel(data || {});
    if (!nextRoute) throw new Error("No route returned");
    route = nextRoute;
    resetRoadBearing();
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
  keepActiveDirectRouteOnly();
  if (window.innerWidth <= 768) navigatePhonePage("map");
  active = true;
  following = true;
  map.stop();
  navigationZoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), NAV_MIN_FOLLOW_ZOOM));
  navigationBearing = normalizeBearing(map.getBearing());
  navigationBearingTarget = navigationBearing;
  orientationHasLock = false;
  orientationReference = null;
  bearingLastFrameAt = 0;
  navigationSpeed = 0;
  resetRoadBearing();
  document.body.classList.remove("route-preview-active");
  window.dispatchEvent(new CustomEvent("hf:route-preview-changed", { detail: { active: false } }));
  map.resize();
  if (map.getZoom() !== navigationZoom) map.jumpTo({ zoom: navigationZoom });
  requestAnimationFrame(() => map.resize());
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
  if (current.source !== "sim") ensureLocationTracking({ zoomOnFirstFix: false, silent: true });
  return true;
}

export function stopNavigation() {
  if (!active) return;
  active = false;
  route = null;
  position = null;
  previousLocation = null;
  pendingCameraLocation = null;
  cameraMotion = null;
  cameraVisualLocation = null;
  cameraLastTargetAt = 0;
  navigationZoom = null;
  navigationBearing = null;
  navigationBearingTarget = null;
  orientationHasLock = false;
  orientationReference = null;
  bearingLastFrameAt = 0;
  navigationSpeed = 0;
  resetRoadBearing();
  if (cameraRaf) cancelAnimationFrame(cameraRaf);
  cameraRaf = 0;
  document.body.classList.remove("nav-mode", "nav-following");
  document.body.classList.remove("nav-status-alert");
  setNavigationCameraActive(false);
  hud?.classList.add("hide");
  speedometer?.classList.add("hide");
  removeProgressLayer();
  clearRoute();
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
