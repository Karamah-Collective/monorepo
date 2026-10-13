# Platform architecture

This document is the architectural map for the Karamah Collective platform. It answers the questions a new engineer, product owner, or technical lead normally asks before touching code: which system owns a behaviour, where a request runs, where data lives, and why the platform is split into several applications.

Read the root [README](../README.md) first. Then use the [Application guide](APPLICATION_GUIDE.md) when you need an application-level tour and [Data, identity, and security](DATA_IDENTITY_SECURITY.md) before changing data or authentication.

## 1. The platform is a collection of products, not one website

Karamah Collective serves several different audiences. Visitors discovering halal places should not have to download the operational dashboard. A person completing a form should not receive the full map bundle. Staff need one place to manage content across products. The architecture follows those user boundaries.

| Product | Audience | Public responsibility | Cloudflare project root | Primary data |
| --- | --- | --- | --- | --- |
| Manarah / Maps | Community visitors | Map, places, prayer context, directions, community contribution | `Maps/` | `halal-finder-db`, `manarah-media` R2 |
| Website | Public visitors | Organisational site, team, published content, contact and updates | `Website/` | `karamah-admin-db` |
| Links | Public visitors | Branded link hub and redirect tracking | `Links/` | `karamah-admin-db` |
| Forms | Respondents | Published forms, conditional paths, submissions and upload experience | `Forms/` | Forms D1, `forms-media` R2 |
| Admin | Authorized staff | Control surface for the above products | `Admin/` | Uses owner APIs; no separate application database |

Every public product is a Cloudflare Pages project. That gives it a static edge delivery path and a colocated Pages Functions backend. The applications share a repository and selected domain helpers; they do **not** share one browser bundle, one deployment, or a catch-all server.

## 2. Runtime topology

```text
Browser
  |
  +-- maps.karamahcollective.com  -> Maps static assets + Maps Functions
  +-- karamahcollective.com       -> Website static assets + Website Functions
  +-- links.karamahcollective.com -> Links static assets + Links Functions
  +-- forms.karamahcollective.com -> Forms static assets + Forms Functions
  `-- admin.karamahcollective.com -> Vite-built Admin static app
                                           | Firebase ID token
                                           +-> Maps Admin API
                                           +-> Website Admin API
                                           `-> Forms Admin API
```

Cloudflare matches a request to a static file first where appropriate and to a function file based on its path under `functions/`. A function is short-lived edge code: it receives a request plus Cloudflare `env` bindings, may query D1 or R2, and returns a response. There is no Express, Node server process, VM, or container that must be kept running.

### Why Pages Functions rather than a separate backend

* Public and internal API code can live next to the UI it serves.
* D1 and R2 bindings are available to the function without embedding credentials in the browser.
* Cloudflare performs HTTPS, CDN delivery, and function routing for every application.
* Deploying a static UI and its matching edge functions together reduces version skew.
* The remaining server-to-server calls are purposeful: for example, the Forms API asks the Maps access service about staff permissions instead of duplicating the role model.

## 3. Data topology and ownership

Three database domains exist:

```text
halal-finder-db (Manarah)                  karamah-admin-db (Admin)       forms-db (dedicated)
----------------------------------         --------------------------     ---------------------
places, events, reviews                    website content/team           form definitions
community moderation                       links and QR configuration     immutable versions
map settings and map media                 roles, access, profiles        submissions and answers
                                           inbox/Gmail, MCP, audit         respondent file metadata
                                           reports and shared settings    presentation assets
```

`halal-finder-db` is the Manarah source of truth. `karamah-admin-db` is the Admin control-plane source of truth for Website, Links, staff access, inbox/Gmail, MCP, reports, and audit data. Their migrations remain under `Maps/migrations/` for historical continuity. This location does not mean a migration is Maps-only: inspect the affected tables before editing or applying it.

Forms has a separate D1 database because its response data and file lifecycle form a distinct privacy boundary. Its schema migrations are also stored under `Maps/migrations/` (`0021` onward), while `Forms/` owns the public API and runtime binding. This arrangement is documented so a future maintainer does not mistake the folder layout for the trust boundary.

R2 stores binary media rather than putting files in SQLite:

* Maps `MEDIA` is the private `manarah-media` bucket for place/review media.
* Forms `MEDIA` is the private `forms-media` bucket for presentation assets and respondent uploads.
* Public handlers return only explicitly allowed, immutable presentation assets. Respondent uploads are never made readable through Forms’ public media endpoint.

Production uses the named databases above. Local Pages development persists into local Wrangler state. Preview bindings are intentionally not part of the current free-tier setup; do not create additional preview D1 databases without revisiting the quota decision.

## 4. Request flows

### Public map discovery

1. The browser receives Manarah’s static PWA assets from Maps.
2. Vanilla ES modules initialise MapLibre, local map data, controls, service worker behaviour, and the responsive application shell.
3. Public API calls such as place, review, event, image, or account requests are routed to Maps Functions.
4. Functions read/write the shared D1 database or Maps R2 according to the endpoint’s policy.
5. Third-party calls (geocoding, routes, prayer data, analytics) stay behind narrowly scoped client or server integration boundaries; failure handling must not disclose secrets.

### Staff administration

1. A staff member loads the React Admin application.
2. Firebase Auth signs the person in and produces a Firebase ID token.
3. Admin sends that token as `Authorization: Bearer <token>` to an owner API.
4. The relevant Pages Function verifies the token signature with Google’s public keys via `shared/firebase-verify.mjs`.
5. The owner API resolves access and permission data from the shared D1 store, then performs the requested action against the authoritative data domain.
6. Admin renders the response with React Query caching and invalidation; it never treats its own local state as the canonical record.

### Public Forms submission

1. A respondent opens an opaque `/f/:shareCode` link.
2. Forms resolves the published form and its immutable version from Forms D1.
3. The frontend renders only the public schema and applies the same conditional-logic model used during authoring.
4. The submit endpoint validates answers on the server using shared form-domain rules, records an idempotent submission, and stores permitted upload metadata in Forms D1/R2.
5. Staff later view responses through Admin, which uses the Forms administrative API and the existing Firebase access model.

## 5. Deployment topology

`main` is the full source branch. `preview` and `deploy` are generated, reduced trees for Cloudflare Pages; they are not collaboration branches. The deployment agent includes the source needed by each Pages project, preserves shared dependencies/assets, and records the source commit in the generated release commit.

| Branch | Purpose | Who edits it |
| --- | --- | --- |
| `main` | Reviewed source of truth | Contributors and code review |
| `preview` | Cloudflare preview deployment tree | Deploy agent only |
| `deploy` | Cloudflare production deployment tree | Deploy agent only |

Cloudflare Pages projects point at `deploy` for Production and normally `preview` for Preview. The dashboard, not checked-in Wrangler config, owns production bindings for Maps, Links, and Forms. This is deliberate: a local `wrangler.toml` must not accidentally replace production D1/R2 bindings.

## 6. Shared code: use it for invariants

`shared/` is intentionally small. Its key modules are:

* `firebase-verify.mjs`: verifies Firebase ID tokens in the Workers-compatible runtime without Firebase Admin SDK.
* `forms-domain.mjs`: schema creation, normalisation, validation, public-schema projection, and answer validation.
* `forms-logic.mjs`: conditional logic evaluation and validation shared by form authoring and respondent paths.
* `brand/karamah-logo.svg`: canonical shared wordmark copied/consumed by app builds.

Use shared code when two runtimes must agree on a security, schema, or domain rule. Do not move application-specific UI or endpoint details there merely to reduce imports; doing so makes ownership less clear.

## 7. Native Manarah shells

`Maps/android/` and `Maps/ios/` are Capacitor shells around the Manarah PWA (`com.karamahcollective.manarah`). They live in `main` because they are source artefacts, but are excluded from generated Pages deployment branches. Native builds use their own platform toolchains and per-machine Firebase configuration; never commit downloaded `google-services.json` or generated platform build output.

## 8. Architectural guardrails

1. **Data belongs to a domain owner.** Add a Website content feature to Website/Maps shared data paths, a respondent form feature to Forms, and staff-only controls to the existing owner API.
2. **A browser is untrusted.** UI route guards and hidden buttons are convenience, not authorization. The function must validate token and permission.
3. **Secrets end at the edge.** A secret is exposed only to the Pages Function environment that needs it. Never use a `VITE_*` variable for a server secret.
4. **Generated deployment branches are outputs.** Source is changed in `main`; release trees are generated.
5. **Migrations move forward.** Make an additive/reviewed migration rather than editing already-applied history.
6. **Preview is a real environment.** It gets isolated bindings and must not write production data.

## 9. Where to inspect code

| Question | First place to read |
| --- | --- |
| How an app is built | its `package.json` and `scripts/build.mjs` where present |
| Which request paths exist | its `functions/` directory and `_routes.json` |
| What local development starts | `tooling/dev.mjs` |
| How production files are selected | `tooling/deploy-agent.mjs` and `DEPLOYMENT.md` |
| How Admin routes/API calls work | `Admin/src/App.jsx`, `Admin/src/api/`, then target Functions |
| What tables a change touches | `Maps/migrations/` and the owner function queries |
| What visual conventions exist | `DESIGN_SYSTEM.md`, `Admin/DESIGN.md`, app styles |

Next: read the [Application guide](APPLICATION_GUIDE.md) to follow each product from its user experience through frontend, backend, data, and operations.
