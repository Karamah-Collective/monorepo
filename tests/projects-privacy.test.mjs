import test from "node:test";
import assert from "node:assert/strict";
import {
  canSeeTask,
  filterVisibleRelations,
  getProjectInvitation,
  getProjectAccess,
  normalizeProjectExternalUrl,
  normalizeProjectPermissions,
  rolePermissions,
  taskAssignmentMatchesActor,
  taskVisibilityClause,
} from "../Maps/functions/_projects.js";

const actor = (email = "member@karamahcollective.com", uid = "member") => ({ email, uid });
const project = (visibility = "workspace") => ({
  id: "project-1", workspace_id: "workspace-default", visibility, created_by_uid: "owner", created_by_email: "owner@karamahcollective.com",
});

function dbFixture({ project: row, member = null, permissions = null, workspaceMember = null }) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => {
              if (sql.includes("FROM projects")) return row;
              if (sql.includes("FROM project_workspaces")) return { id: "workspace-default", name: "Karamah Projects", description: "", created_by_uid: "", created_by_email: "" };
              if (sql.includes("FROM project_workspace_members")) return workspaceMember;
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

test("workspace access applies to every project and project roles override it", async () => {
  const inherited = await getProjectAccess(dbFixture({ project: project("restricted") }), "project-1", actor(), { permissions: [] });
  assert.equal(inherited.role, "contributor");
  assert.equal(inherited.permissions.can_create_tasks, true);

  const adminPanelRoleDoesNotBypass = await getProjectAccess(dbFixture({ project: project("restricted") }), "project-1", actor(), { permissions: ["*"] });
  assert.equal(adminPanelRoleDoesNotBypass.role, "contributor");

  const workspaceAdminWithProjectViewer = await getProjectAccess(
    dbFixture({ project: project("restricted"), workspaceMember: { role: "admin" }, member: { role: "viewer" } }),
    "project-1",
    actor(),
    { permissions: [] },
  );
  assert.equal(workspaceAdminWithProjectViewer.role, "viewer");
  assert.equal(workspaceAdminWithProjectViewer.permissions.can_create_tasks, false);

  const workspaceViewerWithProjectAdmin = await getProjectAccess(
    dbFixture({ project: project("restricted"), workspaceMember: { role: "viewer" }, member: { role: "project-admin" } }),
    "project-1",
    actor(),
    { permissions: [] },
  );
  assert.equal(workspaceViewerWithProjectAdmin.role, "project-admin");
  assert.equal(workspaceViewerWithProjectAdmin.permissions.can_manage_project, true);

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

test("contributors can self-assign by either stable UID or email", () => {
  const me = actor();
  assert.equal(taskAssignmentMatchesActor({ assigneeUid: me.uid }, me), true);
  assert.equal(taskAssignmentMatchesActor({ assigneeEmail: me.email }, me), true);
  assert.equal(taskAssignmentMatchesActor({ assigneeUid: "other" }, me), false);
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

test("external invitations are public to inspect but remain email-bound and expiring", async () => {
  const row = {
    id: "invite_1", email: "partner@example.com", workspace_id: "workspace-1", project_id: null,
    workspace_name: "Partner workspace", project_name: null, workspace_role: "viewer", project_role: null,
    project_permissions_json: "{}", project_task_visibility: "all", selected_project_ids_json: "[]",
    status: "pending", invited_by_email: "owner@karamahcollective.com", created_at: "2026-10-14T12:00:00.000Z",
    expires_at: "2099-10-14T12:00:00.000Z", sent_at: "2026-10-14T12:00:00.000Z",
  };
  const result = await getProjectInvitation({ prepare: () => ({ bind: () => ({ first: async () => row }) }) }, { invitationId: row.id });
  assert.equal(result.valid, true);
  assert.equal(result.invitation.isExternal, true);
  assert.equal(result.invitation.email, row.email);
  assert.equal(result.invitation.scope, "workspace");
});
