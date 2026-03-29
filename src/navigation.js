// ─── Turn-by-turn Navigation Module ─────────────────────────────────────
// Provides Google Maps–style navigation HUD that replaces the route snackbar
// when the directions panel is closed with an active route.
// Supports all transport modes with specialized instructions.
// Includes a simulator for testing without GPS.

import { map } from "./map-init.js";
import {
  dir, dirTravelMode, decodePolyline, fmtDist, fmtTime,
  stepInstruction, maneuverIconSvg, bearingName,
  legCssColor, _otpStepInstruction, _otpManeuverIcon,
  OSRM_URLS, OSRM_LABELS, openDirPanel, fullCloseDirPanel,
  findRoutes, setNavHooks, onNavStopped,
} from "./directions.js";
import { esc, getCurrentLocationState, haversineDistance, showToast } from "./utils.js";
import { modeIcon } from "./icons.js";

// ─── State ──────────────────────────────────────────────────────────
let navActive = false;
let navPaused = false;     // true when HUD is hidden but state is preserved
let navSteps = [];         // unified step objects for all modes
let navStepIdx = 0;
let navRouteCoords = [];   // flat [lng,lat] array of the entire route
let navRouteProgress = []; // cumulative metres at each route coordinate
let navMode = "drive";     // drive | walk | cycle | transit
let navItinerary = null;   // the active itinerary (transit) or null
let navStartTime = null;
let navTotalDist = 0;      // metres
let navTotalDur = 0;       // seconds

// Off-route detection
const OFF_ROUTE_THRESHOLD = 50; // metres
const REROUTE_COOLDOWN = 15000; // don't reroute more than once per 15s
let lastRerouteTime = 0;
let offRouteCount = 0;

// Step advancement cooldown — prevents cascading through steps on rapid GPS ticks
const STEP_ADVANCE_COOLDOWN = 3000; // ms — minimum time between step advances
let lastStepAdvanceTime = 0;

// GPS processing throttle
const GPS_PROCESS_INTERVAL = 2000; // ms — process GPS at most every 2s
let lastGpsProcessTime = 0;

// ─── DOM refs ───────────────────────────────────────────────────────
const hud = document.getElementById("nav-hud");
const hudManeuver = document.getElementById("nav-maneuver-icon");
const hudInstruction = document.getElementById("nav-instruction");
const hudNextInfo = document.getElementById("nav-next-info");
const hudDistChip = document.getElementById("nav-dist-chip");
const hudEtaChip = document.getElementById("nav-eta-chip");
const hudProgress = document.getElementById("nav-progress-fill");
const hudExitBtn = document.getElementById("nav-exit");
const hudBody = document.querySelector(".nav-hud-body");
const snackbar = document.getElementById("route-snackbar");

// ─── Helpers ────────────────────────────────────────────────────────
function _nearestPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return { x: ax + t * dx, y: ay + t * dy, t };
}

function snapToRoute(lat, lng) {
  let minDist = Infinity, bestIdx = 0, bestLng = lng, bestLat = lat;
  let bestT = 0;
  for (let i = 0; i < navRouteCoords.length - 1; i++) {
    const [ax, ay] = navRouteCoords[i];
    const [bx, by] = navRouteCoords[i + 1];
    const p = _nearestPointOnSegment(lng, lat, ax, ay, bx, by);
    const d = haversineDistance(lat, lng, p.y, p.x);
    if (d < minDist) {
      minDist = d;
      bestIdx = i;
      bestLng = p.x;
      bestLat = p.y;
      bestT = p.t;
    }
  }
  const segStart = navRouteCoords[bestIdx];
  const segEnd = navRouteCoords[bestIdx + 1] || segStart;
  const segLen = segStart && segEnd
    ? haversineDistance(segStart[1], segStart[0], segEnd[1], segEnd[0])
    : 0;
  const progressM = (navRouteProgress[bestIdx] || 0) + segLen * bestT;
  return { dist: minDist, segIdx: bestIdx, lng: bestLng, lat: bestLat, t: bestT, progressM };
}

function distAlongRoute(fromIdx) {
  let d = 0;
  for (let i = fromIdx; i < navRouteCoords.length - 1; i++) {
    d += haversineDistance(navRouteCoords[i][1], navRouteCoords[i][0],
      navRouteCoords[i + 1][1], navRouteCoords[i + 1][0]);
  }
  return d;
}

function _buildRouteProgress() {
  navRouteProgress = [];
  if (!navRouteCoords.length) return;

  navRouteProgress[0] = 0;
  for (let i = 1; i < navRouteCoords.length; i++) {
    navRouteProgress[i] = navRouteProgress[i - 1] + haversineDistance(
      navRouteCoords[i - 1][1], navRouteCoords[i - 1][0],
      navRouteCoords[i][1], navRouteCoords[i][0],
    );
  }
}

function _routeProgressAtCoordIdx(coordIdx) {
  if (!navRouteProgress.length) return 0;
  const safeIdx = Math.max(0, Math.min(coordIdx, navRouteProgress.length - 1));
  return navRouteProgress[safeIdx] || 0;
}

function _stepTriggerThreshold(step) {
  if (navMode === "transit") {
    return step.type === "transit-stop" ? 80 : 60;
  }
  if (navMode === "walk") return 20;
  if (navMode === "cycle") return 30;
  return 35;
}

function _stepProgressWindow(step, threshold) {
  if (navMode === "walk") return Math.min(threshold, 12);
  if (navMode === "cycle") return Math.min(threshold, 18);
  if (navMode === "transit") {
    return step.type === "transit-stop" ? Math.min(threshold, 35) : Math.min(threshold, 25);
  }
  return Math.min(threshold, 20);
}

function _isGpsConfirmedAtStep(lat, lng, accuracy, snap, step) {
  const threshold = _stepTriggerThreshold(step);
  const distToStep = haversineDistance(lat, lng, step.lat, step.lng);
  if (distToStep > threshold) return false;

  if (Number.isFinite(accuracy) && accuracy > threshold) return false;

  if (!Number.isFinite(step.routeProgressM) || !Number.isFinite(snap?.progressM)) {
    return true;
  }

  const progressWindow = _stepProgressWindow(step, threshold);
  return Math.abs(snap.progressM - step.routeProgressM) <= progressWindow;
}

// Precompute remaining distance and duration from each step to the end.
// Called once after steps are built, so renderHUD just reads the values.
function _precomputeStepRemaining() {
  // Sum distance + duration from the last step backward
  let distAcc = 0, durAcc = 0;
  for (let i = navSteps.length - 1; i >= 0; i--) {
    navSteps[i].remainDist = distAcc;
    navSteps[i].remainDur = durAcc;
    distAcc += navSteps[i].distance || 0;
    durAcc += navSteps[i].duration || 0;
  }
}

// ─── Build unified steps from route data ────────────────────────────

function _findNearestCoordIdx(lat, lng) {
  let best = 0, minD = Infinity;
  for (let ci = 0; ci < navRouteCoords.length; ci++) {
    const d = haversineDistance(lat, lng, navRouteCoords[ci][1], navRouteCoords[ci][0]);
    if (d < minD) { minD = d; best = ci; }
  }
  return best;
}

function buildDirectStepsFromData(mode) {
  // Use raw step data stored by directions.js during route calculation
  const rawSteps = dir.directSteps;
  if (!rawSteps?.length) return buildDirectStepsFallback(mode);

  return rawSteps.map((raw, i) => {
    const lng = raw.lng || navRouteCoords[0]?.[0] || 0;
    const lat = raw.lat || navRouteCoords[0]?.[1] || 0;
    const coordIdx = _findNearestCoordIdx(lat, lng);
    return {
      type: "direct",
      mode,
      instruction: raw.instruction,
      distance: raw.distance || 0,
      duration: raw.duration || 0,
      iconHtml: raw.iconHtml,
      lng, lat,
      coordIdx,
      routeProgressM: _routeProgressAtCoordIdx(coordIdx),
      isDepart: raw.isFirst || i === 0,
      isArrive: raw.isLast || i === rawSteps.length - 1,
      maneuverType: raw.maneuverType || "",
      maneuverMod: raw.maneuverMod || "",
    };
  });
}

function buildDirectStepsFallback(mode) {
  // Fallback: parse from DOM if raw steps aren't available
  const steps = [];
  const stepEls = document.querySelectorAll(".direct-step");
  if (!stepEls.length) return steps;

  // Collect step coordinates from the route geometry
  const coords = navRouteCoords;
  const totalSteps = stepEls.length;

  stepEls.forEach((el, i) => {
    const inst = el.querySelector(".step-inst")?.textContent || "";
    const meta = el.querySelector(".step-meta")?.textContent || "";
    const iconHtml = el.querySelector(".step-icon-wrap")?.innerHTML || "";
    const distMatch = meta.match(/([\d.]+)\s*(km|m)/);
    let distM = 0;
    if (distMatch) distM = distMatch[2] === "km" ? parseFloat(distMatch[1]) * 1000 : parseFloat(distMatch[1]);

    // Estimate coordinate index for this step (proportional distribution)
    const coordIdx = Math.min(Math.floor((i / totalSteps) * coords.length), coords.length - 1);
    const coord = coords[coordIdx] || coords[0];

    steps.push({
      type: "direct",
      mode,
      instruction: inst,
      distance: distM,
      iconHtml,
      lng: coord[0],
      lat: coord[1],
      coordIdx,
      routeProgressM: _routeProgressAtCoordIdx(coordIdx),
      isDepart: i === 0,
      isArrive: i === totalSteps - 1,
    });
  });
  return steps;
}

function buildTransitSteps(itin) {
  const steps = [];
  if (!itin?.legs) return steps;

  itin.legs.forEach((leg, legIdx) => {
    const isWalk = leg.mode === "WALK";
    const fromCoord = leg.legGeometry?.points
      ? decodePolyline(leg.legGeometry.points, leg.legGeometry.precision)
      : [];
    const startCoord = fromCoord[0] || [0, 0];
    const endCoord = fromCoord[fromCoord.length - 1] || startCoord;

    if (isWalk) {
      // Walking segment — single instruction
      const distM = Math.round(leg.distance || 0);
      const coordIdx = _findNearestCoordIdx(startCoord[1], startCoord[0]);
      steps.push({
        type: "transit-walk",
        mode: "WALK",
        instruction: legIdx === 0
          ? `Walk to ${esc(leg.to.name)}`
          : legIdx === itin.legs.length - 1
            ? `Walk to your destination`
            : `Walk to ${esc(leg.to.name)}`,
        distance: distM,
        iconHtml: modeIcon("WALK", 24),
        lng: startCoord[0], lat: startCoord[1],
        endLng: endCoord[0], endLat: endCoord[1],
        coordIdx,
        routeProgressM: _routeProgressAtCoordIdx(coordIdx),
        duration: leg.duration,
        fromName: leg.from.name,
        toName: leg.to.name,
        legIdx,
        isDepart: legIdx === 0,
        isArrive: false,
      });
    } else {
      // Transit segment — board + intermediate stops + alight
      const routeName = leg.trip?.routeShortName || leg.mode;
      const headsign = leg.trip?.tripHeadsign || leg.to.name;
      const color = legCssColor(leg.mode, leg);

      // Board instruction
      const boardCoordIdx = _findNearestCoordIdx(startCoord[1], startCoord[0]);
      steps.push({
        type: "transit-board",
        mode: leg.mode,
        instruction: `Board ${routeName} → ${esc(headsign)}`,
        distance: 0,
        iconHtml: modeIcon(leg.mode, 24),
        lng: startCoord[0], lat: startCoord[1],
        coordIdx: boardCoordIdx,
        routeProgressM: _routeProgressAtCoordIdx(boardCoordIdx),
        fromName: leg.from.name,
        stopCode: leg.from.stop?.code,
        departTime: leg.start.scheduledTime,
        routeName,
        headsign,
        color,
        legIdx,
        isDepart: false,
        isArrive: false,
      });

      // Intermediate stops
      if (leg.intermediateStops?.length) {
        leg.intermediateStops.forEach((stop, si) => {
          const stopCoordIdx = Math.floor(((si + 1) / (leg.intermediateStops.length + 1)) * fromCoord.length);
          const sc = fromCoord[Math.min(stopCoordIdx, fromCoord.length - 1)] || startCoord;
          const coordIdx = _findNearestCoordIdx(sc[1], sc[0]);
          steps.push({
            type: "transit-stop",
            mode: leg.mode,
            instruction: `Passing ${esc(stop.name || "stop")}`,
            distance: 0,
            iconHtml: `<span class="nav-stop-dot" style="background:${color}"></span>`,
            lng: sc[0], lat: sc[1],
            coordIdx,
            routeProgressM: _routeProgressAtCoordIdx(coordIdx),
            stopName: stop.name,
            stopCode: stop.code,
            routeName,
            color,
            legIdx,
            stopIdx: si,
            totalStops: leg.intermediateStops.length,
            isDepart: false,
            isArrive: false,
          });
        });
      }

      // Alight instruction
      const alightCoordIdx = _findNearestCoordIdx(endCoord[1], endCoord[0]);
      steps.push({
        type: "transit-alight",
        mode: leg.mode,
        instruction: `Get off at ${esc(leg.to.name)}`,
        distance: 0,
        iconHtml: modeIcon(leg.mode, 24),
        lng: endCoord[0], lat: endCoord[1],
        coordIdx: alightCoordIdx,
        routeProgressM: _routeProgressAtCoordIdx(alightCoordIdx),
        toName: leg.to.name,
        stopCode: leg.to.stop?.code,
        arriveTime: leg.end.scheduledTime,
        routeName,
        color,
        legIdx,
        isDepart: false,
        isArrive: false,
      });
    }
  });

  // Mark last step
  if (steps.length) steps[steps.length - 1].isArrive = true;
  return steps;
}

// ─── HUD rendering ─────────────────────────────────────────────────

function renderHUD() {
  if (!navActive || !navSteps.length || !hud) return;
  const step = navSteps[navStepIdx];
  if (!step) return;

  // Maneuver icon
  if (hudManeuver) hudManeuver.innerHTML = step.iconHtml || "";

  // Instruction text
  if (hudInstruction) hudInstruction.textContent = step.instruction;

  // Distance chip — precomputed distance of this step (to next maneuver)
  if (hudDistChip) {
    if (step.distance > 0) {
      hudDistChip.textContent = fmtDist(step.distance);
      hudDistChip.classList.remove("hide");
    } else {
      hudDistChip.classList.add("hide");
    }
  }

  // Next step preview
  if (hudNextInfo) {
    if (step.isArrive) {
      hudNextInfo.innerHTML = `You have reached your destination`;
      hudNextInfo.classList.remove("hide");
    } else {
      hudNextInfo.textContent = "";
      hudNextInfo.classList.add("hide");
    }
  }

  // ETA chip
  updateETADisplay();

  // Progress bar
  const progress = navSteps.length > 1 ? (navStepIdx / (navSteps.length - 1)) * 100 : 0;
  if (hudProgress) hudProgress.style.width = `${progress}%`;
}

function updateETADisplay() {
  if (!hudEtaChip) return;
  const step = navSteps[navStepIdx];
  if (!step) return;
  const now = new Date();
  if (navMode === "transit" && navItinerary) {
    const endTime = new Date(navItinerary.end);
    const remainMin = Math.max(0, Math.round((endTime - now) / 60000));
    hudEtaChip.textContent = remainMin > 0 ? `ETA ${fmtTime(endTime)} · ${remainMin} min` : "Arriving";
  } else {
    // Precomputed remaining duration from this step onward
    const remainSec = (step.remainDur || 0) + (step.duration || 0);
    const remainMin = Math.ceil(remainSec / 60);
    const eta = new Date(now.getTime() + remainSec * 1000);
    hudEtaChip.textContent = remainMin > 0 ? `ETA ${fmtTime(eta)} · ${remainMin} min` : "Arriving";
  }
}

// ─── Start / Stop Navigation ────────────────────────────────────────

export function startNavigation() {
  if (!dir.origin || !dir.dest) return;
  if (dir.activeIdx < 0 && !dir.directInfo) return;

  // Require GPS to be active
  const loc = getCurrentLocationState();
  if (!loc.active) {
    showToast("Location is off", "loc", "Enable GPS to start navigation");
    return;
  }

  navMode = dirTravelMode;
  navStartTime = new Date();

  // Build route coordinates
  navRouteCoords = [];
  if (navMode === "transit") {
    navItinerary = dir.itineraries[dir.activeIdx];
    if (!navItinerary) return;
    navItinerary.legs.forEach(leg => {
      if (!leg.legGeometry?.points) return;
      const coords = decodePolyline(leg.legGeometry.points, leg.legGeometry.precision);
      coords.forEach(c => navRouteCoords.push(c));
    });
    _buildRouteProgress();
    navSteps = buildTransitSteps(navItinerary);
    const startT = new Date(navItinerary.start);
    const endT = new Date(navItinerary.end);
    navTotalDur = (endT - startT) / 1000;
    navTotalDist = navItinerary.legs.reduce((s, l) => s + (l.distance || 0), 0);
  } else {
    // Direct route — use stored coords and steps
    if (dir.directRouteCoords?.length) {
      dir.directRouteCoords.forEach(c => navRouteCoords.push(c));
    }
    _buildRouteProgress();
    navSteps = buildDirectStepsFromData(navMode);
    navTotalDist = dir.directInfo?.distKm ? dir.directInfo.distKm * 1000 : 0;
    navTotalDur = dir.directInfo?.durMin ? dir.directInfo.durMin * 60 : 0;
  }

  if (!navSteps.length) return;

  navStepIdx = 0;
  _precomputeStepRemaining();
  navActive = true;
  offRouteCount = 0;
  lastRerouteTime = 0;
  lastStepAdvanceTime = 0;
  lastGpsProcessTime = 0;

  // Hide snackbar, show HUD
  if (snackbar) snackbar.classList.add("hide");
  if (hud) {
    hud.classList.remove("hide");
    hud.classList.add("nav-active");
  }
  document.body.classList.add("nav-mode");

  renderHUD();

  // Pan to the first step so the user sees where to go
  const firstStep = navSteps[0];
  if (firstStep) {
    map.easeTo({ center: [firstStep.lng, firstStep.lat], duration: 600, zoom: Math.max(map.getZoom(), 16) });
  }

  // Listen for GPS updates
  window.addEventListener("hf:current-location-updated", _onLocationUpdate);
}

export function resumeNavigation() {
  if (!navPaused || !navSteps.length) return false;
  navPaused = false;
  navActive = true;

  if (snackbar) snackbar.classList.add("hide");
  if (hud) {
    hud.classList.remove("hide");
    hud.classList.add("nav-active");
  }
  document.body.classList.add("nav-mode");

  renderHUD();

  // Pan back to current step
  const step = navSteps[navStepIdx];
  if (step) {
    map.easeTo({ center: [step.lng, step.lat], duration: 600, zoom: Math.max(map.getZoom(), 16) });
  }

  window.addEventListener("hf:current-location-updated", _onLocationUpdate);
  return true;
}

export function pauseNavigation() {
  if (!navActive) return;
  navActive = false;
  navPaused = true;
  // Hide HUD but keep all state (steps, stepIdx, coords, etc.)
  if (hud) {
    hud.classList.add("hide");
    hud.classList.remove("nav-active");
  }
  document.body.classList.remove("nav-mode");
  window.removeEventListener("hf:current-location-updated", _onLocationUpdate);
}

export function stopNavigation() {
  navActive = false;
  navPaused = false;
  navSteps = [];
  navStepIdx = 0;
  navRouteCoords = [];
  navRouteProgress = [];
  navItinerary = null;

  if (hud) {
    hud.classList.add("hide");
    hud.classList.remove("nav-active");
  }
  document.body.classList.remove("nav-mode");

  window.removeEventListener("hf:current-location-updated", _onLocationUpdate);

  // Re-show the route snackbar so the user can re-enter nav or clear route
  onNavStopped();
}

export function isNavActive() { return navActive; }
export function isNavPaused() { return navPaused; }

// ─── GPS update handler ─────────────────────────────────────────────

function _onLocationUpdate(e) {
  if (!navActive) return;
  const loc = e.detail?.location;
  if (!loc?.active || loc.lat === null) return;

  processPosition(loc.lat, loc.lng, loc.accuracy);
}

export function processPosition(lat, lng, accuracy = null) {
  if (!navActive || !navRouteCoords.length) return;

  // Throttle GPS processing to avoid rapid-fire updates
  const now = Date.now();
  if (now - lastGpsProcessTime < GPS_PROCESS_INTERVAL) return;
  lastGpsProcessTime = now;

  // Snap to route
  const snap = snapToRoute(lat, lng);

  // Off-route detection
  if (snap.dist > OFF_ROUTE_THRESHOLD) {
    offRouteCount++;
    if (offRouteCount >= 3 && Date.now() - lastRerouteTime > REROUTE_COOLDOWN) {
      _triggerReroute(lat, lng);
      return;
    }
  } else {
    offRouteCount = 0;
  }

  // Determine which step we're at based on proximity
  const prevIdx = navStepIdx;
  _advanceStep(lat, lng, accuracy, snap);

  // Only re-render HUD when the step actually changes (or first GPS tick)
  if (navStepIdx !== prevIdx) renderHUD();

  // Pan map to follow
  map.easeTo({ center: [lng, lat], duration: 600 });
}

function _advanceStep(lat, lng, accuracy, snap) {
  // ONLY advance when user's GPS is physically at the next step's location.
  // Route progress must also confirm the GPS fix is at that exact trigger point.
  // At most one step advances per call, and calls are throttled.
  const step = navSteps[navStepIdx];
  if (!step || step.isArrive) return;

  const nextStep = navSteps[navStepIdx + 1];
  if (!nextStep) return;

  // Cooldown: don't advance again within STEP_ADVANCE_COOLDOWN ms
  const now = Date.now();
  if (now - lastStepAdvanceTime < STEP_ADVANCE_COOLDOWN) return;

  if (_isGpsConfirmedAtStep(lat, lng, accuracy, snap, nextStep)) {
    navStepIdx++;
    lastStepAdvanceTime = now;
  }
}

async function _triggerReroute(lat, lng) {
  offRouteCount = 0;
  lastRerouteTime = Date.now();

  // Update origin to current position
  dir.origin = { lat, lng, name: "Current location" };

  // Show rerouting message
  if (hudInstruction) hudInstruction.textContent = "Rerouting\u2026";
  if (hudDistChip) hudDistChip.classList.add("hide");
  if (hudNextInfo) hudNextInfo.classList.add("hide");

  try {
    await findRoutes();
    // After re-routing, restart navigation with new data
    stopNavigation();
    // Delay slightly for route to render
    setTimeout(() => startNavigation(), 300);
  } catch {
    if (hudInstruction) hudInstruction.textContent = "Reroute failed";
    setTimeout(() => renderHUD(), 2000);
  }
}

// ─── Simulator ──────────────────────────────────────────────────────
// Advances to the next step without GPS. Button visible only in dev.

export function simNextStep() {
  if (!navActive) return;
  if (navStepIdx < navSteps.length - 1) {
    navStepIdx++;
    // Simulate position at the new step's coordinate
    const step = navSteps[navStepIdx];
    if (step) {
      map.easeTo({ center: [step.lng, step.lat], duration: 600, zoom: Math.max(map.getZoom(), 16) });
    }
    renderHUD();
  } else {
    // Arrived!
    if (hudInstruction) hudInstruction.textContent = "You have arrived!";
    if (hudDistChip) hudDistChip.classList.add("hide");
    if (hudNextInfo) {
      hudNextInfo.innerHTML = `<span class="nav-next-label">Navigation complete</span>`;
      hudNextInfo.classList.remove("hide");
    }
    if (hudProgress) hudProgress.style.width = "100%";
  }
}

// ─── Event listeners ────────────────────────────────────────────────
if (hudExitBtn) {
  hudExitBtn.addEventListener("click", () => {
    stopNavigation();
    // Don't clear the route — just hide HUD and let the snackbar reappear
  });
}

if (hudBody) {
  hudBody.addEventListener("click", (e) => {
    // Don't trigger if clicking exit button
    if (e.target.closest("#nav-exit")) return;
    pauseNavigation();
    openDirPanel();
  });
}

// Register hooks with directions.js to avoid circular imports
setNavHooks({
  startNav: startNavigation,
  stop: stopNavigation,
  pause: pauseNavigation,
  resume: resumeNavigation,
  isActive: isNavActive,
  isPaused: isNavPaused,
});
