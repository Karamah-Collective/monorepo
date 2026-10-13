import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_ACTIONS, ROLE_PERMISSIONS, actionDescriptor, allowsPermissions, descriptorIsAllowed, mcpGrantAllows } from "../shared/admin-access.mjs";
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

test("Operations actions are typed, MCP-visible, and have schemas", () => {
  const names = ["workspace.operations.summary", "workspace.operations.tasks.list", "workspace.operations.tasks.get", "workspace.operations.tasks.create", "workspace.operations.tasks.assign", "workspace.operations.tasks.update", "workspace.operations.tasks.bulk_update", "workspace.approvals.list", "workspace.approvals.resolve", "workspace.history.list", "workspace.history.diff", "workspace.history.rollback"];
  for (const name of names) {
    const descriptor = ADMIN_ACTIONS.find(item => item.name === name);
    assert.ok(descriptor, `missing descriptor for ${name}`);
    assert.equal(descriptor.exposeMcp, true);
    assert.ok(Object.keys(descriptor.schema || {}).length || descriptor.method === "GET");
  }
});

test("Operations permissions intersect role and connection grants", () => {
  assert.ok(ROLE_PERMISSIONS.administrator.includes("*"));
  assert.ok(ROLE_PERMISSIONS.moderator.includes("operations.tasks.read"));
  const taskList = ADMIN_ACTIONS.find(item => item.name === "workspace.operations.tasks.list");
  assert.equal(descriptorIsAllowed(taskList, ["operations.tasks.read"], ["operations.tasks.read"]), true);
  assert.equal(descriptorIsAllowed(taskList, ["operations.tasks.read"], ["website.content.read"]), false);
});

test("risk-sensitive Operations tools remain confirmation candidates", () => {
  for (const name of ["workspace.operations.tasks.bulk_update", "workspace.approvals.resolve", "workspace.history.rollback"]) assert.equal(ADMIN_ACTIONS.find(item => item.name === name)?.dangerous, true, name);
});

test("project workspace actions have typed MCP descriptors", () => {
  for (const name of [
    "workspace.projects.list", "workspace.search", "workspace.projects.create", "workspace.projects.members.update",
    "workspace.tasks.list", "workspace.tasks.get", "workspace.tasks.create", "workspace.tasks.update", "workspace.tasks.assign",
    "workspace.tasks.delete", "workspace.tasks.bulk_update", "workspace.tasks.comments.create", "workspace.tasks.comments.update", "workspace.tasks.comments.delete",
    "workspace.tasks.relations.create", "workspace.tasks.relations.delete", "workspace.tasks.labels.create", "workspace.tasks.labels.update", "workspace.tasks.templates.save", "workspace.projects.webhooks.save", "workspace.milestones.create",
    "workspace.google_tasks.connect", "workspace.google_tasks.sync",
  ]) {
    const descriptor = ADMIN_ACTIONS.find(item => item.name === name);
    assert.ok(descriptor, `missing project descriptor for ${name}`);
    assert.equal(descriptor.exposeMcp, true);
    assert.ok(Object.keys(descriptor.schema || {}).length || descriptor.method === "GET");
  }
});

test("project destructive tools remain confirmation candidates", () => {
  for (const name of ["workspace.projects.archive", "workspace.tasks.delete", "workspace.tasks.bulk_update", "workspace.google_tasks.sync"]) {
    assert.equal(ADMIN_ACTIONS.find(item => item.name === name)?.dangerous, true, name);
  }
});

test("MCP tool names are unique and project task tools resolve to project actions", () => {
  const names = ADMIN_ACTIONS.map((item) => item.name);
  assert.equal(new Set(names).size, names.length, "duplicate MCP tool names would shadow a capability");
  assert.equal(actionDescriptor("project-tasks-list")?.name, "workspace.tasks.list");
  assert.equal(actionDescriptor("project-task-assign")?.name, "workspace.tasks.assign");
});
