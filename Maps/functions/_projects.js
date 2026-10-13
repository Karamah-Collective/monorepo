import { allowsPermissions } from "../../shared/admin-access.mjs";

export const PROJECT_ROLES = ["viewer", "contributor", "manager", "project-admin"];
export const TASK_STATUSES = ["inbox", "assigned", "in_progress", "blocked", "completed", "cancelled"];
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"];
export const TASK_VISIBILITY = ["all", "assigned", "own"];
export const PROJECT_PERMISSION_KEYS = [
  "can_view_project", "can_read_tasks", "can_create_tasks", "can_edit_own_tasks",
  "can_edit_any_tasks", "can_assign_tasks", "can_comment", "can_relate", "can_attach",
  "can_manage_members", "can_manage_project",
];

const safe = (value, max = 5000) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const now = () => new Date().toISOString();
const newId = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const json = (value, fallback = {}) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const isAdmin = (access) => access?.permissions?.includes("*");
const has = (access, permission, aliases = []) => isAdmin(access) || [permission, ...aliases].some(item => allowsPermissions(access?.permissions || [], item));

function roleRank(role) { return { viewer: 1, contributor: 2, manager: 3, "project-admin": 4 }[role] || 0; }
function actorEmail(actor) { return safe(actor?.email, 240).toLowerCase(); }
function actorUid(actor) { return safe(actor?.uid, 180); }
function isKaramahEmail(email) { return email.endsWith("@karamahcollective.com") || email.endsWith("@karamah.local"); }
function isKaramahActor(actor) { return isKaramahEmail(actorEmail(actor)); }
function canProjectRole(role, minimum) { return roleRank(role) >= roleRank(minimum); }
export function rolePermissions(role) {
  const contributor = ["can_create_tasks", "can_edit_own_tasks", "can_comment", "can_relate", "can_attach"];
  const manager = [...contributor, "can_edit_any_tasks", "can_assign_tasks"];
  const admin = [...manager, "can_manage_members", "can_manage_project"];
  const enabled = role === "project-admin" ? admin : role === "manager" ? manager : role === "contributor" ? contributor : [];
  return Object.fromEntries(PROJECT_PERMISSION_KEYS.map(key => [key, enabled.includes(key) || key === "can_view_project" || key === "can_read_tasks"]));
}
function fullProjectPermissions() { return Object.fromEntries(PROJECT_PERMISSION_KEYS.map(key => [key, true])); }
function projectPermissionValue(row, key, fallback) { return row?.[key] === undefined || row?.[key] === null ? fallback : Boolean(Number(row[key])); }
export function normalizeProjectPermissions(role, row = null) {
  const defaults = rolePermissions(role);
  const source = row && row.permissions ? { ...row, ...row.permissions } : row;
  return {
    ...defaults,
    ...Object.fromEntries(PROJECT_PERMISSION_KEYS.map(key => [key, projectPermissionValue(source, key, defaults[key])])),
    task_visibility: TASK_VISIBILITY.includes(source?.task_visibility || source?.taskVisibility) ? (source.task_visibility || source.taskVisibility) : "all",
  };
}

function projectFromRow(row) {
  if (!row) return null;
  return {
    id: row.id, workspaceId: row.workspace_id, name: row.name, key: row.key,
    description: row.description || "", visibility: row.visibility, archivedAt: row.archived_at,
    revision: Number(row.revision || 1), createdBy: { uid: row.created_by_uid, email: row.created_by_email },
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function columnFromRow(row) { return { id: row.id, projectId: row.project_id, name: row.name, statusCategory: row.status_category, position: Number(row.position || 0) }; }
function taskFromRow(row) {
  if (!row) return null;
  return {
    id: row.id, projectId: row.project_id, taskNumber: Number(row.task_number), title: row.title,
    description: row.description || "", columnId: row.column_id, statusCategory: row.status_category,
    priority: row.priority, assignee: row.assignee_uid || row.assignee_email ? { uid: row.assignee_uid, email: row.assignee_email } : null,
    startAt: row.start_at, dueAt: row.due_at, milestoneId: row.milestone_id,
    source: row.source_type || row.source_id ? { domain: row.source_domain, type: row.source_type, id: row.source_id, action: row.source_action } : null,
    position: Number(row.position || 0), revision: Number(row.revision || 1),
    createdBy: { uid: row.created_by_uid, email: row.created_by_email }, createdAt: row.created_at,
    updatedAt: row.updated_at, completedAt: row.completed_at,
  };
}

async function getProject(db, projectId) { return db.prepare("SELECT * FROM projects WHERE id=?").bind(safe(projectId, 180)).first(); }
async function getMembership(db, projectId, actor) { return db.prepare("SELECT * FROM project_members WHERE project_id=? AND lower(email)=lower(?)").bind(projectId, actorEmail(actor)).first(); }
async function getMemberPermission(db, projectId, email) {
  try { return await db.prepare("SELECT * FROM project_member_permissions WHERE project_id=? AND lower(email)=lower(?)").bind(projectId, email).first(); } catch { return null; }
}
export async function getProjectAccess(db, projectId, actor, access) {
  const project = await getProject(db, projectId);
  if (!project) return null;
  if (isAdmin(access)) return { project, role: "project-admin", permissions: fullProjectPermissions(), taskVisibility: "all", owner: false };
  const member = await getMembership(db, projectId, actor);
  const owner = actorEmail(actor) === actorEmail({ email: project.created_by_email }) || actorUid(actor) === safe(project.created_by_uid, 180);
  if (owner) return { project, role: "project-admin", permissions: fullProjectPermissions(), taskVisibility: "all", owner: true };
  if (member?.role) {
    const row = await getMemberPermission(db, projectId, actorEmail(actor));
    const permissions = normalizeProjectPermissions(member.role, row);
    return { project, role: member.role, permissions, taskVisibility: permissions.task_visibility, owner: false };
  }
  // Workspace-visible projects are open for contribution to every verified
  // Karamah account. Restricted projects use explicit member permissions.
  if (project.visibility !== "restricted" && isKaramahActor(actor)) {
    const permissions = normalizeProjectPermissions("contributor");
    return { project, role: "contributor", permissions, taskVisibility: "all", owner: false };
  }
  return null;
}
export async function projectRole(db, projectId, actor, access) {
  return (await getProjectAccess(db, projectId, actor, access))?.role || null;
}
function canProjectCapability(projectAccess, minimum) {
  if (!projectAccess) return false;
  if (minimum === "viewer") return projectAccess.permissions.can_view_project;
  if (minimum === "contributor") return projectAccess.permissions.can_create_tasks || projectAccess.permissions.can_edit_own_tasks || projectAccess.permissions.can_edit_any_tasks || projectAccess.permissions.can_assign_tasks || projectAccess.permissions.can_comment || projectAccess.permissions.can_relate || projectAccess.permissions.can_attach || projectAccess.permissions.can_manage_members || projectAccess.permissions.can_manage_project;
  if (minimum === "manager") return projectAccess.permissions.can_edit_any_tasks || projectAccess.permissions.can_assign_tasks || projectAccess.permissions.can_manage_members || projectAccess.permissions.can_manage_project;
  if (minimum === "project-admin") return projectAccess.permissions.can_manage_members || projectAccess.permissions.can_manage_project;
  return false;
}
async function requireProject(db, projectId, actor, access, minimum = "viewer") {
  const projectAccess = await getProjectAccess(db, projectId, actor, access);
  if (!projectAccess) return { error: "Project not found or you do not have access to it.", status: 403 };
  if (!canProjectCapability(projectAccess, minimum)) return { error: "You do not have access to this project action.", status: 403 };
  return projectAccess;
}
export function taskVisibilityClause(projectAccess, actor) {
  if (projectAccess?.taskVisibility === "own") return ["(created_by_uid=? OR lower(created_by_email)=lower(?) OR assignee_uid=? OR lower(assignee_email)=lower(?))", [actorUid(actor), actorEmail(actor), actorUid(actor), actorEmail(actor)]];
  if (projectAccess?.taskVisibility === "assigned") return ["(assignee_uid=? OR lower(assignee_email)=lower(?))", [actorUid(actor), actorEmail(actor)]];
  return ["1=1", []];
}
export function canSeeTask(task, projectAccess, actor) {
  if (!projectAccess?.permissions?.can_read_tasks) return false;
  if (projectAccess.taskVisibility === "all") return true;
  const assigned = task.assignee_uid === actorUid(actor) || actorEmail({ email: task.assignee_email }) === actorEmail(actor);
  if (projectAccess.taskVisibility === "assigned") return assigned;
  return task.created_by_uid === actorUid(actor) || actorEmail({ email: task.created_by_email }) === actorEmail(actor) || assigned;
}
async function event(db, taskId, type, fromValue, toValue, note, actor) {
  await db.prepare("INSERT INTO project_task_events (id,task_id,event_type,from_value,to_value,note,actor_uid,actor_email,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(newId("event"), taskId, safe(type, 80), safe(fromValue, 300), safe(toValue, 300), safe(note, 1000), actorUid(actor), actorEmail(actor), now()).run();
}
async function notify(db, recipientEmail, projectId, taskId, type, title, body, actor) {
  const email = actorEmail({ email: recipientEmail });
  if (!email || email === actorEmail(actor)) return;
  try { await db.prepare("INSERT INTO project_notifications (id,recipient_email,project_id,task_id,notification_type,title,body) VALUES (?,?,?,?,?,?,?)").bind(newId("notification"), email, projectId, taskId, safe(type, 80), safe(title, 180), safe(body, 500)).run(); } catch { /* Notifications are additive; a missing later migration must not block task work. */ }
}
async function notifyTask(db, task, type, title, body, actor) {
  await notify(db, task.assignee_email, task.project_id, task.id, type, title, body, actor);
  try {
    const watchers = await db.prepare("SELECT email FROM project_task_watchers WHERE task_id=?").bind(task.id).all();
    for (const watcher of watchers.results || []) await notify(db, watcher.email, task.project_id, task.id, type, title, body, actor);
  } catch { /* The watcher table is introduced by the productivity migration. */ }
}
async function ensureProject(db) {
  const project = await getProject(db, "project-admin-operations");
  if (!project) return null;
  // Legacy Operations rows are copied into the dedicated Projects database
  // by the explicit migration script, never lazily across database bindings.
  return project;
  /*
  const count = await db.prepare("SELECT COUNT(*) AS count FROM project_tasks").first();
  if (Number(count?.count || 0) > 0) return project;
  const legacy = await db.prepare("SELECT * FROM operations_tasks ORDER BY created_at ASC LIMIT 1000").all();
  const columns = await db.prepare("SELECT id,status_category FROM project_columns WHERE project_id=?").bind(project.id).all();
  const byStatus = Object.fromEntries((columns.results || []).map(row => [row.status_category, row.id]));
  for (const row of legacy.results || []) {
    const status = TASK_STATUSES.includes(row.status) ? row.status : "inbox";
    const duplicate = await db.prepare("SELECT id FROM project_tasks WHERE id=? OR dedupe_key=?").bind(row.id, row.dedupe_key || null).first();
    if (duplicate) continue;
    const n = await db.prepare("SELECT COALESCE(MAX(task_number),0)+1 AS next FROM project_tasks WHERE project_id=?").bind(project.id).first();
    await db.prepare(`INSERT INTO project_tasks
      (id,project_id,task_number,title,description,column_id,status_category,priority,assignee_uid,assignee_email,due_at,source_domain,source_type,source_id,source_action,dedupe_key,position,created_by_uid,created_by_email,created_at,updated_at,completed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      row.id, project.id, Number(n?.next || 1), row.title, row.summary || "", byStatus[status] || byStatus.inbox,
      status, TASK_PRIORITIES.includes(row.priority) ? row.priority : "normal", row.assignee_uid || "", row.assignee_email || "", row.due_at || null,
      row.domain || "", row.source_type || "", row.source_id || "", row.source_action || "", row.dedupe_key || `${row.id}:legacy`, 0,
      row.created_by_uid || "", row.created_by_email || "", row.created_at || now(), row.updated_at || now(), row.completed_at || null,
    ).run();
    const events = await db.prepare("SELECT * FROM operations_task_events WHERE task_id=?").bind(row.id).all();
    for (const item of events.results || []) await db.prepare("INSERT OR IGNORE INTO project_task_events (id,task_id,event_type,from_value,to_value,note,actor_uid,actor_email,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(`legacy_${item.id}`, row.id, item.event_type, item.from_value || "", item.to_value || "", item.note || "", item.actor_uid || "", item.actor_email || "", item.created_at || now()).run();
  }
  return project;
  */
}

export async function listProjects(db, actor, access) {
  await ensureProject(db);
  const { results } = await db.prepare("SELECT * FROM projects WHERE archived_at IS NULL ORDER BY updated_at DESC").all();
  const projects = [];
  for (const row of results || []) if (await projectRole(db, row.id, actor, access)) projects.push(projectFromRow(row));
  return { projects };
}
export async function searchProjectWorkspace(db, data, actor, access) {
  const query = safe(data.query || data.search, 120).toLowerCase(); if (!query) return { projects: [], tasks: [] };
  const projectsResult = await listProjects(db, actor, access); const projects = projectsResult.projects || []; const taskMatches = [];
  for (const project of projects.slice(0, 40)) {
    const allowed = await requireProject(db, project.id, actor, access); if (allowed.error) continue;
    const [visibilitySql, visibilityBind] = taskVisibilityClause(allowed, actor); const needle = `%${query}%`;
    const rows = await db.prepare(`SELECT * FROM project_tasks WHERE project_id=? AND ${visibilitySql} AND (lower(title) LIKE ? OR lower(description) LIKE ?) ORDER BY updated_at DESC LIMIT 25`).bind(project.id, ...visibilityBind, needle, needle).all();
    for (const row of rows.results || []) taskMatches.push({ ...taskFromRow(row), project: { id: project.id, key: project.key, name: project.name } });
  }
  return { projects: projects.filter(project => `${project.name} ${project.key} ${project.description}`.toLowerCase().includes(query)), tasks: taskMatches.slice(0, 100) };
}
export async function getProjectWorkspace(db, projectId, actor, access) {
  const allowed = await requireProject(db, projectId, actor, access);
  if (allowed.error) return allowed;
  const [visibilitySql, visibilityBind] = taskVisibilityClause(allowed, actor);
  const [columns, milestones, labels, count] = await Promise.all([
    db.prepare("SELECT * FROM project_columns WHERE project_id=? ORDER BY position,id").bind(projectId).all(),
    db.prepare("SELECT * FROM project_milestones WHERE project_id=? ORDER BY due_at IS NULL,due_at,name").bind(projectId).all(),
    db.prepare("SELECT * FROM project_labels WHERE project_id=? ORDER BY name").bind(projectId).all(),
    db.prepare(`SELECT COUNT(*) AS count FROM project_tasks WHERE project_id=? AND ${visibilitySql}`).bind(projectId, ...visibilityBind).first(),
  ]);
  return { project: projectFromRow(allowed.project), role: allowed.role, permissions: allowed.permissions, taskVisibility: allowed.taskVisibility, columns: (columns.results || []).map(columnFromRow), milestones: milestones.results || [], labels: labels.results || [], taskCount: Number(count?.count || 0) };
}
export async function createProject(db, data, actor, access) {
  if (!isKaramahActor(actor) && !has(access, "operations.projects.write", ["operations.tasks.write"])) return { error: "You cannot create projects." };
  const name = safe(data.name, 160); if (!name) return { error: "A project name is required." };
  const key = safe(data.key || name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16), 32).toUpperCase() || "PROJECT";
  const projectId = newId("project"); const workspaceId = "workspace-default"; const timestamp = now();
  try {
    await db.prepare("INSERT INTO projects (id,workspace_id,name,key,description,visibility,created_by_uid,created_by_email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(projectId, workspaceId, name, key, safe(data.description, 1000), data.visibility === "restricted" ? "restricted" : "workspace", actorUid(actor), actorEmail(actor), timestamp, timestamp).run();
    for (const [index, [suffix, label, status]] of [["inbox","Inbox","inbox"],["progress","In progress","in_progress"],["blocked","Blocked","blocked"],["done","Done","completed"],["cancelled","Cancelled","cancelled"]].entries()) await db.prepare("INSERT INTO project_columns (id,project_id,name,status_category,position) VALUES (?,?,?,?,?)").bind(`${projectId}-${suffix}`, projectId, label, status, (index + 1) * 10).run();
    await db.prepare("INSERT OR IGNORE INTO project_members (project_id,user_uid,email,role,created_by_uid) VALUES (?,?,?,?,?)").bind(projectId, actorUid(actor), actorEmail(actor), "project-admin", actorUid(actor)).run();
    return { success: true, project: projectFromRow(await getProject(db, projectId)) };
  } catch (error) { return { error: String(error?.message || "Could not create project.") }; }
}
export async function updateProject(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access, "project-admin"); if (allowed.error) return allowed;
  if (!allowed.permissions.can_manage_project) return { error: "You cannot manage this project.", status: 403 };
  if (data.expectedRevision == null || data.expectedRevision === "") return { error: "expectedRevision is required.", status: 428, conflict: projectFromRow(allowed.project) };
  if (Number(data.expectedRevision) !== Number(allowed.project.revision)) return { error: "Project changed. Refresh and try again.", status: 409, conflict: projectFromRow(allowed.project) };
  const name = data.name !== undefined ? safe(data.name, 160) : allowed.project.name;
  const description = data.description !== undefined ? safe(data.description, 1000) : allowed.project.description;
  const visibility = data.visibility === "restricted" ? "restricted" : data.visibility === "workspace" ? "workspace" : allowed.project.visibility;
  const archivedAt = data.archived ? (allowed.project.archived_at || now()) : data.archived === false ? null : allowed.project.archived_at;
  await db.prepare("UPDATE projects SET name=?,description=?,visibility=?,archived_at=?,revision=revision+1,updated_at=? WHERE id=?").bind(name, description, visibility, archivedAt, now(), data.projectId).run();
  return { success: true, project: projectFromRow(await getProject(db, data.projectId)) };
}
export async function listProjectTasks(db, data, actor, access) {
  await ensureProject(db);
  const allowed = await requireProject(db, data.projectId, actor, access); if (allowed.error) return allowed;
  const [visibilitySql, visibilityBind] = taskVisibilityClause(allowed, actor);
  const where = ["project_id=?", visibilitySql]; const bind = [data.projectId, ...visibilityBind];
  if (data.status) { where.push("status_category=?"); bind.push(safe(data.status, 40)); }
  if (data.columnId) { where.push("column_id=?"); bind.push(safe(data.columnId, 180)); }
  if (data.assignee === "me") { where.push("lower(assignee_email)=lower(?)"); bind.push(actorEmail(actor)); }
  if (data.priority) { where.push("priority=?"); bind.push(safe(data.priority, 40)); }
  if (data.search) { const q = `%${safe(data.search, 100).toLowerCase()}%`; where.push("(lower(title) LIKE ? OR lower(description) LIKE ?)"); bind.push(q, q); }
  const result = await db.prepare(`SELECT * FROM project_tasks WHERE ${where.join(" AND ")} ORDER BY position,task_number DESC LIMIT 500`).bind(...bind).all();
  return { project: projectFromRow(allowed.project), role: allowed.role, permissions: allowed.permissions, taskVisibility: allowed.taskVisibility, tasks: (result.results || []).map(taskFromRow) };
}
async function getTask(db, taskId) { return db.prepare("SELECT * FROM project_tasks WHERE id=?").bind(safe(taskId, 220)).first(); }
async function nextTaskNumber(db, projectId) { const row = await db.prepare("SELECT COALESCE(MAX(task_number),0)+1 AS next FROM project_tasks WHERE project_id=?").bind(projectId).first(); return Number(row?.next || 1); }
export async function getProjectTask(db, taskId, actor, access) {
  await ensureProject(db);
  const task = await getTask(db, taskId); if (!task) return { error: "Task not found.", status: 404 };
  const allowed = await requireProject(db, task.project_id, actor, access); if (allowed.error) return allowed;
  if (!canSeeTask(task, allowed, actor)) return { error: "You do not have access to this task.", status: 403 };
  const [comments, labels, relations, links, events, customFields] = await Promise.all([
    db.prepare("SELECT * FROM project_task_comments WHERE task_id=? AND deleted_at IS NULL ORDER BY created_at").bind(taskId).all(),
    db.prepare("SELECT l.* FROM project_labels l JOIN project_task_labels tl ON tl.label_id=l.id WHERE tl.task_id=? ORDER BY l.name").bind(taskId).all(),
    db.prepare("SELECT * FROM project_task_relations WHERE task_id=? OR related_task_id=? ORDER BY created_at").bind(taskId, taskId).all(),
    db.prepare("SELECT * FROM project_task_links WHERE task_id=? ORDER BY created_at DESC").bind(taskId).all(),
    db.prepare("SELECT * FROM project_task_events WHERE task_id=? ORDER BY created_at DESC LIMIT 200").bind(taskId).all(),
    db.prepare("SELECT f.*,v.value_text FROM project_custom_fields f LEFT JOIN project_task_custom_values v ON v.field_id=f.id AND v.task_id=? WHERE f.project_id=? ORDER BY f.position,f.name").bind(taskId, task.project_id).all(),
  ]);
  const visibleRelations = await filterVisibleRelations(db, relations.results || [], allowed, actor);
  return { task: taskFromRow(task), project: projectFromRow(allowed.project), role: allowed.role, permissions: allowed.permissions, comments: comments.results || [], labels: labels.results || [], relations: visibleRelations, links: links.results || [], events: events.results || [], customFields: (customFields.results || []).map(field => ({ ...field, options: json(field.options_json, []) })) };
}
export async function createProjectTask(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access, "contributor"); if (allowed.error) return allowed;
  if (!allowed.permissions.can_create_tasks && !has(access, "operations.tasks.create", ["operations.tasks.write"])) return { error: "You cannot create tasks." };
  const column = data.columnId ? await db.prepare("SELECT * FROM project_columns WHERE id=? AND project_id=?").bind(data.columnId, data.projectId).first() : await db.prepare("SELECT * FROM project_columns WHERE project_id=? ORDER BY position LIMIT 1").bind(data.projectId).first();
  if (!column) return { error: "A valid project column is required." };
  const title = safe(data.title, 240); if (!title) return { error: "A task title is required." };
  const assigneeEmail = actorEmail({ email: data.assigneeEmail });
  if (assigneeEmail && !isKaramahEmail(assigneeEmail)) return { error: "Tasks can only be assigned to Karamah members.", status: 400 };
  const milestoneId = safe(data.milestoneId, 180) || null;
  if (milestoneId && !await db.prepare("SELECT id FROM project_milestones WHERE id=? AND project_id=?").bind(milestoneId, data.projectId).first()) return { error: "The milestone does not belong to this project.", status: 400 };
  const id = newId("task"); const timestamp = now();
  await db.prepare(`INSERT INTO project_tasks (id,project_id,task_number,title,description,column_id,status_category,priority,assignee_uid,assignee_email,start_at,due_at,milestone_id,source_domain,source_type,source_id,source_action,dedupe_key,position,created_by_uid,created_by_email,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, data.projectId, await nextTaskNumber(db, data.projectId), title, safe(data.description, 10000), column.id, column.status_category, TASK_PRIORITIES.includes(data.priority) ? data.priority : "normal", safe(data.assigneeUid, 180), assigneeEmail, data.startAt || null, data.dueAt || null, milestoneId, safe(data.sourceDomain, 80), safe(data.sourceType, 120), safe(data.sourceId, 180), safe(data.sourceAction, 120), safe(data.dedupeKey, 300) || null, Number(data.position || 0), actorUid(actor), actorEmail(actor), timestamp, timestamp).run();
  await event(db, id, "created", "", column.status_category, "", actor);
  return { success: true, task: taskFromRow(await getTask(db, id)) };
}
export async function updateProjectTask(db, data, actor, access) {
  const task = await getTask(db, data.id); if (!task) return { error: "Task not found.", status: 404 };
  const allowed = await requireProject(db, task.project_id, actor, access, "contributor"); if (allowed.error) return allowed;
  if (!canSeeTask(task, allowed, actor)) return { error: "You do not have access to this task.", status: 403 };
  if (data.expectedRevision == null || data.expectedRevision === "") return { error: "expectedRevision is required.", status: 428, conflict: taskFromRow(task) };
  if (Number(data.expectedRevision) !== Number(task.revision)) return { error: "Task changed. Refresh and try again.", status: 409, conflict: taskFromRow(task) };
  const isOwn = task.assignee_uid === actorUid(actor) || task.assignee_email === actorEmail(actor) || task.created_by_uid === actorUid(actor) || task.created_by_email === actorEmail(actor);
  const isAssignmentOnly = Object.keys(data).every(key => ["id", "expectedRevision", "assigneeUid", "assigneeEmail", "statusCategory", "status", "note"].includes(key));
  const canEdit = isAdmin(access) || allowed.permissions.can_edit_any_tasks || (allowed.permissions.can_edit_own_tasks && isOwn) || (allowed.permissions.can_assign_tasks && isAssignmentOnly);
  if (!canEdit) return { error: "You do not have write access to this task.", status: 403 };
  if (data.assigneeEmail !== undefined) {
    const assigneeEmail = actorEmail({ email: data.assigneeEmail });
    if (assigneeEmail && !isKaramahEmail(assigneeEmail)) return { error: "Tasks can only be assigned to Karamah members.", status: 400 };
  }
  if (data.milestoneId !== undefined) {
    const milestoneId = safe(data.milestoneId, 180);
    if (milestoneId && !await db.prepare("SELECT id FROM project_milestones WHERE id=? AND project_id=?").bind(milestoneId, task.project_id).first()) return { error: "The milestone does not belong to this project.", status: 400 };
  }
  const column = data.columnId ? await db.prepare("SELECT * FROM project_columns WHERE id=? AND project_id=?").bind(data.columnId, task.project_id).first() : null;
  const status = column?.status_category || (TASK_STATUSES.includes(data.statusCategory || data.status) ? (data.statusCategory || data.status) : task.status_category);
  const priority = TASK_PRIORITIES.includes(data.priority) ? data.priority : task.priority;
  const values = [data.title !== undefined ? safe(data.title, 240) : task.title, data.description !== undefined ? safe(data.description, 10000) : task.description, column?.id || task.column_id, status, priority, data.assigneeUid !== undefined ? safe(data.assigneeUid, 180) : task.assignee_uid, data.assigneeEmail !== undefined ? actorEmail({ email: data.assigneeEmail }) : task.assignee_email, data.startAt !== undefined ? data.startAt || null : task.start_at, data.dueAt !== undefined ? data.dueAt || null : task.due_at, data.milestoneId !== undefined ? safe(data.milestoneId, 180) || null : task.milestone_id, data.position !== undefined ? Number(data.position) : Number(task.position || 0), status === "completed" ? (task.completed_at || now()) : null, Number(task.revision || 1) + 1, now(), task.id];
  await db.prepare("UPDATE project_tasks SET title=?,description=?,column_id=?,status_category=?,priority=?,assignee_uid=?,assignee_email=?,start_at=?,due_at=?,milestone_id=?,position=?,completed_at=?,revision=?,updated_at=? WHERE id=?").bind(...values).run();
  if (status !== task.status_category) await event(db, task.id, "status", task.status_category, status, data.note, actor);
  if (priority !== task.priority) await event(db, task.id, "priority", task.priority, priority, data.note, actor);
  if ((values[6] || "") !== (task.assignee_email || "")) await notifyTask(db, { ...task, assignee_email: values[6] }, "assignment", "Task assigned", task.title, actor);
  if (status === "completed" && task.status_category !== "completed") await notifyTask(db, task, "completed", "Task completed", task.title, actor);
  return { success: true, task: taskFromRow(await getTask(db, task.id)) };
}
export async function deleteProjectTask(db, data, actor, access) {
  const task = await getTask(db, data.id); if (!task) return { error: "Task not found.", status: 404 };
  const allowed = await requireProject(db, task.project_id, actor, access, "manager"); if (allowed.error) return allowed;
  if (data.expectedRevision == null || data.expectedRevision === "") return { error: "expectedRevision is required.", status: 428, conflict: taskFromRow(task) };
  if (Number(data.expectedRevision) !== Number(task.revision || 1)) return { error: "Task changed. Refresh and try again.", status: 409, conflict: taskFromRow(task) };
  if (!allowed.permissions.can_manage_project && !allowed.permissions.can_edit_any_tasks) return { error: "You cannot remove tasks.", status: 403 };
  await db.prepare("UPDATE project_tasks SET status_category='cancelled',revision=revision+1,updated_at=? WHERE id=?").bind(now(), task.id).run();
  await event(db, task.id, "deleted", task.status_category, "cancelled", data.reason, actor);
  return { success: true, task: taskFromRow(await getTask(db, task.id)) };
}
export async function bulkUpdateProjectTasks(db, data, actor, access) {
  const requestId = safe(data.idempotencyKey || data.requestId, 220); if (!requestId) return { error: "idempotencyKey is required." };
  const prior = await db.prepare("SELECT result_json FROM project_task_idempotency WHERE request_id=? AND actor_uid=?").bind(requestId, actorUid(actor)).first(); if (prior) return json(prior.result_json, { success: false });
  const ids = [...new Set((Array.isArray(data.taskIds) ? data.taskIds : []).map(item => safe(item, 220)).filter(Boolean))].slice(0, 100); const results = [];
  for (const id of ids) { const result = await updateProjectTask(db, { ...data.changes, id }, actor, access); results.push({ taskId: id, success: !!result.success, error: result.error || null, conflict: result.conflict || null }); }
  const output = { success: results.every(item => item.success), results, succeeded: results.filter(item => item.success).length, failed: results.filter(item => !item.success).length };
  await db.prepare("INSERT INTO project_task_idempotency (request_id,actor_uid,action,result_json) VALUES (?,?,?,?)").bind(requestId, actorUid(actor), safe(data.action || "bulk_update", 120), JSON.stringify(output)).run();
  return output;
}
export async function addProjectTaskComment(db, data, actor, access) {
  const task = await getTask(db, data.taskId); if (!task) return { error: "Task not found.", status: 404 };
  const allowed = await requireProject(db, task.project_id, actor, access, "contributor"); if (allowed.error) return allowed;
  if (!canSeeTask(task, allowed, actor) || !allowed.permissions.can_comment) return { error: "You cannot comment on this task.", status: 403 };
  const body = safe(data.body, 5000); if (!body) return { error: "Comment text is required." };
  const comment = { id: newId("comment"), taskId: task.id, body, authorUid: actorUid(actor), authorEmail: actorEmail(actor), createdAt: now() };
  await db.prepare("INSERT INTO project_task_comments (id,task_id,body,author_uid,author_email,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(comment.id, task.id, body, comment.authorUid, comment.authorEmail, comment.createdAt, comment.createdAt).run();
  await event(db, task.id, "comment", "", "", body.slice(0, 120), actor); await notifyTask(db, task, "comment", "New task comment", body, actor); return { success: true, comment };
}
export async function listProjectTaskComments(db, data, actor, access) {
  const allowed = await projectTaskAccess(db, data.taskId, actor, access); if (allowed.error) return allowed;
  const result = await db.prepare("SELECT * FROM project_task_comments WHERE task_id=? AND deleted_at IS NULL ORDER BY created_at").bind(data.taskId).all();
  return { comments: result.results || [] };
}
export async function updateProjectTaskComment(db, data, actor, access) {
  const comment = await db.prepare("SELECT * FROM project_task_comments WHERE id=? AND deleted_at IS NULL").bind(safe(data.id, 180)).first();
  if (!comment) return { error: "Comment not found.", status: 404 };
  const allowed = await projectTaskAccess(db, comment.task_id, actor, access, "contributor"); if (allowed.error) return allowed;
  const canEdit = comment.author_uid === actorUid(actor) || comment.author_email === actorEmail(actor) || allowed.permissions.can_edit_any_tasks || allowed.permissions.can_manage_project;
  if (!canEdit) return { error: "You cannot edit this comment.", status: 403 };
  const body = safe(data.body, 5000); if (!body) return { error: "Comment text is required." };
  await db.prepare("UPDATE project_task_comments SET body=?,updated_at=? WHERE id=?").bind(body, now(), comment.id).run();
  await event(db, comment.task_id, "comment_updated", comment.body, body.slice(0, 120), "", actor);
  return { success: true, comment: await db.prepare("SELECT * FROM project_task_comments WHERE id=?").bind(comment.id).first() };
}
export async function deleteProjectTaskComment(db, data, actor, access) {
  const comment = await db.prepare("SELECT * FROM project_task_comments WHERE id=? AND deleted_at IS NULL").bind(safe(data.id, 180)).first();
  if (!comment) return { error: "Comment not found.", status: 404 };
  const allowed = await projectTaskAccess(db, comment.task_id, actor, access, "contributor"); if (allowed.error) return allowed;
  const canDelete = comment.author_uid === actorUid(actor) || comment.author_email === actorEmail(actor) || allowed.permissions.can_manage_project;
  if (!canDelete) return { error: "You cannot delete this comment.", status: 403 };
  await db.prepare("UPDATE project_task_comments SET deleted_at=?,updated_at=? WHERE id=?").bind(now(), now(), comment.id).run();
  await event(db, comment.task_id, "comment_deleted", comment.id, "", "", actor);
  return { success: true };
}
export async function listProjectMilestones(db, data, actor, access) { const allowed = await requireProject(db, data.projectId, actor, access); if (allowed.error) return allowed; const result = await db.prepare("SELECT * FROM project_milestones WHERE project_id=? ORDER BY due_at IS NULL,due_at,name").bind(data.projectId).all(); return { milestones: result.results || [] }; }
export async function createProjectMilestone(db, data, actor, access) { const allowed = await requireProject(db, data.projectId, actor, access, "manager"); if (allowed.error) return allowed; const milestone = { id: newId("milestone"), projectId: data.projectId, name: safe(data.name, 160), description: safe(data.description, 1000), startAt: data.startAt || null, dueAt: data.dueAt || null, status: "planned" }; if (!milestone.name) return { error: "Milestone name is required." }; await db.prepare("INSERT INTO project_milestones (id,project_id,name,description,start_at,due_at,created_by_uid) VALUES (?,?,?,?,?,?,?)").bind(milestone.id,milestone.projectId,milestone.name,milestone.description,milestone.startAt,milestone.dueAt,actorUid(actor)).run(); return { success: true, milestone }; }
export async function updateProjectMilestone(db, data, actor, access) {
  const row = await db.prepare("SELECT * FROM project_milestones WHERE id=?").bind(safe(data.id, 180)).first(); if (!row) return { error: "Milestone not found.", status: 404 };
  const allowed = await requireProject(db, row.project_id, actor, access, "manager"); if (allowed.error) return allowed;
  if (data.expectedRevision == null || data.expectedRevision === "") return { error: "expectedRevision is required.", status: 428, conflict: row };
  if (Number(data.expectedRevision) !== Number(row.revision || 1)) return { error: "Milestone changed. Refresh and try again.", status: 409, conflict: row };
  const status = ["planned", "active", "completed", "cancelled"].includes(data.status) ? data.status : row.status;
  await db.prepare("UPDATE project_milestones SET name=?,description=?,start_at=?,due_at=?,status=?,revision=revision+1,updated_at=? WHERE id=?").bind(data.name !== undefined ? safe(data.name, 160) : row.name, data.description !== undefined ? safe(data.description, 1000) : row.description, data.startAt !== undefined ? data.startAt || null : row.start_at, data.dueAt !== undefined ? data.dueAt || null : row.due_at, status, now(), row.id).run();
  return { success: true, milestone: await db.prepare("SELECT * FROM project_milestones WHERE id=?").bind(row.id).first() };
}
export async function deleteProjectMilestone(db, data, actor, access) {
  const row = await db.prepare("SELECT * FROM project_milestones WHERE id=?").bind(safe(data.id, 180)).first(); if (!row) return { error: "Milestone not found.", status: 404 };
  const allowed = await requireProject(db, row.project_id, actor, access, "manager"); if (allowed.error) return allowed;
  if (data.expectedRevision == null || data.expectedRevision === "") return { error: "expectedRevision is required.", status: 428, conflict: row };
  if (Number(data.expectedRevision) !== Number(row.revision || 1)) return { error: "Milestone changed. Refresh and try again.", status: 409, conflict: row };
  await db.prepare("UPDATE project_tasks SET milestone_id=NULL WHERE milestone_id=?").bind(row.id).run(); await db.prepare("DELETE FROM project_milestones WHERE id=?").bind(row.id).run(); return { success: true };
}
export async function listProjectActivity(db, data, actor, access) { const task = await getTask(db, data.taskId); if (!task) return { error: "Task not found.", status: 404 }; const allowed = await requireProject(db, task.project_id, actor, access); if (allowed.error) return allowed; if (!canSeeTask(task, allowed, actor)) return { error: "You do not have access to this task.", status: 403 }; const result = await db.prepare("SELECT * FROM project_task_events WHERE task_id=? ORDER BY created_at DESC LIMIT 200").bind(task.id).all(); return { events: result.results || [] }; }
export async function listProjectMembers(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access); if (allowed.error) return allowed;
  const result = await db.prepare("SELECT m.user_uid,m.email,m.role,m.created_at,m.updated_at,p.* FROM project_members m LEFT JOIN project_member_permissions p ON p.project_id=m.project_id AND lower(p.email)=lower(m.email) WHERE m.project_id=? ORDER BY lower(m.email)").bind(data.projectId).all();
  return { members: (result.results || []).map(member => ({
    userUid: member.user_uid, email: member.email, role: member.role, createdAt: member.created_at, updatedAt: member.updated_at,
    permissions: normalizeProjectPermissions(member.role, member), taskVisibility: TASK_VISIBILITY.includes(member.task_visibility) ? member.task_visibility : "all",
  })) };
}
export async function updateProjectMember(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access, "project-admin"); if (allowed.error) return allowed;
  if (!allowed.permissions.can_manage_members) return { error: "You cannot manage project members.", status: 403 };
  const member = data.member || data; const targetEmail = actorEmail({ email: member.email }); const role = PROJECT_ROLES.includes(member.role) ? member.role : "viewer";
  if (!targetEmail || !isKaramahEmail(targetEmail)) return { error: "A Karamah email is required." };
  const permissions = normalizeProjectPermissions(role, member.permissions || member);
  await db.prepare("INSERT INTO project_members (project_id,user_uid,email,role,created_by_uid,updated_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(project_id,email) DO UPDATE SET user_uid=excluded.user_uid,role=excluded.role,updated_at=datetime('now')").bind(data.projectId, safe(member.userUid, 180), targetEmail, role, actorUid(actor)).run();
  await db.prepare(`INSERT INTO project_member_permissions (project_id,email,${PROJECT_PERMISSION_KEYS.join(",")},task_visibility,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(project_id,email) DO UPDATE SET ${PROJECT_PERMISSION_KEYS.map(key => `${key}=excluded.${key}`).join(",")},task_visibility=excluded.task_visibility,updated_at=datetime('now')`)
    .bind(data.projectId, targetEmail, ...PROJECT_PERMISSION_KEYS.map(key => permissions[key] ? 1 : 0), permissions.task_visibility).run();
  return { success: true, member: { projectId: data.projectId, userUid: safe(member.userUid, 180), email: targetEmail, role, permissions, taskVisibility: permissions.task_visibility } };
}
export async function removeProjectMember(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access, "project-admin"); if (allowed.error) return allowed;
  if (!allowed.permissions.can_manage_members) return { error: "You cannot manage project members.", status: 403 };
  const email = actorEmail({ email: data.email }); if (!email || email === actorEmail({ email: allowed.project.created_by_email })) return { error: "The project owner cannot be removed." };
  await db.prepare("DELETE FROM project_member_permissions WHERE project_id=? AND lower(email)=lower(?)").bind(data.projectId, email).run();
  await db.prepare("DELETE FROM project_members WHERE project_id=? AND lower(email)=lower(?)").bind(data.projectId, email).run();
  return { success: true };
}
export async function listProjectColumns(db, data, actor, access) { const allowed = await requireProject(db, data.projectId, actor, access); if (allowed.error) return allowed; const result = await db.prepare("SELECT * FROM project_columns WHERE project_id=? ORDER BY position,id").bind(data.projectId).all(); return { columns: (result.results || []).map(columnFromRow) }; }
export async function createProjectColumn(db, data, actor, access) { const allowed = await requireProject(db, data.projectId, actor, access, "manager"); if (allowed.error) return allowed; const name = safe(data.name, 120); if (!name) return { error: "Column name is required." }; const column = { id: newId("column"), projectId: data.projectId, name, statusCategory: TASK_STATUSES.includes(data.statusCategory) ? data.statusCategory : "inbox", position: Number(data.position || 0) }; await db.prepare("INSERT INTO project_columns (id,project_id,name,status_category,position) VALUES (?,?,?,?,?)").bind(column.id,column.projectId,column.name,column.statusCategory,column.position).run(); return { success: true, column }; }
export async function updateProjectColumn(db, data, actor, access) { const column = await db.prepare("SELECT * FROM project_columns WHERE id=?").bind(safe(data.id,180)).first(); if (!column) return { error: "Column not found.", status: 404 }; const allowed = await requireProject(db, column.project_id, actor, access, "manager"); if (allowed.error) return allowed; await db.prepare("UPDATE project_columns SET name=?,status_category=?,position=?,updated_at=datetime('now') WHERE id=?").bind(data.name !== undefined ? safe(data.name,120) : column.name, TASK_STATUSES.includes(data.statusCategory) ? data.statusCategory : column.status_category, data.position !== undefined ? Number(data.position) : column.position, column.id).run(); return { success: true, column: columnFromRow(await db.prepare("SELECT * FROM project_columns WHERE id=?").bind(column.id).first()) }; }
export async function deleteProjectColumn(db, data, actor, access) {
  const column = await db.prepare("SELECT * FROM project_columns WHERE id=?").bind(safe(data.id, 180)).first();
  if (!column) return { error: "Column not found.", status: 404 };
  const allowed = await requireProject(db, column.project_id, actor, access, "manager");
  if (allowed.error) return allowed;
  const taskCount = await db.prepare("SELECT COUNT(*) AS count FROM project_tasks WHERE column_id=? AND status_category NOT IN ('completed','cancelled')").bind(column.id).first();
  if (Number(taskCount?.count || 0) > 0) return { error: "Move active tasks before deleting this column.", status: 409 };
  await db.prepare("DELETE FROM project_columns WHERE id=?").bind(column.id).run();
  return { success: true };
}
export async function listProjectRelations(db, data, actor, access) { const task = await getTask(db, data.taskId); if (!task) return { error: "Task not found.", status: 404 }; const allowed = await requireProject(db, task.project_id, actor, access); if (allowed.error) return allowed; if (!canSeeTask(task, allowed, actor)) return { error: "You do not have access to this task.", status: 403 }; const result = await db.prepare("SELECT * FROM project_task_relations WHERE task_id=? OR related_task_id=? ORDER BY created_at").bind(task.id, task.id).all(); return { relations: await filterVisibleRelations(db, result.results || [], allowed, actor) }; }
export async function createProjectRelation(db, data, actor, access) { const task = await getTask(db, data.taskId); const related = await getTask(db, data.relatedTaskId); if (!task || !related || task.project_id !== related.project_id) return { error: "Both tasks must exist in the same project." }; const allowed = await requireProject(db, task.project_id, actor, access, "contributor"); if (allowed.error) return allowed; if (!allowed.permissions.can_relate || !canSeeTask(task, allowed, actor) || !canSeeTask(related, allowed, actor)) return { error: "You cannot relate these tasks.", status: 403 }; const relation = ["blocks","blocked_by","relates_to","subtask"].includes(data.relationType) ? data.relationType : "relates_to"; if (task.id === related.id) return { error: "A task cannot relate to itself." }; await db.prepare("INSERT OR IGNORE INTO project_task_relations (task_id,related_task_id,relation_type,created_by_uid) VALUES (?,?,?,?)").bind(task.id, related.id, relation, actorUid(actor)).run(); return { success: true, relation: { taskId: task.id, relatedTaskId: related.id, relationType: relation } }; }
export async function deleteProjectRelation(db, data, actor, access) {
  const task = await getTask(db, data.taskId); if (!task) return { error: "Task not found.", status: 404 };
  const related = await getTask(db, data.relatedTaskId);
  const allowed = await requireProject(db, task.project_id, actor, access, "contributor"); if (allowed.error) return allowed;
  if (!related || related.project_id !== task.project_id || !canSeeTask(task, allowed, actor) || !canSeeTask(related, allowed, actor) || !allowed.permissions.can_relate) return { error: "You cannot remove this task relation.", status: 403 };
  await db.prepare("DELETE FROM project_task_relations WHERE task_id=? AND related_task_id=? AND relation_type=?").bind(task.id, safe(data.relatedTaskId, 180), safe(data.relationType, 40)).run(); return { success: true };
}
export async function listProjectTaskLinks(db, data, actor, access) {
  const allowed = await projectTaskAccess(db, data.taskId, actor, access);
  if (allowed.error) return allowed;
  const result = await db.prepare("SELECT * FROM project_task_links WHERE task_id=? ORDER BY created_at DESC").bind(data.taskId).all();
  return {
    links: (result.results || []).map((row) => ({
      id: `${row.task_id}:${row.link_type}:${row.link_id}`,
      taskId: row.task_id,
      integrationId: null,
      resourceType: row.link_type,
      externalId: row.link_id,
      url: row.url,
      title: row.label || row.url,
      metadata: null,
      createdAt: row.created_at,
      updatedAt: row.created_at,
    })),
  };
}
export async function saveProjectTaskLink(db, data, actor, access) {
  const allowed = await projectTaskAccess(db, data.taskId, actor, access, "contributor");
  if (allowed.error) return allowed;
  if (!allowed.permissions.can_edit_own_tasks && !allowed.permissions.can_edit_any_tasks) return { error: "You cannot add task links.", status: 403 };
  const url = normalizeProjectExternalUrl(data.url);
  if (!url) return { error: "Link URLs must use HTTP or HTTPS." };
  const label = safe(data.title || data.label || url, 240);
  const linkType = safe(data.resourceType || data.linkType || "url", 80);
  const linkId = safe(data.externalId || data.linkId || url, 500);
  await db.prepare("INSERT INTO project_task_links (task_id,link_type,link_id,url,label,created_by_uid) VALUES (?,?,?,?,?,?) ON CONFLICT(task_id,link_type,link_id) DO UPDATE SET url=excluded.url,label=excluded.label").bind(allowed.task.id, linkType, linkId, url, label, actorUid(actor)).run();
  return { success: true, link: { id: `${allowed.task.id}:${linkType}:${linkId}`, taskId: allowed.task.id, integrationId: null, resourceType: linkType, externalId: linkId, url, title: label, metadata: null } };
}

export function normalizeProjectExternalUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
export async function deleteProjectTaskLink(db, data, actor, access) {
  const allowed = await projectTaskAccess(db, data.taskId, actor, access, "contributor");
  if (allowed.error) return allowed;
  if (!allowed.permissions.can_edit_own_tasks && !allowed.permissions.can_edit_any_tasks) return { error: "You cannot remove task links.", status: 403 };
  const result = await db.prepare("SELECT * FROM project_task_links WHERE task_id=?").bind(allowed.task.id).all();
  const row = (result.results || []).find((candidate) => `${candidate.task_id}:${candidate.link_type}:${candidate.link_id}` === String(data.id) || candidate.link_id === String(data.id));
  if (!row) return { error: "Task link not found.", status: 404 };
  await db.prepare("DELETE FROM project_task_links WHERE task_id=? AND link_type=? AND link_id=?").bind(allowed.task.id, row.link_type, row.link_id).run();
  return { success: true };
}
export async function listProjectLabels(db, data, actor, access) { const allowed = await requireProject(db, data.projectId, actor, access); if (allowed.error) return allowed; const result = await db.prepare("SELECT * FROM project_labels WHERE project_id=? ORDER BY name").bind(data.projectId).all(); return { labels: result.results || [] }; }
export async function saveProjectLabel(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access, "manager"); if (allowed.error) return allowed;
  const name = safe(data.name, 80); if (!name) return { error: "A label name is required." }; const existing = await db.prepare("SELECT id FROM project_labels WHERE project_id=? AND lower(name)=lower(?)").bind(data.projectId, name).first(); const requestedId = safe(data.id, 180); if (existing && requestedId && existing.id !== requestedId) return { error: "A label with this name already exists." }; const id = requestedId || existing?.id || newId("label");
  await db.prepare("INSERT INTO project_labels (id,project_id,name,color) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color").bind(id, data.projectId, name, safe(data.color || "#2b745c", 20)).run(); return { success: true, label: await db.prepare("SELECT * FROM project_labels WHERE id=?").bind(id).first() };
}
export async function detachProjectLabel(db, data, actor, access) {
  const task = await getTask(db, data.taskId); if (!task) return { error: "Task not found.", status: 404 }; const allowed = await projectTaskAccess(db, task.id, actor, access, "contributor"); if (allowed.error) return allowed; if (!allowed.permissions.can_edit_own_tasks && !allowed.permissions.can_edit_any_tasks) return { error: "You cannot edit labels on this task.", status: 403 };
  await db.prepare("DELETE FROM project_task_labels WHERE task_id=? AND label_id=?").bind(task.id, safe(data.labelId, 180)).run(); return { success: true };
}
export async function deleteProjectLabel(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access, "manager"); if (allowed.error) return allowed; const label = await db.prepare("SELECT id FROM project_labels WHERE id=? AND project_id=?").bind(safe(data.id, 180), data.projectId).first(); if (!label) return { error: "Label not found.", status: 404 }; await db.prepare("DELETE FROM project_labels WHERE id=?").bind(label.id).run(); return { success: true };
}
export async function attachProjectLabel(db, data, actor, access) { const task = await getTask(db, data.taskId); if (!task) return { error: "Task not found.", status: 404 }; const allowed = await requireProject(db, task.project_id, actor, access, "contributor"); if (allowed.error) return allowed; if (!allowed.permissions.can_edit_own_tasks || !canSeeTask(task, allowed, actor)) return { error: "You cannot edit labels on this task.", status: 403 }; let label = data.labelId ? await db.prepare("SELECT * FROM project_labels WHERE id=? AND project_id=?").bind(data.labelId, task.project_id).first() : null; if (!label && data.name) { const labelId = newId("label"); await db.prepare("INSERT INTO project_labels (id,project_id,name,color) VALUES (?,?,?,?) ON CONFLICT(project_id,name) DO UPDATE SET color=excluded.color").bind(labelId, task.project_id, safe(data.name,80), safe(data.color || "#2b745c",20)).run(); label = await db.prepare("SELECT * FROM project_labels WHERE project_id=? AND lower(name)=lower(?)").bind(task.project_id, safe(data.name,80)).first(); } if (!label) return { error: "Label not found." }; await db.prepare("INSERT OR IGNORE INTO project_task_labels (task_id,label_id) VALUES (?,?)").bind(task.id,label.id).run(); return { success: true, label }; }

function templateFromRow(row) {
  return { id: row.id, projectId: row.project_id, name: row.name, description: row.description || "", payload: json(row.payload_json, {}), createdByUid: row.created_by_uid, createdAt: row.created_at, updatedAt: row.updated_at };
}
export async function listProjectTaskTemplates(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access); if (allowed.error) return allowed;
  const result = await db.prepare("SELECT * FROM project_task_templates WHERE project_id=? ORDER BY name").bind(data.projectId).all(); return { templates: (result.results || []).map(templateFromRow) };
}
export async function saveProjectTaskTemplate(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access, "manager"); if (allowed.error) return allowed;
  const name = safe(data.name, 160); if (!name) return { error: "A template name is required." }; const id = safe(data.id, 180) || newId("template");
  const payload = data.payload && typeof data.payload === "object" ? data.payload : {};
  await db.prepare("INSERT INTO project_task_templates (id,project_id,name,description,payload_json,created_by_uid,updated_at) VALUES (?,?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,payload_json=excluded.payload_json,updated_at=datetime('now')").bind(id, data.projectId, name, safe(data.description, 1000), JSON.stringify(payload), actorUid(actor)).run();
  return { success: true, template: templateFromRow(await db.prepare("SELECT * FROM project_task_templates WHERE id=?").bind(id).first()) };
}
export async function deleteProjectTaskTemplate(db, data, actor, access) {
  const row = await db.prepare("SELECT * FROM project_task_templates WHERE id=?").bind(safe(data.id, 180)).first(); if (!row) return { error: "Template not found.", status: 404 }; const allowed = await requireProject(db, row.project_id, actor, access, "manager"); if (allowed.error) return allowed; await db.prepare("DELETE FROM project_task_templates WHERE id=?").bind(row.id).run(); return { success: true };
}
export async function createProjectTaskFromTemplate(db, data, actor, access) {
  const row = await db.prepare("SELECT * FROM project_task_templates WHERE id=?").bind(safe(data.templateId, 180)).first(); if (!row) return { error: "Template not found.", status: 404 }; const allowed = await requireProject(db, row.project_id, actor, access, "contributor"); if (allowed.error) return allowed;
  const payload = json(row.payload_json, {}); const result = await createProjectTask(db, { ...payload, ...data, projectId: row.project_id, templateId: undefined, title: data.title || payload.title || row.name, description: data.description ?? payload.description ?? row.description }, actor, access); return result;
}

function webhookEventList(value) {
  const allowed = ["project.updated", "task.created", "task.updated", "task.completed", "task.deleted", "comment.created", "comment.updated", "comment.deleted"];
  const values = Array.isArray(value) ? value : json(value, []); return [...new Set(values.filter(item => allowed.includes(item)))].slice(0, 20);
}
function encodeBytes(bytes) { let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); return btoa(binary); }
function decodeSecretKey(value) { const raw = String(value || ""); if (!raw) return null; if (/^[0-9a-f]{64}$/i.test(raw)) return Uint8Array.from(raw.match(/../g).map(item => parseInt(item, 16))); return new TextEncoder().encode(raw).slice(0, 32); }
async function encryptProjectWebhookSecret(secret, keyMaterial) {
  const keyBytes = decodeSecretKey(keyMaterial); if (!keyBytes || !secret) return "";
  const key = await crypto.subtle.importKey("raw", keyBytes.length === 32 ? keyBytes : await crypto.subtle.digest("SHA-256", keyBytes), { name: "AES-GCM" }, false, ["encrypt"]); const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret)); return `${encodeBytes(iv)}.${encodeBytes(new Uint8Array(encrypted))}`;
}
function webhookFromRow(row) { return { id: row.id, projectId: row.project_id, url: row.url, eventTypes: json(row.event_types_json, []), active: Boolean(row.active), hasSecret: Boolean(row.secret_ciphertext), createdByUid: row.created_by_uid, createdAt: row.created_at, updatedAt: row.updated_at }; }
export async function listProjectWebhooks(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access, "manager"); if (allowed.error) return allowed; const result = await db.prepare("SELECT * FROM project_webhooks WHERE project_id=? ORDER BY created_at DESC").bind(data.projectId).all(); return { webhooks: (result.results || []).map(webhookFromRow) };
}
export async function saveProjectWebhook(db, data, actor, access, keyMaterial) {
  const allowed = await requireProject(db, data.projectId, actor, access, "manager"); if (allowed.error) return allowed;
  let url; try { url = new URL(String(data.url || "")); } catch { return { error: "Webhook URL is invalid." }; } if (!["https:", "http:"].includes(url.protocol)) return { error: "Webhook URL must use HTTP or HTTPS." };
  const id = safe(data.id, 180) || newId("webhook"); const current = data.id ? await db.prepare("SELECT * FROM project_webhooks WHERE id=? AND project_id=?").bind(id, data.projectId).first() : null; if (data.secret && !keyMaterial) return { error: "Webhook encryption is not configured." }; const secretCiphertext = data.secret ? await encryptProjectWebhookSecret(safe(data.secret, 500), keyMaterial) : current?.secret_ciphertext || ""; const eventTypes = webhookEventList(data.eventTypes || current?.event_types_json || ["task.created", "task.updated", "task.completed"]);
  await db.prepare("INSERT INTO project_webhooks (id,project_id,url,secret_ciphertext,event_types_json,active,created_by_uid,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET url=excluded.url,secret_ciphertext=excluded.secret_ciphertext,event_types_json=excluded.event_types_json,active=excluded.active,updated_at=datetime('now')").bind(id, data.projectId, url.toString(), secretCiphertext, JSON.stringify(eventTypes), data.active === false ? 0 : 1, actorUid(actor)).run(); return { success: true, webhook: webhookFromRow(await db.prepare("SELECT * FROM project_webhooks WHERE id=?").bind(id).first()) };
}
export async function deleteProjectWebhook(db, data, actor, access) { const row = await db.prepare("SELECT * FROM project_webhooks WHERE id=?").bind(safe(data.id, 180)).first(); if (!row) return { error: "Webhook not found.", status: 404 }; const allowed = await requireProject(db, row.project_id, actor, access, "manager"); if (allowed.error) return allowed; await db.prepare("DELETE FROM project_webhooks WHERE id=?").bind(row.id).run(); return { success: true }; }

async function projectTaskAccess(db, taskId, actor, access, minimum = "viewer") {
  const task = await getTask(db, taskId);
  if (!task) return { error: "Task not found.", status: 404 };
  const allowed = await requireProject(db, task.project_id, actor, access, minimum);
  if (allowed.error) return allowed;
  if (!canSeeTask(task, allowed, actor)) return { error: "You do not have access to this task.", status: 403 };
  return { ...allowed, task };
}

export async function filterVisibleRelations(db, relations, projectAccess, actor) {
  const ids = [...new Set(relations.flatMap((relation) => [relation.task_id, relation.related_task_id]).filter(Boolean))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(`SELECT * FROM project_tasks WHERE id IN (${placeholders})`).bind(...ids).all();
  const visibleIds = new Set((result.results || []).filter((task) => canSeeTask(task, projectAccess, actor)).map((task) => task.id));
  return relations.filter((relation) => visibleIds.has(relation.task_id) && visibleIds.has(relation.related_task_id));
}

export async function projectSummary(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access);
  if (allowed.error) return allowed;
  const [visibilitySql, visibilityBind] = taskVisibilityClause(allowed, actor);
  const result = await db.prepare(`SELECT status_category,priority,COUNT(*) AS count FROM project_tasks WHERE project_id=? AND ${visibilitySql} GROUP BY status_category,priority`).bind(data.projectId, ...visibilityBind).all();
  const summary = { total: 0, completed: 0, overdue: 0, byStatus: {}, byPriority: {} };
  const todayValue = todayIso();
  for (const row of result.results || []) {
    const count = Number(row.count || 0); summary.total += count;
    summary.byStatus[row.status_category] = (summary.byStatus[row.status_category] || 0) + count;
    summary.byPriority[row.priority] = (summary.byPriority[row.priority] || 0) + count;
  }
  summary.completed = Number(summary.byStatus.completed || 0);
  const overdue = await db.prepare(`SELECT COUNT(*) AS count FROM project_tasks WHERE project_id=? AND ${visibilitySql} AND due_at IS NOT NULL AND substr(due_at,1,10) < ? AND status_category NOT IN ('completed','cancelled')`).bind(data.projectId, ...visibilityBind, todayValue).first();
  summary.overdue = Number(overdue?.count || 0);
  return { project: projectFromRow(allowed.project), summary };
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

export async function listProjectSavedViews(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access); if (allowed.error) return allowed;
  const result = await db.prepare("SELECT * FROM project_saved_views WHERE project_id=? AND (owner_uid=? OR shared=1) ORDER BY shared DESC,updated_at DESC").bind(data.projectId, actorUid(actor)).all();
  return { views: (result.results || []).map(row => ({ id: row.id, projectId: row.project_id, name: row.name, viewType: row.view_type, filters: json(row.filter_json, {}), sort: json(row.sort_json, {}), shared: !!row.shared, ownerUid: row.owner_uid })) };
}
export async function saveProjectSavedView(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, data.shared ? access : access); if (allowed.error) return allowed;
  if (data.shared && !canProjectRole(allowed.role, "manager")) return { error: "Only project managers can share views.", status: 403 };
  const name = safe(data.name, 120); if (!name) return { error: "A view name is required." };
  const id = safe(data.id, 180) || newId("view");
  await db.prepare("INSERT INTO project_saved_views (id,project_id,owner_uid,name,view_type,filter_json,sort_json,shared,updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(project_id,owner_uid,name) DO UPDATE SET view_type=excluded.view_type,filter_json=excluded.filter_json,sort_json=excluded.sort_json,shared=excluded.shared,updated_at=datetime('now')")
    .bind(id, data.projectId, actorUid(actor), name, ["board", "list", "calendar", "timeline", "backlog"].includes(data.viewType) ? data.viewType : "board", JSON.stringify(data.filters || {}), JSON.stringify(data.sort || {}), data.shared ? 1 : 0).run();
  return { success: true, view: { id, projectId: data.projectId, name, viewType: data.viewType || "board", filters: data.filters || {}, sort: data.sort || {}, shared: !!data.shared } };
}
export async function deleteProjectSavedView(db, data, actor, access) {
  const view = await db.prepare("SELECT * FROM project_saved_views WHERE id=?").bind(safe(data.id, 180)).first(); if (!view) return { error: "View not found.", status: 404 };
  const allowed = await requireProject(db, view.project_id, actor, access); if (allowed.error) return allowed;
  if (view.owner_uid !== actorUid(actor) && !canProjectRole(allowed.role, "manager")) return { error: "You cannot delete this view.", status: 403 };
  await db.prepare("DELETE FROM project_saved_views WHERE id=?").bind(view.id).run(); return { success: true };
}

export async function duplicateProjectTask(db, data, actor, access) {
  const allowed = await projectTaskAccess(db, data.id, actor, access, "contributor"); if (allowed.error) return allowed;
  const task = allowed.task;
  const result = await createProjectTask(db, { projectId: task.project_id, title: data.title || `${task.title} copy`, description: task.description, columnId: data.columnId || task.column_id, priority: task.priority, assigneeUid: data.assigneeUid || "", assigneeEmail: data.assigneeEmail || "", startAt: task.start_at, dueAt: task.due_at, milestoneId: task.milestone_id, sourceDomain: task.source_domain, sourceType: task.source_type, sourceId: task.source_id, sourceAction: task.source_action }, actor, access);
  if (result.success) {
    const labels = await db.prepare("SELECT label_id FROM project_task_labels WHERE task_id=?").bind(task.id).all();
    for (const label of labels.results || []) await db.prepare("INSERT OR IGNORE INTO project_task_labels (task_id,label_id) VALUES (?,?)").bind(result.task.id, label.label_id).run();
  }
  return result;
}

export async function listProjectTimeEntries(db, data, actor, access) {
  const allowed = await projectTaskAccess(db, data.taskId, actor, access); if (allowed.error) return allowed;
  const result = await db.prepare("SELECT * FROM project_task_time_entries WHERE task_id=? ORDER BY created_at DESC").bind(data.taskId).all();
  return { entries: result.results || [], totalMinutes: (result.results || []).reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0) };
}
export async function saveProjectTimeEntry(db, data, actor, access) {
  const allowed = await projectTaskAccess(db, data.taskId, actor, access, "contributor"); if (allowed.error) return allowed;
  if (!allowed.permissions.can_edit_own_tasks) return { error: "You cannot log time on this task.", status: 403 };
  const id = safe(data.id, 180) || newId("time");
  const start = data.startedAt || now();
  const end = data.endedAt || null;
  const duration = Number.isFinite(Number(data.durationMinutes)) ? Math.max(0, Math.round(Number(data.durationMinutes))) : end ? Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)) : 0;
  await db.prepare("INSERT INTO project_task_time_entries (id,task_id,user_uid,user_email,started_at,ended_at,duration_minutes,note,updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET ended_at=excluded.ended_at,duration_minutes=excluded.duration_minutes,note=excluded.note,updated_at=datetime('now')").bind(id, data.taskId, actorUid(actor), actorEmail(actor), start, end, duration, safe(data.note, 1000)).run();
  return { success: true, entry: await db.prepare("SELECT * FROM project_task_time_entries WHERE id=?").bind(id).first() };
}

export async function listProjectAttachments(db, data, actor, access) {
  const allowed = await projectTaskAccess(db, data.taskId, actor, access); if (allowed.error) return allowed;
  const result = await db.prepare("SELECT id,task_id,file_name,mime_type,size_bytes,created_by_uid,created_at FROM project_task_attachments WHERE task_id=? AND deleted_at IS NULL ORDER BY created_at DESC").bind(data.taskId).all();
  return { attachments: result.results || [] };
}
function encodeBase64(bytes) { let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); return btoa(binary); }
export async function getProjectAttachment(db, data, actor, access, media) {
  const attachment = await db.prepare("SELECT * FROM project_task_attachments WHERE id=? AND deleted_at IS NULL").bind(safe(data.id, 180)).first(); if (!attachment) return { error: "Attachment not found.", status: 404 };
  const allowed = await projectTaskAccess(db, attachment.task_id, actor, access); if (allowed.error) return allowed;
  if (!media) return { error: "Project media storage is not configured.", status: 503 };
  const object = await media.get(attachment.r2_key); if (!object) return { error: "Attachment file is missing.", status: 404 };
  return { attachment: { id: attachment.id, taskId: attachment.task_id, fileName: attachment.file_name, mimeType: attachment.mime_type, sizeBytes: attachment.size_bytes }, contentBase64: encodeBase64(new Uint8Array(await object.arrayBuffer())) };
}
export async function createProjectAttachment(db, data, actor, access, media) {
  const allowed = await projectTaskAccess(db, data.taskId, actor, access, "contributor"); if (allowed.error) return allowed;
  if (!allowed.permissions.can_attach) return { error: "You cannot attach files to this task.", status: 403 };
  const fileName = safe(data.fileName, 240); const mimeType = safe(data.mimeType || "application/octet-stream", 120); const encoded = String(data.contentBase64 || "");
  if (!fileName || !encoded) return { error: "A file is required." };
  if (encoded.length > 12_000_000) return { error: "Files must be smaller than 8 MB." };
  if (!media) return { error: "Project media storage is not configured.", status: 503 };
  let bytes;
  try { const binary = atob(encoded); bytes = Uint8Array.from(binary, character => character.charCodeAt(0)); } catch { return { error: "The uploaded file is invalid." }; }
  const id = newId("attachment"); const key = `projects/${allowed.project.id}/${allowed.task.id}/${id}-${fileName.replace(/[^A-Za-z0-9._-]/g, "_")}`;
  await media.put(key, bytes, { httpMetadata: { contentType: mimeType }, customMetadata: { taskId: allowed.task.id, projectId: allowed.project.id } });
  await db.prepare("INSERT INTO project_task_attachments (id,task_id,r2_key,file_name,mime_type,size_bytes,created_by_uid,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, allowed.task.id, key, fileName, mimeType, bytes.byteLength, actorUid(actor), now()).run();
  return { success: true, attachment: { id, taskId: allowed.task.id, fileName, mimeType, sizeBytes: bytes.byteLength } };
}
export async function deleteProjectAttachment(db, data, actor, access, media) {
  const attachment = await db.prepare("SELECT * FROM project_task_attachments WHERE id=? AND deleted_at IS NULL").bind(safe(data.id, 180)).first(); if (!attachment) return { error: "Attachment not found.", status: 404 };
  const allowed = await projectTaskAccess(db, attachment.task_id, actor, access, "contributor"); if (allowed.error) return allowed;
  if (!allowed.permissions.can_manage_project && !(allowed.permissions.can_attach && attachment.created_by_uid === actorUid(actor))) return { error: "You cannot remove this attachment.", status: 403 };
  if (media) await media.delete(attachment.r2_key);
  await db.prepare("UPDATE project_task_attachments SET deleted_at=? WHERE id=?").bind(now(), attachment.id).run(); return { success: true };
}

export async function listProjectCustomFields(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access); if (allowed.error) return allowed;
  const fields = await db.prepare("SELECT * FROM project_custom_fields WHERE project_id=? ORDER BY position,name").bind(data.projectId).all();
  return { fields: (fields.results || []).map(field => ({ ...field, options: json(field.options_json, []) })) };
}
export async function saveProjectCustomField(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access, "manager"); if (allowed.error) return allowed;
  const id = safe(data.id, 180) || newId("field"); const name = safe(data.name, 100); if (!name) return { error: "A field name is required." };
  const fieldType = ["text", "number", "date", "select", "checkbox"].includes(data.fieldType) ? data.fieldType : "text";
  await db.prepare("INSERT INTO project_custom_fields (id,project_id,name,field_type,options_json,position,created_by_uid,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,field_type=excluded.field_type,options_json=excluded.options_json,position=excluded.position,updated_at=datetime('now')").bind(id, data.projectId, name, fieldType, JSON.stringify(Array.isArray(data.options) ? data.options.slice(0, 30).map(item => safe(item, 80)) : []), Number(data.position || 0), actorUid(actor)).run();
  return { success: true, field: await db.prepare("SELECT * FROM project_custom_fields WHERE id=?").bind(id).first() };
}
export async function deleteProjectCustomField(db, data, actor, access) {
  const field = await db.prepare("SELECT * FROM project_custom_fields WHERE id=?").bind(safe(data.id, 180)).first();
  if (!field) return { error: "Custom field not found.", status: 404 };
  const allowed = await requireProject(db, field.project_id, actor, access, "manager");
  if (allowed.error) return allowed;
  await db.prepare("DELETE FROM project_custom_fields WHERE id=?").bind(field.id).run();
  return { success: true };
}
export async function saveProjectTaskCustomValue(db, data, actor, access) {
  const allowed = await projectTaskAccess(db, data.taskId, actor, access, "contributor"); if (allowed.error) return allowed;
  const isOwn = allowed.task.assignee_uid === actorUid(actor) || allowed.task.assignee_email === actorEmail(actor) || allowed.task.created_by_uid === actorUid(actor) || allowed.task.created_by_email === actorEmail(actor);
  if (!allowed.permissions.can_edit_any_tasks && !(allowed.permissions.can_edit_own_tasks && isOwn)) return { error: "You cannot edit custom fields on this task.", status: 403 };
  const field = await db.prepare("SELECT * FROM project_custom_fields WHERE id=? AND project_id=?").bind(data.fieldId, allowed.task.project_id).first(); if (!field) return { error: "Custom field not found.", status: 404 };
  await db.prepare("INSERT INTO project_task_custom_values (task_id,field_id,value_text,updated_by_uid,updated_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(task_id,field_id) DO UPDATE SET value_text=excluded.value_text,updated_by_uid=excluded.updated_by_uid,updated_at=datetime('now')").bind(data.taskId, field.id, safe(data.value, 2000), actorUid(actor)).run();
  return { success: true };
}

export async function listProjectNotifications(db, _data, actor, access) {
  const result = await db.prepare("SELECT * FROM project_notifications WHERE lower(recipient_email)=lower(?) ORDER BY created_at DESC LIMIT 50").bind(actorEmail(actor)).all();
  const notifications = [];
  for (const notification of result.results || []) {
    if (notification.project_id) {
      const projectAccess = await getProjectAccess(db, notification.project_id, actor, access);
      if (!projectAccess) continue;
      if (notification.task_id) {
        const task = await getTask(db, notification.task_id);
        if (!task || !canSeeTask(task, projectAccess, actor)) continue;
      }
    }
    notifications.push(notification);
  }
  return { notifications, unread: notifications.filter(item => !item.read_at).length };
}
export async function markProjectNotificationsRead(db, data, actor) {
  if (data.unread) await db.prepare("UPDATE project_notifications SET read_at=NULL WHERE id=? AND lower(recipient_email)=lower(?)").bind(data.id, actorEmail(actor)).run();
  else if (data.all) await db.prepare("UPDATE project_notifications SET read_at=datetime('now') WHERE lower(recipient_email)=lower(?) AND read_at IS NULL").bind(actorEmail(actor)).run();
  else await db.prepare("UPDATE project_notifications SET read_at=datetime('now') WHERE id=? AND lower(recipient_email)=lower(?)").bind(data.id, actorEmail(actor)).run();
  return { success: true };
}

export async function listProjectTaskWatchers(db, data, actor, access) {
  const allowed = await projectTaskAccess(db, data.taskId, actor, access); if (allowed.error) return allowed;
  const result = await db.prepare("SELECT * FROM project_task_watchers WHERE task_id=? ORDER BY lower(email)").bind(data.taskId).all(); return { watchers: result.results || [] };
}
export async function updateProjectTaskWatcher(db, data, actor, access) {
  const allowed = await projectTaskAccess(db, data.taskId, actor, access, "contributor"); if (allowed.error) return allowed;
  if (!allowed.permissions.can_comment) return { error: "You cannot manage task watchers.", status: 403 };
  const email = actorEmail({ email: data.email || actor.email }); if (!email) return { error: "A valid email is required." };
  if (!isKaramahEmail(email)) return { error: "Task watchers must be Karamah members.", status: 400 };
  if (!data.remove && !await getProjectAccess(db, allowed.project.id, { uid: data.userUid, email }, { permissions: [] })) return { error: "The watcher does not have access to this project.", status: 403 };
  if (data.remove) await db.prepare("DELETE FROM project_task_watchers WHERE task_id=? AND lower(email)=lower(?)").bind(data.taskId, email).run();
  else await db.prepare("INSERT OR IGNORE INTO project_task_watchers (task_id,user_uid,email) VALUES (?,?,?)").bind(data.taskId, safe(data.userUid, 180), email).run();
  return { success: true };
}
