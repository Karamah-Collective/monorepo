# Local Projects workspace

The local workspace uses the same database boundaries as production:

| Local binding | Database | Owns |
| --- | --- | --- |
| `DB` | `halal-finder-db` | Manarah map data only |
| `ADMIN_DB` | `karamah-admin-db` | Admin identity, access, MCP, inbox, Website, Links, and audit data |
| `PROJECTS_DB` | `karamah-projects-db` | Projects, tasks, members, planning data, and project fixtures |
| Forms `DB` | `forms-db` | Forms data; never copied into Projects or Admin |

## Start from a clean local shell

From the repository root:

```powershell
npm install
node Maps/scripts/local-db.mjs
npm run check:local
```

`local-db.mjs` is local-only. It applies the Manarah migrations to `halal-finder-db`, the Admin schema to `karamah-admin-db`, the three project migrations to `karamah-projects-db`, and then seeds the fixtures below. It never uses a remote D1 database.

To start the applications after the databases are ready:

```powershell
npm run dev
```

Open:

- Admin: `http://127.0.0.1:5173`
- Projects: `http://127.0.0.1:5184`
- Maps API/Pages: `http://127.0.0.1:8788`
- Admin integrations worker: `http://127.0.0.1:8793`

Projects proxies `/api` to the local Maps Pages worker. Keep Maps running while testing Projects.

## Fixture projects and people

The seed is idempotent and uses `@karamah.local` identities so it cannot be confused with production accounts.

| Project | Visibility | Example people | What to inspect |
| --- | --- | --- | --- |
| Website refresh (`WEB`) | Workspace | `admin`, `editor`, `contributor` | Board states, assignee, blocked review, labels |
| Map quality sprint (`MAP`) | Restricted | `admin`, `maps`, `reviewer` | Project privacy and viewer/manager roles |
| Community forms pilot (`FORM`) | Restricted | `admin`, `forms`, `forms-reviewer` | Contributor/viewer split and form-linked work |
| Community campaign (`CAMP`) | Workspace | `admin`, `editor`, `comms`, `observer` | Milestone, dependencies, comment, watcher, saved view, overdue/completed work |
| Admin operations (`OPS`) | Workspace | `admin` | Baseline project and task navigation |

The seeded board includes inbox, assigned, in-progress, blocked, done, and cancelled columns. Due dates are spread across past and future dates so list, calendar, timeline, overdue, priority, and assignee filters have something to show.

The dummy people are project members and assignees, not Firebase accounts. To test a real user's permission boundary, sign in with a verified Karamah Google account and change that account's project membership from the project settings. The local API still requires Firebase authentication; no local authentication bypass is enabled.

## Verify database separation

```powershell
npm run check:local
```

Expected project counts after first setup are at least five projects, thirteen members, and fifteen tasks. The check also reports whether an older local Admin project copy remains.

Older local runs may have populated the legacy project tables in `karamah-admin-db`. The bootstrap never deletes populated data. Copy it first with:

```powershell
npm run migrate:projects-db:local
```

Those legacy tables remain available for rollback and are not used by the Projects API. Do not remove them until the local migration has been inspected. Production migration is a separate, explicit command and is never called by local setup.
