import { test, expect } from "@playwright/test";

const liveFixtureEnabled = process.env.PROJECTS_LIVE_AUTH === "1";
test.skip(
  !liveFixtureEnabled,
  "Set PROJECTS_LIVE_AUTH=1 when local Maps and Projects services are running.",
);
test.use({ storageState: process.env.PROJECTS_AUTH_STATE || "Projects/tests/.auth/user.json" });

const workspaceId = "workspace-default";
const seededProjectId = "project-admin-operations";

function boardRoute(projectId) {
  return `/dashboard/workspace/${workspaceId}/project/${projectId}/board`;
}

async function installFailureCapture(page) {
  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`);
  });
  return failures;
}

async function getLiveToken(page, route = boardRoute(seededProjectId)) {
  const sockets = [];
  page.on("websocket", (socket) => {
    if (socket.url().includes("/api/ws/")) sockets.push(socket);
  });
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/auth\/sign-in/);
  await expect.poll(() => sockets.some((socket) => !socket.isClosed()), { timeout: 30_000 }).toBe(true);
  const socket = sockets.find((candidate) => !candidate.isClosed());
  const token = new URL(socket.url()).searchParams.get("token") || "";
  expect(token).not.toBe("");
  return token;
}

async function createUiProject(request, token, name) {
  const listed = await apiGet(request, token, "project-list");
  const base = (listed.projects || []).find((candidate) => candidate.id === seededProjectId) || listed.projects?.[0];
  expect(base, "the authenticated fixture has no visible project to use as a workspace source").toBeTruthy();
  const created = await apiPost(request, token, "project-create", {
    workspaceId: base.workspaceId || base.workspace_id,
    name,
    key: `UI${Date.now()}`,
    description: "Temporary project for live UI checklist mutation coverage",
    visibility: "workspace",
  });
  return created.project;
}

async function archiveUiProject(request, token, project) {
  if (!project?.id) return;
  try {
    const current = (await apiGet(request, token, "project-get", { projectId: project.id })).project;
    if (current && current.archivedAt == null) {
      await apiPost(request, token, "project-archive", {
        projectId: project.id,
        expectedRevision: current.revision,
      });
    }
  } catch {
    // The exact fixture cleanup script handles leftovers when the browser context has closed.
  }
}

function apiHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function apiGet(request, token, action, query = {}) {
  const params = new URLSearchParams({
    action,
    ...Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])),
  });
  const response = await request.get(`/api/admin?${params}`, { headers: apiHeaders(token) });
  const payload = await response.json().catch(() => null);
  expect(response.status(), `${action} returned a transport error`).toBeLessThan(500);
  expect(payload?.error, `${action} returned ${payload?.error || "an unknown error"}`).toBeUndefined();
  return payload;
}

async function apiPost(request, token, action, data = {}) {
  const response = await request.post("/api/admin", {
    headers: apiHeaders(token),
    data: { action, ...data },
  });
  const payload = await response.json().catch(() => null);
  expect(response.status(), `${action} returned a transport error`).toBeLessThan(500);
  expect(payload, `${action} returned invalid JSON`).toBeTruthy();
  expect(payload.error, `${action} returned ${payload.error || "an unknown error"}`).toBeUndefined();
  expect(payload.success, `${action} did not report success`).toBe(true);
  return payload;
}

async function removeTask(request, token, taskId) {
  if (!taskId) return;
  try {
    const current = (await apiGet(request, token, "project-task-get", { id: taskId })).task;
    if (current) {
      await apiPost(request, token, "project-task-delete", {
        id: taskId,
        expectedRevision: current.revision,
      }).catch(() => undefined);
    }
  } catch {
    // The exact fixture cleanup script handles leftovers when the browser context has closed.
  }
}

test("live UI creates a populated task and persists every create-modal property", async ({ page, request }) => {
  test.setTimeout(150_000);
  const failures = await installFailureCapture(page);
  const unique = `ui-checklist-${Date.now()}`;
  const title = `${unique}-created`;
  const labelName = `${unique}-label`;
  let project;
  let token = "";
  let taskId = "";
  let labelId = "";

  try {
    token = await getLiveToken(page);
    project = await createUiProject(request, token, `${unique}-project`);
    await page.goto(boardRoute(project.id), { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/auth\/sign-in/);
    const addTask = page.locator('button[title*="Add task" i]').first();
    await expect(addTask).toBeVisible();
    await addTask.click();

    const dialog = page.locator('[role="dialog"]:visible');
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: /^task title$/i }).fill(title);

    const description = dialog.locator(".ProseMirror").first();
    await expect(description).toBeVisible();
    await description.fill(`${unique} description`);

    await dialog.getByRole("button", { name: /priority/i }).click();
    await page.getByRole("button", { name: /^high$/i }).last().click();

    await dialog.getByRole("button", { name: /^start date$/i }).click();
    await page.getByRole("option", { name: /today/i }).click();

    await dialog.getByRole("button", { name: /^due date$/i }).click();
    await page.getByRole("option", { name: /tomorrow/i }).last().click();

    await dialog.getByRole("button", { name: /^assign$/i }).click();
    await page.getByText("Unassigned", { exact: true }).click();

    await dialog.getByRole("button", { name: /^labels$/i }).click();
    const labelSearch = page.getByPlaceholder(/search labels/i);
    await labelSearch.fill(labelName);
    await page.getByRole("button", { name: new RegExp(`create .*${labelName}`, "i") }).click();
    await page.getByRole("button", { name: /^(sage|forest|amber)$/i }).first().click();
    await expect(page.getByText(/choose color/i)).toHaveCount(0, { timeout: 15_000 });
    await expect(dialog.getByText(labelName, { exact: true }).first()).toBeVisible();

    const createButton = dialog.getByRole("button", { name: /^create task$/i });
    await createButton.click();
    await expect(page.locator("body")).toContainText(title);

    const labels = await apiGet(request, token, "project-labels-list", { projectId: project.id });
    labelId = labels.labels?.find((label) => label.name === labelName)?.id || "";
    expect(labelId).not.toBe("");

    const taskList = await apiGet(request, token, "project-tasks-list", { projectId: project.id });
    const createdTask = (taskList.tasks || []).find((task) => task.title === title);
    expect(createdTask, "the task created by the UI was not returned by the API").toBeTruthy();
    taskId = createdTask.id;
    expect(createdTask.description).toContain(`${unique} description`);
    expect(createdTask.priority).toBe("high");
    expect(createdTask.startAt).toBeTruthy();
    expect(createdTask.dueAt).toBeTruthy();

    await expect.poll(async () => {
      const task = await apiGet(request, token, "project-task-get", { id: taskId });
      return task.labels?.some((label) => label.name === labelName) || false;
    }, { timeout: 15_000 }).toBe(true);
  } finally {
    if (taskId) await removeTask(request, token, taskId);
    if (labelId) await apiPost(request, token, "project-label-delete", { id: labelId, projectId: project?.id });
    await archiveUiProject(request, token, project);
    expect(failures, failures.join("\n")).toEqual([]);
  }
});

test("live UI edits task title, properties, description, comment, subtask, relation, and external link", async ({ page, request }) => {
  test.setTimeout(180_000);
  const failures = await installFailureCapture(page);
  const unique = `ui-checklist-${Date.now()}`;
  let project;
  let token = "";
  let parentId = "";
  let secondTaskId = "";
  let subtaskId = "";
  let commentId = "";
  let linkId = "";
  let labelId = "";

  try {
    token = await getLiveToken(page);
    project = await createUiProject(request, token, `${unique}-project`);
    const projectDetails = await apiGet(request, token, "project-get", { projectId: project.id });
    const inbox = (projectDetails.columns || []).find((column) => column.statusCategory === "inbox") || projectDetails.columns?.[0];
    expect(inbox).toBeTruthy();
    const parent = await apiPost(request, token, "project-tasks-create", {
      projectId: project.id,
      title: `${unique}-parent`,
      description: `${unique} original description`,
      priority: "low",
      statusCategory: inbox.statusCategory,
      columnId: inbox.id,
    });
    parentId = parent.task.id;
    const second = await apiPost(request, token, "project-tasks-create", {
      projectId: project.id,
      title: `${unique}-relation-target`,
      description: "relation target",
      priority: "no-priority",
      statusCategory: inbox.statusCategory,
      columnId: inbox.id,
    });
    secondTaskId = second.task.id;
    const detailLabelName = `${unique}-detail-label`;
    const savedLabel = await apiPost(request, token, "project-label-save", {
      projectId: project.id,
      name: detailLabelName,
      color: "#2b745c",
    });
    labelId = savedLabel.label.id;

    await page.goto(`${boardRoute(project.id)}?taskId=${parentId}`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/auth\/sign-in/);
    const sheet = page.locator('[role="dialog"]').filter({ has: page.locator('[data-task-action="title"]') });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-task-action="title"]')).toHaveValue(`${unique}-parent`);

    const title = sheet.locator('[data-task-action="title"]');
    await title.fill(`${unique}-edited-title`);
    await title.press("Enter");
    await expect.poll(async () => (await apiGet(request, token, "project-task-get", { id: parentId })).task.title, { timeout: 15_000 }).toBe(`${unique}-edited-title`);

    await sheet.locator('[data-task-action="priority"]:visible').last().click();
    await page.getByRole("option", { name: /^urgent$/i }).click();
    await expect.poll(async () => (await apiGet(request, token, "project-task-get", { id: parentId })).task.priority, { timeout: 15_000 }).toBe("urgent");

    await sheet.locator('[data-task-action="status"]:visible').last().click();
    const inProgressOption = page.getByRole("option", { name: /^in progress/i });
    await expect(inProgressOption).toBeVisible();
    await inProgressOption.click();
    await expect.poll(async () => (await apiGet(request, token, "project-task-get", { id: parentId })).task.statusCategory, { timeout: 15_000 }).toBe("in_progress");

    await sheet.locator('[data-task-action="dueDate"]:visible').last().click();
    await page.getByRole("option", { name: /tomorrow/i }).click();
    await expect.poll(async () => Boolean((await apiGet(request, token, "project-task-get", { id: parentId })).task.dueAt), { timeout: 15_000 }).toBe(true);

    await sheet.locator('[data-task-action="labels"]:visible').last().click();
    const taskLabelSearch = page.getByPlaceholder(/search labels/i);
    await expect(taskLabelSearch).toBeVisible();
    await taskLabelSearch.fill(detailLabelName);
    const detailLabelOption = page.getByRole("option").filter({ hasText: detailLabelName }).first();
    await expect(detailLabelOption).toBeVisible();
    await detailLabelOption.click();
    await expect.poll(async () => {
      const task = await apiGet(request, token, "project-task-get", { id: parentId });
      return task.labels?.some((label) => label.id === labelId) || false;
    }, { timeout: 15_000 }).toBe(true);
    await page.keyboard.press("Escape");

    const descriptionEditor = sheet.locator('[data-task-action="description"] .ProseMirror, [data-task-action="description"] [contenteditable="true"]').first();
    if (await descriptionEditor.count()) {
      await descriptionEditor.fill(`${unique} edited description`);
      await descriptionEditor.press("Tab");
      await expect.poll(async () => (await apiGet(request, token, "project-task-get", { id: parentId })).task.description, { timeout: 20_000 }).toContain(`${unique} edited description`);
    }

    const commentEditor = sheet.locator('[data-task-action="comment"] .ProseMirror, [data-task-action="comment"] [contenteditable="true"]').first();
    await expect(commentEditor).toBeVisible();
    await commentEditor.fill(`${unique} comment`);
    await sheet.locator('[data-task-action="comment"] button').last().click();
    await expect.poll(async () => {
      const comments = await apiGet(request, token, "project-task-comments-list", { taskId: parentId });
      return comments.comments?.find((comment) => comment.body?.includes(`${unique} comment`))?.id || "";
    }, { timeout: 20_000 }).not.toBe("");
    const comments = await apiGet(request, token, "project-task-comments-list", { taskId: parentId });
    commentId = comments.comments?.find((comment) => comment.body?.includes(`${unique} comment`))?.id || "";
    expect(commentId).not.toBe("");

    const addSubtask = sheet.locator('[data-task-action="addSubtask"]');
    await expect(addSubtask).toBeVisible();
    await addSubtask.click();
    const subtaskInput = sheet.getByPlaceholder(/subtask/i);
    await subtaskInput.fill(`${unique}-subtask`);
    await subtaskInput.press("Enter");
    await expect.poll(async () => {
      const relations = await apiGet(request, token, "project-relations-list", { taskId: parentId });
      const relation = relations.relations?.find((item) => (item.relationType || item.relation_type) === "subtask");
      return relation?.targetTaskId || relation?.target_task_id || relation?.relatedTaskId || relation?.related_task_id || "";
    }, { timeout: 20_000 }).not.toBe("");
    const parentRelations = await apiGet(request, token, "project-relations-list", { taskId: parentId });
    const subtaskRelation = parentRelations.relations?.find((item) => (item.relationType || item.relation_type) === "subtask");
    subtaskId = subtaskRelation?.targetTaskId || subtaskRelation?.target_task_id || subtaskRelation?.relatedTaskId || subtaskRelation?.related_task_id || "";
    expect(subtaskId).not.toBe("");

    const addRelation = sheet.getByRole("button", { name: /add .*relations/i });
    await expect(addRelation).toBeVisible();
    await addRelation.click();
    await page.getByRole("option", { name: new RegExp(`${unique}-relation-target`, "i") }).click();
    await expect.poll(async () => {
      const relations = await apiGet(request, token, "project-relations-list", { taskId: parentId });
      return relations.relations?.some((item) => (item.targetTaskId || item.target_task_id || item.relatedTaskId || item.related_task_id) === secondTaskId) || false;
    }, { timeout: 20_000 }).toBe(true);

    const addLink = sheet.locator('[data-task-action="addLink"]');
    await expect(addLink).toBeVisible();
    await addLink.click();
    await page.locator("#external-resource-url").fill("https://example.com/projects-ui-check");
    await page.locator("#external-resource-title").fill(`${unique}-external-link`);
    await page.getByRole("button", { name: /add resource/i }).last().click();
    await expect.poll(async () => {
      const links = await apiGet(request, token, "project-task-links-list", { taskId: parentId });
      return links.links?.find((link) => link.url === "https://example.com/projects-ui-check")?.id || "";
    }, { timeout: 20_000 }).not.toBe("");
    const links = await apiGet(request, token, "project-task-links-list", { taskId: parentId });
    linkId = links.links?.find((link) => link.url === "https://example.com/projects-ui-check")?.id || "";
    expect(linkId).not.toBe("");
  } finally {
    if (linkId) await apiPost(request, token, "project-task-link-delete", { taskId: parentId, id: linkId }).catch(() => undefined);
    if (commentId) await apiPost(request, token, "project-task-comment-delete", { id: commentId }).catch(() => undefined);
    if (parentId && secondTaskId) {
      const relations = await apiGet(request, token, "project-relations-list", { taskId: parentId }).catch(() => ({ relations: [] }));
      for (const relation of relations.relations || []) {
        const taskA = relation.taskId || relation.task_id || relation.sourceTaskId || relation.source_task_id;
        const taskB = relation.relatedTaskId || relation.related_task_id || relation.targetTaskId || relation.target_task_id;
        if (taskA && taskB) {
          await apiPost(request, token, "project-relation-delete", {
            taskId: taskA,
            relatedTaskId: taskB,
            relationType: relation.relationType || relation.relation_type,
          }).catch(() => undefined);
        }
      }
    }
    await removeTask(request, token, subtaskId);
    await removeTask(request, token, secondTaskId);
    await removeTask(request, token, parentId);
    if (labelId) await apiPost(request, token, "project-label-delete", { id: labelId, projectId: project?.id }).catch(() => undefined);
    await archiveUiProject(request, token, project);
    expect(failures, failures.join("\n")).toEqual([]);
  }
});
