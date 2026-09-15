import { readFileSync } from "node:fs";
// The public app ships native ES modules in a package without type:module.
// Load its schema as modules without changing that package's runtime behavior.
const controlsSource = readFileSync(
  new URL("../../Maps/src/app-controls-schema.js", import.meta.url),
  "utf8",
);
const controlsUrl = `data:text/javascript;base64,${Buffer.from(controlsSource).toString("base64")}`;
const settingsSource = readFileSync(
  new URL("../../Maps/src/app-settings-schema.js", import.meta.url),
  "utf8",
).replace('"./app-controls-schema.js"', JSON.stringify(controlsUrl));
const { DEFAULT_APP_SETTINGS } = await import(
  `data:text/javascript;base64,${Buffer.from(settingsSource).toString("base64")}`
);
export const stats = {
  pendingNew: 7,
  pendingEdits: 4,
  pendingEvents: 3,
  pendingEventEdits: 1,
  unrepliedContacts: 5,
  pendingWishes: 2,
  totalPlaces: 128,
  totalWishes: 19,
  byType: { space: 36, restaurant: 68, service: 24 },
};
export const places = Array.from({ length: 31 }, (_, i) => ({
  id: `place-${i}`,
  name: i === 0 ? "Hakaniemi Market" : `Community place ${i + 1}`,
  type: ["restaurant", "space", "service"][i % 3],
  city: i % 2 ? "Espoo" : "Helsinki",
  address: `${i + 2} Siltasaarenkatu`,
  boycott: false,
  disabled: false,
}));
export const responses = {
  "admin-stats": stats,
  "admin-places": places,
  "admin-log": {
    entries: [
      {
        id: 1,
        createdAt: "2026-09-15T10:42:00Z",
        actorName: "Amina Hassan",
        actorEmail: "amina@example.test",
        action: "approve-new",
        targetId: "place-0",
        success: true,
      },
      {
        id: 2,
        createdAt: "2026-09-15T09:12:00Z",
        actorName: "Omar Salonen",
        actorEmail: "omar@example.test",
        action: "update-sponsor",
        targetId: "place-1",
        success: true,
      },
    ],
  },
  "pending-new": [
    {
      rowId: "1",
      timestamp: "2026-09-15",
      name: "Hakaniemi Market",
      type: "restaurant",
      address: "Helsinki",
      tags: "",
      notes: "New community submission",
    },
  ],
  "admin-type-styles": {
    types: [
      {
        category: "space_space_type",
        tagId: "mosque",
        label: "Mosque",
        icon: "pin",
        color: "#24745c",
      },
    ],
  },
  "admin-app-settings": { revision: 1, settings: DEFAULT_APP_SETTINGS },
  "admin-contact": { unreplied: [], replied: [] },
};

// Browser-only module interception: production authentication and API code stay intact.
export async function mockAdmin(page, overrides = {}, signedIn = true) {
  await page.route("**/src/auth/AuthContext.jsx*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    export const AuthProvider = ({children}) => children;
    export const useAuth = () => ({ user: ${signedIn ? JSON.stringify({ displayName: "Amina Hassan", email: "amina@example.test", emailVerified: true }) : "null"}, loading: false, signOut: async () => {}, signIn: async () => {}, signUp: async () => {} });
  `,
    }),
  );
  await page.route("**/src/api/client.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    const responses = ${JSON.stringify({ ...responses, ...overrides })};
    export async function apiGet(action) { return responses[action] ?? []; }
    export async function apiPost(action, body) { window.__lastMutation = {action, body}; if (action === 'update-app-settings') return {revision: 2, settings: body.settings}; return {success: true}; }
    export async function logAuthEvent() {}
  `,
    }),
  );
}
