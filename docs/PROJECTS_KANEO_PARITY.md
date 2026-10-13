# Projects feature surface

Projects is the Kaneo web application source deployed as a Cloudflare Pages
frontend. Its only application-level changes are the Firebase login adapter,
Karamah Admin API adapter, project database boundary, and server-side
authorization/MCP integration. Kaneo's MIT attribution and license text are
preserved in `docs/THIRD_PARTY_ATTRIBUTIONS.md` and
`Projects/THIRD_PARTY_LICENSES/KANEO_LICENSE`.

## Cloudflare-native core

These capabilities are stored in `karamah-projects-db`, served through the
authenticated Admin API, and can be exposed through the same role-filtered MCP
connection:

- projects, restricted/workspace visibility, project owners, members, named
  roles, per-person permissions, and task visibility (`all`, `assigned`, `own`)
- board columns with drag/drop, list, calendar, timeline, and backlog views
- task descriptions, priorities, assignees, start/due dates, milestones, task
  numbers, optimistic revisions, completion, cancellation, and duplication
- search, filters, saved views, bulk updates with idempotency, and deep links
- labels, subtasks, blocking/blocked-by relations, related tasks, comments,
  comment editing/removal, watchers, notifications, and activity history
- time entries and totals
- custom fields and task values
- private R2 attachments with metadata in D1
- task templates and project webhook registrations with encrypted signing
  secrets; outbound delivery is staged for the integration worker
- typed Admin actions and MCP tools for every project action, with live role
  intersection and short-lived confirmation for risky mutations
- the original Kaneo workspace composition, typography, colors, responsive
  behavior, and interaction patterns

## Deliberately separate or follow-up capabilities

These are not copied as pretend functionality:

- Google Tasks is a separate opt-in bridge and is not required for Projects to
  work. It can be enabled later through the existing per-user OAuth flow.
- GitHub/Gitea repository activity, chat integrations, email/ntfy/Gotify
  notification providers, and automation rules need provider credentials,
  webhook endpoints, and scheduled delivery workers before they can be safely
  enabled.
- Public project views require an explicit share-token policy. Restricted
  projects are never made public by the default Karamah privacy model.
- Time tracking is retained as simple manual entries in v1; recurring tasks,
  billing, organization features, and other Kaneo-hosted SaaS concerns are
  outside this Admin workspace.

The source of truth remains the project database. Forms stay in `forms-db` and
`forms-media`; Maps stays in `halal-finder-db`; browser preferences remain
local UI state.

For local development, run `npm run dev:projects` and open
`http://127.0.0.1:5184`. The Vite proxy sends `/api` requests to the local
Admin/Maps worker. For Cloudflare Pages, set the build variable
`VITE_ADMIN_ORIGIN=https://admin.karamahcollective.com` (see
`Projects/.env.example`); Projects contains no database, MCP, or token secrets
in the browser bundle.
