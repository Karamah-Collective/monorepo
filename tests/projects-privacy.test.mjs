import test from "node:test";
import assert from "node:assert/strict";
import {
  canSeeTask,
  acceptProjectInvitation,
  bulkUpdateProjectTasks,
  createProjectColumn,
  createProjectRelation,
  createProjectTask,
  createProjectMilestone,
  filterVisibleRelations,
  getProjectInvitation,
  getProjectAccess,
  normalizeProjectExternalUrl,
  normalizeProjectPermissions,
  rolePermissions,
  saveProjectSavedView,
  saveProjectCustomField,
  saveProjectTimeEntry,
  saveProjectWebhook,
  taskAssignmentMatchesActor,
  taskVisibilityClause,
  updateProject,
  updateProjectColumn,
  updateProjectWorkspaceMember,
  updateProjectTask,
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

test("uninvited actors cannot inherit access to the default workspace", async () => {
  const outsider = actor("outside@example.com", "outside");
  const access = await getProjectAccess(dbFixture({ project: project("public") }), "project-1", outsider, { permissions: [] });
  assert.equal(access, null);
});

test("project-only membership does not expose sibling projects", async () => {
  const outsider = actor("member@example.com", "member");
  const projects = new Map([
    ["project-a", { ...project("restricted"), id: "project-a" }],
    ["project-b", { ...project("restricted"), id: "project-b" }],
  ]);
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM projects WHERE id=?")) return projects.get(values[0]) || null;
              if (sql.includes("FROM project_members WHERE project_id=?")) return values[0] === "project-a" ? { role: "viewer" } : null;
              if (sql.includes("FROM project_workspaces WHERE id=?")) return { id: "workspace-default", created_by_email: "owner@karamahcollective.com", created_by_uid: "owner" };
              if (sql.includes("FROM project_workspace_members")) return null;
              if (sql.includes("SELECT 1 FROM project_members")) return { 1: 1 };
              return null;
            },
          };
        },
      };
    },
  };
  assert.equal((await getProjectAccess(db, "project-a", outsider, { permissions: [] }))?.role, "viewer");
  assert.equal(await getProjectAccess(db, "project-b", outsider, { permissions: [] }), null);
});

test("unknown project roles fail closed to read-only access", async () => {
  const access = await getProjectAccess(
    dbFixture({
      project: project("restricted"),
      member: { role: "unknown-role" },
      permissions: { can_create_tasks: 1, can_manage_project: 1 },
    }),
    "project-1",
    actor(),
    { permissions: [] },
  );
  assert.equal(access.role, "viewer");
  assert.equal(access.permissions.can_create_tasks, false);
  assert.equal(access.permissions.can_manage_project, false);
});

test("task mutations reject unknown status and priority values", async () => {
  const owner = actor("owner@karamahcollective.com", "owner");
  const projectRow = { ...project("workspace"), created_by_email: owner.email, created_by_uid: owner.uid };
  const task = {
    id: "task-1", project_id: "project-1", task_number: 1, title: "Task", description: "", column_id: "column-1",
    status_category: "inbox", priority: "normal", assignee_uid: "", assignee_email: "", created_by_uid: owner.uid,
    created_by_email: owner.email, revision: 1, position: 0,
  };
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM projects WHERE id=?")) return values[0] === "project-1" ? projectRow : null;
              if (sql.includes("FROM project_tasks WHERE id=?")) return task;
              if (sql.includes("FROM project_members")) return null;
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  const createResult = await createProjectTask(db, { projectId: "project-1", title: "New", priority: "invalid" }, owner, { permissions: [] });
  assert.equal(createResult.status, 400);
  const updateResult = await updateProjectTask(db, { id: "task-1", expectedRevision: 1, priority: "invalid", status: "invalid" }, owner, { permissions: [] });
  assert.equal(updateResult.status, 400);
});

test("project and task mutations reject empty names and invalid positions", async () => {
  const owner = actor("owner@karamahcollective.com", "owner");
  const projectRow = { ...project("workspace"), created_by_email: owner.email, created_by_uid: owner.uid, revision: 1 };
  const task = {
    id: "task-1", project_id: "project-1", task_number: 1, title: "Task", description: "", column_id: "column-1",
    status_category: "inbox", priority: "normal", assignee_uid: "", assignee_email: "", created_by_uid: owner.uid,
    created_by_email: owner.email, revision: 1, position: 0,
  };
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM projects WHERE id=?")) return projectRow;
              if (sql.includes("FROM project_tasks WHERE id=?")) return task;
              if (sql.includes("FROM project_members")) return null;
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  assert.equal((await updateProject(db, { projectId: "project-1", expectedRevision: 1, name: "   " }, owner, { permissions: [] })).error, "A project name is required.");
  assert.equal((await updateProjectTask(db, { id: "task-1", expectedRevision: 1, title: "   " }, owner, { permissions: [] })).error, "A task title is required.");
  assert.equal((await updateProjectTask(db, { id: "task-1", expectedRevision: 1, position: "not-a-number" }, owner, { permissions: [] })).status, 400);
  assert.equal((await createProjectTask(db, { projectId: "project-1", title: "Bad position", position: -1 }, owner, { permissions: [] })).status, 400);
});

test("assignment permission cannot update task status without an assignee change", async () => {
  const assigner = actor("assigner@karamahcollective.com", "assigner");
  const task = {
    id: "task-1", project_id: "project-1", task_number: 1, title: "Task", description: "", column_id: "column-1",
    status_category: "inbox", priority: "normal", assignee_uid: "other", assignee_email: "other@karamahcollective.com",
    created_by_uid: "owner", created_by_email: "owner@karamahcollective.com", revision: 1, position: 0,
  };
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM projects WHERE id=?")) return project("workspace");
              if (sql.includes("FROM project_members WHERE")) return { project_id: "project-1", email: assigner.email, role: "contributor" };
              if (sql.includes("FROM project_member_permissions")) return {
                can_view_project: 1, can_read_tasks: 1, can_assign_tasks: 1, can_edit_any_tasks: 0,
                can_edit_own_tasks: 0, task_visibility: "all",
              };
              if (sql.includes("FROM project_tasks WHERE id=?")) return task;
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  const statusOnly = await updateProjectTask(db, {
    id: "task-1", expectedRevision: 1, statusCategory: "in_progress",
  }, assigner, { permissions: [] });
  assert.equal(statusOnly.status, 403);
  const assignment = await updateProjectTask(db, {
    id: "task-1", expectedRevision: 1, assigneeUid: "new-assignee",
  }, assigner, { permissions: [] });
  assert.equal(assignment.success, true);
});

test("custom field API preserves frontend types and rejects invalid definitions", async () => {
  const owner = actor("owner@karamahcollective.com", "owner");
  const projectRow = { ...project("workspace"), created_by_email: owner.email, created_by_uid: owner.uid };
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM projects WHERE id=?")) return projectRow;
              if (sql.includes("FROM project_custom_fields WHERE id=?")) return {
                id: values[0], project_id: "project-1", name: "Tags", field_type: "select", options_json: '["A","B"]',
                position: 0, required: 0, default_value: null, multiple: 1, created_by_uid: owner.uid,
              };
              return null;
            },
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  const invalid = await saveProjectCustomField(db, { projectId: "project-1", name: "Bad", type: "unknown" }, owner, { permissions: [] });
  assert.equal(invalid.status, 400);
  const field = await saveProjectCustomField(db, {
    projectId: "project-1", name: "Tags", type: "multiselect", multiple: true, options: ["A", "B"],
  }, owner, { permissions: [] });
  assert.equal(field.success, true);
  assert.equal(field.field.type, "multiselect");
  assert.deepEqual(field.field.options, ["A", "B"]);
});

test("bulk task updates reject empty and oversized selections", async () => {
  const owner = actor("owner@karamahcollective.com", "owner");
  assert.equal((await bulkUpdateProjectTasks({}, { idempotencyKey: "empty", taskIds: [] }, owner, { permissions: [] })).status, 400);
  assert.equal((await bulkUpdateProjectTasks({}, { idempotencyKey: "large", taskIds: Array.from({ length: 101 }, (_, index) => `task-${index}`) }, owner, { permissions: [] })).status, 400);
});

test("columns and relations reject unknown enum and position values", async () => {
  const owner = actor("owner@karamahcollective.com", "owner");
  const projectRow = { ...project("workspace"), created_by_email: owner.email, created_by_uid: owner.uid };
  const column = { id: "column-1", project_id: "project-1", name: "Inbox", status_category: "inbox", position: 10 };
  const tasks = new Map([
    ["task-1", { id: "task-1", project_id: "project-1", status_category: "inbox", assignee_uid: owner.uid, assignee_email: owner.email, created_by_uid: owner.uid, created_by_email: owner.email }],
    ["task-2", { id: "task-2", project_id: "project-1", status_category: "inbox", assignee_uid: owner.uid, assignee_email: owner.email, created_by_uid: owner.uid, created_by_email: owner.email }],
  ]);
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM projects WHERE id=?")) return projectRow;
              if (sql.includes("FROM project_members")) return null;
              if (sql.includes("FROM project_columns WHERE id=?")) return column;
              if (sql.includes("FROM project_tasks WHERE id=?")) return tasks.get(values[0]) || null;
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  assert.equal((await createProjectColumn(db, { projectId: "project-1", name: "Bad", statusCategory: "unknown" }, owner, { permissions: [] })).status, 400);
  assert.equal((await createProjectColumn(db, { projectId: "project-1", name: "Bad", position: Number.POSITIVE_INFINITY }, owner, { permissions: [] })).status, 400);
  assert.equal((await updateProjectColumn(db, { id: "column-1", name: "   " }, owner, { permissions: [] })).error, "Column name is required.");
  assert.equal((await updateProjectColumn(db, { id: "column-1", statusCategory: "unknown" }, owner, { permissions: [] })).status, 400);
  assert.equal((await createProjectRelation(db, { taskId: "task-1", relatedTaskId: "task-2", relationType: "unknown" }, owner, { permissions: [] })).status, 400);
});

test("webhooks reject malformed, credentialed, and private network targets", async () => {
  const owner = actor("owner@karamahcollective.com", "owner");
  const projectRow = { ...project("workspace"), created_by_email: owner.email, created_by_uid: owner.uid };
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM projects WHERE id=?")) return projectRow;
              if (sql.includes("SELECT * FROM project_webhooks WHERE id=?")) return {
                id: values[0], project_id: "project-1", url: "https://hooks.example.com/events", event_types_json: "[]",
                active: 1, secret_ciphertext: "", created_by_uid: owner.uid, created_at: "", updated_at: "",
              };
              return null;
            },
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  for (const url of ["not-a-url", "ftp://hooks.example.com/events", "https://user:secret@hooks.example.com/events", "http://127.0.0.1:8788/events", "https://localhost/events", "https://192.168.1.20/events", "https://service.internal/events"]) {
    assert.equal((await saveProjectWebhook(db, { projectId: "project-1", url }, owner, { permissions: [] })).status, 400, url);
  }
  const valid = await saveProjectWebhook(db, { projectId: "project-1", url: "https://hooks.example.com/events" }, owner, { permissions: [] });
  assert.equal(valid.success, true);
});

test("relation creation authorizes the source task before looking up the target", async () => {
  const outsider = actor("outside@example.com", "outside");
  let taskReads = 0;
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM project_tasks WHERE id=?")) {
                taskReads += 1;
                return values[0] === "task-hidden" ? {
                  id: "task-hidden", project_id: "private-project", status_category: "inbox",
                  assignee_uid: "owner", assignee_email: "owner@karamahcollective.com",
                  created_by_uid: "owner", created_by_email: "owner@karamahcollective.com",
                } : null;
              }
              if (sql.includes("FROM projects WHERE id=?")) return { ...project("restricted"), id: "private-project" };
              if (sql.includes("FROM project_workspaces")) return { id: "workspace-default", name: "Workspace", created_by_uid: "owner", created_by_email: "owner@karamahcollective.com" };
              if (sql.includes("FROM project_members")) return null;
              if (sql.includes("FROM project_workspace_members")) return null;
              return null;
            },
          };
        },
      };
    },
  };
  const result = await createProjectRelation(db, { taskId: "task-hidden", relatedTaskId: "target-hidden" }, outsider, { permissions: [] });
  assert.equal(result.status, 403);
  assert.equal(taskReads, 1);
});

test("saved-view responses report the normalized view type", async () => {
  const owner = actor("owner@karamahcollective.com", "owner");
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => {
              if (sql.includes("FROM projects WHERE id=?")) return { ...project("workspace"), created_by_email: owner.email, created_by_uid: owner.uid };
              if (sql.includes("FROM project_members")) return null;
              return null;
            },
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  const result = await saveProjectSavedView(db, { projectId: "project-1", name: "Safe", viewType: "unknown" }, owner, { permissions: [] });
  assert.equal(result.success, true);
  assert.equal(result.view.viewType, "board");
});

test("workspace member project selections reject cross-workspace IDs", async () => {
  const owner = actor("owner@karamahcollective.com", "owner");
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM project_workspace_members")) return null;
              if (sql.includes("FROM project_workspaces")) return { id: "workspace-default", name: "Workspace", created_by_uid: owner.uid, created_by_email: owner.email };
              if (sql.includes("FROM project_workspace_roles")) return null;
              if (sql.includes("FROM projects WHERE id=?")) return { id: values[0], workspace_id: "other-workspace", name: "Other" };
              return null;
            },
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  const result = await updateProjectWorkspaceMember(db, {
    workspaceId: "workspace-default",
    member: { email: "member@karamahcollective.com", role: "member" },
    projectAccess: "selected",
    projectIds: ["other-project"],
  }, owner, {});
  assert.equal(result.status, 400);
});

test("time entries reject invalid dates, reversed ranges, and unbounded durations", async () => {
  const owner = actor("owner@karamahcollective.com", "owner");
  const task = {
    id: "task-1", project_id: "project-1", status_category: "inbox", assignee_uid: owner.uid,
    assignee_email: owner.email, created_by_uid: owner.uid, created_by_email: owner.email,
  };
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => {
              if (sql.includes("FROM project_tasks WHERE id=?")) return task;
              if (sql.includes("FROM projects WHERE id=?")) return { ...project("workspace"), created_by_uid: owner.uid, created_by_email: owner.email };
              if (sql.includes("FROM project_members")) return null;
              return null;
            },
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  assert.equal((await saveProjectTimeEntry(db, { taskId: "task-1", startedAt: "not-a-date" }, owner, { permissions: [] })).status, 400);
  assert.equal((await saveProjectTimeEntry(db, { taskId: "task-1", startedAt: "2026-10-20T02:00:00Z", endedAt: "2026-10-20T01:00:00Z" }, owner, { permissions: [] })).status, 400);
  assert.equal((await saveProjectTimeEntry(db, { taskId: "task-1", durationMinutes: 1_000_001 }, owner, { permissions: [] })).status, 400);
});

test("task dates reject invalid ordering and persist normalized UTC values", async () => {
  const owner = actor("owner@karamahcollective.com", "owner");
  const projectRow = { ...project("workspace"), created_by_email: owner.email, created_by_uid: owner.uid };
  const task = {
    id: "task-1", project_id: "project-1", task_number: 1, title: "Task", description: "", column_id: "column-1",
    status_category: "inbox", priority: "normal", assignee_uid: "", assignee_email: "", created_by_uid: owner.uid,
    created_by_email: owner.email, revision: 1, position: 0, start_at: "2026-10-20T00:00:00.000Z", due_at: "2026-10-21T00:00:00.000Z",
  };
  let insertedValues;
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("FROM projects WHERE id=?")) return values[0] === "project-1" ? projectRow : null;
              if (sql.includes("FROM project_tasks WHERE id=?")) return task;
              if (sql.includes("COALESCE(MAX(task_number)")) return { next: 1 };
              if (sql.includes("FROM project_columns")) return { id: "column-1", project_id: "project-1", status_category: "inbox" };
              if (sql.includes("FROM project_members")) return null;
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => {
              if (sql.includes("INSERT INTO project_tasks")) insertedValues = values;
              return { success: true };
            },
          };
        },
      };
    },
  };
  const invalid = await createProjectTask(db, {
    projectId: "project-1", title: "Invalid", startAt: "not-a-date", dueAt: "2026-10-21T00:00:00Z",
  }, owner, { permissions: [] });
  assert.equal(invalid.status, 400);
  const impossible = await createProjectTask(db, {
    projectId: "project-1", title: "Impossible", startAt: "2026-02-30T00:00:00Z",
  }, owner, { permissions: [] });
  assert.equal(impossible.status, 400);
  const reversed = await createProjectTask(db, {
    projectId: "project-1", title: "Reversed", startAt: "2026-10-21T00:00:00Z", dueAt: "2026-10-20T00:00:00Z",
  }, owner, { permissions: [] });
  assert.equal(reversed.status, 400);
  const valid = await createProjectTask(db, {
    projectId: "project-1", title: "Timezone", startAt: "2026-10-20T02:00:00+02:00", dueAt: "2026-10-21T00:00:00Z",
  }, owner, { permissions: [] });
  assert.equal(valid.success, true);
  assert.equal(insertedValues[10], "2026-10-20T00:00:00.000Z");
  assert.equal(insertedValues[11], "2026-10-21T00:00:00.000Z");
  const update = await updateProjectTask(db, {
    id: "task-1", expectedRevision: 1, dueAt: "2026-10-19T00:00:00Z",
  }, owner, { permissions: [] });
  assert.equal(update.status, 400);
});

test("milestone dates reject invalid ordering at the API boundary", async () => {
  const owner = actor("owner@karamahcollective.com", "owner");
  const projectRow = { ...project("workspace"), created_by_email: owner.email, created_by_uid: owner.uid };
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => {
              if (sql.includes("FROM projects WHERE id=?")) return projectRow;
              if (sql.includes("FROM project_members")) return null;
              return null;
            },
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  const result = await createProjectMilestone(db, {
    projectId: "project-1", name: "Invalid dates", startAt: "2026-10-21T00:00:00Z", dueAt: "2026-10-20T00:00:00Z",
  }, owner, { permissions: [] });
  assert.equal(result.status, 400);
});

test("own-task visibility includes creator and assignee identity variants", () => {
  const [sql, binds] = taskVisibilityClause({ taskVisibility: "own" }, actor());
  assert.match(sql, /created_by_uid/);
  assert.match(sql, /assignee_uid/);
  assert.equal(binds.length, 4);
});

test("invalid permission overrides and URL schemes fail closed", () => {
  const permissions = normalizeProjectPermissions("viewer", { task_visibility: "unrestricted", can_create_tasks: 1 });
  assert.equal(permissions.can_create_tasks, true);
  assert.equal(permissions.task_visibility, "all");
  assert.equal(normalizeProjectExternalUrl("ftp://example.com/file"), null);
  assert.equal(normalizeProjectExternalUrl("http://example.com/work/1"), "http://example.com/work/1");
});

test("expired invitations cannot be accepted by a different email", async () => {
  const row = {
    id: "invite-expired", email: "partner@example.com", workspace_id: "workspace-1", project_id: null,
    workspace_name: "Partner workspace", project_name: null, workspace_role: "viewer", project_role: null,
    project_permissions_json: "{}", project_task_visibility: "all", selected_project_ids_json: "[]",
    project_roles_json: "{}", status: "pending", invited_by_email: "owner@karamahcollective.com",
    created_at: "2020-01-01T00:00:00.000Z", expires_at: "2020-01-02T00:00:00.000Z", sent_at: null,
  };
  const db = (value) => ({ prepare: () => ({ bind: () => ({ first: async () => value }) }) });
  const inspected = await getProjectInvitation(db(row), { invitationId: row.id });
  assert.equal(inspected.valid, false);
  assert.equal(inspected.invitation.expired, true);
  const accepted = await acceptProjectInvitation(db({ ...row, expires_at: "2099-01-02T00:00:00.000Z" }), { invitationId: row.id }, actor("wrong@example.com", "wrong"));
  assert.equal(accepted.status, 403);
});
