import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskPriority, normalizeTaskStatus, TASK_PRIORITIES } from "../functions/_projects.js";

test("project task priorities accept medium and preserve the no-priority alias", () => {
  assert.deepEqual(TASK_PRIORITIES, ["low", "normal", "medium", "high", "urgent"]);
  assert.equal(normalizeTaskPriority("medium"), "medium");
  assert.equal(normalizeTaskPriority("no-priority"), "normal");
  assert.equal(normalizeTaskPriority("unsupported"), null);
  assert.equal(normalizeTaskStatus("planned"), "inbox");
  assert.equal(normalizeTaskStatus("archived"), "cancelled");
});
