import { test, expect } from "@playwright/test";

const liveFixtureEnabled = process.env.PROJECTS_LIVE_AUTH === "1";
test.skip(!liveFixtureEnabled, "Set PROJECTS_LIVE_AUTH=1 when local Maps and Projects services are running.");
test.use({ storageState: process.env.PROJECTS_AUTH_STATE || "Projects/tests/.auth/user.json" });

test("authenticated Projects workspace, membership, assignment, and bulk action matrix", async ({ page, request }) => {
  test.setTimeout(180_000);
  const sockets = [];
  page.on("websocket", (socket) => { if (socket.url().includes("/api/ws/")) sockets.push(socket); });
  await page.goto("/dashboard/workspace/workspace-default/project/project-admin-operations/board", { waitUntil: "domcontentloaded" });
  await expect.poll(() => sockets.length > 0, { timeout: 15_000 }).toBe(true);
  const socketWithToken = sockets.find((socket) => new URL(socket.url()).searchParams.get("token")) || sockets[0];
  const token = socketWithToken ? new URL(socketWithToken.url()).searchParams.get("token") || "" : "";
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (!token) {
    const authProbe = await request.get("/api/admin?action=project-list", { headers });
    const payload = await authProbe.json().catch(() => null);
    expect(authProbe.status(), "authenticated cookie fallback returned a transport error").toBeLessThan(500);
    expect(payload?.error, `authenticated cookie fallback returned ${payload?.error || "an unknown error"}`).toBeUndefined();
  }

  async function postAction(action, data = {}) {
    const response = await request.post("/api/admin", { headers, data: { action, ...data } });
    const payload = await response.json().catch(() => null);
    expect(response.status(), `${action} returned a transport error`).toBeLessThan(500);
    expect(payload, `${action} returned invalid JSON`).toBeTruthy();
    return payload;
  }
  async function getAction(action, query = {}) {
    const params = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])) });
    const response = await request.get(`/api/admin?${params}`, { headers });
    const payload = await response.json().catch(() => null);
    expect(response.status(), `${action} returned a transport error`).toBeLessThan(500);
    expect(payload?.error, `${action} returned ${payload?.error || "an unknown error"}`).toBeUndefined();
    return payload;
  }
  async function expectSuccess(action, data = {}) {
    const payload = await postAction(action, data);
    expect(payload.error, `${action} returned ${payload.error || "an unknown error"}`).toBeUndefined();
    expect(payload.success, `${action} did not report success`).toBe(true);
    return payload;
  }

  const stamp = Date.now();
  const unique = (label) => `live-${label}-${stamp}`;
  const workspaceName = unique("action-workspace");
  const fakeMemberEmail = `qa-member-${stamp}@karamahcollective.com`;
  const fakeMemberUid = `qa-member-${stamp}`;
  let workspaceId = "";
  let projectId = "";
  const taskIds = [];
  let customRole = "";

  try {
    const workspace = await expectSuccess("project-workspace-create", {
      name: workspaceName,
      description: "Temporary workspace for the complete authenticated action matrix",
    });
    workspaceId = workspace.workspace?.id || "";
    expect(workspaceId).toBeTruthy();

    const account = await getAction("project-workspace-get", { workspaceId });
    expect(account.role).toBe("owner");
    expect(account.workspace?.name).toBe(workspaceName);
    const defaultRoles = new Set((await getAction("project-workspace-roles-list", { workspaceId })).roles.map((role) => role.id));
    expect([...defaultRoles]).toEqual(expect.arrayContaining(["viewer", "member", "admin"]));

    const renamed = unique("renamed-workspace");
    const updatedWorkspace = await expectSuccess("project-workspace-update", {
      workspaceId,
      name: renamed,
      description: "Updated workspace description",
    });
    expect(updatedWorkspace.workspace?.name).toBe(renamed);
    expect((await getAction("project-workspace-get", { workspaceId })).workspace?.description).toBe("Updated workspace description");

    customRole = unique("custom-role").toLowerCase();
    const createdRole = await expectSuccess("project-workspace-role-create", {
      workspaceId,
      role: customRole,
      name: "QA Custom Role",
      description: "Temporary custom role",
      permission: { project: ["read", "update"], task: ["read", "update"] },
    });
    expect(createdRole.role?.id).toBe(customRole);
    const changedRole = await expectSuccess("project-workspace-role-update", {
      workspaceId,
      roleName: customRole,
      permission: { project: ["read"], task: ["read"] },
    });
    expect(changedRole.role?.permission?.project).toEqual(["read"]);
    await expectSuccess("project-workspace-role-delete", { workspaceId, roleName: customRole });
    customRole = "";

    const memberUpdate = await expectSuccess("project-workspace-member-update", {
      workspaceId,
      member: { email: fakeMemberEmail, userUid: fakeMemberUid, role: "member" },
    });
    expect(memberUpdate.member?.user?.email).toBe(fakeMemberEmail);
    const members = await getAction("project-workspace-members-list", { workspaceId });
    expect(members.members.some((member) => member.user?.email?.toLowerCase() === fakeMemberEmail)).toBe(true);
    await expectSuccess("project-workspace-member-remove", { workspaceId, email: fakeMemberEmail });
    expect((await getAction("project-workspace-members-list", { workspaceId })).members.some((member) => member.user?.email?.toLowerCase() === fakeMemberEmail)).toBe(false);

    const project = await expectSuccess("project-create", {
      workspaceId,
      name: unique("action-project"),
      key: `ACT${String(stamp).slice(-7)}`,
      description: "Temporary project for workspace action coverage",
      visibility: "workspace",
    });
    projectId = project.project?.id || "";
    expect(projectId).toBeTruthy();
    const projectDetail = await getAction("project-get", { projectId });
    const inbox = projectDetail.columns.find((column) => column.statusCategory === "inbox") || projectDetail.columns[0];
    const progress = projectDetail.columns.find((column) => column.statusCategory === "in_progress") || projectDetail.columns[0];
    expect(inbox?.id).toBeTruthy();
    expect(progress?.id).toBeTruthy();

    const firstTask = await expectSuccess("project-tasks-create", {
      projectId,
      title: unique("bulk-task-one"),
      columnId: inbox.id,
      statusCategory: inbox.statusCategory,
      priority: "normal",
    });
    const secondTask = await expectSuccess("project-tasks-create", {
      projectId,
      title: unique("bulk-task-two"),
      columnId: inbox.id,
      statusCategory: inbox.statusCategory,
      priority: "normal",
    });
    taskIds.push(firstTask.task.id, secondTask.task.id);

    const projectMember = await expectSuccess("project-member-update", {
      projectId,
      member: { email: fakeMemberEmail, userUid: fakeMemberUid, role: "manager" },
    });
    expect(projectMember.member?.role).toBe("manager");
    expect((await getAction("project-members-list", { projectId })).members.some((member) => member.email?.toLowerCase() === fakeMemberEmail && member.role === "manager")).toBe(true);

    const assigned = await expectSuccess("project-task-assign", {
      id: firstTask.task.id,
      expectedRevision: firstTask.task.revision,
      assigneeUid: fakeMemberUid,
      assigneeEmail: fakeMemberEmail,
    });
    expect(assigned.task?.assignee?.email).toBe(fakeMemberEmail);
    expect(assigned.task?.assignee?.uid).toBe(fakeMemberUid);

    const bulkKey = unique("bulk-key");
    const bulk = await expectSuccess("project-tasks-bulk", {
      taskIds,
      idempotencyKey: bulkKey,
      changes: { statusCategory: progress.statusCategory, columnId: progress.id, priority: "low" },
    });
    expect(bulk.succeeded).toBe(2);
    expect(bulk.failed).toBe(0);
    const bulkRetry = await expectSuccess("project-tasks-bulk", {
      taskIds,
      idempotencyKey: bulkKey,
      changes: { statusCategory: "completed", priority: "urgent" },
    });
    expect(bulkRetry.succeeded).toBe(2);
    expect(bulkRetry.results).toEqual(bulk.results);
    const changedTasks = await getAction("project-tasks-list", { projectId });
    for (const task of changedTasks.tasks.filter((item) => taskIds.includes(item.id))) {
      expect(task.statusCategory).toBe(progress.statusCategory);
      expect(task.priority).toBe("low");
    }

    await expectSuccess("project-member-remove", { projectId, email: fakeMemberEmail });
    expect((await getAction("project-members-list", { projectId })).members.some((member) => member.email?.toLowerCase() === fakeMemberEmail)).toBe(false);
  } finally {
    if (customRole && workspaceId) await postAction("project-workspace-role-delete", { workspaceId, roleName: customRole });
    if (workspaceId) await postAction("project-workspace-member-remove", { workspaceId, email: fakeMemberEmail });
    if (projectId) {
      await postAction("project-member-remove", { projectId, email: fakeMemberEmail });
      for (const id of taskIds) {
        const current = await getAction("project-task-get", { id }).catch(() => null);
        if (current?.task) await postAction("project-task-delete", { id, expectedRevision: current.task.revision });
      }
      const currentProject = await getAction("project-get", { projectId }).catch(() => null);
      if (currentProject?.project && currentProject.project.archivedAt == null) {
        await postAction("project-archive", { projectId, expectedRevision: currentProject.project.revision });
      }
    }
    if (workspaceId) await postAction("project-workspace-delete", { workspaceId });
  }
});
