import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

const liveFixtureEnabled = process.env.PROJECTS_LIVE_AUTH === "1";
test.skip(!liveFixtureEnabled, "Set PROJECTS_LIVE_AUTH=1 when local Maps and Projects services are running.");
test.use({ storageState: process.env.PROJECTS_AUTH_STATE || "Projects/tests/.auth/user.json" });

function runRoleFixture(mode) {
  execFileSync(process.execPath, ["scripts/projects-role-fixtures.mjs", mode], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
}

test.beforeAll(() => {
  runRoleFixture("setup");
});

test.afterAll(() => {
  runRoleFixture("cleanup");
});

test("authenticated Projects role and visibility matrix enforces backend and route boundaries", async ({ page, request }) => {
  test.setTimeout(180_000);
  const sockets = [];
  page.on("websocket", (socket) => { if (socket.url().includes("/api/ws/")) sockets.push(socket); });
  await page.goto("/dashboard/workspace/workspace-default/project/project-admin-operations/board", { waitUntil: "domcontentloaded" });
  await expect.poll(() => sockets.some((socket) => !socket.isClosed())).toBe(true);
  const token = new URL(sockets.find((socket) => !socket.isClosed()).url()).searchParams.get("token") || "";
  expect(token).not.toBe("");
  const headers = { Authorization: `Bearer ${token}` };
  const actorEmail = "moontasir@karamahcollective.com";

  async function getAction(action, query = {}) {
    const params = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])) });
    const response = await request.get(`/api/admin?${params}`, { headers });
    const payload = await response.json().catch(() => null);
    expect(response.status(), `${action} returned 5xx`).toBeLessThan(500);
    expect(payload, `${action} returned non-JSON`).toBeTruthy();
    return { response, payload };
  }

  async function postAction(action, data = {}) {
    const response = await request.post("/api/admin", { headers, data: { action, ...data } });
    const payload = await response.json().catch(() => null);
    expect(response.status(), `${action} returned 5xx`).toBeLessThan(500);
    expect(payload, `${action} returned non-JSON`).toBeTruthy();
    return { response, payload };
  }

  function expectAllowed(result, action) {
    expect(result.response.status(), `${action} was unexpectedly denied: ${JSON.stringify(result.payload)}`).toBeLessThan(400);
    expect(result.payload.error, `${action} returned an error`).toBeUndefined();
  }

  function expectDenied(result, action) {
    const status = Number(result.payload.status || result.response.status());
    expect(status, `${action} unexpectedly returned success`).toBeGreaterThanOrEqual(400);
    expect([400, 403, 404, 409, 428]).toContain(status);
    expect(result.payload.error, `${action} did not return a safe denial`).toBeTruthy();
  }

  async function projectTaskIds(projectId) {
    const result = await getAction("project-tasks-list", { projectId });
    expectAllowed(result, `project-tasks-list ${projectId}`);
    return Object.fromEntries((result.payload.tasks || []).map((task) => [task.id, task]));
  }

  const explicit = [
    ["projects-qa-viewer", "viewer"],
    ["projects-qa-contributor", "contributor"],
    ["projects-qa-manager", "manager"],
    ["projects-qa-admin", "project-admin"],
  ];
  for (const [projectId, role] of explicit) {
    const project = await getAction("project-get", { projectId });
    expectAllowed(project, `project-get ${role}`);
    expect(project.payload.role).toBe(role);
    expect(project.payload.project?.id).toBe(projectId);
    const columns = await getAction("project-columns-list", { projectId });
    expectAllowed(columns, `project-columns-list ${role}`);
    const tasks = await projectTaskIds(projectId);
    const ownTask = tasks[`${projectId}-own-task`];
    const otherTask = tasks[`${projectId}-other-task`];
    expect(ownTask?.id).toBeTruthy();
    expect(otherTask?.id).toBeTruthy();

    const create = await postAction("project-tasks-create", {
      projectId, title: `role-matrix-${role}`, columnId: `${projectId}-inbox`, statusCategory: "inbox",
    });
    if (role === "viewer") expectDenied(create, `task create ${role}`);
    else expectAllowed(create, `task create ${role}`);

    const ownUpdate = await postAction("project-task-update", { id: ownTask.id, expectedRevision: ownTask.revision, title: `${role} own updated` });
    if (role === "viewer") expectDenied(ownUpdate, `own task update ${role}`);
    else expectAllowed(ownUpdate, `own task update ${role}`);

    const otherUpdate = await postAction("project-task-update", { id: otherTask.id, expectedRevision: otherTask.revision, title: `${role} other updated` });
    if (["manager", "project-admin"].includes(role)) expectAllowed(otherUpdate, `other task update ${role}`);
    else expectDenied(otherUpdate, `other task update ${role}`);

    const comment = await postAction("project-task-comment", { taskId: ownTask.id, body: `${role} role comment` });
    if (role === "viewer") expectDenied(comment, `comment ${role}`);
    else expectAllowed(comment, `comment ${role}`);

    const column = await postAction("project-column-create", { projectId, name: `${role} column`, statusCategory: "inbox", position: 99 });
    if (["manager", "project-admin"].includes(role)) expectAllowed(column, `column create ${role}`);
    else expectDenied(column, `column create ${role}`);

    const revision = Number(project.payload.project?.revision || 1);
    const projectUpdate = await postAction("project-update", { projectId, expectedRevision: revision, description: `Role matrix ${role}` });
    if (role === "project-admin") expectAllowed(projectUpdate, `project update ${role}`);
    else expectDenied(projectUpdate, `project update ${role}`);

    const memberUpdate = await postAction("project-member-update", { projectId, member: { email: actorEmail, role } });
    if (role === "project-admin") expectAllowed(memberUpdate, `member update ${role}`);
    else expectDenied(memberUpdate, `member update ${role}`);
  }

  for (const [projectId, visibility, expectedTitles] of [
    ["projects-qa-assigned", "assigned", ["contributor assigned task"]],
    ["projects-qa-own", "own", ["contributor own task", "contributor assigned task"]],
  ]) {
    const tasks = await projectTaskIds(projectId);
    const visibleTitles = Object.values(tasks).map((task) => task.title).sort();
    expect(visibleTitles, `${visibility} task visibility leaked hidden tasks`).toEqual(expectedTitles.slice().sort());
    const hidden = await getAction("project-task-get", { id: `${projectId}-other-task` });
    expectDenied(hidden, `hidden ${visibility} task get`);
  }

  const workspaceRoles = [
    ["viewer", false, false],
    ["member", true, false],
    ["admin", true, true],
    ["owner", true, true],
  ];
  for (const [role, canCreateTasks, canManageProjects] of workspaceRoles) {
    const workspaceId = `projects-qa-ws-${role}`;
    const projectId = `projects-qa-project-${role}`;
    const workspace = await getAction("project-workspace-get", { workspaceId });
    expectAllowed(workspace, `workspace get ${role}`);
    expect(workspace.payload.role).toBe(role);
    const project = await getAction("project-get", { projectId });
    expectAllowed(project, `workspace project get ${role}`);
    expect(project.payload.project?.workspaceId).toBe(workspaceId);
    const task = await postAction("project-tasks-create", { projectId, title: `workspace-${role}-task`, columnId: `${projectId}-inbox`, statusCategory: "inbox" });
    if (canCreateTasks) expectAllowed(task, `workspace task create ${role}`);
    else expectDenied(task, `workspace task create ${role}`);
    const revision = Number(project.payload.project?.revision || 1);
    const update = await postAction("project-update", { projectId, expectedRevision: revision, description: `Workspace role ${role}` });
    if (canManageProjects) expectAllowed(update, `workspace project update ${role}`);
    else expectDenied(update, `workspace project update ${role}`);
    const members = await getAction("project-workspace-members-list", { workspaceId });
    expectAllowed(members, `workspace members ${role}`);
    if (role === "viewer" || role === "member") expect(members.payload.members?.some((member) => member.user?.email === actorEmail)).toBe(true);
  }

  const uninvited = await getAction("project-get", { projectId: "projects-qa-project-uninvited" });
  expectDenied(uninvited, "uninvited project get");
  const uninvitedWorkspace = await getAction("project-workspace-get", { workspaceId: "projects-qa-ws-uninvited" });
  expectDenied(uninvitedWorkspace, "uninvited workspace get");

  const routeFailures = [];
  for (const projectId of ["projects-qa-viewer", "projects-qa-contributor", "projects-qa-manager", "projects-qa-admin"]) {
    const response = await page.goto(`/dashboard/workspace/projects-qa-role-projects/project/${projectId}/board`, { waitUntil: "domcontentloaded" });
    if (!response || response.status() >= 500) routeFailures.push(`${projectId}: ${response?.status()}`);
    await expect(page).not.toHaveURL(/\/auth\/sign-in/);
    await expect(page.locator("body")).not.toContainText(/Application error|Failed to fetch instance status/i);
    await expect.poll(() => page.evaluate(() => document.body.innerText.length)).toBeGreaterThan(40);
  }
  expect(routeFailures, routeFailures.join("\n")).toEqual([]);
});
