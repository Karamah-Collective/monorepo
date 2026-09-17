export const NAV_GROUPS = [
  {
    label: "Workspace",
    links: [
      {
        to: "/",
        label: "Overview",
        end: true,
        icon: "dashboard",
        description: "Your map, community, and review queue at a glance.",
      },
      {
        to: "/places",
        label: "Places",
        icon: "pin",
        description: "Manage the places that bring your community together.",
      },
      {
        to: "/events",
        label: "Events",
        end: true,
        icon: "calendar",
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
    label: "Review & community",
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
      {
        to: "/contacts",
        label: "Inbox",
        icon: "mail",
        count: "unrepliedContacts",
        description: "Manage messages and keep conversations moving.",
      },
    ],
  },
  {
    label: "Website",
    links: [
      { to: "/website/content", label: "Website content", icon: "globe", description: "Publish website copy, announcements, links and visibility." },
      { to: "/website/team", label: "Team directory", icon: "building", description: "Manage the people introduced on the website." },
      { to: "/website/subscribers", label: "Update signups", icon: "mail", description: "Manage the private website updates list." },
    ],
  },
  {
    label: "Links",
    links: [
      { to: "/links", label: "Link hub", icon: "link", description: "Publish and style every Karamah link in one place." },
    ],
  },
  {
    label: "Manage",
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
        label: "App settings",
        icon: "settings",
        description: "Control the experience visitors see on the map.",
      },
      {
        to: "/log",
        label: "Activity log",
        icon: "list",
        description: "A shared record of changes made by your team.",
      },
    ],
  },
];
export const NAV_LINKS = NAV_GROUPS.flatMap((group) =>
  group.links.map((link) => ({ ...link, group: group.label })),
);
