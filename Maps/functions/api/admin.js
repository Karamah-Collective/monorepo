/**
 * Cloudflare Pages Function – /api/admin
 *
 * D1-backed admin API consumed by the React admin dashboard in /admin
 * (deployed as its own Cloudflare Pages project on a different domain —
 * see docs for the current architecture). Every action's request/response
 * shape traces back to Code.gs's original admin contract (see
 * docs/D1_MIGRATION_PLAN.md), though auth has since moved off the original
 * shared-secret `adminKey` scheme.
 *
 * `rowId` fields are D1 integer primary keys, stringified — an improvement
 * over Code.gs's `makeRowId(timestamp, name)` hash (collision-prone), but
 * still just an opaque round-trip token from the dashboard's point of view.
 *
 * Auth: every request must carry `Authorization: Bearer <Firebase ID token>`
 * for an account whose email ends in `@karamahcollective.com`; password identities must have a
 * verified email (see `authenticateAdmin` below — the emailVerified check
 * matters because anyone can self-register any email string at signup;
 * only Firebase's verification-link flow actually proves mailbox
 * ownership). CORS is restricted to `ADMIN_ALLOWED_ORIGINS`, since the
 * dashboard runs cross-origin from this endpoint's own domain.
 *
 * Every successful write action is recorded in `audit_log` (see
 * `logAdminAction`) — viewable by any authenticated colleague via the
 * `admin-log` action. This intentionally stores the actor's real
 * email/name in plaintext: that's the whole point of an internal audit
 * trail and is a deliberate, scoped exception to this schema's usual
 * emailHash-only rule (which protects *public map visitors'* privacy, not
 * co-workers' identities from each other in a trusted internal tool).
 *
 * Required Cloudflare Pages Environment Variables:
 *   DB – D1 database binding
 * (FIREBASE_PROJECT_ID is optional — only needed if the admin dashboard
 * ever authenticates against a different Firebase project than the public
 * site's `halal-map-karamah`.)
 */
import { json, helsinkiTimestamp, truncate } from "../_shared.js";
import { verifyFirebaseIdToken } from "../_firebase-verify.js";
import { normaliseAddress, parseTagString, isSponsorActiveForDate, extractCityFromAddress, generateId } from "../_gas-compat.js";
import { upsertPlaceAppLinks } from "../_app-links.js";
import {
  deleteSocialVideo,
  listAllSocialVideos,
  upsertSocialVideo,
} from "../_place-videos.js";
import { enrichFromMapsLink, forwardGeocode } from "../_google-maps.js";
import { readAdminAppSettings, saveAppSettings } from "../_app-settings.js";
import { getAnalyticsDashboard } from "../_analytics.js";
import { getSystemHealth } from "../_uptimerobot.js";
import { addInboxNote, assignInboxThread, bulkUpdateInbox, canInboxMailbox, composeInbox, configuredInboxMailboxes, getInboxThread, hasInboxPermission, listInbox, listInboxAssignees, replyInbox, setInboxSnooze, setInboxStar, setInboxStatus } from "../_inbox.js";
import { CONTACT_MAILBOX, disconnectGmail, disconnectPersonalGmail, gmailStatus, personalGmailStatus, startGmailOAuth, startPersonalGmailOAuth, MANARAH_MAILBOX } from "../_gmail.js";
import { syncGmailFull, syncGmailHistory } from "../_gmail-sync.js";
import { deleteLinkHubLink, getAdminLinkHub, saveLinkHubLink, saveLinkHubSettings } from "../_link-hub.js";
import {
  createForm, deleteForm, deleteSubmission, duplicateForm, exportResponses,
  formAnalytics, getForm, getVersion, listForms, listSubmissions, publishForm,
  saveForm, setFormStatus,
} from "../_forms-admin.js";
import {
  DEFAULT_ROLE_ID,
  ROLE_PERMISSIONS,
  actionDescriptor,
  allowsPermissions,
  parsePermissions,
  validatePermissionName,
} from "../../../shared/admin-access.mjs";
import {
  bulkUpdateOperationsTasks,
  createOperationsApproval,
  createOperationsTask,
  diffOperationsHistory,
  getOperationsSettings,
  getOperationsSummary,
  getOperationsTask,
  listOperationsApprovals,
  listOperationsHistory,
  listOperationsTasks,
  recordOperationsRevision,
  resolveOperationsApproval,
  rollbackOperationsHistory,
  saveOperationsSettings,
  updateOperationsTask,
} from "../_operations.js";
import {
  addProjectTaskComment,
  listProjectTaskComments,
  updateProjectTaskComment,
  deleteProjectTaskComment,
  bulkUpdateProjectTasks,
  createProject,
  createProjectMilestone,
  updateProjectMilestone,
  deleteProjectMilestone,
  createProjectTask,
  deleteProjectTask,
  getProjectTask,
  getProjectTaskByTicket,
  getProjectWorkspace,
  listProjectActivity,
  listProjectColumns,
  listProjectLabels,
  listProjectMembers,
  removeProjectMember,
  listProjectMilestones,
  listProjectRelations,
  listProjectTasks,
  projectSummary,
  listProjectSavedViews,
  saveProjectSavedView,
  deleteProjectSavedView,
  duplicateProjectTask,
  listProjectTimeEntries,
  saveProjectTimeEntry,
  listProjectAttachments,
  getProjectAttachment,
  createProjectAttachment,
  deleteProjectAttachment,
  listProjectCustomFields,
  listProjectCustomFieldValues,
  listProjectCustomFieldFilterValues,
  saveProjectCustomField,
  deleteProjectCustomField,
  saveProjectTaskCustomValue,
  listProjectNotifications,
  markProjectNotificationsRead,
  getProjectNotificationPreferences,
  updateProjectNotificationPreferences,
  upsertProjectNotificationWorkspaceRule,
  deleteProjectNotificationWorkspaceRule,
  listProjectTaskWatchers,
  updateProjectTaskWatcher,
  listProjects,
  searchProjectWorkspace,
  updateProject,
  updateProjectTask,
  updateProjectColumn,
  deleteProjectColumn,
  updateProjectMember,
  attachProjectLabel,
  createProjectColumn,
  createProjectRelation,
  deleteProjectRelation,
  listProjectTaskLinks,
  saveProjectTaskLink,
  deleteProjectTaskLink,
  saveProjectLabel,
  detachProjectLabel,
  deleteProjectLabel,
  listProjectTaskTemplates,
  saveProjectTaskTemplate,
  deleteProjectTaskTemplate,
  createProjectTaskFromTemplate,
  listProjectWebhooks,
  saveProjectWebhook,
  deleteProjectWebhook,
  listProjectWorkspaces,
  getProjectWorkspaceAccount,
  listProjectWorkspaceMembers,
  listProjectMemberDirectory,
  listProjectWorkspaceRoles,
  getProjectWorkspaceCapabilities,
  checkProjectWorkspacePermission,
  createProjectWorkspace,
  updateProjectWorkspace,
  deleteProjectWorkspace,
  updateProjectWorkspaceMember,
  getProjectInvitation,
  listProjectWorkspaceInvitations,
  acceptProjectInvitation,
  cancelProjectInvitation,
  removeProjectWorkspaceMember,
  createProjectWorkspaceRole,
  updateProjectWorkspaceRole,
  deleteProjectWorkspaceRole,
} from "../_projects.js";
import { enqueueGoogleTaskSync, googleTasksStatus, startGoogleTasksOAuth, syncGoogleTasksForOwner } from "../_google-workspace.js";
import { publishProjectRealtime } from "../_project-realtime.js";

const ADMIN_ALLOWED_ORIGINS = [
  "https://admin.karamahcollective.com",
  "https://admin.maps.karamahcollective.com",
  "https://projects.karamahcollective.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5184",
  "http://127.0.0.1:5184",
];
function adminAllowedOrigin(request, env = {}) {
  const origin = request.headers.get("Origin") || "";
  const allowed = [...ADMIN_ALLOWED_ORIGINS, ...(env.ADMIN_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(value => /^https:\/\/[^/]+$/.test(value))];
  return allowed.includes(origin) ? origin : ADMIN_ALLOWED_ORIGINS[0];
}

const ADMIN_EMAIL_DOMAIN = "@karamahcollective.com"; // leading "@" is load-bearing — endsWith("karamahcollective.com") without it would let "user@evilkaramahcollective.com" through
const INITIAL_ADMIN_EMAIL = "moontasir@karamahcollective.com";
const MAX_MODERATION_REASON_LEN = 300;
const REVIEW_STATUSES = new Set(["yes", "no", "pending"]);
const IMAGE_STATUSES = new Set(["yes", "no"]);
const REVIEW_IMAGE_ID_RE = /^[0-9a-f-]{36}$/i;
function requiresEmailVerification(identity) {
  return !identity?.signInProvider || identity.signInProvider === "password";
}

async function authenticateAdmin(request, env) {
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  if (!match) return { ok: false, status: 401, error: "Missing bearer token" };

  const verified = await verifyFirebaseIdToken(match[1], env);
  if (!verified || !verified.email) return { ok: false, status: 401, error: "Invalid or expired token" };
  if (requiresEmailVerification(verified) && !verified.emailVerified) return { ok: false, status: 403, error: "Email not verified" };
  if (!String(verified.email).toLowerCase().endsWith(ADMIN_EMAIL_DOMAIN)) return { ok: false, status: 403, error: "Not authorized for Projects access" };

  return { ok: true, actor: { uid: verified.uid, email: verified.email.toLowerCase(), name: verified.name || "" } };
}
async function authenticateProjectsActor(request, env) {
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  if (!match) return { ok: false, status: 401, error: "Missing bearer token" };
  const verified = await verifyFirebaseIdToken(match[1], env);
  if (!verified || !verified.email) return { ok: false, status: 401, error: "Invalid or expired token" };
  if (requiresEmailVerification(verified) && !verified.emailVerified) return { ok: false, status: 403, error: "Verify your email address before using Projects." };
  const email = String(verified.email).toLowerCase();
  const isKaramah = email.endsWith(ADMIN_EMAIL_DOMAIN) || email.endsWith("@karamah.local");
  if (!isKaramah && verified.signInProvider !== "password") {
    return { ok: false, status: 403, error: "External collaborators must use the invitation email and password login." };
  }
  return { ok: true, actor: { uid: verified.uid, email, name: verified.name || "" } };
}

function effectiveRolePermissions(roleId, raw, fallback=[]) {
  const permissions = parsePermissions(raw, fallback);
  if (roleId !== "contact-agent") return permissions;
  return [...new Set([...permissions, "inbox.contact.read", "inbox.contact.write", "inbox.manarah.read", "inbox.manarah.write"])]
}
function firstName(value, email="") { const source=String(value||"").trim()||String(email||"").split("@")[0].replace(/[._-]+/g," "); const name=source.split(/\s+/)[0]||""; return name ? name[0].toUpperCase()+name.slice(1,40) : ""; }
async function ensureDefaultRole(db, preferredRoleId = DEFAULT_ROLE_ID) {
  await db.prepare(`INSERT OR IGNORE INTO admin_roles (id,name,description,permissions,is_preset)
    VALUES ('viewer','Viewer','View the workspace without making changes.','["dashboard.view","activity.view"]',1)`).run();
  const preferred = String(preferredRoleId || DEFAULT_ROLE_ID);
  let role = await db.prepare("SELECT id,name,permissions FROM admin_roles WHERE id=?").bind(preferred).first();
  if (!role && preferred !== DEFAULT_ROLE_ID) role = await db.prepare("SELECT id,name,permissions FROM admin_roles WHERE id=?").bind(DEFAULT_ROLE_ID).first();
  const roleId = role?.id || DEFAULT_ROLE_ID;
  await db.prepare("INSERT INTO admin_role_settings (id,default_role_id) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET default_role_id=excluded.default_role_id").bind(roleId).run();
  return role || { id: DEFAULT_ROLE_ID, name: "Viewer", permissions: JSON.stringify(ROLE_PERMISSIONS.viewer) };
}
export async function resolveAccess(db, actor) {
  const row=await db.prepare("SELECT m.role_id, m.display_name, r.name, r.permissions FROM admin_role_members m LEFT JOIN admin_roles r ON r.id=m.role_id WHERE lower(m.email)=lower(?)").bind(actor.email).first();
  if (row?.name) return { roleId:row.role_id, roleName:row.name, permissions:effectiveRolePermissions(row.role_id, row.permissions, ROLE_PERMISSIONS[row.role_id]||[]), displayName:firstName(row.display_name,actor.email) };
  if (actor.email === INITIAL_ADMIN_EMAIL) return { roleId:"administrator", roleName:"Administrator", permissions:["*"], displayName:firstName(actor.name,actor.email) };
  const setting=await db.prepare("SELECT default_role_id FROM admin_role_settings WHERE id=1").first();
  const role=await ensureDefaultRole(db, setting?.default_role_id);
  const roleId=role.id;
  const displayName=firstName(actor.name,actor.email);
  if (row) await db.prepare("UPDATE admin_role_members SET role_id=?,display_name=COALESCE(NULLIF(display_name,''),?),added_by='automatic default role repair',updated_at=datetime('now') WHERE lower(email)=lower(?)").bind(roleId,displayName,actor.email).run();
  else await db.prepare("INSERT INTO admin_role_members (email,role_id,display_name,added_by,updated_at) VALUES (?,?,?, 'automatic default role',datetime('now'))").bind(actor.email,roleId,displayName).run();
  return { roleId, roleName:role.name, permissions:parsePermissions(role.permissions,ROLE_PERMISSIONS[roleId]||[]), displayName };
}
function allows(access, permission) { return allowsPermissions(access?.permissions || [], permission); }
function permissionForAction(action) {
  const descriptor = actionDescriptor(action, "maps") || actionDescriptor(action);
  if (descriptor?.permissions?.length) return descriptor.permissions;
  if (action === "save-my-profile") return "dashboard.view";
  if (["access-roles","access-members"].includes(action)) return "access.view";
  if (action === "request-access") return "access.request";
  if (["access-settings","save-access-role","save-access-member","delete-access-member","save-access-settings"].includes(action)) return "*";
  if (["admin-stats", "admin-access"].includes(action)) return "dashboard.view";
  if (action === "gmail-status") return "dashboard.view";
  if (action === "contact-gmail-status") return "inbox.contact.read";
  if (["gmail-oauth-start", "gmail-disconnect"].includes(action)) return "*";
  if (action === "system-health") return "dashboard.view";
  if (action === "analytics-dashboard") return "analytics.read";
  if (action === "admin-log") return "activity.read";
  if (action.includes("weekly-report")) return action.startsWith("save-") || action.startsWith("delete-") || action.startsWith("unsubscribe-") ? "reports.write" : "reports.read";
  if (action.startsWith("forms-")) return action === "forms-list" || action === "forms-get" ? "forms.read" : "forms.write";
  if (action.includes("link-hub")) return action.startsWith("admin-") ? "links.read" : "links.write";
  if (["admin-contact","update-contact-replied"].includes(action)) return action === "admin-contact" ? "moderation.contacts.read" : "moderation.contacts.write";
  if (["admin-wishes","update-wish-approved","update-wish-implemented"].includes(action)) return action === "admin-wishes" ? "moderation.wishes.read" : "moderation.wishes.write";
  if (["pending-new","pending-edits","approve-new","reject-new","approve-edit","reject-edit"].includes(action)) return action.startsWith("pending-") ? "moderation.places.read" : "moderation.places.write";
  if (["pending-event-edits","approve-event-edit","reject-event-edit"].includes(action)) return action === "pending-event-edits" ? "moderation.events.read" : "moderation.events.write";
  if (["admin-reviews","approve-review","reject-review","set-review-status","set-review-image-status","delete-review","ban-reviewer","unban-reviewer","admin-review-image"].includes(action)) return action.startsWith("admin-") ? "moderation.reviews.read" : "moderation.reviews.write";
  if (action.includes("social-video")) return action.startsWith("admin-") ? "maps.social.read" : "maps.social.write";
  if (action.includes("type-style")) return action.startsWith("admin-") ? "maps.styles.read" : "maps.styles.write";
  if (action.includes("eid")) return action.startsWith("admin-") || action.startsWith("pending-") ? "maps.eid.read" : "maps.eid.write";
  if (action.includes("event")) return action.startsWith("admin-") || action.startsWith("pending-") ? "maps.events.read" : "maps.events.write";
  if (action.includes("app-settings")) return action.startsWith("admin-") ? "maps.settings.read" : "maps.settings.write";
  return action === "admin-places" ? "maps.places.read" : "maps.places.write";
}
const INBOX_WRITE_ACTIONS = ["inbox-reply", "inbox-compose", "inbox-status", "inbox-note", "inbox-star", "inbox-snooze", "inbox-assign", "inbox-bulk"];
function inboxActionAllowed(access, action) {
  const write = INBOX_WRITE_ACTIONS.includes(action);
  return hasInboxPermission(access, write ? "write" : "read");
}
function adminDb(env) {
  const db = env.ADMIN_DB;
  if (!db) throw new Error("Admin database is not configured");
  return db;
}
function projectsDb(env) {
  const db = env.PROJECTS_DB;
  if (!db) throw new Error("Projects database is not configured");
  return db;
}
function operationsDb(env) {
  return adminDb(env);
}
function parseOperationsJson(value, fallback = {}) { try { return typeof value === "string" ? JSON.parse(value) : (value ?? fallback); } catch { return fallback; } }
async function recordRevisionBestEffort(env, data, actor) {
  try { return await recordOperationsRevision(operationsDb(env), data, actor); } catch (error) { console.error("Operations revision record failed", String(error?.message || error)); return null; }
}
async function personalMailboxFor(db, env, actor) {
  const status = await personalGmailStatus(db, env, actor);
  if (status.connected && status.accountEmail) return status.accountEmail;
  const candidate = String(actor?.email || "").trim().toLowerCase();
  if (!candidate) return "";
  try {
    const row = await db.prepare("SELECT t.mailbox FROM inbox_threads t WHERE lower(t.mailbox)=? AND NOT EXISTS (SELECT 1 FROM inbox_messages m WHERE m.thread_id=t.id AND COALESCE(m.provider_message_id,'')<>'') LIMIT 1").bind(candidate).first();
    return row?.mailbox ? candidate : "";
  } catch {
    return "";
  }
}
async function authenticateAuthorized(request, env, action, data = {}) {
  const projectAction = PROJECT_DATABASE_ACTIONS.has(action);
  const auth=await (projectAction ? authenticateProjectsActor(request, env) : authenticateAdmin(request, env)); if (!auth.ok) return auth;
  const access = projectAction
    ? { roleId: "projects-user", roleName: "Projects User", permissions: [], displayName: firstName(auth.actor.name, auth.actor.email) }
    : await resolveAccess(adminDb(env), auth.actor);
  if (action.startsWith("mcp-")) return access && allows(access, "dashboard.view") ? { ...auth, actor:{...auth.actor,name:auth.actor.name || access.displayName || auth.actor.email}, access } : { ok:false,status:403,error:"Your role does not allow MCP management." };
  const personal = projectAction ? null : await personalMailboxFor(adminDb(env), env, auth.actor);
  const sharedMailbox = String(data.mailbox || "").toLowerCase() === CONTACT_MAILBOX ? CONTACT_MAILBOX : MANARAH_MAILBOX;
  const personalAction = ["personal-gmail-status", "personal-gmail-oauth-start", "personal-gmail-disconnect", "personal-gmail-sync"].includes(action);
  const sharedGmailManagement = ["gmail-oauth-start", "gmail-disconnect"].includes(action);
  const allowed = projectAction ? true
    : personalAction ? true
    : action === "inbox-list" ? true
    : action === "contact-gmail-status" ? canInboxMailbox(access, CONTACT_MAILBOX, "read", personal)
    : sharedGmailManagement ? action === "gmail-disconnect" ? auth.actor.email === INITIAL_ADMIN_EMAIL : sharedMailbox === CONTACT_MAILBOX ? canInboxMailbox(access, CONTACT_MAILBOX, "write", personal) : auth.actor.email === INITIAL_ADMIN_EMAIL
    : action === "gmail-sync" ? canInboxMailbox(access, sharedMailbox, "read", personal)
    : action.startsWith("inbox-") ? hasInboxPermission(access, INBOX_WRITE_ACTIONS.includes(action) ? "write" : "read", personal)
    : allows(access,permissionForAction(action));
  return access && allowed ? { ...auth, actor:{...auth.actor,name:auth.actor.name || access.displayName || auth.actor.email}, access } : { ok:false,status:403,error:"Your role does not allow this action." };
}
async function authenticateWorkspaceMember(request, env) {
  const auth=await authenticateAdmin(request, env); if (!auth.ok) return auth;
  const access=await resolveAccess(adminDb(env), auth.actor);
  return access ? { ...auth, actor:{...auth.actor,name:access.displayName||auth.actor.name}, access } : { ok:false,status:403,error:"Your account does not have a workspace role." };
}
async function getAccess(db, actor) { return { access:(await resolveAccess(db,actor))||{roleId:"",roleName:"No role",permissions:[]} }; }
async function getInboxTyping(db, url, actor, env, access) {
  const threadId = String(url.searchParams.get("threadId") || "").trim().slice(0, 180);
  if (!threadId) return { participants: [] };
  const thread = await db.prepare("SELECT mailbox FROM inbox_threads WHERE id=?").bind(threadId).first();
  const personal = await personalMailboxFor(db, env, actor);
  if (!thread || !canInboxMailbox(access, thread.mailbox, "read", personal)) return { participants: [] };
  const cutoff = Date.now() - 4500;
  await db.prepare("DELETE FROM inbox_typing_presence WHERE updated_at < ?").bind(cutoff).run();
  const { results } = await db.prepare("SELECT admin_email,admin_name,updated_at FROM inbox_typing_presence WHERE thread_id=? AND lower(admin_email)<>lower(?) AND updated_at>=? ORDER BY updated_at DESC").bind(threadId, actor.email, cutoff).all();
  return { participants: results.map(row => ({ email: row.admin_email, name: row.admin_name, updatedAt: row.updated_at })) };
}
async function setInboxTyping(db, data, actor, env, access) {
  const threadId = String(data.threadId || "").trim().slice(0, 180);
  if (!threadId) return { error: "A conversation is required." };
  const thread = await db.prepare("SELECT mailbox FROM inbox_threads WHERE id=?").bind(threadId).first();
  const personal = await personalMailboxFor(db, env, actor);
  if (!thread || !canInboxMailbox(access, thread.mailbox, "read", personal)) return { error: "Conversation not found." };
  if (data.active) {
    const name = String(data.name || actor.name || actor.email).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120) || actor.email;
    await db.prepare("INSERT INTO inbox_typing_presence (thread_id,admin_email,admin_name,updated_at) VALUES (?,?,?,?) ON CONFLICT(thread_id,admin_email) DO UPDATE SET admin_name=excluded.admin_name,updated_at=excluded.updated_at").bind(threadId, actor.email, name, Date.now()).run();
  } else {
    await db.prepare("DELETE FROM inbox_typing_presence WHERE thread_id=? AND lower(admin_email)=lower(?)").bind(threadId, actor.email).run();
  }
  return { success: true };
}
async function listInboxWithGmail(db, url, actor, env, access, context) {
  const folder = url.searchParams.get("folder") || "all";
  const selectedMailbox = url.searchParams.get("mailbox") || "";
  const personalMailbox = await personalMailboxFor(db, env, actor);
  const configured = await configuredInboxMailboxes(db, env, actor);
  const connected = [];
  const automaticSyncTasks = [];
  for (const mailbox of [MANARAH_MAILBOX, CONTACT_MAILBOX]) {
    if (configured.includes(mailbox) && canInboxMailbox(access, mailbox, "read", personalMailbox)) {
      const status = await gmailStatus(db, env, mailbox);
      if (status.connected) {
        connected.push(mailbox);
        automaticSyncTasks.push(() => syncGmailHistory(db, env, { mailbox, skipWatch: true }));
      }
    }
  }
  if (personalMailbox) {
    const status = await personalGmailStatus(db, env, actor);
    if (status.connected) {
      connected.push(personalMailbox);
      automaticSyncTasks.push(() => syncGmailHistory(db, env, { ownerUid: actor.uid, skipWatch: true }));
    }
  }
  if (automaticSyncTasks.length) {
    const results = await Promise.all(automaticSyncTasks.map(task => task().catch(error => ({ error: error?.message || "Automatic Gmail sync failed." }))));
    const syncErrors = results.map(result => String(result?.error || "").trim()).filter(Boolean);
    const updates = results.filter(result => result.success && result.imported > 0);
    if (updates.length && env.INBOX_REALTIME) {
      const id = env.INBOX_REALTIME.idFromName("workspace");
      context?.waitUntil?.(env.INBOX_REALTIME.get(id).fetch("https://inbox-realtime/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "inbox.updated", imported: updates.reduce((sum, result) => sum + result.imported, 0), at: Date.now() }),
      }).catch(() => {}));
    }
    const listing = await listInbox(db, access, configured, personalMailbox, folder, selectedMailbox, connected);
    return syncErrors.length ? { ...listing, syncErrors } : listing;
  }
  return listInbox(db, access, configured, personalMailbox, folder, selectedMailbox, connected);
}
const syncGmail = (db, env, mailbox) => syncGmailFull(db, env, { mailbox: mailbox === CONTACT_MAILBOX ? CONTACT_MAILBOX : MANARAH_MAILBOX });
const syncPersonalGmail = (db, env, actor) => syncGmailFull(db, env, { ownerUid: actor?.uid });
async function getAccessRoles(db) { const {results}=await db.prepare("SELECT id,name,description,permissions,is_preset FROM admin_roles ORDER BY is_preset DESC,name").all(); return {roles:results.map(r=>({id:r.id,name:r.name,description:r.description,permissions:parsePermissions(r.permissions),isPreset:!!r.is_preset}))}; }
async function getAccessMembers(db) { const {results}=await db.prepare("SELECT m.email,m.display_name,m.role_id,r.name role_name,m.created_at FROM admin_role_members m JOIN admin_roles r ON r.id=m.role_id ORDER BY m.email").all(); return {members:results.map(r=>({email:r.email,displayName:firstName(r.display_name,r.email),roleId:r.role_id,roleName:r.role_name,createdAt:r.created_at}))}; }
async function getAccessSettings(db) { const row=await db.prepare("SELECT default_role_id FROM admin_role_settings WHERE id=1").first(); return {defaultRoleId:row?.default_role_id||"viewer"}; }
async function saveAccessSettings(db,data) { const roleId=String(data.defaultRoleId||""); if(!await db.prepare("SELECT id FROM admin_roles WHERE id=?").bind(roleId).first())return {error:"Choose a valid default role."};await db.prepare("INSERT INTO admin_role_settings (id,default_role_id) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET default_role_id=excluded.default_role_id").bind(roleId).run();return {success:true}; }
async function saveAccessRole(db,data) { const id=String(data.role?.id||"").trim().toLowerCase().replace(/[^a-z0-9-]/g,"-").slice(0,60),name=String(data.role?.name||"").trim().slice(0,80),description=String(data.role?.description||"").trim().slice(0,240),permissions=Array.isArray(data.role?.permissions)?[...new Set(data.role.permissions.filter(p=>validatePermissionName(p) && p !== "*"))]:[]; if(!id||!name||!permissions.length||ROLE_PERMISSIONS[id])return {error:"Enter a unique role name and at least one permission."}; await db.prepare("INSERT INTO admin_roles (id,name,description,permissions,is_preset,updated_at) VALUES (?,?,?,?,0,datetime('now')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,permissions=excluded.permissions,updated_at=excluded.updated_at").bind(id,name,description,JSON.stringify(permissions)).run();return {success:true}; }
async function saveAccessMember(db,data,actor) { const email=String(data.member?.email||"").trim().toLowerCase(),roleId=String(data.member?.roleId||"").trim(),displayName=firstName(data.member?.displayName,email); if(!/^[^\s@]+@karamahcollective\.com$/i.test(email))return {error:"Use a @karamahcollective.com email address."};if(!await db.prepare("SELECT id FROM admin_roles WHERE id=?").bind(roleId).first())return {error:"Choose a valid role."};const existing=await db.prepare("SELECT email FROM admin_role_members WHERE lower(email)=lower(?)").bind(email).first();if(existing)await db.prepare("UPDATE admin_role_members SET role_id=?,added_by=?,updated_at=datetime('now') WHERE lower(email)=lower(?)").bind(roleId,actor.email,email).run();else await db.prepare("INSERT INTO admin_role_members (email,role_id,display_name,added_by,updated_at) VALUES (?,?,?,?,datetime('now'))").bind(email,roleId,displayName,actor.email).run();return {success:true}; }
async function saveMyProfile(db,data,actor) { const displayName=firstName(data.displayName,actor.email);await resolveAccess(db,actor);await db.prepare("UPDATE admin_role_members SET display_name=?,updated_at=datetime('now') WHERE lower(email)=lower(?)").bind(displayName,actor.email).run();return {success:true,displayName}; }
async function deleteAccessMember(db,data) { const email=String(data.email||"").trim().toLowerCase();if(email===INITIAL_ADMIN_EMAIL)return {error:"The initial administrator cannot be removed."};await db.prepare("DELETE FROM admin_role_members WHERE lower(email)=lower(?)").bind(email).run();return {success:true}; }
async function requestAccess(db,data,env,actor) {
  const adminEmail=String(data.adminEmail||"").trim().toLowerCase(), permission=String(data.permission||"").trim().slice(0,100), note=String(data.note||"").trim().slice(0,500);
  if(!permission)return {error:"Choose the access you need."};
  const admin=await db.prepare(`SELECT m.email,m.display_name FROM admin_role_members m JOIN admin_roles r ON r.id=m.role_id WHERE lower(m.email)=lower(?) AND r.permissions LIKE '%"*"%'`).bind(adminEmail).first();
  if(!admin)return {error:"Choose a workspace administrator."};
  const id=randomToken(16);
  await db.prepare("INSERT INTO admin_access_requests (id,requester_email,requested_permission,admin_email,note,status,created_at) VALUES (?,?,?,?,?,'pending',datetime('now'))").bind(id,actor.email,permission,adminEmail,note).run();
  const apiKey=String(env.BREVO_API_KEY||"").trim();
  if(apiKey) {
    const requester=actor.name||firstName("",actor.email);
    const text=`${requester} (${actor.email}) requested ${permission} access.${note?`\n\nNote: ${note}`:""}\n\nReview the request in Karamah Admin → Roles & access.`;
    try { await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{accept:"application/json","api-key":apiKey,"content-type":"application/json"},body:JSON.stringify({sender:{email:"admin@karamahcollective.com",name:"Karamah Admin"},to:[{email:adminEmail,name:firstName(admin.display_name,adminEmail)}],subject:`Access request from ${requester}`,textContent:text})}); } catch(error) { console.error("Access request email failed",error); }
  }
  return {success:true,id,notified:!!apiKey};
}

function randomToken(bytes = 24) { const values = new Uint8Array(bytes); crypto.getRandomValues(values); return [...values].map(value => value.toString(16).padStart(2, "0")).join(""); }
function normalizeReportEmail(value) { return String(value || "").trim().toLowerCase(); }
function normalizeReportName(value, email) { return String(value || "").trim().slice(0, 80) || firstName("", email); }
const REPORT_TIMEZONES = new Set(["Europe/Helsinki", "UTC"]);
const REPORT_FREQUENCIES = new Set(["weekly", "biweekly", "monthly"]);
const REPORT_DENSITIES = new Set(["standard", "compact"]);
const REPORT_MODES = new Set(["enabled", "disabled", "test"]);
function reportBool(value, fallback = true) { return value === undefined || value === null ? fallback : value ? true : false; }
function reportSettingsFromRow(row = {}) {
  const legacyMode = row.enabled === undefined || row.enabled ? "enabled" : "disabled";
  const reportMode = REPORT_MODES.has(row.report_mode || row.reportMode) ? (row.report_mode || row.reportMode) : legacyMode;
  return {
    enabled: reportMode === "enabled",
    reportMode,
    frequency: REPORT_FREQUENCIES.has(row.frequency) ? row.frequency : "weekly",
    dayOfWeek: Math.max(0, Math.min(6, Number(row.day_of_week ?? 6))),
    dayOfMonth: Math.max(1, Math.min(31, Number(row.day_of_month ?? 1))),
    sendTime: /^\d{2}:\d{2}$/.test(row.send_time || "") ? row.send_time : "09:00",
    timezone: REPORT_TIMEZONES.has(row.timezone) ? row.timezone : "Europe/Helsinki",
    subjectPrefix: String(row.subject_prefix || "Manarah weekly report").slice(0, 120),
    visualDensity: REPORT_DENSITIES.has(row.visual_density) ? row.visual_density : "standard",
    accentColor: /^#[0-9a-f]{6}$/i.test(row.accent_color || "") ? row.accent_color : "#08705b",
    includeAnalytics: row.include_analytics === undefined ? true : !!row.include_analytics,
    includeCommunity: row.include_community === undefined ? true : !!row.include_community,
    includeQueues: row.include_queues === undefined ? true : !!row.include_queues,
    includeCountries: row.include_countries === undefined ? true : !!row.include_countries,
    includeContributions: row.include_contributions === undefined ? true : !!row.include_contributions,
    lastSentAt: row.last_sent_at || "",
    updatedAt: row.updated_at || "",
  };
}
async function getWeeklyReportSettings(db) {
  try {
    const row = await db.prepare("SELECT * FROM weekly_report_settings WHERE id=1").first();
    return reportSettingsFromRow(row || {});
  } catch {
    return reportSettingsFromRow({});
  }
}
async function getWeeklyReportSubscribers(db) {
  const settings = await getWeeklyReportSettings(db);
  try {
    const { results } = await db.prepare("SELECT id,email,display_name,status,created_at,updated_at,unsubscribed_at FROM weekly_report_subscribers ORDER BY status,email").all();
    return { settings, subscribers: results.map(row => ({ id: row.id, email: row.email, displayName: row.display_name || "", status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, unsubscribedAt: row.unsubscribed_at || "" })) };
  } catch {
    return { settings, subscribers: [], setupRequired: true };
  }
}
async function saveWeeklyReportSettings(db, data) {
  const source = data.settings || {};
  const reportMode = REPORT_MODES.has(source.reportMode) ? source.reportMode : (reportBool(source.enabled, true) ? "enabled" : "disabled");
  const settings = reportSettingsFromRow({
    enabled: reportMode === "enabled" ? 1 : 0,
    report_mode: reportMode,
    frequency: String(source.frequency || "weekly"),
    day_of_week: Number(source.dayOfWeek ?? 6),
    day_of_month: Number(source.dayOfMonth ?? 1),
    send_time: String(source.sendTime || "09:00"),
    timezone: String(source.timezone || "Europe/Helsinki"),
    subject_prefix: String(source.subjectPrefix || "Manarah weekly report"),
    visual_density: String(source.visualDensity || "standard"),
    accent_color: String(source.accentColor || "#08705b"),
    include_analytics: reportBool(source.includeAnalytics, true) ? 1 : 0,
    include_community: reportBool(source.includeCommunity, true) ? 1 : 0,
    include_queues: reportBool(source.includeQueues, true) ? 1 : 0,
    include_countries: reportBool(source.includeCountries, true) ? 1 : 0,
    include_contributions: reportBool(source.includeContributions, true) ? 1 : 0,
  });
  await db.prepare(`INSERT INTO weekly_report_settings (
    id,enabled,report_mode,frequency,day_of_week,day_of_month,send_time,timezone,subject_prefix,visual_density,accent_color,
    include_analytics,include_community,include_queues,include_countries,include_contributions,updated_at
  ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    enabled=excluded.enabled,report_mode=excluded.report_mode,frequency=excluded.frequency,day_of_week=excluded.day_of_week,day_of_month=excluded.day_of_month,
    send_time=excluded.send_time,timezone=excluded.timezone,subject_prefix=excluded.subject_prefix,visual_density=excluded.visual_density,
    accent_color=excluded.accent_color,include_analytics=excluded.include_analytics,include_community=excluded.include_community,
    include_queues=excluded.include_queues,include_countries=excluded.include_countries,include_contributions=excluded.include_contributions,
    updated_at=excluded.updated_at`).bind(
    settings.reportMode === "enabled" ? 1 : 0, settings.reportMode, settings.frequency, settings.dayOfWeek, settings.dayOfMonth, settings.sendTime, settings.timezone,
    settings.subjectPrefix, settings.visualDensity, settings.accentColor, settings.includeAnalytics ? 1 : 0, settings.includeCommunity ? 1 : 0,
    settings.includeQueues ? 1 : 0, settings.includeCountries ? 1 : 0, settings.includeContributions ? 1 : 0
  ).run();
  return { success: true, settings: await getWeeklyReportSettings(db) };
}
async function saveWeeklyReportSubscriber(db, data, actor) {
  const email = normalizeReportEmail(data.subscriber?.email || data.email);
  if (!/^[^\s@]+@karamahcollective\.com$/i.test(email)) return { error: "Use a @karamahcollective.com email address." };
  const displayName = normalizeReportName(data.subscriber?.displayName || data.displayName, email);
  const existing = await db.prepare("SELECT id FROM weekly_report_subscribers WHERE lower(email)=lower(?)").bind(email).first();
  if (existing) {
    await db.prepare("UPDATE weekly_report_subscribers SET display_name=?,status='subscribed',unsubscribed_at=NULL,updated_at=datetime('now') WHERE id=?").bind(displayName, existing.id).run();
    return { success: true, id: existing.id };
  }
  const id = randomToken(16);
  await db.prepare("INSERT INTO weekly_report_subscribers (id,email,display_name,status,unsubscribe_token,added_by,updated_at) VALUES (?,?,?,?,?,?,datetime('now'))").bind(id, email, displayName, "subscribed", randomToken(24), actor.email).run();
  return { success: true, id };
}
async function unsubscribeWeeklyReportSubscriber(db, data) {
  const email = normalizeReportEmail(data.email);
  const id = String(data.id || "").trim();
  if (!email && !id) return { error: "Choose a recipient to unsubscribe." };
  const query = id ? "UPDATE weekly_report_subscribers SET status='unsubscribed',unsubscribed_at=datetime('now'),updated_at=datetime('now') WHERE id=?" : "UPDATE weekly_report_subscribers SET status='unsubscribed',unsubscribed_at=datetime('now'),updated_at=datetime('now') WHERE lower(email)=lower(?)";
  const { meta } = await db.prepare(query).bind(id || email).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Recipient not found." };
}
async function deleteWeeklyReportSubscriber(db, data) {
  const id = String(data.id || "").trim();
  if (!id) return { error: "Choose a recipient to remove." };
  await db.prepare("DELETE FROM weekly_report_subscribers WHERE id=?").bind(id).run();
  return { success: true };
}

// ── Audit log ────────────────────────────────────────────────────────────

const TARGET_ID_FIELDS = ["rowId", "placeId", "eventId", "wishId", "imageId", "rowIndex", "videoId", "id", "email"];
function extractTargetId(data) {
  for (const f of TARGET_ID_FIELDS) {
    if (data[f] !== undefined && data[f] !== null && data[f] !== "") return String(data[f]);
  }
  return "";
}

const AUDIT_DETAIL_NOISE_FIELDS = new Set(["action", "schema"]);
const AUDIT_REDACT_FIELDS = new Set([
  "authorization", "access_token", "refresh_token", "id_token", "token", "password", "code", "code_verifier",
  "body", "message", "text", "html", "content", "payload", "file", "image", "image_url",
]);
function redactAuditValue(value, key = "") {
  if (AUDIT_REDACT_FIELDS.has(String(key).toLowerCase())) return "[redacted]";
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redactAuditValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([childKey, childValue]) => [childKey, redactAuditValue(childValue, childKey)]));
  }
  return value;
}
export function buildAuditDetail(data) {
  const rest = {};
  for (const k of Object.keys(data)) {
    if (AUDIT_DETAIL_NOISE_FIELDS.has(k)) continue;
    rest[k] = redactAuditValue(data[k], k);
  }
  return JSON.stringify(rest);
}

export async function logAdminAction(db, { action, actor, targetId, detail, success }) {
  await db.prepare(
    "INSERT INTO audit_log (created_at, created_at_epoch, action, actor_uid, actor_email, actor_name, target_id, detail, success) VALUES (?,?,?,?,?,?,?,?,?)"
  ).bind(
    helsinkiTimestamp(), Date.now(), action, actor.uid, actor.email, actor.name || "", targetId || "", detail || "", success ? 1 : 0
  ).run();
}

const AUTH_EVENT_TYPES = new Set(["login", "signup"]);

async function handleLogAuthEvent(db, actor, data) {
  const eventType = (data.event || "").toString().trim().toLowerCase();
  if (!AUTH_EVENT_TYPES.has(eventType)) return { error: "Invalid event type" };

  await logAdminAction(db, { action: eventType, actor, targetId: "", detail: "", success: true });
  return { success: true };
}

async function getAdminLog(db, url) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 1), 200);
  const beforeRaw = parseInt(url.searchParams.get("before") || "", 10);
  const hasBefore = Number.isFinite(beforeRaw) && beforeRaw > 0;

  const { results } = await db.prepare(
    `SELECT * FROM audit_log ${hasBefore ? "WHERE id < ?" : ""} ORDER BY id DESC LIMIT ?`
  ).bind(...(hasBefore ? [beforeRaw, limit] : [limit])).all();

  return {
    entries: results.map((r) => ({
      id: r.id, createdAt: r.created_at, action: r.action,
      actorUid: r.actor_uid, actorEmail: r.actor_email, actorName: r.actor_name,
      targetId: r.target_id, detail: r.detail ? JSON.parse(r.detail) : null, success: !!r.success,
    })),
    nextBefore: results.length === limit ? results[results.length - 1].id : null,
  };
}

// ── GET actions ────────────────────────────────────────────────────────────

async function getAdminStats(db) {
  // Keep this to two D1 operations. The old Promise.all issued eight queries
  // at once; on Pages that can exhaust the per-request D1 connection limit,
  // leaving just the overview unavailable while the rest of Admin still works.
  const [counts, places] = await Promise.all([
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM new_places WHERE status = 'pending') AS pending_new,
      (SELECT COUNT(*) FROM edits WHERE status = 'pending') AS pending_edits,
      (SELECT COUNT(*) FROM contacts WHERE replied != 'Yes') AS unreplied_contacts,
      (SELECT COUNT(*) FROM wishes) AS total_wishes,
      (SELECT COUNT(*) FROM wishes WHERE approved NOT IN ('Yes','No')) AS pending_wishes,
      (SELECT COUNT(*) FROM events WHERE status = 'pending') AS pending_events,
      (SELECT COUNT(*) FROM event_edits WHERE status = 'pending') AS pending_event_edits`).first(),
    db.prepare("SELECT type, COUNT(*) n FROM places GROUP BY type").all(),
  ]);
  const byType = { space: 0, restaurant: 0, service: 0 };
  let totalPlaces = 0;
  for (const row of places.results) {
    totalPlaces += row.n;
    const type = ["mosque", "prayer_room", "cemetery"].includes(row.type)
      ? "space"
      : row.type === "shop"
        ? "service"
        : row.type;
    if (Object.prototype.hasOwnProperty.call(byType, type)) byType[type] += row.n;
  }
  return {
    pendingNew: counts?.pending_new || 0, pendingEdits: counts?.pending_edits || 0, totalPlaces, unrepliedContacts: counts?.unreplied_contacts || 0,
    byType, totalWishes: counts?.total_wishes || 0, pendingWishes: counts?.pending_wishes || 0, pendingEvents: counts?.pending_events || 0, pendingEventEdits: counts?.pending_event_edits || 0,
  };
}

async function getPendingNew(db) {
  const { results } = await db.prepare("SELECT * FROM new_places WHERE status = 'pending' ORDER BY id").all();
  return results.map((r) => ({
    rowId: String(r.id), timestamp: r.timestamp, name: r.name || r.google_name, type: r.type, address: r.address || r.google_address, tags: r.tags,
    gmaps: r.maps_link, notes: r.notes, score: r.score, googleName: r.google_name, googleAddress: r.google_address,
    lat: r.lat ?? "", lng: r.lng ?? "", placeId: r.place_id, website: r.website, enrichedAt: r.enriched_at, openingHours: r.opening_hours,
  }));
}

async function getPendingEdits(db) {
  const { results } = await db.prepare("SELECT * FROM edits WHERE status = 'pending' ORDER BY id").all();
  const out = [];
  for (const r of results) {
    let current = null;
    if (r.place_id) {
      const p = await db.prepare("SELECT name, type, address, tags, notes FROM places WHERE id = ?").bind(r.place_id).first();
      if (p) current = p;
    }
    out.push({
      rowId: String(r.id), timestamp: r.timestamp, placeId: r.place_id, name: r.name, type: r.type, address: r.address,
      tags: r.tags, gmaps: r.maps_link, notes: r.notes, score: r.score, changesSummary: r.changes_summary, current,
    });
  }
  return out;
}

async function getAdminPlaces(db) {
  const promosByPlace = new Map();
  try {
    const { results: promoRows } = await db.prepare(
      "SELECT place_id, code, description, start_date, end_date FROM place_promos ORDER BY place_id, sort_order, id"
    ).all();
    for (const row of promoRows) {
      const placeId = (row.place_id || "").toString().trim();
      if (!placeId) continue;
      if (!promosByPlace.has(placeId)) promosByPlace.set(placeId, []);
      promosByPlace.get(placeId).push({
        code: row.code || "",
        description: row.description || "",
        startDate: row.start_date || "",
        endDate: row.end_date || "",
      });
    }
  } catch {
    // Existing databases may not have the new place_promos table yet. The row
    // mapper below falls back to legacy sponsor_promo fields until migrated.
  }
  const { results } = await db.prepare("SELECT * FROM places ORDER BY name").all();
  return results.filter((r) => r.name).map((r) => ({
    id: r.id, name: r.name, type: (r.type || "").toLowerCase(), address: normaliseAddress(r.address), city: extractCityFromAddress(r.address),
    lat: r.lat ?? "", lng: r.lng ?? "", tags: r.tags, notes: r.notes, boycott: !!r.boycott, disabled: !!r.disabled,
    sponsorTier: (r.sponsor_tier || "").toLowerCase(), sponsorPromo: r.sponsor_promo, sponsorPromoText: r.sponsor_promo_text,
    sponsorStartDate: r.sponsor_start_date, sponsorEndDate: r.sponsor_end_date,
    promos: promosByPlace.has(r.id)
      ? promosByPlace.get(r.id)
      : [legacyPromoFromPlaceRow(r)].filter(Boolean),
  }));
}

async function getAdminContacts(db) {
  const { results } = await db.prepare("SELECT * FROM contacts ORDER BY id DESC").all();
  const unreplied = [], replied = [];
  for (const r of results) {
    if (!r.name && !r.email && !r.message) continue;
    const entry = { rowId: String(r.id), timestamp: r.timestamp, name: r.name, email: r.email, phone: r.phone, message: r.message, score: r.score, replied: r.replied === "Yes", repliedStatus: r.replied || "No" };
    (entry.replied ? replied : unreplied).push(entry);
  }
  return { unreplied, replied };
}

async function getAdminWishes(db) {
  const { results } = await db.prepare("SELECT * FROM wishes ORDER BY id DESC").all();
  return results.filter((r) => r.id && r.title).map((r) => ({
    wishId: r.id, title: r.title, description: r.description, votes: r.votes || 0, created: r.created,
    name: r.name, email: r.email, approved: r.approved || "", implemented: r.implemented || "",
  }));
}

async function getPendingEvents(db) {
  const { results } = await db.prepare("SELECT * FROM events WHERE status = 'pending' ORDER BY id").all();
  const out = [];
  for (const r of results) {
    const place = r.place_id ? await db.prepare("SELECT name FROM places WHERE id = ?").bind(r.place_id).first() : null;
    out.push({
      eventId: r.id, placeId: r.place_id, placeName: (place && place.name) || "", title: r.title, description: r.description,
      eventDate: r.event_date, eventTime: r.event_time, endTime: r.end_time, recurring: !!r.recurring,
      recurrencePattern: r.recurrence_pattern, url: r.url, createdAt: r.created_at,
      locationName: r.location_name || "", locationAddress: r.location_address || "",
      locationLat: r.location_lat, locationLng: r.location_lng, locationGmapsLink: r.location_gmaps_link || "",
      organizerName: r.organizer_name || "", organizerPlaceId: r.organizer_place_id || "",
    });
  }
  return out;
}

async function getPendingEventEdits(db) {
  const { results } = await db.prepare("SELECT * FROM event_edits WHERE status = 'pending' ORDER BY id").all();
  const out = [];
  for (const r of results) {
    const place = r.place_id ? await db.prepare("SELECT name FROM places WHERE id = ?").bind(r.place_id).first() : null;
    const current = r.event_id ? await db.prepare("SELECT place_id, title, description, event_date, event_time, end_time, recurring, recurrence_pattern, url, location_name, location_address, location_lat, location_lng, location_gmaps_link, organizer_name, organizer_place_id FROM events WHERE id = ?").bind(r.event_id).first() : null;
    const currentPlace = current && !place && current.place_id ? await db.prepare("SELECT name FROM places WHERE id = ?").bind(current.place_id).first() : null;
    out.push({
      rowId: String(r.id), timestamp: r.timestamp, eventId: r.event_id, placeId: r.place_id,
      placeName: (place && place.name) || (currentPlace && currentPlace.name) || "",
      title: r.title, description: r.description, eventDate: r.event_date, eventTime: r.event_time, endTime: r.end_time,
      recurring: !!r.recurring, recurrencePattern: r.recurrence_pattern, url: r.url, changesSummary: r.changes_summary,
      locationName: r.location_name || "", locationAddress: r.location_address || "",
      locationLat: r.location_lat, locationLng: r.location_lng, locationGmapsLink: r.location_gmaps_link || "",
      organizerName: r.organizer_name || "", organizerPlaceId: r.organizer_place_id || "",
      current: current || {},
    });
  }
  return out;
}

async function getAdminReviews(db) {
  const [reviewRows, imageRows] = await Promise.all([
    db.prepare(
      `SELECT r.*, p.name AS place_name, b.reason AS ban_reason
       FROM reviews r
       LEFT JOIN places p ON p.id = r.place_id
       LEFT JOIN reviewer_bans b ON b.email_hash = r.email_hash
       WHERE r.email_hash != ''
       ORDER BY r.id DESC`
    ).all(),
    db.prepare(
      `SELECT id, review_id, status, moderation_reason, content_type, size_bytes, created_at, photo_tag
       FROM review_images ORDER BY created_at, id`
    ).all(),
  ]);
  const imagesByReview = new Map();
  for (const image of imageRows.results) {
    const reviewId = String(image.review_id);
    if (!imagesByReview.has(reviewId)) imagesByReview.set(reviewId, []);
    imagesByReview.get(reviewId).push({
      id: image.id,
      status: image.status || "yes",
      moderationReason: image.moderation_reason || "",
      contentType: image.content_type || "",
      sizeBytes: Number(image.size_bytes || 0),
      createdAt: image.created_at || "",
      photoTag: image.photo_tag == null ? "location" : image.photo_tag,
    });
  }
  return reviewRows.results.map((r) => ({
    rowIndex: String(r.id), placeId: r.place_id, placeName: r.place_name || "",
    rating: Number(r.rating), text: r.text || "", timestamp: r.timestamp,
    status: r.status || "", moderationReason: r.moderation_reason || "",
    emailHash: `${(r.email_hash || "").substring(0, 8)}…`,
    banned: r.ban_reason != null, banReason: r.ban_reason || "",
    images: imagesByReview.get(String(r.id)) || [],
  }));
}

export async function getAdminReviewImage(db, env, imageId, headers) {
  if (!env.MEDIA || !REVIEW_IMAGE_ID_RE.test(imageId)) return json({ error: "Image not found" }, 404, headers);
  const row = await db.prepare("SELECT object_key, content_type FROM review_images WHERE id = ?").bind(imageId).first();
  if (!row) return json({ error: "Image not found" }, 404, headers);
  const object = await env.MEDIA.get(row.object_key);
  if (!object) return json({ error: "Image not found" }, 404, headers);
  const responseHeaders = new Headers(headers);
  responseHeaders.delete("Content-Type");
  object.writeHttpMetadata(responseHeaders);
  responseHeaders.set("Content-Type", row.content_type);
  responseHeaders.set("Cache-Control", "private, no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers: responseHeaders });
}

async function getPendingEid(db) {
  const { results } = await db.prepare("SELECT * FROM eid_new WHERE status = 'pending' ORDER BY id").all();
  return results.map((r) => ({
    rowId: String(r.id), timestamp: r.timestamp, name: r.name, address: r.address, mapsLink: r.maps_link,
    organizer: r.organizer, jamaats: r.jamaats, date: r.date, notes: r.notes, score: r.score,
    googleName: r.google_name, googleAddress: r.google_address, lat: r.lat ?? "", lng: r.lng ?? "", placeId: r.place_id, enrichedAt: r.enriched_at,
  }));
}

// Full (not just pending) listings, so the dashboard can browse every dataset it holds, not only approval queues.
async function getAdminEvents(db) {
  const { results } = await db.prepare("SELECT * FROM events ORDER BY event_date DESC, id DESC").all();
  const out = [];
  for (const r of results) {
    const place = r.place_id ? await db.prepare("SELECT name FROM places WHERE id = ?").bind(r.place_id).first() : null;
    out.push({
      eventId: r.id, placeId: r.place_id, placeName: (place && place.name) || "", title: r.title, description: r.description,
      eventDate: r.event_date, eventTime: r.event_time, endTime: r.end_time, recurring: !!r.recurring,
      recurrencePattern: r.recurrence_pattern, url: r.url, createdAt: r.created_at,
      locationName: r.location_name || "", locationAddress: r.location_address || "",
      locationLat: r.location_lat, locationLng: r.location_lng, locationGmapsLink: r.location_gmaps_link || "",
      organizerName: r.organizer_name || "", organizerPlaceId: r.organizer_place_id || "",
      status: r.status || "", rejectReason: r.reject_reason || "",
    });
  }
  return out;
}

async function getAdminEidPrayers(db) {
  const { results } = await db.prepare("SELECT * FROM eid_prayers ORDER BY name").all();
  return results.map((r) => ({
    id: r.id, name: r.name, address: r.address, lat: r.lat ?? "", lng: r.lng ?? "",
    organizer: r.organizer, jamaats: r.jamaats, notes: r.notes, date: r.date,
  }));
}

const TYPE_STYLE_GROUPS = new Set(["restaurant_restaurant_type", "service_service_type", "space_space_type"]);

async function getAdminTypeStyles(db) {
  const { results } = await db.prepare(
    "SELECT type, tag_id, label, icon, color FROM tags WHERE type IN ('restaurant_restaurant_type','service_service_type','space_space_type') ORDER BY type, label"
  ).all();
  return {
    types: results.map((r) => ({
      category: r.type,
      tagId: r.tag_id,
      label: r.label,
      icon: r.icon || "",
      color: r.color || "",
    })),
  };
}

export const GET_ACTIONS = {
  "admin-access": (db, _url, actor) => getAccess(db, actor),
  "mcp-consent-request": async (db, url, actor, env) => {
    const { getMcpConsentRequest } = await import("../_mcp-auth.js");
    return getMcpConsentRequest(db, url.searchParams.get("request"), actor, env);
  },
  "mcp-connections": async (db, _url, actor, _env, access) => {
    const { listMcpConnections } = await import("../_mcp-auth.js");
    return { connections: await listMcpConnections(db, actor, allows(access, "*")) };
  },
  "gmail-status": (db, _url, _actor, env) => gmailStatus(db, env),
  "contact-gmail-status": (db, _url, _actor, env) => gmailStatus(db, env, CONTACT_MAILBOX),
  "personal-gmail-status": (db, _url, actor, env) => personalGmailStatus(db, env, actor),
  "access-roles": (db) => getAccessRoles(db),
  "access-members": (db) => getAccessMembers(db),
  "access-settings": (db) => getAccessSettings(db),
  "forms-list": (db, url) => listForms(db, url),
  "forms-get": (db, url) => getForm(db, url),
  "forms-version": (db, url) => getVersion(db, url),
  "forms-submissions": (db, url) => listSubmissions(db, url),
  "forms-analytics": (db, url) => formAnalytics(db, url),
  "forms-export": (db, url) => exportResponses(db, url),
  "admin-link-hub": (db) => getAdminLinkHub(db),
  "admin-app-settings": (db) => readAdminAppSettings(db),
  "admin-stats": (db) => getAdminStats(db),
  "analytics-dashboard": (db, url, _actor, env) => getAnalyticsDashboard(db, env, url.searchParams.get("days")),
  "system-health": (db, url, _actor, env) => getSystemHealth(db, env, url.searchParams.get("days")),
  "pending-new": (db) => getPendingNew(db),
  "pending-edits": (db) => getPendingEdits(db),
  "admin-places": (db) => getAdminPlaces(db),
  "admin-contact": (db) => getAdminContacts(db),
  "inbox-list": listInboxWithGmail,
  "inbox-thread": async (db, url, actor, env, access) => getInboxThread(db, url.searchParams.get("threadId"), access, await personalMailboxFor(db, env, actor)),
  "inbox-members": (db, _url, _actor, _env, access) => listInboxAssignees(db, access),
  "inbox-typing": getInboxTyping,
  "admin-wishes": (db) => getAdminWishes(db),
  "pending-events": (db) => getPendingEvents(db),
  "pending-event-edits": (db) => getPendingEventEdits(db),
  "admin-reviews": (db) => getAdminReviews(db),
  "pending-eid": (db) => getPendingEid(db),
  "admin-events": (db) => getAdminEvents(db),
  "admin-eid-prayers": (db) => getAdminEidPrayers(db),
  "admin-log": (db, url) => getAdminLog(db, url),
  "admin-social-videos": (db) => listAllSocialVideos(db),
  "admin-type-styles": (db) => getAdminTypeStyles(db),
  "weekly-report-subscribers": (db) => getWeeklyReportSubscribers(db),
  "operations-summary": (db, _url, actor, env, access) => getOperationsSummary(operationsDb(env), db, actor, access),
  "operations-tasks-list": (db, url, actor, env, access) => listProjectTasks(operationsDb(env), { ...Object.fromEntries(url.searchParams.entries()), projectId: url.searchParams.get("projectId") || "project-admin-operations" }, actor, access),
  "operations-task-get": (db, url, actor, env, access) => getProjectTask(operationsDb(env), url.searchParams.get("id"), actor, access),
  "operations-approvals-list": (_db, _url, actor, env, access) => listOperationsApprovals(operationsDb(env), actor, access),
  "operations-history-list": (_db, url, _actor, env) => listOperationsHistory(operationsDb(env), Object.fromEntries(url.searchParams.entries())),
  "operations-history-diff": (_db, url, _actor, env) => diffOperationsHistory(operationsDb(env), Object.fromEntries(url.searchParams.entries())),
  "operations-settings-get": (_db, _url, _actor, env) => getOperationsSettings(operationsDb(env)),
  "project-workspace-list": (db, _url, actor) => listProjectWorkspaces(db, actor),
  "project-workspace-get": (db, url, actor) => getProjectWorkspaceAccount(db, { workspaceId: url.searchParams.get("workspaceId") }, actor),
  "project-workspace-members-list": (db, url, actor) => listProjectWorkspaceMembers(db, Object.fromEntries(url.searchParams.entries()), actor),
  "project-workspace-invitations-list": (db, url, actor) => listProjectWorkspaceInvitations(db, Object.fromEntries(url.searchParams.entries()), actor),
  "project-member-directory": (db, url, actor, env) => listProjectMemberDirectory(db, Object.fromEntries(url.searchParams.entries()), actor, env),
  "project-invitation-get": (db, url) => getProjectInvitation(db, { invitationId: url.searchParams.get("invitationId") }),
  "project-workspace-roles-list": (db, url, actor) => listProjectWorkspaceRoles(db, Object.fromEntries(url.searchParams.entries()), actor),
  "project-workspace-capabilities": (db, url, actor) => getProjectWorkspaceCapabilities(db, Object.fromEntries(url.searchParams.entries()), actor),
  "project-workspace-permission-check": (db, url, actor) => {
    let permissions = {};
    try { permissions = JSON.parse(url.searchParams.get("permissions") || "{}"); } catch { /* invalid checks are denied by the workspace handler */ }
    return checkProjectWorkspacePermission(db, { organizationId: url.searchParams.get("organizationId"), permissions }, actor);
  },
  "project-list": (db, url, actor, _env, access) => listProjects(db, actor, access, Object.fromEntries(url.searchParams.entries())),
  "project-search": (db, url, actor, _env, access) => searchProjectWorkspace(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-get": (db, url, actor, _env, access) => getProjectWorkspace(db, url.searchParams.get("projectId"), actor, access),
  "project-summary": (db, url, actor, _env, access) => projectSummary(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-tasks-list": (db, url, actor, _env, access) => listProjectTasks(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-task-get": (db, url, actor, _env, access) => getProjectTask(db, url.searchParams.get("id"), actor, access),
  "project-task-by-ticket": (db, url, actor, _env, access) => getProjectTaskByTicket(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-milestones-list": (db, url, actor, _env, access) => listProjectMilestones(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-task-comments-list": (db, url, actor, _env, access) => listProjectTaskComments(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-task-activity": (db, url, actor, _env, access) => listProjectActivity(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "google-tasks-status": (db, _url, actor, env) => googleTasksStatus(db, env, actor),
  "project-members-list": (db, url, actor, _env, access) => listProjectMembers(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-columns-list": (db, url, actor, _env, access) => listProjectColumns(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-relations-list": (db, url, actor, _env, access) => listProjectRelations(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-labels-list": (db, url, actor, _env, access) => listProjectLabels(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-task-links-list": (db, url, actor, _env, access) => listProjectTaskLinks(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-saved-views-list": (db, url, actor, _env, access) => listProjectSavedViews(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-task-time-list": (db, url, actor, _env, access) => listProjectTimeEntries(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-task-attachments-list": (db, url, actor, _env, access) => listProjectAttachments(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-task-attachment-get": (db, url, actor, env, access) => getProjectAttachment(db, Object.fromEntries(url.searchParams.entries()), actor, access, env.ADMIN_MEDIA),
  "project-custom-fields-list": (db, url, actor, _env, access) => listProjectCustomFields(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-custom-field-values-list": (db, url, actor, _env, access) => listProjectCustomFieldValues(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-custom-field-filter-values-list": (db, url, actor, _env, access) => listProjectCustomFieldFilterValues(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-task-watchers-list": (db, url, actor, _env, access) => listProjectTaskWatchers(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-notifications-list": (db, _url, actor, _env, access) => listProjectNotifications(db, {}, actor, access),
  "project-notification-preferences-get": (db, _url, actor) => getProjectNotificationPreferences(db, actor),
  "project-task-templates-list": (db, url, actor, _env, access) => listProjectTaskTemplates(db, Object.fromEntries(url.searchParams.entries()), actor, access),
  "project-webhooks-list": (db, url, actor, _env, access) => listProjectWebhooks(db, Object.fromEntries(url.searchParams.entries()), actor, access),
};

// These actions read/write the Admin control plane. Map moderation and map
// settings deliberately remain on env.DB, which is halal-finder-db.
const ADMIN_DATABASE_ACTIONS = new Set([
  "admin-access", "mcp-consent-request", "mcp-connections", "gmail-status", "contact-gmail-status",
  "personal-gmail-status", "access-roles", "access-members", "access-settings", "admin-link-hub",
  "inbox-list", "inbox-thread", "inbox-members", "inbox-typing", "weekly-report-subscribers", "admin-log",
  "mcp-consent", "mcp-revoke-connection", "gmail-oauth-start", "gmail-sync", "gmail-disconnect",
  "personal-gmail-oauth-start", "personal-gmail-sync", "personal-gmail-disconnect", "save-access-role",
  "save-access-member", "save-my-profile", "save-access-settings", "delete-access-member", "request-access",
  "forms-create", "forms-save", "forms-publish", "forms-status", "forms-duplicate", "forms-delete",
  "forms-delete-submission", "save-link-hub-settings", "save-link-hub-link", "delete-link-hub-link",
  "save-weekly-report-settings", "save-weekly-report-subscriber", "unsubscribe-weekly-report-subscriber",
  "delete-weekly-report-subscriber", "operations-summary", "operations-tasks-list", "operations-task-get",
  "operations-approvals-list", "operations-history-list", "operations-history-diff", "operations-settings-get",
  "operations-task-create", "operations-task-update", "operations-task-assign", "operations-tasks-bulk",
  "operations-approval-create", "operations-approval-resolve", "operations-history-record",
  "operations-history-rollback", "operations-settings-update",
]);
// Project data has its own privacy boundary and database. Authentication,
// Admin roles, MCP clients, and audit records remain in karamah-admin-db.
const PROJECT_DATABASE_ACTIONS = new Set([
  "project-invitation-get", "project-workspace-list", "project-workspace-get", "project-workspace-members-list", "project-workspace-invitations-list", "project-member-directory", "project-workspace-roles-list", "project-workspace-capabilities", "project-workspace-permission-check",
  "project-workspace-create", "project-workspace-update", "project-workspace-delete", "project-workspace-member-update", "project-workspace-member-remove", "project-workspace-role-create", "project-workspace-role-update", "project-workspace-role-delete", "project-invitation-accept", "project-invitation-cancel",
  "project-list", "project-search", "project-get", "project-summary", "project-tasks-list", "project-task-get", "project-task-by-ticket", "project-milestones-list", "project-task-comments-list", "project-task-activity",
  "project-members-list", "project-columns-list", "project-relations-list", "project-labels-list", "project-task-links-list", "project-saved-views-list", "project-task-time-list", "project-task-attachments-list", "project-task-attachment-get", "project-custom-fields-list", "project-custom-field-values-list", "project-custom-field-filter-values-list", "project-task-watchers-list", "project-notifications-list", "project-notification-preferences-get", "project-notification-preferences-update", "project-notification-workspace-rule-upsert", "project-notification-workspace-rule-delete",
  "project-task-templates-list", "project-webhooks-list",
  "project-create", "project-update", "project-archive", "project-tasks-create", "project-task-update", "project-task-delete",
  "project-tasks-bulk", "project-task-comment", "project-task-comment-update", "project-task-comment-delete", "project-task-duplicate", "project-task-assign", "project-milestone-create", "project-milestone-update", "project-milestone-delete", "project-member-update", "project-member-remove", "project-column-create", "project-column-update", "project-column-delete", "project-relation-create", "project-relation-delete", "project-task-link-save", "project-task-link-delete", "project-label-save", "project-label-attach", "project-label-detach", "project-label-delete", "project-saved-view-save", "project-saved-view-delete", "project-task-time-save", "project-task-attachment-upload", "project-task-attachment-delete", "project-custom-field-save", "project-custom-field-delete", "project-task-custom-value-save", "project-task-watcher-update", "project-notifications-read", "project-task-template-save", "project-task-template-delete", "project-task-from-template", "project-webhook-save", "project-webhook-delete",
  "google-tasks-status", "google-tasks-oauth-start", "google-tasks-sync",
]);
const FORMS_DATABASE_ACTIONS = new Set([
  "forms-list", "forms-get", "forms-version", "forms-submissions", "forms-analytics", "forms-export",
  "forms-create", "forms-save", "forms-publish", "forms-status", "forms-duplicate", "forms-delete",
  "forms-delete-submission",
]);
function databaseForAdminAction(env, action) {
  if (FORMS_DATABASE_ACTIONS.has(action)) {
    if (!env.FORMS_DB) throw new Error("Forms database is not configured");
    return env.FORMS_DB;
  }
  if (PROJECT_DATABASE_ACTIONS.has(action)) return projectsDb(env);
  return ADMIN_DATABASE_ACTIONS.has(action) ? adminDb(env) : env.DB;
}

/**
 * Server-side action execution shared by the Firebase Admin API and MCP.
 * Authorization is deliberately performed by the caller so MCP can resolve
 * its live role and connection grant before reaching the same handlers.
 */
export async function executeAdminAction({ action, method = "GET", data = {}, actor, access, env, context }) {
  const handler = method === "GET" ? GET_ACTIONS[action] : POST_ACTIONS[action];
  if (!handler) throw new Error("Unknown admin action");
  const url = new URL("https://internal.karamahcollective.com/api/admin");
  for (const [key, value] of Object.entries(data || {})) {
    if (value !== undefined && value !== null && typeof value !== "object" && value !== "") url.searchParams.set(key, String(value));
  }
  const handlerDb = databaseForAdminAction(env, action);
  const result = method === "GET"
    ? await handler(handlerDb, url, actor, env, access, context)
    : await handler(handlerDb, { ...data, action }, env, actor, access);
  if (method !== "GET" && action !== "inbox-typing") {
    await logAdminAction(adminDb(env), {
      action,
      actor,
      targetId: extractTargetId(data),
      detail: buildAuditDetail({ ...data, source: "mcp" }),
      success: !!result?.success,
    });
  }
  return result;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", "Access-Control-Allow-Origin": adminAllowedOrigin(request, env) };
  if (!env.DB || !env.ADMIN_DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";
  const handler = GET_ACTIONS[action];
  const isReviewImage = action === "admin-review-image";
  if (!handler && !isReviewImage) return json({ error: "Unknown admin action" }, 400, headers);
  if (PROJECT_DATABASE_ACTIONS.has(action) && !env.PROJECTS_DB) return json({ error: "Projects database is not configured." }, 503, headers);

  if (action === "project-invitation-get") {
    try { return json(await handler(databaseForAdminAction(env, action), url, null, env, null, context), 200, headers); }
    catch { return json({ valid: false, invitation: null }, 200, headers); }
  }

  const auth = await authenticateAuthorized(request, env, action);
  if (!auth.ok) return json({ error: auth.error }, auth.status, headers);

  try {
    if (isReviewImage) return await getAdminReviewImage(env.DB, env, url.searchParams.get("id") || "", headers);
    return json(await handler(databaseForAdminAction(env, action), url, auth.actor, env, auth.access, context), 200, headers);
  } catch (err) {
    const message = String(err?.message || err || "");
    if (message.includes("weekly_report_") || message.includes("analytics_cache") || message.includes("analytics_daily_snapshots")) {
      return json({ error: "Run the required analytics migration before opening this page." }, 500, headers);
    }
    return json({ error: "Service error" }, 502, headers);
  }
}

// ── POST (write) actions ───────────────────────────────────────────────────

// Code.gs:2382 copyNewRowToPlaces, folded into one atomic batch.
export async function approveNew(db, rowId, env) {
  const row = await db.prepare("SELECT * FROM new_places WHERE id = ?").bind(rowId).first();
  if (!row) return { error: "Row not found (may already be processed)" };

  let name = row.google_name || row.name || "";
  const type = (row.type || "").toString().trim().toLowerCase();
  let address = normaliseAddress(row.google_address || row.address || "");
  let lat = row.lat;
  let lng = row.lng;
  let website = row.website || "";
  let phone = row.phone || "";
  let openingHours = row.opening_hours || "";
  let googleReview = row.google_review || "";
  let googleRating = row.google_rating ?? null;
  let googleRatingCount = row.google_rating_count ?? null;
  let googleInfoRaw = row.google_info || "";
  const mapsLink = (row.maps_link || "").toString().trim();
  // A Maps-link submission must have stored rich details or a successful
  // Places Details response before it can become live. Parsed link
  // identity/coordinates are not proof that the link points to the intended place.
  const storedRichDetails = !!(
    openingHours || googleReview || googleRating != null || googleRatingCount != null || googleInfoRaw
  );
  let googleDetailsFound = !!(
    (mapsLink ? storedRichDetails : (row.google_name || row.google_address || row.place_id ||
      (row.lat != null && row.lng != null) || storedRichDetails))
  );

  // Approval is the last chance to repair a link-only submission before it
  // becomes live. Fetch rich Details again so bad parsed path names (for
  // example /maps/place/data=... share blobs) cannot outrank Google truth.
  if (env) {
    if (mapsLink) {
      try {
        const enriched = await enrichFromMapsLink(env, {
          mapsUrl: mapsLink,
          userName: row.name || "",
          userAddress: row.address || "",
          userType: type,
          website,
          phone,
          rich: true,
        });
        if (enriched.hasData) {
          if (enriched.googleName) name = enriched.googleName;
          if (enriched.googleAddress) address = normaliseAddress(enriched.googleAddress);
          if (enriched.lat != null) lat = enriched.lat;
          if (enriched.lng != null) lng = enriched.lng;
          if (enriched.website) website = enriched.website;
          if (enriched.phone) phone = enriched.phone;
          if (enriched.openingHours) openingHours = enriched.openingHours;
          if (enriched.googleReview) googleReview = enriched.googleReview;
          if (enriched.googleRating != null) googleRating = enriched.googleRating;
          if (enriched.googleRatingCount != null) googleRatingCount = enriched.googleRatingCount;
          if (enriched.googleInfo && Object.keys(enriched.googleInfo).length) googleInfoRaw = JSON.stringify(enriched.googleInfo);
          googleDetailsFound = !!(enriched.detailsFound || googleDetailsFound);
        }
      } catch { /* best-effort */ }
    }
    if ((lat == null || lng == null) && (row.name || row.address)) {
      try {
        const geo = await forwardGeocode([row.name, row.address].filter(Boolean).join(", "), env);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          if (!address && geo.address) address = normaliseAddress(geo.address);
        }
      } catch { /* best-effort */ }
    }
    if (lat != null && lng != null) {
      await db.prepare(
        `UPDATE new_places
         SET lat = ?, lng = ?, google_name = COALESCE(NULLIF(?, ''), google_name),
             google_address = COALESCE(NULLIF(?, ''), google_address),
             website = COALESCE(NULLIF(?, ''), website), phone = COALESCE(NULLIF(?, ''), phone),
             opening_hours = COALESCE(NULLIF(?, ''), opening_hours),
             google_review = COALESCE(NULLIF(?, ''), google_review),
             google_rating = COALESCE(?, google_rating),
             google_rating_count = COALESCE(?, google_rating_count),
             google_info = COALESCE(NULLIF(?, ''), google_info)
         WHERE id = ?`
      ).bind(lat, lng, name || "", address || "", website || "", phone || "", openingHours || "", googleReview || "", googleRating, googleRatingCount, googleInfoRaw || "", rowId).run();
    }
  }

  if (mapsLink && !googleDetailsFound) {
    return { error: "Google Place Details could not verify this Maps link; place was not approved" };
  }

  if (!name || lat == null || lng == null) {
    await db.prepare("UPDATE new_places SET status = 'yes' WHERE id = ?").bind(rowId).run();
    return { success: true, warning: "Approved without map coordinates — place was not added to the live map." };
  }

  const tags = parseTagString((row.tags || "").toString().trim());
  let googleInfo = {};
  try { googleInfo = googleInfoRaw ? JSON.parse(googleInfoRaw) : {}; } catch { googleInfo = {}; }
  if (googleInfo.servesAlcohol && !tags.hasOwnProperty("no_alcohol")) tags.no_alcohol = false;
  delete googleInfo.servesAlcohol;

  const newId = await generateId(db, "places", 6);
  const statements = [
    db.prepare("UPDATE new_places SET status = 'yes', app_place_id = ?, lat = ?, lng = ? WHERE id = ?").bind(newId, lat, lng, rowId),
    db.prepare(
      "INSERT INTO places (id, name, type, address, lat, lng, tags, notes, opening_hours, website, phone, google_info, google_info_enriched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(newId, name, type, address, lat, lng, JSON.stringify(tags), row.notes || "", openingHours || "", website || "", phone || "", Object.keys(googleInfo).length ? JSON.stringify(googleInfo) : "", Object.keys(googleInfo).length ? helsinkiTimestamp() : ""),
  ];
  await db.batch(statements);

  if (googleReview) {
    await db.prepare("INSERT INTO reviews (place_id, rating, text, email, timestamp, status, email_hash, google_review, google_rating, google_rating_count) VALUES (?,'','','',?,'yes','',?,?,?)")
      .bind(newId, new Date().toISOString(), googleReview, googleRating, googleRatingCount).run();
  }
  await upsertPlaceAppLinks(db, newId, row.app_links);
  return { success: true, placeId: newId };
}

async function rejectNew(db, rowId, reason) {
  const { meta } = await db.prepare("UPDATE new_places SET status = 'no', reject_reason = ? WHERE id = ?").bind(reason || "", rowId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Row not found (may already be processed)" };
}

// Code.gs:2452 applyEditToPlaces
async function approveEdit(db, rowId) {
  const row = await db.prepare("SELECT * FROM edits WHERE id = ?").bind(rowId).first();
  if (!row) return { error: "Row not found (may already be processed)" };
  if (!row.place_id) {
    await db.prepare("UPDATE edits SET status = 'yes' WHERE id = ?").bind(rowId).run();
    return { success: true };
  }

  const place = await db.prepare("SELECT id FROM places WHERE id = ?").bind(row.place_id).first();
  const statements = [db.prepare("UPDATE edits SET status = 'yes' WHERE id = ?").bind(rowId)];
  if (place) {
    const sets = [], binds = [];
    if (row.name) { sets.push("name = ?"); binds.push(row.name); }
    if (row.type) { sets.push("type = ?"); binds.push(row.type.toLowerCase()); }
    if (row.address) { sets.push("address = ?"); binds.push(normaliseAddress(row.address)); }
    if (row.tags) { sets.push("tags = ?"); binds.push(JSON.stringify(parseTagString(row.tags))); }
    if (row.notes) { sets.push("notes = ?"); binds.push(row.notes); }
    if (row.opening_hours) { sets.push("opening_hours = ?"); binds.push(row.opening_hours); }
    if (row.website) { sets.push("website = ?"); binds.push(row.website); }
    if (row.phone) { sets.push("phone = ?"); binds.push(row.phone); }
    if (sets.length) statements.push(db.prepare(`UPDATE places SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, row.place_id));
  }
  await db.batch(statements);
  if (place) await upsertPlaceAppLinks(db, row.place_id, row.app_links);
  return { success: true };
}

async function rejectEdit(db, rowId, reason) {
  const { meta } = await db.prepare("UPDATE edits SET status = 'no', reject_reason = ? WHERE id = ?").bind(reason || "", rowId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Row not found (may already be processed)" };
}

async function updateContactReplied(db, rowId, replied) {
  const status = (replied || "").toString().trim().toLowerCase();
  if (status !== "yes" && status !== "no") return { error: "Invalid replied status" };
  const { meta } = await db.prepare("UPDATE contacts SET replied = ? WHERE id = ?").bind(status === "yes" ? "Yes" : "No", rowId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Contact entry not found" };
}

const VALID_WISH_IMPL = ["Yes", "Inprogress", "Out of Scope", ""];

async function updateWishApproved(db, wishId, value) {
  if (!wishId) return { error: "Missing wishId" };
  const status = (value || "").toString().trim();
  if (status !== "Yes" && status !== "No") return { error: "Invalid value (must be Yes or No)" };
  const { meta } = await db.prepare("UPDATE wishes SET approved = ? WHERE id = ?").bind(status, wishId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Wish not found" };
}

async function updateWishImplemented(db, wishId, value) {
  if (!wishId) return { error: "Missing wishId" };
  const status = (value || "").toString().trim();
  if (!VALID_WISH_IMPL.includes(status)) return { error: "Invalid value" };
  const { meta } = await db.prepare("UPDATE wishes SET implemented = ? WHERE id = ?").bind(status, wishId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Wish not found" };
}

async function updateBoycott(db, placeId, boycott) {
  if (!placeId) return { error: "Missing placeId" };
  const { meta } = await db.prepare("UPDATE places SET boycott = ? WHERE id = ?").bind(boycott === "Yes" || boycott === true ? 1 : 0, placeId).run();
  return meta.rows_written > 0 ? { success: true } : { error: `Place not found: ${placeId}` };
}

async function updatePlaceDisabled(db, placeId, disabled) {
  if (!placeId) return { error: "Missing placeId" };
  const { meta } = await db.prepare("UPDATE places SET disabled = ? WHERE id = ?").bind(disabled === "Yes" || disabled === true ? 1 : 0, placeId).run();
  return meta.rows_written > 0 ? { success: true } : { error: `Place not found: ${placeId}` };
}

async function updatePlaceCoordinates(db, data) {
  const placeId = (data.placeId || "").toString().trim();
  if (!placeId) return { error: "Missing placeId" };

  const hasBothCoordinates = data.lat != null && data.lng != null
    && String(data.lat).trim() !== "" && String(data.lng).trim() !== "";
  const lat = Number(data.lat);
  const lng = Number(data.lng);
  if (!hasBothCoordinates || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "Latitude and longitude must both be valid numbers" };
  }
  if (lat < -90 || lat > 90) return { error: "Latitude must be between -90 and 90" };
  if (lng < -180 || lng > 180) return { error: "Longitude must be between -180 and 180" };

  const { meta } = await db.prepare(
    "UPDATE places SET lat = ?, lng = ? WHERE id = ?"
  ).bind(lat, lng, placeId).run();
  return meta.rows_written > 0
    ? { success: true, coordinates: { lat, lng } }
    : { error: `Place not found: ${placeId}` };
}

async function refreshPlaceInfo(db, placeId, env) {
  if (!placeId) return { error: "Missing placeId" };
  const place = await db.prepare("SELECT * FROM places WHERE id = ?").bind(placeId).first();
  if (!place) return { error: `Place not found: ${placeId}` };

  const source = await db.prepare(
    "SELECT maps_link, name, address FROM new_places WHERE app_place_id = ? AND maps_link != '' ORDER BY id DESC LIMIT 1"
  ).bind(placeId).first();

  let mapsUrl = (source && source.maps_link) || "";
  if (!mapsUrl && place.google_info) {
    try { mapsUrl = JSON.parse(place.google_info).mapsUrl || ""; } catch { mapsUrl = ""; }
  }
  if (!mapsUrl) return { error: "No Google Maps link found for this place" };

  const enriched = await enrichFromMapsLink(env, {
    mapsUrl,
    userName: (source && source.name) || place.name || "",
    userAddress: (source && source.address) || place.address || "",
    userType: place.type || "",
    website: place.website || "",
    phone: place.phone || "",
    rich: true,
  });
  if (!enriched.hasData) return { error: "Could not refresh this Google Maps link" };
  if (!enriched.detailsFound) return { error: "Google Place Details could not verify this Maps link" };

  const googleInfo = enriched.googleInfo || {};
  delete googleInfo.servesAlcohol;

  const name = enriched.googleName || place.name || "";
  const address = normaliseAddress(enriched.googleAddress || place.address || "");
  const hasGoogleCoordinates = enriched.lat != null && enriched.lng != null
    && String(enriched.lat).trim() !== "" && String(enriched.lng).trim() !== "";
  const lat = Number(enriched.lat);
  const lng = Number(enriched.lng);
  if (!hasGoogleCoordinates || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: "Google Place Details did not return valid coordinates" };
  }
  const googleInfoRaw = Object.keys(googleInfo).length ? JSON.stringify(googleInfo) : place.google_info || "";

  await db.prepare(
    `UPDATE places
     SET name = ?, address = ?, lat = ?, lng = ?,
         opening_hours = ?, website = ?, phone = ?,
         google_info = ?, google_info_enriched_at = ?
     WHERE id = ?`
  ).bind(
    name, address, lat, lng,
    enriched.openingHours || place.opening_hours || "",
    enriched.website || place.website || "",
    enriched.phone || place.phone || "",
    googleInfoRaw,
    googleInfoRaw ? helsinkiTimestamp() : place.google_info_enriched_at || "",
    placeId
  ).run();

  if (enriched.googleReview || enriched.googleRating != null || enriched.googleRatingCount != null) {
    await db.prepare(
      `INSERT INTO reviews (place_id, rating, text, email, timestamp, status, email_hash, google_review, google_rating, google_rating_count)
       VALUES (?,'','','',?,'yes','',?,?,?)
       ON CONFLICT(place_id, email_hash) DO UPDATE SET
         timestamp = excluded.timestamp,
         status = 'yes',
         google_review = excluded.google_review,
         google_rating = excluded.google_rating,
         google_rating_count = excluded.google_rating_count`
    ).bind(
      placeId,
      new Date().toISOString(),
      enriched.googleReview || "",
      enriched.googleRating ?? null,
      enriched.googleRatingCount ?? null
    ).run();
  }

  return { success: true, coordinates: { lat, lng } };
}

async function deletePlace(db, placeId, env) {
  if (!placeId) return { error: "Missing placeId" };
  const place = await db.prepare("SELECT id FROM places WHERE id = ?").bind(placeId).first();
  if (!place) return { error: `Place not found: ${placeId}` };

  let mediaKeys = [];
  try {
    const { results } = await db.prepare("SELECT object_key FROM review_images WHERE place_id = ?").bind(placeId).all();
    mediaKeys = results.map((row) => row.object_key).filter(Boolean);
  } catch { mediaKeys = []; }
  const statements = [
    db.prepare("DELETE FROM review_images WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM reviews WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM saved_places WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM events WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM event_edits WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM place_app_links WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM place_social_videos WHERE place_id = ?").bind(placeId),
  ];
  try {
    await db.prepare("SELECT id FROM place_promos LIMIT 1").first();
    statements.push(db.prepare("DELETE FROM place_promos WHERE place_id = ?").bind(placeId));
  } catch {
    // Database has not run the promo migration yet.
  }
  statements.push(db.prepare("DELETE FROM places WHERE id = ?").bind(placeId));
  await db.batch(statements);
  if (mediaKeys.length && env.MEDIA) {
    try { await env.MEDIA.delete(mediaKeys); } catch { /* D1 deletion remains authoritative. */ }
  }
  return { success: true };
}

const VALID_SPONSOR_TIERS = ["", "basic", "featured", "spotlight"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PROMOS_PER_PLACE = 12;
const MAX_PROMO_CODE_LEN = 80;
const MAX_PROMO_DESC_LEN = 240;
const TYPE_STYLE_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const TYPE_STYLE_BUILTIN_RE = /^[a-z0-9_-]{1,40}$/;
const TYPE_STYLE_DATA_ICON_RE = /^data:image\/(?:svg\+xml|png|webp|jpeg|jpg|gif|avif|bmp|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]{1,65000}$/;

async function updateTypeStyle(db, data) {
  const category = (data.category || "").toString().trim().toLowerCase();
  const tagId = (data.tagId || "").toString().trim();
  const icon = (data.icon || "").toString().trim();
  const color = (data.color || "").toString().trim();
  if (!TYPE_STYLE_GROUPS.has(category)) return { error: "Invalid type category" };
  if (!tagId || tagId.length > 80) return { error: "Invalid type id" };
  if (icon && !TYPE_STYLE_BUILTIN_RE.test(icon) && !TYPE_STYLE_DATA_ICON_RE.test(icon)) return { error: "Invalid icon" };
  if (color && !TYPE_STYLE_COLOR_RE.test(color)) return { error: "Invalid color" };

  const { meta } = await db.prepare("UPDATE tags SET icon = ?, color = ? WHERE type = ? AND tag_id = ?")
    .bind(icon, color, category, tagId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Type not found" };
}

function legacyPromoFromPlaceRow(row) {
  const code = (row.sponsor_promo || "").toString().trim();
  const description = (row.sponsor_promo_text || "").toString().trim();
  const usableCode = ["true", "false"].includes(code.toLowerCase()) ? "" : code;
  if (!usableCode && !description) return null;
  return {
    code: usableCode,
    description,
    startDate: row.sponsor_start_date || "",
    endDate: row.sponsor_end_date || "",
  };
}

function normalizePromoRows(rawPromos) {
  const raw = Array.isArray(rawPromos) ? rawPromos : [];
  if (raw.length > MAX_PROMOS_PER_PLACE) return { error: `A place can have at most ${MAX_PROMOS_PER_PLACE} promos` };

  const promos = [];
  for (const row of raw) {
    const code = (row?.code || "").toString().trim();
    const description = (row?.description || "").toString().trim();
    const startDate = (row?.startDate || "").toString().trim();
    const endDate = (row?.endDate || "").toString().trim();
    if (!code && !description && !startDate && !endDate) continue;
    if (!code && !description) return { error: "Each promo needs a code, a description, or both" };
    if (code.length > MAX_PROMO_CODE_LEN) return { error: "Promo code is too long" };
    if (description.length > MAX_PROMO_DESC_LEN) return { error: "Promo description is too long" };
    if (startDate && !DATE_RE.test(startDate)) return { error: "Invalid promo start date format (use YYYY-MM-DD)" };
    if (endDate && !DATE_RE.test(endDate)) return { error: "Invalid promo end date format (use YYYY-MM-DD)" };
    promos.push({ code, description, startDate, endDate });
  }
  return { promos };
}

async function updateSponsor(db, data) {
  const placeId = data.placeId;
  if (!placeId) return { error: "Missing placeId" };
  const tier = (data.sponsorTier || "").toString().trim().toLowerCase();
  if (!VALID_SPONSOR_TIERS.includes(tier)) return { error: "Invalid sponsor tier" };
  const startDate = (data.sponsorStartDate || "").toString().trim();
  const endDate = (data.sponsorEndDate || "").toString().trim();
  if (startDate && !DATE_RE.test(startDate)) return { error: "Invalid start date format (use YYYY-MM-DD)" };
  if (endDate && !DATE_RE.test(endDate)) return { error: "Invalid end date format (use YYYY-MM-DD)" };
  const normalized = normalizePromoRows(data.promos);
  if (normalized.error) return { error: normalized.error };

  const place = await db.prepare("SELECT id FROM places WHERE id = ?").bind(placeId).first();
  if (!place) return { error: `Place not found: ${placeId}` };

  const firstPromo = normalized.promos[0] || { code: "", description: "" };
  const statements = [
    db.prepare("UPDATE places SET sponsor_tier = ?, sponsor_promo = ?, sponsor_promo_text = ?, sponsor_start_date = ?, sponsor_end_date = ? WHERE id = ?")
      .bind(tier, firstPromo.code, firstPromo.description, startDate, endDate, placeId),
  ];
  try {
    await db.prepare("SELECT id FROM place_promos LIMIT 1").first();
    statements.push(db.prepare("DELETE FROM place_promos WHERE place_id = ?").bind(placeId));
    normalized.promos.forEach((promo, index) => {
      statements.push(
        db.prepare("INSERT INTO place_promos (place_id, code, description, start_date, end_date, sort_order) VALUES (?,?,?,?,?,?)")
          .bind(placeId, promo.code, promo.description, promo.startDate, promo.endDate, index)
      );
    });
  } catch {
    if (normalized.promos.length > 1) return { error: "Promo table missing. Run the place_promos migration before saving multiple promos." };
  }
  await db.batch(statements);
  return { success: true };
}

async function approveEvent(db, eventId, env) {
  const event = await db.prepare("SELECT * FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return { error: "Event not found (may already be processed)" };
  if (!event.place_id && (event.location_lat == null || event.location_lng == null) && event.location_gmaps_link) {
    const enriched = await enrichFromMapsLink(env, {
      mapsUrl: event.location_gmaps_link,
      userName: event.location_name || "",
      userAddress: event.location_address || "",
      website: "",
      phone: "",
      rich: false,
    });
    if (enriched.hasData) {
      await db.prepare("UPDATE events SET location_name = ?, location_address = ?, location_lat = ?, location_lng = ? WHERE id = ?")
        .bind(event.location_name || enriched.googleName || "", event.location_address || enriched.googleAddress || "", enriched.lat, enriched.lng, eventId).run();
      event.location_lat = enriched.lat;
      event.location_lng = enriched.lng;
    }
  }
  if (!event.place_id && (event.location_lat == null || event.location_lng == null)) {
    return { error: "Custom location could not be resolved. Check its Google Maps link before approval." };
  }
  const { meta } = await db.prepare("UPDATE events SET status = 'yes' WHERE id = ?").bind(eventId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Event not found (may already be processed)" };
}

async function rejectEvent(db, eventId, reason) {
  const { meta } = await db.prepare("UPDATE events SET status = 'no', reject_reason = ? WHERE id = ?").bind(reason || "", eventId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Event not found (may already be processed)" };
}

async function deleteEvent(db, eventId) {
  const event = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return { error: "Event not found" };
  await db.batch([
    db.prepare("DELETE FROM event_edits WHERE event_id = ?").bind(eventId),
    db.prepare("DELETE FROM events WHERE id = ?").bind(eventId),
  ]);
  return { success: true };
}

// Code.gs:1372 applyEventEditToEvents — only overwrites non-empty edit fields.
async function approveEventEdit(db, rowId, env) {
  const row = await db.prepare("SELECT * FROM event_edits WHERE id = ?").bind(rowId).first();
  if (!row) return { error: "Event edit not found (may already be processed)" };

  if (!row.place_id && row.location_gmaps_link && (row.location_lat == null || row.location_lng == null)) {
    const enriched = await enrichFromMapsLink(env, {
      mapsUrl: row.location_gmaps_link,
      userName: row.location_name || "",
      userAddress: row.location_address || "",
      website: "",
      phone: "",
      rich: false,
    });
    if (!enriched.hasData || enriched.lat == null || enriched.lng == null) {
      return { error: "Custom location could not be resolved. Check its Google Maps link before approval." };
    }
    row.location_name = row.location_name || enriched.googleName || "";
    row.location_address = row.location_address || enriched.googleAddress || "";
    row.location_lat = enriched.lat;
    row.location_lng = enriched.lng;
  }

  const statements = [db.prepare("UPDATE event_edits SET status = 'yes' WHERE id = ?").bind(rowId)];
  if (row.event_id) {
    const fieldMap = [["title", row.title], ["description", row.description], ["event_date", row.event_date], ["event_time", row.event_time], ["end_time", row.end_time], ["recurrence_pattern", row.recurrence_pattern], ["url", row.url]];
    const sets = [], binds = [];
    for (const [col, val] of fieldMap) {
      if (val) { sets.push(`${col} = ?`); binds.push(val); }
    }
    if (row.recurring) { sets.push("recurring = 1"); }
    const locationChanged = row.place_id || row.location_name || row.location_gmaps_link || (row.location_lat != null && row.location_lng != null);
    if (locationChanged) {
      for (const [col, val] of [
        ["place_id", row.place_id || ""],
        ["location_name", row.location_name || ""],
        ["location_address", row.location_address || ""],
        ["location_lat", row.location_lat],
        ["location_lng", row.location_lng],
        ["location_gmaps_link", row.location_gmaps_link || ""],
      ]) {
        sets.push(`${col} = ?`);
        binds.push(val);
      }
    }
    if (row.organizer_name || row.organizer_place_id) {
      sets.push("organizer_name = ?", "organizer_place_id = ?");
      binds.push(row.organizer_name || "", row.organizer_place_id || "");
    }
    if (sets.length) statements.push(db.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, row.event_id));
  }
  await db.batch(statements);
  return { success: true };
}

async function rejectEventEdit(db, rowId, reason) {
  const { meta } = await db.prepare("UPDATE event_edits SET status = 'no', reject_reason = ? WHERE id = ?").bind(reason || "", rowId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Event edit not found (may already be processed)" };
}

async function updateReviewStatus(db, rowIndex, newStatus, reason = "") {
  const rowNum = parseInt(rowIndex, 10);
  if (!rowNum || !REVIEW_STATUSES.has(newStatus)) return { error: "Invalid review status" };
  const moderationReason = newStatus === "yes" ? "" : truncate((reason || "").toString().trim(), MAX_MODERATION_REASON_LEN);
  const { meta } = await db.prepare("UPDATE reviews SET status = ?, moderation_reason = ? WHERE id = ? AND email_hash != ''")
    .bind(newStatus, moderationReason, rowNum).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Row not found" };
}

async function updateReviewImageStatus(db, data) {
  const imageId = (data.imageId || "").toString();
  const status = (data.status || "").toString();
  if (!REVIEW_IMAGE_ID_RE.test(imageId) || !IMAGE_STATUSES.has(status)) return { error: "Invalid image status" };
  const moderationReason = status === "yes" ? "" : truncate((data.reason || "").toString().trim(), MAX_MODERATION_REASON_LEN);
  const { meta } = await db.prepare("UPDATE review_images SET status = ?, moderation_reason = ? WHERE id = ?")
    .bind(status, moderationReason, imageId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Image not found" };
}

async function deleteReview(db, data, env) {
  const reviewId = parseInt(data.rowIndex, 10);
  if (!reviewId) return { error: "Invalid review" };
  const review = await db.prepare("SELECT id FROM reviews WHERE id = ? AND email_hash != ''").bind(reviewId).first();
  if (!review) return { error: "Review not found" };
  const { results } = await db.prepare("SELECT object_key FROM review_images WHERE review_id = ?").bind(reviewId).all();
  await db.batch([
    db.prepare("DELETE FROM review_images WHERE review_id = ?").bind(reviewId),
    db.prepare("DELETE FROM reviews WHERE id = ? AND email_hash != ''").bind(reviewId),
  ]);
  const objectKeys = (results || []).map((row) => row.object_key).filter(Boolean);
  if (objectKeys.length && env.MEDIA) {
    try { await env.MEDIA.delete(objectKeys); } catch { /* Deleted metadata keeps orphaned media inaccessible. */ }
  }
  return { success: true, deletedImages: objectKeys.length };
}

async function updateReviewerBan(db, data, actor, banned) {
  const reviewId = parseInt(data.rowIndex, 10);
  if (!reviewId) return { error: "Invalid review" };
  const review = await db.prepare("SELECT email_hash FROM reviews WHERE id = ? AND email_hash != ''").bind(reviewId).first();
  if (!review?.email_hash) return { error: "Reviewer not found" };
  if (!banned) {
    const { meta } = await db.prepare("DELETE FROM reviewer_bans WHERE email_hash = ?").bind(review.email_hash).run();
    return meta.rows_written > 0 ? { success: true } : { error: "Reviewer is not banned" };
  }
  const reason = truncate((data.reason || "").toString().trim(), MAX_MODERATION_REASON_LEN);
  await db.batch([
    db.prepare(
      `INSERT INTO reviewer_bans (email_hash, reason, created_at, created_by) VALUES (?,?,?,?)
       ON CONFLICT(email_hash) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at, created_by = excluded.created_by`
    ).bind(review.email_hash, reason, new Date().toISOString(), actor.email),
    db.prepare("UPDATE reviews SET status = 'no', moderation_reason = ? WHERE email_hash = ?")
      .bind(reason || "Reviewer banned", review.email_hash),
  ]);
  return { success: true };
}

// Code.gs:950 copyEidNewToEidPrayers
async function approveEid(db, rowId) {
  const row = await db.prepare("SELECT * FROM eid_new WHERE id = ?").bind(rowId).first();
  if (!row) return { error: "Row not found (may already be processed)" };

  const name = row.google_name || row.name || "";
  const address = normaliseAddress(row.google_address || row.address || "");
  const lat = row.lat, lng = row.lng;
  if (!name || lat == null || lng == null) {
    await db.prepare("UPDATE eid_new SET status = 'yes' WHERE id = ?").bind(rowId).run();
    return { success: true };
  }

  const newId = await generateId(db, "eid_prayers", 6);
  await db.batch([
    db.prepare("UPDATE eid_new SET status = 'yes' WHERE id = ?").bind(rowId),
    db.prepare("INSERT INTO eid_prayers (id, name, address, lat, lng, organizer, jamaats, notes, date) VALUES (?,?,?,?,?,?,'',?,?)")
      .bind(newId, name, address, lat, lng, row.organizer || "", row.notes || "", row.date || ""),
  ]);
  return { success: true };
}

async function rejectEid(db, rowId) {
  // Code.gs's adminRejectEid discards its reason argument too — matched here for parity.
  const { meta } = await db.prepare("UPDATE eid_new SET status = 'no' WHERE id = ?").bind(rowId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Row not found (may already be processed)" };
}

async function queueGoogleTaskProjection(env, result, actor) {
  if (result?.task) await enqueueGoogleTaskSync(projectsDb(env), result.task, actor).catch(() => {});
  return result;
}

export const POST_ACTIONS = {
  "mcp-consent": async (db, data, env, actor) => {
    const { completeMcpConsent } = await import("../_mcp-auth.js");
    return completeMcpConsent(db, data, actor, env);
  },
  "mcp-revoke-connection": async (db, data, _env, actor, access) => {
    const { revokeMcpConnection } = await import("../_mcp-auth.js");
    return revokeMcpConnection(db, data.connectionId, actor, allows(access, "*"));
  },
  "gmail-oauth-start": (db, data, env, actor) => startGmailOAuth(db, env, actor, data.returnTo, data.mailbox),
  "gmail-sync": (db, data, env) => syncGmail(db, env, data.mailbox),
  "gmail-disconnect": (db, data) => disconnectGmail(db, data.mailbox),
  "personal-gmail-oauth-start": (db, data, env, actor) => startPersonalGmailOAuth(db, env, actor, data.returnTo),
  "personal-gmail-sync": (db, _data, env, actor) => syncPersonalGmail(db, env, actor),
  "personal-gmail-disconnect": (db, _data, _env, actor) => disconnectPersonalGmail(db, actor),
  "save-access-role": (db, data) => saveAccessRole(db, data),
  "save-access-member": (db, data, _env, actor) => saveAccessMember(db, data, actor),
  "save-my-profile": (db, data, _env, actor) => saveMyProfile(db, data, actor),
  "save-access-settings": (db, data) => saveAccessSettings(db, data),
  "delete-access-member": (db, data) => deleteAccessMember(db, data),
  "request-access": (db, data, env, actor) => requestAccess(db, data, env, actor),
  "forms-create": (db, data, _env, actor) => createForm(db, data, actor),
  "forms-save": async (db, data, env, actor) => { const result = await saveForm(db, data, actor); if (result.success) await recordRevisionBestEffort(env, { domain: "forms", recordType: "form", recordId: data.id, state: "draft", snapshot: data.schema, changeSummary: "Saved form draft", sourceAction: "forms-save" }, actor); return result; },
  "forms-publish": async (db, data, env, actor) => { const result = await publishForm(db, data, actor); if (result.success) { const row = await db.prepare("SELECT draft_schema_json FROM forms WHERE id=?").bind(data.id).first(); await recordRevisionBestEffort(env, { domain: "forms", recordType: "form", recordId: data.id, state: "published", snapshot: parseOperationsJson(row?.draft_schema_json, {}), changeSummary: `Published form version ${result.versionNumber}`, sourceAction: "forms-publish" }, actor); } return result; },
  "forms-status": (db, data, _env, actor) => setFormStatus(db, data, actor),
  "forms-duplicate": (db, data, _env, actor) => duplicateForm(db, data, actor),
  "forms-delete": (db, data, _env, actor) => deleteForm(db, data, actor),
  "forms-delete-submission": (db, data, env) => deleteSubmission(db, data, env),
  "save-link-hub-settings": async (db, data, env, actor) => { const result = await saveLinkHubSettings(db, data); if (result.success) await recordRevisionBestEffort(env, { domain: "links", recordType: "hub-settings", recordId: "1", state: "draft", snapshot: result.settings, changeSummary: "Saved link hub settings", sourceAction: "save-link-hub-settings" }, actor); return result; },
  "save-link-hub-link": async (db, data, env, actor) => { const result = await saveLinkHubLink(db, data); if (result.success) await recordRevisionBestEffort(env, { domain: "links", recordType: "link", recordId: result.link?.id || data.link?.id, state: "draft", snapshot: result.link, changeSummary: "Saved link", sourceAction: "save-link-hub-link" }, actor); return result; },
  "delete-link-hub-link": (db, data) => deleteLinkHubLink(db, data),
  "save-weekly-report-settings": (db, data) => saveWeeklyReportSettings(db, data),
  "save-weekly-report-subscriber": (db, data, _env, actor) => saveWeeklyReportSubscriber(db, data, actor),
  "unsubscribe-weekly-report-subscriber": (db, data) => unsubscribeWeeklyReportSubscriber(db, data),
  "delete-weekly-report-subscriber": (db, data) => deleteWeeklyReportSubscriber(db, data),
  "update-app-settings": async (db, data, env, actor) => { const result = await saveAppSettings(db, data); if (result?.settings) await recordRevisionBestEffort(env, { domain: "maps", recordType: "app-settings", recordId: "1", state: "draft", snapshot: result.settings, changeSummary: "Saved map settings", sourceAction: "update-app-settings" }, actor); return result; },
  "approve-new": (db, data, env) => approveNew(db, data.rowId, env),
  "reject-new": (db, data) => rejectNew(db, data.rowId, data.reason || ""),
  "approve-edit": (db, data) => approveEdit(db, data.rowId),
  "reject-edit": (db, data) => rejectEdit(db, data.rowId, data.reason || ""),
  "update-boycott": (db, data) => updateBoycott(db, data.placeId, data.boycott),
  "update-place-disabled": (db, data) => updatePlaceDisabled(db, data.placeId, data.disabled),
  "update-place-coordinates": (db, data) => updatePlaceCoordinates(db, data),
  "refresh-place-info": (db, data, env) => refreshPlaceInfo(db, data.placeId, env),
  "delete-place": (db, data, env) => deletePlace(db, data.placeId, env),
  "update-sponsor": (db, data) => updateSponsor(db, data),
  "update-type-style": (db, data) => updateTypeStyle(db, data),
  "update-contact-replied": (db, data) => updateContactReplied(db, data.rowId, data.replied),
  "inbox-reply": async (db, data, env, actor, access) => replyInbox(db, env, data, actor, access, await personalMailboxFor(db, env, actor)),
  "inbox-compose": async (db, data, env, actor, access) => composeInbox(db, env, data, actor, access, await personalMailboxFor(db, env, actor)),
  "inbox-status": async (db, data, env, actor, access) => setInboxStatus(db, data, access, await personalMailboxFor(db, env, actor)),
  "inbox-note": async (db, data, env, actor, access) => addInboxNote(db, data, actor, access, await personalMailboxFor(db, env, actor)),
  "inbox-star": async (db, data, env, actor, access) => setInboxStar(db, data, access, await personalMailboxFor(db, env, actor)),
  "inbox-snooze": async (db, data, env, actor, access) => setInboxSnooze(db, data, access, await personalMailboxFor(db, env, actor)),
  "inbox-assign": async (db, data, env, actor, access) => assignInboxThread(db, data, actor, access, await personalMailboxFor(db, env, actor)),
  "inbox-bulk": async (db, data, env, actor, access) => bulkUpdateInbox(db, data, actor, access, await personalMailboxFor(db, env, actor)),
  "inbox-typing": (db, data, env, actor, access) => setInboxTyping(db, data, actor, env, access),
  "update-wish-approved": (db, data) => updateWishApproved(db, data.wishId, data.value),
  "update-wish-implemented": (db, data) => updateWishImplemented(db, data.wishId, data.value),
  "approve-event": (db, data, env) => approveEvent(db, data.eventId, env),
  "reject-event": (db, data) => rejectEvent(db, data.eventId, data.reason || ""),
  "delete-event": (db, data) => deleteEvent(db, data.eventId),
  "approve-event-edit": (db, data, env) => approveEventEdit(db, data.rowId, env),
  "reject-event-edit": (db, data) => rejectEventEdit(db, data.rowId, data.reason || ""),
  "approve-review": (db, data) => updateReviewStatus(db, data.rowIndex, "yes"),
  "reject-review": (db, data) => updateReviewStatus(db, data.rowIndex, "no", data.reason),
  "set-review-status": (db, data) => updateReviewStatus(db, data.rowIndex, data.status, data.reason),
  "set-review-image-status": (db, data) => updateReviewImageStatus(db, data),
  "delete-review": (db, data, env) => deleteReview(db, data, env),
  "ban-reviewer": (db, data, _env, actor) => updateReviewerBan(db, data, actor, true),
  "unban-reviewer": (db, data, _env, actor) => updateReviewerBan(db, data, actor, false),
  "approve-eid": (db, data) => approveEid(db, data.rowId),
  "reject-eid": (db, data) => rejectEid(db, data.rowId),
  "upsert-social-video": (db, data) => upsertSocialVideo(db, data.video || data),
  "delete-social-video": (db, data) => deleteSocialVideo(db, data.videoId || data.id),
  "operations-task-create": async (_db, data, env, actor, access) => queueGoogleTaskProjection(env, await createProjectTask(operationsDb(env), { ...data, projectId: data.projectId || "project-admin-operations" }, actor, access), actor),
  "operations-task-update": async (_db, data, env, actor, access) => queueGoogleTaskProjection(env, await updateProjectTask(operationsDb(env), data, actor, access), actor),
  "operations-task-assign": async (_db, data, env, actor, access) => queueGoogleTaskProjection(env, await updateProjectTask(operationsDb(env), { ...data, assigneeUid: data.assigneeUid, assigneeEmail: data.assigneeEmail, statusCategory: data.statusCategory || "assigned" }, actor, access), actor),
  "operations-tasks-bulk": (_db, data, env, actor, access) => bulkUpdateProjectTasks(operationsDb(env), data, actor, access),
  "operations-approval-create": (_db, data, env, actor) => createOperationsApproval(operationsDb(env), data, actor),
  "operations-approval-resolve": (_db, data, env, actor, access) => resolveOperationsApproval(operationsDb(env), data, actor, access),
  "operations-history-record": (_db, data, env, actor) => recordOperationsRevision(operationsDb(env), data, actor),
  "operations-history-rollback": (_db, data, env, actor) => rollbackOperationsHistory(operationsDb(env), data, actor),
  "operations-settings-update": (_db, data, env, actor) => saveOperationsSettings(operationsDb(env), data, actor),
  "project-workspace-create": (db, data, _env, actor) => createProjectWorkspace(db, data, actor),
  "project-workspace-update": (db, data, _env, actor) => updateProjectWorkspace(db, data, actor),
  "project-workspace-delete": (db, data, _env, actor) => deleteProjectWorkspace(db, data, actor),
  "project-workspace-member-update": (db, data, env, actor) => updateProjectWorkspaceMember(db, data, actor, env),
  "project-invitation-accept": (db, data, _env, actor) => acceptProjectInvitation(db, data, actor),
  "project-invitation-cancel": (db, data, _env, actor, access) => cancelProjectInvitation(db, data, actor, access),
  "project-workspace-member-remove": (db, data, _env, actor) => removeProjectWorkspaceMember(db, data, actor),
  "project-workspace-role-create": (db, data, _env, actor) => createProjectWorkspaceRole(db, data, actor),
  "project-workspace-role-update": (db, data, _env, actor) => updateProjectWorkspaceRole(db, data, actor),
  "project-workspace-role-delete": (db, data, _env, actor) => deleteProjectWorkspaceRole(db, data, actor),
  "project-create": (db, data, env, actor, access) => createProject(db, data, actor, access),
  "project-update": (db, data, env, actor, access) => updateProject(db, data, actor, access),
  "project-archive": (db, data, env, actor, access) => updateProject(db, { ...data, archived: true }, actor, access),
  "project-tasks-create": async (db, data, env, actor, access) => queueGoogleTaskProjection(env, await createProjectTask(db, data, actor, access), actor),
  "project-task-update": async (db, data, env, actor, access) => queueGoogleTaskProjection(env, await updateProjectTask(db, data, actor, access), actor),
  "project-task-assign": async (db, data, env, actor, access) => queueGoogleTaskProjection(env, await updateProjectTask(db, data, actor, access), actor),
  "project-task-delete": (db, data, env, actor, access) => deleteProjectTask(db, data, actor, access),
  "project-tasks-bulk": (db, data, env, actor, access) => bulkUpdateProjectTasks(db, data, actor, access),
  "project-task-comment": (db, data, env, actor, access) => addProjectTaskComment(db, data, actor, access),
  "project-task-comment-update": (db, data, env, actor, access) => updateProjectTaskComment(db, data, actor, access),
  "project-task-comment-delete": (db, data, env, actor, access) => deleteProjectTaskComment(db, data, actor, access),
  "project-task-duplicate": (db, data, env, actor, access) => duplicateProjectTask(db, data, actor, access),
  "project-milestone-create": (db, data, env, actor, access) => createProjectMilestone(db, data, actor, access),
  "project-milestone-update": (db, data, env, actor, access) => updateProjectMilestone(db, data, actor, access),
  "project-milestone-delete": (db, data, env, actor, access) => deleteProjectMilestone(db, data, actor, access),
  "google-tasks-oauth-start": (db, data, env, actor) => startGoogleTasksOAuth(db, env, actor, data.returnTo),
  "google-tasks-sync": (db, data, env, actor) => syncGoogleTasksForOwner(db, env, actor.uid),
  "project-member-update": (db, data, env, actor, access) => updateProjectMember(db, data, actor, access, env),
  "project-member-remove": (db, data, env, actor, access) => removeProjectMember(db, data, actor, access),
  "project-column-create": (db, data, env, actor, access) => createProjectColumn(db, data, actor, access),
  "project-column-update": (db, data, env, actor, access) => updateProjectColumn(db, data, actor, access),
  "project-column-delete": (db, data, env, actor, access) => deleteProjectColumn(db, data, actor, access),
  "project-relation-create": (db, data, env, actor, access) => createProjectRelation(db, data, actor, access),
  "project-relation-delete": (db, data, env, actor, access) => deleteProjectRelation(db, data, actor, access),
  "project-task-link-save": (db, data, env, actor, access) => saveProjectTaskLink(db, data, actor, access),
  "project-task-link-delete": (db, data, env, actor, access) => deleteProjectTaskLink(db, data, actor, access),
  "project-label-save": (db, data, env, actor, access) => saveProjectLabel(db, data, actor, access),
  "project-label-attach": (db, data, env, actor, access) => attachProjectLabel(db, data, actor, access),
  "project-label-detach": (db, data, env, actor, access) => detachProjectLabel(db, data, actor, access),
  "project-label-delete": (db, data, env, actor, access) => deleteProjectLabel(db, data, actor, access),
  "project-saved-view-save": (db, data, env, actor, access) => saveProjectSavedView(db, data, actor, access),
  "project-saved-view-delete": (db, data, env, actor, access) => deleteProjectSavedView(db, data, actor, access),
  "project-task-time-save": (db, data, env, actor, access) => saveProjectTimeEntry(db, data, actor, access),
  "project-task-attachment-upload": (db, data, env, actor, access) => createProjectAttachment(db, data, actor, access, env.ADMIN_MEDIA),
  "project-task-attachment-delete": (db, data, env, actor, access) => deleteProjectAttachment(db, data, actor, access, env.ADMIN_MEDIA),
  "project-custom-field-save": (db, data, env, actor, access) => saveProjectCustomField(db, data, actor, access),
  "project-custom-field-delete": (db, data, env, actor, access) => deleteProjectCustomField(db, data, actor, access),
  "project-task-custom-value-save": (db, data, env, actor, access) => saveProjectTaskCustomValue(db, data, actor, access),
  "project-task-watcher-update": (db, data, env, actor, access) => updateProjectTaskWatcher(db, data, actor, access),
  "project-notifications-read": (db, data, env, actor) => markProjectNotificationsRead(db, data, actor),
  "project-notification-preferences-update": (db, data, env, actor) => updateProjectNotificationPreferences(db, data, actor, env),
  "project-notification-workspace-rule-upsert": (db, data, env, actor) => upsertProjectNotificationWorkspaceRule(db, data, actor),
  "project-notification-workspace-rule-delete": (db, data, env, actor) => deleteProjectNotificationWorkspaceRule(db, data, actor),
  "project-task-template-save": (db, data, env, actor, access) => saveProjectTaskTemplate(db, data, actor, access),
  "project-task-template-delete": (db, data, env, actor, access) => deleteProjectTaskTemplate(db, data, actor, access),
  "project-task-from-template": (db, data, env, actor, access) => createProjectTaskFromTemplate(db, data, actor, access),
  "project-webhook-save": (db, data, env, actor, access) => saveProjectWebhook(db, data, actor, access, env.PROJECT_WEBHOOK_ENCRYPTION_KEY || env.MCP_INTERNAL_SIGNING_KEY),
  "project-webhook-delete": (db, data, env, actor, access) => deleteProjectWebhook(db, data, actor, access),
};

export async function onRequestPost(context) {
  const { env, request } = context;
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", "Access-Control-Allow-Origin": adminAllowedOrigin(request, env) };
  if (!env.DB || !env.ADMIN_DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  let data;
  try { data = JSON.parse(await request.text()); } catch { return json({ error: "Invalid JSON" }, 400, headers); }

  if (data.action === "log-auth-event") {
    const auth = await authenticateWorkspaceMember(request, env);
    if (!auth.ok) return json({ error: auth.error }, auth.status, headers);
    return json(await handleLogAuthEvent(adminDb(env), auth.actor, data), 200, headers);
  }

  const handler = POST_ACTIONS[data.action];
  if (!handler) return json({ error: "Unknown admin action" }, 400, headers);
  if (PROJECT_DATABASE_ACTIONS.has(data.action) && !env.PROJECTS_DB) return json({ error: "Projects database is not configured." }, 503, headers);

  const auth = await authenticateAuthorized(request, env, data.action, data);
  if (!auth.ok) return json({ error: auth.error }, auth.status, headers);

  let result;
  try {
    result = await handler(databaseForAdminAction(env, data.action), data, env, auth.actor, auth.access);
  } catch (err) {
    const message = String(err?.message || err || "");
    console.error("Admin action failed", { action: data.action, actor: auth.actor.email, message });
    if (message.includes("weekly_report_")) {
      return json({ error: "Run the weekly report migration before saving these settings." }, 500, headers);
    }
    return json({ error: "Service error" }, 502, headers);
  }

  try {
    if (data.action !== "inbox-typing") await logAdminAction(adminDb(env), {
      action: data.action, actor: auth.actor,
      targetId: extractTargetId(data), detail: buildAuditDetail(data), success: !!result.success,
    });
  } catch { /* audit-log failure must never mask the real response */ }

  try { await publishProjectRealtime(env, data.action, data, result); } catch (error) { console.error("Project realtime publish failed", error); }

  return json(result, 200, headers);
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": adminAllowedOrigin(context.request, context.env),
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
