# Codebase reference

This is the navigation index for the Karamah Collective monorepo. It is not a replacement for the narrative guides; it is the fast answer to “where is that implemented?” Read [Platform architecture](PLATFORM_ARCHITECTURE.md) and [Application guide](APPLICATION_GUIDE.md) first when ownership is unclear.

## Repository root

| Path | Role |
| --- | --- |
| `README.md` | Platform overview and onboarding entry point. |
| `DEPLOYMENT.md` | Authoritative Cloudflare Pages setup and release runbook. |
| `DESIGN_SYSTEM.md` | Cross-product design language and visual-system decisions. |
| `PRODUCT.md` | Product-level context. |
| `package.json` / `package-lock.json` | Root npm workspace definition and only lockfile. |
| `tooling/` | Development orchestration, deployment tree generator, layout checks, build versioning, setup/backup utilities. |
| `shared/` | Cross-app security/domain/brand invariants. |
| `docs/` | Platform guides, setup notes, monitoring, native-app planning, release documentation. |

## Maps / Manarah reference

| Need | Source of truth |
| --- | --- |
| Browser app composition | `Maps/src/app.js` |
| Map boot/layers/styles | `Maps/src/map-init.js`, `map-style.js`, `map-style-config.js`, `map-controls.js` |
| Discovery/search/place sheets | `Maps/src/places.js`, `search.js`, `place-media.js` |
| Routes and navigation | `Maps/src/directions.js`, `navigation.js`, `transit-stops.js`, `traffic-overlay.js` |
| Faith/location features | `Maps/src/prayer.js`, `qibla.js`, `eid-prayers.js` |
| Community/account | `Maps/src/auth.js`, `account-sync.js`, `account-profile.js`, `profile.js`, `reviews.js`, `wishlist.js` |
| UI style and design tokens | `Maps/src/styles/` and `Maps/docs/DESIGN_SYSTEM.md` |
| Public/static data | `Maps/data/` |
| Pages API routes | `Maps/functions/api/` |
| Shared Maps function helpers | `Maps/functions/_*.js` |
| Database evolution | `Maps/migrations/` |
| Local database setup | `Maps/scripts/local-db.mjs` |
| PWA/native | `Maps/sw.js`, `manifest.json`, `capacitor.config.ts`, `Maps/android/`, `Maps/ios/` |
| Browser tests | `Maps/tests/` |

### Maps function map

| Path | Responsibility | Caller class |
| --- | --- | --- |
| `api/admin.js` | Authenticated operations API for Maps and shared workspace functions, including analytics/system health integration | Staff/Admin |
| `api/places.js`, `api/place-media.js`, `api/geo.js` | Public map/place/media/geographic data paths | Public |
| `api/reviews.js`, `api/review-image.js` | Community review lifecycle and review images | Public + authenticated depending action |
| `api/submit.js`, `api/wishes.js` | Community submissions, edits, wishes | Public/authenticated depending action |
| `api/account.js` | Signed-in account data/synchronisation | Authenticated user |
| `api/app-settings.js`, `api/config.js` | Client-safe configuration/settings | Public/read as appropriate |
| `api/eid-prayers.js` and Admin action subroutes | Eid/place/event operational flows | Public/admin as appropriate |
| `api/weekly-report.js` | Protected scheduled analytics digest workflow | Scheduled/server caller |
| `api/health.js`, `api/health/db.js` | Application and D1 monitoring | Public monitor |
| `api/form-asset.js` | Cross-product Forms presentation-asset workflow | Authenticated staff |

The exact action contract in `api/admin.js` is deliberately broad; read its action dispatch and nearby helper code before changing it. Do not infer authorization from a React page name.

## Website reference

| Need | Source of truth |
| --- | --- |
| Document structure and metadata | `Website/index.html`, `robots.txt`, `_headers`, `_routes.json` |
| Interaction and dynamic content rendering | `Website/assets/js/app.js`, `site-content.js`, `content-schema.mjs` |
| Styles and dark mode | `Website/assets/css/` |
| Static images/vendor assets | `Website/assets/images/`, `assets/vendor/` |
| Public API | `Website/functions/api/content.js`, `team.js`, `contact.js`, `config.js` |
| Authenticated Website management | `Website/functions/api/admin.js` |
| Data abstraction / legacy compatibility | `Website/functions/_website-data.js`, `_sheets.js` |
| Build | `Website/scripts/build.mjs`, `Website/build/` |
| Tests | `Website/tests/` |
| Legacy/reference material | `Website/reference/` |

Website public data is a publication problem: send only active/published records and preserve semantics, accessibility, SEO, and performance. The admin route is a data-management problem: verify identity and permission before changing authoritative content.

## Admin reference

| Need | Source of truth |
| --- | --- |
| Route tree | `Admin/src/App.jsx` |
| Navigation groups | `Admin/src/layout/navigation.js` |
| App shell | `Admin/src/layout/AppLayout.jsx`, `Nav.jsx` |
| Firebase browser setup | `Admin/src/firebase.js`, `src/auth/` |
| Permission presentation/helpers | `Admin/src/auth/permissions.js` |
| Owner API clients | `Admin/src/api/client.js`, `website*.js`, `forms.js`, `links.js`, `queries.js` |
| Product pages | `Admin/src/pages/` |
| Shared components | `Admin/src/components/` |
| Design/style system | `Admin/DESIGN.md`, `Admin/src/styles/` |
| Vite entry/build | `Admin/src/main.jsx`, `vite.config.js` |
| Browser/unit tests | `Admin/tests/` |

An Admin page commonly has four pieces: a server contract owned by an application, an `src/api/` client/query, a page/component, and styling/state feedback. Keep those responsibilities separate.

## Links reference

| Need | Source of truth |
| --- | --- |
| Public document/app/style | `Links/index.html`, `app.js`, `styles.css` |
| Public hub payload | `Links/functions/api/hub.js` |
| Click recording | `Links/functions/api/click.js` |
| Redirect route | `Links/functions/go/[id].js` |
| Headers/routes/middleware | `_headers`, `_routes.json`, `functions/_middleware.js` |
| Build/tests | `Links/scripts/build.mjs`, `Links/tests/` |

Admin editing for Links belongs in Admin plus the shared owner API/data model, not in the public Links application.

## Forms reference

| Need | Source of truth |
| --- | --- |
| Respondent app | `Forms/index.html`, `app.js`, `auth.js`, `styles.css` |
| Public canonical/legacy routes | `Forms/functions/f/[code].js`, `functions/forms/[slug].js` |
| Public schema, submit, upload | `Forms/functions/api/form.js` |
| Public presentation media | `Forms/functions/api/media.js` |
| Authenticated form management | `Forms/functions/api/admin.js`, `api/forms.js`, `api/form-asset.js` |
| Health | `Forms/functions/api/health.js`, `api/health/db.js` |
| Build/link maintenance | `Forms/scripts/build.mjs`, `shorten-share-codes.mjs` |
| Privacy content | `Forms/content/privacy.html` |
| Tests | `Forms/tests/` |
| Schema and logic invariants | `shared/forms-domain.mjs`, `shared/forms-logic.mjs` |

Forms has two user journeys that must not leak into each other: the public respondent journey and the authenticated author/operator journey. Publish an immutable schema version before exposing it to respondents; preserve version/submission interpretation over time.

## Shared and tooling reference

| File/directory | What it does |
| --- | --- |
| `shared/firebase-verify.mjs` | Edge-compatible Firebase ID-token verification. |
| `shared/forms-domain.mjs` | Form schema, question/answer validation, public projection. |
| `shared/forms-logic.mjs` | Conditional rule evaluation/validation. |
| `shared/brand/karamah-logo.svg` | Canonical shared wordmark. |
| `tooling/dev.mjs` | Starts coordinated local services and schema preparation. |
| `tooling/deploy-agent.mjs` | Plans, validates, commits, and generates preview/deploy release branches. |
| `tooling/check-layout.mjs` | Repository/layout validation. |
| `tooling/build-version.mjs` | Shared deployment version/cache-busting support. |
| `tooling/setup-website-env.mjs` | Local Website environment setup. |
| `tooling/cleanup-d1-backups.mjs` | Backup housekeeping support. |

## Testing reference

| Test type | Locations | What it catches |
| --- | --- | --- |
| Maps Playwright | `Maps/tests/` | Map loading, mobile, places, search, routes, prayer, accounts and regressions. |
| Admin Playwright/unit | `Admin/tests/` | Authenticated workspace flows, forms, links, website and rich-content behaviour. |
| Website Node + Playwright | `Website/tests/` | API/content/metadata plus browser experience. |
| Links Playwright | `Links/tests/` | Public hub/redirect experience. |
| Forms Node + Playwright | `Forms/tests/` | Domain logic, API validation, static/public form flow. |

## Documentation maintenance rule

When a change introduces a new app boundary, a secret, a migration procedure, a user role, an external dependency, a monitoring route, or a manual operator step, update the appropriate guide in `docs/` in the same change. Documentation is part of the platform contract, not an after-release task.
