/**
 * Shared authorization vocabulary for the Admin panel and MCP.
 *
 * The owner APIs remain responsible for resolving a member's current role.
 * This module owns the permission semantics and the action catalog so the
 * browser, owner APIs, and MCP cannot quietly drift apart.
 */

export const EVERYONE_PERMISSIONS = [
  "dashboard.view",
  "maps.places.read",
  "links.qr",
  "forms.create",
  "access.view",
  "access.request",
];

export const ROLE_PERMISSIONS = {
  administrator: ["*"],
  "map-editor": ["maps.*"],
  "content-editor": ["website.*", "links.*", "forms.*", "reports.write"],
  moderator: ["moderation.*", "inbox.*"],
  viewer: [],
};

export const DEFAULT_ROLE_ID = "viewer";

export const MCP_PERMISSION_CATALOG = [
  "dashboard.view",
  "activity.read",
  "activity.write",
  "analytics.read",
  "analytics.write",
  "reports.read",
  "reports.write",
  "maps.places.read",
  "maps.places.write",
  "maps.events.read",
  "maps.events.write",
  "maps.eid.read",
  "maps.eid.write",
  "maps.social.read",
  "maps.social.write",
  "maps.styles.read",
  "maps.styles.write",
  "maps.settings.read",
  "maps.settings.write",
  "moderation.places.read",
  "moderation.places.write",
  "moderation.events.read",
  "moderation.events.write",
  "moderation.reviews.read",
  "moderation.reviews.write",
  "moderation.wishes.read",
  "moderation.wishes.write",
  "moderation.contacts.read",
  "moderation.contacts.write",
  "inbox.contact.read",
  "inbox.contact.write",
  "inbox.manarah.read",
  "inbox.manarah.write",
  "website.content.read",
  "website.content.write",
  "website.team.read",
  "website.team.write",
  "website.subscribers.read",
  "website.subscribers.write",
  "links.read",
  "links.write",
  "forms.read",
  "forms.write",
  "forms.assets.write",
  "reports.read",
  "reports.write",
  "access.view",
  "access.write",
  "forms.create",
  "links.qr",
  "access.request",
];

const action = (name, config = {}) => ({
  action: name,
  method: config.method || "GET",
  owner: config.owner || "maps",
  name: config.name || name.replaceAll("-", "."),
  title: config.title || name,
  description: config.description || `Admin operation: ${name}.`,
  permissions: config.permissions || [config.permission || "dashboard.view"],
  dangerous: Boolean(config.dangerous),
  resourceAware: Boolean(config.resourceAware),
  exposeMcp: config.exposeMcp !== false,
  mcpOnly: config.mcpOnly === true,
  schema: config.schema || {},
});

const mapsRead = [
  action("mcp-consent-request", { name: "workspace.mcp.consent_request", title: "Read MCP consent request", permissions: ["dashboard.view"], exposeMcp: false }),
  action("mcp-connections", { name: "workspace.mcp.connections", title: "List MCP connections", permissions: ["dashboard.view"] }),
  action("admin-access", { name: "workspace.access.current", title: "Read current access", permissions: ["dashboard.view"] }),
  action("gmail-status", { name: "email.manarah.status", title: "Read Manarah Gmail status", permissions: ["dashboard.view"] }),
  action("contact-gmail-status", { name: "email.contact.status", title: "Read contact Gmail status", permissions: ["inbox.contact.read"] }),
  action("personal-gmail-status", { name: "email.personal.status", title: "Read personal Gmail status", permissions: ["dashboard.view"] }),
  action("access-roles", { name: "workspace.roles.list", title: "List workspace roles", permissions: ["access.view"] }),
  action("access-members", { name: "workspace.members.list", title: "List workspace members", permissions: ["access.view"] }),
  action("access-settings", { name: "workspace.access.settings", title: "Read access settings", permissions: ["*"] }),
  action("admin-stats", { name: "overview.read", title: "Read admin overview", permissions: ["dashboard.view"] }),
  action("analytics-dashboard", { name: "analytics.read", title: "Read analytics", permissions: ["analytics.read"] }),
  action("system-health", { name: "overview.system_health", title: "Read system health", permissions: ["dashboard.view"] }),
  action("pending-new", { name: "moderation.places.pending", title: "List pending place submissions", permissions: ["moderation.places.read"] }),
  action("pending-edits", { name: "moderation.places.edits", title: "List pending place edits", permissions: ["moderation.places.read"] }),
  action("admin-places", { name: "maps.places.list", title: "List places", permissions: ["maps.places.read"] }),
  action("admin-contact", { name: "moderation.contacts.list", title: "List legacy contacts", permissions: ["moderation.contacts.read"] }),
  action("inbox-list", { name: "inbox.list", title: "List inbox conversations", permissions: ["inbox.contact.read", "inbox.manarah.read"] }),
  action("inbox-thread", { name: "inbox.thread.read", title: "Read an inbox conversation", permissions: ["inbox.contact.read", "inbox.manarah.read"] }),
  action("inbox-members", { name: "inbox.assignees.list", title: "List inbox assignees", permissions: ["inbox.contact.read", "inbox.manarah.read"] }),
  action("admin-wishes", { name: "moderation.wishes.list", title: "List wishes", permissions: ["moderation.wishes.read"] }),
  action("pending-events", { name: "moderation.events.pending", title: "List pending events", permissions: ["moderation.events.read"] }),
  action("pending-event-edits", { name: "moderation.events.edits", title: "List pending event edits", permissions: ["moderation.events.read"] }),
  action("admin-reviews", { name: "moderation.reviews.list", title: "List reviews", permissions: ["moderation.reviews.read"] }),
  action("pending-eid", { name: "maps.eid.pending", title: "List pending Eid submissions", permissions: ["maps.eid.read"] }),
  action("admin-events", { name: "maps.events.list", title: "List events", permissions: ["maps.events.read"] }),
  action("admin-eid-prayers", { name: "maps.eid.list", title: "List Eid prayers", permissions: ["maps.eid.read"] }),
  action("admin-log", { name: "workspace.activity.list", title: "Read activity log", permissions: ["activity.read"] }),
  action("admin-social-videos", { name: "maps.social.list", title: "List social videos", permissions: ["maps.social.read"] }),
  action("admin-type-styles", { name: "maps.styles.list", title: "List map styles", permissions: ["maps.styles.read"] }),
  action("admin-app-settings", { name: "maps.settings.read", title: "Read map settings", permissions: ["maps.settings.read"] }),
  action("weekly-report-subscribers", { name: "reports.subscribers.list", title: "List weekly report subscribers", permissions: ["reports.read"] }),
  action("admin-review-image", { name: "moderation.reviews.image.read", title: "Read review image", permissions: ["moderation.reviews.read"], schema: { id: "string" } }),
  action("inbox-typing", { name: "inbox.typing", title: "Read inbox typing presence", permissions: ["inbox.contact.read", "inbox.manarah.read"], schema: { threadId: "string" } }),
  action("forms-list", { owner: "forms", name: "forms.list", title: "List forms", permissions: ["forms.read", "forms.create"], resourceAware: true }),
  action("forms-get", { owner: "forms", name: "forms.read", title: "Read a form", permissions: ["forms.read", "forms.create"], resourceAware: true }),
  action("forms-version", { owner: "forms", name: "forms.version.read", title: "Read a form version", permissions: ["forms.read", "forms.create"], resourceAware: true }),
  action("forms-submissions", { owner: "forms", name: "forms.submissions.list", title: "List form submissions", permissions: ["forms.read", "forms.create"], resourceAware: true }),
  action("forms-analytics", { owner: "forms", name: "forms.analytics.read", title: "Read form analytics", permissions: ["forms.read", "forms.create"], resourceAware: true }),
  action("forms-export", { owner: "forms", name: "forms.responses.export", title: "Export form responses", permissions: ["forms.read", "forms.create"], resourceAware: true }),
  action("admin-link-hub", { name: "links.read", title: "Read link hub", permissions: ["links.read"] }),
];

const mapsWrite = [
  action("log-auth-event", { name: "workspace.activity.auth", title: "Record an authentication event", permissions: ["dashboard.view"], exposeMcp: false }),
  action("mcp-qr-generate", { name: "links.qr.generate", title: "Generate a QR code", permissions: ["links.qr"], mcpOnly: true, schema: { value: "string", size: "number", format: "string" } }),
  action("mcp-consent", { name: "workspace.mcp.consent", title: "Complete MCP consent", permissions: ["dashboard.view"], dangerous: true, exposeMcp: false }),
  action("mcp-revoke-connection", { name: "workspace.mcp.revoke", title: "Revoke MCP connection", permissions: ["dashboard.view"], dangerous: true, schema: { connectionId: "string" } }),
  action("gmail-oauth-start", { name: "email.manarah.connect", title: "Start Manarah Gmail connection", permissions: ["*"] , dangerous: true, schema: { returnTo: "string", mailbox: "string" } }),
  action("gmail-sync", { name: "email.sync", title: "Sync shared Gmail", permissions: ["inbox.contact.read", "inbox.manarah.read"], dangerous: true, schema: { mailbox: "string" } }),
  action("gmail-disconnect", { name: "email.manarah.disconnect", title: "Disconnect Manarah Gmail", permissions: ["*"], dangerous: true, schema: { mailbox: "string" } }),
  action("personal-gmail-oauth-start", { name: "email.personal.connect", title: "Start personal Gmail connection", permissions: ["dashboard.view"], dangerous: true, schema: { returnTo: "string" } }),
  action("personal-gmail-sync", { name: "email.personal.sync", title: "Sync personal Gmail", permissions: ["dashboard.view"], dangerous: true }),
  action("personal-gmail-disconnect", { name: "email.personal.disconnect", title: "Disconnect personal Gmail", permissions: ["dashboard.view"], dangerous: true }),
  action("save-access-role", { name: "workspace.roles.update", title: "Create or update a workspace role", permissions: ["*"], dangerous: true, schema: { role: "object" } }),
  action("save-access-member", { name: "workspace.members.update", title: "Assign a workspace role", permissions: ["*"], dangerous: true, schema: { member: "object" } }),
  action("save-my-profile", { name: "workspace.profile.update", title: "Update workspace display name", permissions: ["dashboard.view"], schema: { displayName: "string" } }),
  action("save-access-settings", { name: "workspace.access.settings.update", title: "Update default workspace role", permissions: ["*"], dangerous: true, schema: { defaultRoleId: "string" } }),
  action("delete-access-member", { name: "workspace.members.delete", title: "Remove a workspace member", permissions: ["*"], dangerous: true, schema: { email: "string" } }),
  action("request-access", { name: "workspace.access.request", title: "Request workspace access", permissions: ["access.request"], schema: { permission: "string", adminEmail: "string", note: "string" } }),
  action("forms-create", { owner: "forms", name: "forms.create", title: "Create a form", permissions: ["forms.create", "forms.write"], resourceAware: true, schema: { title: "string" } }),
  action("forms-save", { owner: "forms", name: "forms.update", title: "Update a form", permissions: ["forms.write", "forms.create"], resourceAware: true, schema: { id: "string", revision: "number", schema: "object", slug: "string" } }),
  action("forms-publish", { owner: "forms", name: "forms.publish", title: "Publish a form", permissions: ["forms.write", "forms.create"], resourceAware: true, dangerous: true, schema: { id: "string", revision: "number" } }),
  action("forms-status", { owner: "forms", name: "forms.status.update", title: "Update form status", permissions: ["forms.write", "forms.create"], resourceAware: true, schema: { id: "string", status: "string" } }),
  action("forms-duplicate", { owner: "forms", name: "forms.duplicate", title: "Duplicate a form", permissions: ["forms.write", "forms.create"], resourceAware: true, schema: { id: "string" } }),
  action("forms-delete", { owner: "forms", name: "forms.delete", title: "Delete a form", permissions: ["forms.write", "forms.create"], resourceAware: true, dangerous: true, schema: { id: "string" } }),
  action("forms-delete-submission", { owner: "forms", name: "forms.submissions.delete", title: "Delete a form submission", permissions: ["forms.write", "forms.create"], resourceAware: true, dangerous: true, schema: { id: "string", submissionId: "string" } }),
  action("forms-invite", { owner: "forms", name: "forms.invites.send", title: "Send form invitations", permissions: ["forms.write", "forms.create"], resourceAware: true, dangerous: true }),
  action("forms-add-collaborator", { owner: "forms", name: "forms.collaborators.add", title: "Add a form collaborator", permissions: ["forms.write", "forms.create"], resourceAware: true, dangerous: true, schema: { id: "string", email: "string" } }),
  action("forms-remove-collaborator", { owner: "forms", name: "forms.collaborators.remove", title: "Remove a form collaborator", permissions: ["forms.write", "forms.create"], resourceAware: true, dangerous: true, schema: { id: "string", email: "string" } }),
  action("save-link-hub-settings", { name: "links.settings.update", title: "Update link hub settings", permissions: ["links.write"], dangerous: true, schema: { settings: "object" } }),
  action("save-link-hub-link", { name: "links.item.update", title: "Create or update a link", permissions: ["links.write"], schema: { link: "object" } }),
  action("delete-link-hub-link", { name: "links.item.delete", title: "Delete a link", permissions: ["links.write"], dangerous: true, schema: { id: "string" } }),
  action("save-weekly-report-settings", { name: "reports.settings.update", title: "Update weekly report settings", permissions: ["reports.write"], dangerous: true, schema: { settings: "object" } }),
  action("save-weekly-report-subscriber", { name: "reports.subscriber.update", title: "Add a report subscriber", permissions: ["reports.write"], schema: { subscriber: "object" } }),
  action("unsubscribe-weekly-report-subscriber", { name: "reports.subscriber.unsubscribe", title: "Unsubscribe a report recipient", permissions: ["reports.write"], dangerous: true, schema: { id: "string", email: "string" } }),
  action("delete-weekly-report-subscriber", { name: "reports.subscriber.delete", title: "Delete a report recipient", permissions: ["reports.write"], dangerous: true, schema: { id: "string" } }),
  action("update-app-settings", { name: "maps.settings.update", title: "Update map settings", permissions: ["maps.settings.write"], dangerous: true, schema: { settings: "object" } }),
  action("approve-new", { name: "moderation.places.approve", title: "Approve a new place", permissions: ["moderation.places.write"], dangerous: true, schema: { rowId: "string" } }),
  action("reject-new", { name: "moderation.places.reject", title: "Reject a new place", permissions: ["moderation.places.write"], dangerous: true, schema: { rowId: "string", reason: "string" } }),
  action("approve-edit", { name: "moderation.places.edit.approve", title: "Approve a place edit", permissions: ["moderation.places.write"], dangerous: true, schema: { rowId: "string" } }),
  action("reject-edit", { name: "moderation.places.edit.reject", title: "Reject a place edit", permissions: ["moderation.places.write"], dangerous: true, schema: { rowId: "string", reason: "string" } }),
  action("update-boycott", { name: "maps.places.boycott.update", title: "Update place boycott status", permissions: ["maps.places.write"], schema: { placeId: "string", boycott: "boolean" } }),
  action("update-place-disabled", { name: "maps.places.disabled.update", title: "Update place visibility", permissions: ["maps.places.write"], dangerous: true, schema: { placeId: "string", disabled: "boolean" } }),
  action("update-place-coordinates", { name: "maps.places.coordinates.update", title: "Update place coordinates", permissions: ["maps.places.write"], schema: { placeId: "string", lat: "number", lng: "number" } }),
  action("refresh-place-info", { name: "maps.places.refresh", title: "Refresh place information", permissions: ["maps.places.write"], dangerous: true, schema: { placeId: "string" } }),
  action("delete-place", { name: "maps.places.delete", title: "Delete a place", permissions: ["maps.places.write"], dangerous: true, schema: { placeId: "string" } }),
  action("update-sponsor", { name: "maps.places.sponsor.update", title: "Update place sponsor", permissions: ["maps.places.write"], schema: { placeId: "string", sponsor: "object" } }),
  action("update-type-style", { name: "maps.styles.update", title: "Update a map style", permissions: ["maps.styles.write"], schema: { type: "object" } }),
  action("update-contact-replied", { name: "moderation.contacts.update", title: "Update contact status", permissions: ["moderation.contacts.write"], schema: { rowId: "string", replied: "boolean" } }),
  action("update-wish-approved", { name: "moderation.wishes.approval.update", title: "Update wish approval", permissions: ["moderation.wishes.write"], schema: { wishId: "string", value: "string" } }),
  action("update-wish-implemented", { name: "moderation.wishes.implementation.update", title: "Update wish implementation", permissions: ["moderation.wishes.write"], schema: { wishId: "string", value: "string" } }),
  action("approve-event", { name: "maps.events.approve", title: "Approve an event", permissions: ["maps.events.write"], dangerous: true, schema: { eventId: "string" } }),
  action("reject-event", { name: "maps.events.reject", title: "Reject an event", permissions: ["maps.events.write"], dangerous: true, schema: { eventId: "string", reason: "string" } }),
  action("delete-event", { name: "maps.events.delete", title: "Delete an event", permissions: ["maps.events.write"], dangerous: true, schema: { eventId: "string" } }),
  action("approve-event-edit", { name: "moderation.events.edit.approve", title: "Approve an event edit", permissions: ["moderation.events.write"], dangerous: true, schema: { rowId: "string" } }),
  action("reject-event-edit", { name: "moderation.events.edit.reject", title: "Reject an event edit", permissions: ["moderation.events.write"], dangerous: true, schema: { rowId: "string", reason: "string" } }),
  action("approve-review", { name: "moderation.reviews.approve", title: "Approve a review", permissions: ["moderation.reviews.write"], dangerous: true, schema: { rowIndex: "string" } }),
  action("reject-review", { name: "moderation.reviews.reject", title: "Reject a review", permissions: ["moderation.reviews.write"], dangerous: true, schema: { rowIndex: "string", reason: "string" } }),
  action("set-review-status", { name: "moderation.reviews.status.update", title: "Update review status", permissions: ["moderation.reviews.write"], dangerous: true, schema: { rowIndex: "string", status: "string", reason: "string" } }),
  action("set-review-image-status", { name: "moderation.reviews.image.status.update", title: "Update review image status", permissions: ["moderation.reviews.write"], dangerous: true, schema: { imageId: "string", status: "string" } }),
  action("delete-review", { name: "moderation.reviews.delete", title: "Delete a review", permissions: ["moderation.reviews.write"], dangerous: true, schema: { rowIndex: "string" } }),
  action("ban-reviewer", { name: "moderation.reviews.reviewer.ban", title: "Ban a reviewer", permissions: ["moderation.reviews.write"], dangerous: true, schema: { rowIndex: "string", reason: "string" } }),
  action("unban-reviewer", { name: "moderation.reviews.reviewer.unban", title: "Unban a reviewer", permissions: ["moderation.reviews.write"], dangerous: true, schema: { rowIndex: "string" } }),
  action("approve-eid", { name: "maps.eid.approve", title: "Approve Eid prayer information", permissions: ["maps.eid.write"], dangerous: true, schema: { rowId: "string" } }),
  action("reject-eid", { name: "maps.eid.reject", title: "Reject Eid prayer information", permissions: ["maps.eid.write"], dangerous: true, schema: { rowId: "string" } }),
  action("upsert-social-video", { name: "maps.social.update", title: "Create or update a social video", permissions: ["maps.social.write"], schema: { video: "object" } }),
  action("delete-social-video", { name: "maps.social.delete", title: "Delete a social video", permissions: ["maps.social.write"], dangerous: true, schema: { videoId: "string" } }),
  action("inbox-reply", { name: "inbox.reply", title: "Reply to an inbox thread", permissions: ["inbox.contact.write", "inbox.manarah.write"], dangerous: true }),
  action("inbox-compose", { name: "inbox.send", title: "Send a new inbox email", permissions: ["inbox.contact.write", "inbox.manarah.write"], dangerous: true }),
  action("inbox-status", { name: "inbox.status.update", title: "Update inbox status", permissions: ["inbox.contact.write", "inbox.manarah.write"], schema: { threadId: "string", status: "string" } }),
  action("inbox-note", { name: "inbox.note.add", title: "Add an internal inbox note", permissions: ["inbox.contact.write", "inbox.manarah.write"], schema: { threadId: "string", text: "string" } }),
  action("inbox-star", { name: "inbox.star.update", title: "Star an inbox thread", permissions: ["inbox.contact.write", "inbox.manarah.write"], schema: { threadId: "string", starred: "boolean" } }),
  action("inbox-snooze", { name: "inbox.snooze", title: "Snooze an inbox thread", permissions: ["inbox.contact.write", "inbox.manarah.write"], schema: { threadId: "string", until: "string" } }),
  action("inbox-assign", { name: "inbox.assign", title: "Assign an inbox thread", permissions: ["inbox.contact.write", "inbox.manarah.write"], schema: { threadId: "string", email: "string" } }),
  action("inbox-bulk", { name: "inbox.bulk_update", title: "Bulk update inbox threads", permissions: ["inbox.contact.write", "inbox.manarah.write"], dangerous: true, schema: { threadIds: "array" } }),
];

const websiteActions = [
  action("admin-team", { owner: "website", name: "website.team.list", title: "List website team", permissions: ["website.team.read"] }),
  action("admin-subscribers", { owner: "website", name: "website.subscribers.list", title: "List website subscribers", permissions: ["website.subscribers.read"] }),
  action("admin-content", { owner: "website", name: "website.content.read", title: "Read website content", permissions: ["website.content.read"] }),
  action("my-profile", { owner: "website", name: "website.profile.read", title: "Read personal website profile", permissions: ["dashboard.view"] }),
  action("save-person", { owner: "website", method: "POST", name: "website.team.update", title: "Create or update a website team member", permissions: ["website.team.write"], dangerous: true }),
  action("delete-person", { owner: "website", method: "POST", name: "website.team.delete", title: "Delete a website team member", permissions: ["website.team.write"], dangerous: true }),
  action("save-my-profile", { owner: "website", method: "POST", name: "website.profile.update", title: "Update personal website profile", permissions: ["dashboard.view"] }),
  action("unsubscribe", { owner: "website", method: "POST", name: "website.subscribers.unsubscribe", title: "Unsubscribe a website subscriber", permissions: ["website.subscribers.write"], dangerous: true }),
  action("delete-subscriber", { owner: "website", method: "POST", name: "website.subscribers.delete", title: "Delete a website subscriber", permissions: ["website.subscribers.write"], dangerous: true }),
  action("save-content", { owner: "website", method: "POST", name: "website.content.publish", title: "Publish website content", permissions: ["website.content.write"], dangerous: true }),
];

const formsMcpOnly = [
  action("forms-asset-upload", { owner: "forms", method: "POST", name: "forms.assets.upload", title: "Upload form media", permissions: ["forms.assets.write", "forms.write", "forms.create"], resourceAware: true, dangerous: true, mcpOnly: true, schema: { formId: "string", file: "string", contentType: "string", alt: "string" } }),
];

export const ADMIN_ACTIONS = [...mapsRead, ...mapsWrite, ...websiteActions, ...formsMcpOnly];

export function parsePermissions(raw, fallback = []) {
  try {
    const value = Array.isArray(raw) ? raw : JSON.parse(raw || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : fallback;
  } catch {
    return fallback;
  }
}
export function permissionMatches(granted, required) {
  if (!granted || !required) return false;
  if (granted === "*" || granted === required) return true;
  if (granted.endsWith(".*") && required.startsWith(granted.slice(0, -1))) return true;
  if (required.endsWith(".*") && granted.startsWith(required.slice(0, -1))) return true;
  const [area, resource, level] = required.split(".");
  if (level === "read" && granted === `${area}.${resource}.write`) return true;
  if (resource === "read" && granted === `${area}.write`) return true;
  if (resource === "read" && granted === `${area}.view`) return true;
  return false;
}
export function allowsPermissions(grants, required) {
  const values = [...EVERYONE_PERMISSIONS, ...parsePermissions(grants)];
  return (Array.isArray(required) ? required : [required]).some((needed) => values.some((grant) => permissionMatches(grant, needed)));
}

export function actionDescriptor(actionName, owner) {
  return ADMIN_ACTIONS.find((item) => item.action === actionName && (!owner || item.owner === owner)) || null;
}

export function actionDescriptors(owner) {
  return owner ? ADMIN_ACTIONS.filter((item) => item.owner === owner) : ADMIN_ACTIONS;
}

export function mcpScope(permission) {
  return `admin:${permission}`;
}

export function permissionFromMcpScope(scope) {
  const value = String(scope || "");
  return value.startsWith("admin:") ? value.slice(6) : "";
}

export function normalizeMcpGrants(scopes) {
  const values = Array.isArray(scopes) ? scopes : String(scopes || "").split(/\s+/);
  return [...new Set(values.map(permissionFromMcpScope).filter((value) => value === "*" || value === "admin:*" || MCP_PERMISSION_CATALOG.includes(value) || /^(maps|moderation|inbox|website|forms|links|reports|analytics|activity|access)\.[a-z_-]+\.\*$/.test(value)))];
}

export function mcpGrantAllows(grants, required) {
  const values = parsePermissions(grants).map((grant) => grant.startsWith("admin:") ? permissionFromMcpScope(grant) : grant);
  return values.some((grant) => grant === "*" || grant === "admin:*" || permissionMatches(grant, required));
}

export function accessibleMcpPermissions(accessPermissions) {
  return MCP_PERMISSION_CATALOG.filter((permission) => allowsPermissions(accessPermissions, permission));
}

export function descriptorIsAllowed(descriptor, accessPermissions, mcpGrants = null) {
  const current = descriptor.permissions.some((permission) => allowsPermissions(accessPermissions, permission));
  if (!current) return false;
  if (!mcpGrants) return true;
  return descriptor.permissions.some((permission) => mcpGrantAllows(mcpGrants, permission));
}

export function validatePermissionName(permission) {
  return permission === "*" || MCP_PERMISSION_CATALOG.includes(permission) || /^(maps|moderation|inbox|website|forms|links|reports|analytics|activity|access)\.[a-z_-]+\.\*$/.test(permission);
}
