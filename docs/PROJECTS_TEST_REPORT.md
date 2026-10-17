# Projects Test Report

Run date: 2026-10-17  
Commit under test: `fee19ff` plus the uncommitted workspace changes listed by `git status`  
Checklist: [PROJECTS_TEST_CHECKLIST.md](./PROJECTS_TEST_CHECKLIST.md)  
Checklist size: 1,276 leaf checks across 20 numbered areas and 94 subsections

Resume handoff: [PROJECTS_TEST_HANDOFF.md](./PROJECTS_TEST_HANDOFF.md). The handoff supersedes older aggregate browser wording below where the latest five-browser run found three authenticated WebKit/Firefox route failures.

## Executive result

The failing Projects unit tests, comment request mismatch, missing notification API path, repository layout failure, and Projects TypeScript errors found in the previous passes were fixed and retested. The final rerun also found and corrected the local test environment's stale Projects D1 schema, the Projects Vite WebSocket proxy, the missing Projects realtime Pages routes/binding, an auth-bootstrap race that could leave repeated protected-route navigation on a blank document, an assignment-only permission gap, webhook target validation gaps, frontend/backend custom-field contract mismatches, project-creator workspace enrollment, Kanban/list task status mapping, task-label attachment routing, and a realtime stability regression caused by sharing the Gmail-sync Durable Object with Projects channels.

All executable Projects feature suites, the TypeScript gate, and the latest authenticated desktop/mobile live matrices now pass. Full checklist sign-off is still blocked by checklist areas that require separate identities, provider credentials, device/browser matrices, or product decisions. Those areas remain explicitly untested; they are not marked as passing.

## Fixes made and verified

- Task comments accept the frontend `comment` payload while preserving existing `body` callers. Live Playwright submission created an activity entry and showed `Comment added`.
- Task shortcut assignment now requires assignment permission instead of treating general task-update permission as sufficient.
- Assignment-only updates can no longer change status or other task fields when the actor lacks the corresponding task-update permission.
- Notification preferences now use authenticated Admin project actions instead of the missing `/api/notification-preferences` route.
- Added the notification-preferences and workspace-rule D1 migration, Admin action descriptors, GET/POST routing, validation, masking, encryption, and cleanup actions.
- Notification settings load, toggle, reload, workspace-rule save, and workspace-rule removal were exercised live with the repository Playwright harness.
- Updated the affected component tests and mocks. The complete Vitest suite now passes.
- Built Forms before the layout gate; the repository layout check now passes.
- Applied the already-declared local Projects D1 migrations `0007_task_priority_medium.sql` and `0008_notification_preferences.sql`. Before setup, live task creation with `medium` priority failed with a D1 CHECK-constraint error; after setup, the same API flow passed.
- Added `0009_custom_field_metadata.sql` to both local migration entry points. Before setup, live custom-field save failed because the `required` column was absent; after setup, custom-field definition/value/filter-value flows passed.
- Updated `tooling/dev.mjs` so local migrations run even when an existing Maps worker already owns port 8788; the setup is idempotent and prevents this stale-schema failure from recurring.
- Added a local realtime readiness wait to `tooling/dev.mjs`, preventing the initial Projects `/api/ws/*` requests from racing the Maps Durable Object binding and returning transient 503 responses.
- Completed a live authenticated API CRUD matrix: task create/read/update, status/date/priority changes, comments create/edit/list/delete, external links, relations, time entries, watchers, saved views, and notification/preference reads all passed. Temporary rows were removed afterward.
- Fixed cross-project task moves in the shared Projects backend. The move now validates destination access and columns, assigns a destination ticket number, clears or remaps project-specific milestones/labels/custom values safely, and records the project change.
- Fixed the Projects compatibility adapter to return the `{ task: ... }` shape expected by the live move UI. The browser flow now moves a task from the source board, navigates to the destination task URL, and survives a hard refresh.
- Fixed the import file picker so it applies the same JSON-file validation as drag-and-drop. Valid JSON, malformed task shapes, and non-JSON picker files were all exercised live.
- Completed live bulk/template/import/export checks: idempotency-key enforcement, multi-task status/priority updates, idempotent retries, duplicate-task isolation, manager-only template save/update/instantiate/delete, export JSON shape, import success, malformed input rejection, and non-JSON rejection all passed.
- Completed cross-project data-safety checks: matching labels remapped to the destination project and source-only custom-field values were removed after move.
- Expanded backend privacy coverage with uninvited-user denial, project-only sibling-project isolation, own-task visibility identity variants, invalid permission/URL fail-closed behavior, and expired/wrong-email invitation checks.
- Hardened project access against unknown persisted project roles: invalid roles now fail closed to viewer permissions and cannot inherit a custom write-permission row. The regression test passes.
- Hardened task create/update validation so unknown status and priority enum values return a 400 instead of silently falling back or preserving the old value. The regression test and full Maps backend suite pass.
- Hardened task and milestone date mutations: malformed dates and due-before-start ranges now return a 400, while timezone-offset inputs are stored as canonical UTC. The regression test passes.
- Hardened project/task/column/milestone names and ordering inputs: blank mutation names, non-finite or negative positions, unknown column categories, unknown relation types, cross-workspace selected-project IDs, invalid time-entry dates/durations, and inconsistent saved-view type responses are now rejected or normalized consistently. The expanded regression suite passes.
- Completed the custom-field contract across the backend, Admin action layer, and Projects client: frontend aliases (`dropdown`, `multiselect`, `boolean`) are normalized safely, definitions validate options/defaults/required/multiple metadata, task values validate by field type, and authorized value/filter-value listing actions are exposed. Migration `0009_custom_field_metadata.sql` supplies the metadata columns.
- Added bounds and validation for bulk task updates, including rejecting empty selections and limiting oversized selections before mutation.
- Added an isolated role-fixture harness and authenticated role matrix for viewer, contributor, manager, project-admin, workspace viewer/member/admin/owner, assigned/own task visibility, and uninvited access. The Playwright harness now provisions and tears down its own `projects-qa-*` fixtures for every desktop/mobile run, then verifies the baseline counts afterward.
- Added public auth/device/OTP browser coverage for sign-in/sign-up/password-reset validation, expired MCP authorization safety, provider-failure handling, keyboard focus, mobile overflow, and the loaded OTP layout.
- Added `npm run cleanup:projects-live`, an exact-name/email-scoped cleanup for the mutation probe's soft-archived temporary projects. The final cleanup also removed the exact UI and role-matrix fixture prefixes; no temporary QA fixtures remain.
- Hardened webhook URL validation against malformed schemes, credentials, localhost/internal names, private/link-local/loopback/CGNAT/multicast targets, and IPv6 literals.
- Fixed relation authorization ordering so hidden or cross-project related tasks are not probed before the source task/project access check.
- Added MCP/Admin action descriptors for custom-field value and filter-value reads; the MCP contract suite passes again.
- Fixed the Projects Vite development proxy to forward WebSocket upgrades and added an opt-in `PROJECTS_TEST_DISABLE_HMR=1` switch for deterministic browser runs. This stopped missing realtime upgrades from terminating the local Vite process during browser testing.
- Added the missing `PROJECT_REALTIME` Durable Object binding to the local Gmail-events Wrangler worker. The clean local stack now reports both `INBOX_REALTIME` and `PROJECT_REALTIME` as connected; this removed the `/api/ws/*` 503 caused by the worker being unable to resolve the project realtime class.
- Forced a fresh Firebase ID-token refresh when opening the Projects realtime channel. This prevents a long-lived saved session from presenting an expired token after the browser has been idle.
- Made the full public-auth probe tolerate the documented unavailable-provider fallback when Firebase email/password reset is not configured locally; the test still verifies the live reset form when that capability is available.
- Stabilized the full local authenticated browser run by disabling Vite HMR for the test process. The final clean rerun passed all 38 desktop/mobile tests in 6.0 minutes.
- Re-ran the authenticated browser path with the saved Firebase session after the browser-use probe: the session redirected from `/auth/sign-in` to the Projects home, loaded a protected project board, rendered seeded project content, and passed the desktop no-horizontal-overflow check. The temporary probe was removed after the pass.
- Added authenticated Projects realtime routes for `/api/ws/user` and `/api/ws/:projectId` in Maps, an Admin realtime proxy for production's separate origins, the `PROJECT_REALTIME` Durable Object binding, Firebase-token handoff from the Projects client, ping/pong handling, access checks, and server-side project mutation publication. Local Wrangler compiled the routes and the negative authorization/Origin checks passed; focused unit coverage includes task, project, and bulk mutation publication.
- Split Projects realtime onto a dedicated `ProjectRealtime` Durable Object and migration. This preserves lightweight fan-out/ping behavior without scheduling Gmail sync alarms for Projects channels; the complete authenticated browser suite then passed without the prior long-run `/api/ws` 503 regression.
- Added the authenticated live action-completeness probe for workspace/project roles, workspace/project membership, task assignment, bulk updates, idempotent replay, and teardown. It passes in the full desktop/mobile run.
- Changed workspace access detection to ignore archived project memberships, so archiving the temporary manager fixture cannot hide the authenticated user's remaining workspace projects.
- Made `authClient.getSession()` wait for Firebase's initial auth-state callback before deciding that a protected route is signed out. The full signed-out public/protected route matrix then passed across all listed auth, workspace, settings, project-view, and task deep links on desktop and mobile.
- Ensured a newly created project enrolls its creator in the workspace membership table, so the creator receives the expected project capabilities immediately.
- Fixed Kanban and list-view task creation to pass a column's status category/slug instead of its database column ID; task creation now persists in the selected workflow column.
- Fixed the Projects label adapter to route requests carrying `taskId` through label attachment rather than label-definition save; labels created or selected in task modals now persist on the task.
- Added a live authenticated mutation probe for create-modal properties and task-detail edits, covering desktop and mobile task creation, labels, dates, priority, status, descriptions, comments, subtasks, relations, and external links. Added exact fixture cleanup scripts for these probes.
- Added an authenticated deep lifecycle/data-contract matrix for project revisions and visibility, all workflow statuses and priorities, milestones, every custom-field type/value/filter path, labels, comments, links, saved views, templates, webhooks, watchers, time entries, ticket lookup, duplicate tasks, and invalid-input boundaries. It passes on desktop and mobile.
- Extended `cleanup-project-live-fixtures.mjs` to remove both exact authenticated QA project prefixes (`live-manager-project-*` and `live-action-project-*`); the final local database check returned to the five-project seeded baseline.
- Increased the public-auth probe's cold-start readiness window from 5 seconds to 15 seconds after one fresh full-suite run exposed a transient empty app shell; the isolated rerun and the complete 38-test desktop/mobile rerun then passed.

No temporary QA task, comment, template, label, custom field, membership, project, or workspace remains. The final local Projects database check reports the current local data counts below.

## Automated results

| Command | Result | Evidence |
|---|---:|---|
| `npm test` from `Projects` | PASS | 301 test files, 1,553 tests passed. |
| `npm run build:projects` | PASS | Vite production build completed. Non-blocking warning: large chunks, including the main bundle over 3 MB. |
| `npm run build` | PASS | Maps, Website, Admin, Links, Forms, and Projects production builds completed. Existing Browserslist, large-chunk, and third-party Rollup annotation warnings remain non-blocking. |
| `npm run test:projects` | PASS | 28/28 privacy and API-boundary tests passed. |
| `npm run test:mcp` | PASS | 21/21 MCP/Admin action-contract tests passed. |
| Maps Projects backend tests | PASS | 6/6 focused realtime publication, priority/status normalization, and task-ticket tests passed with Node's supported non-isolated runner mode. |
| `npm run test:projects:ui` | PASS | 8/8 public/smoke desktop/mobile Playwright tests passed; 14 gated live-auth tests were skipped without `PROJECTS_LIVE_AUTH=1` and were run separately with the authenticated fixture. |
| Full authenticated Projects Playwright suite (`PROJECTS_LIVE_AUTH=1 PROJECTS_TEST_DISABLE_HMR=1`, one worker) | PASS | 38/38 tests passed in 6.0 minutes across desktop and mobile: public auth/device, authenticated route/read/boundary/mutation matrices, deep lifecycle/data contracts, role/visibility, workspace/project action completeness, smoke, live create/edit mutation probes, filters/display, task detail, settings, keyboard focus, and mobile overflow. |
| Signed-out route matrix | PASS | All 12 public/auth routes and 27 protected/deep-link routes rendered without application errors and redirected to sign-in on desktop and mobile; 78 route assertions passed in the isolated harness. |
| `npm run build:forms` | PASS | Forms production build completed. |
| `npm run check` | PASS | Layout, local imports, deployed assets, service-worker files, and build exclusions passed. |
| `npm run docs:check` | PASS | Documentation integrity passed. |
| `npm run check:local` | PASS | Final post-cleanup check: Projects DB has the five seeded projects, 13 members, 15 tasks, 1 milestone, 2 relations, 1 comment, and 1 saved view. The check also reports a populated legacy Admin project copy, which was left untouched. |
| `npm run typecheck --workspace Projects` | PASS | `tsc --noEmit -p tsconfig.app.json` completed with zero errors. |
| Local Maps realtime route compilation | PASS | Wrangler compiled Maps with `INBOX_REALTIME` and `PROJECT_REALTIME` bindings; unauthenticated user/project requests returned 401 and disallowed Origin returned 403. |
| Local Admin realtime proxy compilation | PASS | Wrangler compiled Admin's `/api/ws/user` and `/api/ws/:projectId` proxy routes; missing and invalid token requests returned 401 when pointed at the local Maps worker. |
| Prior full browser matrix, Chromium | PASS | 525 assertions across desktop, mobile, portrait/landscape tablet, zoom 0.8/1/1.25/2, keyboard traversal, offline recovery, 403 rendering, and post-403 recovery. |
| Prior full browser matrix, WebKit | PASS | 525 assertions across the same viewport, zoom, keyboard, offline, and denied-API cases. |
| Latest five-browser public smoke/auth matrix | PASS | 20/20 public auth/smoke tests passed across desktop Chromium, desktop Firefox, desktop WebKit, mobile Chromium, and mobile WebKit. |
| Latest five-browser authenticated route matrix | PARTIAL | 12/15 passed. Chromium desktop/mobile passed; desktop Firefox, desktop WebKit, and mobile WebKit each failed the supported-route matrix with WebSocket or access-control errors. |
| Firefox route diagnostics | PARTIAL | Isolated authenticated routes and realtime checks passed, but the latest repeated supported-route run produced a Firefox user-WebSocket/route-churn failure. It needs a fresh isolated rerun before full Firefox sign-off. |
| Live authenticated Projects API CRUD matrix | PASS | Medium-priority task create plus task read/update, comments, links, relations, time, watchers, saved views, and notification reads passed after local migrations `0007`/`0008`/`0009` were applied. |
| Live authenticated task mutation batch | PASS | Bulk status/priority updates, idempotent retry behavior, duplicate-task isolation, manager-only template lifecycle, and cross-project task move passed. |
| Live authenticated import/export UI batch | PASS | Export downloaded valid JSON; valid import created a task; malformed shape and non-JSON picker input were rejected. |
| Live authenticated cross-project move UI | PASS | Source board move submitted successfully, destination task route opened, hard refresh preserved the destination project, label remapping and source custom-value cleanup passed. |
| Live authenticated route/read matrix, latest rerun | PASS | Desktop: 4/4; mobile: 4/4. Each viewport opened the seeded workspace and board/realtime channel, exercised 28 authenticated routes, and ran the authenticated project/task/workspace/settings read-action matrix without 5xx, blank/error surfaces, or mobile horizontal overflow. |
| Live authenticated mutation matrix, latest rerun | PASS | Full sequential rerun: desktop 2/2 and mobile 2/2. Create-modal persistence and task-detail edits passed, including labels, dates, priority, status, descriptions, comments, subtasks, relations, and external links. Exact live/UI/role fixture cleanup completed; the final `check:local` run reported the current counts above. |
| Live authenticated deep lifecycle/data-contract matrix | PASS | Desktop: 1/1 and mobile: 1/1. Project revision conflicts, visibility changes, six statuses, five priorities, date/milestone validation, six custom-field definitions and values, labels, comments, links, five saved-view types, templates, webhook secret masking, watchers, time entries, ticket lookup, duplicate tasks, and cleanup passed. |
| Live authenticated role/visibility matrix | PASS | Desktop: 1/1 and mobile: 1/1 against fixtures provisioned and removed by the test harness. Explicit project roles, workspace roles, task visibility (`all`/`assigned`/`own`), denied hidden-task reads, uninvited access, and real role-project board routes passed. |
| Live authenticated UI interaction probe | PASS | Desktop: 4/4 and mobile: 4/4. Board filters, display/layout controls, sort/reset, view navigation, task detail properties, settings controls, keyboard focus, Escape dismissal, and mobile property chips/overflow passed. |
| Public auth/device/OTP interaction matrix | PASS | Desktop: 2/2 and mobile: 2/2. Sign-in/sign-up/password-reset validation, safe provider failure, expired MCP request, device routes, OTP loaded layout, keyboard focus, and mobile overflow passed. |
| Browser-use final check | PARTIAL tooling check | `browser-use doctor` passed the installed package/browser checks and reported 3/5: optional `cloudflared` and `profile-use` are unavailable. A local browser-use session rendered sign-in controls, passed empty-form validation, and confirmed the protected-route sign-in guard; authenticated coverage remains Playwright-based. |
| Authenticated saved-session probe | PASS | Protected home and project-board navigation passed with seeded content and no horizontal overflow. |
| Local realtime HTTP boundary matrix | PASS | Unauthenticated user WebSocket request returned 401, disallowed Origin returned 403, missing upgrade returned 426, and unauthenticated Admin project action returned 401. |
| `git diff --check` | PASS | No whitespace errors; Git emitted only normal LF/CRLF normalization warnings. |

Non-failing test output still includes React ref/`act()`/router warnings from existing test setup. They did not fail any test.

## Browser-use and live browser checks

The installed browser-use CLI is available at:

`C:\Users\moont\AppData\Roaming\Python\Python313\Scripts\browser-use.exe`

The browser-use executable is installed. Its doctor run passed the package and browser checks and reported 3/5; its optional `profile-use` adapter and `cloudflared` tunnel helper are not installed. The latest session opened the local sign-in page, exposed the email/password controls, showed native required-field validation after submit, and confirmed that opening `/dashboard` while signed out returned to sign-in. Browser-use is not treated as the source of the authenticated pass; that evidence remains Playwright-based.

### Passed authenticated surfaces

- Home, Inbox, My Tasks, Members, project Board, List, Calendar, Gantt, Backlog, and workspace Timeline rendered.
- Board Filter opened with Status, Assignee, Priority, Labels, and Due date.
- Board Display opened with Board/List/Calendar/Gantt, sorting, direction, card-field toggles, and Reset.
- Task detail exposed status, priority, assignee, labels, dates, project, title, description, attachments, subtasks, relations, resources, activity, and comments.
- Status options included Inbox, Assigned, In progress, Blocked, Done, and Cancelled.
- Priority options included No priority, Low, Medium, High, and Urgent.
- Seeded labels rendered in the task label control.
- Start-date and due-date controls exposed quick choices and date-picker/clear actions.
- Subtask, relation, and resource dialogs opened; the previous isolated mutation pass also created and removed a resource successfully.
- Project General, Workflow, Custom fields, Visibility, and Calendar feeds settings rendered.
- Account Preferences and Security rendered at their actual routes.
- Notification settings rendered at `/dashboard/settings/account/notifications`.
- Account Preferences rendered with theme, language, week-start, default-view, card-field, and advanced controls.
- Account Security rendered with the provider-specific password-change state.
- Each project-settings route navigated and rendered successfully: General, Workflow, Custom fields, Visibility, and Calendar feeds.
- Project General export downloaded a valid JSON task document; import created a task through the UI.
- Import malformed task shape and non-JSON file-picker paths showed the intended error and did not create tasks.
- The task move UI moved a live task across projects, navigated to the destination task URL, and retained the move after hard refresh.

### Passed repaired live behavior

- Entered and submitted `QA comment regression 2026-10-16`.
- Server accepted the frontend `comment` field.
- Activity entry appeared with the comment text.
- Notification Assignments toggle changed from on to off, saved, and remained off after a reload.
- Notification toggle was restored to on.
- Workspace notification rule dialog opened.
- Default rule saved successfully and changed the UI to `Configure`/`Sending`.
- `Stop sending` confirmation removed the temporary rule and restored `Set up`.
- Local database was cleaned after the live checks.

### Passed privacy/access checks

- Signed-out authenticated-board access returned the sign-in surface.
- Signed-out access to workspace-visible, restricted, and invalid public-project URLs showed the safe not-found/not-publicly-accessible surface without private project data.
- The automated privacy suite passed all role and task-visibility assertions.

### Live limitations or unresolved behavior

- The isolated browser harness could not write to the clipboard in this environment, so Copy task link showed its visible clipboard error. The earlier isolated Playwright pass verified generation of the canonical task URL. Clipboard behavior still needs a normal browser permission pass.
- Project settings `/integrations` remains a route/product discrepancy: it renders Workflow content or redirects to Workflow rather than showing a distinct integrations page. Product intent is required before changing it.
- The project-specific `/timeline` route was not found in the earlier route matrix; the visible supported Timeline navigation points to the workspace timeline route. This also needs product confirmation.
- The live API matrix independently completed comment create/edit/list/delete, external links, relations, time entries, watchers, and saved-view CRUD using a temporary task; all temporary rows were removed.
- The latest live mutation and deep matrices intentionally create owned temporary manager projects because the seeded account is not manager on every seeded project. The API archive/delete calls are soft operations; `npm run cleanup:projects-live` removes only the exact QA email plus the two test-name prefixes, and the final cleanup returned a passing `npm run check:local` result at the five-project seeded baseline.
- The authenticated Firebase session is still one account, but the isolated local role fixture now covers backend role behavior and role-specific board routes for viewer/contributor/manager/project-admin/workspace viewer/member/admin/owner. Separate Firebase identities for external invitee and deactivated-user flows remain unavailable.
- Attachment upload/list/read/delete was exercised through the configured-or-unconfigured branch. A local environment without `ADMIN_MEDIA` can only verify the documented 503 response; it cannot prove successful R2 persistence.
- A valid authenticated WebSocket upgrade and cross-browser event-delivery assertion still require a usable Firebase account/token in this environment. The route, token handoff, access check, Durable Object binding, ping/pong, and server-side project/bulk event publication are implemented and covered by local negative/live-boundary checks; the user-scoped notification delivery path still needs a real recipient event fixture.
- Chromium and WebKit completed the prior broad viewport/interaction matrix, but the latest authenticated five-browser route matrix found three failures: Firefox user-WebSocket/route churn, desktop WebKit access-control errors, and mobile WebKit access-control errors. These must be isolated and rerun before full cross-browser release coverage is claimed.
- During shutdown, Vite can log `ECONNABORTED` for browser WebSocket clients that are intentionally being closed. This did not appear in the Playwright assertions or produce a test failure.
- The local dev run also emitted background Gmail-sync alarm errors because the optional `gmail_connections` schema is not provisioned in this local database. No Projects test failed; Gmail integration remains outside sign-off until its migrations and provider fixtures are available.

## Checklist-area disposition

| Area | Status | Evidence or remaining work |
|---|---|---|
| 1. Readiness and fixtures | PARTIAL | Build, docs, layout, local DB, privacy, MCP, typecheck, unit, and UI smoke gates pass. Full role/provider fixtures are unavailable. |
| 2. Role and visibility | PASS for local role matrix; PARTIAL end to end | Privacy/API-boundary coverage passes (28/28), and authenticated desktop/mobile isolated role matrices pass for explicit project roles, workspace roles, task visibility, and uninvited access. External invitee/deactivated-user identity flows remain unavailable. |
| 3. Environment matrix | PARTIAL | Chromium and WebKit completed the prior desktop/mobile/tablet, zoom, keyboard, offline, forced-colors, and reduced-motion checks; public smoke passed in all five browser projects. The latest authenticated Firefox/WebKit route failures remain unresolved. Locale, throttling, timeout, rate-limit, and real-device coverage remain. |
| 4. Authentication/onboarding | PARTIAL | Auth guards, public sign-in/sign-up/password-reset validation, provider-failure handling, OTP/device routes, and authenticated smoke passed. Provider callback, profile setup, invitation lifecycle, and complete onboarding identity matrix remain. |
| 5. Application shell/navigation | PASS for exercised routes | Main shell, navigation, search, inbox, My Tasks, members, project views, and settings surfaces rendered. Full keyboard/screen-reader matrix remains. |
| 6. Workspace management | PARTIAL | Members surface and notification workspace-rule flow passed. Full multi-identity workspace lifecycle and ownership matrix remains. |
| 7. Project lifecycle/settings | PASS for implemented local scope; PARTIAL end to end | Project create/update/archive, revision conflicts, visibility transitions, workflow columns, milestones, custom-field definitions/values/filter values, labels, saved views, templates, webhooks, and settings routes passed. Public sharing semantics and provider-backed settings still require product/provider confirmation. |
| 8. Views/task navigation | PARTIAL | Board, filters, display, List, Calendar, Gantt, Backlog, and workspace Timeline exercised. Every operator, saved-view, sort, and deep-link combination remains. |
| 9. Task lifecycle/properties | PASS for implemented local scope; PARTIAL end to end | Task detail, all six statuses, all five priorities, labels, dates, custom values, assignee control, same-project status movement, cross-project movement, duplicate isolation, canonical links, templates, and archive/delete behavior passed. Separate identity variants and large-data/pagination checks remain. |
| 10. Task detail/content | PARTIAL | Task detail, description/resource surfaces passed and comment create/edit/delete/list passed through the live API matrix. Uploads, rich content, unsafe links, and attachment edge cases remain. |
| 11. Collaboration/activity | PARTIAL | Activity/comment creation, relation dialogs, relation CRUD, watcher CRUD, and time-entry CRUD passed. Multi-user history and notification delivery remain. |
| 12. Bulk/import/export/templates | PARTIAL | Live bulk status/priority/idempotency, duplicate, template lifecycle, import/export, malformed input, and non-JSON picker checks pass. Full selection/pagination/permission matrix and every template payload variant remain. |
| 13. Integrations/conditional capabilities | BLOCKED / PARTIAL | No provider credentials or webhook endpoints were available. `/integrations` route discrepancy remains. |
| 14. Account/workspace/project/admin settings | PARTIAL | Account Preferences, Security, Notifications, and project settings rendered; full persistence and admin/billing/developer settings matrix remains. |
| 15. Privacy/security/data integrity | PASS for automated scope; PARTIAL end to end | 28/28 privacy/API-boundary tests and signed-out public/private checks pass. Full separate-account tenant and attachment/comment-ID matrix remains. |
| 16. Accessibility/interaction | PARTIAL | Desktop/mobile smoke, public auth keyboard focus, OTP focus/layout, and no-overflow checks pass. Full keyboard-only, announcements, screen reader, RTL, zoom, and high-contrast matrix remains. |
| 17. Performance/resilience/observability | PARTIAL | Build, offline recovery, 403 rendering/recovery, normal local flow, and realtime route boundaries pass. Large-data, slow/throttled, timeout, 401/409/429/5xx, observability, and authenticated realtime delivery remain. |
| 18. API/Admin/MCP parity | PASS for exercised scope; PARTIAL overall | MCP 21/21, privacy/API-boundary 28/28, focused Maps Projects tests 6/6, custom-field value/filter-value descriptors, comment create, and notification actions pass. Unexercised actions and full direct-request matrix remain. |
| 19. Regression/release sign-off | BLOCKED | Automated gates are green, but many checklist leaves are intentionally not executed and require additional identities, providers, devices, or product decisions. |
| 20. Codebase coverage map | INFORMATIONAL | Checklist is mapped to current code and remains the follow-up plan. |

## Remaining required actions

1. Decide whether `/integrations` and project `/timeline` are supported routes or should be removed/redirected explicitly.
2. Provide isolated owner, admin, manager, contributor, viewer, uninvited, external-invitee, and deactivated-user fixtures.
3. Provide staging credentials/endpoints for calendar feeds, GitHub, GitLab, Gitea, webhooks, chat, ntfy, Gotify, and sync workers.
4. Complete the remaining checklist batches: full bulk selection/pagination and role matrix, full task field/archive/delete matrix, notification delivery, accessibility, network resilience, browser matrix, and regression/security deep links.
5. Run the authenticated realtime delivery matrix with two valid Firebase fixtures: user/project WebSocket upgrades, cross-tab task/project/comment updates, access revocation, reconnect, ping/pong, and notification recipient delivery.

## Cleanup and risk

The local Projects database was verified after cleanup, with migrations `0001` through `0009` applied: five seeded projects, 13 members, 15 tasks, 1 milestone, 2 relations, 1 comment, and 1 saved view. The browser probes are retained as repository tests, no temporary generated fixtures remain, and the local test ports were clear after shutdown.

The feature-level automated and live checks are green, but this should not be represented as full release sign-off until the explicitly listed identity/provider/environment gaps and authenticated realtime delivery are resolved.
