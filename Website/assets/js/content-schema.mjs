// Public content fields shared by Website and Admin.
// Defaults mirror the authored website so the admin editor shows the current
// live copy even before the first content row is published to Sheets.
const text = (label, group, selector, maxLength = 500, defaultValue = "") => ({
  label,
  group,
  selector,
  type: "text",
  default: defaultValue,
  maxLength,
});
const toggle = (label, group, defaultValue = true) => ({ label, group, type: "boolean", default: defaultValue });
const cards = (label, group, itemFields, defaultValue, maxItems = 12, options = {}) => ({
  label,
  group,
  type: "cards",
  itemFields,
  default: defaultValue,
  maxItems,
  ...options,
});

const shortText = { type: "text", maxLength: 160 };
const bodyText = { type: "textarea", maxLength: 1200 };
const urlText = { type: "url", maxLength: 500 };
const linesText = { type: "lines", maxLength: 1200 };
const cardKindText = { type: "hidden", maxLength: 40 };
const flexibleCardFields = {
  kind: cardKindText,
  label: shortText,
  title: shortText,
  body: bodyText,
  items: linesText,
  url: urlText,
  linkLabel: shortText,
  imageUrl: urlText,
};
const flexibleCardTemplates = [
  { label: "Text card", description: "A title or label with paragraph copy.", value: { kind: "text", label: "New note", title: "", body: "", items: [], url: "", linkLabel: "", imageUrl: "" } },
  { label: "List card", description: "A compact card with bullet points.", value: { kind: "list", label: "New list", title: "", body: "", items: ["First item"], url: "", linkLabel: "", imageUrl: "" } },
  { label: "Action card", description: "A text card with a button link.", value: { kind: "action", label: "New action", title: "", body: "", items: [], url: "", linkLabel: "Learn more", imageUrl: "" } },
  { label: "Image card", description: "A visual card with optional text and link.", value: { kind: "image", label: "", title: "New feature", body: "", items: [], url: "", linkLabel: "", imageUrl: "" } },
];

export const WEBSITE_FIELDS = {
  heroTitle: text("Main headline", "Home", "#home h1", 160, "Community-powered support for Muslims in Finland."),
  heroSubtitle: text("Introduction", "Home", "#home .kc-hero-sub", 350, "Clear information, practical guidance, and compassionate connections."),
  aboutTitle: text("Section title", "About", "#about .kc-section-title", 100, "About"),
  aboutSubtitle: text("Short introduction", "About", "#about .kc-section-sub", 250, "Who we are · Why we exist · How we work"),
  aboutBody: text("About the collective", "About", "#about [data-variant=\"callout\"] p", 1500, "Karamah Collective supports Muslims in Finland through clear information, practical guidance, and compassionate connections. We focus on removing barriers to key life events and community needs, while cultivating spaces that honour, faith, and dignity."),
  aboutVisible: toggle("Show the About section", "About"),
  aboutPillars: cards("Pillar cards", "About", { label: shortText, body: bodyText }, [
    { label: "Divine Guidance", body: "Ensuring all activities align with Islamic principles." },
    { label: "Sustainable Growth", body: "Building systems that create lasting positive impact." },
    { label: "Eternal Perspective", body: "Focusing on long-term spiritual and community benefits." },
  ]),
  aboutCallouts: cards("Statement cards", "About", { body: bodyText }, [
    { body: "Providing Muslims in Finland with the knowledge, support, and tools to be informed, empowered, and connected in matters of faith and society." },
    { body: "We bridge the knowledge gap in the Muslim community with tangible solutions and outreach, while staying true to our Islamic values." },
  ]),
  aboutLists: cards("Flexible cards", "About", flexibleCardFields, [
    { kind: "list", label: "Focus areas", title: "", body: "", items: ["Multilingual guidance and education.", "Partnerships and community ecosystems across Finland.", "Facility and process mapping for key services.", "Advocacy and outreach with communities and authorities."], url: "", linkLabel: "", imageUrl: "" },
    { kind: "list", label: "How we work", title: "", body: "", items: ["Community engagement and listening first.", "Knowledge creation and open resource sharing.", "Collaboration and partnership over silos.", "Faith-driven initiatives anchored in dignity."], url: "", linkLabel: "", imageUrl: "" },
  ], 12, { rowMax: 2, rowHint: "Desktop: up to 2 cards per row. New cards fill the current row, then wrap to a new row. Phone: 1 per row.", cardTemplates: flexibleCardTemplates }),

  programsTitle: text("Section title", "Programs", "#programs .kc-section-title", 100, "Programs"),
  programsVisible: toggle("Show Programs", "Programs"),
  programCards: cards("Program cards", "Programs", { title: shortText, body: bodyText, icon: shortText, url: urlText, linkLabel: shortText }, [
    { title: "Janazah Initiative", body: "Faith-aligned end-of-life guidance and support, practical resources for families, and advocacy for essential infrastructure across Finland.", icon: "shield-check", url: "", linkLabel: "" },
    { title: "Halal Finder", body: "Explore Muslim-relevant services, mosques, and community resources across Finland on our interactive map.", icon: "map-pin", url: "https://maps.karamahcollective.com", linkLabel: "Open Halal Finder" },
    { title: "Fajr Journal Club", body: "Low-threshold Islamic book club for self-improvement, aimed at busy women; expanding to events, collaborations, and a subscription-based membership open to all.", icon: "book-open", url: "", linkLabel: "" },
    { title: "Neurodiverse Muslims", body: "Surveying, assessing, and showcasing neurodivergent voices through workshops, outreach, and resources.", icon: "brain", url: "", linkLabel: "" },
  ], 12, { rowMax: 2, rowHint: "Desktop/tablet: up to 2 program cards per row. New cards fill the current row, then wrap. Phone: 1 per row.", cardTemplates: [
    { label: "Program card", description: "Expandable program card with optional link.", value: { title: "New program", body: "", icon: "sparkles", url: "", linkLabel: "" } },
    { label: "Linked program", description: "Program card with a button link.", value: { title: "New linked program", body: "", icon: "external-link", url: "", linkLabel: "Open link" } },
  ] }),

  ticketsVisible: toggle("Show ticket popup and buy buttons", "Tickets", false),
  ticketTitle: text("Ticket title", "Tickets", null, 160, ""),
  ticketDescription: text("Ticket description", "Tickets", null, 1200, ""),
  ticketImageUrl: { ...text("Ticket image URL", "Tickets", null, 500, ""), type: "url" },
  ticketUrl: { ...text("Buy button link", "Tickets", null, 500, ""), type: "url" },
  ticketButtonLabel: text("Buy button label", "Tickets", null, 80, "Buy ticket"),
  ticketsTitle: { ...text("Section title", "Tickets", null, 100, "Tickets & Registrations"), legacy: true },
  ticketsSubtitle: { ...text("Short introduction", "Tickets", null, 250, "Upcoming paid events, registrations, and community fundraisers"), legacy: true },
  ticketCards: { ...cards("Ticket cards", "Tickets", {
    title: shortText,
    eyebrow: shortText,
    date: shortText,
    description: bodyText,
    imageUrl: urlText,
    ticketUrl: urlText,
    price: shortText,
    status: shortText,
    buttonLabel: shortText,
  }, [], 8, { rowMax: 2, rowHint: "Desktop/tablet: up to 2 ticket cards per row. A third ticket wraps to a new row. Phone: 1 per row.", cardTemplates: [
    { label: "Ticket card", description: "Image, description, price/status, and ticket button.", value: { title: "New ticketed event", eyebrow: "Event", date: "", description: "", imageUrl: "", ticketUrl: "", price: "", status: "Open", buttonLabel: "Get tickets" } },
    { label: "Registration card", description: "For free registrations or RSVP links.", value: { title: "New registration", eyebrow: "Registration", date: "", description: "", imageUrl: "", ticketUrl: "", price: "Free", status: "Open", buttonLabel: "Register" } },
  ] }), legacy: true },

  janazahTitle: text("Section title", "Janazah", "#janazah .kc-section-title", 100, "Janazah Initiative"),
  janazahSubtitle: text("Short introduction", "Janazah", "#janazah .kc-section-sub", 250, "Vision · Mission · Approach"),
  janazahVisible: toggle("Show the Janazah section", "Janazah"),
  janazahPillars: cards("Pillar cards", "Janazah", { label: shortText, body: bodyText }, [
    { label: "Vision", body: "Establish comprehensive and accessible Islamic end-of-life services across Finland." },
    { label: "Mission", body: "Support bereaved families, develop facilities, secure funding, and grow participation in Islamic burial services." },
    { label: "Approach", body: "Community research, knowledge development, resource creation, and infrastructure support." },
  ]),
  janazahCallouts: cards("Statement cards", "Janazah", { body: bodyText }, [
    { body: "Muslim population in Finland is estimated at 120,000+. Only 22,260 were registered as Muslims (2022). Many are therefore not registered as Muslims, which can affect how authorities process end-of-life burial arrangements." },
  ]),
  janazahLists: cards("Flexible cards", "Janazah", flexibleCardFields, [
    { kind: "list", label: "Why this work matters", title: "", body: "", items: ["Lack of centralised information", "Limited infrastructure (washing spaces, equipment, access)", "Economic burden: Death is an expensive affair in Finland"], url: "", linkLabel: "", imageUrl: "" },
    { kind: "list", label: "Success metrics", title: "", body: "", items: ["Families assisted & quality of service", "Community engagement & resource accessibility", "Infrastructure development progress"], url: "", linkLabel: "", imageUrl: "" },
    { kind: "list", label: "Short-term goals", title: "", body: "", items: ["Distribute comprehensive information packets", "Create educational material about Islamic burial practices", "Establish initial community partnerships"], url: "", linkLabel: "", imageUrl: "" },
    { kind: "list", label: "Long-term goals", title: "", body: "", items: ["Secure sustainable funding streams", "Develop dedicated Islamic burial infrastructure", "Build relationships with relevant authorities"], url: "", linkLabel: "", imageUrl: "" },
  ], 12, { rowMax: 2, rowHint: "Desktop: up to 2 cards per row. New cards fill the current row, then wrap to a new row. Phone: 1 per row.", cardTemplates: flexibleCardTemplates }),
  janazahChecklist: cards("What we aim to provide", "Janazah", { body: bodyText }, [
    { body: "Immediate next-steps checklist and coordination guidance" },
    { body: "Orientation to local processes in Finland (where to start, who to contact)" },
    { body: "Community connections for practical help and volunteering" },
    { body: "Advocacy and infrastructure work for long-term improvement" },
  ]),
  janazahDisclaimer: text("Service note", "Janazah", "#janazah .kc-disclaimer-text", 900, "We offer community information and coordination support. We do not provide legal services or official religious rulings. For medical emergencies, contact emergency services."),

  mapsTitle: text("Section title", "Maps", "#maps .kc-section-title", 100, "Halal Finder"),
  mapsSubtitle: text("Short introduction", "Maps", "#maps .kc-section-sub", 250, "Discover · Navigate · Connect"),
  mapsVisible: toggle("Show the Maps section", "Maps"),
  mapsPillars: cards("Feature cards", "Maps", { label: shortText, body: bodyText }, [
    { label: "Discover", body: "Find mosques, halal restaurants, grocery stores, and community services across Finland on an interactive map." },
    { label: "Navigate", body: "Get directions via public transit, walking, or cycling with real-time schedules and prayer time integration." },
    { label: "Connect", body: "Community-verified listings you can search, filter, and suggest edits to - built by and for the community." },
  ]),
  mapsCallouts: cards("Statement cards", "Maps", { body: bodyText }, [
    { body: "Halal Finder is our open, community-powered map covering the Helsinki metropolitan area and expanding across Finland. It helps Muslims and newcomers locate mosques, halal food, and essential services - all verified by the community." },
  ]),
  mapsLists: cards("Flexible cards", "Maps", flexibleCardFields, [
    { kind: "list", label: "What you can find", title: "", body: "", items: ["Mosques & prayer spaces with service details", "Halal restaurants, cafés, and grocery stores", "Islamic centres & community organisations", "Halal-friendly businesses and services"], url: "", linkLabel: "", imageUrl: "" },
    { kind: "list", label: "Features", title: "", body: "", items: ["Search & filter by category and tags", "Public transit & walking directions", "Daily prayer times for your location", "Suggest edits & add new places"], url: "", linkLabel: "", imageUrl: "" },
  ], 12, { rowMax: 2, rowHint: "Desktop: up to 2 cards per row. New cards fill the current row, then wrap to a new row. Phone: 1 per row.", cardTemplates: flexibleCardTemplates }),
  mapsChecklist: cards("How it works", "Maps", { body: bodyText }, [
    { body: "Browse the map or search for a specific place or category" },
    { body: "Filter by tags like daily prayers, Jummah, sisters section, and more" },
    { body: "Get directions with transit schedules or walking routes" },
    { body: "Suggest edits or new places via the built-in form" },
  ]),
  mapsDisclaimer: text("Map disclaimer", "Maps", "#maps .kc-disclaimer-text", 900, "Halal Finder relies on community contributions. Listings are informational and may not always be up to date. Always verify details directly with the business."),

  teamTitle: text("Section title", "Team", "#team .kc-section-title", 100, "Meet the Team"),
  teamVisible: toggle("Show the team", "Team"),
  contactTitle: text("Section title", "Contact", "#contact .kc-section-title", 100, "Contact Us"),
  contactIntro: text("Contact introduction", "Contact", "[data-site-contact-intro]", 500, ""),
  updatesEnabled: toggle("Offer the updates signup checkbox", "Contact"),
  noticeEnabled: toggle("Show announcement banner", "Announcement", false),
  noticeText: text("Announcement", "Announcement", "[data-site-notice]", 350, ""),
  pageTitle: { ...text("Browser tab title", "Search & sharing", "title", 100, "Karamah Collective") },
  pageDescription: { ...text("Search description", "Search & sharing", null, 300, "Community-powered support for Muslims in Finland — clear information, practical guidance, and compassionate connections.") },
  instagramUrl: { ...text("Instagram link", "Links", null, 500, "https://www.instagram.com/karamah.collective/"), type: "url" },
  linkedinUrl: { ...text("LinkedIn link", "Links", null, 500, "https://www.linkedin.com/company/karamah-collective/"), type: "url" },
};

for (let i = 1; i <= 4; i++) {
  WEBSITE_FIELDS[`program${i}Title`] = { ...text(`Program ${i} title`, "Programs", `[data-programcard]:nth-child(${i}) .kc-program-title`, 120), legacy: true };
  WEBSITE_FIELDS[`program${i}Body`] = { ...text(`Program ${i} description`, "Programs", `[data-programcard]:nth-child(${i}) .kc-program-body-text`, 1200), legacy: true };
}
for (const section of ["janazah", "maps"]) {
  for (let i = 1; i <= 3; i++) {
    WEBSITE_FIELDS[`${section}Pillar${i}`] = { ...text(`${section === "maps" ? "Map feature" : "Pillar"} ${i} description`, section === "maps" ? "Maps" : "Janazah", `#${section} .kc-grid-3 > :nth-child(${i}) .kc-pillar-text`, 1000), legacy: true };
  }
}

export const WEBSITE_DEFAULTS = Object.fromEntries(
  Object.entries(WEBSITE_FIELDS)
    .filter(([, field]) => !field.legacy)
    .map(([key, field]) => [key, cloneDefault(field.default)]),
);

function cloneDefault(value) {
  return Array.isArray(value) || (value && typeof value === "object")
    ? JSON.parse(JSON.stringify(value))
    : value;
}
function cleanString(value) {
  return String(value == null ? "" : value);
}
function normalizeLines(value) {
  if (Array.isArray(value)) return value.map(cleanString).map((v) => v.trim()).filter(Boolean);
  return cleanString(value).split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
}
function normalizeCard(field, value) {
  const item = {};
  for (const [key, spec] of Object.entries(field.itemFields)) {
    item[key] = spec.type === "lines" ? normalizeLines(value?.[key]) : cleanString(value?.[key]).trim();
  }
  return item;
}
function validateUrl(label, value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
  } catch {
    return `${label} must be a valid HTTPS address.`;
  }
  return null;
}
export function validateWebsiteContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return "Invalid website content.";
  for (const [key, value] of Object.entries(content)) {
    const field = Object.hasOwn(WEBSITE_FIELDS, key) ? WEBSITE_FIELDS[key] : null;
    if (!field || field.legacy) return `Unknown field: ${key}`;
    if (field.type === "boolean") {
      if (typeof value !== "boolean") return `${field.label} must be on or off.`;
    } else if (field.type === "cards") {
      if (!Array.isArray(value)) return `${field.label} must be a list.`;
      if (value.length > field.maxItems) return `${field.label} can have at most ${field.maxItems} cards.`;
      for (const item of value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) return `${field.label} contains an invalid card.`;
        for (const [itemKey, spec] of Object.entries(field.itemFields)) {
          const raw = item[itemKey];
          if (spec.type === "lines") {
            const lines = normalizeLines(raw);
            if (lines.join("\n").length > spec.maxLength) return `${field.label} has a list that is too long.`;
          } else {
            const textValue = raw == null ? "" : raw;
            if (typeof textValue !== "string" || textValue.length > spec.maxLength) return `${field.label} has text that is too long.`;
            const urlError = spec.type === "url" ? validateUrl(field.label, textValue) : null;
            if (urlError) return urlError;
          }
        }
      }
    } else {
      if (typeof value !== "string" || value.length > field.maxLength) return `${field.label} must be ${field.maxLength} characters or fewer.`;
      if (field.type === "url") {
        const urlError = validateUrl(field.label, value);
        if (urlError) return urlError;
      }
    }
  }
  return null;
}
export function publicWebsiteContent(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const content = cloneDefault(WEBSITE_DEFAULTS);
  for (const [key, field] of Object.entries(WEBSITE_FIELDS)) {
    if (field.legacy || !Object.hasOwn(input, key)) continue;
    if (!validateWebsiteContent({ [key]: input[key] })) {
      content[key] = field.type === "cards"
        ? input[key].map((item) => normalizeCard(field, item))
        : input[key];
    }
  }
  for (let i = 1; i <= 4; i++) {
    const card = content.programCards[i - 1];
    if (!card) continue;
    if (Object.hasOwn(input, `program${i}Title`) && typeof input[`program${i}Title`] === "string" && input[`program${i}Title`]) card.title = input[`program${i}Title`];
    if (Object.hasOwn(input, `program${i}Body`) && typeof input[`program${i}Body`] === "string" && input[`program${i}Body`]) card.body = input[`program${i}Body`];
  }
  for (const section of ["janazah", "maps"]) {
    const key = `${section}Pillars`;
    for (let i = 1; i <= 3; i++) {
      const legacyKey = `${section}Pillar${i}`;
      if (Object.hasOwn(input, legacyKey) && typeof input[legacyKey] === "string" && input[legacyKey] && content[key]?.[i - 1]) {
        content[key][i - 1].body = input[legacyKey];
      }
    }
  }
  if (!content.ticketUrl && Array.isArray(input.ticketCards)) {
    const ticket = input.ticketCards.find((item) => item && typeof item === "object" && String(item.ticketUrl || "").trim());
    if (ticket) {
      content.ticketsVisible = input.ticketsVisible !== false;
      content.ticketTitle = cleanString(ticket.title).trim();
      content.ticketDescription = cleanString(ticket.description).trim();
      content.ticketImageUrl = cleanString(ticket.imageUrl).trim();
      content.ticketUrl = cleanString(ticket.ticketUrl).trim();
      content.ticketButtonLabel = cleanString(ticket.buttonLabel).trim() || "Buy ticket";
    }
  }
  if (!content.ticketTitle && typeof input.ticketsTitle === "string") content.ticketTitle = input.ticketsTitle.trim();
  if (!content.ticketDescription && typeof input.ticketsSubtitle === "string") content.ticketDescription = input.ticketsSubtitle.trim();
  return content;
}
