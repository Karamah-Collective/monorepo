# Data, identity, and security

This guide describes the platform’s trust boundaries. It is written for everyone who reads or changes data, calls an API, adds a permission, uploads a file, configures an environment value, or investigates an access problem. Security here is not a single library; it is the agreement between browser code, edge functions, database ownership, and deployment configuration.

Read [Platform architecture](PLATFORM_ARCHITECTURE.md) for system context and [Application guide](APPLICATION_GUIDE.md) for product ownership.

## 1. Trust boundaries at a glance

```text
Public browser                         Trusted edge function                 Private service
--------------                         ---------------------                 ---------------
HTML / JS / CSS     --request-->       Pages Function       --binding-->      D1 / R2
public config       <--response--      token + permission    --HTTPS-->        provider API
Firebase ID token                        validation                            secret only here
```

The browser is always an untrusted caller. A logged-in person can change JavaScript, replay requests, or call a function directly. Therefore the edge function is the authorization boundary. It must validate all inputs, verify any identity token, enforce the action/permission, and choose a safe public data projection.

## 2. Data stores and ownership

### Shared D1: `halal-finder-db`

This database is bound as `DB` in Maps, Website, and Links deployments. It owns:

* Manarah/community data such as places, app links, events, reviews, moderation records, media references, settings, and related taxonomy.
* Website people, content, subscribers, and audit records.
* Link hub settings, links, style/content additions, and public ordering state.
* Workspace access foundations: roles, role memberships/settings, access requests, member profiles, weekly report settings/subscribers, and analytics cache/snapshots.

Although migration files are under `Maps/migrations/`, every table has a domain owner. Follow the owner API when reading or writing data. For example, a Website content page should call the Website data layer; a public Links page should call its public hub endpoint; Admin should call authenticated owner endpoints.

### Forms D1: `forms-db`

Forms owns its own D1 binding because submissions and files are privacy-sensitive and have a different lifecycle from map/website/link data. Core tables include forms, immutable form versions, submissions, answers, file metadata, presentation assets, share-code aliases, and collaborators. Forms Functions are the only intended application-level gateway to this data.

### R2 media

`manarah-media` stores Maps media. `forms-media` stores Forms presentation assets and respondent uploads. Both are private buckets. A database row or object key is not permission to expose an object: a handler must intentionally choose what public data can be served.

Important distinction:

* **Forms presentation asset:** an author intentionally made it part of a public form. It may be returned by `GET /api/media` after handler checks.
* **Forms respondent upload:** submitted evidence/data. It must not be returned by the public media route.

## 3. Schema and migrations

Migrations are forward-only SQL files in `Maps/migrations/`, numbered in application order. Examples:

* `0001`–`0020`: Maps, Website, Links, and shared platform evolution.
* `0021`–`0024`: Forms schema and public share-code evolution.
* `0025`–`0031`: roles, access, reports, collaborators, profiles.
* `0032`: analytics cache and daily snapshots.

Rules for migrations:

1. Do not edit an already-applied migration. Add the next migration instead.
2. Prefer additive changes and safe backfills. A production table may already contain real data.
3. Test locally through the repository tooling before remote execution.
4. Review both Production and Preview database targets; they are intentionally different.
5. Update the owner API validation and public projections alongside schema changes.
6. Document operational/manual migration steps in the relevant application docs or `DEPLOYMENT.md`.

Use `Maps/scripts/local-db.mjs` and `tooling/dev.mjs` for local shared DB preparation. Forms local preparation is handled in the root dev tool’s Forms sequence. Remote migration commands are documented in `DEPLOYMENT.md` and application READMEs; run them only when the release specifically requires it.

## 4. Firebase authentication

Firebase Auth establishes who a user claims to be. The browser obtains an ID token after sign-in and sends it as:

```http
Authorization: Bearer <Firebase ID token>
```

Pages Functions do not trust that header by itself. `shared/firebase-verify.mjs` verifies RS256 signatures against Google’s public keys and validates expected Firebase token claims in a Workers-compatible way. It avoids Firebase Admin SDK because that server-oriented SDK is not the correct runtime dependency for Cloudflare Pages Functions.

Relevant layers:

| Layer | Responsibility | Not sufficient for |
| --- | --- | --- |
| Firebase client / Admin `AuthContext` | Sign-in UX and token acquisition | Authorizing an API action |
| Admin `AuthGuard` | Friendly route protection | Protecting a direct API request |
| `shared/firebase-verify.mjs` | Proving token identity at edge | Deciding product permissions by itself |
| Owner API permission check | Authorizing action against current role/data | Browser navigation state |

Some Manarah account/community features also use Firebase identity. The same principle applies: validate tokens server-side before relating an account to private records.

## 5. Authorization and permissions

Identity answers “who is this?” Authorization answers “may this person do this?” They must remain separate.

The shared access model in D1 contains roles, role memberships/settings, access requests, and member profiles. Maps’ authenticated Admin API is the primary authority for shared staff access. Forms deliberately consults the existing Admin access service and its owner/collaborator rules rather than maintaining a divergent role table. Website’s administrative route verifies Firebase identity and applies its access policy before serving private data.

Guidelines:

* Add a meaningful permission/action on the server when adding sensitive capability.
* Gate the Admin navigation and page for usability, but repeat the check in the function.
* Return minimal, safe errors. An unauthorized caller should not learn internal role layout, SQL, stack traces, or secrets.
* Scope CORS to trusted origins where cross-origin Admin calls are expected. Do not reflect arbitrary origins.
* Validate object ownership/collaboration, not merely that a user is “an admin,” where a resource has more granular access.

## 6. Public versus private API design

Public endpoints should return the smallest data projection needed by the public experience. This is especially important for forms, media, team records, link hub data, and Maps content.

| Endpoint class | Typical caller | Required controls |
| --- | --- | --- |
| Public read | anonymous browser | Published/active filter, safe projection, input validation, response caching where appropriate |
| Public write | respondent/community browser | Strict schema validation, anti-abuse/rate/Turnstile policy where used, idempotency where relevant, no secret disclosure |
| Authenticated user write | signed-in community browser | Firebase verification, ownership checks, input validation |
| Staff/admin | Admin browser | Firebase verification, server-side permission/resource checks, constrained CORS, audit where appropriate |
| Health | monitoring provider | GET/HEAD only, minimal JSON/status, no internals |

Never solve a public-data issue by sending a private record and relying on the frontend to hide fields. The browser has already received it.

## 7. Secrets and configuration

### Where values belong

| Value type | Correct location | Never put it in |
| --- | --- | --- |
| Server API token (e.g. UptimeRobot, Brevo, analytics) | Cloudflare Pages secret for owning project; ignored local `.dev.vars` | `VITE_*`, committed JS, browser storage |
| D1/R2 binding | Cloudflare project bindings; local `wrangler.toml` for local development | Client code |
| Firebase public web config | Client configuration | Treated as a credential; it is intentionally public |
| Firebase service/private credential | Provider/server configuration if ever required | Repository, browser bundle, native committed config |
| App public origin | deployment variable/public build config | Secret store requirement, unless mixed with secret data |

`UPTIMEROBOT_API_KEY` is a useful example. It is used only by Maps’ server-side UptimeRobot integration. Admin receives a sanitized, cached health payload from Maps; it never receives the key. The production secret belongs in the Maps Pages project, not Admin or Forms merely because those products appear in the display.

### Local files

`.dev.vars`, `.env.local`, local state, downloaded Firebase native configuration, and backups are ignored for a reason. Before committing, inspect `git status`; when reviewing, ensure a diff has not added values that resemble a token, key, email list, or production export.

## 8. Input, file, and external-service safety

### Input validation

Validate on the server even when the UI already validates. Shared Forms domain helpers normalise schema/answers and validate question types/constraints. Maps, Website, Links, and Forms handlers similarly need to reject malformed query/body values, bound string lengths, and avoid accepting a client-supplied authorization decision.

### Files

Treat MIME type, size, object key, and visibility as server decisions. Keep object-key generation non-guessable where required; retain only metadata needed for the product flow; do not return direct bucket detail in errors. Review any new upload capability for retention, virus/malware policy, private retrieval, and whether it can be embedded publicly.

### External services

Third-party providers include Firebase/Google keys, map/geocoding/routing services, analytics providers, email delivery, Cloudflare Analytics, and UptimeRobot. Calls should have a bounded timeout where appropriate and safe failure behaviour. A provider outage should degrade the feature gracefully; it must not turn into an internal error response that leaks headers, environment values, or implementation detail.

## 9. Monitoring and health endpoints

Manarah and Forms expose lightweight public endpoints for UptimeRobot:

| Product | Application | Database |
| --- | --- | --- |
| Manarah | `/api/health` | `/api/health/db` |
| Forms | `/api/health` | `/api/health/db` |

Each accepts only `GET` and `HEAD`. GET returns small machine-readable JSON. HEAD performs the same relevant validation and returns the same status with no body. Database health performs the cheapest safe D1 read (`SELECT 1` or equivalent). Healthy responses are `200`; dependency failure is a generic `5xx`. They never include a stack trace, schema, secret, environment variable, or infrastructure identifier.

## 10. Security review checklist

Before merging a feature that touches data, identity, media, or a new endpoint, confirm:

- [ ] The owner application and data store are clear.
- [ ] The function, not the browser, authorizes the action.
- [ ] Public responses are a safe projection.
- [ ] Input and body size/type constraints are validated server-side.
- [ ] CORS is intentionally scoped.
- [ ] Secrets remain in an edge environment, not a frontend bundle.
- [ ] D1/R2 Preview and Production bindings remain isolated.
- [ ] Errors are safe and actionable without exposing internals.
- [ ] Relevant tests cover both allowed and denied/invalid paths.
- [ ] A migration is forward-only and included in release planning if schema changed.

For release mechanics, continue with [Development and release](DEVELOPMENT_AND_RELEASE.md).
