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
let navMode = "drive";     // drive | walk | cycle | transit
let navItinerary = null;   // the active itinerary (transit) or null
let navStartTime = null;
let navTotalDist = 0;      // metres
let navTotalDur = 0;       // seconds
let navRemainingDist = 0;

// Off-route detection
const OFF_ROUTE_THRESHOLD = 50; // metres
const REROUTE_COOLDOWN = 15000; // don't reroute more than once per 15s
let lastRerouteTime = 0;
let offRouteCount = 0;

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
  for (let i = 0; i < navRouteCoords.length - 1; i++) {
    const [ax, ay] = navRouteCoords[i];
    const [bx, by] = navRouteCoords[i + 1];
    const p = _nearestPointOnSegment(lng, lat, ax, ay, bx, by);
    const d = haversineDistance(lat, lng, p.y, p.x);
    if (d < minDist) { minDist = d; bestIdx = i; bestLng = p.x; bestLat = p.y; }
  }
  return { dist: minDist, segIdx: bestIdx, lng: bestLng, lat: bestLat };
}

function distAlongRoute(fromIdx) {
  let d = 0;
  for (let i = fromIdx; i < navRouteCoords.length - 1; i++) {
    d += haversineDistance(navRouteCoords[i][1], navRouteCoords[i][0],
      navRouteCoords[i + 1][1], navRouteCoords[i + 1][0]);
  }
  return d;
}

// ─── Build unified steps from route data ────────────────────────────

function buildDirectStepsFromData(mode) {
  // Use raw step data stored by directions.js during route calculation
  const rawSteps = dir.directSteps;
  if (!rawSteps?.length) return buildDirectStepsFallback(mode);

  return rawSteps.map((raw, i) => ({
    type: "direct",
    mode,
    instruction: raw.instruction,
    distance: raw.distance || 0,
    duration: raw.duration || 0,
    iconHtml: raw.iconHtml,
    lng: raw.lng || navRouteCoords[0]?.[0] || 0,
    lat: raw.lat || navRouteCoords[0]?.[1] || 0,
    coordIdx: 0,
    isDepart: raw.isFirst || i === 0,
    isArrive: raw.isLast || i === rawSteps.length - 1,
    maneuverType: raw.maneuverType || "",
    maneuverMod: raw.maneuverMod || "",
  }));
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
      steps.push({
        type: "transit-board",
        mode: leg.mode,
        instruction: `Board ${routeName} → ${esc(headsign)}`,
        distance: 0,
        iconHtml: modeIcon(leg.mode, 24),
        lng: startCoord[0], lat: startCoord[1],
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
          steps.push({
            type: "transit-stop",
            mode: leg.mode,
            instruction: `Passing ${esc(stop.name || "stop")}`,
            distance: 0,
            iconHtml: `<span class="nav-stop-dot" style="background:${color}"></span>`,
            lng: sc[0], lat: sc[1],
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
      steps.push({
        type: "transit-alight",
        mode: leg.mode,
        instruction: `Get off at ${esc(leg.to.name)}`,
        distance: 0,
        iconHtml: modeIcon(leg.mode, 24),
        lng: endCoord[0], lat: endCoord[1],
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

  // Distance chip
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
    const nextStep = navSteps[navStepIdx + 1];
    if (nextStep && !step.isArrive) {
      hudNextInfo.innerHTML = esc(nextStep.instruction);
      hudNextInfo.classList.remove("hide");
    } else if (step.isArrive) {
      hudNextInfo.innerHTML = `You have reached your destination`;
      hudNextInfo.classList.remove("hide");
    } else {
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
  const now = new Date();
  if (navMode === "transit" && navItinerary) {
    const endTime = new Date(navItinerary.end);
    const remainMin = Math.max(0, Math.round((endTime - now) / 60000));
    hudEtaChip.textContent = remainMin > 0 ? `ETA ${fmtTime(endTime)} · ${remainMin} min` : "Arriving";
  } else {
    // Use distance ratio for more accurate ETA based on actual GPS progress
    const fraction = navTotalDist > 0 ? navRemainingDist / navTotalDist : 0;
    const remainSec = Math.max(0, navTotalDur * fraction);
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
    navSteps = buildDirectStepsFromData(navMode);
    navTotalDist = dir.directInfo?.distKm ? dir.directInfo.distKm * 1000 : 0;
    navTotalDur = dir.directInfo?.durMin ? dir.directInfo.durMin * 60 : 0;
  }

  if (!navSteps.length) return;

  navStepIdx = 0;
  navRemainingDist = navTotalDist;
  navActive = true;
  offRouteCount = 0;
  lastRerouteTime = 0;

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

  processPosition(loc.lat, loc.lng);
}

export function processPosition(lat, lng) {
  if (!navActive || !navRouteCoords.length) return;

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
  _advanceStep(lat, lng, snap);

  // Update remaining distance
  navRemainingDist = distAlongRoute(snap.segIdx);

  // Update ETA
  updateETADisplay();

  // Re-render
  renderHUD();

  // Pan map to follow
  map.easeTo({ center: [lng, lat], duration: 600 });
}

function _advanceStep(lat, lng, snap) {
  // For transit: advance based on proximity to each step's coordinate
  // For direct: advance based on proximity to next step's maneuver point
  const step = navSteps[navStepIdx];
  if (!step || step.isArrive) return;

  const nextStep = navSteps[navStepIdx + 1];
  if (!nextStep) return;

  const distToNext = haversineDistance(lat, lng, nextStep.lat, nextStep.lng);

  // Advance thresholds depend on mode
  let threshold;
  if (navMode === "transit") {
    // Transit stops: advance when within 80m
    threshold = nextStep.type === "transit-stop" ? 80 : 60;
  } else if (navMode === "walk") {
    threshold = 25;
  } else if (navMode === "cycle") {
    threshold = 35;
  } else {
    // drive
    threshold = 40;
  }

  if (distToNext < threshold) {
    navStepIdx++;
    // Update distance on current step
    if (navSteps[navStepIdx]) {
      const upcomingStep = navSteps[navStepIdx + 1];
      if (upcomingStep) {
        navSteps[navStepIdx].distance = haversineDistance(lat, lng, upcomingStep.lat, upcomingStep.lng);
      }
    }
    renderHUD();
  } else {
    // Update distance display to next maneuver
    step.distance = distToNext;
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
