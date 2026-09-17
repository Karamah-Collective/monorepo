# Karamah Collective

One repository, four independently deployed applications.

| Folder | Application | Data |
| --- | --- | --- |
| [Maps](Maps/) | Public map and its Cloudflare API | Existing Cloudflare D1 database |
| [Website](Website/) | Collective website, contact form and website API | Existing Google Sheets via Apps Script |
| [Admin](Admin/) | Shared administration for Maps and Website | Authenticated calls to each application's API |
| [Links](Links/) | Public Karamah link hub and read-only API | Existing Cloudflare D1 database |
| [shared](shared/) | Firebase token verification used by both APIs | No credentials |
| [tooling](tooling/) | Local servers and monorepo validation | Local only |

## Start locally

Use Node.js 22 and run these commands from this repository's root:

```sh
npm ci
npm run dev
```

| App | Local address | Start separately |
| --- | --- | --- |
| Maps | http://127.0.0.1:8788 | `npm run dev:maps` |
| Website | http://127.0.0.1:8789 | `npm run dev:website` |
| Admin | http://127.0.0.1:5173 | `npm run dev:admin` (starts both APIs too) |
| Links | http://127.0.0.1:8790 | `npm run dev:links` |

The Maps server prepares a local D1 database. Existing local database state moved to `Maps/.wrangler`. Local map secrets moved to `Maps/.dev.vars` and `Maps/src/config.local.js`. Website's old `.env.local` remains in its folder; Wrangler uses `Website/.dev.vars` for local secrets. Run `npm run setup:website` to create local Website keys without printing them.

The root `package-lock.json` is the only dependency lockfile. Install at the repository root. Each workspace also supports `npm run build` from its own folder.

## Build and verify

```sh
npm run build
npm run check
npm run test:website
npm run test:website:ui
npm run test:admin
npm run test:links
```

Install browsers once with `npx playwright install chromium`. Maps has its existing browser suites under `Maps/tests`; run `npm run test:maps`, or select tests/projects using the scripts in `Maps/package.json`. Those map integration tests also load external map services.

Each build produces its own `dist/` directory with public assets only. Pages Functions remain in each application's `functions/` folder and are bundled separately by Cloudflare. Nothing deploys from the repository root.

## Website administration

After completing [the one-time connection setup](DEPLOYMENT.md#3-connect-google-sheets-to-admin), sign in to Admin with a verified `@karamahcollective.com` account. The Website navigation group contains:

- **Website content:** headlines, introductions, program descriptions, feature descriptions, announcements, section visibility, signup visibility, social links and page metadata. Publish all edits together. Blank fields retain the original website copy.
- **Team directory:** add/edit profiles, public email, role, biography, location, visibility and display order.
- **Update signups:** search registrations, mark a person unsubscribed, remove a registration, and export subscribed people as CSV. This does not send newsletters.

Sheets remains the source of truth. Existing rows and extra columns are preserved; IDs and revisions are added automatically. Concurrent edits are rejected instead of silently overwriting someone else's work. Most visitors see published changes on their next load within a minute; open pages are not live-updated.

## Link hub administration

Admin's **Links → Link hub** page manages public destinations, automatic Open
Graph/Twitter preview metadata, per-link sharing, ordering, visibility, featured
state, aggregate open counts, profile copy, SEO copy, colors, card treatment,
corner style, page width, and desktop layout. The public app reads only active
links. Both administration and public rendering use the existing D1 database.
Apply `Maps/migrations/0011_link_hub.sql`, `0012_link_hub_content.sql`, and
`0013_link_hub_card_overrides.sql` in that order before deploying it. See
`Links/README.md` for exact local and remote commands.

## Deployment

`main` is the full collaboration branch. `preview` and `deploy` are generated deployment branches containing only the files Cloudflare Pages needs.

Use the master deploy agent from `main`:

```sh
npm run deploy:agent -- plan main
npm run deploy:agent -- validate main
npm run deploy:agent -- sync preview
npm run deploy:agent -- sync deploy
```

Add `--push` to the two sync commands when publishing the generated branches. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for Cloudflare project roots, variables, Apps Script setup and domain cutover.

The copied Website Git history is preserved locally in `.local-backups/website-git-original`. It is excluded from this repository. Previous nested lockfiles and dependencies are also archived under `.local-backups/workspace-migration`. Keep those backups if you need the original Website history.
