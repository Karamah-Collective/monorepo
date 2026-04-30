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
import { is3DActive, disable3D, enable3D } from "./map-controls.js";

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

// Route-processing throttle
const ROUTE_PROCESS_INTERVAL_MS = 250; // ms — keep expensive route math at 4 Hz
let _lastRouteProcessTime = 0;

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
let _isOverview = false;       // true = route overview mode (map shows full route)
let _headingDeg = 0;           // computed travel bearing in degrees (0 = north, CW)
let _touchCount = 0;           // active fingers on map canvas -- suppresses auto-center while touching
let _touchPanStart = null;     // { x, y } for early mobile drag detection
let _touchPanMoved = false;

// Follow easing — base duration, dynamically shortened at higher speeds.
// MapLibre interpolates position + zoom continuously over this duration,
// and each new GPS tick seamlessly starts a fresh animation from the
// current camera state, producing one unbroken motion.
const FOLLOW_DURATION_BASE_MS = 1100;
const FOLLOW_DURATION_MIN_MS  = 500;
const TOUCH_DRAG_BREAK_PX = 10;

// ─── EMA smoothing for follow target ────────────────────────────────
// Absorbs GPS micro-jitter so the camera glides instead of trembling.
// α closer to 1 = more responsive, closer to 0 = smoother.
const FOLLOW_SMOOTH_ALPHA = 0.35;
let _smoothLng = null;  // EMA-filtered follow target
let _smoothLat = null;
let _smoothBearing = null;
let _smoothZoom = null; // committed zoom target — only updates when criteria are met
let _smoothPitch = null; // committed pitch target — flattens at turns
let _renderZoom = null;  // per-frame smoothed zoom for butter-smooth transitions
const ZOOM_DZ_IN  = 0.15;   // dead zone for zooming IN (towards turns) — very responsive
const ZOOM_DZ_OUT = 0.20;   // dead zone for zooming OUT (away from turns) — allows fast zoom-out
const ZOOM_HOLD_MS = 1000;  // after committing a zoom change, hold briefly before allowing another
let _zoomHoldUntil = 0;     // timestamp until which zoom is locked

// ─── Navigation view — 3-tier camera system ─────────────────────────
// Three distinct zoom/pitch tiers per mode:
//   standard: default cruising — the normal state after turns
//   turnZoom: close to a real maneuver step — zoomed in, flat (0°)
//   farZoom:  no real maneuver for a long time (highway) — wider + max tilt
// Transition thresholds (metres):
//   turnStart: start transitioning from standard into turn mode
//   turnFull:  fully commit turn zoom only very near the maneuver point
//   farThreshold: if next real maneuver is farther than this, use farZoom tier
const NAV_VIEW = {
  drive: {
    standard: { zoom: 16.5, pitch: 55 },
    turnZoom: { zoom: 17.8, pitch: 0 },
    farZoom:  { zoom: 15.5, pitch: 65 },
    turnStart: 90,
    turnFull: 22,
    farThreshold: 1200,  // only highways trigger far-zoom
  },
  walk: {
    standard: { zoom: 17.5, pitch: 45 },
    turnZoom: { zoom: 18.5, pitch: 0 },
    farZoom:  { zoom: 16.5, pitch: 55 },
    turnStart: 35,
    turnFull: 10,
    farThreshold: 500,
  },
  cycle: {
    standard: { zoom: 17.0, pitch: 50 },
    turnZoom: { zoom: 18.0, pitch: 0 },
    farZoom:  { zoom: 15.8, pitch: 60 },
    turnStart: 60,
    turnFull: 15,
    farThreshold: 800,
  },
  transit: {
    standard: { zoom: 16.0, pitch: 40 },
    turnZoom: { zoom: 17.5, pitch: 0 },
    farZoom:  { zoom: 15.0, pitch: 50 },
    turnStart: 70,
    turnFull: 18,
    farThreshold: 800,
  },
};

/** Extra zoom boost on small screens (phones) — tighter view overall. */
const MOBILE_ZOOM_BOOST = window.innerWidth <= 768 ? 0.5 : 0;

// ─── rAF interpolation loop ─────────────────────────────────────────
// Smoothly interpolates the GPS puck and camera between discrete GPS fixes
// at 60fps. Eliminates the stepped movement caused by ~1Hz GPS updates.
let _interpRAF = null;         // rAF handle
let _interpPrevFix = null;     // { lng, lat, bearing, time }
let _interpCurrFix = null;     // { lng, lat, bearing, time }
let _interpActive = false;     // true while nav is active and following

/**
 * Returns the MapLibre padding object that hard-anchors the GPS puck in the
 * bottom 15% of the screen (satisfies the ≥80%-from-top hard rule).
 *
 * Using padding — not offset — is critical: padding shifts MapLibre's
 * *effective viewport center* to the GPS puck position so that ALL camera
 * operations (zoom, rotate, bounds-fit, easeTo without explicit offset) treat
 * the GPS puck as the pivot. The puck truly never drifts regardless of zoom
 * gestures or overlapping animations.
 *
 * Math: effectiveCenter_y = vh/2 + padTop/2
 *   Want effectiveCenter at 85% from top: padTop = 0.70 × vh
 *
 * @returns {{top: number, right: number, bottom: number, left: number}}
 */
function _navPadding() {
  const vh = window.innerHeight || 800;
  return { top: Math.round(vh * 0.70), right: 0, bottom: 0, left: 0 };
}

/** Zero-padding constant — restores normal viewport when navigation stops. */
const NAV_PADDING_ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

// Track whether we disabled 3D buildings on nav start so we can restore on stop
let _was3DBeforeNav = false;

// ─── Turn markers on road ────────────────────────────────────────────
// Shows a short highlighted road segment plus a fixed-size arrow marker
// at each maneuver point, along with a floating overlay badge at the next turn.
const NAV_TURNS_SRC   = "nav-turns-src";
const NAV_TURNS_LAYER = "nav-turns-sym";
const TURN_SEGMENT_HALF_M = 2;
const TURN_ARROW_AHEAD_M = 2;
let _turnOverlayMarkers = [];  // MapLibre Markers for ALL upcoming turn badges
let _turnRoadMarkers = [];
let _turnPoints = [];          // [{coord, progressM, step}] — built once, used by overlay
let _snapProgressM = 0;        // latest GPS snap progress along route (metres)
let _turnZoomHoldUntilProgress = -1; // keep turn zoom active until route progress clears the maneuver

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
const overviewBtn = document.getElementById("nav-overview");
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

function _turnExitBufferM(step) {
  const mt = step?.maneuverType || "";
  if (_ROUNDABOUT_TYPES.has(mt)) return navMode === "walk" ? 6 : 12;
  if (navMode === "walk") return 4;
  if (navMode === "cycle") return 6;
  return 8; // drive/transit
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
  _lastRouteProcessTime = 0;

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
  _snapSegIdx = 0;
  _snapSegFraction = 0;
  _snapProgressM = 0;
  _turnPoints = [];
  _turnZoomHoldUntilProgress = -1;
  _headingDeg = 0;
  _prevHeadingPos = null;
  _lastHeadingMoveDist = 0;
  _smoothLng = null;
  _smoothLat = null;
  _smoothBearing = null;
  _smoothZoom = null;
  _smoothPitch = null;
  _renderZoom = null;
  _zoomHoldUntil = 0;
  _stopInterpLoop();
  _following = true;
  _isOverview = false;
  if (recenterBtn) recenterBtn.classList.add("hide");
  if (overviewBtn) overviewBtn.classList.remove("hide");

  // Compute initial heading from the route's opening direction
  if (navRouteCoords.length >= 2) {
    const [ln1, la1] = navRouteCoords[0];
    const [ln2, la2] = navRouteCoords[Math.min(5, navRouteCoords.length - 1)];
    const dL = (ln2 - ln1) * Math.PI / 180;
    const r1 = la1 * Math.PI / 180, r2 = la2 * Math.PI / 180;
    const yy = Math.sin(dL) * Math.cos(r2);
    const xx = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dL);
    _headingDeg = ((Math.atan2(yy, xx) * 180 / Math.PI) + 360) % 360;
  }

  // Hide snackbar, show HUD
  if (snackbar) snackbar.classList.add("hide");
  if (hud) {
    hud.classList.remove("hide");
    hud.classList.add("nav-active");
  }
  if (hudSpeedEl) hudSpeedEl.classList.remove("hide"); // show speedometer immediately
  if (hudSpeedVal) hudSpeedVal.textContent = "0";
  document.body.classList.add("nav-mode");

  // Disable 3D buildings during navigation — extruded geometry obstructs
  // the tilted forward-looking view. Restore on nav stop.
  _was3DBeforeNav = is3DActive;
  if (is3DActive) disable3D();

  _initCoveredRouteLayer();
  _initTurnMarkerLayer();
  renderHUD();

  // Smoothly transition into 3D navigation view
  const firstStep = navSteps[0];
  // Apply nav viewport padding so the GPS puck is anchored to the bottom 15%
  // of the screen for the entire navigation session.
  map.setPadding(_navPadding());
  if (firstStep) {
    map.easeTo({
      center: [firstStep.lng, firstStep.lat],
      bearing: _headingDeg,
      pitch: _computeNavPitch(),
      zoom: _computeNavZoom(),
      duration: 1200,
    });
  }

  // Listen for GPS updates
  window.addEventListener("hf:current-location-updated", _onLocationUpdate);
}

export function resumeNavigation() {
  if (!navPaused || !navSteps.length) return false;
  navPaused = false;
  navActive = true;
  _following = true;
  _isOverview = false;
  if (recenterBtn) recenterBtn.classList.add("hide");
  if (overviewBtn) overviewBtn.classList.remove("hide");

  if (snackbar) snackbar.classList.add("hide");
  if (hud) {
    hud.classList.remove("hide");
    hud.classList.add("nav-active");
  }
  document.body.classList.add("nav-mode");

  renderHUD();

  // Restore 3D navigation view at current step
  const step = navSteps[navStepIdx];
  map.setPadding(_navPadding());
  if (step) {
    map.easeTo({
      center: [step.lng, step.lat],
      bearing: _headingDeg,
      pitch: _computeNavPitch(),
      zoom: _computeNavZoom(),
      duration: 800,
    });
  }

  window.addEventListener("hf:current-location-updated", _onLocationUpdate);
  return true;
}

export function pauseNavigation() {
  if (!navActive) return;
  navActive = false;
  navPaused = true;
  _stopInterpLoop();
  // Hide HUD but keep all state (steps, stepIdx, coords, etc.)
  if (hud) {
    hud.classList.add("hide");
    hud.classList.remove("nav-active");
  }
  if (hudSpeedEl) hudSpeedEl.classList.add("hide");
  if (recenterBtn) recenterBtn.classList.add("hide");
  if (overviewBtn) overviewBtn.classList.add("hide");
  document.body.classList.remove("nav-mode");
  window.removeEventListener("hf:current-location-updated", _onLocationUpdate);
}

export function stopNavigation() {
  navActive = false;
  navPaused = false;
  _lastRouteProcessTime = 0;
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
  _snapSegIdx = 0;
  _snapSegFraction = 0;
  _snapProgressM = 0;
  _turnPoints = [];
  _turnZoomHoldUntilProgress = -1;
  _maxspeeds = [];
  _currentSpeedLimit = 0;
  _headingDeg = 0;
  _prevHeadingPos = null;
  _lastHeadingMoveDist = 0;
  _smoothLng = null;
  _smoothLat = null;
  _smoothBearing = null;
  _smoothZoom = null;
  _smoothPitch = null;
  _renderZoom = null;
  _zoomHoldUntil = 0;
  _stopInterpLoop();
  _following = true;

  // Restore flat north-up 2D view and remove nav viewport padding
  map.easeTo({ bearing: 0, pitch: 0, padding: NAV_PADDING_ZERO, duration: 800 });

  // Re-enable 3D buildings if they were active before navigation
  if (_was3DBeforeNav) {
    _was3DBeforeNav = false;
    setTimeout(() => enable3D(), 900);
  }

  if (hud) {
    hud.classList.add("hide");
    hud.classList.remove("nav-active");
  }
  if (hudSpeedEl) hudSpeedEl.classList.add("hide");
  if (recenterBtn) recenterBtn.classList.add("hide");
  if (overviewBtn) overviewBtn.classList.add("hide");
  document.body.classList.remove("nav-mode");

  _removeCoveredRouteLayer();
  _removeTurnMarkerLayer();
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

  const now = Date.now();
  _updateSpeed(loc.lat, loc.lng, now);
  processPosition(loc.lat, loc.lng, loc.accuracy, now);
  _updateHeading(loc.lat, loc.lng);
  _smartFollow(loc.lng, loc.lat);
}

export function processPosition(lat, lng, accuracy = null, now = Date.now()) {
  if (!navActive || !navRouteCoords.length) return;

  // Throttle route processing — camera follow runs on every location update,
  // but route snapping, step logic, HUD math, and reroute checks stay capped.
  if (now - _lastRouteProcessTime < ROUTE_PROCESS_INTERVAL_MS) return;
  _lastRouteProcessTime = now;

  // Snap to route for off-route detection and progress display
  const snap = snapToRoute(lat, lng);

  // Feed geometry-based zoom with current snap position
  _snapSegIdx = snap.segIdx;
  _snapProgressM = snap.progressM;
  // Distance from segment start to snap point (partial segment already covered)
  const segStart = navRouteCoords[snap.segIdx];
  _snapSegFraction = segStart
    ? _hDistM(segStart[1], segStart[0], snap.lat, snap.lng)
    : 0;

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

  // Keep the turn overlay synced with the user's route progress so it
  // always points at the next white highlight segment ahead.
  _updateTurnOverlay();

  // Lightweight live update — distance countdown + continue/approach instructions
  _updateLiveHUD();

  // Dim already-covered portion of the route
  _updateCoveredRoute(snap);

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

// ─── Turn markers on road ────────────────────────────────────────────

/**
 * Read a CSS custom property from the current theme.
 * @param {string} name - CSS variable name
 * @returns {string}
 */
function _cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Compute bearing from one route coordinate to another.
 * @param {[number, number]} fromCoord - [lng, lat]
 * @param {[number, number]} toCoord - [lng, lat]
 * @returns {number} bearing in degrees
 */
function _bearingBetweenCoords(fromCoord, toCoord) {
  if (!fromCoord || !toCoord) return 0;
  const [ln0, la0] = fromCoord;
  const [ln1, la1] = toCoord;
  const dL = (ln1 - ln0) * Math.PI / 180;
  const r0 = la0 * Math.PI / 180, r1 = la1 * Math.PI / 180;
  const y = Math.sin(dL) * Math.cos(r1);
  const x = Math.cos(r0) * Math.sin(r1) - Math.sin(r0) * Math.cos(r1) * Math.cos(dL);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/**
 * Interpolate a point at a fixed distance (meters) along the route from a given coord index.
 * Negative distance = backward, positive = forward.
 * @param {number} ci - starting coord index
 * @param {number} distM - distance in meters (negative for backward)
 * @returns {[number, number]} [lng, lat]
 */
function _interpolateAlongRoute(ci, distM) {
  const dir = distM >= 0 ? 1 : -1;
  let remaining = Math.abs(distM);
  let idx = ci;

  while (remaining > 0) {
    const next = idx + dir;
    if (next < 0 || next >= navRouteCoords.length) break;
    const [ln0, la0] = navRouteCoords[idx];
    const [ln1, la1] = navRouteCoords[next];
    const segLen = _hDistM(la0, ln0, la1, ln1);
    if (segLen >= remaining) {
      // Interpolate within this segment
      const t = remaining / segLen;
      return [ln0 + (ln1 - ln0) * t, la0 + (la1 - la0) * t];
    }
    remaining -= segLen;
    idx = next;
  }
  // Ran out of route, return the endpoint we reached
  return navRouteCoords[Math.max(0, Math.min(navRouteCoords.length - 1, idx))];
}

/**
 * Remove all fixed-size road arrow markers.
 */
function _clearTurnRoadMarkers() {
  _turnRoadMarkers.forEach((marker) => marker.remove());
  _turnRoadMarkers = [];
}


/**
 * Initialize the turn-highlight line layer and floating overlay marker.
 * Draws short route segments in a contrasting color at each turn/junction.
 */
async function _initTurnMarkerLayer() {
  if (map.getSource(NAV_TURNS_SRC)) return;

  // ── Highlighted road segments at each junction/turn point ────────
  // Exactly 2m before and 2m after the turn point (4m total).
  // Also build _turnPoints[] so the overlay can reuse the exact same coords.
  const features = [];
  _turnPoints = [];
  for (const step of navSteps) {
    if (step.isDepart || step.isArrive) continue;
    if (step.type !== "direct") continue;
    const mType = step.maneuverType || "";
    const mMod = step.maneuverMod || "";
    if (!mType && !mMod) continue;

    const ci = step.coordIdx || 0;
    const turnPt = navRouteCoords[ci];
    if (!turnPt) continue;
    const before = _interpolateAlongRoute(ci, -TURN_SEGMENT_HALF_M);
    const after = _interpolateAlongRoute(ci, TURN_SEGMENT_HALF_M);

    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [before, turnPt, after] },
      properties: {},
    });

    // Store the exact highlight coordinate + route progress for overlay use
    _turnPoints.push({
      coord: turnPt,
      progressM: navRouteProgress[ci] || 0,
      step,
    });
  }

  map.addSource(NAV_TURNS_SRC, {
    type: "geojson",
    data: { type: "FeatureCollection", features },
  });
  map.addLayer({
    id: NAV_TURNS_LAYER,
    type: "line",
    source: NAV_TURNS_SRC,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": navMode === "walk" ? 5 : 6,
      "line-opacity": 1,
    },
  });

  // Floating overlay label at next upcoming turn (offset to the side)
  _updateTurnOverlay();
}

/**
 * Update the floating turn overlays to show ALL upcoming maneuvers.
 * Uses the pre-built _turnPoints array (same coordinates as the white
 * highlight segments) and the user's route progress to pick turns
 * AHEAD of the current GPS position. Removes markers for passed turns.
 */
function _updateTurnOverlay() {
  // Collect all turn points still ahead of the user
  const upcoming = _turnPoints.filter(tp => tp.progressM > _snapProgressM);

  // Remove markers for turns we've passed (markers beyond `upcoming` count)
  while (_turnOverlayMarkers.length > upcoming.length) {
    const marker = _turnOverlayMarkers.pop();
    marker.remove();
  }

  // Create or update markers for each upcoming turn
  for (let i = 0; i < upcoming.length; i++) {
    const tp = upcoming[i];
    const { step } = tp;
    const iconHtml = step.iconHtml || maneuverIconSvg(step.maneuverType, step.maneuverMod);
    const [turnLng, turnLat] = tp.coord;

    if (i < _turnOverlayMarkers.length) {
      // Update existing marker
      const marker = _turnOverlayMarkers[i];
      const badge = marker.getElement().querySelector(".nav-turn-overlay");
      if (badge) badge.innerHTML = iconHtml;
      marker.setLngLat([turnLng, turnLat]);
    } else {
      // Create new marker
      const wrap = document.createElement("div");
      wrap.className = "nav-turn-overlay-wrap";
      wrap.innerHTML = `<div class="nav-turn-overlay">${iconHtml}</div><div class="nav-turn-ptr"></div>`;
      const marker = new maplibregl.Marker({ element: wrap, anchor: "right" })
        .setLngLat([turnLng, turnLat])
        .addTo(map);
      _turnOverlayMarkers.push(marker);
    }
  }
}

/**
 * Remove turn marker layer and overlay from the map.
 */
function _removeTurnMarkerLayer() {
  _clearTurnRoadMarkers();
  if (map.getLayer(NAV_TURNS_LAYER)) map.removeLayer(NAV_TURNS_LAYER);
  if (map.getSource(NAV_TURNS_SRC))  map.removeSource(NAV_TURNS_SRC);
  _turnOverlayMarkers.forEach(m => m.remove());
  _turnOverlayMarkers = [];
  _turnPoints = [];
}

// ─── Smooth follow mode ─────────────────────────────────────────────

/**
 * 3-tier zoom system: standard / turn / far.
 * Determines which tier the camera should be in based on distance to the next
 * turn, then smooths transitions via dead zones and hold timers.
 * @returns {number} zoom level
 */
function _computeNavZoom() {
  const view = NAV_VIEW[navMode] || NAV_VIEW.drive;
  const { standard, turnZoom, farZoom, turnStart, turnFull, farThreshold } = view;

  if (_turnZoomHoldUntilProgress >= 0) {
    if (_snapProgressM < _turnZoomHoldUntilProgress) {
      return turnZoom.zoom + MOBILE_ZOOM_BOOST;
    }
    _turnZoomHoldUntilProgress = -1;
  }

  // Only zoom in for actual navigation step maneuvers (the ones with overlays),
  // NOT for every geometry-detected bearing change on the road.
  const stepDist = _distToNextAttentionStep();
  const triggerDist = stepDist; // only step-based triggers

  // Also compute uncapped distance to next step (for far-tier detection)
  const uncappedStepDist = _distToNextAttentionStepUncapped();

  // Roundabout override — treat like turn but slightly less zoomed
  const rbAhead = _roundaboutAheadDist();
  const rbLeadM = Math.max(40, Math.min(140, _speedKmh * 1.4));
  const isRoundabout = rbAhead > 0 && rbAhead < rbLeadM;

  let zoom;

  if (isRoundabout) {
    // Roundabout: zoom in but slightly less than a sharp turn (show full circle)
    zoom = turnZoom.zoom - 0.5 + MOBILE_ZOOM_BOOST;
    _smoothZoom = zoom;
    _zoomHoldUntil = Date.now() + ZOOM_HOLD_MS;
    return _smoothZoom;
  }

  if (triggerDist > 0 && triggerDist <= turnStart) {
    // ─── TURN TIER: only near a real maneuver step ───
    if (triggerDist <= turnFull) {
      // Very close to the maneuver — commit full turn zoom.
      zoom = turnZoom.zoom + MOBILE_ZOOM_BOOST;
      _smoothZoom = zoom;
      _zoomHoldUntil = Date.now() + ZOOM_HOLD_MS;
      return _smoothZoom;
    }
    // Between turnStart and turnFull, transition from standard into turn zoom.
    const t = 1 - (triggerDist - turnFull) / Math.max(1, turnStart - turnFull);
    zoom = standard.zoom + (turnZoom.zoom - standard.zoom) * t * t + MOBILE_ZOOM_BOOST;
  } else if (uncappedStepDist > farThreshold) {
    // ─── FAR TIER: next maneuver step confirmed far away (highway) ───
    zoom = farZoom.zoom;
  } else {
    // ─── STANDARD TIER: default cruising view ───
    zoom = standard.zoom + MOBILE_ZOOM_BOOST;
  }

  // Asymmetric dead zone + hold timer — prevents oscillation
  const now = Date.now();
  if (_smoothZoom === null) {
    _smoothZoom = zoom;
    _zoomHoldUntil = now + ZOOM_HOLD_MS;
  } else if (now >= _zoomHoldUntil) {
    const delta = zoom - _smoothZoom;
    const dz = delta > 0 ? ZOOM_DZ_IN : ZOOM_DZ_OUT;
    if (Math.abs(delta) > dz) {
      _smoothZoom = zoom;
      _zoomHoldUntil = now + ZOOM_HOLD_MS;
    }
  }
  return _smoothZoom;
}

/**
 * 3-tier pitch system matching the zoom tiers.
 * Turn tier: flat (0°) for maneuver clarity.
 * Far tier: high tilt for maximum forward road visibility.
 * Standard tier: moderate tilt.
 * Smooth per-frame transitions prevent jarring camera jumps.
 * @returns {number} pitch in degrees
 */
function _computeNavPitch() {
  const view = NAV_VIEW[navMode] || NAV_VIEW.drive;
  const { standard, turnZoom, farZoom, turnStart, turnFull, farThreshold } = view;
  let releasedTurnHold = false;

  if (_turnZoomHoldUntilProgress >= 0) {
    if (_snapProgressM < _turnZoomHoldUntilProgress) {
      _smoothPitch = turnZoom.pitch;
      return turnZoom.pitch;
    }
    _turnZoomHoldUntilProgress = -1;
    releasedTurnHold = true;
  }

  // Only flatten for actual navigation step maneuvers (with overlays),
  // not every geometry-detected bend in the road.
  const stepDist = _distToNextAttentionStep();
  const triggerDist = stepDist;
  const uncappedStepDist = _distToNextAttentionStepUncapped();

  // Roundabout override — force flat immediately
  const rbAhead = _roundaboutAheadDist();
  const rbLeadM = Math.max(40, Math.min(120, _speedKmh * 1.2));
  if (rbAhead > 0 && rbAhead < rbLeadM) {
    _smoothPitch = 0;
    return 0;
  }

  let targetPitch;

  if (triggerDist > 0 && triggerDist <= turnStart) {
    // ─── TURN TIER: flatten only near a real maneuver step ───
    if (triggerDist <= turnFull) {
      targetPitch = turnZoom.pitch; // 0°
    } else {
      // Transition from standard pitch toward flat as the maneuver approaches.
      const t = (triggerDist - turnFull) / Math.max(1, turnStart - turnFull);
      targetPitch = turnZoom.pitch + (standard.pitch - turnZoom.pitch) * t;
    }
  } else if (uncappedStepDist > farThreshold) {
    // ─── FAR TIER: next maneuver confirmed far away (highway) ───
    targetPitch = farZoom.pitch;
  } else {
    // ─── STANDARD TIER: default cruising tilt ───
    targetPitch = standard.pitch;
  }

  if (releasedTurnHold) {
    // Reintroduce visible tilt immediately when leaving full turn zoom,
    // then continue smoothing toward the current tier's target pitch.
    const minTilt = Math.min(targetPitch, Math.max(12, targetPitch * 0.5));
    _smoothPitch = Math.max(minTilt, _smoothPitch || 0);
  }

  // Smooth per-frame transition (60fps via rAF)
  // Flattening (toward 0): fast (~0.6s). Restoring tilt: deliberate (~1.5s).
  if (_smoothPitch === null) {
    _smoothPitch = targetPitch;
  } else {
    const alpha = targetPitch < _smoothPitch ? 0.06 : (releasedTurnHold ? 0.12 : 0.025);
    _smoothPitch += (targetPitch - _smoothPitch) * alpha;
    if (_smoothPitch < 2) _smoothPitch = 0;
    if (Math.abs(_smoothPitch - targetPitch) < 1.5) _smoothPitch = targetPitch;
  }

  return _smoothPitch;
}

/**
 * Speed-dynamic follow easing: longer at low speed (smooth glide), shorter
 * at high speed (responsive). MapLibre interpolates zoom continuously over
 * this duration — no discrete EMA steps.
 * @returns {number} milliseconds
 */
function _followDurationMs() {
  const speedCap = navMode === "walk" ? 8 : navMode === "cycle" ? 35 : 120;
  const t = Math.min(1, _speedKmh / speedCap);
  return Math.round(FOLLOW_DURATION_BASE_MS - (FOLLOW_DURATION_BASE_MS - FOLLOW_DURATION_MIN_MS) * t);
}

/** Lookahead distance for turn detection, scales with speed. */
function _turnLookaheadM() {
  return Math.max(100, Math.min(400, _speedKmh * 4));
}

/**
 * Walk through route coordinates ahead of the current snapped position
 * and return the distance (metres) to the first significant bearing change.
 * A "turn" is a cumulative bearing deviation >= 55 deg over consecutive segments.
 * Returns 0 if no turn found within the lookahead window.
 */
function _distToNextTurnOnRoute() {
  if (!navRouteCoords.length || _snapSegIdx < 0) return 0;

  const lookahead = _turnLookaheadM();
  const startIdx = Math.max(0, _snapSegIdx);
  let distAcc = _snapSegFraction;
  let prevBearing = -1;
  let cumDeviation = 0;

  for (let i = startIdx; i < navRouteCoords.length - 1; i++) {
    const [ax, ay] = navRouteCoords[i];
    const [bx, by] = navRouteCoords[i + 1];
    const segLen = _hDistM(ay, ax, by, bx);
    const bearing = _bearing(ay, ax, by, bx);

    if (prevBearing >= 0) {
      let delta = Math.abs(bearing - prevBearing);
      if (delta > 180) delta = 360 - delta;
      cumDeviation += delta;
      if (cumDeviation >= 55) return distAcc;
    }

    distAcc += segLen;
    if (distAcc > lookahead) break;
    prevBearing = bearing;
  }
  return 0;
}

// ─── High-attention maneuver types ──────────────────────────────────
// These require the driver to focus (lane positioning, merging, exiting)
// even when the geometry doesn't show a sharp bearing change.
const _ATTENTION_MANEUVERS = new Set([
  // Actual turns at intersections / end of road
  "turn", "end of road",
  // Forks, merges, ramps (require attention)
  "use lane", "merge", "fork", "on ramp", "off ramp",
  // Roundabouts
  "roundabout", "rotary", "exit roundabout", "exit rotary", "roundabout turn",
]);

// Maneuver types that are NOT real turns — road continuations/name changes.
// These get overlays but should NOT trigger zoom-in.
// "continue", "new name", "depart", "arrive", "notification"

// Roundabout-family maneuver types — entry + exit are a cluster that should
// keep zoom locked through the entire roundabout, not zoom out between them.
const _ROUNDABOUT_TYPES = new Set([
  "roundabout", "rotary", "exit roundabout", "exit rotary", "roundabout turn",
]);

/**
 * Return the distance (metres) to the next roundabout-family step ahead,
 * or 0 if none within a reasonable range. Used by _computeNavZoom to
 * force max zoom before roundabout entry.
 * @returns {number}
 */
function _roundaboutAheadDist() {
  if (!navSteps.length || navStepIdx < 0) return 0;
  let distAcc = _liveDistToNextM;
  for (let i = navStepIdx; i < navSteps.length && i <= navStepIdx + 5; i++) {
    const step = navSteps[i];
    const mt = step.maneuverType || "";
    if (_ROUNDABOUT_TYPES.has(mt)) return distAcc || 1;
    distAcc += step.distance || 0;
    if (distAcc > 500) break; // don't look beyond 500m
  }
  return 0;
}

/**
 * Scan upcoming nav steps for high-attention maneuvers within the lookahead.
 * Returns the distance (metres) to the closest one, or 0 if none found.
 * For roundabouts: if we're currently inside a roundabout cluster (current
 * or recent step is roundabout-family), keep returning a very short distance
 * to maintain zoom lock through the entire sequence.
 * @returns {number}
 */
function _distToNextAttentionStep() {
  if (!navSteps.length || navStepIdx < 0) return 0;
  const lookahead = _turnLookaheadM();

  // Check if we're currently inside a roundabout cluster:
  // current step or previous step is a roundabout type, AND a future
  // roundabout step is still ahead → keep zoom locked.
  const curMt = navSteps[navStepIdx]?.maneuverType || "";
  const prevMt = navStepIdx > 0 ? (navSteps[navStepIdx - 1]?.maneuverType || "") : "";
  if (_ROUNDABOUT_TYPES.has(curMt) || _ROUNDABOUT_TYPES.has(prevMt)) {
    // Check if any roundabout step is still ahead within a short range
    for (let i = navStepIdx; i < navSteps.length && i <= navStepIdx + 3; i++) {
      const mt = navSteps[i]?.maneuverType || "";
      if (_ROUNDABOUT_TYPES.has(mt)) return 1; // stay zoomed in
    }
  }

  let distAcc = _liveDistToNextM; // distance to the current upcoming maneuver
  for (let i = navStepIdx; i < navSteps.length; i++) {
    const step = navSteps[i];
    const mt = step.maneuverType || "";

    if (distAcc > lookahead) break;

    if (_ATTENTION_MANEUVERS.has(mt)) return distAcc || 1;

    // Add this step's segment length to reach the maneuver after it.
    distAcc += step.distance || 0;
  }
  return 0;
}

/**
 * Like _distToNextAttentionStep but without lookahead cap.
 * Returns the actual distance to the next attention maneuver step,
 * or 0 if none remain in the route.
 * @returns {number} distance in metres, or 0
 */
function _distToNextAttentionStepUncapped() {
  if (!navSteps.length || navStepIdx < 0) return 0;
  let distAcc = _liveDistToNextM;
  for (let i = navStepIdx; i < navSteps.length; i++) {
    const step = navSteps[i];
    const mt = step.maneuverType || "";
    if (_ATTENTION_MANEUVERS.has(mt)) return distAcc || 1;
    distAcc += step.distance || 0;
  }
  return 0;
}

/**
 * Return the closer of two trigger distances, ignoring zeroes (= no trigger).
 * @param {number} a - First distance (0 = inactive)
 * @param {number} b - Second distance (0 = inactive)
 * @param {number} cap - Maximum lookahead
 * @returns {number} Closest trigger distance, or 0 if neither active
 */
function _closerTrigger(a, b, cap) {
  const va = (a > 0 && a < cap) ? a : Infinity;
  const vb = (b > 0 && b < cap) ? b : Infinity;
  const best = Math.min(va, vb);
  return best === Infinity ? 0 : best;
}

/** Forward azimuth in degrees [0,360) between two lat/lng points. */
function _bearing(lat1, lng1, lat2, lng2) {
  const dL = (lng2 - lng1) * Math.PI / 180;
  const r1 = lat1 * Math.PI / 180, r2 = lat2 * Math.PI / 180;
  const y = Math.sin(dL) * Math.cos(r2);
  const x = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dL);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

// Snap state updated every GPS tick for geometry-based zoom
let _snapSegIdx = 0;
let _snapSegFraction = 0;

function _isRecenterVisible() {
  return !!recenterBtn && !recenterBtn.classList.contains("hide");
}

function _smartFollow(lng, lat) {
  // While fingers are on the map, suppress auto-centering so touch gestures
  // are not fought by in-flight easeTo animations (fixes mobile jank).
  if (!_following || _touchCount > 0 || _isRecenterVisible()) {
    if (!_following && recenterBtn) recenterBtn.classList.remove("hide");
    return;
  }

  // Only rotate the map when actually moving — prevents rotation while
  // standing still even if device orientation or GPS jitter changes bearing.
  // The map heading stays fixed until the user physically moves.
  const rawBearing = _speedKmh > 3 ? _headingDeg : (_smoothBearing ?? map.getBearing());

  // ── EMA smoothing — absorb GPS micro-jitter ──────────────────────
  if (_smoothLng === null) {
    // First fix after nav start / recenter — seed, don't interpolate
    _smoothLng = lng;
    _smoothLat = lat;
    _smoothBearing = rawBearing;
  } else {
    const a = FOLLOW_SMOOTH_ALPHA;
    _smoothLng += (lng - _smoothLng) * a;
    _smoothLat += (lat - _smoothLat) * a;
    // Bearing: shortest-arc EMA
    let bDelta = rawBearing - _smoothBearing;
    if (bDelta > 180) bDelta -= 360;
    if (bDelta < -180) bDelta += 360;
    _smoothBearing = ((_smoothBearing + bDelta * a) + 360) % 360;
  }

  // Feed the rAF interpolation loop with the new target
  const now = performance.now();
  _interpPrevFix = _interpCurrFix || { lng: _smoothLng, lat: _smoothLat, bearing: _smoothBearing, time: now };
  _interpCurrFix = { lng: _smoothLng, lat: _smoothLat, bearing: _smoothBearing, time: now };

  // Start the interpolation loop if not already running
  if (!_interpActive) {
    _interpActive = true;
    _interpRAF = requestAnimationFrame(_interpFrame);
  }
}

/**
 * requestAnimationFrame loop for smooth 60fps camera movement.
 * Interpolates (and slightly extrapolates) between GPS fixes so the
 * map glides continuously instead of stepping every ~1s.
 * Uses jumpTo for instant, jitter-free updates each frame.
 */
function _interpFrame(timestamp) {
  if (!_interpActive || !_following) {
    _interpActive = false;
    return;
  }

  // Pause interpolation while fingers are on map — don't fight touch gestures.
  // Continue scheduling frames so we resume immediately on touch end.
  if (_touchCount > 0) {
    _interpRAF = requestAnimationFrame(_interpFrame);
    return;
  }

  if (!_interpCurrFix) {
    _interpRAF = requestAnimationFrame(_interpFrame);
    return;
  }

  const prev = _interpPrevFix || _interpCurrFix;
  const curr = _interpCurrFix;
  const dt = curr.time - prev.time;

  let lng, lat, bearing;

  if (dt > 50 && dt < 5000) {
    // Interpolate/extrapolate based on elapsed time since last fix
    const elapsed = timestamp - curr.time;
    // Clamp extrapolation to max 1.2× the fix interval (don't overshoot)
    const t = Math.min(1.2, elapsed / dt);

    lng = curr.lng + (curr.lng - prev.lng) * Math.max(0, t - 1) * 0.5;
    lat = curr.lat + (curr.lat - prev.lat) * Math.max(0, t - 1) * 0.5;

    // Bearing: shortest-arc extrapolation
    let bDelta = curr.bearing - prev.bearing;
    if (bDelta > 180) bDelta -= 360;
    if (bDelta < -180) bDelta += 360;
    bearing = ((curr.bearing + bDelta * Math.max(0, t - 1) * 0.5) + 360) % 360;
  } else {
    lng = curr.lng;
    lat = curr.lat;
    bearing = curr.bearing;
  }

  // Compute dynamic pitch (internally smoothed per-frame)
  const pitch = _computeNavPitch();

  // Per-frame zoom smoothing — aggressive zoom-out, fast zoom-in
  const zoomTarget = _computeNavZoom();
  if (_renderZoom === null) {
    _renderZoom = zoomTarget;
  } else {
    const zDelta = zoomTarget - _renderZoom;
    let zAlpha;
    if (zDelta > 0) {
      // Zooming IN toward turns: fast (α=0.12)
      zAlpha = 0.12;
    } else {
      // Zooming OUT after turns: very aggressive.
      // |delta| 1 level → α=0.07, |delta| 3+ levels → α=0.14 (cap)
      zAlpha = Math.min(0.14, 0.04 + Math.abs(zDelta) * 0.035);
    }
    _renderZoom += zDelta * zAlpha;
    // Snap when close enough to avoid infinite crawl
    if (Math.abs(zoomTarget - _renderZoom) < 0.03) _renderZoom = zoomTarget;
  }

  map.jumpTo({
    center: [lng, lat],
    bearing,
    pitch,
    zoom: _renderZoom,
  });

  _interpRAF = requestAnimationFrame(_interpFrame);
}

/**
 * Stop the rAF interpolation loop (on nav stop, pause, or user drag).
 */
function _stopInterpLoop() {
  _interpActive = false;
  if (_interpRAF) {
    cancelAnimationFrame(_interpRAF);
    _interpRAF = null;
  }
  _interpPrevFix = null;
  _interpCurrFix = null;
}

function _stopFollowing() {
  if (!navActive || !_following) return;
  map.stop();
  _stopInterpLoop();
  _following = false;
  _isOverview = false;
  if (recenterBtn) recenterBtn.classList.remove("hide");
  if (overviewBtn) overviewBtn.classList.add("hide");
  // Restore 3D buildings when user takes manual control (not following)
  if (_was3DBeforeNav && !is3DActive) enable3D();
}

function _onUserInteraction(e) {
  if (!navActive) return;
  if (!e.originalEvent) return; // programmatic easeTo/flyTo — ignore
  _stopFollowing();
}

function _onTouchStart(e) {
  _touchCount = e.touches.length;
  if (e.touches.length !== 1) {
    _touchPanStart = null;
    _touchPanMoved = false;
    return;
  }

  const touch = e.touches[0];
  _touchPanStart = { x: touch.clientX, y: touch.clientY };
  _touchPanMoved = false;
  // Don't call map.stop() here — it kills MapLibre's drag initialization
  // when an easeTo is in-flight, causing the first drag to be swallowed.
  // _touchCount > 0 prevents _smartFollow from scheduling new animations;
  // any in-flight one finishes naturally within 300ms (imperceptible).
}

function _onTouchMove(e) {
  _touchCount = e.touches.length;
  if (!navActive || !_following || _touchPanMoved) return;
  if (!_touchPanStart || e.touches.length !== 1) return;

  const touch = e.touches[0];
  if (
    Math.abs(touch.clientX - _touchPanStart.x) < TOUCH_DRAG_BREAK_PX &&
    Math.abs(touch.clientY - _touchPanStart.y) < TOUCH_DRAG_BREAK_PX
  ) {
    return;
  }

  _touchPanMoved = true;
  // Don't call _stopFollowing() here — its map.stop() would kill the drag
  // that MapLibre is already processing (causes the "stuck first drag").
  // The nav animation was already killed by touchstart; just flip state.
  _following = false;
  if (recenterBtn) recenterBtn.classList.remove("hide");
  if (_was3DBeforeNav && !is3DActive) enable3D();
}

function _onTouchEnd(e) {
  _touchCount = e.touches.length;
  if (e.touches.length === 0) {
    _touchPanStart = null;
    _touchPanMoved = false;
  }
}

function _onTouchCancel() {
  _touchCount = 0;
  _touchPanStart = null;
  _touchPanMoved = false;
}

function _recenter() {
  _following = true;
  _isOverview = false;
  if (recenterBtn) recenterBtn.classList.add("hide");
  if (overviewBtn) overviewBtn.classList.remove("hide");
  // Disable 3D buildings when re-entering follow mode (obstructs tilted view)
  if (is3DActive) disable3D();

  // Reset EMA so follow starts fresh from the real GPS position
  const loc = getCurrentLocationState();
  if (loc.active && loc.lat !== null) {
    _smoothLng = loc.lng;
    _smoothLat = loc.lat;
    _smoothBearing = _headingDeg;
    _smoothZoom = null;
    _smoothPitch = null;
    _renderZoom = null;
    _zoomHoldUntil = 0;

    // Re-assert nav padding in case it was cleared by a map interaction
    map.setPadding(_navPadding());
    map.easeTo({
      center: [loc.lng, loc.lat],
      bearing: _headingDeg,
      pitch: _computeNavPitch(),
      zoom: _computeNavZoom(),
      duration: 600,
    });

    // Seed the interpolation loop for smooth follow after recenter
    const now = performance.now();
    _interpPrevFix = { lng: loc.lng, lat: loc.lat, bearing: _headingDeg, time: now };
    _interpCurrFix = _interpPrevFix;
    if (!_interpActive) {
      _interpActive = true;
      _interpRAF = requestAnimationFrame(_interpFrame);
    }
  }
}

/** Enter route overview: zoom out to show the full route, pause follow. */
function _enterOverview() {
  if (!navActive || !navRouteCoords.length) return;
  _stopInterpLoop();
  _following = false;
  _isOverview = true;
  if (recenterBtn) recenterBtn.classList.remove("hide");
  if (overviewBtn) overviewBtn.classList.add("hide");

  // Compute bounding box of the route
  const bounds = new maplibregl.LngLatBounds();
  for (const coord of navRouteCoords) {
    bounds.extend(coord);
  }
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  map.fitBounds(bounds, { padding: 60, pitch: 0, bearing: 0, duration: 800 });
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
const HEADING_MIN_DIST_M = 3;       // ignore micro-movements for GPS fallback heading
const HEADING_LOOKAHEAD_M = 60;     // metres ahead on route polyline for heading (reduced near turns)
const HEADING_SMOOTH_FACTOR = 0.25; // blend factor per tick (lower = smoother)
let _prevHeadingPos = null;         // { lat, lng }
let _lastHeadingMoveDist = 0;       // accumulated movement since last heading update

/**
 * Compute forward bearing by looking ahead on the route polyline from the
 * current snap position. Immune to GPS jitter because it follows road
 * geometry rather than noisy GPS-to-GPS deltas.
 * @param {number} segIdx - current snap segment index
 * @param {number} segFracM - metres into the current segment
 * @param {number} lookaheadM - how far ahead to look on the polyline
 * @returns {number} bearing in degrees [0,360), or -1 if insufficient data
 */
function _routeBearingAtSnap(segIdx, segFracM, lookaheadM) {
  if (!navRouteCoords.length || segIdx < 0) return -1;
  const seg0 = navRouteCoords[segIdx];
  const seg1 = navRouteCoords[segIdx + 1];
  if (!seg0 || !seg1) return -1;

  const segLen = _hDistM(seg0[1], seg0[0], seg1[1], seg1[0]);
  const fracM = Math.min(segFracM, segLen);
  const t = segLen > 0 ? fracM / segLen : 0;
  const startLng = seg0[0] + (seg1[0] - seg0[0]) * t;
  const startLat = seg0[1] + (seg1[1] - seg0[1]) * t;

  // Walk forward along the polyline by lookaheadM metres
  let remaining = lookaheadM - (segLen - fracM);
  let endLng = seg1[0], endLat = seg1[1];

  for (let i = segIdx + 1; i < navRouteCoords.length - 1; i++) {
    if (remaining <= 0) break;
    const [ax, ay] = navRouteCoords[i];
    const [bx, by] = navRouteCoords[i + 1];
    const d = _hDistM(ay, ax, by, bx);
    if (d >= remaining) {
      const frac = remaining / d;
      endLng = ax + (bx - ax) * frac;
      endLat = ay + (by - ay) * frac;
      remaining = 0;
    } else {
      remaining -= d;
      endLng = bx;
      endLat = by;
    }
  }

  const dist = _hDistM(startLat, startLng, endLat, endLng);
  if (dist < 2) return -1;
  return _bearing(startLat, startLng, endLat, endLng);
}

/**
 * Shortest-arc blend from current heading toward a target bearing.
 * @param {number} target - target bearing in degrees
 */
function _blendHeading(target) {
  let delta = target - _headingDeg;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  _headingDeg = ((_headingDeg + delta * HEADING_SMOOTH_FACTOR) + 360) % 360;
}

/**
 * Compute travel heading. Primary source is route-geometry bearing
 * (immune to GPS jitter). Falls back to GPS-to-GPS bearing only when
 * off-route or route data is insufficient.
 *
 * KEY RULES:
 * - Only update heading when actually moving (prevents rotation while stationary)
 * - Near turns, reduce lookahead so the map stays aligned with the CURRENT
 *   road segment and doesn't pre-rotate toward the upcoming road (which would
 *   push the turn point off-screen on L-shaped roads)
 * @param {number} lat
 * @param {number} lng
 */
function _updateHeading(lat, lng) {
  // Gate: only update heading when there's actual movement.
  // This prevents the map from rotating when stationary (even if GPS jitters).
  if (_prevHeadingPos) {
    const moveDist = _hDistM(_prevHeadingPos.lat, _prevHeadingPos.lng, lat, lng);
    _lastHeadingMoveDist += moveDist;
    // Need at least 3m of real movement before updating heading
    if (_lastHeadingMoveDist < HEADING_MIN_DIST_M) {
      _prevHeadingPos = { lat, lng };
      return;
    }
    _lastHeadingMoveDist = 0;
  }

  // Adaptive lookahead: reduce when close to a turn so we stay aligned
  // with the CURRENT road rather than pre-rotating toward the next road.
  // On an L-shaped road, 60m lookahead would see the 90° turn and rotate
  // early, pushing the turn point off-screen.
  let effectiveLookahead = HEADING_LOOKAHEAD_M;
  const turnDist = _distToNextTurnOnRoute();
  if (turnDist > 0 && turnDist < HEADING_LOOKAHEAD_M) {
    // When close to a turn, only look as far as the turn itself (minus a buffer)
    // so bearing stays on the current road segment
    effectiveLookahead = Math.max(10, turnDist * 0.5);
  }

  // Primary: route-geometry bearing (follows the road, not GPS noise)
  const routeBearing = _routeBearingAtSnap(_snapSegIdx, _snapSegFraction, effectiveLookahead);
  if (routeBearing >= 0) {
    _blendHeading(routeBearing);
    _prevHeadingPos = { lat, lng };
    return;
  }

  // Fallback: GPS-to-GPS bearing (only when off-route or near route end)
  if (!_prevHeadingPos) {
    _prevHeadingPos = { lat, lng };
    return;
  }
  const dist = _hDistM(_prevHeadingPos.lat, _prevHeadingPos.lng, lat, lng);
  if (dist < HEADING_MIN_DIST_M) return;

  const gpsBearing = _bearing(_prevHeadingPos.lat, _prevHeadingPos.lng, lat, lng);
  _blendHeading(gpsBearing);
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
  const firedStep = navSteps[navStepIdx];
  _lastTriggerPos = { lat, lng };
  // Reset approach tracking — the fired step (or any in-flight approach) is consumed
  _approachIdx = -1;
  _approachMinDist = Infinity;

  if (firedStep && _ATTENTION_MANEUVERS.has(firedStep.maneuverType || "") && Number.isFinite(firedStep.routeProgressM)) {
    _turnZoomHoldUntilProgress = firedStep.routeProgressM + _turnExitBufferM(firedStep);
  } else {
    _turnZoomHoldUntilProgress = -1;
  }

  // Release the zoom hold so _computeNavZoom can immediately recalculate
  // based on the distance to the NEXT turn. Without this, the hold timer
  // keeps zoom locked at max long after the turn is passed.
  _zoomHoldUntil = 0;
  _smoothZoom = null;

  // Force-commit standard zoom immediately after a turn UNLESS the next
  // step maneuver is within 20m (back-to-back maneuvers). This ensures the
  // map always zooms out to the cruising view right after passing a turn.
  const nextTurnDist = _distToNextAttentionStepUncapped();
  if (nextTurnDist === 0 || nextTurnDist > 20) {
    const view = NAV_VIEW[navMode] || NAV_VIEW.drive;
    _smoothZoom = view.standard.zoom + MOBILE_ZOOM_BOOST;
  }
  // Keep _renderZoom at current value — per-frame smoothing animates
  // the zoom-out aggressively from the current level.

  // Update the floating turn overlay to point at the next upcoming maneuver
  _updateTurnOverlay();

  // If we just landed on a transit-board step, activate the hold so we
  // don't immediately cascade through intermediate stops while waiting.
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
      const view = NAV_VIEW[navMode] || NAV_VIEW.drive;
      map.easeTo({
        center: [step.lng, step.lat],
        pitch: view.standard.pitch,
        zoom: Math.max(map.getZoom(), 16),
        duration: 600,
      });
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
if (overviewBtn) {
  overviewBtn.addEventListener("click", _enterOverview);
}

// Only drag (pan) breaks follow mode. Zoom, rotate, pitch, and wheel are
// allowed while following — the next GPS tick restores the nav camera.
map.on("dragstart", _onUserInteraction);

// On mobile, immediately stop in-flight animations when the user touches the
// map. Prevents easeTo from fighting touch gestures (jank/stuttering).
// While fingers are on the screen, _smartFollow skips its easeTo so the user
// has full control. Desktop (mouse) is unaffected -- no touch events fire.
const _mapCanvas = map.getCanvas();
_mapCanvas.addEventListener("touchstart", _onTouchStart, { passive: true });
_mapCanvas.addEventListener("touchmove", _onTouchMove, { passive: true });
_mapCanvas.addEventListener("touchend", _onTouchEnd, { passive: true });
_mapCanvas.addEventListener("touchcancel", _onTouchCancel, { passive: true });

// Register hooks with directions.js to avoid circular imports
setNavHooks({
  startNav: startNavigation,
  stop: stopNavigation,
  pause: pauseNavigation,
  resume: resumeNavigation,
  isActive: isNavActive,
  isPaused: isNavPaused,
});
