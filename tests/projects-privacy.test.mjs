import test from "node:test";
import assert from "node:assert/strict";
import {
  canSeeTask,
  filterVisibleRelations,
  getProjectAccess,
  normalizeProjectExternalUrl,
  normalizeProjectPermissions,
  rolePermissions,
  taskVisibilityClause,
} from "../Maps/functions/_projects.js";

const actor = (email = "member@karamahcollective.com", uid = "member") => ({ email, uid });
const project = (visibility = "workspace") => ({
  id: "project-1", visibility, created_by_uid: "owner", created_by_email: "owner@karamahcollective.com",
});

function dbFixture({ project: row, member = null, permissions = null }) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => {
              if (sql.includes("FROM projects")) return row;
              if (sql.includes("FROM project_members")) return member;
              if (sql.includes("FROM project_member_permissions")) return permissions;
              return null;
            },
          };
        },
      };
    },
  };
}

test("role presets expose distinct read and write capabilities", () => {
  const viewer = rolePermissions("viewer");
  const contributor = rolePermissions("contributor");
  const manager = rolePermissions("manager");
  const admin = rolePermissions("project-admin");
  assert.equal(viewer.can_read_tasks, true);
  assert.equal(viewer.can_create_tasks, false);
  assert.equal(contributor.can_edit_own_tasks, true);
  assert.equal(contributor.can_edit_any_tasks, false);
  assert.equal(manager.can_edit_any_tasks, true);
  assert.equal(manager.can_assign_tasks, true);
  assert.equal(admin.can_manage_members, true);
  assert.equal(admin.can_manage_project, true);
});

test("custom member overrides preserve explicit privacy controls", () => {
  const permissions = normalizeProjectPermissions("contributor", {
    can_read_tasks: 1,
    can_create_tasks: 0,
    can_edit_own_tasks: 1,
    can_edit_any_tasks: 0,
    task_visibility: "assigned",
  });
  assert.equal(permissions.can_read_tasks, true);
  assert.equal(permissions.can_create_tasks, false);
  assert.equal(permissions.can_edit_own_tasks, true);
  assert.equal(permissions.task_visibility, "assigned");
});

test("workspace visibility grants contribution but not manager controls", async () => {
  const access = await getProjectAccess(dbFixture({ project: project("workspace") }), "project-1", actor(), { permissions: [] });
  assert.equal(access.role, "contributor");
  assert.equal(access.permissions.can_view_project, true);
  assert.equal(access.permissions.can_read_tasks, true);
  assert.equal(access.permissions.can_create_tasks, true);
  assert.equal(access.permissions.can_edit_own_tasks, true);
  assert.equal(access.permissions.can_edit_any_tasks, false);
  assert.equal(access.permissions.can_assign_tasks, false);
});

test("restricted projects deny non-members while owners bypass membership", async () => {
  const denied = await getProjectAccess(dbFixture({ project: project("restricted") }), "project-1", actor(), { permissions: [] });
  assert.equal(denied, null);
  const owner = await getProjectAccess(dbFixture({ project: project("restricted") }), "project-1", actor("owner@karamahcollective.com", "owner"), { permissions: [] });
  assert.equal(owner.role, "project-admin");
  assert.equal(owner.permissions.can_manage_project, true);
});

test("task visibility scopes separate all, assigned, and own work", () => {
  const me = actor();
  const assignedTask = { assignee_uid: "member", assignee_email: "member@karamahcollective.com", created_by_uid: "other", created_by_email: "other@karamahcollective.com" };
  const createdTask = { assignee_uid: "other", assignee_email: "other@karamahcollective.com", created_by_uid: "member", created_by_email: "member@karamahcollective.com" };
  const otherTask = { assignee_uid: "other", assignee_email: "other@karamahcollective.com", created_by_uid: "other", created_by_email: "other@karamahcollective.com" };
  const base = { permissions: { can_read_tasks: true } };
  assert.equal(canSeeTask(assignedTask, { ...base, taskVisibility: "assigned" }, me), true);
  assert.equal(canSeeTask(createdTask, { ...base, taskVisibility: "assigned" }, me), false);
  assert.equal(canSeeTask(createdTask, { ...base, taskVisibility: "own" }, me), true);
  assert.equal(canSeeTask(otherTask, { ...base, taskVisibility: "own" }, me), false);
  assert.equal(canSeeTask(otherTask, { ...base, taskVisibility: "all" }, me), true);
  const [sql, binds] = taskVisibilityClause({ taskVisibility: "assigned" }, me);
  assert.match(sql, /assignee/);
  assert.equal(binds.length, 2);
});

test("relation reads do not reveal tasks outside a member's visibility scope", async () => {
  const me = actor();
  const relations = [
    { task_id: "mine", related_task_id: "assigned", relation_type: "blocks" },
    { task_id: "mine", related_task_id: "private", relation_type: "relates_to" },
  ];
  const db = {
    prepare() {
      return {
        bind() {
          return {
            all: async () => ({
              results: [
                { id: "mine", assignee_email: me.email, created_by_email: "other@karamahcollective.com" },
                { id: "assigned", assignee_email: me.email, created_by_email: "other@karamahcollective.com" },
                { id: "private", assignee_email: "other@karamahcollective.com", created_by_email: "other@karamahcollective.com" },
              ],
            }),
          };
        },
      };
    },
  };
  const visible = await filterVisibleRelations(db, relations, { permissions: { can_read_tasks: true }, taskVisibility: "assigned" }, me);
  assert.deepEqual(visible, [relations[0]]);
});

test("external task links reject executable URL schemes", () => {
  assert.equal(normalizeProjectExternalUrl("javascript:alert(1)"), null);
  assert.equal(normalizeProjectExternalUrl("data:text/html,hello"), null);
  assert.equal(normalizeProjectExternalUrl("https://example.com/work/1"), "https://example.com/work/1");
});
