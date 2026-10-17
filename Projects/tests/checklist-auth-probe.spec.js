import { test, expect } from "@playwright/test";

const liveFixtureEnabled = process.env.PROJECTS_LIVE_AUTH === "1";
test.skip(!liveFixtureEnabled, "Set PROJECTS_LIVE_AUTH=1 when local Maps and Projects services are running.");
test.use({ storageState: process.env.PROJECTS_AUTH_STATE || "Projects/tests/.auth/user.json" });

test("authenticated Projects local fixture can open the seeded workspace", async ({ page }) => {
  const errors = [];
  let openedSockets = 0;
  const pendingResponseReads = [];
  page.on("websocket", (socket) => { if (socket.url().includes("/api/ws/")) openedSockets += 1; });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  const responseFailures = [];
  page.on("response", (response) => {
    if (response.status() >= 500) {
      const url = new URL(response.url());
      url.search = "";
      responseFailures.push(`${response.status()} ${url}`);
      pendingResponseReads.push(response.text().then((body) => {
        if (body) responseFailures.push(`body: ${body.slice(0, 160)}`);
      }).catch(() => {}));
    }
  });

  await page.goto("/dashboard/workspace/workspace-default", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/auth\/sign-in/);
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("Failed to fetch instance status");
  await expect.poll(() => page.evaluate(() => document.body.innerText.length)).toBeGreaterThan(100);
  await expect.poll(() => openedSockets).toBeGreaterThan(0);
  await Promise.allSettled(pendingResponseReads);
  expect(errors, errors.join("\n")).toEqual([]);
  expect(responseFailures, responseFailures.join("\n")).toEqual([]);
});

test("authenticated Projects local fixture can open a project board and realtime channel", async ({ page }) => {
  const errors = [];
  let openedSockets = 0;
  const pendingResponseReads = [];
  page.on("websocket", (socket) => { if (socket.url().includes("/api/ws/")) openedSockets += 1; });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  const responseFailures = [];
  page.on("response", (response) => {
    if (response.status() >= 500) {
      const url = new URL(response.url());
      url.search = "";
      responseFailures.push(`${response.status()} ${url}`);
      pendingResponseReads.push(response.text().then((body) => {
        if (body) responseFailures.push(`body: ${body.slice(0, 160)}`);
      }).catch(() => {}));
    }
  });

  await page.goto("/dashboard/workspace/workspace-default/project/project-admin-operations/board", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/auth\/sign-in/);
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect.poll(() => page.evaluate(() => document.body.innerText.length)).toBeGreaterThan(100);
  await expect.poll(() => openedSockets).toBeGreaterThan(0);
  await Promise.allSettled(pendingResponseReads);
  expect(errors, errors.join("\n")).toEqual([]);
  expect(responseFailures, responseFailures.join("\n")).toEqual([]);
});

const LIVE_ROUTES = [
  "/dashboard",
  "/dashboard/workspace/workspace-default",
  "/dashboard/workspace/workspace-default/inbox",
  "/dashboard/workspace/workspace-default/my-tasks",
  "/dashboard/workspace/workspace-default/members",
  "/dashboard/workspace/workspace-default/projects",
  "/dashboard/workspace/workspace-default/search",
  "/dashboard/workspace/workspace-default/timeline",
  "/dashboard/workspace/workspace-default/project/project-admin-operations",
  "/dashboard/workspace/workspace-default/project/project-admin-operations/board",
  "/dashboard/workspace/workspace-default/project/project-admin-operations/backlog",
  "/dashboard/workspace/workspace-default/project/project-admin-operations/calendar",
  "/dashboard/workspace/workspace-default/project/project-admin-operations/gantt",
  "/dashboard/settings/account/information",
  "/dashboard/settings/account/preferences",
  "/dashboard/settings/account/security",
  "/dashboard/settings/account/notifications",
  "/dashboard/settings/workspace/general",
  "/dashboard/settings/workspace/labels",
  "/dashboard/settings/workspace/roles",
  "/dashboard/settings/workspace/import",
  "/dashboard/settings/workspace/billing",
  "/dashboard/settings/projects/project-admin-operations/general",
  "/dashboard/settings/projects/project-admin-operations/workflow",
  "/dashboard/settings/projects/project-admin-operations/custom-fields",
  "/dashboard/settings/projects/project-admin-operations/visibility",
  "/dashboard/settings/projects/project-admin-operations/calendar",
  "/dashboard/settings/projects/project-admin-operations/integrations",
];

test("authenticated Projects supported route matrix has no blank/error surfaces", async ({ page }) => {
  test.setTimeout(180_000);
  const failures = [];
  const pendingResponseReads = [];
  let currentRoute = "";
  page.on("pageerror", (error) => failures.push(`${currentRoute} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`${currentRoute} console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      const url = new URL(response.url());
      url.search = "";
      failures.push(`${currentRoute} ${response.status()} ${url}`);
      pendingResponseReads.push(response.text().then((body) => {
        if (body) failures.push(`${currentRoute} body: ${body.slice(0, 160)}`);
      }).catch(() => {}));
    }
  });

  for (const route of LIVE_ROUTES) {
    currentRoute = route;
    console.log(`checking ${route}`);
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} did not render`).toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/auth\/sign-in/);
    await expect.poll(() => page.evaluate(() => document.body.innerText.length)).toBeGreaterThan(40);
    const body = await page.locator("body").innerText();
    expect(body, `${route} rendered an application error`).not.toMatch(/Application error|Failed to fetch instance status/i);
    if (test.info().project.name === "mobile") {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${route} overflows horizontally`).toBe(true);
    }
  }

  await Promise.allSettled(pendingResponseReads);
  expect(failures, failures.join("\n")).toEqual([]);
});

test("authenticated Projects read-action matrix returns valid envelopes", async ({ page, request }) => {
  test.setTimeout(90_000);
  const sockets = [];
  page.on("websocket", (socket) => { if (socket.url().includes("/api/ws/")) sockets.push(socket); });
  await page.goto("/dashboard/workspace/workspace-default/project/project-admin-operations/board", { waitUntil: "domcontentloaded" });
  await expect.poll(() => sockets.some((socket) => !socket.isClosed())).toBe(true);
  const liveSocket = sockets.find((socket) => !socket.isClosed());
  const token = new URL(liveSocket.url()).searchParams.get("token") || "";
  expect(token).not.toBe("");
  const projectId = "project-admin-operations";
  const workspaceId = "workspace-default";
  async function getAction(action, query = {}) {
    const params = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])) });
    const response = await request.get(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => null);
    expect(response.status(), `${action} returned a transport error`).toBeLessThan(500);
    expect(payload, `${action} returned invalid JSON`).toBeTruthy();
    expect(payload.error, `${action} returned ${payload.error || "an unknown error"}`).toBeUndefined();
    return payload;
  }

  const projects = await getAction("project-list");
  expect(Array.isArray(projects.projects)).toBe(true);
  const project = (projects.projects || []).find((item) => item.id === projectId) || {};
  const tasks = await getAction("project-tasks-list", { projectId });
  expect(Array.isArray(tasks.tasks)).toBe(true);
  const task = tasks.tasks[0];

  const projectReads = [
    ["project-search", { workspaceId, query: "task" }],
    ["project-get", { projectId }],
    ["project-summary", { projectId }],
    ["project-milestones-list", { projectId }],
    ["project-members-list", { projectId }],
    ["project-columns-list", { projectId }],
    ["project-labels-list", { projectId }],
    ["project-saved-views-list", { projectId }],
    ["project-custom-fields-list", { projectId }],
    ["project-custom-field-values-list", { projectId }],
    ["project-custom-field-filter-values-list", { projectId }],
    ["project-task-templates-list", { projectId }],
    ["project-workspace-get", { workspaceId }],
    ["project-workspace-members-list", { workspaceId }],
    ["project-workspace-invitations-list", { workspaceId }],
    ["project-member-directory", { workspaceId, query: "" }],
    ["project-workspace-roles-list", { workspaceId }],
    ["project-workspace-capabilities", { workspaceId }],
    ["project-workspace-permission-check", { organizationId: workspaceId, permissions: JSON.stringify({ operations: ["read"] }) }],
    ["project-notifications-list"],
    ["project-notification-preferences-get"],
  ];
  for (const [action, query] of projectReads) await getAction(action, query);

  if (task?.id) {
    const taskReads = [
      ["project-task-get", { id: task.id }],
      ["project-task-comments-list", { taskId: task.id }],
      ["project-task-activity", { taskId: task.id }],
      ["project-relations-list", { taskId: task.id }],
      ["project-task-links-list", { taskId: task.id }],
      ["project-task-time-list", { taskId: task.id }],
      ["project-task-attachments-list", { taskId: task.id }],
      ["project-task-watchers-list", { taskId: task.id }],
    ];
    for (const [action, query] of taskReads) await getAction(action, query);
  }

  expect(project.key || project.id).toBeTruthy();
});

test("authenticated Projects action boundary matrix rejects malformed requests safely", async ({ page, request }) => {
  test.setTimeout(120_000);
  const sockets = [];
  page.on("websocket", (socket) => { if (socket.url().includes("/api/ws/")) sockets.push(socket); });
  await page.goto("/dashboard/workspace/workspace-default/project/project-admin-operations/board", { waitUntil: "domcontentloaded" });
  await expect.poll(() => sockets.some((socket) => !socket.isClosed())).toBe(true);
  const liveSocket = sockets.find((socket) => !socket.isClosed());
  const token = new URL(liveSocket.url()).searchParams.get("token") || "";
  expect(token).not.toBe("");
  const headers = { Authorization: `Bearer ${token}` };
  const projectId = "project-admin-operations";
  const workspaceId = "workspace-default";
  const project = await request.get(`/api/admin?action=project-get&projectId=${projectId}`, { headers }).then((response) => response.json());
  const taskList = await request.get(`/api/admin?action=project-tasks-list&projectId=${projectId}`, { headers }).then((response) => response.json());
  const taskId = taskList.tasks?.[0]?.id || "missing-task";
  const ticketId = `${project.project?.key || "missing"}-999999`;
  const invalidProjectId = "projects-qa-invalid-id";
  const invalidTaskId = "tasks-qa-invalid-id";

  const readCases = [
    ["project-workspace-list", {}],
    ["project-workspace-get", { workspaceId }],
    ["project-workspace-members-list", { workspaceId }],
    ["project-workspace-invitations-list", { workspaceId }],
    ["project-member-directory", { workspaceId, query: "" }],
    ["project-invitation-get", { invitationId: "missing-invitation" }],
    ["project-workspace-roles-list", { workspaceId }],
    ["project-workspace-capabilities", { workspaceId }],
    ["project-workspace-permission-check", { organizationId: workspaceId, permissions: "not-json" }],
    ["project-list", {}],
    ["project-search", { workspaceId, query: "<invalid>" }],
    ["project-get", { projectId }],
    ["project-summary", { projectId }],
    ["project-tasks-list", { projectId }],
    ["project-task-get", { id: taskId }],
    ["project-task-by-ticket", { ticketId, workspaceSlug: "workspace-default" }],
    ["project-milestones-list", { projectId }],
    ["project-task-comments-list", { taskId }],
    ["project-task-activity", { taskId }],
    ["project-members-list", { projectId }],
    ["project-columns-list", { projectId }],
    ["project-relations-list", { taskId }],
    ["project-labels-list", { projectId }],
    ["project-task-links-list", { taskId }],
    ["project-saved-views-list", { projectId }],
    ["project-task-time-list", { taskId }],
    ["project-task-attachments-list", { taskId }],
    ["project-task-attachment-get", { id: "missing-attachment" }],
    ["project-custom-fields-list", { projectId }],
    ["project-custom-field-values-list", { projectId }],
    ["project-custom-field-filter-values-list", { projectId }],
    ["project-task-watchers-list", { taskId }],
    ["project-notifications-list", {}],
    ["project-notification-preferences-get", {}],
    ["project-task-templates-list", { projectId }],
    ["project-webhooks-list", { projectId }],
    ["project-get", { projectId: invalidProjectId }],
    ["project-task-get", { id: invalidTaskId }],
  ];
  const postCases = [
    ["project-workspace-update", { workspaceId: invalidProjectId }],
    ["project-workspace-delete", { workspaceId: invalidProjectId }],
    ["project-workspace-member-update", { workspaceId: invalidProjectId, member: { email: "invalid" } }],
    ["project-workspace-member-remove", { workspaceId: invalidProjectId, email: "missing@example.com" }],
    ["project-workspace-role-create", { workspaceId: invalidProjectId, role: "" }],
    ["project-workspace-role-update", { workspaceId: invalidProjectId, roleName: "missing", permission: {} }],
    ["project-workspace-role-delete", { workspaceId: invalidProjectId, roleName: "missing" }],
    ["project-invitation-accept", { invitationId: "missing-invitation" }],
    ["project-invitation-cancel", { invitationId: "missing-invitation" }],
    ["project-update", { projectId: invalidProjectId, expectedRevision: 1, name: "invalid" }],
    ["project-archive", { projectId: invalidProjectId, expectedRevision: 1 }],
    ["project-tasks-create", { projectId: invalidProjectId, title: "invalid" }],
    ["project-task-update", { id: invalidTaskId, expectedRevision: 1, title: "invalid" }],
    ["project-task-assign", { id: invalidTaskId, expectedRevision: 1, assigneeEmail: "missing@example.com" }],
    ["project-task-delete", { id: invalidTaskId, expectedRevision: 1 }],
    ["project-tasks-bulk", { taskIds: [], idempotencyKey: "boundary-empty" }],
    ["project-task-comment", { taskId: invalidTaskId, body: "invalid" }],
    ["project-task-comment-update", { id: "missing-comment", body: "invalid" }],
    ["project-task-comment-delete", { id: "missing-comment" }],
    ["project-task-duplicate", { id: invalidTaskId }],
    ["project-milestone-create", { projectId: invalidProjectId, name: "invalid" }],
    ["project-milestone-update", { id: "missing-milestone", expectedRevision: 1, name: "invalid" }],
    ["project-milestone-delete", { id: "missing-milestone", expectedRevision: 1 }],
    ["project-member-update", { projectId: invalidProjectId, member: { email: "missing@example.com", role: "viewer" } }],
    ["project-member-remove", { projectId: invalidProjectId, email: "missing@example.com" }],
    ["project-column-create", { projectId: invalidProjectId, name: "invalid" }],
    ["project-column-update", { id: "missing-column", name: "invalid" }],
    ["project-column-delete", { id: "missing-column" }],
    ["project-relation-create", { taskId: invalidTaskId, relatedTaskId: invalidTaskId, relationType: "relates_to" }],
    ["project-relation-delete", { taskId: invalidTaskId, relatedTaskId: invalidTaskId, relationType: "relates_to" }],
    ["project-task-link-save", { taskId: invalidTaskId, url: "javascript:alert(1)" }],
    ["project-task-link-delete", { taskId: invalidTaskId, id: "missing-link" }],
    ["project-label-save", { projectId: invalidProjectId, name: "invalid" }],
    ["project-label-attach", { taskId: invalidTaskId, labelId: "missing-label" }],
    ["project-label-detach", { taskId: invalidTaskId, labelId: "missing-label" }],
    ["project-label-delete", { projectId: invalidProjectId, id: "missing-label" }],
    ["project-saved-view-save", { projectId: invalidProjectId, name: "invalid" }],
    ["project-saved-view-delete", { id: "missing-view" }],
    ["project-task-time-save", { taskId: invalidTaskId, startedAt: "not-a-date" }],
    ["project-task-attachment-upload", { taskId: invalidTaskId, fileName: "invalid", mimeType: "text/plain", contentBase64: "aW52YWxpZA==" }],
    ["project-task-attachment-delete", { id: "missing-attachment" }],
    ["project-custom-field-save", { projectId: invalidProjectId, name: "invalid", type: "unknown" }],
    ["project-custom-field-delete", { id: "missing-field" }],
    ["project-task-custom-value-save", { taskId: invalidTaskId, fieldId: "missing-field", value: "invalid" }],
    ["project-task-watcher-update", { taskId: invalidTaskId, email: "missing@example.com" }],
    ["project-notifications-read", { id: "missing-notification" }],
    ["project-notification-preferences-update", { emailEnabled: "invalid" }],
    ["project-notification-workspace-rule-upsert", { workspaceId: invalidProjectId, projectMode: "invalid" }],
    ["project-notification-workspace-rule-delete", { workspaceId: invalidProjectId }],
    ["project-task-template-save", { projectId: invalidProjectId, name: "invalid" }],
    ["project-task-template-delete", { id: "missing-template" }],
    ["project-task-from-template", { templateId: "missing-template", title: "invalid" }],
    ["project-webhook-save", { projectId: invalidProjectId, url: "http://127.0.0.1:8788/private" }],
    ["project-webhook-delete", { id: "missing-webhook" }],
  ];

  async function assertSafeResponse(response, action) {
    const payload = await response.json().catch(() => null);
    expect(response.status(), `${action} returned an unexpected 5xx`).toBeLessThan(500);
    expect(payload, `${action} did not return JSON`).toBeTruthy();
    const serialized = JSON.stringify(payload);
    expect(serialized, `${action} leaked a stack trace`).not.toMatch(/at (?:file|node:)|SQLITE_ERROR|D1_ERROR/i);
    expect(serialized, `${action} leaked a token or secret`).not.toMatch(/Bearer\s|refreshToken|secret_ciphertext|apiKey/i);
    if (response.status() >= 400) expect([400, 401, 403, 404, 409, 428, 501, 503]).toContain(response.status());
  }

  for (const [action, query] of readCases) {
    const params = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])) });
    await assertSafeResponse(await request.get(`/api/admin?${params}`, { headers }), action);
  }
  for (const [action, data] of postCases) {
    await assertSafeResponse(await request.post("/api/admin", { headers, data: { action, ...data } }), action);
  }
});

test("authenticated Projects mutation matrix exercises task, metadata, settings, and cleanup flows", async ({ page, request }) => {
  test.setTimeout(180_000);
  const sockets = [];
  page.on("websocket", (socket) => { if (socket.url().includes("/api/ws/")) sockets.push(socket); });
  await page.goto("/dashboard/workspace/workspace-default/project/project-admin-operations/board", { waitUntil: "domcontentloaded" });
  await expect.poll(() => sockets.some((socket) => !socket.isClosed())).toBe(true);
  const liveSocket = sockets.find((socket) => !socket.isClosed());
  const token = new URL(liveSocket.url()).searchParams.get("token") || "";
  expect(token).not.toBe("");

  async function postAction(action, data = {}) {
    const response = await request.post("/api/admin", {
      headers: { Authorization: `Bearer ${token}` },
      data: { action, ...data },
    });
    const payload = await response.json().catch(() => null);
    expect(response.status(), `${action} returned a transport error`).toBeLessThan(500);
    expect(payload, `${action} returned invalid JSON`).toBeTruthy();
    return payload;
  }
  async function expectSuccess(action, data = {}) {
    const payload = await postAction(action, data);
    expect(payload.error, `${action} returned ${payload.error || "an unknown error"}`).toBeUndefined();
    expect(payload.success, `${action} did not report success`).toBe(true);
    return payload;
  }
  async function expectDenied(action, data = {}) {
    const payload = await postAction(action, data);
    expect(payload.error, `${action} unexpectedly succeeded`).toBeTruthy();
    expect([400, 403, 404, 409, 428], `${action} returned an unexpected denial status`).toContain(payload.status);
    return payload;
  }
  async function getAction(action, query = {}) {
    const params = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])) });
    const response = await request.get(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => null);
    expect(response.status(), `${action} returned a transport error`).toBeLessThan(500);
    expect(payload?.error, `${action} returned ${payload?.error || "an unknown error"}`).toBeUndefined();
    return payload;
  }
  function claimsFromToken(value) {
    try { return JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8")); } catch { return {}; }
  }

  const claims = claimsFromToken(token);
  const actorEmail = String(claims.email || "").toLowerCase();
  const actorUid = String(claims.user_id || claims.uid || claims.sub || "");
  const projectId = "project-admin-operations";
  const projectList = await getAction("project-list");
  const projects = projectList.projects || [];
  const requestedProject = projects.find((item) => item.id === projectId);
  expect(requestedProject, "seeded project is not visible to the authenticated fixture").toBeTruthy();
  const baseProject = await getAction("project-get", { projectId });
  const createdTaskIds = [];
  const createdLabelIds = [];
  const createdViewIds = [];
  const createdFieldIds = [];
  const createdMilestoneIds = [];
  const createdColumnIds = [];
  const createdTemplateIds = [];
  const createdWebhookIds = [];
  let createdProjectId = "";
  let targetProjectId = "";
  let targetWorkspace;
  let inboxColumn;
  const timestamp = Date.now();
  const unique = (label) => `live-${label}-${timestamp}`;

  try {
    // Create a throwaway project owned by the authenticated fixture so the
    // same live run covers manager-only settings and can clean up by API.
    const createdProject = await expectSuccess("project-create", {
      workspaceId: baseProject.project.workspaceId,
      name: unique("manager-project"),
      key: `LIVE${timestamp}`,
      description: "Temporary project for the authenticated checklist matrix",
      visibility: "workspace",
    });
    createdProjectId = createdProject.project.id;
    targetProjectId = createdProjectId;
    targetWorkspace = await getAction("project-get", { projectId: targetProjectId });
    expect(["manager", "project-admin"]).toContain(targetWorkspace.role);
    const columns = targetWorkspace.columns || [];
    inboxColumn = columns.find((column) => column.statusCategory === "inbox") || columns[0];
    expect(inboxColumn, "temporary manager project has no usable column").toBeTruthy();

    // Task CRUD, optimistic concurrency, field validation, and task duplication.
    const created = await expectSuccess("project-tasks-create", {
      projectId: targetProjectId,
      title: unique("task"),
      description: "Authenticated live checklist task",
      priority: "high",
      statusCategory: inboxColumn.statusCategory,
      columnId: inboxColumn.id,
      position: 900000,
      startAt: "2026-10-17T09:00:00.000Z",
      dueAt: "2026-10-18T09:00:00.000Z",
    });
    const task = created.task;
    expect(task?.id).toBeTruthy();
    createdTaskIds.push(task.id);
    expect((await postAction("project-task-update", { id: task.id, expectedRevision: task.revision + 1, title: unique("stale") })).status).toBe(409);
    const updated = await expectSuccess("project-task-update", {
      id: task.id,
      expectedRevision: task.revision,
      title: unique("updated"),
      description: "Updated through the live API matrix",
      priority: "urgent",
      statusCategory: inboxColumn.statusCategory,
      position: 900001,
      startAt: "2026-10-17T10:00:00.000Z",
      dueAt: "2026-10-19T10:00:00.000Z",
    });
    expect(updated.task.priority).toBe("urgent");
    expect((await postAction("project-task-update", { id: task.id, expectedRevision: updated.task.revision, priority: "not-a-priority" })).status).toBe(400);

    const comment = await expectSuccess("project-task-comment", { taskId: task.id, body: unique("comment") });
    expect(comment.comment?.id).toBeTruthy();
    await expectSuccess("project-task-comment-update", { id: comment.comment.id, body: unique("comment-updated") });
    await expectSuccess("project-task-comment-delete", { id: comment.comment.id });

    const duplicate = await expectSuccess("project-task-duplicate", { id: task.id, title: unique("duplicate") });
    expect(duplicate.task?.id).toBeTruthy();
    createdTaskIds.push(duplicate.task.id);

    const link = await expectSuccess("project-task-link-save", {
      taskId: task.id,
      url: "https://example.com/projects-live-check",
      title: unique("link"),
      resourceType: "url",
      externalId: unique("external"),
    });
    await expectSuccess("project-task-link-delete", { taskId: task.id, id: link.link.id });

    const time = await expectSuccess("project-task-time-save", {
      taskId: task.id,
      startedAt: "2026-10-17T09:00:00.000Z",
      endedAt: "2026-10-17T09:45:00.000Z",
      durationMinutes: 45,
      note: unique("time"),
    });
    expect(Number(time.entry.duration_minutes)).toBe(45);
    const timeList = await getAction("project-task-time-list", { taskId: task.id });
    expect(timeList.entries.some((entry) => entry.id === time.entry.id)).toBe(true);

    const actorMember = (await getAction("project-members-list", { projectId: targetProjectId })).members?.find((member) => member.email?.toLowerCase() === actorEmail);
    const watcherEmail = actorEmail || actorMember?.email;
    const watcherUid = actorUid || actorMember?.userUid || "";
    if (watcherEmail) {
      await expectSuccess("project-task-watcher-update", { taskId: task.id, email: watcherEmail, userUid: watcherUid });
      const watchers = await getAction("project-task-watchers-list", { taskId: task.id });
      expect(watchers.watchers.some((watcher) => watcher.email?.toLowerCase() === watcherEmail)).toBe(true);
      await expectSuccess("project-task-watcher-update", { taskId: task.id, email: watcherEmail, userUid: watcherUid, remove: true });
    }

    // Personal saved views are contributor-safe; shared views and project metadata are manager-only.
    const view = await expectSuccess("project-saved-view-save", {
      projectId: targetProjectId,
      name: unique("view"),
      viewType: "board",
      filters: { priority: ["urgent"] },
      sort: { field: "position", direction: "asc" },
      shared: false,
    });
    createdViewIds.push(view.view.id);
    await expectSuccess("project-saved-view-delete", { id: view.view.id });
    createdViewIds.length = 0;

    const labels = await getAction("project-labels-list", { projectId: targetProjectId });
    let labelId = labels.labels?.[0]?.id;
    {
      const label = await expectSuccess("project-label-save", { projectId: targetProjectId, name: unique("label"), color: "#c46b28" });
      labelId = label.label.id;
      createdLabelIds.push(labelId);
    }
    if (labelId) {
      await expectSuccess("project-label-attach", { taskId: task.id, labelId });
      const taskWithLabel = await getAction("project-task-get", { id: task.id });
      expect(taskWithLabel.labels.some((label) => label.id === labelId)).toBe(true);
      await expectSuccess("project-label-detach", { taskId: task.id, labelId });
    }

    const notificationPreferences = await getAction("project-notification-preferences-get");
    await postAction("project-notification-preferences-update", { emailEnabled: !notificationPreferences.emailEnabled });
    const toggledPreferences = await getAction("project-notification-preferences-get");
    expect(toggledPreferences.emailEnabled).toBe(!notificationPreferences.emailEnabled);
    await postAction("project-notification-preferences-update", { emailEnabled: notificationPreferences.emailEnabled });
    const originalRule = (notificationPreferences.workspaces || []).find((rule) => rule.workspaceId === targetWorkspace.project.workspaceId);
    await postAction("project-notification-workspace-rule-upsert", {
      workspaceId: targetWorkspace.project.workspaceId,
      isActive: true,
      emailEnabled: false,
      ntfyEnabled: false,
      gotifyEnabled: false,
      webhookEnabled: false,
      projectMode: "selected",
      selectedProjectIds: [targetProjectId],
    });
    if (originalRule) {
      await postAction("project-notification-workspace-rule-upsert", {
        workspaceId: originalRule.workspaceId,
        isActive: originalRule.isActive,
        emailEnabled: originalRule.emailEnabled,
        ntfyEnabled: originalRule.ntfyEnabled,
        gotifyEnabled: originalRule.gotifyEnabled,
        webhookEnabled: originalRule.webhookEnabled,
        projectMode: originalRule.projectMode,
        selectedProjectIds: originalRule.selectedProjectIds,
      });
    } else {
      await postAction("project-notification-workspace-rule-delete", { workspaceId: targetWorkspace.project.workspaceId });
    }

    const notifications = await getAction("project-notifications-list");
    if (notifications.notifications?.[0]?.id) {
      const notification = notifications.notifications[0];
      await expectSuccess("project-notifications-read", { id: notification.id });
      if (!notification.read_at) await expectSuccess("project-notifications-read", { id: notification.id, unread: true });
    } else {
      await expectSuccess("project-notifications-read", { id: unique("missing-notification") });
    }

    {
      // Manager-only project settings and metadata.
      const project = (await getAction("project-get", { projectId: targetProjectId })).project;
      const changedProject = await expectSuccess("project-update", {
        projectId: targetProjectId,
        expectedRevision: project.revision,
        description: `${project.description || ""} live-check`,
      });
      await expectSuccess("project-update", {
        projectId: targetProjectId,
        expectedRevision: changedProject.project.revision,
        description: project.description || "",
      });

      const milestone = await expectSuccess("project-milestone-create", { projectId: targetProjectId, name: unique("milestone"), startAt: "2026-10-20", dueAt: "2026-10-21" });
      createdMilestoneIds.push(milestone.milestone.id);
      const changedMilestone = await expectSuccess("project-milestone-update", { id: milestone.milestone.id, expectedRevision: milestone.milestone.revision || 1, name: unique("milestone-updated"), status: "active" });
      await expectSuccess("project-milestone-delete", { id: milestone.milestone.id, expectedRevision: changedMilestone.milestone.revision || 2 });
      createdMilestoneIds.length = 0;

      const column = await expectSuccess("project-column-create", { projectId: targetProjectId, name: unique("column"), statusCategory: "blocked", position: 900010 });
      createdColumnIds.push(column.column.id);
      const changedColumn = await expectSuccess("project-column-update", { id: column.column.id, name: unique("column-updated"), statusCategory: "in_progress", position: 900011 });
      expect(changedColumn.column.statusCategory).toBe("in_progress");
      await expectSuccess("project-column-delete", { id: column.column.id });
      createdColumnIds.length = 0;

      const field = await expectSuccess("project-custom-field-save", { projectId: targetProjectId, name: unique("field"), type: "select", options: ["alpha", "beta"], position: 900020 });
      createdFieldIds.push(field.field.id);
      await expectSuccess("project-task-custom-value-save", { taskId: task.id, fieldId: field.field.id, value: "alpha" });
      const fieldValues = await getAction("project-custom-field-values-list", { projectId: targetProjectId });
      expect(fieldValues.values.some((value) => value.taskId === task.id && value.fieldId === field.field.id)).toBe(true);
      const filterValues = await getAction("project-custom-field-filter-values-list", { projectId: targetProjectId });
      expect(filterValues.values.some((value) => value.fieldId === field.field.id && value.values.includes("alpha"))).toBe(true);
      await expectSuccess("project-custom-field-delete", { id: field.field.id });
      createdFieldIds.length = 0;

      const template = await expectSuccess("project-task-template-save", { projectId: targetProjectId, name: unique("template"), description: "Live template", payload: { priority: "low", statusCategory: inboxColumn.statusCategory } });
      createdTemplateIds.push(template.template.id);
      const fromTemplate = await expectSuccess("project-task-from-template", { templateId: template.template.id, title: unique("template-task") });
      createdTaskIds.push(fromTemplate.task.id);
      await expectSuccess("project-task-template-delete", { id: template.template.id });
      createdTemplateIds.length = 0;

      const webhookInvalid = await postAction("project-webhook-save", { projectId: targetProjectId, url: "http://127.0.0.1:8788/internal-webhook" });
      expect(webhookInvalid.status).toBe(400);
      const webhook = await expectSuccess("project-webhook-save", { projectId: targetProjectId, url: "https://example.com/projects-live-webhook", eventTypes: ["task.created", "task.updated"], active: true });
      createdWebhookIds.push(webhook.webhook.id);
      const webhookList = await getAction("project-webhooks-list", { projectId: targetProjectId });
      expect(webhookList.webhooks.some((item) => item.id === webhook.webhook.id)).toBe(true);
      await expectSuccess("project-webhook-delete", { id: webhook.webhook.id });
      createdWebhookIds.length = 0;

      const attachment = await postAction("project-task-attachment-upload", { taskId: task.id, fileName: "live-check.txt", mimeType: "text/plain", contentBase64: Buffer.from("projects live attachment").toString("base64") });
      if (attachment.success) {
        expect(attachment.attachment?.id).toBeTruthy();
        const attachmentList = await getAction("project-task-attachments-list", { taskId: task.id });
        expect(attachmentList.attachments.some((item) => item.id === attachment.attachment.id)).toBe(true);
        const attachmentContent = await getAction("project-task-attachment-get", { id: attachment.attachment.id });
        expect(attachmentContent.contentBase64).toBeTruthy();
        await expectSuccess("project-task-attachment-delete", { id: attachment.attachment.id });
      } else {
        expect(attachment.status).toBe(503);
      }
    }

    // Relations require two visible tasks and are cleaned up before task cleanup.
    await expectSuccess("project-relation-create", { taskId: task.id, relatedTaskId: duplicate.task.id, relationType: "relates_to" });
    await expectSuccess("project-relation-delete", { taskId: task.id, relatedTaskId: duplicate.task.id, relationType: "relates_to" });
  } finally {
    for (const id of createdWebhookIds) await postAction("project-webhook-delete", { id });
    for (const id of createdTemplateIds) await postAction("project-task-template-delete", { id });
    for (const id of createdFieldIds) await postAction("project-custom-field-delete", { id });
    for (const id of createdMilestoneIds) await postAction("project-milestone-delete", { id, expectedRevision: 1 });
    for (const id of createdColumnIds) await postAction("project-column-delete", { id });
    for (const id of createdLabelIds) await postAction("project-label-delete", { id, projectId: targetProjectId });
    for (const id of createdViewIds) await postAction("project-saved-view-delete", { id });
    for (const id of createdTaskIds) {
      const current = (await getAction("project-task-get", { id })).task;
      if (current) await postAction("project-task-delete", { id, expectedRevision: current.revision });
    }
    if (createdProjectId) {
      const currentProject = (await getAction("project-get", { projectId: createdProjectId })).project;
      if (currentProject?.archivedAt == null) await postAction("project-archive", { projectId: createdProjectId, expectedRevision: currentProject.revision });
    }
  }
});
