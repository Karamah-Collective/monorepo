# Development, testing, and release

This guide turns the architecture into a repeatable engineering workflow. It is intentionally explicit: a contributor should know how to boot the platform, choose a test, make a database change safely, and publish only the requested environment without relying on memory.

Read [Platform architecture](PLATFORM_ARCHITECTURE.md) and [Application guide](APPLICATION_GUIDE.md) first if you do not yet know which application owns your change.

## 1. Prerequisites

* Node.js 22.
* npm and the root `package-lock.json`.
* Cloudflare access only when you need remote bindings, migration execution, or deployment.
* Firebase project access when testing real sign-in/roles.
* Playwright Chromium for browser suites.

Install once from the repository root:

```sh
npm ci
npx playwright install chromium
```

The root package manager workspace is the source of truth. Do not run `npm install` inside `Maps`, `Website`, `Admin`, `Links`, or `Forms`; local independent lockfiles would make deployments non-reproducible.

## 2. Local configuration

Runtime secrets are not committed. Use ignored local files such as `Maps/.dev.vars` and `Website/.dev.vars`, plus application-specific files documented in application READMEs. `npm run setup:website` can prepare local Website values. See [Environment setup](ENVIRONMENT_SETUP.md) and [Data, identity, and security](DATA_IDENTITY_SECURITY.md) before adding a value.

Local Cloudflare Pages development uses checked-in `wrangler.toml` bindings and persistent local Wrangler state. Production configuration is dashboard-managed for the relevant Pages projects; do not add a deployment output setting or production-only binding casually to a local config file.

## 3. Local development commands

| Need | Command | What happens |
| --- | --- | --- |
| Entire platform | `npm run dev` | Starts Maps, Website, Links, Forms, and Admin with the required local preparation. |
| Manarah only | `npm run dev:maps` | Prepares shared local D1 and runs Maps Pages dev on `8788`. |
| Website only | `npm run dev:website` | Runs Website Pages dev on `8789`. |
| Links only | `npm run dev:links` | Prepares local shared D1, builds/watch Links, runs on `8790`. |
| Forms only | `npm run dev:forms` | Applies Forms local schema steps, builds/watch Forms, runs on `8791`. |
| Admin workflow | `npm run dev:admin` | Starts the APIs Admin requires plus Vite Admin on `5173`. |

Local addresses are stable:

* Maps: `http://127.0.0.1:8788`
* Website: `http://127.0.0.1:8789`
* Links: `http://127.0.0.1:8790`
* Forms: `http://127.0.0.1:8791`
* Admin: `http://127.0.0.1:5173`

`tooling/dev.mjs` owns the coordination. It prepares the local Maps database when Maps is required, applies Forms migrations needed for its local shape, launches `wrangler pages dev` for Pages apps, starts Vite for Admin, and watches build-based public apps. Do not replace it with a personal collection of ports unless you also understand the binding and migration implications.

## 4. Build and test matrix

Run commands from the repository root.

| Scope | Build | Tests |
| --- | --- | --- |
| All workspaces | `npm run build` | Choose focused suites below |
| Maps | `npm run build:maps` | `npm run test:maps` or focused Maps Playwright suite |
| Website | `npm run build:website` | `npm run test:website`, `npm run test:website:ui` |
| Admin | `npm run build:admin` | `npm run test:admin` |
| Links | `npm run build:links` | `npm run test:links` |
| Forms | `npm run build:forms` | `npm run test:forms`, `npm run test:forms:ui` |
| Layout/repository checks | n/a | `npm run check` |

Use the smallest credible set while developing, then broaden it for changes with shared impact. Examples:

* A Form schema/domain change: Forms unit/API/UI tests plus any Admin editor test affected.
* A shared Firebase helper change: tests or manual verification for every consumer; it can affect Maps, Website, Forms, and Admin flows.
* A Maps UI-only change: Maps build and the focused relevant Playwright spec; run wider map coverage before release when risk warrants.
* An Admin visual change: Admin production build plus its relevant Playwright route/spec.
* A migration/API contract change: owner build/tests and a local end-to-end path using the actual Pages function.

Build output alone proves bundling, not authorization, browser behaviour, or data correctness. Conversely, a passing unit test does not prove an app will build under Cloudflare’s deployment command.

## 5. A safe implementation loop

1. **Locate ownership.** Use the application guide to choose an owner app, API, and data store.
2. **Read nearby code first.** Existing endpoint/error/auth patterns are usually intentional.
3. **Change source, not generated output.** Never edit `dist/`, `preview`, or `deploy` as a way to ship a feature.
4. **Run focused local flow.** Check happy path, empty/error state, denied authorization, and mobile layout where relevant.
5. **Build and test.** Run the matrix appropriate to risk.
6. **Review the diff.** `git diff --check` catches whitespace errors; `git status --short` confirms no private/generated/unrelated files are about to be staged.
7. **Document behaviour changes.** Update the application README or platform docs when a new boundary, setup requirement, or operator workflow appears.

## 6. Database changes

All schema changes use a new numbered SQL migration under `Maps/migrations/`. Read the migration sequence first. The location is historical and covers both shared and Forms data.

Recommended process:

1. Write an additive, idempotent-as-appropriate migration with clear table/index naming.
2. Update the owner function/data code and validation in the same change.
3. Prepare local state via normal `npm run dev` tooling and exercise the feature.
4. Add/adjust test coverage.
5. Identify whether Preview and Production need the migration before deploying code that depends on it.
6. Apply remote migration only with the correct database/configuration and explicit release authority.
7. Verify with a narrow, read-only query and the product flow.

Never edit an old migration after it might have run remotely. Never use a local seed or convenience script against production. See `DEPLOYMENT.md` for exact remote database and Forms setup instructions.

## 7. Release model

The platform uses one source branch and generated deployment branches:

```text
reviewed source on main
        |
        +-- deploy agent --> preview (optional Cloudflare preview release)
        `-- deploy agent --> deploy  (Cloudflare production release)
```

`preview` and `deploy` are generated deployment trees. They contain the source/files Cloudflare needs, plus generated release metadata; they are not hand-edited and should not receive normal feature commits.

### Standard production release

1. Verify the intended source files and tests.
2. Stage **only** the intended source files.
3. Create a structured source commit on `main`.
4. Push `main`.
5. Generate/push `deploy` with the deploy agent.

```sh
git add <intended paths>
npm run deploy:agent -- commit --subject "type: concise summary" --body "Explain the user-visible and operational change."
git push origin main
npm run deploy:agent -- validate main
npm run deploy:agent -- sync deploy --push
```

Use `sync preview --push` when the explicit requested target is Preview. Do not publish both generated branches by default. The target requested by the release owner determines which generated branch is pushed.

### Why the deploy agent exists

It prevents drift between the monorepo and Cloudflare-facing deployment trees, includes required shared assets/dependencies, and leaves a trace from a generated release back to the reviewed source commit. It also supports `plan` and `validate` so a contributor can inspect scope before publishing.

## 8. Cloudflare build configuration

Each Pages project is connected to this repository with a different root directory: `Maps`, `Website`, `Admin`, `Links`, or `Forms`. The common build command is `npm ci --prefix .. && npm run build`, output is `dist`, Node is 22, and `SKIP_DEPENDENCY_INSTALL=true` is configured in Cloudflare. The complete authoritative matrix is in `DEPLOYMENT.md`.

Folder capitalization matters on Cloudflare’s Linux build machines. `Admin` is not `admin`. The root lockfile must remain available to the project build. An app’s local Wrangler file may intentionally omit `pages_build_output_dir` so the dashboard retains binding ownership.

## 9. Release verification

After a deployment, verify proportionately to the changed scope:

* Public app: load the production URL, inspect the changed public flow, and check browser console/network for errors.
* Admin: sign in with an authorized account, confirm the target route, loading/error state, and denied access behaviour where possible.
* Data change: verify a safe read and the visible product flow; do not expose/export private records to prove a migration.
* Forms: publish a harmless test form, test route/schema/logic/upload as applicable, inspect a response through Admin, and remove only if normal product policy permits.
* Maps: check map load, search/place flow, account/auth flow if touched, and any affected external integration.
* Health/monitoring: call the appropriate GET/HEAD endpoint and allow monitor cache/check intervals to refresh.

## 10. Troubleshooting mindset

First identify the layer: build, static frontend, Pages Function, token/permission, D1/R2 binding, third-party provider, or generated branch. Read the smallest relevant log and reproduce locally if safe. Avoid “fixing” a production issue by adding a client-side bypass, copying a secret into a public config, or changing a generated branch directly.

Helpful first checks:

* `git status --short` — unexpected/unrelated work?
* `npm run build:<workspace>` — source compiles?
* local `npm run dev:<workspace>` — correct function/binding route?
* browser Network response — static routing, CORS, auth, or API issue?
* Cloudflare binding/secret dashboard — correct environment/project, without printing secret values?
* `DEPLOYMENT.md` — correct project root, branch, build output, migration order?

Continue with [Operations guide](OPERATIONS_GUIDE.md) for monitoring and incident response.
