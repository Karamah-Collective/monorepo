export const EVERYONE_PERMISSIONS = [
  "dashboard.view",
  "maps.places.read",
  "links.qr",
  "forms.create",
  "access.view",
  "access.request",
];

export function can(access, permission) {
  const permissions = [...EVERYONE_PERMISSIONS, ...(access?.permissions || [])];
  const [area, resource, level] = permission.split(".");
  const legacy = level && permissions.includes(`${area}.${resource}`);
  const writeIncludesRead = (level === "read" && permissions.includes(`${area}.${resource}.write`)) || (resource === "read" && permissions.includes(`${area}.write`));
  const viewAlias = resource === "read" && permissions.includes(`${area}.view`);
  return permissions.includes("*") || permissions.includes(permission) || legacy || writeIncludesRead || viewAlias || permissions.includes(`${area}.*`);
}

export function canInbox(access, level = "read", mailbox = "") {
  const permissions = [...EVERYONE_PERMISSIONS, ...(access?.permissions || [])];
  if (permissions.includes("*") || permissions.includes("inbox.*")) return true;
  const key = String(mailbox || "").split("@")[0].toLowerCase();
  if (key && (permissions.includes(`inbox.${key}.${level}`) || (level === "read" && permissions.includes(`inbox.${key}.write`)))) return true;
  if (permissions.includes("moderation.contacts.*") || permissions.includes(`moderation.contacts.${level}`) || (level === "read" && permissions.includes("moderation.contacts.write"))) return true;
  return !key && ["contact", "manarah"].some(item => permissions.includes(`inbox.${item}.${level}`) || (level === "read" && permissions.includes(`inbox.${item}.write`)));
}

export function canRoute(access, path) {
  return path === "/contacts" ? canInbox(access, "read") : can(access, ROUTE_PERMISSION[path] || "read");
}

export const ROUTE_PERMISSION = {
  "/": "dashboard.view", "/places": "maps.places.read", "/events": "maps.events.read", "/eid": "maps.eid.read", "/social-videos": "maps.social.read", "/type-styles": "maps.styles.read", "/app-settings": "maps.settings.read",
  "/submissions/new": "moderation.places.read", "/submissions/edits": "moderation.places.read", "/events/edits": "moderation.events.read", "/reviews": "moderation.reviews.read", "/wishes": "moderation.wishes.read", "/contacts": "inbox.read",
  "/website/content": "website.content.read", "/website/team": "website.team.read", "/website/subscribers": "website.subscribers.read", "/links": "links.read", "/links/qr": "links.qr", "/forms": "forms.create", "/log": "activity.read", "/analytics": "analytics.read", "/workspace/preferences": "dashboard.view", "/workspace/weekly-report": "reports.read", "/workspace/access": "access.view",
};
