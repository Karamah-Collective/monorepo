import { requestAdmin } from "./karamah-admin";
import type { ClientResponse } from "hono/client";

type ProjectsArgs = {
  param?: Record<string, string | undefined>;
  query?: Record<string, string | number | boolean | undefined>;
  json?: Record<string, unknown>;
};

// Projects normally receives a generated Hono client. The Cloudflare adapter is
// a runtime proxy, so give its recursive route tree an endpoint-compatible
// type instead of letting Hono infer every response as `never`.
type ProjectsEndpoint = ((
  args?: any,
  options?: any,
) => Promise<ClientResponse<any, 200, "json">>) & {
  [key: string]: ProjectsEndpoint;
};

// The original Projects app gets this shape from its generated Hono client. The
// Karamah adapter keeps the same runtime proxy, but needs an explicit
// compatibility type so the copied fetchers do not infer every response as
// `never` when the generated Projects API package is not present.
type AdminResult = Record<string, unknown> & { __httpStatus?: number };

function response(body: unknown, status = 200): Response {
  let payload = body;
  let actualStatus = status;
  if (body && typeof body === "object" && !Array.isArray(body) && "__httpStatus" in body) {
    const source = body as AdminResult;
    actualStatus = Number(source.__httpStatus || status);
    const { __httpStatus: _status, ...cleanBody } = source;
    payload = cleanBody;
  }
  return new Response(JSON.stringify(payload), {
    status: actualStatus,
    headers: { "Content-Type": "application/json" },
  });
}

function projectPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const nested = source.project;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : source;
}

function toProjectsProject(value: unknown): Record<string, unknown> | null {
  const envelope = (value && typeof value === "object" && !Array.isArray(value))
    ? value as Record<string, unknown>
    : {};
  const source = projectPayload(value);
  if (!source?.id) return null;
  const visibility = String(source.visibility || "workspace");
  return {
    ...source,
    ...(envelope.role ? { role: envelope.role } : {}),
    ...(envelope.permissions ? { permissions: envelope.permissions } : {}),
    ...(envelope.taskVisibility ? { taskVisibility: envelope.taskVisibility } : {}),
    id: String(source.id),
    workspaceId: source.workspaceId || source.workspace_id || "workspace-default",
    backgroundVersion: source.backgroundVersion ?? null,
    slug: source.slug || source.key || source.id,
    icon: source.icon ?? null,
    name: source.name || source.id,
    description: source.description ?? null,
    isPublic: source.isPublic ?? (visibility === "public"),
    archivedAt: source.archivedAt ?? null,
    position: Number(source.position || 0),
    lastTaskNumber: Number(source.lastTaskNumber || 0),
    statistics: source.statistics || {
      completionPercentage: 0,
      totalTasks: Number(source.taskCount || 0),
      dueDate: null,
    },
    archivedTasks: Array.isArray(source.archivedTasks) ? source.archivedTasks : [],
    plannedTasks: Array.isArray(source.plannedTasks) ? source.plannedTasks : [],
    columns: Array.isArray(source.columns) ? source.columns : [],
  };
}

export function toProjectsTask(value: unknown): Record<string, unknown> {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const assignee = source.assignee && typeof source.assignee === "object"
    ? source.assignee as Record<string, unknown>
    : null;
  const assigneeUid =
    source.assigneeUid ??
    source.assignee_id ??
    source.assigneeId ??
    source.userId ??
    assignee?.uid ??
    null;
  const assigneeEmail =
    source.assigneeEmail ??
    source.assignee_email ??
    source.userEmail ??
    assignee?.email ??
    null;
  const priority = String(source.priority || "no-priority");
  return {
    ...source,
    id: source.id,
    projectId: source.projectId || source.project_id,
    position: source.position ?? 0,
    number: source.number ?? source.taskNumber ?? null,
    // Admin task responses use assigneeUid/assigneeEmail while the Projects
    // client model uses userId. Keep both identities at this boundary so
    // task chips and workspace planning can resolve the same person.
    userId: source.userId ?? assigneeUid ?? assigneeEmail ?? null,
    title: source.title || "Untitled task",
    description: source.description ?? "",
    status: source.status || source.statusCategory || "inbox",
    priority: priority === "normal" ? "no-priority" : priority,
    startDate: source.startDate ?? source.startAt ?? null,
    dueDate: source.dueDate ?? source.dueAt ?? null,
    createdAt: source.createdAt ?? null,
    columnId: source.columnId ?? source.column_id ?? null,
    assigneeName: source.assigneeName ?? assignee?.name ?? null,
    assigneeId: assigneeUid,
    assigneeUid,
    assigneeEmail,
    labels: Array.isArray(source.labels) ? source.labels : [],
    externalLinks: Array.isArray(source.externalLinks) ? source.externalLinks : [],
  };
}

function toProjectsColumn(value: unknown, tasks: Record<string, unknown>[] = []): Record<string, unknown> {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const status = String(source.status || source.statusCategory || "inbox");
  return {
    ...source,
    id: source.id,
    slug: source.slug || source.id,
    name: source.name || status,
    icon: source.icon ?? null,
    isFinal: source.isFinal ?? ["completed", "cancelled"].includes(status),
    position: Number(source.position || 0),
    tasks,
  };
}

function toProjectsComment(value: unknown): Record<string, unknown> {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const authorEmail = source.authorEmail || source.author_email || "";
  return {
    ...source,
    id: source.id,
    taskId: source.taskId || source.task_id,
    userId: source.userId || source.authorUid || source.author_uid || "",
    content: source.content ?? source.body ?? "",
    createdAt: source.createdAt || source.created_at || null,
    updatedAt: source.updatedAt || source.updated_at || source.createdAt || source.created_at || null,
    user: source.user || { name: authorEmail, image: null },
  };
}

function toProjectsActivity(value: unknown): Record<string, unknown> {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    ...source,
    id: source.id,
    taskId: source.taskId || source.task_id,
    type: source.type || source.eventType || source.event_type || "activity",
    createdAt: source.createdAt || source.created_at || null,
    updatedAt: source.updatedAt || source.updated_at || source.createdAt || source.created_at || null,
    userId: source.userId || source.actorUid || source.actor_uid || null,
    content: source.content ?? source.note ?? null,
    eventData: source.eventData || {
      fromValue: source.fromValue || source.from_value || null,
      toValue: source.toValue || source.to_value || null,
    },
    externalUserName: null,
    externalUserAvatar: null,
    externalSource: null,
    externalUrl: null,
  };
}

function toProjectsTimeEntry(value: unknown): Record<string, unknown> {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const start = source.startTime || source.startedAt || source.started_at || source.createdAt || source.created_at || null;
  const end = source.endTime || source.endedAt || source.ended_at || null;
  return {
    ...source,
    id: source.id,
    taskId: source.taskId || source.task_id,
    userId: source.userId || source.user_uid || null,
    description: source.description ?? source.note ?? null,
    startTime: start,
    endTime: end,
    duration: source.duration ?? (source.durationMinutes == null ? null : Number(source.durationMinutes) * 60),
    createdAt: source.createdAt || source.created_at || start,
    updatedAt: source.updatedAt || source.updated_at || start,
    userName: source.userName || source.user_email || null,
  };
}

function toProjectsNotification(value: unknown): Record<string, unknown> {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    ...source,
    id: source.id,
    userId: source.userId || source.recipient_email || "",
    title: source.title || null,
    content: source.content || source.body || null,
    type: source.type || source.notification_type || "info",
    eventData: source.eventData || null,
    isRead: source.isRead ?? Boolean(source.read_at),
    resourceId: source.resourceId || source.task_id || null,
    resourceType: source.resourceType || (source.task_id ? "task" : null),
    createdAt: source.createdAt || source.created_at || null,
    updatedAt: source.updatedAt || source.updated_at || source.created_at || null,
  };
}

function toProjectsCustomField(value: unknown): Record<string, unknown> {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    ...source,
    id: source.id,
    projectId: source.projectId || source.project_id,
    name: source.name || "Custom field",
    type: source.type || source.fieldType || source.field_type || "text",
    required: Boolean(source.required),
    defaultValue: source.defaultValue ?? source.default_value ?? null,
    options: source.options ?? (typeof source.options_json === "string" ? [] : source.options_json) ?? null,
    position: Number(source.position || 0),
    createdAt: source.createdAt || source.created_at || null,
    updatedAt: source.updatedAt || source.updated_at || source.created_at || null,
  };
}

function toProjectsLabel(value: unknown): Record<string, unknown> {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    ...source,
    id: source.id,
    projectId: source.projectId || source.project_id,
    name: source.name || "Untitled label",
    color: source.color || "#2b745c",
    createdAt: source.createdAt || source.created_at || null,
    updatedAt: source.updatedAt || source.updated_at || source.created_at || null,
  };
}

function toProjectsRelation(value: unknown): Record<string, unknown> {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const sourceTaskId = source.sourceTaskId || source.source_task_id || source.taskId || source.task_id;
  const targetTaskId = source.targetTaskId || source.target_task_id || source.relatedTaskId || source.related_task_id;
  const relationType = source.relationType || source.relation_type || "related";
  return {
    ...source,
    id: source.id || `${sourceTaskId}:${targetTaskId}:${relationType}`,
    sourceTaskId,
    targetTaskId,
    relationType: relationType === "relates_to" ? "related" : relationType,
    createdAt: source.createdAt || source.created_at || null,
    sourceTask: source.sourceTask || null,
    targetTask: source.targetTask || null,
  };
}

function toProjectsExternalLink(value: unknown): Record<string, unknown> {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    ...source,
    id: source.id,
    taskId: source.taskId || source.task_id,
    integrationId: source.integrationId || source.integration_id || null,
    resourceType: source.resourceType || source.resource_type || "url",
    externalId: source.externalId || source.external_id || source.url,
    url: source.url || "",
    title: source.title || source.label || source.url || "Link",
    metadata: source.metadata || null,
    createdAt: source.createdAt || source.created_at || null,
    updatedAt: source.updatedAt || source.updated_at || source.created_at || null,
  };
}

function methodName(value: PropertyKey): string | null {
  const name = String(value);
  return name.startsWith("$") ? name.slice(1).toUpperCase() : null;
}

function clean(value: unknown): string | undefined {
  return value === undefined || value === null || value === "" ? undefined : String(value);
}

function routePath(path: string[]): string {
  return `/${path.join("/")}`;
}

function queryValue(args: ProjectsArgs, key: string): unknown {
  return args.query?.[key];
}

function bodyValue(args: ProjectsArgs, key: string): unknown {
  return args.json?.[key];
}

function taskBody(args: ProjectsArgs, id?: string): Record<string, unknown> {
  const source = args.json || {};
  return {
    ...source,
    ...(id ? { id } : {}),
    statusCategory: source.statusCategory ?? source.status,
    assigneeUid: source.assigneeUid ?? source.userId,
    assigneeEmail: source.assigneeEmail ?? source.userEmail,
    expectedRevision: source.expectedRevision ?? source.revision,
    startAt: source.startAt ?? source.startDate,
    dueAt: source.dueAt ?? source.dueDate,
  };
}

async function adminCall(
  action: string,
  args: ProjectsArgs,
  data: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
): Promise<AdminResult> {
  const source = method === "GET" ? args.query || {} : args.json || {};
  const payload = { ...source, ...data };
  const raw = await requestAdmin({
    action,
    method,
    query: payload,
    body: payload,
  });
  let result: AdminResult;
  try {
    result = (await raw.json()) as AdminResult;
  } catch {
    return { error: "The Admin service returned an invalid response." };
  }
  if (!raw.ok) return { ...result, __httpStatus: raw.status };
  return result;
}

async function workspaceTasks(args: ProjectsArgs): Promise<AdminResult> {
  const projectsResult = await adminCall("project-list", args);
  const projects = Array.isArray(projectsResult.projects) ? projectsResult.projects : [];
  if (projectsResult.error) return projectsResult;
  const pages = await Promise.all(
    projects.map((project) => {
      const projectId = clean((project as Record<string, unknown>).id);
      return projectId
        ? adminCall("project-tasks-list", { query: { projectId } })
        : Promise.resolve({ tasks: [] } as AdminResult);
    }),
  );
  const tasks = pages.flatMap((page) => (Array.isArray(page.tasks) ? page.tasks : [])).map(toProjectsTask);
  return { tasks, total: tasks.length };
}

async function workspaceLabels(args: ProjectsArgs): Promise<Record<string, unknown>[]> {
  const projectsResult = await adminCall("project-list", args);
  const projects = Array.isArray(projectsResult.projects) ? projectsResult.projects : [];
  const pages = await Promise.all(
    projects.map((project) => {
      const projectId = clean((project as Record<string, unknown>).id);
      return projectId
        ? adminCall("project-labels-list", { query: { projectId } })
        : Promise.resolve({ labels: [] } as AdminResult);
    }),
  );
  const labels = pages.flatMap((page) => (Array.isArray(page.labels) ? page.labels : [])).map(toProjectsLabel);
  return [...new Map(labels.map((label) => [String(label.id), label])).values()];
}

async function boardResponse(projectId: string, args: ProjectsArgs): Promise<AdminResult> {
  const [workspace, taskResult] = await Promise.all([
    adminCall("project-get", { query: { projectId } }),
    adminCall("project-tasks-list", {
      query: { projectId, ...args.query },
    }),
  ]);
  if (workspace.error || taskResult.error) return workspace.error ? workspace : taskResult;
  const tasks = (Array.isArray(taskResult.tasks) ? taskResult.tasks : []).map(toProjectsTask);
  const rawColumns = Array.isArray(workspace.columns) ? workspace.columns : [];
  const columns = rawColumns.map((column) => toProjectsColumn(
    column,
    tasks.filter((task) => task.columnId === (column as Record<string, unknown>).id),
  ));
  const archivedTasks = tasks.filter((task) => ["cancelled"].includes(String(task.status)));
  const plannedTasks = tasks.filter((task) =>
    !columns.some((column) => (column.tasks as unknown[]).some((item) => (item as Record<string, unknown>).id === task.id)) &&
    !archivedTasks.some((item) => item.id === task.id),
  );
  const project = toProjectsProject(workspace) || { id: projectId, name: projectId, slug: projectId };
  return {
    data: {
      ...project,
      columns,
      archivedTasks,
      plannedTasks,
      backgroundVersion: null,
    },
    pagination: { page: 1, pageSize: tasks.length || 100, totalPages: 1, total: tasks.length, relatedTotalPages: 1 },
  };
}

async function invoke(path: string[], method: string, args: ProjectsArgs): Promise<Response> {
  const route = routePath(path);
  const param = args.param || {};
  const projectId = clean(param.projectId) || clean(bodyValue(args, "projectId"));
  const id = clean(param.id) || clean(param.taskId) || clean(param.projectId);

  // Karamah does not use Projects's global Better Auth invitation system. Access
  // is granted at project level through the Admin API, so the copied Projects
  // navigation poll must receive a valid empty collection rather than a 501.
  if (route === "/invitation/pending" && method === "GET") return response([]);

  if (route === "/project" && method === "GET") {
    const result = await adminCall("project-list", args);
    return response(result.error ? result : (Array.isArray(result.projects) ? result.projects.map(toProjectsProject).filter(Boolean) : []));
  }
  if (route === "/project" && method === "POST") {
    const result = await adminCall("project-create", args, {}, "POST");
    return response(result.error ? result : (toProjectsProject(result) || result));
  }
  if (route === "/project/reorder" && ["PUT", "POST"].includes(method)) {
    // Project positions are not yet persisted by the Admin project schema.
    // Return the canonical list so Projects can reconcile its optimistic order.
    const result = await adminCall("project-list", args);
    return response(result.error ? result : (Array.isArray(result.projects) ? result.projects.map(toProjectsProject).filter(Boolean) : []));
  }
  if (path[0] === "project" && path.length === 2) {
    if (method === "GET") {
      const result = await adminCall("project-get", args, { projectId: id });
      return response(result.error ? result : (toProjectsProject(result) || result));
    }
    if (method === "DELETE") return response(await adminCall("project-archive", args, { projectId: id, expectedRevision: bodyValue(args, "expectedRevision") ?? bodyValue(args, "revision") }, "POST"));
    if (["POST", "PUT", "PATCH"].includes(method)) {
      const source = args.json || {};
      const result = await adminCall("project-update", args, { projectId: id, expectedRevision: source.expectedRevision ?? source.revision }, "POST");
      return response(result.error ? result : (toProjectsProject(result) || result));
    }
  }

  if (path[0] === "project" && path[2] === "move" && ["PUT", "POST"].includes(method)) {
    const source = args.json || {};
    const result = await adminCall("project-update", args, { projectId: id, expectedRevision: source.expectedRevision ?? source.revision }, "POST");
    return response(result.error ? result : (toProjectsProject(result) || result));
  }

  if (path[0] === "task" && path[1] === "assigned" && method === "GET") return response(await workspaceTasks(args));
  if (path[0] === "task" && path[1] === "tasks" && method === "GET") return response(await boardResponse(id || "", args));
  if (path[0] === "task" && path[1] === "description-matches" && method === "GET") {
    const result = await adminCall("project-tasks-list", { query: { projectId: id, search: clean(queryValue(args, "query")) } });
    return response(result.error ? result : { ids: (Array.isArray(result.tasks) ? result.tasks : []).map((task) => (task as Record<string, unknown>).id), nextCursor: null });
  }
  if (path[0] === "task" && path[1] === "export" && method === "GET") {
    const result = await adminCall("project-tasks-list", { query: { projectId: id } });
    return response(result.error ? result : { projectId: id, tasks: (Array.isArray(result.tasks) ? result.tasks : []).map(toProjectsTask) });
  }
  if (path[0] === "task" && path[1] === "import" && method === "POST") {
    const source = args.json || {};
    const tasks = Array.isArray(source.tasks) ? source.tasks : [];
    const results = await Promise.all(tasks.map(async (task) => {
      const item = task && typeof task === "object" ? task as Record<string, unknown> : {};
      const result = await adminCall("project-tasks-create", args, {
        projectId: id,
        title: item.title,
        description: item.description,
        statusCategory: item.status,
        priority: item.priority,
        assigneeUid: item.userId,
        startAt: item.startDate,
        dueAt: item.dueDate,
      }, "POST");
      return { success: !result.error, error: result.error || null, task: result.task || null };
    }));
    return response({ success: results.every((item) => item.success), results: { successful: results.filter((item) => item.success).length, failed: results.filter((item) => !item.success).length, errors: results.filter((item) => !item.success) } });
  }
  if (path[0] === "task" && path.length === 2 && method === "POST") {
    const result = await adminCall("project-tasks-create", args, { projectId: id }, "POST");
    return response(result.error ? result : toProjectsTask(result.task || result));
  }
  if (path[0] === "task" && path.length === 2 && method === "GET") {
    const result = await adminCall("project-task-get", args, { id }, "GET");
    return response(result.error ? result : toProjectsTask(result.task || result));
  }
  if (path[0] === "task" && path.length === 2 && ["PUT", "PATCH"].includes(method)) {
    const result = await adminCall("project-task-update", args, taskBody(args, id), "POST");
    return response(result.error ? result : toProjectsTask(result.task || result));
  }
  if (path[0] === "task" && path.length === 2 && method === "DELETE") return response(await adminCall("project-task-delete", args, { id, expectedRevision: bodyValue(args, "expectedRevision") ?? bodyValue(args, "revision"), reason: bodyValue(args, "reason") }, "POST"));
  if (path[0] === "task" && path[1] === "duplicate") {
    const result = await adminCall("project-task-duplicate", args, { id }, "POST");
    return response(result.error ? result : toProjectsTask(result.task || result));
  }
  if (path[0] === "task" && path[1] === "move") {
    const source = args.json || {};
    const result = await adminCall("project-task-update", args, {
      id,
      statusCategory: source.destinationStatus || source.status || undefined,
      projectId: source.destinationProjectId,
      expectedRevision: source.expectedRevision ?? source.revision,
    }, "POST");
    return response(result.error ? result : toProjectsTask(result.task || result));
  }
  if (path[0] === "task" && path[1] === "assignee") {
    const result = await adminCall("project-task-assign", args, taskBody(args, id), "POST");
    return response(result.error ? result : toProjectsTask(result.task || result));
  }
  if (path[0] === "task" && ["status", "assignee", "priority", "title", "description", "due-date"].includes(path[1] || "")) {
    const result = await adminCall("project-task-update", args, taskBody(args, id), "POST");
    return response(result.error ? result : toProjectsTask(result.task || result));
  }
  if (path[0] === "task" && path[1] === "bulk") {
    const result = await adminCall("project-tasks-bulk", args, { idempotencyKey: bodyValue(args, "idempotencyKey") || crypto.randomUUID() }, "POST");
    return response(result.error ? result : {
      ...result,
      updatedCount: Number(result.succeeded || 0),
    });
  }
  if (path[0] === "task" && path[1] === "reorder") {
    const source = args.json || {};
    const tasks = Array.isArray(source.tasks) ? source.tasks : [];
    const results = await Promise.all(tasks.map(async (task) => {
      const item = task && typeof task === "object" ? task as Record<string, unknown> : {};
      const result = await adminCall("project-task-update", args, {
        id: item.id,
        position: item.position,
        statusCategory: item.status,
        expectedRevision: item.expectedRevision ?? item.revision,
      }, "POST");
      return { id: item.id, success: !result.error, error: result.error || null };
    }));
    return response({ success: results.every((item) => item.success), results });
  }
  if (path[0] === "task" && path[1] === "assigned" && method === "GET") return response(await adminCall("project-tasks-list", args, { assignee: "me" }));

  if (path[0] === "activity" && path[1] === "workspace" && method === "GET") return response([]);
  if (path[0] === "activity" && method === "GET") {
    const result = await adminCall("project-task-activity", args, { taskId: id });
    return response(result.error ? result : (Array.isArray(result.events) ? result.events.map(toProjectsActivity) : []));
  }
  if (path[0] === "activity" && path[1] === "comment" && method === "POST") return response(await adminCall("project-task-comment", args, {}, "POST"));
  if (path[0] === "activity" && path[1] === "comment" && method === "PUT") return response(await adminCall("project-task-comment-update", args, { id }, "POST"));
  if (path[0] === "activity" && path[1] === "comment" && method === "DELETE") return response(await adminCall("project-task-comment-delete", args, { id }, "POST"));
  if (path[0] === "comment" && method === "GET") {
    const result = await adminCall("project-task-comments-list", args, { taskId: id });
    return response(result.error ? result : (Array.isArray(result.comments) ? result.comments.map(toProjectsComment) : []));
  }
  if (path[0] === "comment" && method === "POST") return response(await adminCall("project-task-comment", args, { taskId: id }, "POST"));
  if (path[0] === "comment" && method === "PUT") return response(await adminCall("project-task-comment-update", args, { id }, "POST"));
  if (path[0] === "comment" && method === "DELETE") return response(await adminCall("project-task-comment-delete", args, { id }, "POST"));

  if (path[0] === "column" && path.length === 2 && method === "GET") {
    const result = await adminCall("project-columns-list", args, { projectId: id });
    return response(result.error ? result : (Array.isArray(result.columns) ? result.columns.map((column) => toProjectsColumn(column)) : []));
  }
  if (path[0] === "column" && path.length === 2 && method === "POST") {
    const result = await adminCall("project-column-create", args, { projectId: id }, "POST");
    return response(result.error ? result : (result.column || result));
  }
  if (path[0] === "column" && path.length === 2 && ["PUT", "PATCH"].includes(method)) {
    const result = await adminCall("project-column-update", args, { id }, "POST");
    return response(result.error ? result : (result.column || result));
  }
  if (path[0] === "column" && path.length === 2 && method === "DELETE") return response(await adminCall("project-column-delete", args, { id }, "POST"));
  if (path[0] === "column" && path[1] === "reorder" && ["PUT", "POST"].includes(method)) {
    const source = args.json || {};
    const columns = Array.isArray(source.columns) ? source.columns : [];
    const results = await Promise.all(columns.map(async (column) => {
      const item = column && typeof column === "object" ? column as Record<string, unknown> : {};
      const result = await adminCall("project-column-update", args, {
        id: item.id,
        position: item.position,
        name: item.name,
        statusCategory: item.statusCategory || item.status,
      }, "POST");
      return { id: item.id, success: !result.error, error: result.error || null };
    }));
    return response({ success: results.every((item) => item.success), results });
  }

  if (path[0] === "label" && path[1] === "workspace" && method === "GET") return response(await workspaceLabels(args));
  if (path[0] === "label" && path[2] === "task" && ["PUT", "POST"].includes(method)) {
    const result = await adminCall("project-label-attach", args, { labelId: id }, "POST");
    return response(result);
  }
  if (path[0] === "label" && path[2] === "task" && method === "DELETE") {
    const result = await adminCall("project-label-detach", args, { labelId: id }, "POST");
    return response(result);
  }
  if (path[0] === "label" && path[1] === "task" && method === "GET") {
    const result = await adminCall("project-task-get", args, { id }, "GET");
    return response(result.error ? result : (Array.isArray(result.labels) ? result.labels.map(toProjectsLabel) : []));
  }
  if (path[0] === "label" && path[1] === "task" && method === "POST") return response(await adminCall("project-label-attach", args, {}, "POST"));
  if (path[0] === "label" && path[1] === "task" && method === "DELETE") return response(await adminCall("project-label-detach", args, {}, "POST"));
  if (path[0] === "label" && path.length === 1 && method === "POST") {
    const result = await adminCall("project-label-save", args, {}, "POST");
    return response(result.error ? result : toProjectsLabel(result.label || result));
  }
  if (path[0] === "label" && path.length === 2 && ["PUT", "PATCH"].includes(method)) {
    const result = await adminCall("project-label-save", args, { id }, "POST");
    return response(result.error ? result : toProjectsLabel(result.label || result));
  }
  if (path[0] === "label" && path.length === 2 && method === "DELETE") return response(await adminCall("project-label-delete", args, { id }, "POST"));

  if (path[0] === "task-relation" && method === "GET") {
    const result = await adminCall("project-relations-list", args, { taskId: id });
    return response(result.error ? result : (Array.isArray(result.relations) ? result.relations.map(toProjectsRelation) : []));
  }
  if (path[0] === "task-relation" && ["POST", "PUT"].includes(method)) {
    const source = args.json || {};
    const result = await adminCall("project-relation-create", args, {
      taskId: source.taskId || source.sourceTaskId,
      relatedTaskId: source.relatedTaskId || source.targetTaskId,
      relationType: source.relationType === "related" ? "relates_to" : source.relationType,
    }, "POST");
    return response(result.error ? result : toProjectsRelation(result.relation || result));
  }
  if (path[0] === "task-relation" && method === "DELETE") {
    const source = args.json || {};
    const relationParts = String(id || "").split(":");
    const result = await adminCall("project-relation-delete", args, {
      id,
      taskId: source.taskId || source.sourceTaskId || relationParts[0],
      relatedTaskId: source.relatedTaskId || source.targetTaskId || relationParts[1],
      relationType: source.relationType === "related" ? "relates_to" : source.relationType || relationParts.slice(2).join(":"),
    }, "POST");
    return response(result);
  }

  if (path[0] === "external-link" && path[1] === "task" && method === "GET") {
    const result = await adminCall("project-task-links-list", args, { taskId: id });
    return response(result.error ? result : (Array.isArray(result.links) ? result.links.map(toProjectsExternalLink) : []));
  }
  if (path[0] === "external-link" && path[1] === "task" && path.length === 3 && method === "POST") {
    const result = await adminCall("project-task-link-save", args, { taskId: id }, "POST");
    return response(result.error ? result : toProjectsExternalLink(result.link || result));
  }
  if (path[0] === "external-link" && path[1] === "task" && path.length === 4 && method === "DELETE") {
    return response(await adminCall("project-task-link-delete", args, { taskId: clean(param.taskId), id: clean(param.id) }, "POST"));
  }

  if (path[0] === "custom-field" && path[1] === "project" && path[3] === "values" && method === "GET") return response([]);
  if (path[0] === "custom-field" && path[1] === "project" && path[3] === "filter-values" && method === "GET") return response([]);
  if (path[0] === "custom-field" && path[1] === "project" && method === "GET") {
    const result = await adminCall("project-custom-fields-list", args, { projectId: id });
    return response(result.error ? result : (Array.isArray(result.fields) ? result.fields.map(toProjectsCustomField) : []));
  }
  if (path[0] === "custom-field" && path[1] === "task" && method === "GET") {
    const result = await adminCall("project-task-get", args, { id }, "GET");
    const fields = Array.isArray(result.customFields) ? result.customFields : [];
    return response(result.error ? result : fields.map(toProjectsCustomField));
  }
  if (path[0] === "custom-field" && path.length === 1 && method === "POST") {
    const result = await adminCall("project-custom-field-save", args, {}, "POST");
    return response(result.error ? result : toProjectsCustomField(result.field || result));
  }
  if (path[0] === "custom-field" && path.length === 2 && ["PUT", "PATCH"].includes(method)) {
    const result = await adminCall("project-custom-field-save", args, { id }, "POST");
    return response(result.error ? result : toProjectsCustomField(result.field || result));
  }
  if (path[0] === "custom-field" && path.length === 2 && method === "DELETE") {
    return response(await adminCall("project-custom-field-delete", args, { id }, "POST"));
  }
  if (path[0] === "custom-field" && path[1] === "value" && ["PUT", "PATCH"].includes(method)) {
    return response(await adminCall("project-task-custom-value-save", args, {}, "POST"));
  }
  if (path[0] === "custom-field" && path[1] === "reorder" && ["PUT", "PATCH"].includes(method)) {
    const source = args.json || {};
    const fields = Array.isArray(source.fields) ? source.fields : [];
    const results = await Promise.all(fields.map(async (field) => {
      const item = field && typeof field === "object" ? field as Record<string, unknown> : {};
      const result = await adminCall("project-custom-field-save", args, { id: item.id, position: item.position }, "POST");
      return { id: item.id, success: !result.error, error: result.error || null };
    }));
    return response({ success: results.every((item) => item.success), results });
  }

  if (path[0] === "search" && method === "GET") return response(await adminCall("project-search", args));
  if (path[0] === "milestone" && method === "GET") {
    const result = await adminCall("project-milestones-list", args, { projectId });
    return response(result.error ? result : (Array.isArray(result.milestones) ? result.milestones : []));
  }
  if (path[0] === "milestone" && method === "POST") return response(await adminCall("project-milestone-create", args, { projectId }, "POST"));
  if (path[0] === "milestone" && ["PUT", "PATCH"].includes(method)) return response(await adminCall("project-milestone-update", args, { id }, "POST"));
  if (path[0] === "milestone" && method === "DELETE") return response(await adminCall("project-milestone-delete", args, { id, expectedRevision: bodyValue(args, "expectedRevision") ?? bodyValue(args, "revision") }, "POST"));

  if (path[0] === "workspace" && path.includes("members") && !path.includes("project-access") && method === "GET") {
    const result = await adminCall("project-members-list", args, { projectId: projectId || clean(queryValue(args, "projectId")) || "" });
    return response(result.error ? result : (Array.isArray(result.members) ? result.members : []));
  }
  if (path[0] === "workspace" && path.includes("project-access") && method === "GET") {
    return response({ error: "Project access is managed from each project's settings." }, 410);
  }
  if (path[0] === "workspace" && path.includes("project-access") && ["PUT", "PATCH", "POST"].includes(method)) {
    return response({ error: "Project access is managed from each project's settings." }, 410);
  }
  if (path[0] === "workspace" && path.includes("capabilities") && method === "GET") {
    const accessResult = await adminCall("admin-access", args);
    const permissions = Array.isArray((accessResult.access as Record<string, unknown> | undefined)?.permissions)
      ? ((accessResult.access as Record<string, unknown>).permissions as string[])
      : [];
    const allowed = (permission: string) => permissions.some((candidate) => candidate === "*" || candidate === permission || (candidate.endsWith(".*") && permission.startsWith(candidate.slice(0, -1))));
    return response({
      manageProjects: allowed("operations.projects.write"),
      createProjects: allowed("operations.projects.write"),
      updateProjects: allowed("operations.projects.write"),
      shareProjects: allowed("operations.projects.write"),
      deleteProjects: allowed("operations.projects.write"),
      updateTasks: allowed("operations.tasks.write"),
      createTasks: allowed("operations.tasks.create") || allowed("operations.tasks.write"),
      deleteTasks: allowed("operations.tasks.delete") || allowed("operations.tasks.write"),
      assignTasks: allowed("operations.tasks.assign"),
      createLabels: allowed("operations.projects.write"),
      updateLabels: allowed("operations.tasks.write"),
      deleteLabels: allowed("operations.projects.write"),
      manageWorkspace: allowed("operations.projects.write"),
      manageSettings: allowed("operations.settings.write"),
      deleteWorkspace: allowed("operations.projects.write"),
      inviteUsers: allowed("operations.projects.manage_members"),
      manageTeam: allowed("operations.projects.manage_members"),
      updateMembers: allowed("operations.projects.manage_members"),
      removeMembers: allowed("operations.projects.manage_members"),
    });
  }

  if (path[0] === "time-entry" && path[1] === "task" && method === "GET") {
    const result = await adminCall("project-task-time-list", args, { taskId: id });
    return response(result.error ? result : (Array.isArray(result.entries) ? result.entries.map(toProjectsTimeEntry) : []));
  }
  if (path[0] === "time-entry" && method === "POST") {
    const result = await adminCall("project-task-time-save", args, {}, "POST");
    return response(result.error ? result : toProjectsTimeEntry(result.entry || result));
  }
  if (path[0] === "notification" && method === "GET") {
    const result = await adminCall("project-notifications-list", args);
    return response(result.error ? result : (Array.isArray(result.notifications) ? result.notifications.map(toProjectsNotification) : []));
  }
  if (path[0] === "notification" && ["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    const notificationId = clean(param.id) || id;
    const all = path[1] === "read-all" || path[1] === "clear-all";
    if (path[1] === "clear-read") return response({ success: true });
    const unread = path[2] === "unread";
    return response(await adminCall("project-notifications-read", args, { id: notificationId, all, unread }, "POST"));
  }
  if (path[0] === "billing" && path.length === 2 && method === "GET") {
    return response({ billingEnabled: false, foundingFree: false, plan: null, status: null, billingInterval: null, seats: 1, currentPeriodEnd: null, canceledAt: null, hasCustomer: false, trialEndsAt: null });
  }
  if (path[0] === "billing" && method === "POST") return response({ error: "Billing is managed outside the Projects workspace." }, 501);
  if (path[0] === "calendar-feed" && path[1] === "project" && method === "GET") return response([]);
  if (path[0] === "workflow-rule" && method === "GET") return response([]);
  if (path[0] === "github-integration" || path[0] === "gitlab-integration" || path[0] === "gitea-integration") {
    if (method === "GET") return response(null);
  }
  if (path[0] === "config" && method === "GET") return response({});

  return response({ error: `Projects endpoint ${method} ${route} is not available in the Cloudflare adapter.` }, 501);
}

function proxy(path: string[]): unknown {
  return new Proxy(() => undefined, {
    get(_target, property) {
      const method = methodName(property);
      if (method) return (args: ProjectsArgs = {}) => invoke(path, method, args);
      return proxy([...path, String(property)]);
    },
  });
}

export const client = proxy([]) as unknown as ProjectsEndpoint;
export const windowId = Math.random().toString(36).slice(2, 11);

export function resolveApiBaseUrl(value: string | undefined): string {
  const base = (value || "/api").replace(/\/+$/, "");
  return base.endsWith("/api") ? base : `${base}/api`;
}

