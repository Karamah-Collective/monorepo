import { test, expect } from "@playwright/test";

const liveFixtureEnabled = process.env.PROJECTS_LIVE_AUTH === "1";
test.skip(!liveFixtureEnabled, "Set PROJECTS_LIVE_AUTH=1 when local Maps and Projects services are running.");
test.use({ storageState: process.env.PROJECTS_AUTH_STATE || "Projects/tests/.auth/user.json" });

test("authenticated Projects deep lifecycle and data-contract matrix", async ({ page, request }) => {
  test.setTimeout(240_000);

  const sockets = [];
  page.on("websocket", (socket) => {
    if (socket.url().includes("/api/ws/")) sockets.push(socket);
  });
  await page.goto("/dashboard/workspace/workspace-default/project/project-admin-operations/board", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/auth\/sign-in/);
  await expect.poll(() => sockets.length, { timeout: 20_000 }).toBeGreaterThan(0);
  const tokenSocket = sockets.find((socket) => new URL(socket.url()).searchParams.get("token")) || sockets[0];
  const token = tokenSocket ? new URL(tokenSocket.url()).searchParams.get("token") || "" : "";
  expect(token, "the authenticated Projects page did not hand a Firebase token to realtime").not.toBe("");
  const headers = { Authorization: `Bearer ${token}` };

  async function call(action, data = {}, method = "POST") {
    const response = method === "GET"
      ? await request.get(`/api/admin?${new URLSearchParams({ action, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])) })}`, { headers })
      : await request.post("/api/admin", { headers, data: { action, ...data } });
    const payload = await response.json().catch(() => null);
    expect(response.status(), `${action} returned a transport error`).toBeLessThan(500);
    expect(payload, `${action} returned invalid JSON`).toBeTruthy();
    return { response, payload };
  }
  async function success(action, data = {}) {
    const result = await call(action, data);
    expect(result.payload.error, `${action} returned ${result.payload.error || "an error"}`).toBeUndefined();
    expect(result.payload.success, `${action} did not report success`).toBe(true);
    return result.payload;
  }
  async function read(action, data = {}) {
    const result = await call(action, data, "GET");
    expect(result.payload.error, `${action} returned ${result.payload.error || "an error"}`).toBeUndefined();
    return result.payload;
  }
  async function error(action, data, expectedStatus) {
    const result = await call(action, data);
    expect(result.response.status(), `${action} transport status`).toBe(200);
    if (expectedStatus !== undefined) expect(result.payload.status, `${action} semantic status`).toBe(expectedStatus);
    expect(result.payload.error, `${action} should explain its rejection`).toBeTruthy();
    return result.payload;
  }

  const stamp = Date.now();
  const name = (suffix) => `live-manager-project-deep-${suffix}-${stamp}`;
  const taskIds = [];
  const fieldIds = [];
  const labelIds = [];
  const columnIds = [];
  const templateIds = [];
  const webhookIds = [];
  let projectId = "";
  let projectRevision = 1;

  try {
    const created = await success("project-create", {
      workspaceId: "workspace-default",
      name: name("contract"),
      key: `D${String(stamp).slice(-5)}`,
      description: "Deep lifecycle contract fixture",
      visibility: "restricted",
    });
    projectId = created.project.id;
    projectRevision = created.project.revision;
    expect(created.role).toBe("project-admin");
    expect(created.project.visibility).toBe("restricted");

    const workspace = await read("project-workspace-get", { workspaceId: "workspace-default" });
    expect(workspace.workspace?.id).toBe("workspace-default");
    const capabilities = await read("project-workspace-capabilities", { workspaceId: "workspace-default" });
    expect(typeof capabilities.manageProjects).toBe("boolean");
    expect(capabilities.createProjects).toBe(true);

    await error("project-update", { projectId, name: name("missing-revision") }, 428);
    await error("project-update", { projectId, name: name("stale"), expectedRevision: projectRevision - 1 }, 409);
    const renamed = await success("project-update", {
      projectId,
      name: name("renamed"),
      description: "Updated deep contract fixture",
      visibility: "workspace",
      expectedRevision: projectRevision,
    });
    projectRevision = renamed.project.revision;
    expect(renamed.project.visibility).toBe("workspace");
    expect(renamed.project.description).toBe("Updated deep contract fixture");

    const project = await read("project-get", { projectId });
    expect(project.columns.length).toBeGreaterThanOrEqual(5);
    const byStatus = new Map(project.columns.map((column) => [column.statusCategory, column]));
    const missingAssigned = await success("project-column-create", {
      projectId,
      name: "Assigned QA",
      statusCategory: "assigned",
      position: 15,
    });
    columnIds.push(missingAssigned.column.id);
    byStatus.set("assigned", missingAssigned.column);
    const renamedColumn = await success("project-column-update", {
      id: missingAssigned.column.id,
      name: "Assigned QA Updated",
      position: 16,
    });
    expect(renamedColumn.column.name).toBe("Assigned QA Updated");
    await error("project-column-create", { projectId, name: "bad status", statusCategory: "unknown", position: 17 }, 400);
    await error("project-column-create", { projectId, name: "bad position", statusCategory: "inbox", position: -1 }, 400);

    const milestone = await success("project-milestone-create", {
      projectId,
      name: name("milestone"),
      description: "Milestone contract",
      startAt: "2026-10-01",
      dueAt: "2026-10-20",
    });
    expect(milestone.milestone.startAt).toContain("2026-10-01");
    await error("project-milestone-create", { projectId, name: "bad dates", startAt: "2026-10-20", dueAt: "2026-10-01" }, 400);
    const milestoneUpdated = await success("project-milestone-update", {
      id: milestone.milestone.id,
      name: `${milestone.milestone.name}-updated`,
      status: "active",
      expectedRevision: milestone.milestone.revision || 1,
    });
    expect(milestoneUpdated.milestone.status).toBe("active");

    const fieldDefinitions = [
      { name: "Text", type: "text" },
      { name: "Number", type: "number" },
      { name: "Date", type: "date" },
      { name: "Boolean", type: "boolean" },
      { name: "Select", type: "dropdown", options: ["One", "Two"] },
      { name: "Multi", type: "multiselect", options: ["Red", "Blue"], multiple: true },
    ];
    for (const definition of fieldDefinitions) {
      const result = await success("project-custom-field-save", { projectId, ...definition });
      fieldIds.push(result.field.id);
      expect(result.field.projectId).toBe(projectId);
      expect(result.field.type).toBe(definition.type === "boolean" ? "boolean" : definition.type === "text" || definition.type === "number" || definition.type === "date" ? definition.type : definition.multiple ? "multiselect" : "dropdown");
    }
    await error("project-custom-field-save", { projectId, name: "bad select", type: "dropdown" }, 400);
    await error("project-custom-field-save", { projectId, name: "bad multiple", type: "text", multiple: true }, 400);
    const fields = await read("project-custom-fields-list", { projectId });
    expect(fields.fields.map((field) => field.id)).toEqual(expect.arrayContaining(fieldIds));

    const inbox = byStatus.get("inbox") || project.columns[0];
    const customFields = [
      { fieldId: fieldIds[0], value: "Text value" },
      { fieldId: fieldIds[1], value: "42.5" },
      { fieldId: fieldIds[2], value: "2026-10-17" },
      { fieldId: fieldIds[3], value: "true" },
      { fieldId: fieldIds[4], value: "One" },
      { fieldId: fieldIds[5], value: JSON.stringify(["Red", "Blue"]) },
    ];
    const task = await success("project-tasks-create", {
      projectId,
      title: name("task"),
      description: "Task with every supported custom field type",
      columnId: inbox.id,
      statusCategory: inbox.statusCategory,
      priority: "normal",
      startAt: "2026-10-10T08:00:00Z",
      dueAt: "2026-10-20T08:00:00Z",
      milestoneId: milestone.milestone.id,
      customFields,
    });
    taskIds.push(task.task.id);
    expect(task.task.statusCategory).toBe(inbox.statusCategory);
    expect(task.task.priority).toBe("normal");
    await error("project-tasks-create", { projectId, title: "bad priority", columnId: inbox.id, priority: "critical" }, 400);
    await error("project-tasks-create", { projectId, title: "bad dates", columnId: inbox.id, startAt: "2026-10-20", dueAt: "2026-10-10" }, 400);
    await error("project-task-custom-value-save", { taskId: task.task.id, fieldId: fieldIds[1], value: "not-a-number" }, 400);
    await error("project-task-custom-value-save", { taskId: task.task.id, fieldId: fieldIds[4], value: "Three" }, 400);
    await success("project-task-custom-value-save", { taskId: task.task.id, fieldId: fieldIds[1], value: "43" });
    const customValues = await read("project-custom-field-values-list", { projectId });
    expect(customValues.values.some((value) => value.taskId === task.task.id && value.fieldId === fieldIds[1] && value.value === "43")).toBe(true);
    const filterValues = await read("project-custom-field-filter-values-list", { projectId });
    expect(filterValues.values.find((value) => value.fieldId === fieldIds[5])?.values).toEqual(expect.arrayContaining(["Red", "Blue"]));

    const taskRead = await read("project-task-get", { id: task.task.id });
    expect(taskRead.task.title).toBe(name("task"));
    expect(taskRead.customFields).toHaveLength(fieldIds.length);
    expect((await read("project-task-by-ticket", { workspaceSlug: workspace.workspace?.slug || "workspace-default", ticketId: `${created.project.key}-${task.task.taskNumber}` })).task.id).toBe(task.task.id);
    await error("project-task-update", { id: task.task.id, title: "missing revision" }, 428);
    await error("project-task-update", { id: task.task.id, title: "stale revision", expectedRevision: task.task.revision - 1 }, 409);

    let currentRevision = task.task.revision;
    for (const priority of ["low", "medium", "high", "urgent", "normal"]) {
      const updated = await success("project-task-update", { id: task.task.id, priority, expectedRevision: currentRevision });
      currentRevision = updated.task.revision;
      expect(updated.task.priority).toBe(priority);
    }
    for (const status of ["assigned", "in_progress", "blocked", "completed", "cancelled", "inbox"]) {
      const column = byStatus.get(status);
      const updated = await success("project-task-update", { id: task.task.id, statusCategory: status, columnId: column?.id, expectedRevision: currentRevision });
      currentRevision = updated.task.revision;
      expect(updated.task.statusCategory).toBe(status);
    }
    await error("project-task-update", { id: task.task.id, statusCategory: "not-a-status", expectedRevision: currentRevision }, 400);
    await error("project-task-update", { id: task.task.id, position: -1, expectedRevision: currentRevision }, 400);

    const label = await success("project-label-save", { projectId, name: name("label"), color: "#abcdef" });
    labelIds.push(label.label.id);
    expect(label.label.color).toBe("#abcdef");
    await error("project-label-save", { projectId, id: "label_different", name: label.label.name, color: "#000000" });
    await success("project-label-attach", { taskId: task.task.id, labelId: label.label.id });
    expect((await read("project-task-get", { id: task.task.id })).labels.some((item) => item.id === label.label.id)).toBe(true);
    await success("project-label-detach", { taskId: task.task.id, labelId: label.label.id });
    await success("project-label-delete", { projectId, id: label.label.id });

    const comment = await success("project-task-comment", { taskId: task.task.id, comment: "deep comment" });
    expect(comment.comment.body).toBe("deep comment");
    await success("project-task-comment-update", { id: comment.comment.id, body: "edited deep comment" });
    expect((await read("project-task-comments-list", { taskId: task.task.id })).comments.some((item) => item.body === "edited deep comment")).toBe(true);
    await success("project-task-comment-delete", { id: comment.comment.id });
    await success("project-task-link-save", { taskId: task.task.id, url: "https://example.com/deep", title: "Deep link", resourceType: "reference", externalId: "deep-1" });
    const links = await read("project-task-links-list", { taskId: task.task.id });
    expect(links.links.some((item) => item.url === "https://example.com/deep")).toBe(true);
    await error("project-task-link-save", { taskId: task.task.id, url: "javascript:alert(1)" });
    await success("project-task-link-delete", { taskId: task.task.id, id: links.links[0].id });

    for (const viewType of ["board", "list", "calendar", "timeline", "backlog"]) {
      const view = await success("project-saved-view-save", { projectId, name: name(`view-${viewType}`), viewType, filters: { priority: "urgent" }, sort: { field: "updatedAt", direction: "desc" }, shared: true });
      expect(view.view.viewType).toBe(viewType);
      await success("project-saved-view-delete", { id: view.view.id });
    }

    const template = await success("project-task-template-save", {
      projectId,
      name: name("template"),
      description: "Deep template",
      payload: { title: "From deep template", priority: "high", description: "template body" },
    });
    templateIds.push(template.template.id);
    expect((await read("project-task-templates-list", { projectId })).templates.some((item) => item.id === template.template.id)).toBe(true);
    const fromTemplate = await success("project-task-from-template", { templateId: template.template.id, title: name("template-task"), columnId: inbox.id });
    taskIds.push(fromTemplate.task.id);
    expect(fromTemplate.task.title).toBe(name("template-task"));

    const webhook = await success("project-webhook-save", {
      projectId,
      url: "https://example.com/project-hook",
      secret: "deep-secret",
      eventTypes: ["task.created", "task.updated", "not-supported"],
      active: true,
    });
    webhookIds.push(webhook.webhook.id);
    expect(webhook.webhook.hasSecret).toBe(true);
    expect((await read("project-webhooks-list", { projectId })).webhooks.find((item) => item.id === webhook.webhook.id)?.hasSecret).toBe(true);
    await error("project-webhook-save", { projectId, url: "http://127.0.0.1:8788/hook" }, 400);

    const taskAfter = await read("project-task-get", { id: task.task.id });
    await success("project-task-watcher-update", { taskId: task.task.id, email: "moontasir@karamahcollective.com", userUid: "moontasir@karamahcollective.com" });
    expect((await read("project-task-watchers-list", { taskId: task.task.id })).watchers.some((item) => item.email === "moontasir@karamahcollective.com")).toBe(true);
    await success("project-task-watcher-update", { taskId: task.task.id, email: "moontasir@karamahcollective.com", remove: true });
    const time = await success("project-task-time-save", { taskId: task.task.id, startedAt: "2026-10-17T10:00:00Z", endedAt: "2026-10-17T11:30:00Z", note: "deep time" });
    expect(time.entry.duration_minutes).toBe(90);
    await error("project-task-time-save", { taskId: task.task.id, startedAt: "2026-10-18T10:00:00Z", endedAt: "2026-10-17T10:00:00Z" }, 400);
    expect((await read("project-task-time-list", { taskId: task.task.id })).totalMinutes).toBeGreaterThanOrEqual(90);
    expect((await read("project-task-activity", { taskId: task.task.id })).events.length).toBeGreaterThan(0);
    expect((await read("project-summary", { projectId })).project.id).toBe(projectId);

    await success("project-task-duplicate", { id: task.task.id, title: name("duplicate"), columnId: inbox.id });
    const afterDuplicate = await read("project-tasks-list", { projectId });
    const duplicate = afterDuplicate.tasks.find((item) => item.title === name("duplicate"));
    expect(duplicate).toBeTruthy();
    taskIds.push(duplicate.id);

    for (const fieldId of fieldIds) await success("project-custom-field-delete", { id: fieldId });
    for (const templateId of templateIds) await success("project-task-template-delete", { id: templateId });
    for (const webhookId of webhookIds) await success("project-webhook-delete", { id: webhookId });
    await success("project-milestone-delete", { id: milestone.milestone.id, expectedRevision: milestoneUpdated.milestone.revision });
    expect((await read("project-milestones-list", { projectId })).milestones.some((item) => item.id === milestone.milestone.id)).toBe(false);
    expect((await read("project-custom-fields-list", { projectId })).fields.some((item) => fieldIds.includes(item.id))).toBe(false);
  } finally {
    for (const id of [...new Set(taskIds)]) {
      const current = await read("project-task-get", { id }).catch(() => null);
      if (current?.task && current.task.statusCategory !== "cancelled") await success("project-task-delete", { id, expectedRevision: current.task.revision });
    }
    for (const id of [...new Set(labelIds)]) await call("project-label-delete", { projectId, id }).catch(() => null);
    for (const id of [...new Set(templateIds)]) await call("project-task-template-delete", { id }).catch(() => null);
    for (const id of [...new Set(webhookIds)]) await call("project-webhook-delete", { id }).catch(() => null);
    if (projectId) {
      const current = await read("project-get", { projectId }).catch(() => null);
      if (current?.project && current.project.archivedAt == null) await call("project-archive", { projectId, expectedRevision: current.project.revision }).catch(() => null);
    }
  }
});
