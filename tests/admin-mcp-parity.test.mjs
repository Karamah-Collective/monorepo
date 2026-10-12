import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_ACTIONS, actionDescriptor, allowsPermissions, descriptorIsAllowed, mcpGrantAllows } from "../shared/admin-access.mjs";
import { GET_ACTIONS, POST_ACTIONS } from "../Maps/functions/api/admin.js";
import { buildAuditDetail } from "../Maps/functions/api/admin.js";
import { WEBSITE_READ_ACTIONS, WEBSITE_WRITE_ACTIONS } from "../Website/functions/api/admin.js";
import { gets as FORM_GET_ACTIONS, posts as FORM_POST_ACTIONS } from "../Forms/functions/api/admin.js";

test("every Admin API action has a shared descriptor", () => {
  const descriptors = new Set(ADMIN_ACTIONS.map(item => item.action));
  const direct = [
    ...Object.keys(GET_ACTIONS), ...Object.keys(POST_ACTIONS),
    ...[...WEBSITE_READ_ACTIONS, ...WEBSITE_WRITE_ACTIONS].filter(action => action !== "maps-admin"),
    ...Object.keys(FORM_GET_ACTIONS), ...Object.keys(FORM_POST_ACTIONS),
  ];
  assert.deepEqual(direct.filter(action => !descriptors.has(action)), []);
});

test("typed MCP names cover representative Admin domains", () => {
  for (const [action, owner, name] of [
    ["admin-places", "maps", "maps.places.list"],
    ["save-content", "website", "website.content.publish"],
    ["forms-save", "forms", "forms.update"],
    ["inbox-compose", "maps", "inbox.send"],
    ["save-access-role", "maps", "workspace.roles.update"],
  ]) assert.equal(actionDescriptor(action, owner)?.name, name);
});

test("permission evaluation is wildcard-aware and intersects MCP grants", () => {
  assert.equal(allowsPermissions(["maps.*"], "maps.places.read"), true);
  assert.equal(allowsPermissions(["maps.places.write"], "maps.places.read"), true);
  assert.equal(allowsPermissions([], "maps.places.read"), true, "baseline permissions remain available");
  assert.equal(mcpGrantAllows(["maps.places.write"], "maps.places.read"), true);
  assert.equal(mcpGrantAllows(["website.*"], "maps.places.read"), false);
  assert.equal(descriptorIsAllowed(actionDescriptor("admin-places", "maps"), ["maps.*"], ["maps.places.read"]), true);
  assert.equal(descriptorIsAllowed(actionDescriptor("admin-places", "maps"), ["maps.*"], ["website.content.read"]), false);
});

test("audit detail redacts credentials and sensitive message content", () => {
  const detail = JSON.parse(buildAuditDetail({ source: "mcp", access_token: "bearer-secret", body: "email body", nested: { password: "pw" }, safe: "kept" }));
  assert.equal(detail.access_token, "[redacted]");
  assert.equal(detail.body, "[redacted]");
  assert.equal(detail.nested.password, "[redacted]");
  assert.equal(detail.safe, "kept");
});
