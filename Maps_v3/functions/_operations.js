import { allowsPermissions } from "../../shared/admin-access.mjs";

const TASK_STATUSES = new Set(["inbox", "assigned", "in_progress", "blocked", "completed", "cancelled"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const SAFE_METADATA_KEYS = new Set(["mailbox", "recordType", "recordId", "sourceStatus", "kind", "href", "count"]);
const DEFAULT_POLICY = {
  public_publish: { required: true, selfApproval: false },
  form_publish: { required: true, selfApproval: false },
  link_publish: { required: true, selfApproval: false },
  destructive_moderation: { required: true, selfApproval: false },
  access_change: { required: true, selfApproval: false },
  external_message: { required: true, selfApproval: false },
  gmail_change: { required: true, selfApproval: false },
  mcp_change: { required: true, selfApproval: false },
  rollback: { required: true, selfApproval: false },
};

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
const text = (value, max = 500) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const parseJson = (value, fallback = {}) => {
  try { return typeof value === "string" ? JSON.parse(value) : (value ?? fallback); } catch { return fallback; }
};
const safeMetadata = (value = {}) => Object.fromEntries(Object.entries(value || {}).filter(([key]) => SAFE_METADATA_KEYS.has(key)).map(([key, val]) => [key, text(val, 220)]));
const actorFields = (actor = {}) => ({ uid: text(actor.uid, 180), email: text(actor.email, 240).toLowerCase() });
const isDbUnavailable = (error) => /no such table|no such column|D1_ERROR/i.test(String(error?.message || error));

async function bestEffort(fn) {
  try { return await fn(); } catch (error) { if (!isDbUnavailable(error)) console.error("Operations adapter failed", String(error?.message || error)); return null; }
}

function taskFromRow(row) {
  const metadata = parseJson(row.metadata_json, {});
  return {
    id: row.id,
    domain: row.domain,
    taskType: row.task_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceAction: row.source_action,
    title: row.title,
    summary: row.summary,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee_uid ? { uid: row.assignee_uid, email: row.assignee_email } : null,
    dueAt: row.due_at,
    requiredPermission: row.required_permission,
    metadata,
    createdBy: row.created_by_uid ? { uid: row.created_by_uid, email: row.created_by_email } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function canSeeTask(task, actor, access, scope = "all") {
  const own = task.assignee_uid && task.assignee_uid === actor.uid;
  if (scope === "mine" && !own) return false;
  if (own || access?.permissions?.includes("*") || allowsPermissions(access?.permissions || [], task.required_permission)) return true;
  return false;
}

async function insertDerivedTask(opsDb, task) {
  const timestamp = now();
  const assignee = task.assignee || {};
  await opsDb.prepare(`INSERT INTO operations_tasks
    (id,domain,task_type,source_type,source_id,source_action,title,summary,status,priority,assignee_uid,assignee_email,due_at,required_permission,dedupe_key,metadata_json,created_by_uid,created_by_email,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(dedupe_key) DO UPDATE SET
      title=excluded.title, summary=excluded.summary, source_action=excluded.source_action,
      required_permission=excluded.required_permission, metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at`).bind(
    task.id || id("task"), text(task.domain, 80), text(task.taskType, 120), text(task.sourceType, 120), text(task.sourceId, 180), text(task.sourceAction, 120),
    text(task.title, 240), text(task.summary, 800), TASK_STATUSES.has(task.status) ? task.status : "inbox", PRIORITIES.has(task.priority) ? task.priority : "normal",
    text(assignee.uid, 180), text(assignee.email, 240).toLowerCase(), task.dueAt || null, text(task.requiredPermission || "dashboard.view", 120), text(task.dedupeKey, 300),
    JSON.stringify(safeMetadata(task.metadata)), text(task.createdBy?.uid, 180), text(task.createdBy?.email, 240).toLowerCase(), timestamp, timestamp,
  ).run();
}

async function adaptQuery(opsDb, db, sql, bind, makeTask) {
  const result = await bestEffort(() => db.prepare(sql).bind(...bind).all());
  for (const row of result?.results || []) await bestEffort(() => insertDerivedTask(opsDb, makeTask(row)));
}

export async function reconcileOperationsTasks(opsDb, db, actor = {}) {
  if (!opsDb || !db) return { available: false, created: 0 };
  let created = 0;
  const make = (domain, taskType, sourceType, action, permission, title, summary, row, metadata = {}) => ({
    id: `derived_${sourceType}_${row.id}`,
    domain, taskType, sourceType, sourceId: String(row.id), sourceAction: action,
    title, summary: summary(row), requiredPermission: permission, dedupeKey: `${sourceType}:${row.id}:open`,
    metadata: { recordType: sourceType, recordId: String(row.id), ...metadata },
  });
  await adaptQuery(opsDb, db, "SELECT id,name,address,status FROM new_places WHERE lower(COALESCE(status,''))='pending' ORDER BY id DESC LIMIT 100", [], row => make("maps", "moderation.place_submission", "new_places", "pending-new", "moderation.places.read", "Review new place submission", r => `${r.name || "Unnamed place"}${r.address ? ` · ${r.address}` : ""}`, row));
  await adaptQuery(opsDb, db, "SELECT id,name,address,status FROM edits WHERE lower(COALESCE(status,''))='pending' ORDER BY id DESC LIMIT 100", [], row => make("maps", "moderation.place_edit", "edits", "pending-edits", "moderation.places.read", "Review place edit", r => `${r.name || "Place edit"}${r.address ? ` · ${r.address}` : ""}`, row));
  await adaptQuery(opsDb, db, "SELECT id,title,status FROM event_edits WHERE lower(COALESCE(status,''))='pending' ORDER BY id DESC LIMIT 100", [], row => make("maps", "moderation.event_edit", "event_edits", "pending-event-edits", "moderation.events.read", "Review event edit", r => r.title || "Pending event edit", row));
  await adaptQuery(opsDb, db, "SELECT id,name,status FROM eid_new WHERE lower(COALESCE(status,''))='pending' ORDER BY id DESC LIMIT 100", [], row => make("maps", "moderation.eid", "eid_new", "pending-eid", "maps.eid.read", "Review Eid submission", r => r.name || "Pending Eid submission", row));
  await adaptQuery(opsDb, db, "SELECT id,title,status FROM events WHERE lower(COALESCE(status,'')) IN ('pending','draft') ORDER BY id DESC LIMIT 100", [], row => make("maps", "maps.event", "events", "admin-events", "maps.events.read", "Review event", r => r.title || "Event", row));
  await adaptQuery(opsDb, db, "SELECT id,place_name,approved FROM wishes WHERE lower(COALESCE(approved,'')) NOT IN ('yes','true') ORDER BY id DESC LIMIT 100", [], row => make("maps", "moderation.wish", "wishes", "admin-wishes", "moderation.wishes.read", "Review community wish", r => r.place_name || "Community wish", row));
  await adaptQuery(opsDb, db, "SELECT id,place_name,status FROM reviews WHERE lower(COALESCE(status,''))='pending' ORDER BY id DESC LIMIT 100", [], row => make("maps", "moderation.review", "reviews", "admin-reviews", "moderation.reviews.read", "Review place review", r => r.place_name || "Pending review", row));
  await adaptQuery(opsDb, db, "SELECT id,name,replied FROM contacts WHERE lower(COALESCE(replied,'')) NOT IN ('yes','true') ORDER BY id DESC LIMIT 100", [], row => make("inbox", "moderation.contact", "contacts", "admin-contact", "moderation.contacts.read", "Review contact message", r => r.name || "Contact message", row));
  await adaptQuery(opsDb, db, "SELECT id,subject,mailbox,status FROM inbox_threads WHERE lower(COALESCE(status,'')) IN ('open','unread') ORDER BY updated_at DESC LIMIT 100", [], row => make("inbox", "inbox.thread", "inbox_threads", "inbox-list", "inbox.contact.read", "Review inbox conversation", r => r.subject || "Inbox conversation", row, { mailbox: row.mailbox || "" }));
  await adaptQuery(opsDb, db, "SELECT id,email,status FROM admin_access_requests WHERE lower(COALESCE(status,''))='pending' ORDER BY created_at DESC LIMIT 100", [], row => make("workspace", "workspace.access_request", "admin_access_requests", "access-members", "access.view", "Review workspace access request", r => r.email || "Access request", row));
  await adaptQuery(opsDb, db, "SELECT id,title,status,updated_at FROM forms WHERE lower(COALESCE(status,''))='draft' ORDER BY updated_at DESC LIMIT 100", [], row => make("forms", "forms.draft", "forms", "forms-get", "forms.read", "Review form draft", r => r.title || "Untitled form", row));
  await adaptQuery(opsDb, db, "SELECT id,form_id,submitted_at,status FROM form_submissions WHERE lower(COALESCE(status,'')) IN ('valid','pending') ORDER BY submitted_at DESC LIMIT 100", [], row => make("forms", "forms.submission", "form_submissions", "forms-submissions", "forms.read", "Review form submission", r => `Submission for form ${r.form_id}`, row));
  await adaptQuery(opsDb, db, "SELECT id,name,status,updated_at FROM website_people WHERE lower(COALESCE(status,''))='inactive' ORDER BY updated_at DESC LIMIT 100", [], row => make("website", "website.team_change", "website_people", "admin-team", "website.team.read", "Review website team change", r => r.name || "Website team member", row));
  await adaptQuery(opsDb, db, "SELECT id,revision,updated_at FROM website_content WHERE revision > 0 ORDER BY updated_at DESC LIMIT 20", [], row => make("website", "website.content_change", "website_content", "admin-content", "website.content.read", "Review website content", () => "Website content has a saved revision", row));
  await adaptQuery(opsDb, db, "SELECT id,title,metadata_status FROM link_hub_links WHERE lower(COALESCE(metadata_status,''))='error' ORDER BY updated_at DESC LIMIT 100", [], row => make("links", "links.metadata_issue", "link_hub_links", "admin-link-hub", "links.read", "Review link metadata issue", r => r.title || "Link metadata issue", row));
  await adaptQuery(opsDb, db, "SELECT id,action,target_id,actor_email FROM audit_log WHERE success=0 AND (lower(action) LIKE 'mcp.%' OR lower(action) LIKE 'gmail%') ORDER BY id DESC LIMIT 100", [], row => make("mcp", "integration.alert", "audit_log", "admin-log", "dashboard.view", "Review integration failure", r => `${r.action || "Integration action"}${r.actor_email ? ` · ${r.actor_email}` : ""}`, row));
  return { available: true, created };
}

function filtersToSql(filters = {}) {
  const where = [];
  const bind = [];
  if (filters.status && TASK_STATUSES.has(filters.status)) { where.push("status=?"); bind.push(filters.status); }
  if (filters.domain) { where.push("domain=?"); bind.push(text(filters.domain, 80)); }
  if (filters.priority && PRIORITIES.has(filters.priority)) { where.push("priority=?"); bind.push(filters.priority); }
  if (filters.assignee) { where.push("assignee_uid=?"); bind.push(text(filters.assignee, 180)); }
  if (filters.search) { where.push("(lower(title) LIKE ? OR lower(summary) LIKE ? OR lower(source_id) LIKE ?)"); const q = `%${text(filters.search, 100).toLowerCase()}%`; bind.push(q, q, q); }
  if (filters.overdue === "true" || filters.overdue === true) where.push("due_at IS NOT NULL AND due_at < datetime('now') AND status NOT IN ('completed','cancelled')");
  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", bind };
}

export async function listOperationsTasks(opsDb, db, actor, access, filters = {}) {
  await reconcileOperationsTasks(opsDb, db, actor);
  const { where, bind } = filtersToSql(filters);
  const result = await opsDb.prepare(`SELECT * FROM operations_tasks ${where} ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, updated_at DESC LIMIT 500`).bind(...bind).all();
  const scope = filters.scope === "mine" ? "mine" : "all";
  const tasks = (result.results || []).filter(row => canSeeTask(row, actor, access, scope)).map(taskFromRow);
  return { tasks, total: tasks.length, generatedAt: now() };
}

export async function getOperationsSummary(opsDb, db, actor, access) {
  const { tasks } = await listOperationsTasks(opsDb, db, actor, access, {});
  const mine = tasks.filter(task => task.assignee?.uid === actor.uid && !["completed", "cancelled"].includes(task.status));
  const overdue = tasks.filter(task => task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !["completed", "cancelled"].includes(task.status));
  const approvals = await bestEffort(() => opsDb.prepare("SELECT COUNT(*) AS count FROM operations_approvals WHERE status='pending' AND expires_at > datetime('now')").first());
  const domains = Object.entries(tasks.reduce((acc, task) => { acc[task.domain] = (acc[task.domain] || 0) + 1; return acc; }, {})).map(([domain, count]) => ({ domain, count }));
  return { mine: mine.length, attention: tasks.filter(task => ["urgent", "high", "blocked"].includes(task.priority) || task.status === "blocked").length, overdue: overdue.length, awaitingApproval: Number(approvals?.count || 0), total: tasks.length, domains, generatedAt: now() };
}

export async function getOperationsTask(opsDb, idValue, actor, access) {
  const row = await opsDb.prepare("SELECT * FROM operations_tasks WHERE id=?").bind(text(idValue, 220)).first();
  if (!row || !canSeeTask(row, actor, access)) return null;
  return taskFromRow(row);
}

async function event(opsDb, taskId, type, fromValue, toValue, note, actor) {
  const who = actorFields(actor);
  await opsDb.prepare("INSERT INTO operations_task_events (id,task_id,event_type,from_value,to_value,note,actor_uid,actor_email,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id("event"), taskId, type, text(fromValue, 120), text(toValue, 120), text(note, 500), who.uid, who.email, now()).run();
}

export async function createOperationsTask(opsDb, data, actor) {
  const who = actorFields(actor);
  const title = text(data.title, 240);
  if (!title) return { error: "A task title is required." };
  const timestamp = now();
  const taskId = id("task");
  const dedupeKey = text(data.dedupeKey || `${taskId}:manual`, 300);
  await opsDb.prepare(`INSERT INTO operations_tasks (id,domain,task_type,source_type,source_id,source_action,title,summary,status,priority,assignee_uid,assignee_email,due_at,required_permission,dedupe_key,metadata_json,created_by_uid,created_by_email,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    taskId, text(data.domain || "workspace", 80), text(data.taskType || "manual", 120), text(data.sourceType, 120), text(data.sourceId, 180), text(data.sourceAction, 120), title, text(data.summary, 800), "assigned", PRIORITIES.has(data.priority) ? data.priority : "normal", text(data.assigneeUid, 180), text(data.assigneeEmail, 240).toLowerCase(), data.dueAt || null, text(data.requiredPermission || "operations.tasks.read", 120), dedupeKey, JSON.stringify(safeMetadata(data.metadata)), who.uid, who.email, timestamp, timestamp,
  ).run();
  await event(opsDb, taskId, "created", "", "assigned", "", actor);
  return { success: true, task: await getOperationsTask(opsDb, taskId, actor, { permissions: ["*"] }) };
}

export async function updateOperationsTask(opsDb, data, actor, access) {
  const taskId = text(data.id, 220);
  const current = await opsDb.prepare("SELECT * FROM operations_tasks WHERE id=?").bind(taskId).first();
  if (!current || !canSeeTask(current, actor, access)) return { error: "Task not found or not accessible." };
  const changes = [];
  const status = data.status && TASK_STATUSES.has(data.status) ? data.status : current.status;
  const priority = data.priority && PRIORITIES.has(data.priority) ? data.priority : current.priority;
  const assigneeUid = data.assigneeUid !== undefined ? text(data.assigneeUid, 180) : current.assignee_uid;
  const assigneeEmail = data.assigneeEmail !== undefined ? text(data.assigneeEmail, 240).toLowerCase() : current.assignee_email;
  const dueAt = data.dueAt !== undefined ? (data.dueAt ? text(data.dueAt, 80) : null) : current.due_at;
  const completedAt = status === "completed" ? (current.completed_at || now()) : null;
  if (status !== current.status) changes.push(["status", current.status, status]);
  if (priority !== current.priority) changes.push(["priority", current.priority, priority]);
  if (assigneeUid !== current.assignee_uid || assigneeEmail !== current.assignee_email) changes.push(["assignment", current.assignee_uid, assigneeUid]);
  if (dueAt !== current.due_at) changes.push(["due_date", current.due_at || "", dueAt || ""]);
  await opsDb.prepare("UPDATE operations_tasks SET status=?,priority=?,assignee_uid=?,assignee_email=?,due_at=?,completed_at=?,updated_at=? WHERE id=?").bind(status, priority, assigneeUid, assigneeEmail, dueAt, completedAt, now(), taskId).run();
  for (const [type, fromValue, toValue] of changes) await event(opsDb, taskId, type, fromValue, toValue, data.note, actor);
  return { success: true, task: await getOperationsTask(opsDb, taskId, actor, { permissions: ["*"] }) };
}

export async function bulkUpdateOperationsTasks(opsDb, data, actor, access) {
  const requestId = text(data.requestId, 220);
  if (!requestId) return { error: "An idempotency requestId is required." };
  const previous = await opsDb.prepare("SELECT result_json FROM operations_idempotency WHERE request_id=? AND actor_uid=?").bind(requestId, actor.uid).first();
  if (previous) return parseJson(previous.result_json, { success: false });
  const taskIds = Array.isArray(data.taskIds) ? [...new Set(data.taskIds.map(value => text(value, 220)).filter(Boolean))].slice(0, 100) : [];
  const results = [];
  for (const taskId of taskIds) {
    const result = await updateOperationsTask(opsDb, { id: taskId, ...data.changes }, actor, access);
    results.push({ taskId, success: !!result.success, error: result.error || null });
  }
  const output = { success: results.every(item => item.success), results, succeeded: results.filter(item => item.success).length, failed: results.filter(item => !item.success).length };
  await opsDb.prepare("INSERT INTO operations_idempotency (request_id,actor_uid,action,result_json,created_at) VALUES (?,?,?,?,?)").bind(requestId, actor.uid, text(data.action || "bulk_update", 120), JSON.stringify(output), now()).run();
  return output;
}

async function policy(opsDb) {
  const row = await bestEffort(() => opsDb.prepare("SELECT approval_policy_json FROM operations_workspace_settings WHERE id=1").first());
  return { ...DEFAULT_POLICY, ...parseJson(row?.approval_policy_json, {}) };
}

async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function listOperationsApprovals(opsDb, actor, access) {
  const rows = await opsDb.prepare("SELECT * FROM operations_approvals ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 300").all();
  return { approvals: (rows.results || []).filter(row => access?.permissions?.includes("*") || row.requested_by_uid === actor.uid || allowsPermissions(access?.permissions || [], "operations.approvals.read")).map(row => ({ ...row, payloadHash: row.payload_hash, sourceRevision: row.source_revision, requestedBy: { uid: row.requested_by_uid, email: row.requested_by_email }, resolvedBy: row.resolved_by_uid ? { uid: row.resolved_by_uid, email: row.resolved_by_email } : null })) };
}

export async function createOperationsApproval(opsDb, data, actor) {
  const expiresAt = data.expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const payloadHash = await digest(data.payload || {});
  const approvalId = id("approval");
  await opsDb.prepare("INSERT INTO operations_approvals (id,task_id,action,target_type,target_id,payload_hash,source_revision,status,requested_by_uid,requested_by_email,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(approvalId, text(data.taskId, 220), text(data.action, 180), text(data.targetType, 120), text(data.targetId, 180), payloadHash, text(data.sourceRevision, 180), "pending", actor.uid, actor.email, expiresAt, now()).run();
  return { success: true, approvalId, payloadHash, expiresAt };
}

export async function resolveOperationsApproval(opsDb, data, actor, access) {
  const row = await opsDb.prepare("SELECT * FROM operations_approvals WHERE id=?").bind(text(data.id, 220)).first();
  if (!row || row.status !== "pending") return { error: "Approval is not pending." };
  if (new Date(row.expires_at).getTime() <= Date.now()) { await opsDb.prepare("UPDATE operations_approvals SET status='expired',resolved_at=? WHERE id=?").bind(now(), row.id).run(); return { error: "Approval expired." }; }
  if (!access?.permissions?.includes("*") && !allowsPermissions(access?.permissions || [], "operations.approvals.resolve")) return { error: "You cannot resolve approvals." };
  const configured = await policy(opsDb);
  const category = text(data.category || "destructive_moderation", 80);
  if (data.decision === "approved" && row.requested_by_uid === actor.uid && configured[category]?.selfApproval === false) return { error: "Self-approval is disabled for this action." };
  const status = data.decision === "approved" ? "approved" : data.decision === "rejected" ? "rejected" : "cancelled";
  await opsDb.prepare("UPDATE operations_approvals SET status=?,resolved_by_uid=?,resolved_by_email=?,reason=?,resolved_at=? WHERE id=?").bind(status, actor.uid, actor.email, text(data.reason, 500), now(), row.id).run();
  return { success: true, approvalId: row.id, status };
}

function redactSnapshot(value, key = "") {
  const sensitive = /^(body|html|text|message|answers|credentials?|token|password|secret|access_token|refresh_token)$/i.test(key);
  if (sensitive) return "[redacted]";
  if (Array.isArray(value)) return value.slice(0, 200).map(item => redactSnapshot(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 200).map(([childKey, childValue]) => [childKey, redactSnapshot(childValue, childKey)]));
  return typeof value === "string" ? value.slice(0, 20000) : value;
}

export async function recordOperationsRevision(opsDb, data, actor) {
  const current = await opsDb.prepare("SELECT MAX(revision_number) AS revision FROM operations_revisions WHERE domain=? AND record_type=? AND record_id=?").bind(text(data.domain, 80), text(data.recordType, 120), text(data.recordId, 180)).first();
  const revisionNumber = Number(current?.revision || 0) + 1;
  await opsDb.prepare("INSERT INTO operations_revisions (id,domain,record_type,record_id,revision_number,state,snapshot_json,change_summary,source_action,actor_uid,actor_email,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id("revision"), text(data.domain, 80), text(data.recordType, 120), text(data.recordId, 180), revisionNumber, data.state === "published" ? "published" : "draft", JSON.stringify(redactSnapshot(data.snapshot)), text(data.changeSummary, 500), text(data.sourceAction, 180), actor.uid, actor.email, now()).run();
  return { success: true, revisionNumber };
}

export async function listOperationsHistory(opsDb, data) {
  const rows = await opsDb.prepare("SELECT * FROM operations_revisions WHERE domain=? AND record_type=? AND record_id=? ORDER BY revision_number DESC LIMIT 100").bind(text(data.domain, 80), text(data.recordType, 120), text(data.recordId, 180)).all();
  return { revisions: (rows.results || []).map(row => ({ id: row.id, revisionNumber: row.revision_number, state: row.state, snapshot: parseJson(row.snapshot_json, {}), changeSummary: row.change_summary, sourceAction: row.source_action, actor: { uid: row.actor_uid, email: row.actor_email }, createdAt: row.created_at })) };
}

export async function diffOperationsHistory(opsDb, data) {
  const result = await listOperationsHistory(opsDb, data);
  const from = result.revisions.find(item => String(item.revisionNumber) === String(data.fromRevision))?.snapshot || {};
  const to = result.revisions.find(item => String(item.revisionNumber) === String(data.toRevision))?.snapshot || {};
  const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort();
  return { fromRevision: data.fromRevision, toRevision: data.toRevision, changes: keys.filter(key => JSON.stringify(from[key]) !== JSON.stringify(to[key])).map(key => ({ key, from: from[key] ?? null, to: to[key] ?? null })) };
}

export async function rollbackOperationsHistory(opsDb, data, actor) {
  const result = await listOperationsHistory(opsDb, data);
  const selected = result.revisions.find(item => String(item.revisionNumber) === String(data.revision));
  if (!selected) return { error: "Revision not found." };
  const created = await recordOperationsRevision(opsDb, { ...data, snapshot: selected.snapshot, state: "draft", changeSummary: `Restored revision ${selected.revisionNumber}`, sourceAction: "workspace.history.rollback" }, actor);
  return { success: true, ...created, snapshot: selected.snapshot };
}

export async function getOperationsSettings(opsDb) {
  const row = await opsDb.prepare("SELECT * FROM operations_workspace_settings WHERE id=1").first();
  return { approvalPolicy: { ...DEFAULT_POLICY, ...parseJson(row?.approval_policy_json, {}) }, draftRetentionDays: Number(row?.draft_retention_days || 180) };
}

export async function saveOperationsSettings(opsDb, data, actor) {
  const current = await getOperationsSettings(opsDb);
  const settings = { ...current.approvalPolicy, ...(data.approvalPolicy || {}) };
  const retention = Math.min(3650, Math.max(30, Number(data.draftRetentionDays || current.draftRetentionDays)));
  await opsDb.prepare("UPDATE operations_workspace_settings SET approval_policy_json=?,draft_retention_days=?,updated_by_uid=?,updated_at=? WHERE id=1").bind(JSON.stringify(settings), retention, actor.uid, now()).run();
  return { success: true, approvalPolicy: settings, draftRetentionDays: retention };
}
