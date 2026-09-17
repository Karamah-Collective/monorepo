# Karamah Links

Public, responsive link directory backed by the existing Karamah D1 database.
Links and every piece of public page copy are managed from Admin → Link hub.

## Local development

From the monorepo root:

```sh
npm run dev:links
```

This prepares the local Maps D1 database, applies pending migrations, inserts
five local-only example links when the link table is empty, and serves Links at
`http://127.0.0.1:8790`. The examples are created by
`Maps/scripts/local-db.mjs`; they are never part of a production migration.

To prepare or refresh the local schema without starting servers:

```sh
node Maps/scripts/local-db.mjs
```

## Production database

Run these from the monorepo root after authenticating Wrangler. Confirm the
database name and ID in `Maps/wrangler.toml` before using `--remote`.

For a new database, apply all three migrations in order:

```sh
npx wrangler d1 execute halal-finder-db --remote --config Maps/wrangler.toml --file Maps/migrations/0011_link_hub.sql
npx wrangler d1 execute halal-finder-db --remote --config Maps/wrangler.toml --file Maps/migrations/0012_link_hub_content.sql
npx wrangler d1 execute halal-finder-db --remote --config Maps/wrangler.toml --file Maps/migrations/0013_link_hub_card_overrides.sql
```

If `0011_link_hub.sql` was already applied, run `0012_link_hub_content.sql`
and `0013_link_hub_card_overrides.sql` in order.

Read-only verification:

```sh
npx wrangler d1 execute halal-finder-db --remote --config Maps/wrangler.toml --command "SELECT name FROM sqlite_master WHERE name LIKE 'link_hub_%' ORDER BY name"
npx wrangler d1 execute halal-finder-db --remote --config Maps/wrangler.toml --command "SELECT id, profile_name, revision, updated_at FROM link_hub_settings"
npx wrangler d1 execute halal-finder-db --remote --config Maps/wrangler.toml --command "SELECT id, title, active, featured, sort_order FROM link_hub_links ORDER BY sort_order"
```

Do not run the local seeding code against production. Production links should
be created through the authenticated Admin interface.

## Cloudflare Pages deployment

Deploy this feature as three coordinated projects: Maps supplies the protected
Admin API, Admin supplies the editor, and Links supplies the public page.

For the Links Pages project connected to this monorepo, use:

| Setting | Value |
| --- | --- |
| Production branch | `deploy` |
| Framework preset | None |
| Root directory | `Links` |
| Build command | `npm ci --prefix .. && npm run build` |
| Build output directory | `dist` |
| Environment variables | `NODE_VERSION=22`, `SKIP_DEPENDENCY_INSTALL=true` |

In the Pages project, add a D1 binding named exactly `DB`. Bind Production to
`halal-finder-db` and Preview to `halal-finder-db-preview`, then redeploy so the
binding reaches the Functions runtime. Add `links.karamahcollective.com` through
the Pages project's Custom domains screen. Do not create only a standalone DNS
record; associate the domain with the Pages project first.

The deployment configuration is intentionally dashboard-managed. The local
`wrangler.toml` has no `pages_build_output_dir`, preventing local binding values
from replacing the separate Production and Preview bindings.

From the monorepo root, validate and publish the generated production branch:

```sh
npm run deploy:agent -- validate main
npm run deploy:agent -- sync deploy --push
```

See the root `DEPLOYMENT.md` for the complete four-project branch policy and
build-watch paths.
