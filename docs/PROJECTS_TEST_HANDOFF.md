# Projects Testing Handoff

Run date: 2026-10-17  
Checklist: [PROJECTS_TEST_CHECKLIST.md](./PROJECTS_TEST_CHECKLIST.md)  
Detailed evidence: [PROJECTS_TEST_REPORT.md](./PROJECTS_TEST_REPORT.md)

## Executive summary

The checklist contains 1,650 lines, 1,276 leaf checks, 20 numbered areas, and 94 subsections. The checklist itself still has zero checked boxes because it is being used as a test plan rather than silently marking broad areas as complete.

The following is guaranteed by executed evidence:

- The Projects unit/component suite passed: 301 test files and 1,553 tests.
- The Projects privacy/API suite passed: 28/28.
- The MCP/Admin contract suite passed: 21/21.
- Focused Maps Projects backend tests passed: 6/6.
- TypeScript, production builds, repository checks, documentation checks, and whitespace checks passed.
- The authenticated Chromium Playwright suite passed: 38/38 tests across desktop and mobile.
- The public browser smoke/auth suite passed in all five Playwright browser projects: 20/20 tests across desktop Chromium, desktop Firefox, desktop WebKit, mobile Chromium, and mobile WebKit.
- The deep authenticated lifecycle/data matrix passed on desktop and mobile Chromium, covering project revisions/visibility, statuses, priorities, dates, milestones, custom-field types and values, labels, comments, links, saved views, templates, webhooks, watchers, time entries, ticket lookup, duplicate tasks, invalid input, and cleanup.
- The authenticated role/visibility and action-completeness matrices passed on desktop and mobile Chromium using isolated local fixtures.
- Browser-use was exercised against the local application: its installed package/browser checks passed, the sign-in controls rendered, empty-form validation worked, and a protected dashboard navigation returned to sign-in when unauthenticated.

This is strong feature-level evidence, but it is not full release sign-off for all 1,276 checklist leaves. Several leaves require additional identities, third-party credentials, real devices, accessibility tooling, or product decisions that were not available in this environment.

## Test commands and results

| Scope | Command or evidence | Result |
|---|---|---|
| Projects unit/component tests | `npm test --workspace Projects` | PASS — 301 files / 1,553 tests |
| Privacy/API boundary tests | `npm run test:projects` | PASS — 28/28 |
| MCP/Admin contracts | `npm run test:mcp` | PASS — 21/21 |
| Focused Projects backend tests | `node --experimental-test-isolation=none --test Maps/tests/project-realtime.test.mjs Maps/tests/project-task-priority.test.mjs Maps/tests/project-task-ticket.test.mjs` | PASS — 6/6 |
| TypeScript | `npm run typecheck --workspace Projects` | PASS |
| Projects production build | `npm run build:projects` | PASS; large-bundle warnings remain |
| Repository/build/docs gates | `npm run build`, `npm run check`, `npm run docs:check`, `git diff --check` | PASS |
| Local database baseline | `npm run check:local` | PASS at the five-project seeded baseline before the final browser-only route run |
| Authenticated Chromium browser suite | `PROJECTS_LIVE_AUTH=1 PROJECTS_TEST_DISABLE_HMR=1 npx playwright test Projects/tests --config Projects/tests/playwright.config.js --workers=1` | PASS — 38/38 |
| Public cross-browser smoke/auth | `npx playwright test Projects/tests/kaneo.smoke.spec.js Projects/tests/auth-interaction-probe.spec.js --config Projects/tests/playwright.browser-matrix.config.js` | PASS — 20/20 across 5 browser projects |
| Authenticated cross-browser route probe | `PROJECTS_LIVE_AUTH=1 PROJECTS_TEST_DISABLE_HMR=1 npx playwright test Projects/tests/checklist-auth-probe.spec.js --config Projects/tests/playwright.browser-matrix.config.js -g "can open|realtime channel|supported route matrix"` | PARTIAL — 12/15 passed; 3 failed |
| Browser-use | `browser-use doctor`, local `open`, `state`, form interaction, protected-route navigation | PARTIAL tooling; public/auth-guard smoke passed |

## The three current failures to resume with

These failures were found in the last cross-browser authenticated run and were not fixed before this handoff.

### 1. Desktop Firefox: WebSocket/route churn

The authenticated workspace and project/realtime checks passed, but the supported-route matrix failed after many navigations. Evidence included Firefox errors establishing `ws://127.0.0.1:5184/api/ws/user?...`, a `NavMain` CatchBoundary error on the projects route, and additional WebSocket errors on settings routes.

First rerun only this project from a fresh local stack:

```powershell
$env:PROJECTS_LIVE_AUTH='1'
$env:PROJECTS_TEST_DISABLE_HMR='1'
npx playwright test Projects/tests/checklist-auth-probe.spec.js --config Projects/tests/playwright.browser-matrix.config.js --project desktop-firefox -g "supported route matrix"
```

If it reproduces, capture the first failing route, browser console/page errors, the Vite proxy log, and the Maps `/api/ws/user` status. The likely investigation area is the user WebSocket reconnect lifecycle plus the Vite-to-Maps WebSocket proxy under repeated route teardown, not the route assertions themselves.

### 2. Desktop WebKit: access-control failures

The supported-route matrix reported access-control errors on project settings routes, including project visibility and calendar settings. The failing requests were similar to:

```text
/api/admin?action=project-get&projectId=project-admin-operations
```

The error was surfaced by the frontend as an access-control failure even though the local worker log showed the HTTP request reaching the worker. This must be rerun with response status/body capture and a fresh authenticated context to distinguish stale Firebase credentials from a real WebKit authorization/session bug.

### 3. Mobile WebKit: access-control failures

The supported-route matrix reported access-control failures for workspace/project routes including Inbox, Projects, Search, Timeline, Gantt, Import, Calendar, and project settings. The first visible example was:

```text
/api/admin?action=project-workspace-get&workspaceId=workspace-default
```

Rerun this project independently after the desktop WebKit check. Capture the first failing response, the Firebase auth-state/token-refresh state, and whether a clean login rather than the saved session changes the result.

## What has already been fixed in the code

The previous loop found and fixed a substantial set of failures. The detailed report has the full list. The most relevant fixes for resuming are:

- Added Projects realtime routes, a dedicated `ProjectRealtime` Durable Object, the Wrangler binding/migration, Admin proxy routes, token handoff, access checks, ping/pong, and mutation publication.
- Added forced Firebase ID-token refresh when opening realtime channels.
- Fixed the Projects Vite WebSocket proxy and added `PROJECTS_TEST_DISABLE_HMR=1` for deterministic browser runs.
- Fixed local migration/setup for task priority, notification preferences, and custom-field metadata.
- Fixed project/task authorization, role handling, task visibility, cross-project moves, status/priority/date validation, custom-field contracts, bulk bounds, webhooks, relations, notification settings, comments, labels, imports, templates, and task creation in workflow columns.
- Added live deep lifecycle, role/visibility, action-completeness, UI interaction, mutation, and cleanup probes under `Projects/tests/`.

No product fix was applied for the three cross-browser failures above yet; they are the next diagnosis target.

## Coverage by checklist area

| Checklist area | Current confidence | What is covered | What is still not guaranteed |
|---|---|---|---|
| 1. Readiness/fixtures | High for local setup | Builds, migrations, seeded DB, cleanup, local role fixtures | External identities/providers and production-like data |
| 2. Roles/visibility | High for local API and fixture roles | Viewer/contributor/manager/project-admin and workspace roles, task visibility, uninvited denial | Separate Firebase identities, external invitee, deactivated user |
| 3. Environment matrix | Partial | Chromium, public Firefox/WebKit, desktop/mobile authenticated Chromium, prior Chromium/WebKit viewport/zoom/offline probes | Stable authenticated Firefox/WebKit rerun, real devices, locale/RTL, throttling/rate-limit |
| 4. Auth/onboarding | Partial | Guards, sign-in/sign-up/reset validation, provider failure, OTP/device routes | Provider callbacks, complete onboarding, invitation lifecycle, separate identities |
| 5. Shell/navigation | Good for exercised routes | Workspace/project navigation, search, inbox, My Tasks, members, settings, project views | Full accessibility-assisted navigation and every deep-link combination |
| 6. Workspace management | Partial | Members and notification workspace-rule behavior | Complete multi-user ownership/invitation lifecycle |
| 7. Project lifecycle/settings | Good for local implemented scope | Create/update/archive, revisions, visibility, columns, milestones, custom fields, labels, views, templates, webhooks, settings | Provider-backed settings, public-sharing semantics, product confirmation for route discrepancies |
| 8. Views/navigation | Partial | Board, List, Calendar, Gantt, Backlog, workspace Timeline, filters/display/sort | Every saved-view/operator/deep-link combination; project Timeline route confirmation |
| 9. Task lifecycle/properties | Good for local implemented scope | Create, title/number/URL, statuses, priorities, assignee, dates, labels, milestones, custom fields, moves, duplicates, archive/delete | Large data/pagination and every identity/permission variant |
| 10. Task content | Partial | Detail, descriptions/resources, comments, links, relations | Rich-text edge cases and successful R2 attachment persistence |
| 11. Collaboration | Partial | Comments, activity, relations, watchers, time entries | Two-user history, realtime delivery, notification recipient delivery |
| 12. Bulk/import/export/templates | Good for tested scope | Bulk status/priority/idempotency, import/export, malformed input, picker validation, template lifecycle | Full selection/pagination and all permission/payload variants |
| 13. Integrations | Blocked/partial | Validation and unavailable-branch behavior | Calendar/GitHub/GitLab/Gitea/chat/sync/webhook provider credentials and endpoints |
| 14. Settings | Partial | Account preferences/security/notifications and project settings rendering/persistence probes | Full workspace/admin/developer/billing settings matrix |
| 15. Privacy/security | High for automated local scope | 28/28 privacy/API tests, signed-out and public/private safety, input validation, revisions/idempotency | Full separate-account tenant isolation and attachment/comment-ID matrix |
| 16. Accessibility/interaction | Partial | Keyboard focus, mobile overflow, Escape, public auth/OTP focus, prior viewport/zoom checks | Screen readers, announcements, RTL, high contrast, full keyboard-only matrix |
| 17. Performance/resilience | Partial | Builds, offline recovery, 403 recovery, route readiness, realtime HTTP boundaries | Large data, slow networks, timeout/401/409/429/5xx, observability, stable authenticated realtime delivery |
| 18. API/Admin/MCP | Good for exercised scope | 28 privacy/API, 21 MCP, focused Maps tests, custom-field and notification contracts | Every direct action and full API/Admin/MCP parity matrix |
| 19. Release sign-off | Not complete | Automated gates are green | Full checklist leaves, browser stability, providers, identities, devices, accessibility, realtime delivery |
| 20. Coverage map | Informational | Checklist mapped to code and tests | Continue converting remaining leaves into executed evidence |

## Product decisions still needed

1. Is `/dashboard/settings/projects/:id/integrations` supposed to be a distinct page, or should it intentionally redirect/render Workflow?
2. Is a project-specific `/timeline` route supported, or is workspace Timeline the only intended route?
3. Which external integration providers and webhook endpoints should be included in release sign-off?
4. Which real-device and accessibility-tool matrix is required for release?

## Exact resume sequence

1. Start the local stack with `PROJECTS_TEST_DISABLE_HMR=1` using `npm run dev:projects`.
2. Run the three failing browser projects independently, starting with desktop Firefox, then desktop WebKit, then mobile WebKit.
3. Add response/error logging to the probe only if the first rerun reproduces; do not change product code based solely on a flaky aggregate run.
4. Fix the confirmed root cause and rerun the affected project from a fresh stack.
5. Rerun the complete five-project public and authenticated browser matrix.
6. Rerun the backend gates, full Projects unit suite, `npm run check:local`, and exact fixture cleanup.
7. Run the two-account realtime delivery matrix and the provider/device/accessibility batches once the required fixtures are available.

The local dev stack was stopped after the last run. The worktree contains many pre-existing and test-related uncommitted changes; do not reset or discard them while resuming.
