export function can(access, permission) {
  const permissions = access?.permissions || [];
  return permissions.includes("*") || permissions.includes(permission) || permissions.includes(`${permission.split(".")[0]}.*`);
}

export const ROUTE_PERMISSION = {
  "/": "dashboard.view", "/places": "maps.places", "/events": "maps.events", "/eid": "maps.eid", "/social-videos": "maps.social", "/type-styles": "maps.styles", "/app-settings": "maps.settings",
  "/submissions/new": "moderation.places", "/submissions/edits": "moderation.places", "/events/edits": "moderation.events", "/reviews": "moderation.reviews", "/wishes": "moderation.wishes", "/contacts": "moderation.contacts",
  "/website/content": "website.content", "/website/team": "website.team", "/website/subscribers": "website.subscribers", "/links": "links.manage", "/forms": "forms.manage", "/log": "activity.view", "/workspace/preferences": "dashboard.view", "/workspace/weekly-report": "reports.manage", "/workspace/access": "dashboard.view",
};
