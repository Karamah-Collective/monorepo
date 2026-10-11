# Deploy the monorepo and connect Website administration

## 1. Cloudflare build settings

Use **five separate Cloudflare Pages projects connected to this same GitHub repository**. Each project builds its own folder. This is Cloudflare's supported [monorepo configuration](https://developers.cloudflare.com/pages/configuration/monorepos/).

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

| Setting | Maps project | Website project | Admin project | Links project | Forms project |
| --- | --- | --- | --- | --- | --- |
| Framework preset | None | None | Vite / None | None | None |
| Root directory | `Maps` | `Website` | `Admin` | `Links` | `Forms` |
| Build command | `npm ci --prefix .. && npm run build` | `npm ci --prefix .. && npm run build` | `npm ci --prefix .. && npm run build` | `npm ci --prefix .. && npm run build` | `npm ci --prefix .. && npm run build` |
| Build output directory | `dist` | `dist` | `dist` | `dist` | `dist` |
| Environment variable | `NODE_VERSION=22` | `NODE_VERSION=22` | `NODE_VERSION=22` | `NODE_VERSION=22` | `NODE_VERSION=22` |
| Environment variable | `SKIP_DEPENDENCY_INSTALL=true` | `SKIP_DEPENDENCY_INSTALL=true` | `SKIP_DEPENDENCY_INSTALL=true` | `SKIP_DEPENDENCY_INSTALL=true` | `SKIP_DEPENDENCY_INSTALL=true` |

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
3. In **Settings → Bindings**, keep the existing **`DB`** D1 binding pointing to `halal-finder-db` and the existing **`MEDIA`** R2 binding pointing to `manarah-media`. Production must retain those Maps-only stores; Preview should retain its separate preview stores.
4. Point production at `deploy` and preview at `preview`. Both branches are generated by `npm run deploy:agent`; do not hand-edit or copy files into them.
5. Deploy the migration and check the map, search, place details, login and Admin's map overview. The public map URL and `/api/*` paths stay the same.

`Maps/wrangler.toml` is intentionally for local development. It has no `pages_build_output_dir`, so this migration does not replace your dashboard's production bindings. Do not add that option casually: it makes the Wrangler file the deployment configuration source of truth. See [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

### Maps: weekly digest email

The weekly Manarah digest now lives in this monorepo:

- The scheduled caller is `.github/workflows/weekly-analytics-report.yml`.
- The protected endpoint is `Maps/functions/api/weekly-report.js`, deployed at `/api/weekly-report` on the Maps Pages project.
- Recipients are managed from Admin → Workspace → Weekly report. Each recipient receives an individual email with an unsubscribe link.
- If the D1 recipient table has not been migrated yet, the endpoint falls back to `REPORT_TO`, which defaults to `home@karamahcollective.com`. Once the table exists, the subscribed rows are authoritative.

Apply `Maps/migrations/0027_weekly_report_subscribers.sql` to both the production and Preview D1 databases used by Maps before relying on the Admin recipient manager. The migration seeds `home@karamahcollective.com` as subscribed and grants `reports.manage` to the built-in Content editor role. Administrators can also manage report recipients because they have full workspace access.

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

The repository includes `.github/workflows/daily-d1-backup.yml`, which backs up the production `halal-finder-db` and `forms-db` databases to the private `karamah-database-backups` R2 bucket every day at 02:00 UTC. The preview database is deliberately excluded.

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
```

These are public API origins, without trailing paths. They contain no secrets and are embedded at build time. Rebuild Admin after changing them.

### Links: create the shared-D1 project

Create a fourth Pages project with the Links column settings above and attach
`links.karamahcollective.com` (or set `VITE_LINKS_ORIGIN` in Admin if using a
different hostname). Add a `DB` D1 binding that targets the same production
database as Maps, and use the preview database for preview deployments. Apply
`Maps/migrations/0011_link_hub.sql` and
`Maps/migrations/0012_link_hub_content.sql`, then
`Maps/migrations/0013_link_hub_card_overrides.sql`, then
`Maps/migrations/0014_link_hub_optional_copy.sql`, then
`Maps/migrations/0015_link_hub_socials.sql` before the first deployment. The public
project only reads published links and records aggregate open counts; all
editing remains behind the existing Firebase-protected Maps admin API.

### Forms: create the dedicated D1/R2 project

Create a fifth Pages project with root directory `Forms`, then use the Forms
column in the build-settings table above. Connect Production to `deploy` and
Preview to `preview`; these generated branches now include Forms source,
Functions, its static 404/preview documents, and every shared dependency it
needs to build.

In the Forms project bindings, bind `DB` to the dedicated `forms-db` D1
database and `MEDIA` to the dedicated private `forms-media` R2 bucket. Use
dedicated preview storage for Preview deployments so test responses and uploads
never touch production. Apply `Maps/migrations/0021_forms.sql`,
`Maps/migrations/0022_form_share_codes.sql`, and
`Maps/migrations/0023_shorten_form_share_codes.sql`, and
`Maps/migrations/0024_form_share_code_aliases.sql`, then
`Maps/migrations/0030_form_collaborators.sql` to both environments
before the first deploy. Optionally set `FIREBASE_PROJECT_ID` only when the
environment uses a Firebase project other than `halal-map-karamah`.
Set `ADMIN_ACCESS_URL` only when the Forms deployment should resolve
administrator roles from a non-production Admin API; production defaults to
`https://karamahcollective.com/api/admin`.

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

Before deploying the role-aware Admin build, apply
`Maps/migrations/0025_admin_roles.sql` and
`Maps/migrations/0026_granular_admin_roles.sql`, then
`Maps/migrations/0029_access_foundation.sql`, then
`Maps/migrations/0031_member_profiles.sql` to both the production and Preview D1
databases used by Maps. The Website Pages project must use the same `DB` D1
binding so website-role checks can read these assignments. In Firebase
Authentication, enable the **Google** provider and ensure
`admin.karamahcollective.com` remains an authorized domain. The migration
seeds `moontasir@karamahcollective.com` as Administrator; after deploying,
sign in with that account and use **Workspace → Roles & access** to give other
Workspace accounts a role.

Set `BREVO_API_KEY` on the Maps Pages project to email access requests to the
administrator selected by the requester. Requests remain stored in D1 when
email delivery is not configured.

### Admin Gmail connection

For the direct Manarah Gmail integration, apply
`Maps/migrations/0033_shared_inbox.sql` through
`Maps/migrations/0038_inbox_typing_presence.sql` in order, then apply
`Maps/migrations/0039_personal_gmail_connections.sql`, then
`Maps/migrations/0040_hafsa_contact_access.sql` and
`Maps/migrations/0041_shared_gmail_mailboxes.sql` to the production and
Preview Maps D1 databases. These migrations create the inbox storage used by
both Manarah and personal Gmail sync. Add `GMAIL_CLIENT_ID` and
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
existing Maps D1 database. In the Website Pages project, add a D1 binding named
`DB` that targets the same production database as Maps (`halal-finder-db`), and
add the equivalent preview binding to the preview database. Apply
`Maps/migrations/0009_website_data.sql` before deploying the Website branch.
To preserve existing data, run `node Website/scripts/export-sheet-to-d1.mjs`,
then execute the generated `Website/.local/website-d1-seed.sql` against the
same database. The generated file is ignored by Git because it can contain
signup contact information. After the cutover, `GOOGLE_SHEET_URL`,
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

Use a separate spreadsheet/Apps Script deployment and different secrets for Website Preview if you want to test writes. Point Maps Preview at the existing preview D1 database. In Admin Preview, set `MAPS_ORIGIN` (or `VITE_MAPS_ORIGIN`) and `VITE_WEBSITE_ORIGIN` to those preview services; otherwise its production defaults still point at the live APIs.

For a stable Admin preview hostname, add that exact HTTPS origin to `ADMIN_ALLOWED_ORIGINS` in both the Maps and Website preview projects. Multiple origins are comma-separated, with no path or trailing slash. Also add the Admin hostname to Firebase Authentication's authorized domains. Arbitrary `*.pages.dev` origins are deliberately not trusted.

## 5. Optional: build only affected projects

Under each Pages project's **Build watch paths**, include:

| Project | Include paths |
| --- | --- |
| Maps | `Maps/*`, `shared/*`, `package.json`, `package-lock.json` |
| Website | `Website/*`, `shared/*`, `package.json`, `package-lock.json` |
| Admin | `Admin/*`, `Maps/src/app-settings-schema.js`, `Maps/src/app-controls-schema.js`, `Website/assets/js/content-schema.mjs`, `package.json`, `package-lock.json` |
| Links | `Links/*`, `Maps/migrations/0011_link_hub.sql`, `Maps/migrations/0012_link_hub_content.sql`, `Maps/migrations/0013_link_hub_card_overrides.sql`, `Maps/migrations/0014_link_hub_optional_copy.sql`, `Maps/migrations/0015_link_hub_socials.sql`, `package.json`, `package-lock.json` |
| Forms | `Forms/*`, `shared/forms-domain.mjs`, `shared/firebase-verify.mjs`, `Maps/functions/_forms-admin.js`, `Maps/migrations/0021_forms.sql`, `Maps/migrations/0022_form_share_codes.sql`, `Maps/migrations/0023_shorten_form_share_codes.sql`, `Maps/migrations/0024_form_share_code_aliases.sql`, `package.json`, `package-lock.json` |

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

No remote databases, Apps Script deployments, Cloudflare project settings, DNS records or Git remotes are changed by the local migration scripts.

## 6. Gmail automatic inbox sync

Inbox mail is now synchronized by the server automatically. The default path
does not require Google Pub/Sub or a Workspace administrator:

`Cloudflare scheduled Worker → Gmail history.list → D1 → live admin WebSocket`

Apply the pending inbox migrations `Maps/migrations/0042_*.sql` through
`Maps/migrations/0045_gmail_push_sync.sql` to each environment's D1 database
before deploying the new Maps code. They add cross-device admin actor data,
mail labels, the shared mailbox access update, and Gmail history cursors/watch
expiry; they do not store Gmail access tokens in the browser. Review migration
0044 separately: it expands the `contact-agent` role to manage both shared
mailboxes and should only be applied after that permission change is approved.

### One-time production setup (automatic History API mode)

Deploy the companion Worker and give it the same D1 binding and Gmail OAuth
secrets as Maps:

```sh
cd Maps/workers/gmail-events
npx wrangler deploy
```

The Worker runs every minute, checks every connected shared and personal
mailbox, and notifies open Admin sessions only when new messages were stored.
No browser polling, manual sync, Gmail watch, Pub/Sub topic, or Pub/Sub IAM
principal is required. A mailbox's first automatic run performs its initial
import and stores Gmail's current history cursor; later runs only read changes.

The Worker is separate because Pages Functions can bind to a Durable Object,
but cannot create one inside the Pages project. Bind the Worker script's
`InboxRealtime` class to the Maps Pages project under `INBOX_REALTIME`. See
Cloudflare's [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/)
and [Durable Object WebSocket](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)
documentation.

### Optional Pub/Sub fast path

If the project later gets permission to use Google Pub/Sub, the existing push
path can be enabled as an optimization. It is optional; the one-minute History
API scheduler remains the recovery path.

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
   scheduled History API sync continues to work if Pub/Sub is unavailable.

For Preview, create a separate Pub/Sub subscription targeting the Preview
Maps URL, use a separate push token, and deploy a separate Worker name/DO
namespace. Add the Preview Admin origin to the Maps WebSocket origin allowlist.
Do not point Preview Pub/Sub at production.

### Local automatic sync

The local dev runner starts the Gmail events Worker, binds its
`InboxRealtime` class to local Pages, and triggers the same one-minute
scheduled sync automatically. Add the existing Gmail OAuth variables and
`GMAIL_TOKEN_ENCRYPTION_KEY` to `Maps/.dev.vars`, then run `npm run dev`.
There is no local Pub/Sub tunnel requirement for this mode.

Cloudflare documents the local Durable Object binding form as
`--do BINDING=CLASS@SCRIPT`; the runner uses that form automatically for
`INBOX_REALTIME`. See [local Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/).

The browser no longer polls the inbox and the visible manual sync controls are
removed. If a Gmail history cursor expires, the server automatically performs
a fresh import and establishes a new cursor; this is the recovery behavior
recommended by Google's [watch API documentation](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch).
