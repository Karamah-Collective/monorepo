import { verifyFirebaseIdToken } from "./_firebase-verify.js";
import { getProjectAccess } from "./_projects.js";

const PROJECTS_ORIGINS = new Set([
  "https://projects.karamahcollective.com",
  "http://localhost:5184",
  "http://127.0.0.1:5184",
]);

function bearerToken(request) {
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  if (match) return match[1];
  const origin = request.headers.get("Origin") || "";
  return /^http:\/\/(?:localhost|127\.0\.0\.1):5184$/.test(origin)
    ? new URL(request.url).searchParams.get("token") || ""
    : "";
}

function projectActor(verified) {
  if (!verified?.email) return null;
  const email = String(verified.email).toLowerCase();
  const passwordIdentity = !verified.signInProvider || verified.signInProvider === "password";
  if (passwordIdentity && !verified.emailVerified) return null;
  const isKaramah = email.endsWith("@karamahcollective.com") || email.endsWith("@karamah.local");
  if (!isKaramah && verified.signInProvider !== "password") return null;
  return { uid: verified.uid, email, name: verified.name || "" };
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.PROJECTS_ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return [...PROJECTS_ORIGINS, ...configured].includes(origin) ? origin : "";
}

export async function openProjectRealtime({ request, env, channel, projectId = "" }) {
  if (!env.PROJECT_REALTIME) return new Response("Projects realtime is not configured.", { status: 503 });
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required.", { status: 426 });
  const origin = allowedOrigin(request, env);
  if (!origin) return new Response("Forbidden.", { status: 403 });

  const token = bearerToken(request);
  if (!token) return new Response("Unauthorized.", { status: 401 });
  const verified = await verifyFirebaseIdToken(token, env);
  const actor = projectActor(verified);
  if (!actor) return new Response("Unauthorized.", { status: 401 });

  if (channel === "project") {
    if (!projectId || !env.PROJECTS_DB) return new Response("Project realtime is not configured.", { status: 503 });
    const access = await getProjectAccess(env.PROJECTS_DB, projectId, actor, null);
    if (!access?.permissions?.can_view_project) return new Response("Forbidden.", { status: 403 });
  }

  const id = env.PROJECT_REALTIME.idFromName(`${channel}:${channel === "project" ? projectId : actor.uid}`);
  return env.PROJECT_REALTIME.get(id).fetch(request);
}

export async function notifyProjectRealtime(env, projectId, payload) {
  if (!env.PROJECT_REALTIME || !projectId || !payload) return;
  const id = env.PROJECT_REALTIME.idFromName(`project:${projectId}`);
  await env.PROJECT_REALTIME.get(id).fetch("https://projects-realtime/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const PROJECT_REALTIME_ACTIONS = new Set([
  "project-create", "project-update", "project-archive",
  "project-tasks-create", "project-task-update", "project-task-delete",
  "project-tasks-bulk", "project-task-comment", "project-task-comment-update",
  "project-task-comment-delete", "project-task-duplicate", "project-task-assign",
  "project-milestone-create", "project-milestone-update", "project-milestone-delete",
  "project-member-update", "project-member-remove", "project-column-create",
  "project-column-update", "project-column-delete", "project-relation-create",
  "project-relation-delete", "project-task-link-save", "project-task-link-delete",
  "project-label-save", "project-label-attach", "project-label-detach",
  "project-label-delete", "project-saved-view-save", "project-saved-view-delete",
  "project-task-time-save", "project-task-attachment-upload", "project-task-attachment-delete",
  "project-custom-field-save", "project-custom-field-delete", "project-task-custom-value-save",
  "project-task-watcher-update", "project-task-template-save", "project-task-template-delete",
  "project-task-from-template", "project-webhook-save", "project-webhook-delete",
]);

function objectProjectId(value) {
  return value?.projectId || value?.project_id || "";
}

export async function publishProjectRealtime(env, action, data = {}, result = {}) {
  if (!PROJECT_REALTIME_ACTIONS.has(action) || !result?.success) return;

  const task = result.task || null;
  const relation = result.relation || null;
  const taskIds = [...new Set([
    task?.id,
    result.comment?.taskId,
    result.comment?.task_id,
    data.taskId,
    relation?.taskId,
    ...(Array.isArray(result.results) ? result.results.map((item) => item?.taskId) : []),
    action.includes("task") ? data.id : "",
  ].filter(Boolean))];
  const projectIds = new Set([
    data.projectId,
    objectProjectId(result.project),
    objectProjectId(task),
    objectProjectId(result.label),
    objectProjectId(result.milestone),
    objectProjectId(result.column),
    objectProjectId(result.member),
    objectProjectId(result.template),
  ].filter(Boolean));
  if (env.PROJECTS_DB && taskIds.length) {
    for (const taskId of taskIds) {
      const row = await env.PROJECTS_DB.prepare("SELECT project_id FROM project_tasks WHERE id=?").bind(taskId).first();
      if (row?.project_id) projectIds.add(row.project_id);
    }
  }
  if (!projectIds.size) return;

  let type = "PROJECT_UPDATED";
  if (["project-tasks-create", "project-task-duplicate", "project-task-from-template"].includes(action)) type = "TASK_CREATED";
  else if (["project-task-delete"].includes(action)) type = "TASK_DELETED";
  else if (["project-task-comment", "project-task-comment-update", "project-task-comment-delete"].includes(action)) type = "COMMENT_UPDATED";
  else if (["project-relation-create", "project-relation-delete"].includes(action)) type = "TASK_RELATION_UPDATED";
  else if (["project-label-attach", "project-label-detach"].includes(action)) type = "TASK_LABEL_UPDATED";
  else if (["project-task-update", "project-task-assign", "project-tasks-bulk", "project-task-link-save", "project-task-link-delete", "project-task-time-save", "project-task-attachment-upload", "project-task-attachment-delete", "project-task-custom-value-save", "project-task-watcher-update"].includes(action)) type = "TASK_UPDATED";

  for (const projectId of projectIds) {
    await notifyProjectRealtime(env, projectId, {
      type,
      projectId,
      ...(taskIds.length === 1 ? { taskId: taskIds[0] } : {}),
      ...(relation?.relatedTaskId ? { targetTaskId: relation.relatedTaskId } : {}),
    });
  }
}
