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
  lat: 60.1699 + i * 0.001,
  lng: 24.9384 + i * 0.001,
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
  "admin-link-hub": {
    settings: {
      id: 1,
      profile_name: "Karamah Collective",
      profile_bio: "",
      avatar_url: "",
      page_kicker: "",
      links_kicker: "",
      links_heading: "",
      links_description: "",
      socials_kicker: "",
      socials_heading: "",
      socials_description: "",
      count_suffix: "",
      featured_label: "Featured",
      share_page_label: "Share this page",
      share_link_label: "Share",
      copy_success_text: "Link copied",
      footer_text: "",
      footer_link_label: "",
      footer_link_url: "https://karamahcollective.com",
      empty_title: "Nothing published yet",
      empty_description: "",
      error_title: "Links are temporarily unavailable",
      error_description: "",
      retry_label: "Try again",
      seo_title: "Karamah Collective — Links",
      seo_description: "Karamah Collective links.",
      background_color: "#f1efe7",
      surface_color: "#fffdf8",
      text_color: "#202923",
      accent_color: "#2b745c",
      theme: "light",
      card_style: "soft",
      corner_style: "rounded",
      layout: "stack",
      background_style: "paper",
      image_style: "cover",
      max_width: 680,
      show_descriptions: 1,
      show_domains: 1,
      show_share: 1,
      revision: 3,
    },
    links: [
      {
        id: "maps",
        link_kind: "link",
        social_platform: "",
        social_handle: "",
        url: "https://maps.karamahcollective.com",
        title: "Find halal places across Finland",
        description: "Mosques, restaurants, services and community spaces mapped with care.",
        image_url: "",
        metadata_image_url: "https://picsum.photos/seed/karamah-map-finland/800/600",
        custom_site_name: "",
        site_name: "Manarah",
        custom_favicon_url: "",
        favicon_url: "",
        metadata_status: "ready",
        active: 1,
        featured: 1,
        sort_order: 10,
        clicks: 47,
        revision: 2,
      },
      {
        id: "collective",
        link_kind: "link",
        social_platform: "",
        social_handle: "",
        url: "https://karamahcollective.com",
        title: "Karamah Collective",
        description: "Community work, current programs and ways to take part.",
        image_url: "",
        metadata_image_url: "https://picsum.photos/seed/karamah-collective/800/600",
        custom_site_name: "",
        site_name: "Karamah Collective",
        custom_favicon_url: "",
        favicon_url: "",
        metadata_status: "ready",
        active: 1,
        featured: 0,
        sort_order: 20,
        clicks: 23,
        revision: 1,
      },
    ],
  },
  "admin-events": [
    {
      eventId: "event-custom-1",
      title: "Community Dinner",
      eventDate: "2026-10-12",
      eventTime: "18:00",
      status: "pending",
      placeId: "",
      placeName: "",
      locationName: "Harbour Hall",
      locationAddress: "1 Seaside Way, Helsinki",
      locationLat: 60.166,
      locationLng: 24.952,
      locationGmapsLink: "https://maps.google.com/?q=60.166,24.952",
    },
  ],
  "admin-contact": { unreplied: [], replied: [] },
  "admin-reviews": [
    {
      rowIndex: "42",
      placeId: "place-0",
      placeName: "Hakaniemi Market",
      rating: 4,
      text: "A useful community review with enough detail.",
      timestamp: "2026-09-20T12:00:00Z",
      status: "yes",
      emailHash: "abcd1234…",
      banned: false,
      images: [],
    },
  ],
};

// Browser-only module interception: production authentication and API code stay intact.
export async function mockAdmin(page, overrides = {}, signedIn = true, clientError = "") {
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
    export async function apiGet(action) { ${clientError ? `throw new Error(${JSON.stringify(clientError)});` : ""} return responses[action] ?? []; }
    export async function apiGetBlob() { return new Blob(); }
    export async function apiPost(action, body) { window.__lastMutation = {action, body}; if (action === 'update-app-settings') return {revision: 2, settings: body.settings}; if (action === 'save-link-hub-settings') return {success: true, settings: {...body.settings, revision: body.revision + 1}}; if (action === 'save-link-hub-link') return {success: true, link: {...body.link, id: body.link.id || 'new-link', metadata_status: 'ready'}}; return {success: true}; }
    export async function logAuthEvent() {}
  `,
    }),
  );
}
