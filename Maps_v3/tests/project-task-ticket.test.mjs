import test from "node:test";
import assert from "node:assert/strict";
import { parseProjectTicket } from "../functions/_projects.js";

test("project task ticket links parse a project key and trailing task number", () => {
  assert.deepEqual(parseProjectTicket("WEB-42"), { projectKey: "WEB", taskNumber: 42 });
  assert.deepEqual(parseProjectTicket("CLIENT-WEB-7"), { projectKey: "CLIENT-WEB", taskNumber: 7 });
});

test("project task ticket links reject malformed or zero-number tickets", () => {
  assert.equal(parseProjectTicket("WEB"), null);
  assert.equal(parseProjectTicket("WEB-0"), null);
});
