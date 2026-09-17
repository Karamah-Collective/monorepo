# Karamah monorepo design system

This is the cross-application visual and interaction reference for Karamah.
It complements the detailed Maps reference in
`Maps/docs/DESIGN_SYSTEM.md`, the operational Admin direction in
`Admin/DESIGN.md`, and the engineering constraints in
`.claude/agents/the-architect.md`.

Use this file before designing a new app. Karamah products belong to one
family, but they are not identical skins. Each app expresses a different part
of the brand according to its purpose.

## 1. Brand idea

Karamah interfaces should feel like **premium utility**: calm, capable,
community-minded software with strong editorial judgment. The work should be
compact enough for daily use and spacious enough to feel deliberate.

The shared impression is:

- warm rather than clinical;
- restrained rather than timid;
- structured rather than boxed-in;
- tactile rather than glossy;
- human rather than playful or corporate;
- beautiful because hierarchy and spacing are exact, not because decoration
  has been added everywhere.

Avoid generic SaaS purple, neon glows, heavy glass, harsh shadows, giant hero
copy, equal three-card rows, ornamental dashboards, and components that look
like unmodified framework defaults.

## 2. Family rules shared by every app

### Color

The family is built on warm mineral neutrals and one muted green accent.

| Role | Typical value | Meaning |
| --- | --- | --- |
| Primary ink | `#202923` / `#262d2a` | Charcoal with a green undertone |
| Canvas | `#f5f7f4` / `#f7f7f5` / warm cream | Quiet working or editorial ground |
| Surface | white or warm white | Primary readable surface |
| Accent | `#2b745c` or Maps `#08705b` | Active, selected, linked, confirmed |
| Muted text | mineral grey-green | Supporting content |
| Danger | muted brick red | Destructive or failed state only |
| Warning | ochre | Needs attention, not general decoration |

Use a maximum of one brand accent per interface. Status colors may appear only
when they communicate status. Never mix warm and cool neutral ramps within one
app.

### Typography

- Product and administration UI: **Geist** with **Geist Mono** for numbers,
  codes, IDs, and compact metadata.
- Maps: **Plus Jakarta Sans**, matching its existing navigation and sheet
  system.
- Public editorial experiences: **General Sans** or the Website's existing
  brand typography.
- Do not introduce Inter, Arial, Roboto, Open Sans, or a random display face.
- Headlines use tight tracking and compact line-height. Body copy stays
  comfortably readable and normally below 65 characters per line.
- Hierarchy comes from spacing, weight, and tone before size. Do not make a
  heading enormous to compensate for a weak composition.

### Shape

- Text buttons are pills where the product already uses pill controls.
- Fields use medium rounded corners, not pill shapes.
- Content surfaces use concentric radii: an outer shell or boundary and a
  slightly smaller inner core.
- Do not give every content group a card. Prefer dividers and negative space
  when elevation does not communicate anything.

### Depth

- Shadows are broad, tinted, and faint.
- Borders are low-contrast semantic boundaries, never generic dark grey rules.
- A nested surface may use an outer 3–6 px shell plus an inner core for tactile
  depth. Reserve this for primary public cards, previews, or floating objects.
- Blur is limited to fixed or sticky overlays. Never blur a scrolling list.

### Icons

- React apps use `@phosphor-icons/react` with regular/light weight.
- Static apps use precise inline SVGs with approximately 1.5 px strokes.
- Icons are either icon-only controls or structural indicators. Avoid mixing an
  icon and label in every button.
- Never use emoji as interface imagery.

### Motion

- Use `cubic-bezier(.16,1,.3,1)` or the app's named motion token.
- Animate opacity and transform only.
- Entry motion is one brief, coordinated reveal with a small stagger.
- Hover feedback is primarily color, opacity, surface, and icon movement.
- Respect `prefers-reduced-motion` and remove ornamental movement.
- Continuous animation must carry meaning and remain isolated; most Karamah
  utility screens should not use it.

### Interaction states

Every reusable view needs:

- a skeleton that matches the final layout;
- an intentional empty state with a next action;
- an inline error state with recovery;
- visible keyboard focus;
- disabled and pending states that preserve layout;
- success feedback through a toast or local state message.

### Responsive behavior

- Design desktop, tablet, and phone as distinct compositions.
- Asymmetric desktop layouts collapse to one column below 768 px.
- Never use `100vh`; use `100dvh` when viewport height is required.
- Avoid horizontal overflow at 360 px.
- Important phone controls remain reachable without hover.
- Touch targets should normally be at least 40–44 px unless an established app
  intentionally uses a denser pattern.

## 3. Maps application

### Purpose and tone

Maps is a spatial utility. The map owns the canvas; interface elements float
only where they help the next task. It is the densest Karamah application.

### Visual language

- Plus Jakarta Sans.
- Neutral map canvas, white sheets, deep ink, teal accent.
- Floating pills, bottom sheets, compact lists, asymmetric puck markers.
- Flat and modern: no broad glass fields, no HUD aesthetic, no ornamental
  panels competing with map content.
- One primary action per sheet or card.

### Composition

- Desktop uses map-anchored floating controls and bounded side content.
- Phone uses coordinated top, right, and bottom chrome zones plus draggable
  sheets.
- Opening content must preserve visible map context and point focus.

### Source of truth

- Tokens and templates: `Maps/src/styles/design-tokens.css`
- Layout and exceptions: `Maps/src/styles/styles.css`
- Detailed documentation: `Maps/docs/DESIGN_SYSTEM.md`
- Preferences and accepted patterns: `Maps/docs/PREFERENCE_LOG.md`

Never bypass Maps tokens with one-off component values. Add a token and
document it first.

## 4. Website application

### Purpose and tone

The Website is Karamah's expressive editorial presence. It may use more
whitespace, storytelling, imagery, and cinematic reveals than the product
interfaces while staying readable and sincere.

### Visual language

- Warm cream and deep blue-green canvases.
- Brand green plus restrained gold as an editorial highlight.
- Large but controlled headline typography, section labels, quotes, and
  staggered content.
- Aurora imagery and atmospheric depth may appear in the hero; inner sections
  return to calmer surfaces.
- Content cards support stories and programs, not generic feature grids.

### Composition

- Editorial sections alternate density and rhythm.
- Navigation is a recognizable site header, not a dashboard sidebar.
- Hero content remains asymmetric and preserves the Karamah logo as a focal
  artifact.
- Mobile keeps the reading order and removes spatial tricks that create overlap.

### Source of truth

- Base and tokens: `Website/assets/css/base.css`
- Current composition: `Website/assets/css/styles-new.css`
- Authored content styling: `Website/assets/css/site-content.css`
- Dark palette: `Website/assets/css/dark-mode-new.css`

## 5. Admin application

### Purpose and tone

Admin is an internal operations workspace. It is compact, highly legible, and
quiet. Beauty comes from excellent information architecture and exact control
states, not marketing-style decoration.

### Visual language

- Geist plus Geist Mono.
- Charcoal navigation rail, mineral working canvas, white editor surfaces.
- Muted green selection and action color.
- 7–14 px radii and almost imperceptible shadows.
- Dense collection rows separated by rules; cards are reserved for distinct
  work areas or previews.

### Composition

- Desktop: grouped sidebar plus a wide work surface.
- Tablet: icon rail by default with explicit expansion.
- Phone: one drawer, one backdrop, focus containment, no duplicate navigation.
- Page header communicates the task and holds only the highest-priority action.
- Editors use task tabs or local section navigation when many settings exist.
- Collections put search, filters, state, and actions near the records.
- A sticky save bar communicates dirty, pending, conflict, and saved states.
- Public-content editors pair controls with a live preview where space permits.

### Source of truth

- Direction: `Admin/DESIGN.md`
- Shared tokens: `Admin/src/styles/tokens.css`
- Shell: `Admin/src/styles/layout.css`
- Editors: `Admin/src/styles/editors.css`
- Tables and cells: `Admin/src/styles/table.css`, `cells.css`

Reuse Admin's `pp-*` fields, buttons, badges, errors, toasts, and query states
before introducing a page-specific primitive.

## 6. Links application

### Purpose and tone

Links is a compact public directory where destinations are always the primary
content. It uses a centered identity introduction followed immediately by a
calm, highly scannable link stack. It should feel personal and recognizably
Karamah without turning the directory into an editorial landing page.

### Visual language

- General Sans.
- Warm paper canvas, warm-white cards, charcoal copy, muted green accent.
- Fine grain or soft color mist as optional atmosphere.
- A full warm canvas gives the directory breathing room; the content remains
  deliberately narrow so the page still feels composed with only a few links.
- Social profiles form a separate compact horizontal strip between identity
  and directory. They use recognizable brand icons plus a platform or handle,
  never full destination-card imagery.
- Compact horizontal destination cards with genuine site imagery and optional
  metadata.
- Featured links use a restrained accent edge and badge, not a larger card.

### Composition

- Desktop: quiet masthead, centered identity block, optional social strip, then
  the directory.
- The profile stays short enough that useful links remain visible without an
  introductory scroll.
- Profile eyebrow, biography, directory heading, link-count wording, and footer
  are optional. Empty values remove the element and its spacing completely;
  the default public composition is logo, profile name, and links.
- Social and directory headings collapse completely when their authored fields
  are empty. Do not invent labels, counts, kickers, or filler copy in public UI.
- Stack layout remains narrow and focused; the optional grid only expands the
  repeated link collection, never the profile.
- Tablet and phone retain the same hierarchy and use compact horizontal rows.
- All public words, URLs, colors, visibility options, and presentation choices
  are authored in Admin and stored in D1.

### Source of truth

- Public structure: `Links/index.html`
- Public tokens and composition: `Links/styles.css`
- Rendering and interaction: `Links/app.js`
- Administration: `Admin/src/pages/LinkHubPage.jsx`
- Database: `Maps/migrations/0011_link_hub.sql` and
  `Maps/migrations/0012_link_hub_content.sql`, plus
  `Maps/migrations/0013_link_hub_card_overrides.sql` and
  `Maps/migrations/0014_link_hub_optional_copy.sql`, plus
  `Maps/migrations/0015_link_hub_socials.sql`

## 7. Selecting the right expression for a new app

Before coding, answer these questions:

1. Is this primarily spatial utility, internal operations, editorial story, or
   public directory?
2. What must remain visible while the user works?
3. What is the dominant repeated object: place, record, story, or destination?
4. Which existing app is the closest behavioral reference?
5. What single Karamah family trait makes it recognizable here?

Then choose one composition and document it. Do not merge the Maps floating
chrome, Website cinematic hero, Admin sidebar, and Links editorial cards into
one hybrid.

## 8. Implementation checklist for the next app

- Reuse an existing family font and palette unless there is a documented reason
  not to.
- Define semantic tokens before component rules.
- Establish the desktop/tablet/phone composition before polishing components.
- Use one accent and one neutral ladder.
- Build loading, empty, error, pending, and success states.
- Add keyboard focus and meaningful labels.
- Keep visitor-authored text out of `innerHTML`.
- Use `100dvh`, GPU-safe motion, and reduced-motion overrides.
- Store authored public content in the designated source of truth.
- Add deployment and migration instructions alongside the feature.
- Update this document when a new app establishes a reusable pattern.
- For Maps work, also update `Maps/docs/PREFERENCE_LOG.md`.

## 9. Anti-patterns

- A settings page that is one uninterrupted wall of fields.
- A public link page made from identical full-width buttons.
- Three equal feature cards used merely to fill a row.
- A sidebar or drawer that cannot be reopened.
- Hidden save state or silent revision conflicts.
- Hard-coded public copy that should be authored.
- Decorative analytics or invented data.
- Hover-only actions on touch devices.
- Dark mode support with no clear ownership or behavior.
- New colors, shadows, and radii added without joining the app's token system.
