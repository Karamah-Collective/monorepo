# Deploy the monorepo and connect Website administration

## 1. Cloudflare build settings

Use six Git-connected Cloudflare Pages projects connected to this same GitHub repository (Maps, Website, Admin, Links, Forms, and Projects). Each app builds from its own folder. This is Cloudflare's supported [monorepo configuration](https://developers.cloudflare.com/pages/configuration/monorepos/).

The live Projects Pages project is named `projects` and serves
`projects.karamahcollective.com`. A separate older project named
`karamah-projects` exists as Direct Upload, but it is not the live target and
must not receive production uploads.

Branch policy:

| Branch | Purpose | Contents |
| --- | --- | --- |
| `main` | Collaboration and source of truth | Full monorepo: source, docs, tests, prompts, tooling |
| `preview` | Cloudflare preview deployments | Generated deployment tree only |
| `deploy` | Cloudflare production deployments | Generated deployment tree only |

Prepare `preview` and `deploy` with the master deploy agent:

```sh
npm run deploy:agent -- plan main
npm run deploy:agent -- validate main
npm run deploy:agent -- sync preview
npm run deploy:agent -- sync deploy
```

Add `--push` to the sync commands when you are ready to publish the generated branches.

### Deployment request routing

Treat the user's requested target as authoritative. Always commit and push the
reviewed source changes to `main` first, then publish only the named generated
branch:

| User request | Push `main` | Push `preview` | Push `deploy` |
| --- | --- | --- | --- |
| `deploy` or `deployment deploy` | Yes | No | Yes |
| `preview` or `deployment preview` | Yes | Yes | No |
| `main` or `deployment main` | Yes | No | No |

Do not publish both generated branches by default. A production deployment
skips `preview`; a preview deployment skips `deploy`; a main-only request skips
both generated branches. Publish more than one generated branch only when the
user explicitly names each target.

### Release discipline

### What belongs in each branch

Do not treat the three branches as three copies of the same working tree:

| Location | What belongs there | What does not belong there |
| --- | --- | --- |
| Local working tree | Any work currently being developed or tested locally, including unfinished experiments and user-specific files | Anything that has not been reviewed for release |
| `main` | The reviewed source of truth, documentation, migrations, tests, and buildable app code intended for collaboration | Local-only secrets, `.dev.vars`, auth storage, temporary screenshots, unfinished experiments, or unrelated work |
| `preview` | The deploy-agent-generated preview tree, created only from an approved `main` source commit | Hand-edited source, unrelated local changes, or a manually copied app folder |
| `deploy` | The deploy-agent-generated production tree, created only from an approved `main` source commit | Preview-only experiments, hand-edited generated files, or unreviewed local work |

The promotion direction is one-way for a release: reviewed local changes are
selected into a source commit on `main`, and only that commit is synchronized
to the explicitly requested generated branch. A change being present on
`main` does not authorize publishing it to `preview` or `deploy`; a change in
the local working tree does not authorize putting it on `main`.

Before selecting files, inspect the worktree and the source diff:

```powershell
git status --short
git diff --stat
git diff -- <intended paths>
```

Stage only the release scope. Do not use `git add .` for a release when the
working tree contains unrelated work:

```powershell
git add <intended paths>
npm run deploy:agent -- commit --subject "feat: concise release summary" --body "Explain the user-visible change and any operational setup required."
```

Then validate the source commit before generating a branch:

```powershell
npm run deploy:agent -- plan main
npm run deploy:agent -- validate main
```

Only after validation, synchronize the named target. These commands are
mutating when `--push` is supplied, so leave `--push` off for a dry review:

```powershell
# Preview request only
npm run deploy:agent -- sync preview

# Production request only
npm run deploy:agent -- sync deploy

# Add --push only after reviewing the generated diff and validation output.
```

Never run both sync commands by habit. A production request synchronizes
`deploy` and skips `preview`; a preview request synchronizes `preview` and
skips `deploy`; a main-only request synchronizes neither generated branch.

### Documentation gate

The onboarding documentation is part of the release contract. Run this from
the repository root before every Preview or Production release:

```sh
npm run docs:check
```

It verifies the required onboarding documents, their internal links, required
service/application coverage, and a minimum documentation depth. The deploy
agent runs the same command during `npm run deploy:agent -- validate`, so a
release cannot be validated with a broken or incomplete documentation map.
When a change adds or changes an application boundary, service, secret,
binding, role, migration, operational procedure, or significant user flow,
update the relevant `docs/` guide in the same source commit.

Before syncing a release branch, stage only the intended source changes and
create a structured source commit on `main`. Use the deploy agent so each
commit has a concise subject plus an explanatory body:

```sh
git add <intended paths>
npm run deploy:agent -- commit --subject "feat: concise release summary" --body "Explain the user-visible change and any operational setup required."
```

Do not sweep unrelated local work into a release commit; either leave it
untouched or separate it into its own reviewed commit. Run the relevant build
and tests before `sync --push`. Generated preview and production commits also
include the source commit and release purpose in their message bodies.

In **Workers & Pages → your project → Settings → Builds & deployments / Build configuration**, use:

| Setting | Maps project | Website project | Admin project | Links project | Forms project | Projects project |
| --- | --- | --- | --- | --- | --- | --- |
| Framework preset | None | None | Vite / None | None | None | None |
| Root directory | `Maps` | `Website` | `Admin` | `Links` | `Forms` | `Projects` |
| Build command | `npm ci --prefix .. && npm run build` | `npm ci --prefix .. && npm run build` | `npm ci --prefix .. && npm run build` | `npm ci --prefix .. && npm run build` | `npm ci --prefix .. && npm run build` | `npm ci --prefix .. && npm run build` |
| Build output directory | `dist` | `dist` | `dist` | `dist` | `dist` | `dist` |
| Environment variable | `NODE_VERSION=22` | `NODE_VERSION=22` | `NODE_VERSION=22` | `NODE_VERSION=22` | `NODE_VERSION=22` | `NODE_VERSION=22` |
| Environment variable | `SKIP_DEPENDENCY_INSTALL=true` | `SKIP_DEPENDENCY_INSTALL=true` | `SKIP_DEPENDENCY_INSTALL=true` | `SKIP_DEPENDENCY_INSTALL=true` | `SKIP_DEPENDENCY_INSTALL=true` | `SKIP_DEPENDENCY_INSTALL=true` |

The explicit install uses the shared root lockfile. Set those environment variables for both Production and Preview. Cloudflare documents the root/output settings in [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) and the install override in [build image configuration](https://developers.cloudflare.com/pages/configuration/build-image/).

### Automatic release versions and cache refresh

Every production build derives one shared release version from Cloudflare's
`CF_PAGES_COMMIT_SHA` (with GitHub, local Git, and timestamp fallbacks). The
Website and Links builds append that version to local asset URLs, Admin embeds
it in the Vite bundle and clears old Cache Storage entries when it changes, and
Maps uses it for the service-worker cache name. Consequently, every deployed
commit requests fresh application assets without requiring a manual version
edit. Keep `tooling/build-version.mjs` and `shared/brand/karamah-logo.svg` in the generated
deployment branches; `npm run deploy:agent -- sync ...` includes both.

HTML entry points remain revalidated while fingerprinted or versioned assets
may be cached immutably. Do not replace the app-specific `_headers` files with a
blanket long-lived cache rule for `/` or `index.html`.

Folder capitalization matters on Cloudflare's Linux builders. Use `Admin`, not `admin`. Output `dist` is relative to each project's root directory; do not enter `Maps/dist` when the root is already `Maps`.

### Maps: keep the existing project

1. Open the current Maps Pages project and apply the Maps column above.
2. Keep its existing custom domain, production environment variables and secrets.
3. In **Settings → Bindings**, keep the production **`DB`** D1 binding pointing to `halal-finder-db` and the existing **`MEDIA`** R2 binding pointing to `manarah-media`. Also add **`ADMIN_DB`** → `karamah-admin-db`, **`PROJECTS_DB`** → `karamah-projects-db`, and **`ADMIN_MEDIA`** → `karamah-admin-media`. These bindings are required by the shared Admin API; putting `PROJECTS_DB` on the Projects or Admin Pages project does not make it available to Maps. This setup intentionally does not require a preview D1 binding.
4. Point production at `deploy` and preview at `preview`. Both branches are generated by `npm run deploy:agent`; do not hand-edit or copy files into them.
5. Deploy the migration and check the map, search, place details, login and Admin's map overview. The public map URL and `/api/*` paths stay the same.

`Maps/wrangler.toml` is a local-development configuration and checked-in
binding reference. The production Pages bindings must also be present on the
Maps project in Cloudflare, because that is the Pages Function that receives
`/api/admin` requests. A binding on the browser Projects app or the Admin
proxy app does not reach Maps. See [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

### Unified Admin database

halal-finder-db is reserved for Manarah source data. Admin identity, Website,
Links, Inbox/Gmail, MCP/OAuth, reports, Operations tasks, approvals, and
revisions remain in karamah-admin-db. Project work is authoritative in
karamah-projects-db; the old project tables in Admin D1 are rollback copies.
Forms remains an independent product boundary with its own D1 database and
dedicated `forms-media` R2 bucket.

Production database:

| Environment | Database | ID |
| --- | --- | --- |
| Production | `karamah-admin-db` | `a52a5509-eabd-44a1-979c-c4491e3ca1a8` |

The binding is ADMIN_DB on Maps and DB on Website and Links. Projects use
PROJECTS_DB on the Maps Admin API. Forms keeps DB=forms-db and
MEDIA=forms-media. The source databases are intentionally
retained as a rollback copy until the cutover has been verified. The
Operations-only database is no longer a runtime binding; its task data is
copied into the unified Admin database for the later Operations rollout.

The Admin schema is applied by migrations 0050 and 0051, followed by the
Projects permission baseline in 0053. Migration 0052 is
retained only as a rollback copy of the first project implementation; the
authoritative project schema is Maps/project-migrations/0001_project_workspace.sql,
0002_project_productivity.sql, and 0003_project_member_permissions.sql. The
second migration adds saved views, notifications, watchers, time entries,
custom fields, templates, and webhook configuration. The third migration adds
per-member read/write grants and task visibility scopes.
Forms data is authoritative only in forms-db. The project backfill is copy-only
and never deletes source rows. For the dedicated Projects database run:

```powershell
node scripts/migrate-projects-db.mjs --remote --confirm
```

Do not apply 0052 to a new Projects database; it is retained only for
rollback compatibility in the old Admin database.

The project UI is enabled for the internal beta through
`PROJECTS_UI_ENABLED` in `Admin/src/config/features.js`. Google Tasks remains
optional and can be configured later. When enabled, Google Tasks uses
`GOOGLE_TASKS_CLIENT_ID`, `GOOGLE_TASKS_CLIENT_SECRET`,
`GOOGLE_TASKS_REDIRECT_URI`, and `GOOGLE_TASKS_TOKEN_ENCRYPTION_KEY`. The
redirect URI is
`https://admin.karamahcollective.com/api/google-workspace/oauth/callback`.
The existing Gmail OAuth connection is not silently expanded. Create the
private R2 bucket `karamah-admin-media` and bind it as `ADMIN_MEDIA` before
enabling task attachments.

The current Cloudflare account lists six Git-connected Pages projects for this
repository, including the live Projects project named `projects`. Keep its
Production branch set to `deploy`, its Preview branch set to `preview`, its
root directory set to `Projects`, and its output directory set to `dist`.
The old Direct Upload project `karamah-projects` is not part of this release
path. Do not upload new production builds to it.

The Projects `VITE_*` values are public build configuration, not secrets. Do
not put D1 credentials, Firebase service-account keys, MCP signing keys, or
Admin bearer tokens in the Projects Pages variables.

The script reads Admin-owned data from `halal-finder-db` and the existing
Operations database, writes to `karamah-admin-db`, and prints target row
counts. It does not copy Forms tables. Do not drop old Admin tables until the
production bindings, public Forms and Links routes, Admin access, Inbox/Gmail,
and MCP OAuth have all been verified.

### Maps: weekly digest email

The weekly Manarah digest now lives in this monorepo:

- The scheduled caller is `.github/workflows/weekly-analytics-report.yml`.
- The protected endpoint is `Maps/functions/api/weekly-report.js`, deployed at `/api/weekly-report` on the Maps Pages project.
- Recipients are managed from Admin → Workspace → Weekly report. Each recipient receives an individual email with an unsubscribe link.
- If the D1 recipient table has not been migrated yet, the endpoint falls back to `REPORT_TO`, which defaults to `home@karamahcollective.com`. Once the table exists, the subscribed rows are authoritative.

Apply `Maps/migrations/0027_weekly_report_subscribers.sql` to the production Admin database before relying on the Admin recipient manager. The migration seeds `home@karamahcollective.com` as subscribed and grants `reports.manage` to the built-in Content editor role. Administrators can also manage report recipients because they have full workspace access.

Copy the old `REPORT_SECRET` value into both places:

| Location | Name | Notes |
| --- | --- | --- |
| GitHub repository secret | `REPORT_SECRET` | Used by the weekly workflow when it calls the endpoint |
| Maps Pages secret | `REPORT_SECRET` | Used by the endpoint to authenticate the workflow request |
| GitHub repository variable | `REPORT_URL` | Optional; defaults to `https://maps.karamahcollective.com/api/weekly-report` |
| Maps Pages secret | `BREVO_API_KEY` | Existing Brevo transactional HTTP API key |
| Maps Pages secret | `CLOUDFLARE_ANALYTICS_TOKEN` | Cloudflare GraphQL Analytics token |
| Maps Pages variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID used by analytics queries |

Optional Maps Pages variables are `REPORT_FROM`, `REPORT_FROM_NAME`, and `REPORT_TO`; leave them unset to match the old digest sender/recipient. After adding or rotating secrets, run the workflow manually with `dry_run=true`, then run it again with `dry_run=false` to send a real test digest. Disable the old halal-maps repository schedule once the monorepo workflow succeeds so the team does not receive duplicate weekly emails.

### D1 database backups

The repository includes `.github/workflows/daily-d1-backup.yml`, which backs up
the production `halal-finder-db` and `karamah-admin-db` databases to the
private `karamah-database-backups` R2 bucket every day at 02:00 UTC. The
preview database is deliberately excluded.

Configure these GitHub Actions values:

| Type | Name | Value |
| --- | --- | --- |
| Repository secret | `CLOUDFLARE_DB_BACKUP_API_TOKEN` | Cloudflare API token with D1 read and Workers R2 Storage read/edit permissions |
| Repository variable | `CLOUDFLARE_ACCOUNT_ID` | `4679b2bc7d254ccaf8243a3c727148f9` |

Backups use this retention policy:

- Daily: 7 days
- Weekly: 1 month
- Monthly: 3 months

Run the workflow manually once after setup from GitHub → Actions → Daily D1 backup. Confirm that both databases produce objects in the private R2 bucket. D1 Time Travel remains the first recovery option for recent accidental changes; the R2 exports are the longer-retention disaster-recovery copy.

### Admin: update the folder too

Apply the Admin column to its existing Pages project. Use `admin.karamahcollective.com` for the admin dashboard and keep the existing Firebase project. Production defaults already call the existing Maps and Website domains.

Admin's same-origin `/api/admin` proxy reads `MAPS_ORIGIN` at runtime and
falls back to `https://maps.karamahcollective.com`. It also accepts
`VITE_MAPS_ORIGIN` for compatibility with existing Pages variables.

Optional build variables, useful while testing a replacement Website project:

```text
VITE_MAPS_ORIGIN=https://maps.karamahcollective.com
VITE_WEBSITE_ORIGIN=https://karamahcollective.com
VITE_PROJECTS_APP_URL=https://projects.karamahcollective.com
VITE_FORMS_ORIGIN=https://forms.karamahcollective.com
VITE_LINKS_ORIGIN=https://links.karamahcollective.com
```

For the current Admin Pages project, configure these **Production and Preview
build variables** explicitly:

| Name | Required for current production | Purpose |
| --- | --- | --- |
| `VITE_MAPS_ORIGIN` | Yes | Public Maps/Admin API origin used by browser API calls. |
| `VITE_WEBSITE_ORIGIN` | Yes if Website administration is used | Website API origin used by Website content and team controls. |
| `VITE_PROJECTS_APP_URL` | Yes for the Projects handoff | URL opened by Admin's Projects pages and links. |
| `VITE_FORMS_ORIGIN` | Required when Admin links to the deployed Forms app | Public Forms origin. |
| `VITE_LINKS_ORIGIN` | Required when Link Hub uses the deployed Links app | Public Links origin. |

These are public origins, without trailing paths. They are not secrets and are
embedded into the Admin build. Firebase's browser configuration is currently
compiled from `Admin/src/firebase.js`; there is no Firebase service-account
secret to add to the Admin Pages variables. Keep Firebase authorized domains
configured separately in Firebase Authentication.

In **Admin → Settings → Variables and Secrets**, set the runtime variable
`MAPS_ORIGIN=https://maps.karamahcollective.com` for Pages Functions. Admin's
`/api/admin`, MCP proxy, and inbox-event proxy use it to reach Maps. It is a
runtime variable, not a `VITE_*` browser build variable. The Admin Pages app
does not need a D1 binding for the current proxy architecture; D1 bindings
belong to Maps.

Rebuild Admin after changing any `VITE_*` value. Updating only a Pages runtime
variable does not change values already embedded in the browser bundle.

### Admin MCP: remote, role-scoped automation

The Admin Pages project exposes the Streamable HTTP MCP resource at
`https://admin.karamahcollective.com/mcp`. OAuth metadata is available at
`/.well-known/oauth-protected-resource/mcp` and
`/.well-known/oauth-authorization-server`; the protocol endpoints are
`/oauth/authorize`, `/oauth/token`, `/oauth/register`, and `/oauth/revoke`.

MCP tables are part of the Admin schema migrations and are created in
`karamah-admin-db` by the unified backfill. They are no longer stored in the
Manarah database. The schema stores only hashes for OAuth
codes and access/refresh tokens. Each client registration must use HTTPS or a
loopback redirect URI; authorization requires PKCE S256.

Set these values in Maps, Website, and Forms for Production:

| Project | Name | Purpose |
| --- | --- | --- |
| Maps | `MCP_INTERNAL_SIGNING_KEY` | HMAC key for short-lived gateway assertions |
| Website | `MCP_INTERNAL_SIGNING_KEY` | Verifies assertions from Maps MCP |
| Forms | `MCP_INTERNAL_SIGNING_KEY` | Verifies Forms and media assertions |
| Maps | `WEBSITE_ORIGIN`, `FORMS_ORIGIN` | Owner-service HTTPS origins used by MCP |
| Admin | `MAPS_ORIGIN` | Maps MCP/OAuth proxy origin |

The signing key must be at least 32 characters and must be identical only
within one environment. Do not put it in a `VITE_*` variable or browser code.
For local development, use Maps 8788, Website 8789, and Forms 8791 and set
the owner origins explicitly. After migration, verify metadata, consent, token
exchange, filtered `tools/list`, a confirmed write, live role downgrade, and
connection revocation. Configure Cloudflare edge rate
limits for `/mcp`, `/oauth/register`, `/oauth/token`, and `/oauth/authorize`
before exposing the production hostname; keep registration and token routes
stricter than normal tool calls.

### Links: create the shared-D1 project

Create a fourth Pages project with the Links column settings above and attach
`links.karamahcollective.com` (or set `VITE_LINKS_ORIGIN` in Admin if using a
different hostname). Add a `DB` D1 binding to `karamah-admin-db`, and use
Apply the Admin schema migration and run the unified Admin backfill before the
first deployment. The public
project only reads published links and records aggregate open counts; all
editing remains behind the existing Firebase-protected Maps admin API.

### Forms: create the dedicated D1/R2 project

Create a fifth Pages project with root directory `Forms`, then use the Forms
column in the build-settings table above. Connect Production to `deploy` and
Preview to `preview`; these generated branches now include Forms source,
Functions, its static 404/preview documents, and every shared dependency it
needs to build.

In the Forms project bindings, bind `DB` to the dedicated `forms-db` D1
database and `MEDIA` to the private `forms-media` R2 bucket. There is no
preview D1 requirement. Apply the Forms migrations before the first deploy.
Optionally set `FIREBASE_PROJECT_ID` only when the
environment uses a Firebase project other than `halal-map-karamah`.
Set `ADMIN_ACCESS_URL` only when the Forms deployment should resolve
administrator roles from a non-production Admin API; production defaults to
`https://admin.karamahcollective.com/api/admin`.

Run `npm run migrate:form-links -- --remote` to create three-character short
links that redirect to the long canonical form URLs.

First verify the Forms `pages.dev` hostname: publish one test form in Admin,
open its public URL, complete a conditional path and an upload, then inspect
the response, CSV export, analytics, version history, and Admin preview.
After that, attach `forms.karamahcollective.com`, set `VITE_FORMS_ORIGIN` to
that exact HTTPS origin in the Admin Pages project, and redeploy Admin. The
Forms project exposes only published schemas, validated submissions, and
non-guessable presentation assets; Maps retains the Firebase-protected form
management and cover-asset endpoints. Respondent uploads remain private.

## 2. Move the Website deployment to this repository

## Admin Google sign-in and roles

Before deploying the role-aware Admin build, run the unified Admin schema and
backfill. The Maps Pages project uses `ADMIN_DB`, and Website uses the same
database as its `DB` binding, so website-role checks read these assignments.
In Firebase
Authentication, enable the **Google** provider and ensure
`admin.karamahcollective.com` remains an authorized domain. The migration
seeds `moontasir@karamahcollective.com` as Administrator; after deploying,
sign in with that account and use **Workspace → Roles & access** to give other
Workspace accounts a role.

Set `BREVO_API_KEY` on the Maps Pages project to email access requests to the
administrator selected by the requester. Requests remain stored in D1 when
email delivery is not configured.

### Admin Gmail connection

For the direct Manarah Gmail integration, the inbox and Gmail tables are
created in `karamah-admin-db[-preview]` by the unified schema/backfill. Add
`GMAIL_CLIENT_ID` and
`GMAIL_OAUTH_REDIRECT_URI` as Maps variables or secrets, and add
`GMAIL_CLIENT_SECRET` plus a 32-byte hex/base64
`GMAIL_TOKEN_ENCRYPTION_KEY` as Maps secrets. The production redirect URI is
`https://maps.karamahcollective.com/api/gmail/oauth/callback`; add the local
redirect URI separately when developing with Wrangler.

After the Maps and Admin builds are live, only
`moontasir@karamahcollective.com` opens **Workspace → Admin preferences →
Manarah Gmail**, connects the mailbox while signed in as
`manarah@karamahcollective.com`, and runs the first sync. The stored Gmail
refresh token is encrypted server-side. Other authorized Admin members cannot
start or disconnect OAuth, while mailbox-scoped permissions continue to control
which members can read and send from Manarah.

For the shared Contact mailbox, Hafsa opens **Workspace → Admin preferences**
and connects **Contact Gmail** while signed in as
`contact@karamahcollective.com`. The OAuth connection is stored separately
from Manarah and becomes available to everyone with Contact mailbox access.
The migration grants `hafsa@karamahcollective.com` read and manage access to
the mailbox without granting access to Manarah.

If the existing Website project uses the old repository, create a replacement Pages project connected to this monorepo. Cloudflare documents creating a new project when changing repositories in its [known issues](https://developers.cloudflare.com/pages/platform/known-issues/).

1. In **Workers & Pages**, create a **Pages** application and import this GitHub repository. Use a new project name, for example `karamah-website-monorepo`.
2. Select the branch containing this migration. Apply the Website build settings above.
3. Copy the existing Website environment values into the new project's **Settings → Variables and Secrets**. This application supports the existing aliases, but the preferred names are:

   | Name | Value |
   | --- | --- |
   | `GOOGLE_SHEET_URL` | The existing Apps Script web app URL ending in `/exec`, not the spreadsheet URL |
   | `BREVO_API_KEY` | Existing contact-email service key; store as a secret |
   | `RECAPTCHA_SITE_KEY` | Existing public reCAPTCHA site key |
   | `RECAPTCHA_SECRET_KEY` | Existing reCAPTCHA secret; store as a secret |
   | `WEBSITE_ADMIN_KEY` | New random secret; see the next section |
   | `WEBSITE_FORM_KEY` | A different new random secret; see the next section |

   `googleSheetsURL` and `googleSheetUrl` are accepted as compatibility aliases, so the current Cloudflare value can keep working. Prefer `GOOGLE_SHEET_URL` for new setup because all diagnostics and examples use that name.

4. Complete the Sheets setup below and deploy. Test the new `*.pages.dev` URL before moving the real domain. Add that test hostname to reCAPTCHA's allowed domains if testing the real contact form there.
5. When ready to switch, remove `karamahcollective.com` from the old project's **Custom domains**, then add it to the new project's **Custom domains**. Follow Cloudflare's DNS instructions and wait for **Active**. Move `www.karamahcollective.com` too if it is attached to the old project, or retain your existing `www` redirect.
6. Verify the actual domain, team directory, contact form and Admin Website pages. Keep the old Pages project until you have verified the migration.

Attach the domain through the Pages dashboard before relying on a DNS record alone. Cloudflare describes that flow in [custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/). During the domain transfer, certificate/DNS activation may take time.

## 3. Connect Google Sheets to Admin

### Website data: D1 cutover

Website team profiles, authored website content, and update signups now use the
unified Admin database. In the Website Pages project, bind `DB` to
`karamah-admin-db`. The
schema and data backfill are handled by `node scripts/migrate-admin-data.mjs`.
After the cutover, `GOOGLE_SHEET_URL`,
`WEBSITE_ADMIN_KEY`, and `WEBSITE_FORM_KEY` are no longer used by Website data
routes and may be removed from the Website Pages project after verification.

This is a one-time update to your **existing spreadsheet-bound Apps Script project**. The new code retains `people_directory` and `updates_opt_ins`; it does not replace existing rows or remove extra columns.

### Generate two secrets

For local development, run:

```sh
npm run setup:website
```

That writes `Website/.dev.vars`, keeps existing values from `Website/.env.local`, and generates local `WEBSITE_ADMIN_KEY` / `WEBSITE_FORM_KEY` values when they are missing or too short. Restart `npm run dev` after the file changes.

For production or if you want to create the values manually, run this command twice and keep the two different outputs:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use one output as `WEBSITE_ADMIN_KEY` and the other as `WEBSITE_FORM_KEY`. Put the same pair in the Website Pages project's secrets and Apps Script's Script Properties. Never put either in an Admin `VITE_*` variable, public JavaScript, or a Sheet cell.

### Update Apps Script

1. Open the spreadsheet → **Extensions → Apps Script**.
2. Save a copy of the currently deployed script for rollback.
3. Replace the old web-app implementation with the complete contents of [Website/reference/google_apps_script.js](Website/reference/google_apps_script.js). Avoid leaving a second `doGet` or `doPost` in another script file.
4. Open **Project Settings → Script Properties** and add `WEBSITE_ADMIN_KEY` and `WEBSITE_FORM_KEY`. This is Google's [Script Properties](https://developers.google.com/apps-script/guides/properties) mechanism.
5. Go to **Deploy → Manage deployments → edit the existing web app**. Select **New version**, execute as the spreadsheet owner, retain **Anyone** access, and deploy. Editing the existing deployment preserves its `/exec` URL. See Google's [web apps](https://developers.google.com/apps-script/guides/web) and [deployment versions](https://developers.google.com/apps-script/concepts/deployments) guides.
6. Redeploy Website after adding/changing Cloudflare secrets. Confirm its `GOOGLE_SHEET_URL` or compatibility alias matches the deployed Apps Script URL.

Public GET requests expose only active team profiles and published content. Private reads/writes require the admin secret. Signup writes require the separate form secret and explicit consent. Admin's browser first authenticates to the Website API with its Firebase ID token; that API verifies the account before contacting Sheets.

### Rollout order

Deploy the new Website code with its variables first, then update the Apps Script deployment, then deploy Admin. The old script accepts the new contact payload's extra fields during the brief transition; Website content falls back to the original copy until the script is upgraded. Once the new Apps Script is active, the old Website contact implementation cannot write opt-ins without the new key, so complete the Website domain cutover promptly.

### What appears automatically

| Sheet | Purpose |
| --- | --- |
| `people_directory` | Existing team; adds biography, location, order, stable IDs and edit revisions |
| `updates_opt_ins` | Existing opt-ins; adds subscribed/unsubscribed status, stable IDs and revisions |
| `website_content` | Created when you first publish website content |
| `website_audit` | Created on the first Admin change; records actor, action, record ID and date |

The existing `Status=active` convention still controls public team visibility. Existing opt-ins with no status are treated as subscribed. Admin can hide a profile without deleting it. CSV exports include only subscribed people. Removing a signup deletes that row; unsubscribing retains it with its status. This feature manages the register and does not send bulk emails.

## 4. Preview environments

If you later need isolated preview writes, create a deliberate preview environment and database plan first. The current free-tier setup intentionally points production at the named databases above and does not use preview D1 bindings.

For a stable Admin preview hostname, add that exact HTTPS origin to `ADMIN_ALLOWED_ORIGINS` in both the Maps and Website preview projects. Multiple origins are comma-separated, with no path or trailing slash. Also add the Admin hostname to Firebase Authentication's authorized domains. Arbitrary `*.pages.dev` origins are deliberately not trusted.

## 5. Optional: build only affected projects

Under each Pages project's **Build watch paths**, include:

| Project | Include paths |
| --- | --- |
| Maps | `Maps/*`, `shared/*`, `package.json`, `package-lock.json` |
| Website | `Website/*`, `shared/*`, `package.json`, `package-lock.json` |
| Admin | `Admin/*`, `Maps/src/app-settings-schema.js`, `Maps/src/app-controls-schema.js`, `Website/assets/js/content-schema.mjs`, `package.json`, `package-lock.json` |
| Links | `Links/*`, `Maps/functions/_link-hub.js`, `Maps/functions/api/admin.js`, `Maps/migrations/0050_admin_database_schema.sql`, `package.json`, `package-lock.json` |
| Forms | `Forms/*`, `shared/forms-domain.mjs`, `shared/firebase-verify.mjs`, `Maps/functions/_forms-admin.js`, `Maps/functions/api/admin.js`, `Maps/functions/api/form-asset.js`, `Maps/migrations/0050_admin_database_schema.sql`, `package.json`, `package-lock.json` |
| Projects | `Projects/*`, `shared/*`, `package.json`, `package-lock.json` |

If you enable Admin build watch paths, also include `Website/assets/images/kc_logo_small_dark.webp` and `Website/assets/images/kc_logo_small_icon.ico`; Admin imports those brand assets directly.

Cloudflare's path wildcard matches nested paths. Keep the shared schema paths because Admin imports those files. See [build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/). Leaving the default of building every project on every push is also valid.

## Verify and troubleshoot

- **Maps and Website builds:** output contains `dist/index.html`; Functions are discovered from the project's `functions/` folder.
- **Website team:** `/api/team` returns only active profiles. Admin → Website → Team directory should show all profiles after sign-in.
- **Setup error:** an Admin message mentioning `GOOGLE_SHEET_URL` or either key means the Website project's variables are missing or the script version is old.
- **403:** check the verified `@karamahcollective.com` account, exact Admin origin and matching Script Properties/Cloudflare secrets.
- **Conflict:** another editor changed the record; close/reopen the team editor or reload website content before editing again. Unsaved changes prompt before leaving.
- **Signup:** submit one explicit test opt-in after deployment and find it in Update signups. If email succeeds but Sheets fails, the visitor is told that the signup was not saved.
- **Content:** publish a harmless test headline, load the Website after a minute, then restore it. Text is rendered literally; HTML/code cannot be injected through these fields. Metadata is also applied to the HTML response for search/link previews.
- **Fallback:** missing Sheets configuration leaves the original Website copy visible. Private controls show a setup error instead of pretending a save succeeded.

The local setup scripts do not change remote databases, Apps Script deployments,
Cloudflare project settings, DNS records, or Git remotes. Use
`migrate-admin-data.mjs --remote --confirm` for the legacy Admin backfill and
`migrate-projects-db.mjs --remote --confirm` for the copy-only Projects
backfill. The separate retirement command is the only legacy-table deletion
path.

## Projects application and database

Projects is a separate Pages application at projects.karamahcollective.com.
The Admin application keeps the overview and control-plane links, while the
Projects application owns board, list, calendar, task detail, comments,
relations, labels, and project membership.

Create one production D1 database named karamah-projects-db. Bind it to the
Maps Pages Functions as PROJECTS_DB and keep the existing ADMIN_DB binding for
roles, MCP, audit, Website, Links, Inbox, and Operations data. Do not bind
Projects directly to D1: the browser calls the authenticated Admin API, so
MCP and browser actions use the same authorization and audit path.

Run the copy-only project migration after the database and binding exist:

    node scripts/migrate-projects-db.mjs --remote --confirm

The source project tables in karamah-admin-db are retained until verification.
Project creators receive project-admin authority, restricted projects require
explicit membership, and workspace-visible projects are open for contribution
to verified Karamah accounts. Restricted-project member access is independently
configurable for project visibility, task read scope (all, assigned, or own),
task creation/editing, assignment, comments, relations, attachments, members,
and project settings.

For local work, node Maps/scripts/local-db.mjs creates the local Projects D1
state and role-varied mock projects. Run npm run dev:projects and open
http://127.0.0.1:5184.

### Projects Pages variables and bindings

Projects is a browser application. It does not receive D1 credentials, Firebase
service-account keys, MCP signing keys, Admin bearer tokens, or Brevo
credentials. Its browser requests go to the authenticated Admin API, and the
Projects database is accessed by the Maps Pages Functions through
`PROJECTS_DB`.

In the **Projects Pages project** (`projects`), set these **Production
and Preview build variables**:

| Name | Required | Value / rule |
| --- | --- | --- |
| `VITE_ADMIN_ORIGIN` | Recommended | `https://admin.karamahcollective.com`; no trailing slash. Hosted Projects safely defaults to this canonical origin if the variable is omitted. |
| `VITE_CLIENT_URL` | Recommended for hosted auth/invitation links | `https://projects.karamahcollective.com`; no trailing slash. Hosted auth falls back to the current browser origin if omitted. |
| `VITE_TURNSTILE_SITE_KEY` | Optional | Set only when the Projects auth/API configuration requires Cloudflare Turnstile. The UI hides the CAPTCHA when this is absent. |
| `VITE_SENTRY_DSN` | Optional | Public Sentry browser DSN, only if Projects error reporting is enabled. |
| `VITE_DEMO_MODE` | No for real deployments | Leave unset or set `false`. Never enable it on the production project. |
| `VITE_API_URL` | Normally no | Leave unset. The hosted app falls back to the Admin origin; setting this overrides that path and is only for a deliberate API topology. |

Do not put `BREVO_API_KEY` or `PROJECTS_ORIGIN` in the Projects Pages
project. The invitation email is sent by `Maps/functions/_project-email.js`,
so those are **Maps Pages runtime variables**:

| Project | Name | Type | Value / rule |
| --- | --- | --- | --- |
| Maps | `BREVO_API_KEY` | Secret | Brevo HTTP API key for the account that can send as `projects@karamahcollective.com`; do not use the SMTP password (`xsmtpsib-...`). |
| Maps | `PROJECTS_ORIGIN` | Variable | `https://projects.karamahcollective.com`; no trailing slash. |
| Maps | `PROJECTS_DB` | D1 binding | Production database `karamah-projects-db`, binding name exactly `PROJECTS_DB`. |
| Maps | `ADMIN_DB` | D1 binding | Production database `karamah-admin-db`, binding name exactly `ADMIN_DB`. |
| Maps | `DB` | D1 binding | Existing `halal-finder-db`, binding name exactly `DB`. Required because the same Admin Function handles other application areas. |
| Maps | `ADMIN_MEDIA` | R2 binding | Existing private `karamah-admin-media` bucket, required for project attachments if enabled. |

`PROJECTS_DB` is not a Pages variable typed as text. It must be a Cloudflare
D1 binding in the Maps Pages project for the environment that serves the
request. Apply the project migrations before the first release:

```powershell
node scripts/migrate-projects-db.mjs --remote --confirm
```

Set `BREVO_API_KEY` as a secret in **Maps → Settings → Variables and Secrets**
for the relevant environment. The sender domain and sender mailbox must be
verified in Brevo. The API key must be Brevo's HTTP API-key format, not its
SMTP password format. After changing a Pages variable or secret, rebuild or
redeploy the affected app; browser `VITE_*` values are embedded at build time.

### Projects Git-connected release

Projects follows the same generated-branch release path as the other apps. The
Pages project must have `Production branch=deploy`, `Preview branch=preview`,
root directory `Projects`, build command `npm ci --prefix .. && npm run build`,
and output directory `dist`. Cloudflare reads the public `VITE_*` values from
the selected environment during its build.

After the reviewed source commit is on `main`, generate and publish only the
requested branch:

```powershell
# Production request only
npm run deploy:agent -- sync deploy --push

# Preview request only
npm run deploy:agent -- sync preview --push
```

Do not run both commands unless both environments were explicitly requested.
Cloudflare then builds the `projects` Pages project from the selected branch.
The `karamah-projects` Direct Upload project is not used by these commands.

Verify the deployed Projects app after upload:

```powershell
Invoke-WebRequest https://projects.karamahcollective.com/auth/sign-in -UseBasicParsing
```

Then sign in through the browser and check one read path and one write path:
open a workspace, open a project, move a task between columns, reload, and
confirm the new state persists. Also send one invitation test only after
verifying that `BREVO_API_KEY` is present on Maps.

## 6. Gmail automatic inbox sync

Inbox mail is now synchronized by the server automatically. The default path
does not require Google Pub/Sub or a Workspace administrator:

`active Admin Inbox WebSocket → Durable Object alarm (30s) → Gmail history.list → D1 → live admin WebSocket`

The inbox and Gmail tables, including actor data, labels, history cursors/watch
expiry, mailbox access, starring, snoozing, and assignment metadata, are part of
the unified Admin schema and backfill. They do not store Gmail access tokens in
the browser. Do not apply the historical inbox migrations to
`halal-finder-db` during this cutover.

### One-time production setup (automatic History API mode)

Deploy the companion Worker and give it the same D1 binding and Gmail OAuth
secrets as Maps:

```sh
cd Maps/workers/gmail-events
npx wrangler deploy
```

The Worker syncs every 30 seconds only while at least one authorized Admin
Inbox tab is open. The existing Durable Object WebSocket starts the alarm when
the first tab connects and stops it when the last tab disconnects. It checks
every connected shared and personal mailbox, and notifies open Admin sessions
only when new messages were stored. There is no always-on mail-sync cron;
the Worker has one daily maintenance trigger solely for optional Pub/Sub watch
renewal. No browser polling, manual sync, Gmail watch, Pub/Sub topic, or
Pub/Sub IAM principal is required for the default mode. A mailbox's first
automatic run performs its initial import and stores Gmail's current history
cursor; later runs only read changes.

The Worker is separate because Pages Functions can bind to a Durable Object,
but cannot create one inside the Pages project. Bind the Worker script's
`InboxRealtime` class to the Maps Pages project under `INBOX_REALTIME`. See
Cloudflare's [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/)
and [Durable Object WebSocket](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)
documentation.

### Optional Pub/Sub fast path

If the project later gets permission to use Google Pub/Sub, the existing push
path can be enabled as an optimization. It is optional; the daily maintenance
trigger renews its watches, while the active-session History API alarm remains
the recovery path while the Inbox is open.

1. Create a Google Cloud Pub/Sub topic, for example
   `projects/PROJECT_ID/topics/manarah-gmail-push`.
2. Grant the Gmail push service account
   `gmail-api-push@system.gserviceaccount.com` permission to publish to that
   topic. Gmail documents this requirement in its [push notification guide](https://developers.google.com/workspace/gmail/api/guides/push).
3. Create a push subscription for that topic with this endpoint:
   `https://maps.karamahcollective.com/api/gmail-push?token=RANDOM_SECRET`.
   The subscription must use the same topic and secret configured below.
4. Add these secrets/variables to the Maps Pages project and to the companion
   Worker. Keep the token private:

   - `GMAIL_PUBSUB_TOPIC` — the full Pub/Sub topic name.
   - `GMAIL_PUBSUB_TOKEN` — a random 32-byte hex secret.
   - `GMAIL_PUBSUB_ENABLED=true` — explicitly enables the optional push path.
   - the existing Gmail OAuth and `GMAIL_TOKEN_ENCRYPTION_KEY` values.

5. Deploy the companion Worker, which owns the Durable Object and renews Gmail
   watches when configured:

   ```sh
   cd Maps/workers/gmail-events
   npx wrangler deploy
   ```

   Configure its D1 binding and Gmail secrets for each environment. The
   Worker is separate because Pages Functions can bind to a Durable Object,
   but cannot create one inside the Pages project. Bind the Worker script's
   `InboxRealtime` class to the Maps Pages project under the binding name
   `INBOX_REALTIME`. See Cloudflare's [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/)
   and [Durable Object WebSocket](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)
   documentation.

6. Reconnect any already-connected Gmail mailbox once after deployment, or
   open its inbox once. New OAuth connections bootstrap automatically. The
   active-session History API sync continues to work if Pub/Sub is unavailable.

For Preview, create a separate Pub/Sub subscription targeting the Preview
Maps URL, use a separate push token, and deploy a separate Worker name/DO
namespace. Add the Preview Admin origin to the Maps WebSocket origin allowlist.
Do not point Preview Pub/Sub at production.

### Local automatic sync

The local dev runner starts the Gmail events Worker and binds its
`InboxRealtime` class to local Pages. The same active-session alarm runs
automatically when the local Inbox WebSocket is open. Add the existing Gmail OAuth variables and
`GMAIL_TOKEN_ENCRYPTION_KEY` to `Maps/.dev.vars`, then run `npm run dev`.
There is no local Pub/Sub tunnel requirement for this mode.

Cloudflare documents the local Durable Object binding form as
`--do BINDING=CLASS@SCRIPT`; the runner uses that form automatically for
`INBOX_REALTIME`. See [local Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/).

The browser no longer polls the inbox; the WebSocket only receives change
notifications and keeps the server-side active-session alarm alive. If a Gmail
history cursor expires, the server automatically performs a fresh import and
establishes a new cursor; this is the recovery behavior recommended by
Google's [watch API documentation](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch).
