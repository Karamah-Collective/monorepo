import test from "node:test";
import assert from "node:assert/strict";
import { shouldMirrorManarahInboxCopy } from "../functions/api/submit.js";

test("Manarah uses Gmail sync as the single inbox source when OAuth is ready", () => {
  assert.equal(shouldMirrorManarahInboxCopy({ configured: true, connected: true }), false);
});

test("Manarah keeps the inbox fallback when Gmail is unavailable", () => {
  assert.equal(shouldMirrorManarahInboxCopy({ configured: false, connected: true }), true);
  assert.equal(shouldMirrorManarahInboxCopy({ configured: true, connected: false }), true);
});
