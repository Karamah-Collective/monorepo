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

/** Haversine distance in metres (haversineDistance returns km). */
function _hDistM(lat1, lon1, lat2, lon2) {
  return haversineDistance(lat1, lon1, lat2, lon2) * 1000;
}

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

// GPS processing throttle
const GPS_PROCESS_INTERVAL = 1000; // ms — process GPS at most every 1s
let lastGpsProcessTime = 0;

// ─── Speed tracking ─────────────────────────────────────────────────
let _prevSpeedPos = null;  // { lat, lng, time }
let _speedKmh = 0;
const SPEED_MIN_DIST_M = 5;       // ignore micro-movements (noise floor)
const SPEED_MAX_REASONABLE = 200;  // km/h — discard insane spikes
const SPEED_HISTORY_SIZE = 4;      // median filter window
let _speedHistory = [];            // last N raw speed samples for median

// ─── Continue / approach detection ──────────────────────────────────
let _liveDistToNextM = 0;       // live GPS distance to the next step's maneuver point
let _liveRemainDistM = 0;       // live remaining distance to destination along route
const CONTINUE_DIST_M = 300;    // show "Continue on road" when further than this from next step
const APPROACH_DIST_M = 150;    // preview upcoming maneuver when closer than this

// ─── Follow-mode state ──────────────────────────────────────────────
// Always auto-recenter on the GPS position during navigation.
// If the user manually pans away, stop following and show recenter button.
let _following = true;         // true = auto-follow, false = user panned away
let _programmaticMove = false; // guard to distinguish our easeTo from user drag
let _headingDeg = 0;           // computed travel bearing in degrees (0 = north, CW)

// ─── Covered-route state ─────────────────────────────────────────────
// Tracks the portion of the route already traversed so the overlay layer
// can dim it to clearly distinguish where the user has been vs. ahead.
const NAV_COVERED_SRC   = "nav-covered-src";
const NAV_COVERED_LAYER = "nav-covered-ln";

// ─── Speed limit data ───────────────────────────────────────────────
let _maxspeeds = [];           // per-segment speed limit array from OSRM
let _currentSpeedLimit = 0;    // km/h, 0 = unknown

// ─── Movement-guard state ────────────────────────────────────────────
// The core anti-cascade mechanism. A step can ONLY advance after the user
// has physically moved _minMoveDist() metres from where the last step fired
// (or from the nav-start position). GPS noise is bounded by the accuracy
// circle (~15-20 m), so a 25 m drive threshold makes it impossible to
// cascade through multiple steps without actual movement.
let _lastTriggerPos = null;  // {lat, lng} — position where last step fired (set to GPS pos at nav start)
let _stepFired = [];         // boolean[] — once a step fires it never fires again

// ─── Approach-tracking state ─────────────────────────────────────────
// Entering the trigger radius doesn't immediately fire the step.
// Instead we track the closest distance reached. The step fires when:
//   1. Distance is within _approachFireM() (speed-scaled "very close"), OR
//   2. Distance starts increasing (user passed the closest point)
// This prevents premature step advancement at ALL speeds — at highway
// speed the fire radius grows to account for GPS tick spacing, while
// at walking speed it stays tight for maximum precision.
const APPROACH_FIRE_MIN_M = 2;  // metres — floor (very slow walk / stationary)
const APPROACH_FIRE_MAX_M = 30; // metres — cap to avoid absurd values
let _approachIdx = -1;          // step index currently being approached (-1 = none)
let _approachMinDist = Infinity; // closest distance seen while approaching

// ─── Transit stop-aware navigation ──────────────────────────────────
// Three-phase stop model: towards → at → past.
// Board steps hold until departure time to prevent premature advancement
// through intermediate stops while the user waits at the platform.
const TRANSIT_AT_RADIUS_M = 150;            // "at" the stop when within this (display)
const TRANSIT_BOARD_HOLD_BUFFER_MS = 30000; // hold 30s past scheduled departure
const TRANSIT_DEPART_MOVE_M = 300;          // movement from board stop releases hold early
let _transitHoldUntil = 0;                  // epoch ms — block advancement past board step
let _transitReachedStep = -1;               // step index where user was last "at" — prevents re-showing "Towards" after departure

/**
 * Speed-scaled fire distance. Uses an exponential time-factor that gives
 * ~3 seconds of lead time at walking speed (tight, precise) and decays
 * to ~0.8 seconds at highway speed (accounts for GPS tick spacing).
 *
 * Vehicles naturally decelerate before turns, so the live speed drops
 * and the fire distance shrinks automatically — no special braking logic.
 *
 * | Speed       | Time factor | Fire dist |
 * |-------------|-------------|----------|
 * | Walk 3 km/h | 2.6s        | ~2m      |
 * | Walk 5 km/h | 2.4s        | ~3m      |
 * | Cycle 15    | 1.6s        | ~7m      |
 * | Cycle 20    | 1.4s        | ~8m      |
 * | Drive 50    | 0.84s       | ~12m     |
 * | Drive 80    | 0.81s       | ~18m     |
 * | Drive 120   | 0.80s       | ~27m     |
 *
 * @returns {number} metres
 */
function _approachFireM() {
  const speedMs = _speedKmh / 3.6;
  // Time factor: ~3s at walking speed, decays to ~0.8s at driving speed.
  const timeFactor = 0.8 + 2.2 * Math.exp(-_speedKmh / 15);
  return Math.max(APPROACH_FIRE_MIN_M, Math.min(APPROACH_FIRE_MAX_M, speedMs * timeFactor));
}

// ─── DOM refs ───────────────────────────────────────────────────────
const hud = document.getElementById("nav-hud");
const hudManeuver = document.getElementById("nav-maneuver-icon");
const hudInstruction = document.getElementById("nav-instruction");
const hudNextInfo = document.getElementById("nav-next-info");
const hudDistChip = document.getElementById("nav-dist-chip");
const hudEtaChip = document.getElementById("nav-eta-chip");
const hudTurnChip = document.getElementById("nav-turn-chip");
const hudProgress = document.getElementById("nav-progress-fill");
const hudSpeedEl = document.getElementById("nav-speed");
const hudSpeedVal = document.getElementById("nav-speed-val");
const hudExitBtn = document.getElementById("nav-exit");
const hudBody = document.querySelector(".nav-hud-body");
const recenterBtn = document.getElementById("nav-recenter");
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
    const d = _hDistM(lat, lng, p.y, p.x);
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
    ? _hDistM(segStart[1], segStart[0], segEnd[1], segEnd[0])
    : 0;
  const progressM = (navRouteProgress[bestIdx] || 0) + segLen * bestT;
  return { dist: minDist, segIdx: bestIdx, lng: bestLng, lat: bestLat, t: bestT, progressM };
}

function distAlongRoute(fromIdx) {
  let d = 0;
  for (let i = fromIdx; i < navRouteCoords.length - 1; i++) {
    d += _hDistM(navRouteCoords[i][1], navRouteCoords[i][0],
      navRouteCoords[i + 1][1], navRouteCoords[i + 1][0]);
  }
  return d;
}

function _buildRouteProgress() {
  navRouteProgress = [];
  if (!navRouteCoords.length) return;

  navRouteProgress[0] = 0;
  for (let i = 1; i < navRouteCoords.length; i++) {
    navRouteProgress[i] = navRouteProgress[i - 1] + _hDistM(
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

// ─── Movement-guard thresholds ───────────────────────────────────────
// Minimum metres the user must travel from _lastTriggerPos before the next
// step can fire. Kept low because _stepFired[] already prevents re-triggers;
// the movement guard only needs to stop a stationary GPS fix from advancing
// through a cluster of nearby maneuver points.
function _minMoveDist() {
  if (navMode === "walk")    return 3;
  if (navMode === "cycle")   return 5;
  if (navMode === "transit") return 8;
  return 10; // drive
}

// How close to a step's lat/lng the user must be to trigger that step.
const TRANSIT_STOP_RADIUS_MIN = 40;   // metres — floor for dense bus stops
const TRANSIT_STOP_RADIUS_MAX = 150;  // metres — cap for sparse train stops
const TRANSIT_STOP_RADIUS_FRAC = 0.4; // use 40% of distance to nearest neighbor

function _triggerRadius(step) {
  if (!step) return 50;
  if (step.type === "transit-stop")  return step._adaptiveRadius || 100;
  if (step.type === "transit-board" || step.type === "transit-alight") return 60;
  if (step.type === "transit-walk")  return 35;
  // Roundabout steps are spatially compact — use a much tighter radius.
  // OSRM places the "roundabout" maneuver at the entry point and "exit
  // roundabout" at the exit point; these can be 10–30 m apart on small
  // roundabouts. A wide radius triggers both at once.
  const mt = step.maneuverType || "";
  if (mt === "roundabout" || mt === "rotary" || mt === "exit roundabout" || mt === "exit rotary" || mt === "roundabout turn") {
    return navMode === "walk" ? 12 : 15;
  }
  if (navMode === "walk")  return 25;
  if (navMode === "cycle") return 35;
  return 50; // drive
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

/**
 * Precompute adaptive trigger radii for transit-stop steps.
 * Uses the distance to the nearest neighbor stop/board/alight to set a
 * radius proportional to inter-stop spacing. Dense bus stops get tight
 * radii; sparse train stops get wide ones.
 */
function _precomputeStopRadii() {
  for (let i = 0; i < navSteps.length; i++) {
    const s = navSteps[i];
    if (s.type !== "transit-stop") continue;
    // Find the nearest transit step neighbor (prev and next)
    let minNeighborDist = Infinity;
    for (const di of [-1, 1]) {
      const ni = i + di;
      if (ni < 0 || ni >= navSteps.length) continue;
      const n = navSteps[ni];
      if (!n) continue;
      // Only consider steps in the same transit leg
      if (n.type !== "transit-stop" && n.type !== "transit-board" && n.type !== "transit-alight") continue;
      const d = _hDistM(s.lat, s.lng, n.lat, n.lng);
      if (d > 0 && d < minNeighborDist) minNeighborDist = d;
    }
    if (minNeighborDist === Infinity) {
      s._adaptiveRadius = TRANSIT_STOP_RADIUS_MAX;
    } else {
      s._adaptiveRadius = Math.max(
        TRANSIT_STOP_RADIUS_MIN,
        Math.min(TRANSIT_STOP_RADIUS_MAX, minNeighborDist * TRANSIT_STOP_RADIUS_FRAC),
      );
    }
  }
}

// ─── Build unified steps from route data ────────────────────────────

function _findNearestCoordIdx(lat, lng) {
  let best = 0, minD = Infinity;
  for (let ci = 0; ci < navRouteCoords.length; ci++) {
    const d = _hDistM(lat, lng, navRouteCoords[ci][1], navRouteCoords[ci][0]);
    if (d < minD) { minD = d; best = ci; }
  }
  return best;
}

function buildDirectStepsFromData(mode) {
  // Use raw step data stored by directions.js during route calculation.
  // rawSteps come directly from OSRM (lat/lng from maneuver.location) or OTP
  // (lat/lng from step.lat/lon), so coordinates are accurate route points.
  const rawSteps = dir.directSteps;
  if (!rawSteps?.length) return [];

  return rawSteps.map((raw, i) => {
    const lng = raw.lng ?? navRouteCoords[0]?.[0] ?? 0;
    const lat = raw.lat ?? navRouteCoords[0]?.[1] ?? 0;
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
      name: raw.name || "",
    };
  });
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
      const departTimeMs = new Date(leg.start.scheduledTime).getTime();
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
        departTimeMs,
        routeName,
        headsign,
        color,
        legIdx,
        isDepart: false,
        isArrive: false,
      });

      // Intermediate stops
      const legStartMs = new Date(leg.start.scheduledTime).getTime();
      const legEndMs = new Date(leg.end.scheduledTime).getTime();
      if (leg.intermediateStops?.length) {
        leg.intermediateStops.forEach((stop, si) => {
          // Use real coordinates from API when available; fall back to
          // proportional polyline estimate (less accurate for bus routes).
          let sLng, sLat;
          if (stop.lon != null && stop.lat != null) {
            sLng = stop.lon;
            sLat = stop.lat;
          } else {
            const stopCoordIdx = Math.floor(((si + 1) / (leg.intermediateStops.length + 1)) * fromCoord.length);
            const sc = fromCoord[Math.min(stopCoordIdx, fromCoord.length - 1)] || startCoord;
            sLng = sc[0];
            sLat = sc[1];
          }
          const coordIdx = _findNearestCoordIdx(sLat, sLng);
          // Linearly estimate arrival time at each intermediate stop
          const stopFraction = (si + 1) / (leg.intermediateStops.length + 1);
          const estimatedArrivalMs = legStartMs + (legEndMs - legStartMs) * stopFraction;
          steps.push({
            type: "transit-stop",
            mode: leg.mode,
            instruction: `Towards ${esc(stop.name || "stop")}`,
            distance: 0,
            iconHtml: `<span class="nav-stop-dot" style="background:${color}"></span>`,
            lng: sLng, lat: sLat,
            coordIdx,
            routeProgressM: _routeProgressAtCoordIdx(coordIdx),
            stopName: stop.name,
            stopCode: stop.code,
            estimatedArrivalMs,
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

  // Next step preview
  if (hudNextInfo) {
    if (step.isArrive) {
      hudNextInfo.innerHTML = `You have reached your destination`;
      hudNextInfo.classList.remove("hide");
    } else {
      const peek = navSteps[navStepIdx + 1];
      if (peek && peek.instruction) {
        hudNextInfo.textContent = `Then: ${peek.instruction}`;
        hudNextInfo.classList.remove("hide");
      } else {
        hudNextInfo.textContent = "";
        hudNextInfo.classList.add("hide");
      }
    }
  }

  // Row 2 chips — updated every render + every live tick
  _updateChips();

  // Progress bar
  const progress = navSteps.length > 1 ? (navStepIdx / (navSteps.length - 1)) * 100 : 0;
  if (hudProgress) hudProgress.style.width = `${progress}%`;
}

/**
 * Update the three row-2 chips: distance to next turn, distance to dest, ETA.
 * Called on step change (renderHUD) and on every GPS tick (_updateLiveHUD).
 */
function _updateChips() {
  const step = navSteps[navStepIdx];
  if (!step) return;

  // Chip 1: Distance to next turn (live countdown) with maneuver icon
  if (hudTurnChip) {
    const nextStep = navSteps[navStepIdx + 1];
    if (_liveDistToNextM > 0 && !step.isArrive && nextStep) {
      const icon = nextStep.iconHtml || "↱";
      hudTurnChip.innerHTML = `<span class="nav-chip-icon">${icon}</span> ${esc(fmtDist(_liveDistToNextM))}`;
      hudTurnChip.classList.remove("hide");
    } else {
      hudTurnChip.classList.add("hide");
    }
  }

  // Chip 2: Distance remaining to destination (live from route progress)
  if (hudDistChip) {
    const remainDistM = _liveRemainDistM > 0 ? _liveRemainDistM : (step.remainDist || 0) + (step.distance || 0);
    if (remainDistM > 0) {
      hudDistChip.textContent = fmtDist(remainDistM);
      hudDistChip.classList.remove("hide");
    } else {
      hudDistChip.classList.add("hide");
    }
  }

  // Chip 3: ETA
  _updateETAChip();
}

function _updateETAChip() {
  if (!hudEtaChip) return;
  const step = navSteps[navStepIdx];
  if (!step) return;
  const now = new Date();
  if (navMode === "transit" && navItinerary) {
    const endTime = new Date(navItinerary.end);
    const remainMin = Math.max(0, Math.round((endTime - now) / 60000));
    hudEtaChip.textContent = remainMin > 0 ? `ETA ${fmtTime(endTime)}` : "Arriving";
  } else {
    const remainSec = (step.remainDur || 0) + (step.duration || 0);
    const remainMin = Math.ceil(remainSec / 60);
    const eta = new Date(now.getTime() + remainSec * 1000);
    hudEtaChip.textContent = remainMin > 0 ? `ETA ${fmtTime(eta)}` : "Arriving";
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
    _maxspeeds = dir.directMaxspeeds || [];
    navTotalDist = dir.directInfo?.distKm ? dir.directInfo.distKm * 1000 : 0;
    navTotalDur = dir.directInfo?.durMin ? dir.directInfo.durMin * 60 : 0;
  }

  if (!navSteps.length) return;

  navStepIdx = 0;
  _precomputeStepRemaining();
  if (navMode === "transit") _precomputeStopRadii();
  navActive = true;
  offRouteCount = 0;
  lastRerouteTime = 0;
  lastGpsProcessTime = 0;

  // Seed the movement guard from the current GPS position so the first step
  // can only fire once the user has actually moved _minMoveDist() metres.
  const locNow = getCurrentLocationState();
  _lastTriggerPos = (locNow.active && locNow.lat !== null)
    ? { lat: locNow.lat, lng: locNow.lng }
    : null;
  _stepFired = new Array(navSteps.length).fill(false);
  _approachIdx = -1;
  _approachMinDist = Infinity;
  _transitHoldUntil = 0;
  _transitReachedStep = -1;
  _prevSpeedPos = null;
  _speedKmh = 0;
  _speedHistory = [];
  _liveDistToNextM = 0;
  _liveRemainDistM = 0;
  _headingDeg = 0;
  _prevHeadingPos = null;
  _following = true;
  _programmaticMove = false;
  if (recenterBtn) recenterBtn.classList.add("hide");

  // Hide snackbar, show HUD
  if (snackbar) snackbar.classList.add("hide");
  if (hud) {
    hud.classList.remove("hide");
    hud.classList.add("nav-active");
  }
  if (hudSpeedEl) hudSpeedEl.classList.remove("hide"); // show speedometer immediately
  if (hudSpeedVal) hudSpeedVal.textContent = "0";
  document.body.classList.add("nav-mode");

  _initCoveredRouteLayer();
  renderHUD();

  // Pan to the first step so the user sees where to go
  const firstStep = navSteps[0];
  if (firstStep) {
    _programmaticMove = true;
    map.easeTo({ center: [firstStep.lng, firstStep.lat], duration: 600, zoom: Math.max(map.getZoom(), 16) });
    map.once("moveend", () => { _programmaticMove = false; });
  }

  // Listen for GPS updates
  window.addEventListener("hf:current-location-updated", _onLocationUpdate);
}

export function resumeNavigation() {
  if (!navPaused || !navSteps.length) return false;
  navPaused = false;
  navActive = true;
  _following = true;
  _programmaticMove = false;
  if (recenterBtn) recenterBtn.classList.add("hide");

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
    _programmaticMove = true;
    map.easeTo({ center: [step.lng, step.lat], duration: 600, zoom: Math.max(map.getZoom(), 16) });
    map.once("moveend", () => { _programmaticMove = false; });
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
  if (hudSpeedEl) hudSpeedEl.classList.add("hide");
  if (recenterBtn) recenterBtn.classList.add("hide");
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
  _lastTriggerPos = null;
  _stepFired = [];
  _approachIdx = -1;
  _approachMinDist = Infinity;
  _transitHoldUntil = 0;
  _transitReachedStep = -1;
  _prevSpeedPos = null;
  _speedKmh = 0;
  _speedHistory = [];
  _liveDistToNextM = 0;
  _liveRemainDistM = 0;
  _maxspeeds = [];
  _currentSpeedLimit = 0;
  _headingDeg = 0;
  _prevHeadingPos = null;
  _following = true;
  _programmaticMove = false;

  // Restore north-up orientation
  map.easeTo({ bearing: 0, duration: 400 });

  if (hud) {
    hud.classList.add("hide");
    hud.classList.remove("nav-active");
  }
  if (hudSpeedEl) hudSpeedEl.classList.add("hide");
  if (recenterBtn) recenterBtn.classList.add("hide");
  document.body.classList.remove("nav-mode");

  _removeCoveredRouteLayer();
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

  // Throttle GPS processing — no need to evaluate every raw hardware tick
  const now = Date.now();
  if (now - lastGpsProcessTime < GPS_PROCESS_INTERVAL) return;
  lastGpsProcessTime = now;

  // Snap to route for off-route detection and progress display
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

  // Attempt to advance to the next step
  const prevIdx = navStepIdx;
  _advanceStep(lat, lng, snap.progressM);

  // Compute live distance to next maneuver point
  const nextForDist = navSteps[navStepIdx + 1];
  _liveDistToNextM = nextForDist ? _hDistM(lat, lng, nextForDist.lat, nextForDist.lng) : 0;

  // Compute live remaining distance along route
  const totalRouteM = navRouteProgress.length ? navRouteProgress[navRouteProgress.length - 1] : 0;
  _liveRemainDistM = Math.max(0, totalRouteM - snap.progressM);

  // Look up speed limit for this route segment
  _currentSpeedLimit = _lookupSpeedLimit(snap.segIdx);

  // Re-render HUD only when the step changes
  if (navStepIdx !== prevIdx) renderHUD();

  // Lightweight live update — distance countdown + continue/approach instructions
  _updateLiveHUD();

  // Dim already-covered portion of the route
  _updateCoveredRoute(snap);

  // Update speed from consecutive GPS samples
  _updateSpeed(lat, lng, now);

  // Compute heading from consecutive GPS positions (only when moving)
  _updateHeading(lat, lng);

  // Smooth follow: keep GPS position centered without animation overlap
  _smartFollow(lng, lat);
}

// ─── Covered-route overlay ──────────────────────────────────────────

/**
 * Update the "already covered" route overlay up to the user's current
 * snapped position. Called on every GPS tick.
 * @param {{ segIdx: number, lng: number, lat: number }} snap - snapToRoute result
 */
function _updateCoveredRoute(snap) {
  const src = map.getSource(NAV_COVERED_SRC);
  if (!src) return;

  // Collect all coordinates from the route start up to the snapped segment
  const coords = [];
  for (let i = 0; i <= snap.segIdx && i < navRouteCoords.length; i++) {
    coords.push(navRouteCoords[i]);
  }
  // Append the interpolated point on the current segment so the line
  // ends exactly at the user's position rather than the last vertex.
  if (coords.length > 0 && (snap.lng !== coords[coords.length - 1][0] || snap.lat !== coords[coords.length - 1][1])) {
    coords.push([snap.lng, snap.lat]);
  }

  if (coords.length < 2) return;

  src.setData({
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
  });
}

/**
 * Add the covered-route source and layer onto the map.
 * Called once when navigation starts.
 */
function _initCoveredRouteLayer() {
  if (map.getSource(NAV_COVERED_SRC)) return; // already exists (shouldn't happen)

  map.addSource(NAV_COVERED_SRC, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: NAV_COVERED_LAYER,
    type: "line",
    source: NAV_COVERED_SRC,
    paint: {
      "line-color": "rgba(55, 55, 65, 0.58)",
      "line-width": navMode === "walk" ? 5 : 6,
    },
    layout: { "line-cap": "round", "line-join": "round" },
  });
}

/**
 * Remove the covered-route source and layer from the map.
 * Called when navigation stops.
 */
function _removeCoveredRouteLayer() {
  if (map.getLayer(NAV_COVERED_LAYER)) map.removeLayer(NAV_COVERED_LAYER);
  if (map.getSource(NAV_COVERED_SRC))  map.removeSource(NAV_COVERED_SRC);
}

// ─── Smooth follow mode ─────────────────────────────────────────────

function _smartFollow(lng, lat) {
  if (!_following) {
    if (recenterBtn) recenterBtn.classList.remove("hide");
    return;
  }

  // Smooth animated recenter + bearing on every GPS tick
  _programmaticMove = true;
  map.easeTo({ center: [lng, lat], bearing: _headingDeg, duration: 600 });
  map.once("moveend", () => { _programmaticMove = false; });
}

function _stopFollowing() {
  if (!navActive || !_following) return;
  map.stop();
  _following = false;
  _programmaticMove = false;
  if (recenterBtn) recenterBtn.classList.remove("hide");
}

function _onUserInteraction(e) {
  if (!navActive) return;
  if (!e.originalEvent) return; // programmatic easeTo/flyTo — ignore
  _stopFollowing();
}

function _recenter() {
  _following = true;
  if (recenterBtn) recenterBtn.classList.add("hide");

  // Immediately center on latest known position with heading-up bearing
  const loc = getCurrentLocationState();
  if (loc.active && loc.lat !== null) {
    _programmaticMove = true;
    map.easeTo({ center: [loc.lng, loc.lat], bearing: _headingDeg, duration: 400 });
    map.once("moveend", () => { _programmaticMove = false; });
  }
}

// ─── Speedometer ────────────────────────────────────────────────────

function _medianOfArray(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function _updateSpeed(lat, lng, now) {
  if (_prevSpeedPos) {
    const dtSec = (now - _prevSpeedPos.time) / 1000;
    if (dtSec > 0.5) { // need at least 0.5s between samples for accuracy
      const distM = _hDistM(lat, lng, _prevSpeedPos.lat, _prevSpeedPos.lng);
      if (distM >= SPEED_MIN_DIST_M) {
        const rawKmh = (distM / dtSec) * 3.6;
        // Discard physically impossible spikes (GPS teleport)
        if (rawKmh <= SPEED_MAX_REASONABLE) {
          // Push into history buffer for median filtering
          _speedHistory.push(rawKmh);
          if (_speedHistory.length > SPEED_HISTORY_SIZE) _speedHistory.shift();
          // Use median to reject outliers, then smooth
          const medianKmh = _medianOfArray(_speedHistory);
          _speedKmh = _speedKmh === 0 ? medianKmh : _speedKmh * 0.3 + medianKmh * 0.7;
        }
        _prevSpeedPos = { lat, lng, time: now };
      }
      // If distance is tiny (noise/stationary), decay speed toward 0
      else if (dtSec > 3) {
        _speedKmh *= 0.4;
        if (_speedKmh < 2) _speedKmh = 0;
        _speedHistory = [];
        _prevSpeedPos = { lat, lng, time: now };
      }
    }
  } else {
    _prevSpeedPos = { lat, lng, time: now };
  }
  _renderSpeedChip();
}

// ─── Heading computation ────────────────────────────────────────────
const HEADING_MIN_DIST_M = 5; // ignore micro-movements for heading
let _prevHeadingPos = null;   // { lat, lng }

/**
 * Compute travel bearing from consecutive GPS positions.
 * Only updates when user has moved enough to produce a reliable direction.
 * @param {number} lat
 * @param {number} lng
 */
function _updateHeading(lat, lng) {
  if (!_prevHeadingPos) {
    _prevHeadingPos = { lat, lng };
    return;
  }
  const dist = _hDistM(_prevHeadingPos.lat, _prevHeadingPos.lng, lat, lng);
  if (dist < HEADING_MIN_DIST_M) return;

  // Forward azimuth: bearing from previous position to current
  const dLng = (lng - _prevHeadingPos.lng) * Math.PI / 180;
  const lat1 = _prevHeadingPos.lat * Math.PI / 180;
  const lat2 = lat * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  _headingDeg = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;

  _prevHeadingPos = { lat, lng };
}

function _renderSpeedChip() {
  if (!hudSpeedEl || !hudSpeedVal) return;
  const display = Math.round(_speedKmh);
  hudSpeedVal.textContent = display;
  hudSpeedEl.classList.remove("hide"); // always visible while nav is active
  // Color: green under limit, red over limit, default when unknown
  if (_currentSpeedLimit > 0) {
    hudSpeedVal.style.color = _speedKmh > _currentSpeedLimit ? "var(--danger)" : "var(--success)";
  } else {
    hudSpeedVal.style.color = "";
  }
}

/**
 * Look up the speed limit for the route segment nearest to the given coord index.
 * OSRM maxspeed annotations align with route coordinate segments (N-1 entries for N coords).
 */
function _lookupSpeedLimit(coordIdx) {
  if (!_maxspeeds.length) return 0;
  const segIdx = Math.max(0, Math.min(coordIdx, _maxspeeds.length - 1));
  const seg = _maxspeeds[segIdx];
  if (!seg || seg.none) return 0;
  // OSRM returns { speed: number, unit: "km/h" | "mph" }
  let kmh = seg.speed || 0;
  if (seg.unit === "mph") kmh = Math.round(kmh * 1.60934);
  return kmh;
}

// ─── Live HUD updates (continue / approach) ─────────────────────────
// Maneuver types that represent a completed action — after executing these,
// the user is on a straight road segment and benefits from "Continue on X".
const _COMPLETED_MANEUVERS = new Set([
  "turn", "fork", "merge", "on ramp", "off ramp", "end of road",
  "exit roundabout", "exit rotary", "roundabout turn", "use lane",
]);

/**
 * Lightweight per-tick HUD update — live distance countdown, chips,
 * continue/approach instruction overrides, and speed limit lookup.
 * Called every GPS tick (after renderHUD on step change).
 */
function _updateLiveHUD() {
  if (!navActive || !hud || !navSteps.length) return;
  const step = navSteps[navStepIdx];
  const next = navSteps[navStepIdx + 1];

  // Always update chips (they show live distance data)
  _updateChips();

  if (!step || step.isArrive || !next) return;

  // Transit steps get their own live HUD updates
  if (step.type !== "direct") {
    if (navMode === "transit") _updateTransitLiveHUD(step, next);
    return;
  }

  // Approaching next maneuver — preview the upcoming turn
  if (_liveDistToNextM > 0 && _liveDistToNextM <= APPROACH_DIST_M) {
    if (hudInstruction) hudInstruction.textContent = next.instruction;
    if (hudManeuver) hudManeuver.innerHTML = next.iconHtml || "";
    if (hudNextInfo) {
      const afterNext = navSteps[navStepIdx + 2];
      if (next.isArrive) {
        hudNextInfo.textContent = "Arriving at destination";
        hudNextInfo.classList.remove("hide");
      } else if (afterNext && afterNext.instruction) {
        hudNextInfo.textContent = `Then: ${afterNext.instruction}`;
        hudNextInfo.classList.remove("hide");
      } else {
        hudNextInfo.textContent = "";
        hudNextInfo.classList.add("hide");
      }
    }
    return;
  }

  // Long segment — show "Continue on [road]" for completed maneuvers
  // or append distance to depart/continue/new name steps
  if (_liveDistToNextM > CONTINUE_DIST_M) {
    const road = step.name || "";
    const mt = step.maneuverType;
    if (_COMPLETED_MANEUVERS.has(mt)) {
      if (hudInstruction) {
        hudInstruction.textContent = road
          ? `Continue on ${road}`
          : `Continue straight`;
      }
      if (hudManeuver) {
        hudManeuver.innerHTML = maneuverIconSvg("new name", "straight");
      }
    }
  }
}

// ─── Transit live HUD updates ───────────────────────────────────────
// Three-phase model for transit stops: towards → at → past.
// Board steps show wait time. Alight steps intensify when close.

/**
 * Dynamically update the HUD instruction and next-info for transit steps
 * based on the user's live GPS position relative to the current stop.
 * @param {object} step - current navStep
 * @param {object|undefined} next - next navStep (may be undefined)
 */
function _updateTransitLiveHUD(step, next) {
  if (!hudInstruction) return;
  const loc = getCurrentLocationState();
  if (!loc.active || loc.lat === null) return;

  const distToStep = _hDistM(loc.lat, loc.lng, step.lat, step.lng);

  // ── Board step: show wait time until departure ────────────────────
  if (step.type === "transit-board") {
    if (step.departTimeMs) {
      const waitMs = step.departTimeMs - Date.now();
      if (waitMs > 60000) {
        const waitMin = Math.ceil(waitMs / 60000);
        hudInstruction.textContent = `${step.routeName} arrives in ${waitMin} min`;
      } else if (waitMs > 0) {
        hudInstruction.textContent = `${step.routeName} arriving soon`;
      } else {
        hudInstruction.textContent = step.instruction; // "Board X → Y"
      }
    }
    if (hudNextInfo) {
      hudNextInfo.textContent = `${step.routeName} → ${step.headsign}`;
      hudNextInfo.classList.remove("hide");
    }
    return;
  }

  // ── Intermediate stop: towards / at / departing ────────────────────
  if (step.type === "transit-stop") {
    const name = esc(step.stopName || "stop");
    const atRadius = step._adaptiveRadius || TRANSIT_AT_RADIUS_M;
    // Once we've been within AT radius, remember it — we can never go
    // "Towards" this stop again after departing it.
    const alreadyReached = _transitReachedStep >= navStepIdx;
    if (distToStep <= atRadius && !alreadyReached) {
      _transitReachedStep = navStepIdx;
      hudInstruction.textContent = `At ${name}`;
    } else if (alreadyReached && next) {
      // Already been at this stop — show next destination
      const nextName = next.type === "transit-alight"
        ? esc(next.toName || "your stop")
        : esc(next.stopName || "next stop");
      if (distToStep <= atRadius) {
        hudInstruction.textContent = `At ${name}`;
      } else {
        hudInstruction.textContent = `Towards ${nextName}`;
      }
    } else {
      hudInstruction.textContent = `Towards ${name}`;
    }
    // Next-info: stops remaining + next stop preview
    if (hudNextInfo && step.totalStops !== undefined && step.stopIdx !== undefined) {
      const remaining = step.totalStops - step.stopIdx;
      if (next) {
        const nextName = next.type === "transit-alight"
          ? next.toName
          : (next.stopName || "next stop");
        hudNextInfo.textContent = remaining === 1
          ? `Next: get off at ${esc(nextName)}`
          : `${remaining} stops left · Next: ${esc(nextName)}`;
      } else {
        hudNextInfo.textContent = `${remaining} stop${remaining === 1 ? "" : "s"} remaining`;
      }
      hudNextInfo.classList.remove("hide");
    }
    return;
  }

  // ── Alight step: urgency when close ───────────────────────────────
  if (step.type === "transit-alight") {
    const name = esc(step.toName || "your stop");
    if (distToStep <= TRANSIT_AT_RADIUS_M) {
      hudInstruction.textContent = `Get off now — ${name}`;
    } else {
      hudInstruction.textContent = `Get off at ${name}`;
    }
    if (hudNextInfo) {
      const nextStep = next;
      if (nextStep && nextStep.instruction) {
        hudNextInfo.textContent = `Then: ${nextStep.instruction}`;
        hudNextInfo.classList.remove("hide");
      }
    }
    return;
  }

  // ── Walk step in transit mode ─────────────────────────────────────
  if (step.type === "transit-walk") {
    // Show distance to the walk destination
    if (step.endLat && step.endLng) {
      const walkDist = _hDistM(loc.lat, loc.lng, step.endLat, step.endLng);
      if (walkDist < 30) {
        hudInstruction.textContent = `Arriving at ${esc(step.toName || "stop")}`;
      } else {
        hudInstruction.textContent = `${step.instruction} · ${fmtDist(walkDist)}`;
      }
    }
    if (hudNextInfo && next) {
      // If next step is board, show wait time preview
      if (next.type === "transit-board" && next.departTimeMs) {
        const waitMs = next.departTimeMs - Date.now();
        if (waitMs > 0) {
          const waitMin = Math.ceil(waitMs / 60000);
          hudNextInfo.textContent = `${next.routeName} departs in ${waitMin} min`;
        } else {
          hudNextInfo.textContent = `Then: ${next.instruction}`;
        }
      } else {
        hudNextInfo.textContent = `Then: ${next.instruction}`;
      }
      hudNextInfo.classList.remove("hide");
    }
    return;
  }
}

// ─── Step advancement ────────────────────────────────────────────────
// Scans forward from the current step to find the step the user has reached.
//
// For driving/cycling, entering the trigger radius does NOT immediately fire.
// Instead, the approach-tracking algorithm waits until:
//   a) The user is within APPROACH_FIRE_M (8m) of the maneuver point, OR
//   b) The distance starts increasing (user passed the closest point).
// This prevents premature step changes on highway exits where the next
// maneuver is nearby — seeing the wrong instruction at speed is dangerous.
//
// Walking mode fires immediately on trigger-radius entry (no approach needed).
//
// Additional detection methods:
// - ROUTE PROGRESS catch-up for missed maneuvers.
// - DIVERGENCE detection for turns never entered.
//
// Guards:
// - MOVEMENT — must have moved _minMoveDist() from last trigger position.
// - ONCE-FIRED — _stepFired[] prevents any step from re-triggering.

function _advanceStep(lat, lng, snapProgressM) {
  if (navStepIdx >= navSteps.length - 1) return;

  // ── Transit board hold — wait at platform until departure ────────
  // Prevents cascading through intermediate stops while the user waits
  // at the boarding station. Releases when departure time passes (+buffer)
  // or when the user has clearly started moving (on the vehicle).
  if (navMode === "transit" && _transitHoldUntil > 0) {
    const current = navSteps[navStepIdx];
    if (current?.type === "transit-board") {
      const movedFromBoard = _hDistM(lat, lng, current.lat, current.lng);
      if (Date.now() < _transitHoldUntil && movedFromBoard < TRANSIT_DEPART_MOVE_M) {
        return; // still holding — don't advance
      }
      // Hold released — force-advance past the board step
      _transitHoldUntil = 0;
      if (navStepIdx < navSteps.length - 1) {
        navStepIdx++;
        _stepFired[navStepIdx] = true;
        _lastTriggerPos = { lat, lng };
        _approachIdx = -1;
        _approachMinDist = Infinity;
      }
      return; // let the next tick handle further advancement
    }
    // If we're no longer on a board step, clear stale hold
    _transitHoldUntil = 0;
  }

  // ── Movement guard — must have physically moved ──────────────────
  if (_lastTriggerPos !== null) {
    const moved = _hDistM(lat, lng, _lastTriggerPos.lat, _lastTriggerPos.lng);
    if (moved < _minMoveDist()) return;
  }

  const scanLimit = Math.min(navStepIdx + 6, navSteps.length);
  let bestIdx = -1;
  const fireM = _approachFireM();
  // Hysteresis scales with speed: min 2m (walk), grows at higher speeds
  // to absorb larger GPS jitter when moving fast.
  const hysteresisM = Math.max(2, fireM * 0.4);

  // ── Approach-then-fire proximity scan (all modes) ────────────────
  // Check the step we're currently approaching (if any)
  if (_approachIdx > navStepIdx && _approachIdx < scanLimit) {
    const step = navSteps[_approachIdx];
    if (step) {
      const dist = _hDistM(lat, lng, step.lat, step.lng);
      if (dist <= fireM) {
        // Within speed-scaled fire distance — fire immediately
        bestIdx = _approachIdx;
        _approachIdx = -1;
        _approachMinDist = Infinity;
      } else if (dist > _approachMinDist + hysteresisM) {
        // Distance is increasing — user has passed the closest point.
        // Hysteresis prevents GPS jitter from triggering false pass-through.
        bestIdx = _approachIdx;
        _approachIdx = -1;
        _approachMinDist = Infinity;
      } else {
        // Still approaching — update min distance
        if (dist < _approachMinDist) _approachMinDist = dist;
      }
    }
  }

  // If no approach in progress, scan for new entries into trigger radius
  if (bestIdx === -1 && _approachIdx === -1) {
    for (let i = navStepIdx + 1; i < scanLimit; i++) {
      const step = navSteps[i];
      if (!step) break;
      const dist = _hDistM(lat, lng, step.lat, step.lng);
      if (dist <= _triggerRadius(step)) {
        if (dist <= fireM) {
          bestIdx = i; // already within fire distance — fire
        } else {
          // Start approach tracking for this step
          _approachIdx = i;
          _approachMinDist = dist;
        }
        break; // only track one approach at a time
      }
    }
  }

  // ── Route-progress catch-up ──────────────────────────────────────
  // If proximity didn't match (user blew past the trigger zone between
  // GPS samples), check if the user's route progress has moved beyond
  // the next step's route position. This means they've already crossed
  // that maneuver point — mark it as passed and advance to the step
  // AFTER it so the HUD shows the upcoming instruction, not the one
  // the user already completed.
  if (bestIdx === -1 && snapProgressM > 0) {
    let lastPassedIdx = -1;
    for (let i = navStepIdx + 1; i < scanLimit; i++) {
      const step = navSteps[i];
      if (!step || !Number.isFinite(step.routeProgressM)) break;
      if (snapProgressM >= step.routeProgressM) {
        lastPassedIdx = i; // user is past this step along the route
        // Don't skip past alight steps — they must be displayed
        if (step.type === "transit-alight") break;
      } else {
        break; // steps are ordered by route progress — stop scanning
      }
    }
    // Advance to the step AFTER the last one we've passed, so the HUD
    // shows the next upcoming instruction. If the passed step is the
    // last step, just show it (arrival).
    if (lastPassedIdx !== -1) {
      if (lastPassedIdx < navSteps.length - 1) {
        bestIdx = lastPassedIdx + 1;
      } else {
        bestIdx = lastPassedIdx; // final step — show arrival
      }
    }
  }

  // ── Divergence-based early advance ────────────────────────────────
  // If still no match: check if the user is moving AWAY from the
  // next step and TOWARD the step after it. This means they've already
  // passed the next step even though they never entered its trigger
  // radius. Safety: only fire when distance to next+1 is < distance to
  // next AND the user is closer to next+1 than its trigger radius × 3
  // (generous but bounded).
  if (bestIdx === -1) {
    const nextStep = navSteps[navStepIdx + 1];
    const afterStep = navSteps[navStepIdx + 2];
    if (nextStep && afterStep) {
      // Never skip alight steps — they must be displayed to the user
      if (nextStep.type !== "transit-alight") {
        const distToNext = _hDistM(lat, lng, nextStep.lat, nextStep.lng);
        const distToAfter = _hDistM(lat, lng, afterStep.lat, afterStep.lng);
        // User is closer to the step-after-next than to the next step,
        // AND within a reasonable distance of it (not miles away)
        if (distToAfter < distToNext && distToAfter < _triggerRadius(afterStep) * 3) {
          // Skip the missed step, show the one we're approaching
          bestIdx = navStepIdx + 2;
        }
      }
    }
  }

  if (bestIdx === -1) return; // not close to any upcoming step

  // Mark all skipped steps + the target step as fired
  for (let i = navStepIdx + 1; i <= bestIdx; i++) {
    _stepFired[i] = true;
  }

  navStepIdx = bestIdx;
  _lastTriggerPos = { lat, lng };
  // Reset approach tracking — the fired step (or any in-flight approach) is consumed
  _approachIdx = -1;
  _approachMinDist = Infinity;

  // If we just landed on a transit-board step, activate the hold so we
  // don't immediately cascade through intermediate stops while waiting.
  const firedStep = navSteps[navStepIdx];
  if (firedStep?.type === "transit-board" && firedStep.departTimeMs) {
    _transitHoldUntil = firedStep.departTimeMs + TRANSIT_BOARD_HOLD_BUFFER_MS;
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
// Advances to the next step without GPS. Always visible so the user can
// verify step-by-step progression without needing to physically move.

export function simNextStep() {
  if (!navActive) return;
  if (navStepIdx < navSteps.length - 1) {
    navStepIdx++;
    _stepFired[navStepIdx] = true;
    // Update the trigger position to the simulated step so that if GPS nav
    // resumes later, the movement guard is seeded from the simulated location.
    const step = navSteps[navStepIdx];
    if (step) {
      _lastTriggerPos = { lat: step.lat, lng: step.lng };
      _programmaticMove = true;
      map.easeTo({ center: [step.lng, step.lat], duration: 600, zoom: Math.max(map.getZoom(), 16) });
      map.once("moveend", () => { _programmaticMove = false; });
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

if (recenterBtn) {
  recenterBtn.addEventListener("click", _recenter);
}

// Detect user-initiated map interactions during navigation.
// Canvas-level hooks fire before MapLibre's camera animation can keep fighting
// the user's gesture, so any real manual map interaction drops out of follow mode.
const _mapGestureTarget = map.getCanvasContainer();
_mapGestureTarget.addEventListener("pointerdown", () => {
  if (navActive) _stopFollowing();
}, { passive: true });
_mapGestureTarget.addEventListener("wheel", () => {
  if (navActive) _stopFollowing();
}, { passive: true });

// Keep MapLibre-level hooks too so pinch/rotate gestures and other interaction
// paths also break follow mode when they provide a user-originated event.
map.on("dragstart", _onUserInteraction);
map.on("zoomstart", _onUserInteraction);
map.on("rotatestart", _onUserInteraction);
map.on("pitchstart", _onUserInteraction);

// Register hooks with directions.js to avoid circular imports
setNavHooks({
  startNav: startNavigation,
  stop: stopNavigation,
  pause: pauseNavigation,
  resume: resumeNavigation,
  isActive: isNavActive,
  isPaused: isNavPaused,
});
