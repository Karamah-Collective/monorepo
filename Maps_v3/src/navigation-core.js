const EARTH_RADIUS_M = 6371000;
const RAD = Math.PI / 180;

function point(value) {
  if (Array.isArray(value)) return { lng: Number(value[0]), lat: Number(value[1]) };
  return { lng: Number(value?.lng), lat: Number(value?.lat) };
}

function validPoint(value) {
  const p = point(value);
  return Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

export function haversineMeters(a, b) {
  const p1 = point(a), p2 = point(b);
  const dLat = (p2.lat - p1.lat) * RAD;
  const dLng = (p2.lng - p1.lng) * RAD;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(p1.lat * RAD) * Math.cos(p2.lat * RAD) * sinLng * sinLng;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function bearingDegrees(a, b) {
  const p1 = point(a), p2 = point(b);
  const dLng = (p2.lng - p1.lng) * RAD;
  const y = Math.sin(dLng) * Math.cos(p2.lat * RAD);
  const x = Math.cos(p1.lat * RAD) * Math.sin(p2.lat * RAD)
    - Math.sin(p1.lat * RAD) * Math.cos(p2.lat * RAD) * Math.cos(dLng);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export function degreesDelta(a, b) {
  return ((Number(a) - Number(b) + 540) % 360) - 180;
}

function projectOnSegment(location, from, to) {
  const p = point(location), a = point(from), b = point(to);
  const cosLat = Math.cos(((a.lat + b.lat + p.lat) / 3) * RAD);
  const ax = a.lng * cosLat, ay = a.lat;
  const bx = b.lng * cosLat, by = b.lat;
  const px = p.lng * cosLat, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
  const projected = { lng: (ax + dx * t) / cosLat, lat: ay + dy * t };
  return {
    t,
    point: projected,
    distanceMeters: haversineMeters(p, projected),
    segmentMeters: haversineMeters(a, b),
  };
}

export function distanceToSegmentMeters(location, from, to) {
  return projectOnSegment(location, from, to).distanceMeters;
}

export function buildRouteModel(data = {}) {
  const coords = (data.coords || []).filter(validPoint).map((value) => [point(value).lng, point(value).lat]);
  const routeCoords = [];
  for (const coord of coords) {
    if (!routeCoords.length || haversineMeters(routeCoords[routeCoords.length - 1], coord) > 0.1) routeCoords.push(coord);
  }
  if (routeCoords.length < 2) return null;

  const cumulative = [0];
  for (let i = 1; i < routeCoords.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMeters(routeCoords[i - 1], routeCoords[i]));
  }

  const rawSteps = Array.isArray(data.steps) ? data.steps : [];
  const geometries = Array.isArray(data.stepGeometries) ? data.stepGeometries : [];
  const starts = [];
  let cursor = 0;
  for (let i = 0; i < rawSteps.length; i++) {
    const geometry = geometries[i]?.coordinates || geometries[i];
    const anchor = geometry?.[0] || (
      Number.isFinite(Number(rawSteps[i]?.lat)) && Number.isFinite(Number(rawSteps[i]?.lon))
        ? [rawSteps[i].lon, rawSteps[i].lat]
        : null
    );
    if (!anchor) continue;
    const nearest = nearestRoutePosition(anchor, routeCoords, cursor, routeCoords.length);
    cursor = Math.max(cursor, nearest.segmentIndex);
    starts.push({ index: i, alongMeters: nearest.alongMeters });
  }

  const steps = rawSteps.length
    ? rawSteps
    : [{ maneuver: { type: "depart", bearing_after: bearingDegrees(routeCoords[0], routeCoords[1]) }, distance: cumulative.at(-1) }];
  if (!starts.length) starts.push({ index: 0, alongMeters: 0 });
  while (starts.length < steps.length) starts.push({ index: starts.length, alongMeters: cumulative.at(-1) });

  return {
    coords: routeCoords,
    cumulative,
    totalDistance: cumulative.at(-1),
    steps,
    stepStarts: starts.map((start) => Math.max(0, Math.min(cumulative.at(-1), start.alongMeters))),
  };
}

export function nearestRoutePosition(location, coords, currentSegment = 0, lookAhead = 8) {
  const route = coords || [];
  const lastSegment = Math.max(0, route.length - 2);
  if (route.length < 2) return { segmentIndex: 0, fraction: 0, distanceMeters: Infinity, alongMeters: 0, point: null };
  const startSegment = Math.max(0, Math.min(lastSegment, Number(currentSegment) || 0));
  const current = projectOnSegment(location, route[startSegment], route[startSegment + 1]);
  const span = Number.isFinite(lookAhead) ? lookAhead : lastSegment + 1;
  const endSegment = Math.min(lastSegment, startSegment + Math.max(1, span));
  let best = null;
  for (let i = startSegment; i <= endSegment; i++) {
    const projected = projectOnSegment(location, route[i], route[i + 1]);
    if (!best || projected.distanceMeters < best.distanceMeters) {
      best = {
        segmentIndex: i,
        fraction: projected.t,
        distanceMeters: projected.distanceMeters,
        point: projected.point,
        segmentMeters: projected.segmentMeters,
      };
    }
  }
  let alongMeters = 0;
  for (let i = 0; i < best.segmentIndex; i++) alongMeters += haversineMeters(route[i], route[i + 1]);
  return { ...best, alongMeters: alongMeters + best.segmentMeters * best.fraction, currentDistanceMeters: current.distanceMeters };
}

function pointAtRouteDistance(route, distanceMeters, startSegment = 0) {
  if (!route?.coords?.length || !route?.cumulative?.length) return null;
  const target = Math.max(0, Math.min(route.totalDistance, distanceMeters));
  let segment = Math.max(0, Math.min(route.coords.length - 2, Number(startSegment) || 0));
  while (segment < route.coords.length - 2 && route.cumulative[segment + 1] < target) segment += 1;
  const start = route.coords[segment];
  const end = route.coords[segment + 1];
  const span = route.cumulative[segment + 1] - route.cumulative[segment];
  const fraction = span > 0 ? (target - route.cumulative[segment]) / span : 0;
  return {
    lng: start[0] + (end[0] - start[0]) * fraction,
    lat: start[1] + (end[1] - start[1]) * fraction,
  };
}

export function processRoutePosition(location, route, state = {}) {
  if (!route?.coords?.length) return null;
  const accuracy = Number(location?.accuracy);
  const posTolerance = accuracy > 0 ? 30 + accuracy : 60;
  const nearest = nearestRoutePosition(location, route.coords, state.segmentIndex || 0, 8);
  const lookAhead = nearest.currentDistanceMeters >= 250 ? 15 : 8;
  const selected = lookAhead === 8
    ? nearest
    : nearestRoutePosition(location, route.coords, state.segmentIndex || 0, lookAhead);
  const segmentEnd = route.coords[Math.min(selected.segmentIndex + 1, route.coords.length - 1)];
  const speed = Number(location?.speed);
  const lookAheadMeters = Math.min(36, Math.max(12, Number.isFinite(speed) && speed > 0 ? speed * 0.55 : 12));
  const ahead = pointAtRouteDistance(route, selected.alongMeters + lookAheadMeters, selected.segmentIndex);
  const localRouteBearing = bearingDegrees(selected.point || location, segmentEnd);
  const routeBearing = ahead && haversineMeters(selected.point || location, ahead) > 1
    ? bearingDegrees(selected.point || location, ahead)
    : localRouteBearing;
  const previous = state.previousLocation;
  const movedMeters = previous ? haversineMeters(previous, location) : 0;
  const motionBearing = movedMeters >= 8 ? bearingDegrees(previous, location) : null;
  const wrongMovement = motionBearing !== null && Math.abs(degreesDelta(motionBearing, localRouteBearing)) > 90
    && Number(location?.speed || 0) > 2;
  return {
    ...selected,
    posTolerance,
    allowableDeviation: posTolerance * 2,
    deviated: selected.distanceMeters > posTolerance * 2,
    wrongMovement,
    routeBearing,
    motionBearing,
    progress: route.totalDistance ? selected.alongMeters / route.totalDistance : 0,
  };
}

export function stepIndexAtProgress(route, alongMeters) {
  const starts = route?.stepStarts || [];
  let index = 0;
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] <= alongMeters + 3) index = i;
    else break;
  }
  return Math.min(index, Math.max(0, (route?.steps?.length || 1) - 1));
}

export function nextInstruction(route, position) {
  const currentIndex = stepIndexAtProgress(route, position?.alongMeters || 0);
  const nextIndex = Math.min(currentIndex + 1, Math.max(0, route.steps.length - 1));
  const nextAlong = route.stepStarts[nextIndex] ?? route.totalDistance;
  return {
    currentIndex,
    nextIndex,
    distanceMeters: Math.max(0, nextAlong - (position?.alongMeters || 0)),
    step: route.steps[nextIndex] || route.steps[currentIndex],
  };
}
