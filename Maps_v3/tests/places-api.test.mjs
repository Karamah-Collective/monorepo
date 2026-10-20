import test from "node:test";
import assert from "node:assert/strict";
import { normaliseAddedAt } from "../functions/api/places.js";

test("normaliseAddedAt converts legacy Helsinki timestamps into sortable values", () => {
  assert.equal(normaliseAddedAt("16.8.2026 21.05.13"), "2026-08-16T21:05:13");
  assert.equal(normaliseAddedAt("18/10/2026, 15.34.56"), "2026-10-18T15:34:56");
  assert.equal(normaliseAddedAt("2026-10-18T07:04:05Z"), "2026-10-18T07:04:05");
  assert.equal(normaliseAddedAt("not a date"), "");
  assert.equal(normaliseAddedAt(""), "");
});
