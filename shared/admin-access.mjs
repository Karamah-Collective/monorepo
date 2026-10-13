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
  "operations.tasks.read",
  "operations.tasks.write",
  "operations.tasks.assign",
  "operations.projects.read",
  "operations.projects.write",
  "operations.projects.manage_members",
  "operations.tasks.create",
  "operations.tasks.delete",
  "operations.tasks.comment",
  "operations.tasks.relate",
  "operations.tasks.attach",
  "operations.tasks.bulk",
  "operations.milestones.read",
  "operations.milestones.write",
  "operations.google.connect",
  "operations.google.sync",
  "operations.approvals.read",
  "operations.approvals.resolve",
  "operations.history.read",
  "operations.rollback",
  "operations.settings.write",
];

export const ROLE_PERMISSIONS = {
  administrator: ["*"],
  // Projects are a shared Karamah surface. Project-level membership and
  // visibility still decide what a person can see or mutate inside a project;
  // these baseline grants only make the project workspace available to every
  // normal Admin role, including its MCP connection.
  "map-editor": ["maps.*", "operations.tasks.read", "operations.tasks.write", "operations.tasks.assign", "operations.projects.read", "operations.projects.write", "operations.tasks.create", "operations.tasks.comment", "operations.tasks.relate", "operations.tasks.attach", "operations.milestones.read", "operations.milestones.write"],
  "content-editor": ["website.*", "links.*", "forms.*", "reports.write", "operations.tasks.read", "operations.tasks.write", "operations.tasks.assign", "operations.projects.read", "operations.projects.write", "operations.tasks.create", "operations.tasks.comment", "operations.tasks.relate", "operations.tasks.attach", "operations.milestones.read", "operations.milestones.write"],
  moderator: ["moderation.*", "inbox.*", "operations.tasks.read", "operations.tasks.write", "operations.tasks.assign", "operations.projects.read", "operations.projects.write", "operations.tasks.create", "operations.tasks.comment", "operations.tasks.relate", "operations.tasks.attach", "operations.milestones.read", "operations.milestones.write"],
  viewer: ["operations.tasks.read", "operations.projects.read", "operations.projects.write", "operations.tasks.create", "operations.tasks.write", "operations.tasks.comment", "operations.tasks.relate", "operations.tasks.attach", "operations.milestones.read", "operations.milestones.write"],
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
  "operations.projects.read",
  "operations.projects.write",
  "operations.projects.manage_members",
  "operations.tasks.read",
  "operations.tasks.write",
  "operations.tasks.create",
  "operations.tasks.delete",
  "operations.tasks.comment",
  "operations.tasks.relate",
  "operations.tasks.attach",
  "operations.tasks.bulk",
  "operations.milestones.read",
  "operations.milestones.write",
  "operations.google.connect",
  "operations.google.sync",
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

const operationsRead = [
  action("operations-summary", { name: "workspace.operations.summary", title: "Read operations summary", permissions: ["operations.tasks.read"] }),
  action("operations-tasks-list", { name: "workspace.operations.tasks.list", title: "List legacy operations tasks", permissions: ["operations.tasks.read"] }),
  action("operations-task-get", { name: "workspace.operations.tasks.get", title: "Read a legacy operations task", permissions: ["operations.tasks.read"], schema: { id: "string" } }),
  action("operations-approvals-list", { name: "workspace.approvals.list", title: "List workspace approvals", permissions: ["operations.approvals.read"] }),
  action("operations-history-list", { name: "workspace.history.list", title: "List record history", permissions: ["operations.history.read"], schema: { domain: "string", recordType: "string", recordId: "string" } }),
  action("operations-history-diff", { name: "workspace.history.diff", title: "Compare record revisions", permissions: ["operations.history.read"], schema: { domain: "string", recordType: "string", recordId: "string", fromRevision: "number", toRevision: "number" } }),
  action("operations-settings-get", { name: "workspace.operations.settings", title: "Read operations settings", permissions: ["operations.tasks.read"] }),
];

const operationsWrite = [
  action("operations-task-create", { method: "POST", name: "workspace.operations.tasks.create", title: "Create a legacy operations task", permissions: ["operations.tasks.write"], schema: { title: "string", domain: "string", taskType: "string", sourceType: "string", sourceId: "string" } }),
  action("operations-task-update", { method: "POST", name: "workspace.operations.tasks.update", title: "Update a legacy operations task", permissions: ["operations.tasks.write"], schema: { id: "string", status: "string", priority: "string", dueAt: "string" } }),
  action("operations-task-assign", { method: "POST", name: "workspace.operations.tasks.assign", title: "Assign a legacy operations task", permissions: ["operations.tasks.assign"], schema: { id: "string", assigneeUid: "string", assigneeEmail: "string" } }),
  action("operations-tasks-bulk", { method: "POST", name: "workspace.operations.tasks.bulk_update", title: "Bulk update legacy operations tasks", permissions: ["operations.tasks.write"], dangerous: true, schema: { requestId: "string", taskIds: "array", changes: "object" } }),
  action("operations-approval-create", { method: "POST", name: "workspace.approvals.create", title: "Request workspace approval", permissions: ["operations.tasks.write"], dangerous: true, schema: { action: "string", targetType: "string", targetId: "string", payload: "object" } }),
  action("operations-approval-resolve", { method: "POST", name: "workspace.approvals.resolve", title: "Resolve workspace approval", permissions: ["operations.approvals.resolve"], dangerous: true, schema: { id: "string", decision: "string", reason: "string" } }),
  action("operations-history-record", { method: "POST", name: "workspace.history.record", title: "Record a revision", permissions: ["operations.history.read"], schema: { domain: "string", recordType: "string", recordId: "string", snapshot: "object" } }),
  action("operations-history-rollback", { method: "POST", name: "workspace.history.rollback", title: "Restore a historical revision", permissions: ["operations.rollback"], dangerous: true, schema: { domain: "string", recordType: "string", recordId: "string", revision: "number" } }),
  action("operations-settings-update", { method: "POST", name: "workspace.operations.settings.update", title: "Update operations settings", permissions: ["operations.settings.write"], dangerous: true, schema: { approvalPolicy: "object", draftRetentionDays: "number" } }),
];

const projectActions = [
  action("project-list", { name: "workspace.projects.list", title: "List projects", permissions: ["operations.projects.read", "operations.tasks.read"] }),
  action("project-search", { name: "workspace.search", title: "Search projects and tasks", permissions: ["operations.projects.read", "operations.tasks.read"], schema: { query: "string" } }),
  action("project-get", { name: "workspace.projects.get", title: "Read a project", permissions: ["operations.projects.read", "operations.tasks.read"], schema: { projectId: "string" } }),
  action("project-summary", { name: "workspace.projects.summary", title: "Read project summary", permissions: ["operations.projects.read", "operations.tasks.read"], schema: { projectId: "string" } }),
  action("project-create", { method: "POST", name: "workspace.projects.create", title: "Create a project", permissions: ["operations.projects.write", "operations.tasks.write"], schema: { name: "string", key: "string", description: "string" } }),
  action("project-update", { method: "POST", name: "workspace.projects.update", title: "Update a project", permissions: ["operations.projects.write", "operations.tasks.write"], dangerous: true, schema: { projectId: "string", expectedRevision: "number", name: "string", visibility: "string" } }),
  action("project-archive", { method: "POST", name: "workspace.projects.archive", title: "Archive a project", permissions: ["operations.projects.write", "operations.tasks.write"], dangerous: true, schema: { projectId: "string", expectedRevision: "number" } }),
  action("project-tasks-list", { name: "workspace.tasks.list", title: "List project tasks", permissions: ["operations.tasks.read"], schema: { projectId: "string", status: "string", assignee: "string" } }),
  action("project-task-get", { name: "workspace.tasks.get", title: "Read a project task", permissions: ["operations.tasks.read"], schema: { id: "string" } }),
  action("project-task-duplicate", { method: "POST", name: "workspace.tasks.duplicate", title: "Duplicate a project task", permissions: ["operations.tasks.create", "operations.tasks.write"], schema: { id: "string", title: "string" } }),
  action("project-tasks-create", { method: "POST", name: "workspace.tasks.create", title: "Create a project task", permissions: ["operations.tasks.create", "operations.tasks.write"], schema: { projectId: "string", title: "string", description: "string", priority: "string" } }),
  action("project-task-update", { method: "POST", name: "workspace.tasks.update", title: "Update a project task", permissions: ["operations.tasks.write"], schema: { id: "string", expectedRevision: "number", title: "string", statusCategory: "string", columnId: "string" } }),
  action("project-task-assign", { method: "POST", name: "workspace.tasks.assign", title: "Assign a project task", permissions: ["operations.tasks.assign"], schema: { id: "string", expectedRevision: "number", assigneeUid: "string", assigneeEmail: "string" } }),
  action("project-task-delete", { method: "POST", name: "workspace.tasks.delete", title: "Delete a project task", permissions: ["operations.tasks.delete", "operations.tasks.write"], dangerous: true, schema: { id: "string", expectedRevision: "number", reason: "string" } }),
  action("project-tasks-bulk", { method: "POST", name: "workspace.tasks.bulk_update", title: "Bulk update project tasks", permissions: ["operations.tasks.bulk", "operations.tasks.write"], dangerous: true, schema: { idempotencyKey: "string", taskIds: "array", changes: "object" } }),
  action("project-task-comment", { method: "POST", name: "workspace.tasks.comments.create", title: "Comment on a project task", permissions: ["operations.tasks.comment", "operations.tasks.write"], schema: { taskId: "string", body: "string" } }),
  action("project-task-comments-list", { name: "workspace.tasks.comments.list", title: "List task comments", permissions: ["operations.tasks.read"], schema: { taskId: "string" } }),
  action("project-task-comment-update", { method: "POST", name: "workspace.tasks.comments.update", title: "Edit a task comment", permissions: ["operations.tasks.comment", "operations.tasks.write"], schema: { id: "string", body: "string" } }),
  action("project-task-comment-delete", { method: "POST", name: "workspace.tasks.comments.delete", title: "Delete a task comment", permissions: ["operations.tasks.comment", "operations.tasks.write"], dangerous: true, schema: { id: "string" } }),
  action("project-milestones-list", { name: "workspace.milestones.list", title: "List project milestones", permissions: ["operations.milestones.read"], schema: { projectId: "string" } }),
  action("project-milestone-create", { method: "POST", name: "workspace.milestones.create", title: "Create a project milestone", permissions: ["operations.milestones.write"], schema: { projectId: "string", name: "string", dueAt: "string" } }),
  action("project-milestone-update", { method: "POST", name: "workspace.milestones.update", title: "Update a project milestone", permissions: ["operations.milestones.write"], schema: { id: "string", expectedRevision: "number", name: "string", dueAt: "string", status: "string" } }),
  action("project-milestone-delete", { method: "POST", name: "workspace.milestones.delete", title: "Delete a project milestone", permissions: ["operations.milestones.write"], dangerous: true, schema: { id: "string", expectedRevision: "number" } }),
  action("project-task-activity", { name: "workspace.tasks.activity.list", title: "Read project task activity", permissions: ["operations.history.read"], schema: { taskId: "string" } }),
  action("project-members-list", { name: "workspace.projects.members.list", title: "List project members", permissions: ["operations.projects.read"], schema: { projectId: "string" } }),
  action("project-columns-list", { name: "workspace.projects.columns.list", title: "List project columns", permissions: ["operations.projects.read"], schema: { projectId: "string" } }),
  action("project-relations-list", { name: "workspace.tasks.relations.list", title: "List task relations", permissions: ["operations.tasks.read"], schema: { taskId: "string" } }),
  action("project-task-links-list", { name: "workspace.tasks.links.list", title: "List task links", permissions: ["operations.tasks.read"], schema: { taskId: "string" } }),
  action("project-labels-list", { name: "workspace.tasks.labels.list", title: "List project labels", permissions: ["operations.tasks.read"], schema: { projectId: "string" } }),
  action("project-member-update", { method: "POST", name: "workspace.projects.members.update", title: "Update project membership", permissions: ["operations.projects.manage_members", "operations.projects.write"], dangerous: true, schema: { projectId: "string", member: "object" } }),
  action("project-member-remove", { method: "POST", name: "workspace.projects.members.remove", title: "Remove a project member", permissions: ["operations.projects.manage_members", "operations.projects.write"], dangerous: true, schema: { projectId: "string", email: "string" } }),
  action("project-column-create", { method: "POST", name: "workspace.projects.columns.create", title: "Create a project column", permissions: ["operations.projects.write", "operations.tasks.write"], schema: { projectId: "string", name: "string", statusCategory: "string" } }),
  action("project-column-update", { method: "POST", name: "workspace.projects.columns.update", title: "Update a project column", permissions: ["operations.projects.write", "operations.tasks.write"], schema: { id: "string", name: "string", position: "number" } }),
  action("project-column-delete", { method: "POST", name: "workspace.projects.columns.delete", title: "Delete a project column", permissions: ["operations.projects.write", "operations.tasks.write"], dangerous: true, schema: { id: "string" } }),
  action("project-relation-create", { method: "POST", name: "workspace.tasks.relations.create", title: "Create a task relation", permissions: ["operations.tasks.relate", "operations.tasks.write"], schema: { taskId: "string", relatedTaskId: "string", relationType: "string" } }),
  action("project-relation-delete", { method: "POST", name: "workspace.tasks.relations.delete", title: "Delete a task relation", permissions: ["operations.tasks.relate", "operations.tasks.write"], dangerous: true, schema: { taskId: "string", relatedTaskId: "string", relationType: "string" } }),
  action("project-label-save", { method: "POST", name: "workspace.tasks.labels.create", title: "Create or update a project label", permissions: ["operations.projects.write"], schema: { projectId: "string", id: "string", name: "string", color: "string" } }),
  action("project-label-attach", { method: "POST", name: "workspace.tasks.labels.update", title: "Attach a task label", permissions: ["operations.tasks.write"], schema: { taskId: "string", labelId: "string", name: "string", color: "string" } }),
  action("project-label-detach", { method: "POST", name: "workspace.tasks.labels.detach", title: "Detach a task label", permissions: ["operations.tasks.write"], schema: { taskId: "string", labelId: "string" } }),
  action("project-label-delete", { method: "POST", name: "workspace.tasks.labels.delete", title: "Delete a project label", permissions: ["operations.projects.write"], dangerous: true, schema: { projectId: "string", id: "string" } }),
  action("project-task-link-save", { method: "POST", name: "workspace.tasks.links.save", title: "Save a task link", permissions: ["operations.tasks.write"], schema: { taskId: "string", url: "string", title: "string" } }),
  action("project-task-link-delete", { method: "POST", name: "workspace.tasks.links.delete", title: "Delete a task link", permissions: ["operations.tasks.write"], dangerous: true, schema: { taskId: "string", id: "string" } }),
  action("project-saved-views-list", { name: "workspace.views.list", title: "List project views", permissions: ["operations.tasks.read"], schema: { projectId: "string" } }),
  action("project-saved-view-save", { method: "POST", name: "workspace.views.save", title: "Save a project view", permissions: ["operations.tasks.write"], schema: { projectId: "string", name: "string", viewType: "string", filters: "object" } }),
  action("project-saved-view-delete", { method: "POST", name: "workspace.views.delete", title: "Delete a saved project view", permissions: ["operations.tasks.write"], dangerous: true, schema: { id: "string" } }),
  action("project-task-time-list", { name: "workspace.tasks.time.list", title: "List task time entries", permissions: ["operations.tasks.read"], schema: { taskId: "string" } }),
  action("project-task-time-save", { method: "POST", name: "workspace.tasks.time.save", title: "Record task time", permissions: ["operations.tasks.write"], schema: { taskId: "string", durationMinutes: "number", note: "string" } }),
  action("project-task-attachments-list", { name: "workspace.tasks.attachments.list", title: "List task attachments", permissions: ["operations.tasks.read"], schema: { taskId: "string" } }),
  action("project-task-attachment-get", { name: "workspace.tasks.attachments.get", title: "Download a task attachment", permissions: ["operations.tasks.read"], schema: { id: "string" } }),
  action("project-task-attachment-upload", { method: "POST", name: "workspace.tasks.attachments.upload", title: "Upload a task attachment", permissions: ["operations.tasks.attach"], schema: { taskId: "string", fileName: "string", mimeType: "string", contentBase64: "string" } }),
  action("project-task-attachment-delete", { method: "POST", name: "workspace.tasks.attachments.delete", title: "Delete a task attachment", permissions: ["operations.tasks.attach"], dangerous: true, schema: { id: "string" } }),
  action("project-custom-fields-list", { name: "workspace.projects.custom_fields.list", title: "List project custom fields", permissions: ["operations.projects.read"], schema: { projectId: "string" } }),
  action("project-custom-field-save", { method: "POST", name: "workspace.projects.custom_fields.save", title: "Save a project custom field", permissions: ["operations.projects.write"], schema: { projectId: "string", name: "string", fieldType: "string", options: "array" } }),
  action("project-custom-field-delete", { method: "POST", name: "workspace.projects.custom_fields.delete", title: "Delete a project custom field", permissions: ["operations.projects.write"], dangerous: true, schema: { id: "string" } }),
  action("project-task-custom-value-save", { method: "POST", name: "workspace.tasks.custom_fields.update", title: "Update a task custom field", permissions: ["operations.tasks.write"], schema: { taskId: "string", fieldId: "string", value: "string" } }),
  action("project-task-watchers-list", { name: "workspace.tasks.watchers.list", title: "List task watchers", permissions: ["operations.tasks.read"], schema: { taskId: "string" } }),
  action("project-task-watcher-update", { method: "POST", name: "workspace.tasks.watchers.update", title: "Update task watchers", permissions: ["operations.tasks.write"], schema: { taskId: "string", email: "string", remove: "boolean" } }),
  action("project-notifications-list", { name: "workspace.notifications.list", title: "List project notifications", permissions: ["operations.tasks.read"] }),
  action("project-notifications-read", { method: "POST", name: "workspace.notifications.read", title: "Mark project notifications read", permissions: ["operations.tasks.read"], schema: { id: "string", all: "boolean" } }),
  action("project-task-templates-list", { name: "workspace.tasks.templates.list", title: "List task templates", permissions: ["operations.projects.read"], schema: { projectId: "string" } }),
  action("project-task-template-save", { method: "POST", name: "workspace.tasks.templates.save", title: "Save a task template", permissions: ["operations.projects.write"], schema: { projectId: "string", id: "string", name: "string", description: "string", payload: "object" } }),
  action("project-task-template-delete", { method: "POST", name: "workspace.tasks.templates.delete", title: "Delete a task template", permissions: ["operations.projects.write"], dangerous: true, schema: { id: "string" } }),
  action("project-task-from-template", { method: "POST", name: "workspace.tasks.templates.create_task", title: "Create a task from a template", permissions: ["operations.tasks.create", "operations.tasks.write"], schema: { templateId: "string", title: "string", assigneeEmail: "string", dueAt: "string" } }),
  action("project-webhooks-list", { name: "workspace.projects.webhooks.list", title: "List project webhooks", permissions: ["operations.projects.write"], schema: { projectId: "string" } }),
  action("project-webhook-save", { method: "POST", name: "workspace.projects.webhooks.save", title: "Save a project webhook", permissions: ["operations.projects.write"], dangerous: true, schema: { projectId: "string", id: "string", url: "string", secret: "string", eventTypes: "array", active: "boolean" } }),
  action("project-webhook-delete", { method: "POST", name: "workspace.projects.webhooks.delete", title: "Delete a project webhook", permissions: ["operations.projects.write"], dangerous: true, schema: { id: "string" } }),
];

const googleWorkspaceActions = [
  action("google-tasks-status", { name: "workspace.google_tasks.status", title: "Read Google Tasks connection", permissions: ["operations.google.connect"] }),
  action("google-tasks-oauth-start", { method: "POST", name: "workspace.google_tasks.connect", title: "Connect Google Tasks", permissions: ["operations.google.connect"], dangerous: true, schema: { returnTo: "string" } }),
  action("google-tasks-sync", { method: "POST", name: "workspace.google_tasks.sync", title: "Sync Google Tasks", permissions: ["operations.google.sync"], dangerous: true, schema: { ownerUid: "string" } }),
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

export const ADMIN_ACTIONS = [...mapsRead, ...mapsWrite, ...operationsRead, ...operationsWrite, ...projectActions, ...googleWorkspaceActions, ...websiteActions, ...formsMcpOnly];

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
  return [...new Set(values.map(permissionFromMcpScope).filter((value) => value === "*" || value === "admin:*" || MCP_PERMISSION_CATALOG.includes(value) || /^(maps|moderation|inbox|website|forms|links|reports|analytics|activity|access|operations)\.[a-z_-]+(?:\.[a-z_-]+)?\.\*$/.test(value)))];
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
  return permission === "*" || MCP_PERMISSION_CATALOG.includes(permission) || /^(maps|moderation|inbox|website|forms|links|reports|analytics|activity|access|operations)\.[a-z_-]+(?:\.[a-z_-]+)?\.\*$/.test(permission);
}
