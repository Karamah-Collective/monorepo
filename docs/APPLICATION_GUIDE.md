# Application guide

This is the product-by-product companion to [Platform architecture](PLATFORM_ARCHITECTURE.md). For each application it describes the user, the responsibilities it owns, how its frontend is organised, where its backend lives, how it handles data, and the practical consequences of changing it.

## How to use this guide

Start by identifying the user-facing outcome. Then find the product responsible for that outcome. Follow its frontend, function, data, and admin sections in that order. If a request crosses product boundaries, keep one product authoritative and use a narrow integration rather than copying its business logic.

## 1. Manarah (`Maps/`)

### Purpose and audience

Manarah is the mobile-first halal discovery PWA for Helsinki and Finland. It helps community members discover halal restaurants, shops, mosques, prayer rooms, cemeteries, events, directions, prayer context, and community-maintained place information. It is a public product first; sign-in adds optional account features rather than turning basic discovery into a gated experience.

### Frontend design

The frontend is deliberately framework-free: ES modules under `Maps/src/` coordinate a MapLibre GL map, bottom-sheet-style interaction patterns, responsive controls, and PWA behaviour. `app.js` composes the experience; specialised modules own map initialisation, search, places, routing/directions, prayer times, Qibla, navigation, profile/account state, reviews, media, events, and UI controls.

This design choice keeps the map experience direct and performance-conscious. Map interaction has many imperative concerns—markers, layers, map events, geolocation, route overlays, device orientation—and ES modules make those boundaries explicit without forcing all map state through a UI framework. Use the existing module responsible for a feature instead of expanding `app.js` into a second coordination layer.

Relevant files:

* `Maps/index.html`: shell and asset entry point.
* `Maps/src/app.js`: feature composition and lifecycle.
* `Maps/src/map-init.js`, `map-controls.js`, `map-style*.js`: map rendering and controls.
* `Maps/src/places.js`, `search.js`, `directions.js`, `navigation.js`: discovery and travel flows.
* `Maps/src/prayer.js`, `qibla.js`, `eid-prayers.js`: faith-context features.
* `Maps/src/account-*.js`, `profile.js`, `reviews.js`, `wishlist.js`: signed-in/community features.
* `Maps/sw.js`, `manifest.json`, `capacitor-bridge.js`: installability, offline support, native bridging.

### Backend and data

Maps Pages Functions in `Maps/functions/api/` expose public and authenticated behaviour. The large `api/admin.js` endpoint is the operational gateway used by Admin for Maps and several shared platform capabilities. Supporting modules beginning with `_` encapsulate common concerns such as Firebase verification, analytics, UptimeRobot integration, Turnstile, review images, place media, application settings, link hub support, and Forms administrative access.

The Maps project binds `DB` to the shared D1 database and `MEDIA` to the private `manarah-media` R2 bucket. Static seed/reference data lives in `Maps/data/`; mutable community and operations data belongs in D1. Do not edit deployed JSON expecting it to behave as the canonical database record.

### What Admin manages here

Admin can manage places, events, Eid prayer information, submissions, edits, reviews, wishes, contacts, social videos, marker/type styling, app settings, analytics, health, weekly reports, access controls, and cross-product operational workflows. Admin calls the Maps Admin API with a Firebase bearer token; it does not write the D1 database directly from the browser.

### Change guidance

* A map visual/control change usually belongs in `Maps/src/` and its styles.
* A mutable place/community record change usually needs an owner API review and perhaps a migration.
* A new sensitive staff action belongs in Maps Admin API permission logic plus Admin UI.
* A public upload/media change must review R2 object visibility and media endpoint policy.
* A mobile-shell change must be tested separately in Capacitor tooling; a Pages deploy does not rebuild a native store release.

Read `Maps/README.md` for map-specific product detail, and `Maps/docs/` for specialised design, taxonomy, media, reviews, settings, and analytics references.

## 2. Website (`Website/`)

### Purpose and audience

The Website is Karamah Collective’s organisational front door. It presents the mission, programs, people, announcements, contact channel, and updates signup path. It is a public, content-led experience with strong attention to brand, accessibility, performance, and SEO.

### Frontend design

The public UI is static HTML, CSS, and JavaScript rather than a client framework. `index.html` provides the structure; `assets/js/app.js` manages interaction; `assets/js/site-content.js` receives/presents dynamic content; CSS files carry the visual system and dark-mode variants. The build script processes the site’s assets, including Tailwind output where used.

The choice is intentional: this is mostly published content, so fast static delivery and low client complexity are more valuable than a rich application runtime. Preserve semantic HTML, metadata, progressive enhancement, and motion/accessibility safeguards when changing it.

### Backend and data

Website Functions serve public content/team/config/contact routes and an authenticated administrative route. `functions/_website-data.js` is the D1-oriented content/data layer. `functions/_sheets.js` exists for compatibility with legacy Google Sheets/App Script flows; do not assume a new feature should add another Sheets dependency. The platform direction documented in `DEPLOYMENT.md` is Website content in the shared D1 database, with existing Sheets integrations treated carefully during migration or compatibility work.

Website has a shared D1 `DB` binding. Public endpoints expose only published/active records. The administrative endpoint verifies Firebase identity and applies the same staff access model before returning or changing private data.

### What Admin manages here

The Website area of Admin manages site content, team directory records, and update subscribers. The Website backend remains authoritative for its data. Admin’s `src/api/website*.js` client modules are transport layers, not an invitation to reimplement Website validation in React.

### Change guidance

* Public layout/copy behaviour: `Website/index.html`, `assets/css/`, `assets/js/`.
* Published content schema or API contract: Website Functions plus shared D1 migration where needed.
* Admin authoring UI: add/update the Website Admin API contract first, then Admin query/mutation code and page.
* Contact delivery: preserve validation, consent, anti-abuse, and provider-secret boundaries.
* SEO/social changes: check canonical metadata, Open Graph, robots, sitemap/reference behaviour, and generated build output.

Read `Website/README.md` and the Website sections of `DEPLOYMENT.md` before changing a deployment, the legacy Sheets path, or content storage.

## 3. Admin (`Admin/`)

### Purpose and audience

Admin is the internal workspace used by authorized Karamah staff. It brings together Maps moderation and configuration, Website publishing, Links management, Forms authoring, analytics, system health, access control, activity history, and personal/workspace preferences.

### Frontend design

Admin is a React 18 and Vite application. `src/App.jsx` defines the authenticated route tree. `src/layout/` owns the shell and navigation; `src/pages/` contains product workspaces; `src/components/` provides reusable, behaviourful UI pieces; `src/styles/` contains the layered Admin styling system; and `src/api/` owns server communication. React Query is used to cache, refetch, and invalidate remote owner data.

The visual system is deliberately dense, operational, and consistent: information hierarchy matters more than decorative presentation. Respect the tokens, table/cell patterns, responsive layout, loading/error states, and permission-aware navigation documented in `Admin/DESIGN.md` and `DESIGN_SYSTEM.md`.

### Authentication and backend relationship

Admin is not a new backend. Firebase Auth is initialised in `src/firebase.js`; `AuthContext` and `AuthGuard` handle browser session/route experience. API clients obtain an ID token and attach it to requests. The target Pages Function validates that token and authorizes the requested operation.

Admin talks to Maps for Maps/shared operational data, Website for Website data, and Forms for Forms data. It may display a combined view, but it must not quietly create a competing database or authorization system. This is why an Admin feature often touches an app API and a React page together.

### Change guidance

* Add a route in `App.jsx`, then navigation in `layout/navigation.js` only if the user should discover it there.
* Add or reuse a permission. Hidden navigation is not enough; the server must enforce the same permission.
* Put fetch mechanics and response handling in `src/api/`, then consume it through React Query in a page/component.
* Include loading, empty, error, mutation-pending, and success feedback. Admin is an operational tool; ambiguous state is a product defect.
* Keep secrets out of Vite environment variables. `VITE_*` values are browser-visible.

## 4. Links (`Links/`)

### Purpose and audience

Links is the public Karamah link hub. It is intentionally small: a polished, brand-consistent landing page with managed destinations and measurable redirect/click behaviour. The small runtime keeps a page commonly reached from social profiles fast and resilient.

### Frontend and backend

`index.html`, `app.js`, and `styles.css` render the public experience. `functions/api/hub.js` returns public link hub configuration; `functions/api/click.js` records a click; `functions/go/[id].js` performs tracked redirect behaviour. The middleware sets common response behaviour.

Links reads the shared D1 database. Staff manage link settings, ordering, visibility, metadata, and appearance from Admin through the Maps/shared operational API. Public code may read only published/active data; it cannot administer the hub.

### Change guidance

Keep the public bundle lean. A new card option or piece of content must have an explicit public-safe data projection. A new management field needs a D1 schema/migration decision, server validation, Admin editing support, and a backward-compatible public rendering default.

## 5. Forms (`Forms/`)

### Purpose and audience

Forms is a respondent-focused application for forms designed in Admin. It supports structured questions, sections, conditional logic, immutable publishing, non-guessable public links, file uploads, submission idempotency, response review, exports, and analytics. Its primary user is a respondent, not the staff author.

### Frontend design

The public runner is static JavaScript in `app.js` with `auth.js`, `styles.css`, and content/route documents. Its job is to render a published schema faithfully, react to answers through conditional logic, validate the respondent experience, and submit only to the public Forms API. It should not contain staff authoring capability or private submission visibility.

Routes preserve two concerns: `/f/:code` is the current opaque public route; `/forms/:slug` is retained for legacy links. The route functions resolve them into the same public app experience.

### Backend and data

`api/form.js` handles public schema reads, submissions, and multipart uploads. `api/forms.js`, `api/admin.js`, and `api/form-asset.js` support managed/form-authoring workflows. `api/media.js` serves only permitted presentation assets. Forms health endpoints live under `api/health` and `api/health/db`.

Forms D1 models a form separately from its published versions, submissions, answers, files, and assets. Publishing creates an immutable version so a respondent’s submitted answers remain interpretable after an author later edits the draft. Share-code alias migrations preserve links while allowing short public URLs. Files use the dedicated private Forms R2 bucket.

`shared/forms-domain.mjs` and `shared/forms-logic.mjs` are important invariants: the browser may use them for immediate feedback, but the server repeats validation before accepting data. This protects submissions from manipulated clients and keeps authoring/response behaviour aligned.

### Authorization model

Public readers/respondents access only published data. Staff authoring uses a Firebase bearer token verified by Forms Functions. Forms reuses the existing Maps/shared access model (and owner/collaborator checks) rather than inventing separate credentials. This is a deliberate cross-service call: role policy stays in one place.

### Change guidance

* A new question type normally needs schema normalisation, schema validation, answer validation, public rendering, Admin editor support, and tests in both domain/API/UI layers.
* A logic feature must be expressed and validated in `shared/forms-logic.mjs`, then used consistently by Admin preview and public response flow.
* A file feature needs a privacy review first: presentation asset and respondent upload policies are not interchangeable.
* A publishing change must preserve version immutability and link compatibility.

## 6. Supporting areas

### `shared/`

Contains cross-app invariants only: Firebase verification, Forms schema/logic, and shared brand assets. Changes here potentially affect several runtimes and should be tested across every consuming application.

### `tooling/`

`dev.mjs` orchestrates local services and database setup. `deploy-agent.mjs` validates and generates deployment branches. `build-version.mjs`, `check-layout.mjs`, and setup/backup helpers make repeatable work possible. Tooling is production-adjacent code: change it with the same care as an API.

### `Maps/migrations/`

Contains forward-only migrations for the shared D1 database and the historically colocated Forms schema. Read the migration sequence and `DEPLOYMENT.md` before applying any file remotely. Never edit a migration that may already be applied.

## Decision checklist

Before starting work, answer these five questions in a pull request or implementation note:

1. Which application owns the user outcome?
2. Which database/bucket owns the record or file?
3. Is the caller public, signed-in community, collaborator, or staff?
4. Which function is the authorization boundary?
5. Which build/test/deploy targets must verify the change?

If those answers are unclear, stop and read [Platform architecture](PLATFORM_ARCHITECTURE.md) and [Data, identity, and security](DATA_IDENTITY_SECURITY.md) before coding.
