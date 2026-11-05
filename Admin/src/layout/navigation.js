import { OPERATIONS_UI_ENABLED, PROJECTS_UI_ENABLED } from "../config/features.js";

export const NAV_GROUPS = [
  {
    label: "",
    links: [
      ...(OPERATIONS_UI_ENABLED ? [
        { to: "/workspace/queue", label: "Work queue", icon: "list", permission: "operations.tasks.read", description: "Assign, prioritize, and move work across the workspace." },
        { to: "/workspace/history", label: "History & rollback", icon: "clock", permission: "operations.history.read", description: "Inspect safe revision snapshots and restore a prior version as a draft." },
      ] : []),
      ...(PROJECTS_UI_ENABLED ? [{ to: "/workspace/projects", label: "Projects", icon: "list", permission: "operations.projects.read", compact: true, description: "Plan and deliver work across focused projects." }] : []),
      {
        to: "/",
        label: "Overview",
        end: true,
        icon: "dashboard",
        compact: true,
        description: "A concise view across Maps, Forms, and system health.",
      },
    ],
  },
  {
    label: "Maps",
    links: [
      {
        to: "/places",
        label: "Places",
        icon: "pin",
        compact: true,
        description: "Manage the places that bring your community together.",
      },
      {
        to: "/events",
        label: "Events",
        end: true,
        icon: "calendar",
        compact: true,
        description: "Review and manage events across the map.",
      },
      {
        to: "/eid",
        label: "Eid prayers",
        icon: "moon",
        description:
          "Keep community prayer information accurate and up to date.",
      },
    ],
  },
  {
    label: "Maps / community review",
    links: [
      {
        to: "/submissions/new",
        label: "New places",
        icon: "plusCircle",
        count: "pendingNew",
        description: "Review places submitted by the community.",
      },
      {
        to: "/submissions/edits",
        label: "Place edits",
        icon: "pencil",
        count: "pendingEdits",
        description: "Check proposed changes before they reach the map.",
      },
      {
        to: "/events/edits",
        label: "Event edits",
        icon: "calendar",
        count: "pendingEventEdits",
        description: "Review changes to community events.",
      },
      {
        to: "/reviews",
        label: "Reviews",
        icon: "star",
        description: "Moderate community feedback and place reviews.",
      },
      {
        to: "/wishes",
        label: "Wishes",
        icon: "heart",
        count: "pendingWishes",
        description: "Listen to ideas and track what the community needs.",
      },
    ],
  },
  {
    label: "Communications",
    links: [{ to: "/contacts", label: "Email", icon: "mail", count: "unrepliedContacts", compact: true, description: "One shared inbox for Website, Maps, Forms, and Links." }],
  },
  {
    label: "Maps / configuration",
    links: [
      {
        to: "/social-videos",
        label: "Social videos",
        icon: "play",
        description: "Curate the videos connected to your places.",
      },
      {
        to: "/type-styles",
        label: "Map appearance",
        icon: "palette",
        description: "Give every kind of place a recognizable marker.",
      },
      {
        to: "/app-settings",
        label: "Map settings",
        icon: "settings",
        description: "Control the experience visitors see on the map.",
      },
    ],
  },
  {
    label: "Website",
    links: [
      { to: "/website/content", label: "Website content", icon: "globe", compact: true, description: "Publish website copy, announcements, links and visibility." },
      { to: "/website/team", label: "Team directory", icon: "building", description: "Manage the people introduced on the website." },
      { to: "/website/subscribers", label: "Update signups", icon: "mail", description: "Manage the private website updates list." },
    ],
  },
  {
    label: "Links",
    links: [
      { to: "/links", label: "Link hub", icon: "link", compact: true, description: "Publish and style every Karamah link in one place.", end: true },
      { to: "/links/qr", label: "QR generator", icon: "qr", description: "Create and scan-test Karamah-styled QR links." },
    ],
  },
  {
    label: "Forms",
    links: [
      { to: "/forms", label: "Forms", icon: "forms", compact: true, description: "Build, publish, and review community forms." },
    ],
  },
  {
    label: "Workspace",
    links: [
      {
        to: "/log",
        label: "Activity log",
        icon: "list",
        compact: true,
        description: "A shared record of changes made by your team.",
      },
      {
        to: "/workspace/preferences",
        label: "Admin preferences",
        icon: "settings",
        description: "Set your sidebar, table, and motion preferences for this browser.",
      },
      {
        to: "/workspace/weekly-report",
        label: "Weekly report",
        icon: "mail",
        description: "Manage who receives the Manarah analytics digest.",
      },
      { to: "/analytics", label: "Analytics", icon: "dashboard", permission: "analytics.read", description: "Review Manarah product activity and traffic totals." },
      { to: "/workspace/access", label: "Roles & access", icon: "shield", permission: "dashboard.view", compact: true, description: "Manage your profile and workspace roles." },
      { to: "/workspace/mcp", label: "MCP access", icon: "key", permission: "dashboard.view", description: "Authorize and revoke role-scoped MCP connections." },
    ],
  },
];
export const PERSONAL_LINK = { to: "/workspace/profile", label: "Your profile", icon: "profile", group: "Workspace", description: "Manage your details, public profile, and account security." };
export const NAV_LINKS = NAV_GROUPS.flatMap((group) =>
  group.links.map((link) => ({ ...link, group: group.label })),
).concat(PERSONAL_LINK);
