import assert from "node:assert/strict";
import test from "node:test";
import { buildRouteModel, processRoutePosition, nextInstruction } from "../src/navigation-core.js";

const route = buildRouteModel({
  coords: [[24.9384, 60.1699], [24.9400, 60.1699], [24.9420, 60.1699]],
  steps: [
    { maneuver: { type: "depart", bearing_after: 90 }, name: "Start" },
    { maneuver: { type: "turn", modifier: "right" }, name: "Main Street" },
  ],
  stepGeometries: [
    { coordinates: [[24.9384, 60.1699], [24.9400, 60.1699]] },
    { coordinates: [[24.9400, 60.1699], [24.9420, 60.1699]] },
  ],
});

test("OsmAnd-style route progress advances to the nearest forward segment", () => {
  const progress = processRoutePosition({ lat: 60.1699, lng: 24.9408, accuracy: 5, speed: 8 }, route);
  assert.ok(progress.alongMeters > 100);
  assert.equal(progress.deviated, false);
  assert.equal(nextInstruction(route, progress).nextIndex, 1);
});

test("route deviation uses GPS accuracy plus OsmAnd's tolerance multiplier", () => {
  const progress = processRoutePosition({ lat: 60.1720, lng: 24.9408, accuracy: 5, speed: 8 }, route);
  assert.equal(progress.deviated, true);
  assert.ok(progress.allowableDeviation >= 70);
});
