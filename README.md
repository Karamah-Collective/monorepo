# Karamah Collective Monorepo

This repository contains the public Karamah Collective web properties, the
shared Admin panel, Cloudflare Pages Functions, database migrations, and the
local tooling used to build and deploy them together.

The apps are intentionally deployed independently. The monorepo gives us one
place to share authentication helpers, domain logic, tests, release scripts,
and operational documentation without forcing every surface to ship from one
Cloudflare project.

## What Is Here

| Folder | Application | Runtime and data |
| --- | --- | --- |
| [Maps](Maps/) | Public Manarah map PWA and map API | Cloudflare Pages, Functions, D1, R2 |
| [Website](Website/) | Public Karamah Collective website and website API | Cloudflare Pages, Functions, D1 |
| [Admin](Admin/) | Internal dashboard for Maps, Website, Links, and Forms | Vite app, Firebase Auth, authenticated API calls |
| [Links](Links/) | Public link hub | Cloudflare Pages, Functions, D1 |
| [Forms](Forms/) | Public form respondent app and submissions API | Cloudflare Pages, Functions, D1, R2 |
| [shared](shared/) | Cross-app helpers, validation, auth, and domain logic | Imported by app functions and tests |
| [tooling](tooling/) | Local dev server, checks, deploy agent, and repo automation | Local Node scripts |
| [docs](docs/) | Supporting implementation and rollout notes | Documentation only |

## Architecture

The public apps are Cloudflare Pages projects. Static assets are built into each
app's `dist/` folder, while dynamic behavior lives in that app's
`functions/` directory and is bundled by Cloudflare at deploy time.

Admin is a separate Vite application. It signs users in through Firebase Auth,
verifies admin access server-side, and then calls the relevant app APIs with
authenticated requests. Admin does not own all data itself; it is the control
surface for the data stored by Maps, Website, Links, and Forms.

Database changes live under [Maps/migrations](Maps/migrations/) because the
original D1 database and several shared tables started with Maps. Forms also
has its own bindings and migrations documented in [Forms/README.md](Forms/README.md).
The local dev script prepares the expected local D1 state before starting the
servers.

## Requirements

- Node.js 22
- npm, using the root [package-lock.json](package-lock.json)
- Cloudflare account access for remote deployment and secrets
- Firebase project access for Admin authentication
- Playwright Chromium for browser-based tests

Install dependencies from the repository root:

```sh
npm ci
npx playwright install chromium
```

Do not install dependencies inside individual app folders. The root lockfile is
the source of truth for every workspace.

## Local Setup

1. Clone the repository and install dependencies from the root.
2. Create local environment files where needed. The common local files are
   `Maps/.dev.vars`, `Website/.dev.vars`, and any app-specific development
   files described in the app README files.
3. Run the Website helper if you need local Website secrets:

```sh
npm run setup:website
```

4. Start the full local stack:

```sh
npm run dev
```

The root dev command starts the apps and prepares the existing local Maps
database. If a migration was already applied locally, the tooling should treat
that as normal state rather than a reason to recreate the database.

| App | Local address | Start separately |
| --- | --- | --- |
| Maps | http://127.0.0.1:8788 | `npm run dev:maps` |
| Website | http://127.0.0.1:8789 | `npm run dev:website` |
| Admin | http://127.0.0.1:5173 | `npm run dev:admin` |
| Links | http://127.0.0.1:8790 | `npm run dev:links` |
| Forms | http://127.0.0.1:8791 | `npm run dev:forms` |

Links and Forms rebuild into `dist/` during development. Refresh the browser
after rebuilds. Maps, Website, and Admin serve source changes through their
development servers.

## Environment And Secrets

Keep secrets in local ignored files or Cloudflare/Firebase dashboards. Never
commit private keys, Cloudflare tokens, production secrets, downloaded service
account files, or per-machine Firebase native configuration.

Common local files:

| File | Purpose |
| --- | --- |
| `Maps/.dev.vars` | Local Cloudflare variables for Maps functions |
| `Maps/src/config.local.js` | Local map client configuration |
| `Website/.dev.vars` | Local Cloudflare variables for Website functions |
| `Website/.env.local` | Legacy/local Website development values |
| `Maps/android/app/google-services.json` | Per-machine Firebase Android config, not committed |

Public Firebase web config can appear in frontend code, but private Firebase
service credentials must not. Restrict production Firebase and Cloudflare keys
in their provider dashboards.

## Build And Test

Run all standard verification from the repository root:

```sh
npm run build
npm run check
npm run test:website
npm run test:website:ui
npm run test:admin
npm run test:links
npm run test:forms
npm run test:forms:ui
```

Maps has additional browser and integration suites under [Maps/tests](Maps/tests/).
Use `npm run test:maps`, or run the more specific scripts in
[Maps/package.json](Maps/package.json). Some map integration tests call
external map services.

Before deployment, use the deploy agent validation flow described below. It
selects the checks relevant to the changed apps and prevents generated deploy
branches from drifting away from `main`.

## Admin Workflows

Admin is the internal operations panel. It is not a public data source and
should always be served behind strong authentication.

| Admin area | What it manages |
| --- | --- |
| Website content | Homepage copy, programs, announcements, visibility, metadata, team profiles, and update signups |
| Maps | Places, links, videos, submissions, moderation, and operational map data |
| Links | Public link hub profile, link ordering, visibility, previews, styling, and open counts |
| Forms | Draft forms, published schemas, conditional logic, responses, CSV exports, analytics, and archive state |
| Access | Authenticated workspace access and role-aware administration |

Admin users sign in with a verified Karamah Collective account. Server-side API
checks remain the authority for sensitive actions; frontend route protection is
only a usability layer.

## Forms

Forms is split between an Admin authoring surface and a public respondent
experience. Admins create drafts, build sections and questions, preview
conditional logic, publish immutable versions, inspect responses, and export
CSV files. Respondents only see published schemas and submit through the public
Forms API.

See [Forms/README.md](Forms/README.md) for bindings, D1 setup, R2 media setup,
deployment details, and rollout checks.

## Link Hub

The Links app renders the public Karamah link hub. Admin controls destinations,
Open Graph/Twitter preview metadata, link ordering, featured state, visibility,
profile copy, SEO copy, card treatment, colors, page width, and desktop layout.

See [Links/README.md](Links/README.md) for local and remote migration commands.

## Native Shells

[Maps/android](Maps/android/) and [Maps/ios](Maps/ios/) hold Capacitor native
shells around the Manarah PWA with app id `com.karamahcollective.manarah`.
They are committed to `main`, but they are excluded from the generated
Cloudflare deployment branches by the deploy allowlist in
[tooling/deploy-agent.mjs](tooling/deploy-agent.mjs).

Native build outputs such as `Maps/android/**/build`, `Maps/dist`, and
`Maps/ios/App/App/public` are ignored. Download
`Maps/android/app/google-services.json` from Firebase per machine; do not commit
it. See [docs/CAPACITOR_PROGRESS.md](docs/CAPACITOR_PROGRESS.md) and
[Maps/README.md](Maps/README.md) for native status.

## Deployment

`main` is the full collaboration branch. `preview` and `deploy` are generated
deployment branches containing only the files Cloudflare Pages needs.

Do not hand-edit `preview` or `deploy`. Make source changes on `main`, commit
them there, then use the deploy agent:

```sh
npm run deploy:agent -- plan main
npm run deploy:agent -- validate main
npm run deploy:agent -- sync preview --push
npm run deploy:agent -- sync deploy --push
```

Use [DEPLOYMENT.md](DEPLOYMENT.md) as the deployment runbook. It documents
branch policy, Cloudflare project roots, Pages build settings, D1/R2 bindings,
required secrets, migration commands, and verification steps.

## Release Discipline

- Stage only the changes that belong to the release.
- Commit source changes on `main` before syncing generated branches.
- Let the deploy agent build `preview` and `deploy`.
- Do not commit generated local caches, private env files, or native build
  outputs.
- Keep unrelated local work out of release commits.

The copied Website Git history is preserved locally in
`.local-backups/website-git-original` and is excluded from this repository.
Previous nested lockfiles and dependency folders are archived under
`.local-backups/workspace-migration` for reference.
