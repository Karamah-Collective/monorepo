import { allowsPermissions } from "../../shared/admin-access.mjs";
import { sendProjectInvitationEmail } from "./_project-email.js";

export const PROJECT_ROLES = ["viewer", "contributor", "manager", "project-admin"];
export const WORKSPACE_ROLES = ["viewer", "member", "admin", "owner"];
export const TASK_STATUSES = ["inbox", "assigned", "in_progress", "blocked", "completed", "cancelled"];
export const TASK_PRIORITIES = ["low", "normal", "medium", "high", "urgent"];
export const TASK_VISIBILITY = ["all", "assigned", "own"];
export const PROJECT_PERMISSION_KEYS = [
  "can_view_project", "can_read_tasks", "can_create_tasks", "can_edit_own_tasks",
  "can_edit_any_tasks", "can_assign_tasks", "can_comment", "can_relate", "can_attach",
  "can_manage_members", "can_manage_project",
];
const PROJECT_CUSTOM_FIELD_TYPES = ["text", "number", "date", "select", "checkbox"];

const safe = (value, max = 5000) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const now = () => new Date().toISOString();
const newId = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const json = (value, fallback = {}) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const bool = value => Boolean(Number(value));
function validHttpUrl(value) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}
function normalizeProjectCustomFieldType(value) {
  if (value === undefined || value === null || value === "") return "text";
  const aliases = { dropdown: "select", multiselect: "select", boolean: "checkbox" };
  const type = aliases[String(value)] || String(value);
  return PROJECT_CUSTOM_FIELD_TYPES.includes(type) ? type : null;
}
function customFieldTypeForClient(row) {
  if (row.field_type === "select") return Number(row.multiple) ? "multiselect" : "dropdown";
  if (row.field_type === "checkbox") return "boolean";
  return PROJECT_CUSTOM_FIELD_TYPES.includes(row.field_type) ? row.field_type : "text";
}
function customFieldFromRow(row) {
  const type = customFieldTypeForClient(row);
  return {
    ...row,
    id: row.id,
    projectId: row.project_id,
    type,
    required: Boolean(Number(row.required || 0)),
    defaultValue: row.default_value ?? null,
    options: json(row.options_json, []),
    position: Number(row.position || 0),
    value: row.value_text ?? null,
    fieldId: row.id,
    fieldName: row.name,
    fieldPosition: Number(row.position || 0),
    fieldType: type,
    fieldOptions: json(row.options_json, []),
  };
}
function normalizeProjectCustomFieldValue(field, rawValue) {
  const raw = rawValue === undefined || rawValue === null ? "" : String(rawValue);
  if (!raw.trim()) return "";
  const type = field.field_type;
  if (type === "number") return Number.isFinite(Number(raw)) ? raw.trim() : null;
  if (type === "date") return normalizeProjectDate(raw) ? raw.trim().slice(0, 10) : null;
  if (type === "checkbox") return raw === "true" || raw === "false" ? raw : null;
  if (type === "select") {
    const options = json(field.options_json, []);
    if (Number(field.multiple)) {
      let values;
      try { values = JSON.parse(raw); } catch { return null; }
      if (!Array.isArray(values) || values.some(value => typeof value !== "string" || !options.includes(value))) return null;
      return JSON.stringify([...new Set(values)]);
    }
    return options.includes(raw) ? raw : null;
  }
  return safe(raw, 2000);
}
function isDisallowedWebhookHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa") || host.endsWith(".lan")) return true;
  if (host.includes(":")) return true;
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some(part => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some(part => part < 0 || part > 255)) return true;
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19));
}
function base64(bytes) { return btoa(String.fromCharCode(...bytes)); }
async function encryptNotificationSecret(env, value) {
  const source = safe(env.PROJECT_NOTIFICATION_ENCRYPTION_KEY || env.PROJECT_WEBHOOK_ENCRYPTION_KEY || env.MCP_INTERNAL_SIGNING_KEY, 500);
  if (!source) throw new Error("Notification secret encryption is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}
function displayNameFromEmail(email) {
  return String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
export function normalizeTaskPriority(value) {
  if (value === "no-priority" || value === "") return "normal";
  return TASK_PRIORITIES.includes(value) ? value : null;
}
export function normalizeTaskStatus(value) {
  if (value === "planned") return "inbox";
  if (value === "archived") return "cancelled";
  return TASK_STATUSES.includes(value) ? value : null;
}
function normalizeProjectDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const input = value.trim();
  const datePart = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(input);
  if (datePart) {
    const calendar = new Date(Date.UTC(Number(datePart[1]), Number(datePart[2]) - 1, Number(datePart[3])));
    if (calendar.getUTCFullYear() !== Number(datePart[1]) || calendar.getUTCMonth() !== Number(datePart[2]) - 1 || calendar.getUTCDate() !== Number(datePart[3])) return null;
  }
  const date = new Date(input);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
const PROJECT_POSITION_MAX = 1_000_000_000;
function normalizeProjectPosition(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const position = Number(value);
  return Number.isSafeInteger(position) && position >= 0 && position <= PROJECT_POSITION_MAX ? position : null;
}
function validateProjectDateRange(startAt, dueAt, label = "task") {
  const start = normalizeProjectDate(startAt);
  const due = normalizeProjectDate(dueAt);
  const hasStart = startAt !== undefined && startAt !== null && String(startAt).trim() !== "";
  const hasDue = dueAt !== undefined && dueAt !== null && String(dueAt).trim() !== "";
  if ((hasStart && !start) || (hasDue && !due)) return { error: `Invalid ${label} date.`, status: 400 };
  if (start && due && due < start) return { error: `The ${label} due date must be on or after its start date.`, status: 400 };
  return { startAt: start, dueAt: due };
}
export function parseProjectTicket(value) {
  const match = /^(.*)-(\d+)$/.exec(safe(value, 128));
  if (!match || Number(match[2]) < 1) return null;
  return { projectKey: match[1], taskNumber: Number(match[2]) };
}
const PROJECT_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const isAdmin = (access) => access?.permissions?.includes("*");
const has = (access, permission, aliases = []) => isAdmin(access) || [permission, ...aliases].some(item => allowsPermissions(access?.permissions || [], item));

const WORKSPACE_PERMISSION_KEYS = [
  "project.create", "project.read", "project.update", "project.delete", "project.share",
  "task.create", "task.read", "task.update", "task.delete", "task.assign",
  "label.create", "label.read", "label.update", "label.delete",
  "workspace.read", "workspace.update", "workspace.delete", "workspace.manage_settings",
  "member.read", "member.create", "member.update", "member.delete", "invitation.create",
];
const DEFAULT_WORKSPACE_ROLE_PERMISSIONS = {
  viewer: ["project.read", "task.read", "label.read", "workspace.read", "member.read"],
  member: ["project.create", "project.read", "task.create", "task.read", "task.update", "label.create", "label.read", "label.update", "label.delete", "workspace.read", "member.read"],
  admin: ["project.create", "project.read", "project.update", "project.delete", "project.share", "task.create", "task.read", "task.update", "task.delete", "task.assign", "label.create", "label.read", "label.update", "label.delete", "workspace.read", "workspace.update", "workspace.manage_settings", "member.read", "member.update", "member.delete", "invitation.create"],
};
const WORKSPACE_PERMISSION_ALIASES = {
  "workspace.read": ["organization.read", "ac.read"],
  "workspace.update": ["organization.update"],
  "workspace.delete": ["organization.delete"],
  "workspace.manage_settings": ["organization.update", "ac.create", "ac.update", "ac.delete"],
  "invitation.create": ["member.create", "invitation.create"],
};

function fullWorkspacePermissions() {
  return Object.fromEntries(WORKSPACE_PERMISSION_KEYS.map(key => [key, true]));
}
function workspaceRolePermissions(role, row = null) {
  if (role === "owner") return fullWorkspacePermissions();
  const raw = row?.permissions ? json(row.permissions, []) : DEFAULT_WORKSPACE_ROLE_PERMISSIONS[role] || [];
  const granted = new Set(Array.isArray(raw) ? raw : []);
  return Object.fromEntries(WORKSPACE_PERMISSION_KEYS.map(key => [key, granted.has("*") || granted.has(key) || (WORKSPACE_PERMISSION_ALIASES[key] || []).some(alias => granted.has(alias))]));
}
function workspaceRoleIsPreset(role, row) {
  if (!WORKSPACE_ROLES.includes(role) || !row?.permissions || !DEFAULT_WORKSPACE_ROLE_PERMISSIONS[role]) return false;
  const current = new Set(json(row.permissions, []));
  const expected = new Set(DEFAULT_WORKSPACE_ROLE_PERMISSIONS[role]);
  return current.size === expected.size && [...expected].every(permission => current.has(permission));
}
function workspaceAllows(workspaceAccess, permission) {
  return workspaceAccess?.permissions?.[permission] === true || Object.entries(WORKSPACE_PERMISSION_ALIASES).some(([canonical, aliases]) => aliases.includes(permission) && workspaceAccess?.permissions?.[canonical] === true);
}
function workspaceRoleForProject(role) {
  return role === "admin" ? "project-admin" : role === "member" ? "contributor" : "viewer";
}
function projectPermissionsFromWorkspace(access) {
  const permissions = normalizeProjectPermissions("viewer");
  permissions.can_view_project = workspaceAllows(access, "project.read");
  permissions.can_read_tasks = workspaceAllows(access, "task.read");
  permissions.can_create_tasks = workspaceAllows(access, "task.create");
  permissions.can_edit_own_tasks = workspaceAllows(access, "task.update");
  permissions.can_edit_any_tasks = workspaceAllows(access, "task.update");
  permissions.can_assign_tasks = workspaceAllows(access, "task.assign");
  permissions.can_comment = workspaceAllows(access, "task.update");
  permissions.can_relate = workspaceAllows(access, "task.update");
  permissions.can_attach = workspaceAllows(access, "task.update");
  permissions.can_manage_members = workspaceAllows(access, "project.share") || workspaceAllows(access, "member.update");
  permissions.can_manage_project = workspaceAllows(access, "project.update") || workspaceAllows(access, "project.delete");
  return permissions;
}
function workspacePermissionList(permission = {}) {
  return Object.entries(permission || {}).flatMap(([resource, actions]) =>
    Array.isArray(actions) ? actions.map(action => `${resource}.${action}`) : [],
  );
}
function workspacePermissionObject(values = []) {
  const permission = {};
  for (const value of values) {
    const [resource, action] = String(value).split(".");
    if (!resource || !action) continue;
    permission[resource] = [...new Set([...(permission[resource] || []), action])];
  }
  return permission;
}

function roleRank(role) { return { viewer: 1, contributor: 2, manager: 3, "project-admin": 4 }[role] || 0; }
function actorEmail(actor) { return safe(actor?.email, 240).toLowerCase(); }
function actorUid(actor) { return safe(actor?.uid, 180); }
function isKaramahEmail(email) { return email.endsWith("@karamahcollective.com") || email.endsWith("@karamah.local"); }
function isKaramahActor(actor) { return isKaramahEmail(actorEmail(actor)); }
export function taskAssignmentMatchesActor(data, actor) {
  const targetUid = safe(data?.assigneeUid, 180);
  const targetEmail = actorEmail({ email: data?.assigneeEmail });
  return [actorUid(actor), actorEmail(actor)].some((identity) => identity && (identity === targetUid || identity === targetEmail));
}
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
async function getWorkspace(db, workspaceId) { return db.prepare("SELECT * FROM project_workspaces WHERE id=?").bind(safe(workspaceId, 180)).first(); }
async function getMembership(db, projectId, actor) { return db.prepare("SELECT * FROM project_members WHERE project_id=? AND lower(email)=lower(?)").bind(projectId, actorEmail(actor)).first(); }
async function getWorkspaceMembership(db, workspaceId, actor) {
  try {
    return await db.prepare("SELECT * FROM project_workspace_members WHERE workspace_id=? AND lower(email)=lower(?)").bind(workspaceId, actorEmail(actor)).first();
  } catch {
    return null;
  }
}
async function getMemberPermission(db, projectId, email) {
  try { return await db.prepare("SELECT * FROM project_member_permissions WHERE project_id=? AND lower(email)=lower(?)").bind(projectId, email).first(); } catch { return null; }
}

function workspaceFromRow(row, access = null) {
  if (!row) return null;
  const slug = safe(row.name, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || row.id;
  return {
    id: row.id, name: row.name, slug, logo: null,
    metadata: row.description ? { description: row.description } : null,
    description: row.description || "", visibility: row.visibility, archivedAt: row.archived_at,
    createdBy: { uid: row.created_by_uid, email: row.created_by_email },
    createdAt: row.created_at, updatedAt: row.updated_at, role: access?.role || null,
  };
}
function workspaceMemberFromRow(row) {
  return {
    id: row.email, organizationId: row.workspace_id, workspaceId: row.workspace_id,
    userId: row.user_uid || row.email, role: row.role,
    createdAt: row.created_at, updatedAt: row.updated_at,
    isExternal: !isKaramahEmail(row.email),
    user: { id: row.user_uid || row.email, name: row.display_name || row.name || displayNameFromEmail(row.email), email: row.email, image: null },
  };
}

async function assigneeEmailFor(db, projectId, userUid, email) {
  const direct = actorEmail({ email });
  if (direct) return direct;
  const uid = safe(userUid, 180);
  if (!uid) return "";
  if (isKaramahEmail(uid)) return uid;
  try {
    const member = await db.prepare("SELECT email FROM project_members WHERE project_id=? AND user_uid=?").bind(projectId, uid).first();
    if (member?.email) return actorEmail(member);
  } catch { /* Older project databases may not have user_uid populated. */ }
  try {
    const project = await getProject(db, projectId);
    const member = project?.workspace_id
      ? await db.prepare("SELECT email FROM project_workspace_members WHERE workspace_id=? AND user_uid=?").bind(project.workspace_id, uid).first()
      : null;
    if (member?.email) return actorEmail(member);
  } catch { /* Assignment still works with the stable UID when the lookup is unavailable. */ }
  return "";
}
function projectInvitationFromRow(row) {
  const expiresAt = row.expires_at || null;
  return {
    id: row.id,
    email: row.email,
    workspaceId: row.workspace_id || row.project_workspace_id || null,
    projectId: row.project_id || null,
    workspaceName: row.workspace_name || "",
    projectName: row.project_name || "",
    scope: row.project_id ? "project" : "workspace",
    role: row.project_role || row.workspace_role || "viewer",
    workspaceRole: row.workspace_role || null,
    projectRole: row.project_role || null,
    permissions: json(row.project_permissions_json, {}),
    taskVisibility: TASK_VISIBILITY.includes(row.project_task_visibility) ? row.project_task_visibility : "all",
    selectedProjectIds: json(row.selected_project_ids_json, []),
    projectRoles: json(row.project_roles_json, {}),
    invitedByEmail: row.invited_by_email || "",
    inviterName: row.invited_by_email ? row.invited_by_email.split("@")[0] : "Karamah Collective",
    createdAt: row.created_at,
    expiresAt,
    sentAt: row.sent_at || null,
    status: row.status,
    expired: Boolean(expiresAt && Date.parse(expiresAt) <= Date.now()),
    isExternal: true,
  };
}
async function invitationAccessFromRow(db, row) {
  const invitation = projectInvitationFromRow(row);
  if (invitation.scope === "project") {
    return {
      workspaceRole: null,
      inheritedProjectRole: null,
      projectOverrides: [{
        id: invitation.projectId,
        name: invitation.projectName || "Project",
        role: invitation.projectRole || "viewer",
      }],
      appliesToAllProjects: false,
    };
  }

  const projectIds = Array.isArray(invitation.selectedProjectIds)
    ? invitation.selectedProjectIds.filter(Boolean)
    : [];
  let projects = [];
  if (projectIds.length && invitation.workspaceId) {
    const placeholders = projectIds.map(() => "?").join(",");
    const result = await db.prepare(
      `SELECT id,name FROM projects WHERE workspace_id=? AND id IN (${placeholders})`,
    ).bind(invitation.workspaceId, ...projectIds).all();
    const names = new Map((result.results || []).map((project) => [project.id, project.name]));
    projects = projectIds
      .filter((projectId) => names.has(projectId))
      .map((projectId) => ({
        id: projectId,
        name: names.get(projectId),
        role: invitation.projectRoles?.[projectId] || workspaceRoleForProject(invitation.workspaceRole || "viewer"),
      }));
  }

  return {
    workspaceRole: invitation.workspaceRole,
    inheritedProjectRole: invitation.workspaceRole
      ? workspaceRoleForProject(invitation.workspaceRole)
      : null,
    projectOverrides: projects,
    appliesToAllProjects: Boolean(invitation.workspaceRole),
  };
}
async function getProjectInvitationRow(db, invitationId) {
  return db.prepare(`SELECT i.*,w.name AS workspace_name,p.name AS project_name,p.workspace_id AS project_workspace_id
    FROM project_invitations i
    LEFT JOIN project_workspaces w ON w.id=i.workspace_id
    LEFT JOIN projects p ON p.id=i.project_id
    WHERE i.id=?`).bind(safe(invitationId, 180)).first();
}
function validExternalEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !isKaramahEmail(email);
}
async function listPendingProjectInvitations(db, column, value) {
  const result = await db.prepare(`SELECT i.*,w.name AS workspace_name,p.name AS project_name,p.workspace_id AS project_workspace_id
    FROM project_invitations i
    LEFT JOIN project_workspaces w ON w.id=i.workspace_id
    LEFT JOIN projects p ON p.id=i.project_id
    WHERE i.${column}=? AND i.status='pending' AND i.expires_at>? ORDER BY i.created_at DESC`).bind(value, now()).all();
  return (result.results || []).map(projectInvitationFromRow);
}
async function getWorkspaceAccess(db, workspaceId, actor) {
  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace) return null;
  const membership = await getWorkspaceMembership(db, workspaceId, actor);
  const owner = actorEmail(actor) === actorEmail({ email: workspace.created_by_email }) || actorUid(actor) === safe(workspace.created_by_uid, 180);
  if (owner || membership?.role === "owner") return { workspace, role: "owner", permissions: fullWorkspacePermissions(), owner: true };
  if (membership?.role) {
    const role = safe(membership.role, 80);
    const roleRow = await db.prepare("SELECT * FROM project_workspace_roles WHERE workspace_id=? AND id=?").bind(workspaceId, role).first();
    return { workspace, role, permissions: workspaceRolePermissions(role, roleRow), owner: false, preset: workspaceRoleIsPreset(role, roleRow) };
  }
  try {
    const projectMembership = await db.prepare(`SELECT 1 FROM project_members m
      INNER JOIN projects p ON p.id=m.project_id
      WHERE p.workspace_id=? AND p.archived_at IS NULL AND lower(m.email)=lower(?) LIMIT 1`).bind(workspaceId, actorEmail(actor)).first();
    if (projectMembership) return { workspace, role: "viewer", permissions: workspaceRolePermissions("viewer"), owner: false, preset: true, projectScoped: true };
  } catch { /* Older local databases may not have the project tables yet. */ }
  // The original shared workspace remains visible to verified Karamah users.
  // Newly-created workspaces require an explicit workspace membership.
  if (workspaceId === "workspace-default" && isKaramahActor(actor)) {
    return { workspace, role: "member", permissions: workspaceRolePermissions("member"), owner: false, preset: true };
  }
  return null;
}
async function requireWorkspace(db, workspaceId, actor, permission = "workspace.read") {
  const access = await getWorkspaceAccess(db, workspaceId, actor);
  if (!access) return { error: "Workspace not found or you do not have access to it.", status: 403 };
  if (!workspaceAllows(access, permission)) return { error: "You do not have access to this workspace action.", status: 403 };
  return access;
}

export async function listProjectWorkspaces(db, actor) {
  const { results } = await db.prepare("SELECT * FROM project_workspaces WHERE archived_at IS NULL ORDER BY created_at ASC,id ASC").all();
  const workspaces = [];
  for (const row of results || []) {
    const access = await getWorkspaceAccess(db, row.id, actor);
    if (access) workspaces.push(workspaceFromRow(row, access));
  }
  return { workspaces };
}
export async function listProjectWorkspaceMembers(db, data, actor) {
  const allowed = await requireWorkspace(db, data.workspaceId, actor, "member.read");
  if (allowed.error) return allowed;
  if (allowed.projectScoped) return { error: "Project-only collaborators cannot view workspace membership.", status: 403 };
  const result = await db.prepare("SELECT * FROM project_workspace_members WHERE workspace_id=? ORDER BY lower(email)").bind(data.workspaceId).all();
  const members = (result.results || []).map(workspaceMemberFromRow);
  if (data.workspaceId === "workspace-default" && !members.some(member => member.user.email === actorEmail(actor))) {
    members.push(workspaceMemberFromRow({
      email: actorEmail(actor), user_uid: actorUid(actor), workspace_id: data.workspaceId,
      role: allowed.role, created_at: allowed.workspace.created_at, updated_at: allowed.workspace.updated_at,
    }));
  }
  return { members };
}
export async function listProjectWorkspaceInvitations(db, data, actor) {
  const allowed = await requireWorkspace(db, data.workspaceId, actor, "member.read");
  if (allowed.error) return allowed;
  if (allowed.projectScoped) return { invitations: [] };
  return { invitations: await listPendingProjectInvitations(db, "workspace_id", data.workspaceId) };
}
export async function listProjectMemberDirectory(db, data, actor, env) {
  if (!isKaramahActor(actor)) return { members: [] };
  const query = safe(data.search, 120).toLowerCase();
  const directory = new Map();
  const add = (row) => {
    const email = actorEmail({ email: row.email });
    if (!email || !isKaramahEmail(email)) return;
    const name = safe(row.display_name || row.name || displayNameFromEmail(email), 160);
    if (query && !`${name} ${email}`.toLowerCase().includes(query)) return;
    directory.set(email, {
      id: row.user_uid || row.user_id || email,
      name,
      email,
    });
  };
  try {
    const result = await db.prepare(`SELECT DISTINCT email,user_uid FROM project_workspace_members
      WHERE workspace_id=? AND lower(email) LIKE '%@karamah%' ORDER BY lower(email)`).bind(data.workspaceId).all();
    for (const row of result.results || []) add(row);
  } catch { /* Older local schemas may not have workspace memberships yet. */ }
  try {
    const result = await db.prepare(`SELECT DISTINCT m.email,m.user_uid FROM project_members m
      INNER JOIN projects p ON p.id=m.project_id
      WHERE p.workspace_id=? AND lower(m.email) LIKE '%@karamah%' ORDER BY lower(m.email)`).bind(data.workspaceId).all();
    for (const row of result.results || []) add(row);
  } catch { /* Older local schemas may not have project memberships yet. */ }
  try {
    if (env?.ADMIN_DB) {
      const result = await env.ADMIN_DB.prepare(`SELECT email,display_name FROM admin_role_members
        WHERE lower(email) LIKE '%@karamahcollective.com' ORDER BY lower(display_name),lower(email)`).all();
      for (const row of result.results || []) add(row);
    }
  } catch { /* Admin DB is optional in lightweight local tests. */ }
  return {
    members: [...directory.values()]
      .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
      .slice(0, 20),
  };
}
export async function getProjectWorkspaceAccount(db, data, actor) {
  const allowed = await requireWorkspace(db, data.workspaceId, actor);
  if (allowed.error) return allowed;
  const members = allowed.projectScoped ? { members: [] } : await listProjectWorkspaceMembers(db, data, actor);
  const invitations = allowed.projectScoped ? { invitations: [] } : await listProjectWorkspaceInvitations(db, data, actor);
  const projects = await listProjects(db, actor, null, data);
  return { workspace: workspaceFromRow(allowed.workspace, allowed), members: members.members || [], invitations: invitations.invitations || [], projects: projects.projects || [], role: allowed.role, permissions: allowed.permissions };
}
export async function createProjectWorkspace(db, data, actor) {
  if (!isKaramahActor(actor)) return { error: "A Karamah email is required.", status: 403 };
  const name = safe(data.name, 160);
  if (!name) return { error: "A workspace name is required." };
  const workspaceId = newId("workspace");
  const timestamp = now();
  try {
    await db.prepare("INSERT INTO project_workspaces (id,name,description,visibility,created_by_uid,created_by_email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(workspaceId, name, safe(data.description, 1000), "workspace", actorUid(actor), actorEmail(actor), timestamp, timestamp).run();
    await db.batch([
      db.prepare("INSERT INTO project_workspace_roles (workspace_id,id,name,description,permissions,is_system) VALUES (?,?,?,?,?,1)").bind(workspaceId, "viewer", "Viewer", "Can view workspace projects and tasks.", JSON.stringify(DEFAULT_WORKSPACE_ROLE_PERMISSIONS.viewer)),
      db.prepare("INSERT INTO project_workspace_roles (workspace_id,id,name,description,permissions,is_system) VALUES (?,?,?,?,?,1)").bind(workspaceId, "member", "Member", "Can work on workspace projects and tasks.", JSON.stringify(DEFAULT_WORKSPACE_ROLE_PERMISSIONS.member)),
      db.prepare("INSERT INTO project_workspace_roles (workspace_id,id,name,description,permissions,is_system) VALUES (?,?,?,?,?,1)").bind(workspaceId, "admin", "Admin", "Can manage workspace projects, settings, and members.", JSON.stringify(DEFAULT_WORKSPACE_ROLE_PERMISSIONS.admin)),
      db.prepare("INSERT INTO project_workspace_members (workspace_id,user_uid,email,role,created_by_uid,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(workspaceId, actorUid(actor), actorEmail(actor), "owner", actorUid(actor), timestamp, timestamp),
    ]);
    return { success: true, workspace: workspaceFromRow(await getWorkspace(db, workspaceId), { role: "owner" }) };
  } catch (error) {
    return { error: String(error?.message || "Could not create workspace.") };
  }
}
export async function updateProjectWorkspace(db, data, actor) {
  const allowed = await requireWorkspace(db, data.workspaceId, actor, "workspace.update");
  if (allowed.error) return allowed;
  const name = data.name !== undefined ? safe(data.name, 160) : allowed.workspace.name;
  if (!name) return { error: "A workspace name is required." };
  const description = data.description !== undefined ? safe(data.description, 1000) : allowed.workspace.description;
  await db.prepare("UPDATE project_workspaces SET name=?,description=?,updated_at=? WHERE id=?").bind(name, description, now(), data.workspaceId).run();
  return { success: true, workspace: workspaceFromRow(await getWorkspace(db, data.workspaceId), allowed) };
}
export async function deleteProjectWorkspace(db, data, actor) {
  const allowed = await requireWorkspace(db, data.workspaceId, actor, "workspace.delete");
  if (allowed.error) return allowed;
  if (data.workspaceId === "workspace-default") return { error: "The default workspace cannot be deleted.", status: 409 };
  await db.prepare("UPDATE project_workspaces SET archived_at=?,updated_at=? WHERE id=?").bind(allowed.workspace.archived_at || now(), now(), data.workspaceId).run();
  return { success: true };
}
export async function getProjectInvitation(db, data) {
  const row = await getProjectInvitationRow(db, data.invitationId);
  if (!row) return { valid: false, invitation: null };
  const invitation = projectInvitationFromRow(row);
  const access = await invitationAccessFromRow(db, row);
  const valid = row.status === "pending" && !invitation.expired && invitation.isExternal;
  return { valid, invitation: { ...invitation, access }, reason: valid ? null : row.status === "pending" ? "This invitation has expired." : "This invitation is no longer available." };
}
async function createProjectInvitation(db, data, actor, env) {
  const scope = data.projectId ? "project" : "workspace";
  const email = actorEmail({ email: data.email });
  if (!validExternalEmail(email)) return { error: "External collaborators must use a non-Karamah email address." };

  let workspace;
  let project;
  if (scope === "project") {
    const allowed = await requireProject(db, data.projectId, actor, data.access, "project-admin");
    if (allowed.error) return allowed;
    if (!allowed.permissions.can_manage_members) return { error: "You cannot manage project members.", status: 403 };
    project = allowed.project;
    workspace = await getWorkspace(db, project.workspace_id);
  } else {
    const allowed = await requireWorkspace(db, data.workspaceId, actor, "invitation.create");
    if (allowed.error) return allowed;
    workspace = allowed.workspace;
  }
  if (!workspace || (scope === "project" && (!project || project.workspace_id !== workspace.id))) return { error: "The invitation target was not found.", status: 404 };

  const requestedWorkspaceRole = scope === "workspace" ? safe(data.workspaceRole, 80) : "";
  const workspaceRole = requestedWorkspaceRole && requestedWorkspaceRole !== "none"
    ? requestedWorkspaceRole
    : null;
  const projectRole = scope === "project" ? (PROJECT_ROLES.includes(data.projectRole) ? data.projectRole : "viewer") : null;
  if (workspaceRole) {
    const customRole = await db.prepare("SELECT id FROM project_workspace_roles WHERE workspace_id=? AND id=?").bind(workspace.id, workspaceRole).first();
    if (!WORKSPACE_ROLES.includes(workspaceRole) && !customRole) return { error: "Choose a valid workspace role." };
  }
  const permissions = scope === "project" ? normalizeProjectPermissions(projectRole, data.permissions || {}) : {};
  const selectedProjectIds = scope === "workspace" && data.projectAccess === "selected"
    ? (Array.isArray(data.projectIds) ? [...new Set(data.projectIds.map(projectId => safe(projectId, 180)).filter(Boolean))] : [])
    : [];
  const projectRoles = {};
  const projectOverrides = [];
  for (const projectId of selectedProjectIds) {
    const selectedProject = await getProject(db, projectId);
    if (!selectedProject || selectedProject.workspace_id !== workspace.id) return { error: "One or more selected projects are not in this workspace.", status: 400 };
    const requestedRole = data.projectRoles?.[projectId];
    projectRoles[projectId] = PROJECT_ROLES.includes(requestedRole)
      ? requestedRole
      : workspaceRole
        ? workspaceRoleForProject(workspaceRole)
        : "viewer";
    projectOverrides.push({ id: selectedProject.id, name: selectedProject.name, role: projectRoles[projectId] });
  }
  const invitationId = newId("invite");
  const expiresAt = new Date(Date.now() + PROJECT_INVITATION_TTL_MS).toISOString();
  await db.prepare(`INSERT INTO project_invitations
    (id,workspace_id,project_id,email,workspace_role,project_role,project_permissions_json,project_task_visibility,selected_project_ids_json,project_roles_json,status,invited_by_uid,invited_by_email,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?,?,?)`)
    .bind(invitationId, scope === "workspace" ? workspace.id : null, scope === "project" ? project.id : null, email, workspaceRole, projectRole,
      JSON.stringify(permissions), permissions.task_visibility || "all", JSON.stringify(Object.keys(projectRoles)), JSON.stringify(projectRoles), actorUid(actor), actorEmail(actor), expiresAt).run();

  const emailResult = await sendProjectInvitationEmail(env, {
    email,
    invitationId,
    workspaceName: workspace.name,
    projectName: project?.name || "",
    role: projectRole || workspaceRole || "viewer",
    access: {
      workspaceRole: scope === "workspace" ? workspaceRole : null,
      inheritedProjectRole: scope === "workspace" && workspaceRole ? workspaceRoleForProject(workspaceRole) : null,
      projectOverrides: scope === "project"
        ? [{ id: project.id, name: project.name, role: projectRole }]
        : projectOverrides,
      appliesToAllProjects: scope === "workspace" && Boolean(workspaceRole),
    },
  });
  if (emailResult.error) {
    await db.prepare("UPDATE project_invitations SET last_error=? WHERE id=?").bind(emailResult.error, invitationId).run();
    return emailResult;
  }
  await db.prepare("UPDATE project_invitations SET sent_at=? WHERE id=?").bind(now(), invitationId).run();
  const invitationRow = await getProjectInvitationRow(db, invitationId);
  return { success: true, external: true, invitation: { ...projectInvitationFromRow(invitationRow), access: await invitationAccessFromRow(db, invitationRow) } };
}
export async function listProjectInvitations(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access); if (allowed.error) return allowed;
  const invitations = allowed.permissions.can_manage_members ? await listPendingProjectInvitations(db, "project_id", data.projectId) : [];
  return { invitations };
}
export async function acceptProjectInvitation(db, data, actor) {
  const row = await getProjectInvitationRow(db, data.invitationId);
  if (!row) return { error: "Invitation not found.", status: 404 };
  const invitation = projectInvitationFromRow(row);
  if (row.status !== "pending") return { error: "This invitation is no longer available.", status: 409 };
  if (invitation.expired) return { error: "This invitation has expired.", status: 410 };
  if (actorEmail(actor) !== actorEmail({ email: row.email })) return { error: "This invitation belongs to a different email address.", status: 403 };
  const timestamp = now();
  const statements = [];
  if (row.workspace_id) {
    const workspaceRole = WORKSPACE_ROLES.includes(row.workspace_role) ? row.workspace_role : null;
    if (workspaceRole) {
      statements.push(db.prepare(`INSERT INTO project_workspace_members (workspace_id,user_uid,email,role,created_by_uid,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(workspace_id,email) DO UPDATE SET user_uid=excluded.user_uid,role=excluded.role,updated_at=excluded.updated_at`)
        .bind(row.workspace_id, actorUid(actor), row.email, workspaceRole, row.invited_by_uid, timestamp, timestamp));
    }
    const projectRoles = json(row.project_roles_json, {});
    for (const projectId of json(row.selected_project_ids_json, [])) {
      const safeProjectId = safe(projectId, 180);
      if (!safeProjectId) continue;
      const role = PROJECT_ROLES.includes(projectRoles[safeProjectId])
        ? projectRoles[safeProjectId]
        : workspaceRoleForProject(workspaceRole || "viewer");
      statements.push(db.prepare(`INSERT INTO project_members (project_id,user_uid,email,role,created_by_uid,updated_at)
        SELECT id,?,?,?,?,? FROM projects WHERE id=? AND workspace_id=?
        ON CONFLICT(project_id,email) DO UPDATE SET user_uid=excluded.user_uid,role=excluded.role,updated_at=excluded.updated_at`)
        .bind(actorUid(actor), row.email, role, row.invited_by_uid, timestamp, safeProjectId, row.workspace_id));
      const permissions = normalizeProjectPermissions(role);
      statements.push(db.prepare(`INSERT INTO project_member_permissions (project_id,email,${PROJECT_PERMISSION_KEYS.join(",")},task_visibility,updated_at)
        SELECT id,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM projects WHERE id=? AND workspace_id=?
        ON CONFLICT(project_id,email) DO UPDATE SET ${PROJECT_PERMISSION_KEYS.map(key => `${key}=excluded.${key}`).join(",")},task_visibility=excluded.task_visibility,updated_at=excluded.updated_at`)
        .bind(row.email, ...PROJECT_PERMISSION_KEYS.map(key => permissions[key] ? 1 : 0), permissions.task_visibility, timestamp, safeProjectId, row.workspace_id));
    }
  } else if (row.project_id) {
    const role = PROJECT_ROLES.includes(row.project_role) ? row.project_role : "viewer";
    const permissions = normalizeProjectPermissions(role, json(row.project_permissions_json, {}));
    statements.push(db.prepare(`INSERT INTO project_members (project_id,user_uid,email,role,created_by_uid,updated_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(project_id,email) DO UPDATE SET user_uid=excluded.user_uid,role=excluded.role,updated_at=excluded.updated_at`)
      .bind(row.project_id, actorUid(actor), row.email, role, row.invited_by_uid, timestamp));
    statements.push(db.prepare(`INSERT INTO project_member_permissions (project_id,email,${PROJECT_PERMISSION_KEYS.join(",")},task_visibility,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,email) DO UPDATE SET ${PROJECT_PERMISSION_KEYS.map(key => `${key}=excluded.${key}`).join(",")},task_visibility=excluded.task_visibility,updated_at=excluded.updated_at`)
      .bind(row.project_id, row.email, ...PROJECT_PERMISSION_KEYS.map(key => permissions[key] ? 1 : 0), permissions.task_visibility, timestamp));
  }
  statements.push(db.prepare("UPDATE project_invitations SET status='accepted',accepted_at=?,accepted_uid=?,last_error='' WHERE id=? AND status='pending'").bind(timestamp, actorUid(actor), row.id));
  await db.batch(statements);
  return { success: true, invitation: { ...invitation, status: "accepted", acceptedAt: timestamp }, workspaceId: row.workspace_id || row.project_workspace_id || null };
}
export async function cancelProjectInvitation(db, data, actor, access) {
  const row = await getProjectInvitationRow(db, data.invitationId);
  if (!row || row.status !== "pending") return { success: true };
  const allowed = row.workspace_id
    ? await requireWorkspace(db, row.workspace_id, actor, "invitation.create")
    : await requireProject(db, row.project_id, actor, access, "project-admin");
  if (allowed.error) return allowed;
  if (!row.workspace_id && !allowed.permissions.can_manage_members) return { error: "You cannot manage project members.", status: 403 };
  await db.prepare("UPDATE project_invitations SET status='canceled' WHERE id=?").bind(row.id).run();
  return { success: true, invitationId: row.id };
}
export async function updateProjectWorkspaceMember(db, data, actor, env) {
  const member = data.member || data;
  const email = actorEmail({ email: member.email });
  const existing = await db.prepare("SELECT * FROM project_workspace_members WHERE workspace_id=? AND lower(email)=lower(?)").bind(data.workspaceId, email).first();
  const allowed = await requireWorkspace(db, data.workspaceId, actor, existing ? "member.update" : (isKaramahEmail(email) ? "member.create" : "invitation.create"));
  if (allowed.error) return allowed;
  const requestedRole = safe(member.role || data.workspaceRole || "viewer", 80);
  const role = requestedRole === "none" ? null : requestedRole;
  const customRole = role
    ? await db.prepare("SELECT id FROM project_workspace_roles WHERE workspace_id=? AND id=?").bind(data.workspaceId, role).first()
    : null;
  if (role && !WORKSPACE_ROLES.includes(role) && !customRole) return { error: "Choose a valid workspace role." };
  if (role === "owner" && !allowed.owner) return { error: "Only the workspace owner can grant ownership.", status: 403 };
  const selectedProjectIds = data.projectAccess === "selected" && Array.isArray(data.projectIds)
    ? [...new Set(data.projectIds.map((projectId) => safe(projectId, 180)).filter(Boolean))]
    : [];
  const projectRoles = data.projectRoles && typeof data.projectRoles === "object" ? data.projectRoles : {};
  if (!role && selectedProjectIds.length === 0) return { error: "Choose workspace access or at least one project." };
  if (!existing && !isKaramahEmail(email)) {
    return createProjectInvitation(db, {
      ...data,
      email,
      workspaceRole: role,
      projectRoles,
      projectIds: selectedProjectIds,
      projectAccess: selectedProjectIds.length ? "selected" : data.projectAccess,
    }, actor, env);
  }
  if (!isKaramahEmail(email) && !existing) return { error: "External invitation could not be created." };
  if (!role && existing) {
    if (existing.role === "owner" || email === actorEmail({ email: allowed.workspace.created_by_email })) {
      return { error: "The workspace owner cannot be changed to project-only access.", status: 409 };
    }
    await db.prepare("DELETE FROM project_workspace_members WHERE workspace_id=? AND lower(email)=lower(?)")
      .bind(data.workspaceId, email).run();
  }
  if (role) {
    await db.prepare("INSERT INTO project_workspace_members (workspace_id,user_uid,email,role,created_by_uid,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime('now')) ON CONFLICT(workspace_id,email) DO UPDATE SET user_uid=excluded.user_uid,role=excluded.role,updated_at=datetime('now')").bind(data.workspaceId, safe(member.userUid, 180), email, role, actorUid(actor), now()).run();
  }
  // Workspace membership already grants the role across every project. Only
  // selected projects become project-level overrides; "all" stays inherited
  // so later workspace role changes continue to apply.
  if (selectedProjectIds.length) {
    for (const projectId of selectedProjectIds) {
      const project = await getProject(db, projectId);
      if (!project || project.workspace_id !== data.workspaceId) return { error: "One or more selected projects are not in this workspace.", status: 400 };
      const requestedProjectRole = projectRoles[projectId];
      const projectRole = PROJECT_ROLES.includes(requestedProjectRole)
        ? requestedProjectRole
        : workspaceRoleForProject(role || "viewer");
      const permissions = normalizeProjectPermissions(projectRole);
      await db.prepare("INSERT INTO project_members (project_id,user_uid,email,role,created_by_uid,updated_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(project_id,email) DO UPDATE SET user_uid=excluded.user_uid,role=excluded.role,updated_at=datetime('now')").bind(projectId, safe(member.userUid, 180), email, projectRole, actorUid(actor)).run();
      await db.prepare(`INSERT INTO project_member_permissions (project_id,email,${PROJECT_PERMISSION_KEYS.join(",")},task_visibility,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(project_id,email) DO UPDATE SET ${PROJECT_PERMISSION_KEYS.map(key => `${key}=excluded.${key}`).join(",")},task_visibility=excluded.task_visibility,updated_at=datetime('now')`)
        .bind(projectId, email, ...PROJECT_PERMISSION_KEYS.map(key => permissions[key] ? 1 : 0), permissions.task_visibility).run();
    }
  }
  const row = await db.prepare("SELECT * FROM project_workspace_members WHERE workspace_id=? AND lower(email)=lower(?)").bind(data.workspaceId, email).first();
  return { success: true, member: row ? workspaceMemberFromRow(row) : { id: email, organizationId: data.workspaceId, workspaceId: data.workspaceId, userId: safe(member.userUid, 180) || email, role: "none", createdAt: null, updatedAt: now(), isExternal: false, user: { id: safe(member.userUid, 180) || email, name: displayNameFromEmail(email), email, image: null } } };
}
export async function removeProjectWorkspaceMember(db, data, actor) {
  const allowed = await requireWorkspace(db, data.workspaceId, actor, "member.delete");
  if (allowed.error) return allowed;
  const email = actorEmail({ email: data.email });
  const member = await db.prepare("SELECT * FROM project_workspace_members WHERE workspace_id=? AND lower(email)=lower(?)").bind(data.workspaceId, email).first();
  if (!member) return { success: true };
  if (member.role === "owner" || email === actorEmail({ email: allowed.workspace.created_by_email })) return { error: "The workspace owner cannot be removed.", status: 409 };
  await db.prepare("DELETE FROM project_workspace_members WHERE workspace_id=? AND lower(email)=lower(?)").bind(data.workspaceId, email).run();
  return { success: true };
}
export async function listProjectWorkspaceRoles(db, data, actor) {
  const allowed = await requireWorkspace(db, data.workspaceId, actor);
  if (allowed.error) return allowed;
  const result = await db.prepare("SELECT * FROM project_workspace_roles WHERE workspace_id=? ORDER BY is_system DESC,name").bind(data.workspaceId).all();
  return { roles: (result.results || []).map(row => ({ id: row.id, organizationId: row.workspace_id, role: row.id, name: row.name, description: row.description, permission: workspacePermissionObject(json(row.permissions, [])), createdAt: row.created_at, updatedAt: row.updated_at })) };
}
export async function createProjectWorkspaceRole(db, data, actor) {
  const allowed = await requireWorkspace(db, data.organizationId || data.workspaceId, actor, "workspace.manage_settings");
  if (allowed.error) return allowed;
  const workspaceId = data.organizationId || data.workspaceId;
  const role = safe(data.role || data.name, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  if (!role || WORKSPACE_ROLES.includes(role)) return { error: "Choose a unique custom role name." };
  const existing = await db.prepare("SELECT id FROM project_workspace_roles WHERE workspace_id=? AND id=?").bind(workspaceId, role).first();
  if (existing) return { error: "That workspace role already exists." };
  const permissions = workspacePermissionList(data.permission);
  await db.prepare("INSERT INTO project_workspace_roles (workspace_id,id,name,description,permissions,is_system) VALUES (?,?,?,?,?,0)").bind(workspaceId, role, safe(data.name || data.role, 120), safe(data.description, 500), JSON.stringify(permissions)).run();
  return { success: true, role: (await listProjectWorkspaceRoles(db, { workspaceId }, actor)).roles.find(item => item.id === role) };
}
export async function updateProjectWorkspaceRole(db, data, actor) {
  const workspaceId = data.organizationId || data.workspaceId;
  const allowed = await requireWorkspace(db, workspaceId, actor, "workspace.manage_settings");
  if (allowed.error) return allowed;
  const role = safe(data.roleName || data.role, 80);
  if (!role || role === "owner") return { error: "The owner role cannot be changed here." };
  const existing = await db.prepare("SELECT * FROM project_workspace_roles WHERE workspace_id=? AND id=?").bind(workspaceId, role).first();
  if (!existing) return { error: "Workspace role not found.", status: 404 };
  const permissions = data.data?.permission || data.permission || workspacePermissionObject(json(existing.permissions, []));
  await db.prepare("UPDATE project_workspace_roles SET permissions=?,updated_at=? WHERE workspace_id=? AND id=?").bind(JSON.stringify(workspacePermissionList(permissions)), now(), workspaceId, role).run();
  return { success: true, role: (await listProjectWorkspaceRoles(db, { workspaceId }, actor)).roles.find(item => item.id === role) };
}
export async function deleteProjectWorkspaceRole(db, data, actor) {
  const workspaceId = data.organizationId || data.workspaceId;
  const allowed = await requireWorkspace(db, workspaceId, actor, "workspace.manage_settings");
  if (allowed.error) return allowed;
  const role = safe(data.roleName || data.role, 80);
  if (!role || WORKSPACE_ROLES.includes(role)) return { error: "Default workspace roles cannot be deleted." };
  const used = await db.prepare("SELECT 1 FROM project_workspace_members WHERE workspace_id=? AND role=? LIMIT 1").bind(workspaceId, role).first();
  if (used) return { error: "Move members to another role before deleting this role.", status: 409 };
  await db.prepare("DELETE FROM project_workspace_roles WHERE workspace_id=? AND id=?").bind(workspaceId, role).run();
  return { success: true };
}
export async function getProjectWorkspaceCapabilities(db, data, actor) {
  const allowed = await requireWorkspace(db, data.workspaceId, actor);
  if (allowed.error) return allowed;
  const can = permission => workspaceAllows(allowed, permission);
  return {
    manageProjects: can("project.create") && can("project.update") && can("project.delete"), createProjects: can("project.create"), updateProjects: can("project.update"), shareProjects: can("project.share"), deleteProjects: can("project.delete"),
    updateTasks: can("task.update"), createTasks: can("task.create"), deleteTasks: can("task.delete"), assignTasks: can("task.assign"),
    createLabels: can("label.create"), updateLabels: can("label.update"), deleteLabels: can("label.delete"),
    manageWorkspace: can("workspace.update") || can("workspace.manage_settings"), manageSettings: can("workspace.manage_settings"), deleteWorkspace: can("workspace.delete"),
    inviteUsers: can("invitation.create") || can("member.create"), manageTeam: can("member.update") && can("member.delete"), updateMembers: can("member.update"), removeMembers: can("member.delete"),
  };
}
export async function checkProjectWorkspacePermission(db, data, actor) {
  const allowed = await requireWorkspace(db, data.organizationId || data.workspaceId, actor);
  if (allowed.error) return allowed;
  const requests = data.permissions || {};
  const success = Object.entries(requests).every(([resource, actions]) => Array.isArray(actions) && actions.every(action => workspaceAllows(allowed, `${resource}.${action}`)));
  return { success };
}
export async function getProjectAccess(db, projectId, actor, access) {
  const project = await getProject(db, projectId);
  if (!project) return null;
  const member = await getMembership(db, projectId, actor);
  const owner = actorEmail(actor) === actorEmail({ email: project.created_by_email }) || actorUid(actor) === safe(project.created_by_uid, 180);
  if (owner) return { project, role: "project-admin", permissions: fullProjectPermissions(), taskVisibility: "all", owner: true };
  if (member?.role) {
    const role = PROJECT_ROLES.includes(member.role) ? member.role : "viewer";
    const row = role === member.role ? await getMemberPermission(db, projectId, actorEmail(actor)) : null;
    const permissions = normalizeProjectPermissions(role, row);
    return { project, role, permissions, taskVisibility: permissions.task_visibility, owner: false };
  }
  const workspaceAccess = await getWorkspaceAccess(db, project.workspace_id, actor);
  if (workspaceAccess?.owner) {
    return { project, role: "project-admin", permissions: fullProjectPermissions(), taskVisibility: "all", owner: true };
  }
  // Workspace membership is the default access for every project in the
  // workspace, including restricted projects. An explicit project membership
  // above remains the project-only override.
  if (workspaceAccess) {
    if (workspaceAccess.projectScoped) return null;
    if (!workspaceAllows(workspaceAccess, "project.read")) return null;
    const isBuiltInRole = workspaceAccess.preset === true;
    const permissions = isBuiltInRole
      ? normalizeProjectPermissions(workspaceRoleForProject(workspaceAccess.role))
      : projectPermissionsFromWorkspace(workspaceAccess);
    if (!permissions.can_view_project) return null;
    const role = permissions.can_manage_project ? "project-admin" : permissions.can_edit_any_tasks ? "manager" : permissions.can_create_tasks || permissions.can_edit_own_tasks ? "contributor" : "viewer";
    return { project, role, permissions, taskVisibility: permissions.task_visibility, owner: false };
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

export async function listProjects(db, actor, access, data = {}) {
  await ensureProject(db);
  const { results } = await db.prepare("SELECT * FROM projects WHERE archived_at IS NULL ORDER BY updated_at DESC").all();
  const projects = [];
  for (const row of results || []) {
    if (data.workspaceId && row.workspace_id !== safe(data.workspaceId, 180)) continue;
    const projectAccess = await getProjectAccess(db, row.id, actor, access);
    if (canProjectCapability(projectAccess, "viewer")) projects.push({ ...projectFromRow(row), role: projectAccess.role, permissions: projectAccess.permissions, taskVisibility: projectAccess.taskVisibility });
  }
  return { projects };
}
export async function searchProjectWorkspace(db, data, actor, access) {
  const query = safe(data.query || data.search, 120).toLowerCase(); if (!query) return { projects: [], tasks: [] };
  const projectsResult = await listProjects(db, actor, access, data); const projects = projectsResult.projects || []; const taskMatches = [];
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
  const workspaceId = safe(data.workspaceId || "workspace-default", 180);
  const workspaceAccess = await requireWorkspace(db, workspaceId, actor, "project.create");
  if (workspaceAccess.error) return workspaceAccess;
  const name = safe(data.name, 160); if (!name) return { error: "A project name is required." };
  const key = safe(data.key || name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16), 32).toUpperCase() || "PROJECT";
  const projectId = newId("project"); const timestamp = now();
  try {
    await db.prepare("INSERT INTO projects (id,workspace_id,name,key,description,visibility,created_by_uid,created_by_email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(projectId, workspaceId, name, key, safe(data.description, 1000), data.visibility === "restricted" ? "restricted" : "workspace", actorUid(actor), actorEmail(actor), timestamp, timestamp).run();
    for (const [index, [suffix, label, status]] of [["inbox","Inbox","inbox"],["progress","In progress","in_progress"],["blocked","Blocked","blocked"],["done","Done","completed"],["cancelled","Cancelled","cancelled"]].entries()) await db.prepare("INSERT INTO project_columns (id,project_id,name,status_category,position) VALUES (?,?,?,?,?)").bind(`${projectId}-${suffix}`, projectId, label, status, (index + 1) * 10).run();
    // Project capabilities are evaluated from the workspace membership in the
    // web client. A project creator must therefore also be a workspace member;
    // preserve an existing owner/admin role and add a regular member only when
    // the caller is not already enrolled in the workspace.
    await db.prepare("INSERT OR IGNORE INTO project_workspace_members (workspace_id,user_uid,email,role,created_by_uid) VALUES (?,?,?,?,?)").bind(workspaceId, actorUid(actor), actorEmail(actor), "member", actorUid(actor)).run();
    await db.prepare("INSERT OR IGNORE INTO project_members (project_id,user_uid,email,role,created_by_uid) VALUES (?,?,?,?,?)").bind(projectId, actorUid(actor), actorEmail(actor), "project-admin", actorUid(actor)).run();
    return { success: true, project: projectFromRow(await getProject(db, projectId)), role: "project-admin", permissions: fullProjectPermissions(), taskVisibility: "all" };
  } catch (error) { return { error: String(error?.message || "Could not create project.") }; }
}
export async function updateProject(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access, "project-admin"); if (allowed.error) return allowed;
  if (!allowed.permissions.can_manage_project) return { error: "You cannot manage this project.", status: 403 };
  if (data.expectedRevision == null || data.expectedRevision === "") return { error: "expectedRevision is required.", status: 428, conflict: projectFromRow(allowed.project) };
  if (Number(data.expectedRevision) !== Number(allowed.project.revision)) return { error: "Project changed. Refresh and try again.", status: 409, conflict: projectFromRow(allowed.project) };
  const name = data.name !== undefined ? safe(data.name, 160) : allowed.project.name;
  if (!name) return { error: "A project name is required." };
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
  if (data.assignee === "me") { where.push("(assignee_uid=? OR lower(assignee_email)=lower(?))"); bind.push(actorUid(actor), actorEmail(actor)); }
  const requestedPriority = normalizeTaskPriority(data.priority);
  if (requestedPriority) { where.push("priority=?"); bind.push(requestedPriority); }
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
  return { task: taskFromRow(task), project: projectFromRow(allowed.project), role: allowed.role, permissions: allowed.permissions, comments: comments.results || [], labels: labels.results || [], relations: visibleRelations, links: links.results || [], events: events.results || [], customFields: (customFields.results || []).map(customFieldFromRow) };
}
export async function getProjectTaskByTicket(db, data, actor, access) {
  const ticket = parseProjectTicket(data.ticketId);
  const workspaceSlug = safe(data.workspaceSlug, 128).toLowerCase();
  if (!ticket || !workspaceSlug) return { error: "Task not found.", status: 404 };
  const result = await db.prepare(`SELECT t.*,p.workspace_id FROM project_tasks t JOIN projects p ON p.id=t.project_id WHERE lower(p.key)=lower(?) AND t.task_number=? AND p.archived_at IS NULL`).bind(ticket.projectKey, ticket.taskNumber).all();
  const matches = [];
  for (const row of result.results || []) {
    const workspace = await getWorkspace(db, row.workspace_id);
    if (workspaceFromRow(workspace)?.slug?.toLowerCase() !== workspaceSlug) continue;
    const allowed = await requireProject(db, row.project_id, actor, access);
    if (allowed.error || !canSeeTask(row, allowed, actor)) continue;
    matches.push({ ...taskFromRow(row), workspaceId: row.workspace_id });
  }
  if (matches.length > 1) return { error: "This task link is ambiguous.", status: 409 };
  if (!matches[0]) return { error: "Task not found.", status: 404 };
  return { task: matches[0] };
}
export async function createProjectTask(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access, "contributor"); if (allowed.error) return allowed;
  if (!allowed.permissions.can_create_tasks && !(data.projectId === "project-admin-operations" && has(access, "operations.tasks.create", ["operations.tasks.write"]))) return { error: "You cannot create tasks." };
  const requestedStatusValue = data.statusCategory ?? data.status;
  const requestedStatus = requestedStatusValue === undefined ? null : normalizeTaskStatus(requestedStatusValue);
  if (requestedStatusValue !== undefined && !requestedStatus) return { error: "Invalid task status.", status: 400 };
  const requestedPriority = data.priority === undefined ? "normal" : normalizeTaskPriority(data.priority);
  if (data.priority !== undefined && !requestedPriority) return { error: "Invalid task priority.", status: 400 };
  const dates = validateProjectDateRange(data.startAt, data.dueAt);
  if (dates.error) return dates;
  const position = normalizeProjectPosition(data.position);
  if (position === null) return { error: "Task position is invalid.", status: 400 };
  const column = data.columnId
    ? await db.prepare("SELECT * FROM project_columns WHERE id=? AND project_id=?").bind(data.columnId, data.projectId).first()
    : requestedStatus
      ? await db.prepare("SELECT * FROM project_columns WHERE project_id=? AND status_category=? ORDER BY position LIMIT 1").bind(data.projectId, requestedStatus).first()
      : await db.prepare("SELECT * FROM project_columns WHERE project_id=? ORDER BY position LIMIT 1").bind(data.projectId).first();
  if (!column) return { error: "A valid project column is required." };
  const title = safe(data.title, 240); if (!title) return { error: "A task title is required." };
  const assigneeUid = safe(data.assigneeUid, 180);
  const requestedAssigneeEmail = actorEmail({ email: data.assigneeEmail });
  if ((assigneeUid || requestedAssigneeEmail) && !allowed.permissions.can_assign_tasks && !taskAssignmentMatchesActor({ assigneeUid, assigneeEmail: requestedAssigneeEmail }, actor)) return { error: "You can only assign new tasks to yourself.", status: 403 };
  const assigneeEmail = await assigneeEmailFor(db, data.projectId, assigneeUid, data.assigneeEmail);
  if (assigneeEmail && !isKaramahEmail(assigneeEmail)) return { error: "Tasks can only be assigned to Karamah members.", status: 400 };
  const milestoneId = safe(data.milestoneId, 180) || null;
  if (milestoneId && !await db.prepare("SELECT id FROM project_milestones WHERE id=? AND project_id=?").bind(milestoneId, data.projectId).first()) return { error: "The milestone does not belong to this project.", status: 400 };
  const customValues = [];
  for (const item of Array.isArray(data.customFields) ? data.customFields.slice(0, 100) : []) {
    const field = await db.prepare("SELECT * FROM project_custom_fields WHERE id=? AND project_id=?").bind(item?.fieldId, data.projectId).first();
    if (!field) return { error: "Custom field not found.", status: 404 };
    const value = normalizeProjectCustomFieldValue(field, item?.value);
    if (value === null) return { error: `Invalid value for custom field ${safe(field.name, 100)}.`, status: 400 };
    if (Number(field.required) && !value) return { error: `A value is required for custom field ${safe(field.name, 100)}.`, status: 400 };
    if (value) customValues.push({ fieldId: field.id, value });
  }
  const id = newId("task"); const timestamp = now();
  await db.prepare(`INSERT INTO project_tasks (id,project_id,task_number,title,description,column_id,status_category,priority,assignee_uid,assignee_email,start_at,due_at,milestone_id,source_domain,source_type,source_id,source_action,dedupe_key,position,created_by_uid,created_by_email,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, data.projectId, await nextTaskNumber(db, data.projectId), title, safe(data.description, 10000), column.id, column.status_category, requestedPriority, assigneeUid, assigneeEmail, dates.startAt, dates.dueAt, milestoneId, safe(data.sourceDomain, 80), safe(data.sourceType, 120), safe(data.sourceId, 180), safe(data.sourceAction, 120), safe(data.dedupeKey, 300) || null, position, actorUid(actor), actorEmail(actor), timestamp, timestamp).run();
  for (const item of customValues) await db.prepare("INSERT INTO project_task_custom_values (task_id,field_id,value_text,updated_by_uid,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(task_id,field_id) DO UPDATE SET value_text=excluded.value_text,updated_by_uid=excluded.updated_by_uid,updated_at=excluded.updated_at").bind(id, item.fieldId, item.value, actorUid(actor), timestamp).run();
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
  const isAssignmentOnly = Object.keys(data).every(key => ["id", "expectedRevision", "assigneeUid", "assigneeEmail"].includes(key))
    && (data.assigneeUid !== undefined || data.assigneeEmail !== undefined);
  const isSelfAssignment = isAssignmentOnly && taskAssignmentMatchesActor(data, actor);
  const canEdit = allowed.permissions.can_edit_any_tasks || (allowed.permissions.can_edit_own_tasks && (isOwn || isSelfAssignment)) || (allowed.permissions.can_assign_tasks && isAssignmentOnly);
  if (!canEdit) return { error: "You do not have write access to this task.", status: 403 };
  const requestedProjectId = data.projectId === undefined ? task.project_id : safe(data.projectId, 180) || task.project_id;
  const moving = requestedProjectId && requestedProjectId !== task.project_id;
  const destination = moving ? await requireProject(db, requestedProjectId, actor, access, "contributor") : allowed;
  if (destination.error) return destination;
  const assignmentChanged = data.assigneeUid !== undefined || data.assigneeEmail !== undefined;
  const nextAssigneeUid = data.assigneeUid !== undefined ? safe(data.assigneeUid, 180) : task.assignee_uid;
  const nextAssigneeEmail = assignmentChanged
    ? await assigneeEmailFor(db, requestedProjectId, nextAssigneeUid, data.assigneeEmail)
    : task.assignee_email;
  if (nextAssigneeEmail && !isKaramahEmail(nextAssigneeEmail)) return { error: "Tasks can only be assigned to Karamah members.", status: 400 };
  const nextMilestoneId = data.milestoneId !== undefined ? safe(data.milestoneId, 180) || null : moving ? null : task.milestone_id;
  if (nextMilestoneId && !await db.prepare("SELECT id FROM project_milestones WHERE id=? AND project_id=?").bind(nextMilestoneId, requestedProjectId).first()) return { error: "The milestone does not belong to this project.", status: 400 };
  const requestedStatusValue = data.statusCategory ?? data.status;
  const requestedStatus = requestedStatusValue === undefined ? null : normalizeTaskStatus(requestedStatusValue);
  if (requestedStatusValue !== undefined && !requestedStatus) return { error: "Invalid task status.", status: 400 };
  const priority = data.priority === undefined ? task.priority : normalizeTaskPriority(data.priority);
  if (data.priority !== undefined && !priority) return { error: "Invalid task priority.", status: 400 };
  const datesChanged = data.startAt !== undefined || data.dueAt !== undefined;
  const dates = datesChanged
    ? validateProjectDateRange(data.startAt !== undefined ? data.startAt : task.start_at, data.dueAt !== undefined ? data.dueAt : task.due_at)
    : { startAt: task.start_at || null, dueAt: task.due_at || null };
  if (dates.error) return dates;
  if (data.title !== undefined && !safe(data.title, 240)) return { error: "A task title is required." };
  const position = normalizeProjectPosition(data.position, task.position == null ? 0 : Number(task.position));
  if (position === null) return { error: "Task position is invalid.", status: 400 };
  const column = data.columnId
    ? await db.prepare("SELECT * FROM project_columns WHERE id=? AND project_id=?").bind(data.columnId, requestedProjectId).first()
    : requestedStatus
      ? await db.prepare("SELECT * FROM project_columns WHERE project_id=? AND status_category=? ORDER BY position LIMIT 1").bind(requestedProjectId, requestedStatus).first()
      : moving
        ? await db.prepare("SELECT * FROM project_columns WHERE project_id=? ORDER BY position LIMIT 1").bind(requestedProjectId).first()
        : null;
  if (moving && !column) return { error: "A valid destination project column is required.", status: 400 };
  if (data.columnId && !column) return { error: "The column does not belong to this project.", status: 400 };
  const status = column?.status_category || requestedStatus || task.status_category;
  const values = [requestedProjectId, moving ? await nextTaskNumber(db, requestedProjectId) : task.task_number, data.title !== undefined ? safe(data.title, 240) : task.title, data.description !== undefined ? safe(data.description, 10000) : task.description, column?.id || task.column_id, status, priority, nextAssigneeUid, nextAssigneeEmail, data.startAt !== undefined ? dates.startAt : task.start_at, data.dueAt !== undefined ? dates.dueAt : task.due_at, nextMilestoneId, position, status === "completed" ? (task.completed_at || now()) : null, Number(task.revision || 1) + 1, now(), task.id];
  await db.prepare("UPDATE project_tasks SET project_id=?,task_number=?,title=?,description=?,column_id=?,status_category=?,priority=?,assignee_uid=?,assignee_email=?,start_at=?,due_at=?,milestone_id=?,position=?,completed_at=?,revision=?,updated_at=? WHERE id=?").bind(...values).run();
  if (moving) {
    const labels = await db.prepare("SELECT l.name FROM project_labels l JOIN project_task_labels tl ON tl.label_id=l.id WHERE tl.task_id=?").bind(task.id).all();
    await db.prepare("DELETE FROM project_task_labels WHERE task_id=?").bind(task.id).run();
    for (const label of labels.results || []) {
      const destinationLabel = await db.prepare("SELECT id FROM project_labels WHERE project_id=? AND lower(name)=lower(?)").bind(requestedProjectId, label.name).first();
      if (destinationLabel) await db.prepare("INSERT OR IGNORE INTO project_task_labels (task_id,label_id) VALUES (?,?)").bind(task.id, destinationLabel.id).run();
    }
    await db.prepare("DELETE FROM project_task_custom_values WHERE task_id=? AND field_id NOT IN (SELECT id FROM project_custom_fields WHERE project_id=? )").bind(task.id, requestedProjectId).run();
  }
  if (status !== task.status_category) await event(db, task.id, "status", task.status_category, status, data.note, actor);
  if (moving) await event(db, task.id, "project", task.project_id, requestedProjectId, data.note, actor);
  if (priority !== task.priority) await event(db, task.id, "priority", task.priority, priority, data.note, actor);
  if ((values[8] || "") !== (task.assignee_email || "")) await notifyTask(db, { ...task, assignee_email: values[8], project_id: requestedProjectId }, "assignment", "Task assigned", task.title, actor);
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
  if (!Array.isArray(data.taskIds) || data.taskIds.length === 0) return { error: "At least one task is required.", status: 400 };
  if (data.taskIds.length > 100) return { error: "A bulk request cannot include more than 100 tasks.", status: 400 };
  const prior = await db.prepare("SELECT result_json FROM project_task_idempotency WHERE request_id=? AND actor_uid=?").bind(requestId, actorUid(actor)).first(); if (prior) return json(prior.result_json, { success: false });
  const changes = data.changes && typeof data.changes === "object" ? data.changes : {};
  const ids = [...new Set((Array.isArray(data.taskIds) ? data.taskIds : []).map(item => safe(item, 220)).filter(Boolean))].slice(0, 100); const results = [];
  for (const id of ids) {
    const current = await getTask(db, id);
    const result = await updateProjectTask(db, { ...changes, id, ...(changes.expectedRevision == null && current ? { expectedRevision: current.revision } : {}) }, actor, access);
    results.push({ taskId: id, success: !!result.success, error: result.error || null, conflict: result.conflict || null });
  }
  const output = { success: results.every(item => item.success), results, succeeded: results.filter(item => item.success).length, failed: results.filter(item => !item.success).length };
  await db.prepare("INSERT INTO project_task_idempotency (request_id,actor_uid,action,result_json) VALUES (?,?,?,?)").bind(requestId, actorUid(actor), safe(data.action || "bulk_update", 120), JSON.stringify(output)).run();
  return output;
}
export async function addProjectTaskComment(db, data, actor, access) {
  const task = await getTask(db, data.taskId); if (!task) return { error: "Task not found.", status: 404 };
  const allowed = await requireProject(db, task.project_id, actor, access, "contributor"); if (allowed.error) return allowed;
  if (!canSeeTask(task, allowed, actor) || !allowed.permissions.can_comment) return { error: "You cannot comment on this task.", status: 403 };
  const body = safe(data.body ?? data.comment, 5000); if (!body) return { error: "Comment text is required." };
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
export async function createProjectMilestone(db, data, actor, access) { const allowed = await requireProject(db, data.projectId, actor, access, "manager"); if (allowed.error) return allowed; const dates = validateProjectDateRange(data.startAt, data.dueAt, "milestone"); if (dates.error) return dates; const milestone = { id: newId("milestone"), projectId: data.projectId, name: safe(data.name, 160), description: safe(data.description, 1000), startAt: dates.startAt, dueAt: dates.dueAt, status: "planned" }; if (!milestone.name) return { error: "Milestone name is required." }; await db.prepare("INSERT INTO project_milestones (id,project_id,name,description,start_at,due_at,created_by_uid) VALUES (?,?,?,?,?,?,?)").bind(milestone.id,milestone.projectId,milestone.name,milestone.description,milestone.startAt,milestone.dueAt,actorUid(actor)).run(); return { success: true, milestone }; }
export async function updateProjectMilestone(db, data, actor, access) {
  const row = await db.prepare("SELECT * FROM project_milestones WHERE id=?").bind(safe(data.id, 180)).first(); if (!row) return { error: "Milestone not found.", status: 404 };
  const allowed = await requireProject(db, row.project_id, actor, access, "manager"); if (allowed.error) return allowed;
  if (data.expectedRevision == null || data.expectedRevision === "") return { error: "expectedRevision is required.", status: 428, conflict: row };
  if (Number(data.expectedRevision) !== Number(row.revision || 1)) return { error: "Milestone changed. Refresh and try again.", status: 409, conflict: row };
  const datesChanged = data.startAt !== undefined || data.dueAt !== undefined;
  const dates = datesChanged ? validateProjectDateRange(data.startAt !== undefined ? data.startAt : row.start_at, data.dueAt !== undefined ? data.dueAt : row.due_at, "milestone") : { startAt: row.start_at || null, dueAt: row.due_at || null };
  if (dates.error) return dates;
  if (data.name !== undefined && !safe(data.name, 160)) return { error: "Milestone name is required." };
  const status = ["planned", "active", "completed", "cancelled"].includes(data.status) ? data.status : row.status;
  await db.prepare("UPDATE project_milestones SET name=?,description=?,start_at=?,due_at=?,status=?,revision=revision+1,updated_at=? WHERE id=?").bind(data.name !== undefined ? safe(data.name, 160) : row.name, data.description !== undefined ? safe(data.description, 1000) : row.description, data.startAt !== undefined ? dates.startAt : row.start_at, data.dueAt !== undefined ? dates.dueAt : row.due_at, status, now(), row.id).run();
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
  const members = new Map((result.results || []).map((member) => [actorEmail(member), member]));
  const workspaceAccess = allowed.project.visibility === "workspace"
    ? await getWorkspaceAccess(db, allowed.project.workspace_id, actor)
    : null;
  if (workspaceAccess) {
    try {
      const workspaceMembers = await db.prepare("SELECT user_uid,email,role,created_at,updated_at FROM project_workspace_members WHERE workspace_id=? ORDER BY lower(email)").bind(allowed.project.workspace_id).all();
      for (const member of workspaceMembers.results || []) {
        const email = actorEmail(member);
        if (email && !members.has(email)) members.set(email, { ...member, role: member.role === "owner" ? "project-admin" : workspaceRoleForProject(member.role) });
      }
    } catch { /* Keep explicit project members working on older project databases. */ }
    if (!members.has(actorEmail(actor))) members.set(actorEmail(actor), {
      user_uid: actorUid(actor), email: actorEmail(actor), role: workspaceAccess.role === "owner" ? "project-admin" : workspaceRoleForProject(workspaceAccess.role),
      created_at: allowed.project.created_at, updated_at: allowed.project.updated_at,
    });
  }
  if (allowed.owner && !members.has(actorEmail(actor))) members.set(actorEmail(actor), {
    user_uid: actorUid(actor), email: actorEmail(actor), role: "project-admin",
    created_at: allowed.project.created_at, updated_at: allowed.project.updated_at,
  });
  return { members: [...members.values()].filter(member => member.email).map(member => ({
    userUid: member.user_uid, email: member.email, role: member.role, createdAt: member.created_at, updatedAt: member.updated_at,
    isExternal: !isKaramahEmail(member.email),
    permissions: normalizeProjectPermissions(member.role, member), taskVisibility: TASK_VISIBILITY.includes(member.task_visibility) ? member.task_visibility : "all",
  })), invitations: await listProjectInvitations(db, data, actor, access).then(result => result.invitations || []) };
}
export async function updateProjectMember(db, data, actor, access, env) {
  const allowed = await requireProject(db, data.projectId, actor, access, "project-admin"); if (allowed.error) return allowed;
  if (!allowed.permissions.can_manage_members) return { error: "You cannot manage project members.", status: 403 };
  const member = data.member || data; const targetEmail = actorEmail({ email: member.email }); const role = PROJECT_ROLES.includes(member.role) ? member.role : "viewer";
  const permissions = normalizeProjectPermissions(role, member.permissions || member);
  const existing = await db.prepare("SELECT email FROM project_members WHERE project_id=? AND lower(email)=lower(?)").bind(data.projectId, targetEmail).first();
  if (!existing && !isKaramahEmail(targetEmail)) {
    return createProjectInvitation(db, { ...data, email: targetEmail, projectRole: role, permissions }, actor, env);
  }
  if (!targetEmail) return { error: "A valid email address is required." };
  await db.prepare("INSERT INTO project_members (project_id,user_uid,email,role,created_by_uid,updated_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(project_id,email) DO UPDATE SET user_uid=excluded.user_uid,role=excluded.role,updated_at=datetime('now')").bind(data.projectId, safe(member.userUid, 180), targetEmail, role, actorUid(actor)).run();
  await db.prepare(`INSERT INTO project_member_permissions (project_id,email,${PROJECT_PERMISSION_KEYS.join(",")},task_visibility,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(project_id,email) DO UPDATE SET ${PROJECT_PERMISSION_KEYS.map(key => `${key}=excluded.${key}`).join(",")},task_visibility=excluded.task_visibility,updated_at=datetime('now')`)
    .bind(data.projectId, targetEmail, ...PROJECT_PERMISSION_KEYS.map(key => permissions[key] ? 1 : 0), permissions.task_visibility).run();
  return { success: true, external: !isKaramahEmail(targetEmail), member: { projectId: data.projectId, userUid: safe(member.userUid, 180), email: targetEmail, role, isExternal: !isKaramahEmail(targetEmail), permissions, taskVisibility: permissions.task_visibility } };
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
export async function createProjectColumn(db, data, actor, access) { const allowed = await requireProject(db, data.projectId, actor, access, "manager"); if (allowed.error) return allowed; const name = safe(data.name, 120); if (!name) return { error: "Column name is required." }; if (data.statusCategory !== undefined && !TASK_STATUSES.includes(data.statusCategory)) return { error: "Invalid column status category.", status: 400 }; const position = normalizeProjectPosition(data.position); if (position === null) return { error: "Column position is invalid.", status: 400 }; const column = { id: newId("column"), projectId: data.projectId, name, statusCategory: data.statusCategory === undefined ? "inbox" : data.statusCategory, position }; await db.prepare("INSERT INTO project_columns (id,project_id,name,status_category,position) VALUES (?,?,?,?,?)").bind(column.id,column.projectId,column.name,column.statusCategory,column.position).run(); return { success: true, column }; }
export async function updateProjectColumn(db, data, actor, access) { const column = await db.prepare("SELECT * FROM project_columns WHERE id=?").bind(safe(data.id,180)).first(); if (!column) return { error: "Column not found.", status: 404 }; const allowed = await requireProject(db, column.project_id, actor, access, "manager"); if (allowed.error) return allowed; const name = data.name !== undefined ? safe(data.name,120) : column.name; if (!name) return { error: "Column name is required." }; if (data.statusCategory !== undefined && !TASK_STATUSES.includes(data.statusCategory)) return { error: "Invalid column status category.", status: 400 }; const position = normalizeProjectPosition(data.position, Number(column.position || 0)); if (position === null) return { error: "Column position is invalid.", status: 400 }; await db.prepare("UPDATE project_columns SET name=?,status_category=?,position=?,updated_at=datetime('now') WHERE id=?").bind(name, data.statusCategory === undefined ? column.status_category : data.statusCategory, position, column.id).run(); return { success: true, column: columnFromRow(await db.prepare("SELECT * FROM project_columns WHERE id=?").bind(column.id).first()) }; }
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
export async function createProjectRelation(db, data, actor, access) {
  const task = await getTask(db, data.taskId);
  if (!task) return { error: "Both tasks must exist in the same project.", status: 404 };
  const allowed = await requireProject(db, task.project_id, actor, access, "contributor");
  if (allowed.error) return allowed;
  if (!allowed.permissions.can_relate || !canSeeTask(task, allowed, actor)) return { error: "You cannot relate these tasks.", status: 403 };
  const related = await getTask(db, data.relatedTaskId);
  if (!related || related.project_id !== task.project_id || !canSeeTask(related, allowed, actor)) return { error: "Both tasks must exist in the same project.", status: 404 };
  if (data.relationType !== undefined && !["blocks", "blocked_by", "relates_to", "subtask"].includes(data.relationType)) return { error: "Invalid task relation type.", status: 400 };
  const relation = data.relationType === undefined ? "relates_to" : data.relationType;
  if (task.id === related.id) return { error: "A task cannot relate to itself." };
  await db.prepare("INSERT OR IGNORE INTO project_task_relations (task_id,related_task_id,relation_type,created_by_uid) VALUES (?,?,?,?)").bind(task.id, related.id, relation, actorUid(actor)).run();
  return { success: true, relation: { taskId: task.id, relatedTaskId: related.id, relationType: relation } };
}
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
async function resolveProjectLabelId(db, data, actor, access) {
  let projectId = safe(data.projectId, 180);
  if (!projectId && data.id) {
    const label = await db.prepare("SELECT project_id FROM project_labels WHERE id=?").bind(safe(data.id, 180)).first();
    projectId = safe(label?.project_id, 180);
  }
  if (!projectId && data.taskId) {
    const task = await getTask(db, data.taskId);
    projectId = safe(task?.project_id, 180);
  }
  if (!projectId && data.workspaceId) {
    const projects = await db.prepare("SELECT id FROM projects WHERE workspace_id=? AND archived_at IS NULL ORDER BY created_at,id").bind(safe(data.workspaceId, 180)).all();
    for (const project of projects.results || []) {
      const allowed = await requireProject(db, project.id, actor, access, "manager");
      if (!allowed.error) return project.id;
    }
  }
  return projectId || null;
}
export async function saveProjectLabel(db, data, actor, access) {
  const projectId = await resolveProjectLabelId(db, data, actor, access);
  if (!projectId) return { error: "You do not have access to create labels in this workspace.", status: 403 };
  const allowed = await requireProject(db, projectId, actor, access, "manager"); if (allowed.error) return allowed;
  const name = safe(data.name, 80); if (!name) return { error: "A label name is required." }; const existing = await db.prepare("SELECT id FROM project_labels WHERE project_id=? AND lower(name)=lower(?)").bind(projectId, name).first(); const requestedId = safe(data.id, 180); if (existing && requestedId && existing.id !== requestedId) return { error: "A label with this name already exists." }; const id = requestedId || existing?.id || newId("label");
  await db.prepare("INSERT INTO project_labels (id,project_id,name,color) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color").bind(id, projectId, name, safe(data.color || "#2b745c", 20)).run(); return { success: true, label: await db.prepare("SELECT * FROM project_labels WHERE id=?").bind(id).first() };
}
export async function detachProjectLabel(db, data, actor, access) {
  const task = await getTask(db, data.taskId); if (!task) return { error: "Task not found.", status: 404 }; const allowed = await projectTaskAccess(db, task.id, actor, access, "contributor"); if (allowed.error) return allowed; if (!allowed.permissions.can_edit_own_tasks && !allowed.permissions.can_edit_any_tasks) return { error: "You cannot edit labels on this task.", status: 403 };
  await db.prepare("DELETE FROM project_task_labels WHERE task_id=? AND label_id=?").bind(task.id, safe(data.labelId, 180)).run(); return { success: true };
}
export async function deleteProjectLabel(db, data, actor, access) {
  const projectId = await resolveProjectLabelId(db, data, actor, access);
  if (!projectId) return { error: "Label not found.", status: 404 };
  const allowed = await requireProject(db, projectId, actor, access, "manager"); if (allowed.error) return allowed; const label = await db.prepare("SELECT id FROM project_labels WHERE id=? AND project_id=?").bind(safe(data.id, 180), projectId).first(); if (!label) return { error: "Label not found.", status: 404 }; await db.prepare("DELETE FROM project_labels WHERE id=?").bind(label.id).run(); return { success: true };
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
  let url; try { url = new URL(String(data.url || "")); } catch { return { error: "Webhook URL is invalid.", status: 400 }; }
  if (!["https:", "http:"].includes(url.protocol)) return { error: "Webhook URL must use HTTP or HTTPS.", status: 400 };
  if (url.username || url.password || isDisallowedWebhookHost(url.hostname)) return { error: "Webhook URL targets a disallowed host.", status: 400 };
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
  const viewType = ["board", "list", "calendar", "timeline", "backlog"].includes(data.viewType) ? data.viewType : "board";
  return { success: true, view: { id, projectId: data.projectId, name, viewType, filters: data.filters || {}, sort: data.sort || {}, shared: !!data.shared } };
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
  const start = data.startedAt === undefined ? now() : normalizeProjectDate(data.startedAt);
  const end = data.endedAt === undefined || data.endedAt === null || data.endedAt === "" ? null : normalizeProjectDate(data.endedAt);
  if (!start || (data.endedAt !== undefined && data.endedAt !== null && data.endedAt !== "" && !end)) return { error: "Time entry dates are invalid.", status: 400 };
  if (start && end && end < start) return { error: "A time entry must end on or after it starts.", status: 400 };
  const hasDuration = data.durationMinutes !== undefined && data.durationMinutes !== null && data.durationMinutes !== "";
  const requestedDuration = hasDuration ? Number(data.durationMinutes) : null;
  if (hasDuration && (!Number.isFinite(requestedDuration) || requestedDuration < 0 || requestedDuration > 1_000_000)) return { error: "Time entry duration is invalid.", status: 400 };
  const duration = hasDuration ? Math.round(requestedDuration) : end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) : 0;
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
  return { fields: (fields.results || []).map(customFieldFromRow) };
}
export async function listProjectCustomFieldValues(db, data, actor, access) {
  const allowed = await requireProject(db, data.projectId, actor, access); if (allowed.error) return allowed;
  const result = await db.prepare(`SELECT f.*,v.task_id,v.value_text,t.created_by_uid,t.created_by_email,t.assignee_uid,t.assignee_email
    FROM project_custom_fields f
    INNER JOIN project_tasks t ON t.project_id=f.project_id
    INNER JOIN project_task_custom_values v ON v.field_id=f.id AND v.task_id=t.id
    WHERE f.project_id=? ORDER BY t.id,f.position`).bind(data.projectId).all();
  return { values: (result.results || []).filter(row => canSeeTask(row, allowed, actor)).map(row => ({
    id: `${row.task_id}:${row.id}`, taskId: row.task_id, fieldId: row.id, value: row.value_text,
    fieldName: row.name, fieldPosition: Number(row.position || 0), fieldType: customFieldTypeForClient(row), fieldOptions: json(row.options_json, []),
  })) };
}
export async function listProjectCustomFieldFilterValues(db, data, actor, access) {
  const result = await listProjectCustomFieldValues(db, data, actor, access);
  if (result.error) return result;
  const values = new Map();
  for (const item of result.values || []) {
    const current = values.get(item.fieldId) || new Set();
    if (item.value) {
      try {
        const parsed = JSON.parse(item.value);
        for (const value of Array.isArray(parsed) ? parsed : [item.value]) current.add(String(value));
      } catch { current.add(item.value); }
    }
    values.set(item.fieldId, current);
  }
  return { values: [...values].map(([fieldId, fieldValues]) => ({ fieldId, values: [...fieldValues].sort() })) };
}
export async function saveProjectCustomField(db, data, actor, access) {
  const id = safe(data.id, 180) || null;
  const current = id ? await db.prepare("SELECT * FROM project_custom_fields WHERE id=?").bind(id).first() : null;
  if (id && !current) return { error: "Custom field not found.", status: 404 };
  const projectId = safe(data.projectId || current?.project_id, 180);
  const allowed = await requireProject(db, projectId, actor, access, "manager"); if (allowed.error) return allowed;
  const name = data.name === undefined ? safe(current?.name, 100) : safe(data.name, 100); if (!name) return { error: "A field name is required." };
  const requestedType = data.type ?? data.fieldType;
  const fieldType = normalizeProjectCustomFieldType(requestedType === undefined ? current?.field_type : requestedType);
  if (!fieldType) return { error: "Invalid custom field type.", status: 400 };
  const multiple = data.multiple === undefined ? Boolean(Number(current?.multiple || 0)) : Boolean(data.multiple);
  if (multiple && fieldType !== "select") return { error: "Only dropdown fields can allow multiple values.", status: 400 };
  const options = data.options === undefined ? json(current?.options_json, []) : (Array.isArray(data.options) ? data.options.slice(0, 30).map(item => safe(item, 80)).filter(Boolean) : []);
  if (fieldType === "select" && options.length === 0) return { error: "Dropdown fields require at least one option.", status: 400 };
  const position = normalizeProjectPosition(data.position, Number(current?.position || 0)); if (position === null) return { error: "Custom field position is invalid.", status: 400 };
  const required = data.required === undefined ? Number(current?.required || 0) : (data.required ? 1 : 0);
  const defaultValue = data.defaultValue === undefined ? current?.default_value || null : (data.defaultValue === null ? null : safe(data.defaultValue, 2000) || null);
  if (required && !defaultValue) return { error: "Required custom fields need a default value.", status: 400 };
  const fieldId = id || newId("field");
  await db.prepare("INSERT INTO project_custom_fields (id,project_id,name,field_type,options_json,position,required,default_value,multiple,created_by_uid,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,field_type=excluded.field_type,options_json=excluded.options_json,position=excluded.position,required=excluded.required,default_value=excluded.default_value,multiple=excluded.multiple,updated_at=datetime('now')").bind(fieldId, projectId, name, fieldType, JSON.stringify(options), position, required, defaultValue, multiple ? 1 : 0, actorUid(actor)).run();
  return { success: true, field: customFieldFromRow(await db.prepare("SELECT * FROM project_custom_fields WHERE id=?").bind(fieldId).first()) };
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
  const value = normalizeProjectCustomFieldValue(field, data.value); if (value === null) return { error: "Invalid custom field value.", status: 400 };
  if (Number(field.required) && !value) return { error: "A value is required for this custom field.", status: 400 };
  await db.prepare("INSERT INTO project_task_custom_values (task_id,field_id,value_text,updated_by_uid,updated_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(task_id,field_id) DO UPDATE SET value_text=excluded.value_text,updated_by_uid=excluded.updated_by_uid,updated_at=datetime('now')").bind(data.taskId, field.id, value, actorUid(actor)).run();
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

async function ensureProjectNotificationPreferences(db, actor) {
  const uid = actorUid(actor);
  await db.prepare("INSERT OR IGNORE INTO project_notification_preferences (owner_uid,owner_email) VALUES (?,?)").bind(uid, actorEmail(actor)).run();
  return db.prepare("SELECT * FROM project_notification_preferences WHERE owner_uid=?").bind(uid).first();
}
function notificationPreferenceResult(row, rules) {
  return {
    emailAddress: row.owner_email || null,
    emailEnabled: bool(row.email_enabled),
    ntfyEnabled: bool(row.ntfy_enabled),
    ntfyConfigured: Boolean(row.ntfy_server_url && row.ntfy_topic),
    ntfyServerUrl: row.ntfy_server_url || null,
    ntfyTopic: row.ntfy_topic || null,
    ntfyTokenConfigured: Boolean(row.ntfy_token_ciphertext),
    maskedNtfyToken: row.ntfy_token_ciphertext ? "••••" : null,
    gotifyEnabled: bool(row.gotify_enabled),
    gotifyConfigured: Boolean(row.gotify_server_url && row.gotify_token_ciphertext),
    gotifyServerUrl: row.gotify_server_url || null,
    gotifyTokenConfigured: Boolean(row.gotify_token_ciphertext),
    maskedGotifyToken: row.gotify_token_ciphertext ? "••••" : null,
    webhookEnabled: bool(row.webhook_enabled),
    webhookConfigured: Boolean(row.webhook_url),
    webhookUrl: row.webhook_url || null,
    webhookSecretConfigured: Boolean(row.webhook_secret_ciphertext),
    maskedWebhookSecret: row.webhook_secret_ciphertext ? "••••" : null,
    taskAssignmentEnabled: bool(row.task_assignment_enabled),
    taskCommentEnabled: bool(row.task_comment_enabled),
    taskStatusChangeEnabled: bool(row.task_status_change_enabled),
    dueDateReminderEnabled: bool(row.due_date_reminder_enabled),
    dueDateReminderLeadTimeMinutes: Number(row.due_date_reminder_lead_time_minutes || 1440),
    workspaces: rules,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}
async function projectNotificationPreferencesResponse(db, actor) {
  const row = await ensureProjectNotificationPreferences(db, actor);
  const result = await db.prepare(`SELECT r.*,w.name AS workspace_name
    FROM project_notification_workspace_rules r
    INNER JOIN project_workspaces w ON w.id=r.workspace_id
    WHERE r.owner_uid=? ORDER BY lower(w.name),w.id`).bind(actorUid(actor)).all();
  const rules = [];
  for (const rule of result.results || []) {
    if (!(await getWorkspaceAccess(db, rule.workspace_id, actor))) continue;
    rules.push({
      id: `${rule.owner_uid}:${rule.workspace_id}`,
      workspaceId: rule.workspace_id,
      workspaceName: rule.workspace_name,
      isActive: bool(rule.is_active),
      emailEnabled: bool(rule.email_enabled),
      ntfyEnabled: bool(rule.ntfy_enabled),
      gotifyEnabled: bool(rule.gotify_enabled),
      webhookEnabled: bool(rule.webhook_enabled),
      projectMode: rule.project_mode === "selected" ? "selected" : "all",
      selectedProjectIds: json(rule.selected_project_ids_json, []),
      createdAt: rule.created_at,
      updatedAt: rule.updated_at,
    });
  }
  return notificationPreferenceResult(row, rules);
}
export async function getProjectNotificationPreferences(db, actor) {
  return projectNotificationPreferencesResponse(db, actor);
}
export async function updateProjectNotificationPreferences(db, data, actor, env) {
  const current = await ensureProjectNotificationPreferences(db, actor);
  const urlValue = (value, existing, label) => {
    if (value === undefined) return existing || null;
    const candidate = safe(value, 1000);
    if (!candidate) return null;
    if (!validHttpUrl(candidate)) return { error: `${label} must be an HTTP or HTTPS URL.`, status: 400 };
    return candidate;
  };
  const ntfyServerUrl = urlValue(data.ntfyServerUrl, current.ntfy_server_url, "ntfy server URL");
  const gotifyServerUrl = urlValue(data.gotifyServerUrl, current.gotify_server_url, "Gotify server URL");
  const webhookUrl = urlValue(data.webhookUrl, current.webhook_url, "Webhook URL");
  for (const value of [ntfyServerUrl, gotifyServerUrl, webhookUrl]) if (value && value.error) return value;
  const secret = async (value, existing) => {
    if (value === undefined) return existing || "";
    if (value === null || safe(value, 2000) === "") return "";
    return encryptNotificationSecret(env, safe(value, 2000));
  };
  const ntfyToken = await secret(data.ntfyToken, current.ntfy_token_ciphertext);
  const gotifyToken = await secret(data.gotifyToken, current.gotify_token_ciphertext);
  const webhookSecret = await secret(data.webhookSecret, current.webhook_secret_ciphertext);
  const lead = data.dueDateReminderLeadTimeMinutes === undefined
    ? Number(current.due_date_reminder_lead_time_minutes || 1440)
    : Number(data.dueDateReminderLeadTimeMinutes);
  if (!Number.isInteger(lead) || lead < 60 || lead > 43200) return { error: "Due-date reminder lead time is invalid.", status: 400 };
  const value = (key, fallback) => data[key] === undefined ? fallback : (data[key] ? 1 : 0);
  await db.prepare(`UPDATE project_notification_preferences SET owner_email=?,email_enabled=?,ntfy_enabled=?,ntfy_server_url=?,ntfy_topic=?,ntfy_token_ciphertext=?,gotify_enabled=?,gotify_server_url=?,gotify_token_ciphertext=?,webhook_enabled=?,webhook_url=?,webhook_secret_ciphertext=?,task_assignment_enabled=?,task_comment_enabled=?,task_status_change_enabled=?,due_date_reminder_enabled=?,due_date_reminder_lead_time_minutes=?,updated_at=? WHERE owner_uid=?`)
    .bind(actorEmail(actor), value("emailEnabled", current.email_enabled), value("ntfyEnabled", current.ntfy_enabled), ntfyServerUrl, data.ntfyTopic === undefined ? current.ntfy_topic || null : safe(data.ntfyTopic, 240) || null, ntfyToken, value("gotifyEnabled", current.gotify_enabled), gotifyServerUrl, gotifyToken, value("webhookEnabled", current.webhook_enabled), webhookUrl, webhookSecret, value("taskAssignmentEnabled", current.task_assignment_enabled), value("taskCommentEnabled", current.task_comment_enabled), value("taskStatusChangeEnabled", current.task_status_change_enabled), value("dueDateReminderEnabled", current.due_date_reminder_enabled), lead, now(), actorUid(actor)).run();
  return projectNotificationPreferencesResponse(db, actor);
}
export async function upsertProjectNotificationWorkspaceRule(db, data, actor) {
  const workspaceId = safe(data.workspaceId, 180);
  const allowed = await requireWorkspace(db, workspaceId, actor, "workspace.read");
  if (allowed.error) return allowed;
  const projectMode = data.projectMode === "selected" ? "selected" : "all";
  const selectedProjectIds = [...new Set((Array.isArray(data.selectedProjectIds) ? data.selectedProjectIds : []).map(value => safe(value, 180)).filter(Boolean))].slice(0, 100);
  if (projectMode === "selected" && selectedProjectIds.length) {
    const placeholders = selectedProjectIds.map(() => "?").join(",");
    const result = await db.prepare(`SELECT id FROM projects WHERE workspace_id=? AND id IN (${placeholders})`).bind(workspaceId, ...selectedProjectIds).all();
    if ((result.results || []).length !== selectedProjectIds.length) return { error: "One or more selected projects are not in this workspace.", status: 400 };
  }
  await ensureProjectNotificationPreferences(db, actor);
  await db.prepare(`INSERT INTO project_notification_workspace_rules (owner_uid,workspace_id,is_active,email_enabled,ntfy_enabled,gotify_enabled,webhook_enabled,project_mode,selected_project_ids_json,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_uid,workspace_id) DO UPDATE SET is_active=excluded.is_active,email_enabled=excluded.email_enabled,ntfy_enabled=excluded.ntfy_enabled,gotify_enabled=excluded.gotify_enabled,webhook_enabled=excluded.webhook_enabled,project_mode=excluded.project_mode,selected_project_ids_json=excluded.selected_project_ids_json,updated_at=excluded.updated_at`)
    .bind(actorUid(actor), workspaceId, data.isActive ? 1 : 0, data.emailEnabled ? 1 : 0, data.ntfyEnabled ? 1 : 0, data.gotifyEnabled ? 1 : 0, data.webhookEnabled ? 1 : 0, projectMode, JSON.stringify(selectedProjectIds), now()).run();
  return projectNotificationPreferencesResponse(db, actor);
}
export async function deleteProjectNotificationWorkspaceRule(db, data, actor) {
  const allowed = await requireWorkspace(db, data.workspaceId, actor, "workspace.read");
  if (allowed.error) return allowed;
  await db.prepare("DELETE FROM project_notification_workspace_rules WHERE owner_uid=? AND workspace_id=?").bind(actorUid(actor), safe(data.workspaceId, 180)).run();
  return projectNotificationPreferencesResponse(db, actor);
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
