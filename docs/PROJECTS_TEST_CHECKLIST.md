# Projects QA Master Checklist

This is the end-to-end checklist for the `Projects` application. It is intentionally organized as:

`surface → feature → sub-feature → behavior → edge case`

Use it as a living test plan. Tick a leaf only after the behavior has been tested and record the evidence in the test run, bug report, or linked automated test.

## How to use this checklist

For every leaf check below:

- Test the happy path, the invalid path, and the failure/retry path when the leaf changes data.
- Repeat the leaf for the relevant roles in the [role matrix](#2-role-and-visibility-matrix), not just the project owner.
- Repeat the leaf for the relevant viewport, theme, locale, and network condition in the [environment matrix](#3-environment-matrix).
- After mutations, verify the UI, the URL, a hard refresh, the API response, and the activity/audit record where applicable.
- Record `Pass`, `Fail`, `Blocked`, or `Not applicable`; never silently skip a checkbox.

### Status labels

- **Core** — expected to work in the current Projects application.
- **Conditional** — test when the provider/credential/configuration exists.
- **Unavailable by design** — the UI must clearly report that the capability is not enabled; a false success is a bug.
- **Security-critical** — failure is release-blocking.

### Evidence template

```text
Run/date:
Build/commit:
Environment:
Browser/device:
User/role:
Workspace/project/task fixture:
Checklist IDs:
Result:
Evidence: screenshot, video, API response, console log, or automated test
Defect link:
```

## 1. Test readiness and fixtures

### 1.1 Build and environment readiness

- [ ] **Core — Local setup**
  - [ ] Install from the root lockfile with `npm ci`.
  - [ ] Start the Projects app with `npm run dev:projects`.
  - [ ] Confirm the Projects app opens on the documented local port.
  - [ ] Confirm `/api` requests reach the local Admin/Maps worker through the Vite proxy.
  - [ ] Confirm no database, MCP, or token secret is present in the browser bundle.
  - [ ] Confirm a clean browser profile can load the sign-in screen.
- [ ] **Core — Automated baseline**
  - [ ] `npm run test --workspace Projects` passes.
  - [ ] `npm run typecheck --workspace Projects` passes.
  - [ ] `npm run build:projects` passes.
  - [ ] `npm run test:projects` passes.
  - [ ] `npm run test:projects:ui` passes with the required auth fixture.
  - [ ] `npm run docs:check` passes after checklist changes.
- [ ] **Core — Deployment configuration**
  - [ ] `VITE_ADMIN_ORIGIN` points to the intended environment.
  - [ ] Local and deployed API origins do not get mixed.
  - [ ] Required D1, R2, auth, and encryption-key bindings exist in the target environment.
  - [ ] Production-only secrets are not available to the client.
  - [ ] A deployed build serves the same route tree as the tested build.

### 1.2 Required identity fixtures

Create or identify these accounts before starting the full pass:

- [ ] **Owner** — workspace owner and project owner.
  - [ ] Can manage all workspace and project settings.
  - [ ] Can transfer ownership only to an eligible member.
- [ ] **Workspace admin** — admin role but not owner.
  - [ ] Can perform the permissions granted by the workspace role.
  - [ ] Cannot perform owner-only operations.
- [ ] **Workspace member** — regular workspace member.
  - [ ] Has the expected inherited project access.
  - [ ] Has no unrequested admin access.
- [ ] **Workspace viewer** — read-only workspace member.
  - [ ] Can see only projects and tasks permitted by workspace policy.
  - [ ] Cannot mutate project data.
- [ ] **Project admin** — project-level admin without broad workspace ownership.
  - [ ] Can manage project settings and members where granted.
  - [ ] Cannot manage unrelated workspace data.
- [ ] **Project manager** — manager role.
  - [ ] Can perform manager-level task and workflow actions.
  - [ ] Cannot perform project-admin-only actions.
- [ ] **Project contributor** — contributor role.
  - [ ] Can create or edit only the tasks allowed by permissions.
  - [ ] Cannot edit project configuration unless explicitly granted.
- [ ] **Project viewer** — project read-only member.
  - [ ] Can read only visible project/task data.
  - [ ] Cannot create, edit, delete, comment, attach, or change relations unless policy says otherwise.
- [ ] **Uninvited user** — authenticated user with no workspace/project membership.
  - [ ] Receives a consistent not-found or forbidden result without data leakage.
- [ ] **External invitee** — valid external email address.
  - [ ] Can receive, open, accept, expire, and be revoked from an invitation.
- [ ] **Karamah admin** — account eligible for the special admin surface.
  - [ ] Receives only the intended admin capabilities.
  - [ ] Does not bypass project-level task visibility accidentally.
- [ ] **Deleted/deactivated user**.
  - [ ] Existing assignments, comments, watchers, and history remain safe and readable.
  - [ ] New access is denied.

### 1.3 Required data fixtures

- [ ] **Two workspaces** with different members and unrelated projects.
  - [ ] Workspace A has the full role matrix.
  - [ ] Workspace B is used for cross-tenant access tests.
- [ ] **Projects**
  - [ ] Workspace-visible project.
  - [ ] Restricted/private project.
  - [ ] Public project only if public sharing is explicitly enabled.
  - [ ] Archived project.
  - [ ] Project with a long name, long description, icon, and background.
  - [ ] Project with no tasks, one task, and more tasks than one page/load batch.
- [ ] **Workflow columns**
  - [ ] Inbox/planned.
  - [ ] Assigned.
  - [ ] In progress.
  - [ ] Blocked.
  - [ ] Completed/final.
  - [ ] Cancelled/final.
  - [ ] Custom column names and reordered columns.
- [ ] **Tasks**
  - [ ] Untitled/short/long title cases.
  - [ ] Description empty, plain text, rich text, markdown, code, table, image, mention, and URL.
  - [ ] Every priority: no priority, low, normal, medium, high, urgent.
  - [ ] Every status/category.
  - [ ] Unassigned, current-user assigned, another-member assigned, and external/deleted assignee.
  - [ ] No dates, start date only, due date only, both dates, overdue, today, future, and invalid date ordering.
  - [ ] Labels with each available color, duplicate-like names, long names, and no labels.
  - [ ] Milestone assigned and unassigned.
  - [ ] Subtasks with zero, partial, and complete progress.
  - [ ] Blocking, blocked-by, relates-to, and subtask relations.
  - [ ] Comments by several users, edited comment, deleted comment, image comment, and malicious-looking content.
  - [ ] Watchers including current user, another member, and removed user.
  - [ ] Time entries with open, closed, zero, large, and invalid durations.
  - [ ] Attachments with supported, unsupported, empty, large, renamed, and deleted files.
  - [ ] External links with valid, invalid, unsafe, duplicate, and deleted URLs.
  - [ ] Custom-field values for every supported type, missing required values, and invalid values.
- [ ] **Saved view fixtures**
  - [ ] Personal view.
  - [ ] Shared view.
  - [ ] Same-name view collision.
  - [ ] View for every project layout.
  - [ ] View with multiple filters and sort settings.
- [ ] **Notification fixtures**
  - [ ] Unread task assignment.
  - [ ] Unread comment/activity.
  - [ ] Read notification.
  - [ ] Notification for a task the user cannot see.
  - [ ] More than the displayed notification limit.
- [ ] **Integration fixtures**
  - [ ] No provider configured.
  - [ ] Valid provider configured.
  - [ ] Invalid token/URL.
  - [ ] Expired token.
  - [ ] Provider returns an error or rate limit.
  - [ ] Webhook with and without a secret.

## 2. Role and visibility matrix

Run the relevant leaf checks against each row. A UI-only hidden button is not enough; confirm the server rejects a direct request too.

### 2.1 Project-level capability matrix

- [ ] **Viewer**
  - [ ] Can read project metadata allowed by visibility.
  - [ ] Can read only tasks allowed by task visibility.
  - [ ] Cannot create tasks.
  - [ ] Cannot edit tasks unless explicitly granted.
  - [ ] Cannot delete or archive tasks.
  - [ ] Cannot manage columns, labels, custom fields, members, webhooks, or settings.
- [ ] **Contributor**
  - [ ] Can create tasks when `can_create_tasks` is granted.
  - [ ] Can edit own tasks when `can_edit_own_tasks` is granted.
  - [ ] Cannot edit another user's task when not granted.
  - [ ] Can comment, label, relate, or attach only when each capability is granted.
  - [ ] Cannot manage project configuration.
- [ ] **Manager**
  - [ ] Can edit any task when `can_edit_any_tasks` is granted.
  - [ ] Can manage workflow/columns where granted.
  - [ ] Can manage labels/custom fields/milestones where granted.
  - [ ] Cannot manage members or delete the project unless granted.
- [ ] **Project admin**
  - [ ] Can manage project members and invitations.
  - [ ] Can manage project settings and visibility.
  - [ ] Can archive/delete project only when the capability is granted.
  - [ ] Cannot silently gain unrelated workspace-admin capabilities.

### 2.2 Task visibility matrix

- [ ] **All**
  - [ ] Member can see every task permitted by project visibility.
  - [ ] Search, saved views, counts, relations, notifications, and activity respect the same scope.
- [ ] **Assigned**
  - [ ] Assignee can see the assigned task.
  - [ ] A watcher who is not the assignee cannot see it unless policy grants access.
  - [ ] The task creator cannot see it solely because they created it.
  - [ ] Search and board counts do not reveal hidden task titles or counts.
- [ ] **Own**
  - [ ] Creator can see the task.
  - [ ] Assignee who is not the creator cannot see it unless separately allowed.
  - [ ] A viewer cannot infer it from empty states, totals, URLs, or activity.
- [ ] **Cross-user changes**
  - [ ] Changing assignee changes visibility immediately where policy requires.
  - [ ] Removing a user does not expose tasks through a stale cache.
  - [ ] Direct task ID, ticket ID, relation ID, attachment ID, and comment ID requests remain protected.

### 2.3 Project visibility matrix

- [ ] **Workspace visibility**
  - [ ] Authorized workspace members can discover the project.
  - [ ] Non-members cannot discover it through list, search, counts, or deep links.
- [ ] **Restricted/private visibility**
  - [ ] Only project members, owners, and explicitly inherited roles can discover it.
  - [ ] Project metadata, task titles, labels, comments, attachments, and activity remain private.
- [ ] **Public visibility**
  - [ ] Public route exposes only the data explicitly approved for public display.
  - [ ] Private tasks, comments, members, attachments, activity, and secrets are not exposed.
  - [ ] Public link can be copied and opened in a signed-out browser.
  - [ ] Public link can be disabled and then stops working.
  - [ ] Public link does not grant authenticated mutation privileges.
  - [ ] Public project behavior matches the configured share-token policy.

## 3. Environment matrix

### 3.1 Browser and viewport coverage

- [ ] Desktop Chromium.
- [ ] Desktop Firefox.
- [ ] Desktop WebKit/Safari equivalent.
- [ ] Mobile Chromium at 360px wide.
- [ ] Mobile Safari equivalent at 360px wide.
- [ ] Tablet portrait.
- [ ] Tablet landscape.
- [ ] Large desktop with a wide task list.
- [ ] Browser zoom at 80%, 100%, 125%, and 200%.
- [ ] Keyboard-only navigation.
- [ ] Screen reader smoke pass.

### 3.2 Visual and locale coverage

- [ ] Light theme.
- [ ] Dark theme.
- [ ] System theme switching while the app is open.
- [ ] Every supported locale in `Projects/i18n`.
- [ ] Long translated labels and pluralized task counts.
- [ ] Local timezone behind and ahead of UTC.
- [ ] Week starting Monday.
- [ ] Week starting Sunday.
- [ ] Daylight-saving transition date.
- [ ] Reduced-motion preference.
- [ ] High-contrast or forced-colors mode where available.

### 3.3 Network and session coverage

- [ ] Normal latency.
- [ ] Slow 3G-like latency.
- [ ] Offline before opening the app.
- [ ] Offline during a read.
- [ ] Offline during a mutation.
- [ ] Request timeout.
- [ ] 401/session expiry.
- [ ] 403/permission denial.
- [ ] 404/deleted resource.
- [ ] 409/optimistic revision conflict.
- [ ] 429/rate limit.
- [ ] 5xx/server failure.
- [ ] WebSocket disconnect and resume.
- [ ] Two browser sessions editing the same task.

## 4. Authentication, onboarding, and entry points

### 4.1 Authentication route guards

- [ ] Signed-out user visiting the dashboard is redirected to sign-in.
  - [ ] The intended destination is preserved when safe.
  - [ ] An unsafe or malformed return URL is rejected.
  - [ ] Auth pages remain reachable after a session lookup failure.
- [ ] Signed-in user visiting sign-in/sign-up is redirected to the correct authenticated destination.
- [ ] Expired session returns to auth without an infinite redirect loop.
- [ ] A 401 from an API mutation clears or refreshes session state safely.
- [ ] A 5xx/network failure is not treated as a valid anonymous session incorrectly.

### 4.2 Sign in and sign up

- [ ] Email/password sign-in.
  - [ ] Valid credentials succeed.
  - [ ] Invalid credentials show a useful error without revealing which field was wrong.
  - [ ] Empty, whitespace, malformed, and overlong values are rejected.
  - [ ] Submit button loading state prevents duplicate submissions.
  - [ ] Pressing Enter submits once.
- [ ] Email/password sign-up.
  - [ ] Valid new account succeeds.
  - [ ] Existing email is handled safely.
  - [ ] Password rules and confirmation are enforced.
  - [ ] Captcha/Turnstile is required when configured.
  - [ ] Captcha failure and expiry can be retried.
  - [ ] Terms/privacy links open the correct pages.
- [ ] Provider sign-in.
  - [ ] Provider button has the correct label and icon.
  - [ ] Successful callback creates or resumes the intended account.
  - [ ] User cancellation returns cleanly to auth.
  - [ ] Provider error does not create a partial session.
- [ ] Email verification/OTP.
  - [ ] Valid code is accepted once.
  - [ ] Invalid, expired, reused, short, and overlong codes are rejected.
  - [ ] Resend works and does not cause a stale code to be accepted.
  - [ ] Paste and keyboard entry work.
  - [ ] Rate limiting has a clear recovery path.
- [ ] Password reset.
  - [ ] Valid reset request shows a privacy-safe result.
  - [ ] Reset link opens the correct screen.
  - [ ] Expired, already-used, malformed, and mismatched reset tokens fail safely.
  - [ ] New password signs in successfully.
  - [ ] Old password no longer works where required.

### 4.3 Profile setup and onboarding

- [ ] New authenticated user is routed to profile setup when required.
  - [ ] Required name/display-name validation works.
  - [ ] Avatar upload, removal, size, type, and failure paths work.
  - [ ] Back/refresh does not lose completed setup unexpectedly.
- [ ] Starter workspace/project creation.
  - [ ] Starter project is created once.
  - [ ] Starter columns and starter tasks are correct.
  - [ ] Re-running onboarding is idempotent.
  - [ ] Partial failure does not create duplicate projects/tasks.
- [ ] Onboarding completion.
  - [ ] User lands on the intended workspace/project.
  - [ ] Skip and completion states persist after refresh.
  - [ ] Signed-out and signed-in transitions do not leak onboarding data.

### 4.4 Invitations and device entry

- [ ] Workspace invitation link opens for a signed-out user.
  - [ ] Invitation details are shown without exposing unrelated members.
  - [ ] Sign-in/sign-up preserves the invitation.
  - [ ] Accepting once is idempotent.
  - [ ] Expired, cancelled, already-accepted, and unknown invitations fail clearly.
- [ ] Project invitation link opens and grants only the invited access.
- [ ] Invitation cancellation prevents later acceptance.
- [ ] Device-code flow.
  - [ ] Code format and expiry are enforced.
  - [ ] Approval requires the correct signed-in user.
  - [ ] Denial and reuse are safe.
  - [ ] Polling stops after success, expiry, denial, or timeout.
- [ ] MCP authorization flow.
  - [ ] Consent screen identifies the client and requested scope.
  - [ ] Approve and deny both work.
  - [ ] Short-lived confirmation is required for risky mutations.
  - [ ] Revoked/expired authorization cannot be reused.

## 5. Application shell and navigation

### 5.1 Global shell

- [ ] Sidebar opens, collapses, and remains usable on mobile.
- [ ] Current workspace/project/task is visually identifiable without color alone.
- [ ] Logo and home navigation go to the correct destination.
- [ ] Breadcrumbs preserve the current workspace, project, view, and task.
- [ ] Browser back/forward restores the correct route and state.
- [ ] Refreshing any supported deep link does not fall through to a blank page.
- [ ] Loading skeletons do not shift the page excessively.
- [ ] Empty states explain the next action.
- [ ] Error states identify whether retry, permission, or navigation is needed.
- [ ] Toasts are readable, dismissible, non-duplicated, and announced accessibly.
- [ ] Modals trap focus and close safely with Escape where intended.
- [ ] Destructive actions require the intended confirmation.

### 5.2 Workspace and project navigation

- [ ] Workspace switcher lists only accessible workspaces.
  - [ ] Switching workspaces updates route and data together.
  - [ ] A deleted/archived workspace is handled without stale navigation.
- [ ] Project switcher lists only accessible projects.
  - [ ] Archived project visibility follows policy.
  - [ ] Project order matches saved order.
  - [ ] Long names and duplicate-looking names remain distinguishable.
- [ ] Project crumb select opens the intended project.
- [ ] Task crumb select opens the intended task.
- [ ] Mobile project navigation exposes all supported views without horizontal overflow.
- [ ] Workspace timeline and project timeline links preserve filters and date range.

### 5.3 Global command/search surfaces

- [ ] Command palette opens by button and shortcut.
  - [ ] Commands are searchable.
  - [ ] Keyboard navigation and Enter selection work.
  - [ ] Disabled commands explain why they are unavailable.
  - [ ] Escape closes without changing the underlying page.
- [ ] Global search opens by button and shortcut.
  - [ ] Empty query does not issue a broad destructive request.
  - [ ] Results are limited to visible workspaces/projects/tasks.
  - [ ] Search matches title, description, ticket number, and supported fields.
  - [ ] Search handles special characters, unicode, and long input.
  - [ ] Selecting a result opens the correct deep link.
  - [ ] Deleted/revoked result is handled safely.
- [ ] Shortcut help lists actual active shortcuts only.
  - [ ] Platform-specific modifier labels are correct.
  - [ ] Shortcuts do not fire while typing in a text field/editor.
  - [ ] Shortcut behavior respects reduced motion and accessibility needs.

## 6. Workspace management

### 6.1 Workspace lifecycle

- [ ] Create workspace.
  - [ ] Name required, trimmed, bounded, and safely rendered.
  - [ ] Description optional, bounded, and safely rendered.
  - [ ] Creator becomes owner.
  - [ ] Default roles are created exactly once.
  - [ ] Duplicate submission does not create duplicate workspaces.
  - [ ] Server rejection leaves the form recoverable.
- [ ] List workspaces.
  - [ ] Archived workspaces are excluded or clearly marked per policy.
  - [ ] Counts and names do not leak inaccessible workspaces.
- [ ] Update workspace name and description.
  - [ ] Autosave/loading/success/error states are correct.
  - [ ] Refresh preserves the saved value.
  - [ ] Concurrent edits do not silently overwrite newer data.
- [ ] Archive/delete workspace.
  - [ ] Owner-only restriction is enforced.
  - [ ] Confirmation explains the impact.
  - [ ] Existing projects/tasks are handled according to policy.
  - [ ] Archived workspace cannot be used through old URLs.
  - [ ] No orphaned project access remains.

### 6.2 Workspace members and invitations

- [ ] Member list loads, sorts, paginates, and handles loading/error/empty states.
- [ ] Search/filter members by email, display name, and status.
- [ ] Invite member.
  - [ ] Valid email succeeds.
  - [ ] Case/whitespace normalization works.
  - [ ] Invalid, duplicate, self, owner, and already-member addresses are handled.
  - [ ] Workspace role and selected-project access are saved correctly.
  - [ ] Project role overrides are preserved.
  - [ ] Invitation email failure is visible without granting access prematurely.
- [ ] Resend invitation.
  - [ ] Expiration and resend behavior are correct.
  - [ ] Multiple clicks do not send duplicate uncontrolled invitations.
- [ ] Cancel invitation.
  - [ ] Cancelled invite cannot be accepted.
  - [ ] Cancel action is permission-checked server-side.
- [ ] Edit member.
  - [ ] Workspace role changes apply to inherited project access.
  - [ ] Project-only access can be selected when allowed.
  - [ ] Selected project IDs are validated against the same workspace.
  - [ ] Owner cannot be downgraded or removed incorrectly.
  - [ ] Permission changes update the effective capability matrix.
- [ ] Remove member.
  - [ ] Confirmation identifies the member and impact.
  - [ ] Removal revokes workspace and inherited project access.
  - [ ] Existing authored data remains readable according to policy.
  - [ ] Removed user cannot access old task, attachment, or invitation URLs.

### 6.3 Workspace roles and capabilities

- [ ] List preset and custom roles.
- [ ] Create custom role.
  - [ ] Name, ID, description, and permission list validate.
  - [ ] Duplicate IDs/names are rejected safely.
  - [ ] Unsupported permissions cannot be smuggled through the client.
- [ ] Update custom role permissions.
  - [ ] Existing members receive the intended effective permissions.
  - [ ] Preset roles cannot be changed through a custom-role route.
- [ ] Delete custom role.
  - [ ] Role in use cannot be deleted or is migrated with an explicit safe rule.
  - [ ] Default roles cannot be deleted.
- [ ] Capability check endpoint.
  - [ ] Allowed result matches UI availability.
  - [ ] Denied result is enforced by the mutation endpoint too.
  - [ ] Workspace A capabilities never affect Workspace B.

## 7. Project lifecycle and project settings

### 7.1 Project creation and discovery

- [ ] Create project from the workspace.
  - [ ] Name is required, trimmed, bounded, and safely rendered.
  - [ ] Description is optional and preserves supported formatting rules.
  - [ ] Icon selection and fallback work.
  - [ ] Background selection and fallback work.
  - [ ] Default columns are created with the intended status categories.
  - [ ] Creator becomes project owner/admin.
  - [ ] Initial project visibility is correct.
  - [ ] Duplicate clicks do not create duplicate projects.
  - [ ] Partial creation failure is recoverable and does not create a half-visible project.
- [ ] Project list.
  - [ ] Projects are sorted by the intended position/name rule.
  - [ ] Reordering persists after refresh and across sessions.
  - [ ] Empty state provides create/join guidance.
  - [ ] Restricted and archived projects are labeled correctly.
  - [ ] Project statistics do not include tasks the viewer cannot see.
- [ ] Project open.
  - [ ] Default view is correct.
  - [ ] Existing saved view/default preference is respected.
  - [ ] Invalid project ID/slug displays the unavailable state.
  - [ ] Cross-workspace project ID is rejected.

### 7.2 Project general settings

- [ ] Update project name.
  - [ ] Empty, whitespace, duplicate-looking, max-length, and unsafe values are handled.
  - [ ] Name updates in sidebar, breadcrumbs, page title, search, and deep links.
  - [ ] Autosave does not lose characters while typing.
- [ ] Update project description.
  - [ ] Empty description clears intentionally.
  - [ ] Long content remains readable and safely rendered.
  - [ ] Markdown/HTML handling matches the product policy.
- [ ] Update project icon.
  - [ ] Picker is keyboard accessible.
  - [ ] Selection persists after refresh.
  - [ ] Invalid icon value falls back safely.
- [ ] Update project background.
  - [ ] Every supported background renders in light and dark themes.
  - [ ] Background is not mistaken for status or permission information.
  - [ ] Saved background loads consistently on board/list/calendar/gantt.
- [ ] Move project between workspaces.
  - [ ] Only eligible target workspaces are listed.
  - [ ] Move requires appropriate permission.
  - [ ] Project and task access is recalculated after move.
  - [ ] Old workspace URLs do not expose the project.
  - [ ] Members, labels, custom fields, views, attachments, and integrations survive or are migrated explicitly.
  - [ ] Failed move does not leave a duplicate or orphan.
- [ ] Archive project.
  - [ ] Confirmation explains impact.
  - [ ] Archived project disappears from normal active lists.
  - [ ] Existing task URLs resolve according to policy.
  - [ ] Mutations are blocked after archive where intended.
  - [ ] Statistics and search do not count archived data unexpectedly.
- [ ] Project danger zone.
  - [ ] Destructive action is permission-gated.
  - [ ] Exact project identity is shown in confirmation.
  - [ ] Required confirmation text is validated.
  - [ ] Cancellation leaves all data unchanged.
  - [ ] Post-delete/post-archive navigation is safe.

### 7.3 Project visibility and sharing

- [ ] Open visibility settings as each relevant role.
- [ ] Change workspace/restricted/public visibility.
  - [ ] Unsupported transition is disabled or explained.
  - [ ] Transition takes effect after refresh and in another session.
  - [ ] Existing public URL is invalidated when policy requires.
  - [ ] Private-to-public confirmation states exactly what becomes public.
- [ ] Copy public link.
  - [ ] Link is correct, stable, and copied once.
  - [ ] Copy failure provides a manual fallback.
  - [ ] Link opens from a signed-out browser.
- [ ] Revoke public link.
  - [ ] Old link stops working.
  - [ ] Cached public page does not reveal stale private data.
- [ ] Public project page.
  - [ ] Project title, description, icon, background, columns, and permitted tasks render.
  - [ ] Task detail modal/page respects public field policy.
  - [ ] Members, assignee emails, private comments, activity, attachments, webhooks, and custom secrets are not exposed.
  - [ ] Search engine/meta behavior matches privacy policy.
  - [ ] Invalid/expired share token shows a safe unavailable page.

### 7.4 Project workflow/columns

- [ ] List columns in saved order.
- [ ] Create column.
  - [ ] Name is required, trimmed, bounded, and safely rendered.
  - [ ] Status category is limited to valid categories.
  - [ ] Position is persisted.
  - [ ] Duplicate names/categories are handled according to policy.
- [ ] Edit column name, category, and position.
  - [ ] Existing tasks retain correct status semantics.
  - [ ] Final/non-final behavior updates correctly.
  - [ ] Board, list, backlog, calendar, and filters reflect the change.
- [ ] Reorder columns by drag and keyboard.
  - [ ] Drop indicators are correct.
  - [ ] Optimistic order rolls back on failure.
  - [ ] Concurrent reorder does not corrupt positions.
- [ ] Delete column.
  - [ ] Deletion is blocked or requires migration when tasks exist.
  - [ ] Migrating tasks preserves status/history.
  - [ ] Deleting an empty column updates every view.

### 7.5 Project-level custom fields

- [ ] Open custom-field settings.
- [ ] Create each supported field type.
  - [ ] Text field.
  - [ ] Number field.
  - [ ] Date field.
  - [ ] Checkbox field.
  - [ ] Single-choice field.
  - [ ] Multi-choice field.
  - [ ] Required/non-required setting.
  - [ ] Default value.
  - [ ] Options add, edit, reorder, duplicate, empty, and delete.
  - [ ] Maximum option count and value length are enforced.
- [ ] Edit field name, type/settings, options, default, required state, and position.
  - [ ] Existing task values are migrated or rejected safely on type change.
  - [ ] Field order is reflected on task cards and detail pages.
- [ ] Delete custom field.
  - [ ] Confirmation explains value loss.
  - [ ] Deleted field disappears from filters and task forms.
  - [ ] Old cached task data does not render a ghost field.

### 7.6 Project display settings

- [ ] Toggle task card fields.
  - [ ] Assignee.
  - [ ] Priority.
  - [ ] Due date.
  - [ ] Labels.
  - [ ] Progress/subtask badges.
  - [ ] Custom fields.
  - [ ] External links/metadata where supported.
- [ ] Change default view.
  - [ ] Board.
  - [ ] List.
  - [ ] Calendar.
  - [ ] Gantt/timeline.
  - [ ] Backlog.
- [ ] Change sort field and direction.
  - [ ] Position.
  - [ ] Title.
  - [ ] Priority.
  - [ ] Due date.
  - [ ] Created/updated date.
  - [ ] Stable tie-breaker keeps ordering deterministic.
- [ ] Change week start.
  - [ ] Calendar and date picker agree.
  - [ ] Saved preference persists across sessions.

## 8. Project views and task navigation

### 8.1 Board view

- [ ] Board loads all visible columns and tasks.
  - [ ] Loading skeleton, empty board, and API error states work.
  - [ ] Hidden tasks are absent from cards, counts, and scroll height.
- [ ] Board task card.
  - [ ] Title, task number, status, priority, assignee, due date, labels, progress, and custom fields render correctly.
  - [ ] Long title and missing-field layouts do not overlap.
  - [ ] Card click opens the correct task.
  - [ ] Card context menu opens without triggering navigation accidentally.
  - [ ] Keyboard focus and activation work.
- [ ] Board drag and drop.
  - [ ] Move within the same column.
  - [ ] Move to another column.
  - [ ] Move to first, middle, and last position.
  - [ ] Move with active filters.
  - [ ] Move a completed/cancelled task.
  - [ ] Drop outside a valid target is cancelled.
  - [ ] Optimistic move is rolled back on failure.
  - [ ] Revision conflict preserves the server's newer state and explains the conflict.
  - [ ] Status and position both persist after refresh.
  - [ ] Activity records the move/status change correctly.
- [ ] Board column controls.
  - [ ] Collapse/expand if supported.
  - [ ] Column task count matches visible tasks.
  - [ ] Final status behavior is correct.
  - [ ] Column reorder works by pointer and keyboard.

### 8.2 List view

- [ ] List groups tasks by the intended column/status.
- [ ] Row displays the configured task fields.
- [ ] Row click, keyboard activation, and context menu open the correct task.
- [ ] Inline or popover field updates persist.
- [ ] Sorting is stable and matches the selected order.
- [ ] Long rows remain usable at 360px without hidden critical actions.
- [ ] Empty groups and all-empty list states are distinct and useful.

### 8.3 Backlog view

- [ ] Backlog separates planned/backlog tasks from active workflow tasks correctly.
- [ ] Backlog task row supports title, status, priority, assignee, dates, labels, and selection.
- [ ] Backlog toolbar actions are permission-gated.
- [ ] Moving a task from backlog to a workflow column updates both views.
- [ ] Completed/cancelled tasks are included or excluded according to the configured scope.
- [ ] Bulk selection and bulk mutation work in backlog.
- [ ] Backlog pagination/load-more does not duplicate or skip tasks.

### 8.4 Calendar view

- [ ] Month grid renders the correct month, week start, and timezone.
- [ ] Tasks appear on due date and span dates according to product rules.
- [ ] Start-only, due-only, both-date, overdue, and undated tasks behave correctly.
- [ ] Multiple tasks on one day overflow into a usable popover.
- [ ] Calendar toolbar changes month/date range without losing project context.
- [ ] Clicking a task bar opens the correct task.
- [ ] Drag/resize behavior, if enabled, updates dates safely.
- [ ] Date changes preserve task status/priority/assignee/relations.
- [ ] Leap day, month boundaries, year boundaries, and DST dates work.

### 8.5 Gantt/timeline view

- [ ] Gantt/timeline loads visible tasks with valid date ranges.
- [ ] Tasks without dates are represented clearly or excluded intentionally.
- [ ] Start and due dates map to the correct bar position and duration.
- [ ] Milestones render with correct label/date/status.
- [ ] Zoom/window controls preserve task identity and date accuracy.
- [ ] Scroll/pan is usable with pointer, wheel, touch, and keyboard where supported.
- [ ] Task click opens the correct task.
- [ ] Date mutation from the timeline is permission-gated and rollback-safe.
- [ ] Large task sets remain usable without freezing the browser.

### 8.6 Workspace timeline and cross-project views

- [ ] Workspace timeline includes only projects/tasks visible to the current user.
- [ ] Project filter and date filter combine correctly.
- [ ] Cross-project task links open the correct project/task.
- [ ] Hidden project data cannot be inferred from gaps, counts, or tooltip text.

### 8.7 Filter system

- [ ] Open filter menu by button and shortcut.
- [ ] Add filters for:
  - [ ] Status/column.
  - [ ] Priority.
  - [ ] Assignee/unassigned.
  - [ ] Creator.
  - [ ] Label.
  - [ ] Milestone.
  - [ ] Start date.
  - [ ] Due date.
  - [ ] Completion state.
  - [ ] Task number/title/text where supported.
  - [ ] Every supported custom field.
- [ ] Test filter operators.
  - [ ] Is.
  - [ ] Is not.
  - [ ] Is empty.
  - [ ] Is not empty.
  - [ ] Contains.
  - [ ] Does not contain.
  - [ ] Before/on/after date.
  - [ ] Multiple values.
  - [ ] Negated values.
- [ ] Combine multiple filters.
  - [ ] AND/OR behavior matches the UI label.
  - [ ] Filter order is preserved where it affects semantics.
  - [ ] Clearing one filter leaves the others intact.
  - [ ] Clear-all resets the view completely.
- [ ] Filter edge cases.
  - [ ] No matches.
  - [ ] Hidden values are not offered to unauthorized users.
  - [ ] Deleted label/member/custom field is removed safely.
  - [ ] URL/local storage persistence is valid and recoverable.
  - [ ] Invalid stored filters do not break the page.

### 8.8 Saved views

- [ ] Save current filters/sort/layout as a personal view.
  - [ ] Name is required, trimmed, bounded, and duplicate names are handled.
  - [ ] View reloads with the same filter/sort/layout state.
  - [ ] View survives refresh and a new session.
- [ ] Share saved view.
  - [ ] Shared flag is visible to authorized users.
  - [ ] Other members see the view only when allowed.
  - [ ] Private view remains private.
- [ ] Update saved view.
  - [ ] Renaming and changing filters do not create unintended duplicates.
  - [ ] Owner-only update rules are enforced.
- [ ] Delete saved view.
  - [ ] Delete removes it from menus and direct navigation.
  - [ ] Active deleted view falls back safely.

### 8.9 Search, deep links, and task IDs

- [ ] Project search matches visible title and description content.
- [ ] Search handles case, accents, punctuation, whitespace, and partial terms.
- [ ] Search result ranking/order is deterministic.
- [ ] Search respects project and task visibility.
- [ ] Ticket-number search opens the correct task.
- [ ] Slug/title changes keep links valid or redirect safely.
- [ ] Malformed project/task/ticket IDs do not cause a server error page.
- [ ] Copy link creates a canonical URL.
- [ ] Opening a task in a new tab preserves workspace/project context.

## 9. Task lifecycle and properties

### 9.1 Create task

- [ ] Create from board.
- [ ] Create from list.
- [ ] Create from backlog.
- [ ] Create from project header/quick action.
- [ ] Create from keyboard shortcut.
- [ ] Create from task template where exposed.
- [ ] Create task form.
  - [ ] Title required, trimmed, bounded, and safely rendered.
  - [ ] Empty/whitespace-only title rejected.
  - [ ] Description initial value saves correctly.
  - [ ] Initial column/status correct.
  - [ ] Initial priority correct.
  - [ ] Initial assignee supports unassigned/current user/another member.
  - [ ] Initial start and due dates validate.
  - [ ] Initial labels attach correctly.
  - [ ] Initial milestone attaches correctly.
  - [ ] Initial custom-field values validate and save.
  - [ ] Duplicate submit is prevented.
  - [ ] Server failure keeps entered data recoverable.
  - [ ] Created task receives a unique ticket number.
  - [ ] Created task appears in every relevant view and search result.

### 9.2 Task title, number, and URL

- [ ] Inline title edit saves on blur and Enter.
- [ ] Escape cancels without saving.
- [ ] Title autosave handles rapid typing and network delay.
- [ ] Empty, max-length, unicode, emoji, punctuation, and newline input behave correctly.
- [ ] Ticket number is stable and unique within the intended project.
- [ ] Displayed URL slug updates according to policy after title change.
- [ ] Old task URL is redirected or rejected safely.
- [ ] Title text is escaped in cards, breadcrumbs, search, public view, and notifications.

### 9.3 Status and workflow

- [ ] Change status from task detail.
- [ ] Change status from board card/context menu.
- [ ] Change status from list/backlog row.
- [ ] Change status with keyboard shortcut.
- [ ] Verify every status: inbox, assigned, in progress, blocked, completed, cancelled.
- [ ] Verify status/category mapping between UI, client adapter, and API.
- [ ] Completing a task sets completion data correctly.
- [ ] Reopening a completed/cancelled task clears or preserves completion data according to policy.
- [ ] Status change updates counts, filters, calendar/gantt inclusion, activity, and notifications.
- [ ] Unauthorized status change is rejected even through a direct request.

### 9.4 Priority

- [ ] Set no priority.
- [ ] Set low priority.
- [ ] Set normal/no-priority alias behavior.
- [ ] Set medium priority.
- [ ] Set high priority.
- [ ] Set urgent priority.
- [ ] Priority icon/label is distinguishable without color alone.
- [ ] Priority persists in card, row, detail, search, filter, and refresh.
- [ ] Bulk priority update uses the same normalization as single-task update.
- [ ] Invalid priority is rejected and cannot be stored through the API.

### 9.5 Assignee

- [ ] Open assignee picker from each supported surface.
- [ ] Assign unassigned.
- [ ] Assign current user.
- [ ] Assign another visible member.
- [ ] Remove assignee.
- [ ] Search members by name/email.
- [ ] Long member list scrolls and loads correctly.
- [ ] Deleted/removed member is represented safely.
- [ ] Assignee identity remains consistent across avatar, task chip, filters, notifications, and API payload.
- [ ] Assignment updates task visibility according to policy.
- [ ] Assignee receives the intended notification and no duplicate notification.
- [ ] Unauthorized assignment is rejected.

### 9.6 Start and due dates

- [ ] Set start date.
- [ ] Set due date.
- [ ] Clear start date.
- [ ] Clear due date.
- [ ] Set both dates in valid order.
- [ ] Attempt due date before start date.
- [ ] Use quick date options: today, tomorrow, next week, and equivalent supported options.
- [ ] Type a date query where supported.
- [ ] Use date picker by keyboard and pointer.
- [ ] Verify timezone display and storage.
- [ ] Verify overdue/today/future status styling.
- [ ] Verify date changes in calendar and gantt.
- [ ] Verify due-date notification lead time and suppression for completed/cancelled tasks.

### 9.7 Labels

- [ ] Open label picker from card, row, detail, and bulk toolbar.
- [ ] Attach an existing label.
- [ ] Detach a label.
- [ ] Attach multiple labels.
- [ ] Create a label inline when supported.
- [ ] Search/filter label list.
- [ ] Duplicate label attach is idempotent.
- [ ] Label names and colors render accessibly.
- [ ] Deleted label disappears without corrupting existing tasks.
- [ ] Label updates persist in board/list/detail/filter/search.
- [ ] Permission checks prevent unauthorized label changes.

### 9.8 Milestones

- [ ] List project milestones.
- [ ] Create milestone.
  - [ ] Name required and bounded.
  - [ ] Description optional and safely rendered.
  - [ ] Start/due dates validate.
  - [ ] Default status is correct.
- [ ] Assign/unassign milestone to a task.
- [ ] Update milestone name/description/dates/status.
- [ ] Delete milestone.
  - [ ] Existing tasks are preserved and unassigned safely.
  - [ ] Confirmation and permission rules work.
- [ ] Milestone appears correctly in filters, calendar/gantt, task detail, and project summary.

### 9.9 Custom-field task values

- [ ] Render every configured field type on a task card where enabled.
- [ ] Render every configured field type in task detail.
- [ ] Edit text value.
- [ ] Edit number value.
- [ ] Edit date value.
- [ ] Toggle checkbox.
- [ ] Choose single option.
- [ ] Choose multiple options.
- [ ] Clear optional value.
- [ ] Required empty value blocks the intended save/action.
- [ ] Invalid value is rejected with a useful message.
- [ ] Value persists after blur, refresh, search, and view changes.
- [ ] Value is included/excluded from filters correctly.
- [ ] Deleted field/value does not leak through stale caches or exports.

### 9.10 Move, duplicate, archive, and delete task

- [ ] Move task to another column in the same project.
- [ ] Move task to another project.
  - [ ] Target project is accessible and eligible.
  - [ ] Project-specific labels/custom fields/milestones are handled safely.
  - [ ] Ticket number and URL behavior is correct.
  - [ ] Old project no longer exposes the task.
- [ ] Duplicate task.
  - [ ] Title suffix/default is correct.
  - [ ] Description, priority, dates, assignee, milestone, labels, and allowed custom values are copied according to policy.
  - [ ] Comments, activity, watchers, attachments, and relations are not copied unless explicitly intended.
  - [ ] Duplicate receives a new ID and ticket number.
- [ ] Archive/cancel task.
  - [ ] Confirmation and reason are correct.
  - [ ] Task leaves active views according to scope.
  - [ ] Existing task URL behavior is safe.
  - [ ] Activity records the action.
- [ ] Delete task.
  - [ ] Permission and confirmation rules work.
  - [ ] Expected revision prevents deleting a newer version.
  - [ ] Task disappears from all lists/search/caches after success.
  - [ ] Related tasks, comments, attachments, notifications, and saved views handle the deletion safely.
  - [ ] Repeated delete is idempotent or returns a clear not-found result.

## 10. Task detail, editor, and content

### 10.1 Task detail surface

- [ ] Open task as page and as sheet/modal where supported.
- [ ] Task detail loading skeleton is complete and non-interactive.
- [ ] Task not found/deleted/forbidden states are distinct and safe.
- [ ] Header shows title, ticket number, project, status, and actions correctly.
- [ ] Property rail shows configured fields in intended order.
- [ ] Detail page preserves scroll position when a field updates.
- [ ] Close/back returns to the originating view and selection.
- [ ] Direct deep link works after hard refresh.
- [ ] Header actions are role-gated.
- [ ] Copy task link and copy task ID produce the expected values.

### 10.2 Rich-text description editor

- [ ] Open editor and focus it by keyboard.
- [ ] Type, paste, undo, redo, select, and replace text.
- [ ] Bold, italic, underline, headings, lists, checklists, blockquote, code, and code block work.
- [ ] Tables can be created, edited, navigated, and removed.
- [ ] Links can be inserted, edited, opened, and removed.
- [ ] Link normalization rejects unsafe schemes and handles relative/absolute URLs correctly.
- [ ] Markdown import/export behavior matches product rules.
- [ ] Mentions.
  - [ ] Mention menu opens after the trigger.
  - [ ] Member search is permission-aware.
  - [ ] Selection inserts the correct mention.
  - [ ] Mention notification is sent only when intended.
- [ ] Mermaid/code rendering.
  - [ ] Valid diagram/code renders.
  - [ ] Invalid syntax shows a safe fallback.
  - [ ] Unsupported language does not crash the editor.
- [ ] Images.
  - [ ] Paste/upload inserts an image.
  - [ ] Resize controls work by pointer and keyboard.
  - [ ] Missing/failed image renders a safe fallback.
  - [ ] Image URL and metadata do not bypass access control.
- [ ] Hard breaks and empty paragraphs persist correctly.
- [ ] HTML/script/event-handler payloads are sanitized and never execute.
- [ ] Autosave.
  - [ ] Save after edit and blur.
  - [ ] Rapid edits are queued/debounced correctly.
  - [ ] Save failure is visible and retryable.
  - [ ] Refresh during save does not lose the last confirmed content unexpectedly.
  - [ ] Concurrent revision conflict is detected and handled.

### 10.3 Attachments

- [ ] List task attachments for authorized users.
- [ ] Upload attachment.
  - [ ] Supported type succeeds.
  - [ ] Empty file behavior is correct.
  - [ ] Size limit is enforced client- and server-side.
  - [ ] Unsupported MIME/extension is rejected safely.
  - [ ] Filename normalization prevents path traversal and unsafe display.
  - [ ] Upload progress/loading/error state works.
  - [ ] Duplicate filename does not overwrite another user's file unexpectedly.
- [ ] Download/open attachment.
  - [ ] Only authorized users receive the bytes.
  - [ ] Expired/deleted attachment link fails safely.
  - [ ] Content type and download filename are correct.
- [ ] Delete attachment.
  - [ ] Permission and confirmation rules work.
  - [ ] Delete is reflected after refresh.
  - [ ] R2/private media object is not left publicly readable.

### 10.4 External links and code references

- [ ] Add external link to a task.
  - [ ] Valid URL accepted.
  - [ ] HTTP/HTTPS and supported provider URLs behave as designed.
  - [ ] `javascript:`, `data:`, malformed, and unsafe URLs rejected.
  - [ ] Duplicate links handled intentionally.
- [ ] Display external link with safe host/title.
- [ ] Open link uses safe target/referrer policy.
- [ ] Edit/delete link with permission enforcement.
- [ ] Provider-specific issue/branch/pull-request links render correctly.
- [ ] Unknown provider URL falls back to a generic safe link.

## 11. Subtasks, relations, activity, comments, and collaboration

### 11.1 Subtasks

- [ ] Create subtask from task detail.
  - [ ] Title validation matches normal task creation.
  - [ ] Parent project and permissions are enforced.
  - [ ] Parent/child link is created once.
- [ ] Edit subtask title, assignee, status, and dates.
- [ ] Complete/reopen subtask.
- [ ] Subtask progress badge shows zero, partial, and complete states.
- [ ] Parent task progress updates after each child mutation.
- [ ] Deleting parent/child follows the intended relation policy.
- [ ] Subtask cannot be created across projects or into a hidden parent.
- [ ] Deep links to subtasks preserve parent context.

### 11.2 Task relations

- [ ] Open relation picker.
  - [ ] Search visible tasks only.
  - [ ] Current task is excluded.
  - [ ] Cross-project targets are rejected if unsupported.
- [ ] Create `blocks` relation.
- [ ] Create `blocked_by` relation.
- [ ] Create `relates_to` relation.
- [ ] Create `subtask` relation where the UI exposes it.
- [ ] Prevent self-relation.
- [ ] Prevent duplicate relation.
- [ ] Display relation direction and target title/number correctly.
- [ ] Relation visibility follows both tasks' visibility.
- [ ] Delete relation with permission enforcement.
- [ ] Deleted/hidden related task has a safe fallback representation.

### 11.3 Comments

- [ ] List comments in chronological/order policy.
- [ ] Add comment.
  - [ ] Empty/whitespace comment is rejected.
  - [ ] Rich content/line breaks persist.
  - [ ] Mentions and image upload behave as intended.
  - [ ] Unsafe content is sanitized.
  - [ ] Notification/activity behavior is correct.
- [ ] Edit own comment.
  - [ ] Edit affordance appears only when allowed.
  - [ ] Edited state/time is visible according to policy.
  - [ ] Cancel preserves original comment.
- [ ] Edit another user's comment only when explicitly permitted.
- [ ] Delete comment.
  - [ ] Confirmation/soft-delete behavior is correct.
  - [ ] Activity and notifications do not leak deleted content.
- [ ] Comments for hidden/deleted tasks are inaccessible directly.

### 11.4 Activity history

- [ ] Activity loads newest/oldest according to product order.
- [ ] Task created event.
- [ ] Title changed event.
- [ ] Description changed event.
- [ ] Status changed event.
- [ ] Priority changed event.
- [ ] Assignee changed event.
- [ ] Dates changed event.
- [ ] Labels changed event.
- [ ] Relation/subtask changed event.
- [ ] Comment added/edited/deleted event where intended.
- [ ] Attachment added/deleted event where intended.
- [ ] Activity actor identity is correct and safe for deleted users.
- [ ] Activity values are escaped and do not execute markup.
- [ ] Activity list does not reveal hidden values to a restricted viewer.
- [ ] Limit/pagination behavior is stable.

### 11.5 Watchers

- [ ] List task watchers for authorized users.
- [ ] Current user subscribes/unsubscribes.
- [ ] Manager/admin adds another watcher where permitted.
- [ ] Watcher removal works.
- [ ] Duplicate watcher addition is idempotent.
- [ ] Removed member cannot remain an active watcher unexpectedly.
- [ ] Watcher receives intended task events and no unrelated events.
- [ ] Watchers cannot use notification payloads to access hidden task data.

### 11.6 Notifications and inbox

- [ ] Notification list loads with unread/read state.
- [ ] Assignment notification opens the correct visible task.
- [ ] Mention notification opens the correct visible task.
- [ ] Comment/activity notification opens the correct visible task.
- [ ] Due-date notification respects date, lead time, status, and user preference.
- [ ] Mark one read.
- [ ] Mark all read.
- [ ] Mark unread where supported.
- [ ] Clear/read cleanup where supported.
- [ ] Notification for deleted/hidden resource has safe fallback.
- [ ] Duplicate notifications are not created by retries.
- [ ] Notification content escapes titles, names, and comments.
- [ ] Inbox keyboard shortcuts work without firing in editors.

### 11.7 Time entries

- [ ] List time entries for authorized task.
- [ ] Save closed time entry.
  - [ ] Start/end and duration normalization is correct.
  - [ ] Zero, negative, fractional, and very large durations are handled.
  - [ ] Note/description length and unsafe content are handled.
- [ ] Save open time entry.
  - [ ] Open entry does not produce duplicate timers on retry.
  - [ ] Completing/closing entry calculates the intended duration.
- [ ] Update existing entry when supported.
- [ ] Delete/cancel entry when supported.
- [ ] Task/project totals are correct after create/update/delete.
- [ ] Time entry access follows task visibility and role permissions.
- [ ] Timezone and daylight-saving behavior is correct.

## 12. Bulk actions, import/export, and templates

### 12.1 Bulk selection

- [ ] Select one task.
- [ ] Select multiple tasks.
- [ ] Select all visible tasks.
- [ ] Deselect one/all.
- [ ] Selection survives supported scrolling/pagination.
- [ ] Hidden tasks cannot be selected through stale DOM/state.
- [ ] Selection clears after navigation, mutation, and permission change as intended.
- [ ] Keyboard selection works.

### 12.2 Bulk mutations

- [ ] Bulk status update.
- [ ] Bulk priority update.
- [ ] Bulk assignee update.
- [ ] Bulk due-date update.
- [ ] Bulk label add/remove.
- [ ] Bulk move/reorder where supported.
- [ ] Bulk archive/cancel.
- [ ] Bulk delete.
- [ ] Bulk action preview/count matches selected visible tasks.
- [ ] Partial failure reports exactly which tasks failed.
- [ ] Idempotency key/retry does not apply the mutation twice.
- [ ] Unauthorized task in a mixed selection is not used to bypass authorization.
- [ ] Revision conflict leaves unaffected tasks unchanged.
- [ ] Activity/notifications are not duplicated unexpectedly.

### 12.3 Task import

- [ ] Open import dialog from the intended project/workspace settings.
- [ ] Accept supported file format.
- [ ] Reject missing, empty, malformed, oversized, and wrong-type files.
- [ ] Parse headers with case/whitespace differences according to policy.
- [ ] Map title/name, description, status, priority, assignee, dates, labels, milestone, and custom fields.
- [ ] Handle duplicate rows and duplicate task IDs safely.
- [ ] Invalid row does not corrupt valid rows unexpectedly.
- [ ] Import preview counts match created/ignored/failed rows.
- [ ] Permission and visibility rules apply to every imported task.
- [ ] Import can be retried without uncontrolled duplication.
- [ ] Imported content is escaped/sanitized.

### 12.4 Task export

- [ ] Export current project scope.
- [ ] Export filtered/saved-view scope.
- [ ] Export includes the documented fields only.
- [ ] Export excludes hidden tasks and private data.
- [ ] Export uses correct encoding, delimiter, escaping, and line endings.
- [ ] Large export completes or reports a clear limit/error.
- [ ] Export filename and date are correct.
- [ ] Export does not expose attachment bytes, secrets, or private tokens.

### 12.5 Task templates

- [ ] List templates visible to the user.
- [ ] Save a template with title, description, properties, labels, and custom values according to policy.
- [ ] Duplicate template names are handled.
- [ ] Create task from template.
  - [ ] New task has a new ID/number.
  - [ ] Template-only metadata is not copied accidentally.
  - [ ] Invalid/deleted field/member/label references are handled safely.
- [ ] Delete template with permission enforcement.

## 13. Integrations and conditional capabilities

For every conditional integration, test both the configured success path and the unconfigured path. The unconfigured path must be explicit; empty data or a false success is not acceptable.

### 13.1 Calendar feeds

- [ ] Open calendar feed settings.
- [ ] Create feed with valid name/labels/scope.
- [ ] Copy feed URL safely.
- [ ] Feed contains only permitted project/task data.
- [ ] Feed respects filters/labels and date updates.
- [ ] Revoke feed.
  - [ ] Old URL stops working.
  - [ ] Cached clients cannot retrieve new private data.
- [ ] Duplicate feed creation and invalid label selection are handled.
- [ ] No-feed state says whether feeds are unavailable or simply not configured.

### 13.2 GitHub integration

- [ ] No GitHub connection shows a clear setup state.
- [ ] Link account/token/app flow succeeds with valid credentials.
- [ ] Cancel, expired, invalid, and revoked credentials fail safely.
- [ ] Repository search and picker filter by name/path correctly.
- [ ] Selected repository persists.
- [ ] Verification/loading/error states are visible.
- [ ] Disconnect removes access and stored references safely.
- [ ] Pull request/issue links render with correct provider metadata.
- [ ] Webhook/automation behavior is permission- and secret-safe.

### 13.3 GitLab integration

- [ ] Valid/invalid token flow.
- [ ] Token type selection and required fields.
- [ ] Repository/project picker search.
- [ ] Verification, expired token, rate limit, and disconnect.
- [ ] Selected project persistence.
- [ ] Merge request/issue links and activity.
- [ ] No configured provider state is explicit.

### 13.4 Gitea integration

- [ ] Valid/invalid host URL validation.
- [ ] Sign-in/token setup and verification.
- [ ] Repository picker/search.
- [ ] Reconnect/disconnect.
- [ ] Repository and issue/PR links.
- [ ] Unsafe host/protocol input is rejected.
- [ ] No configured provider state is explicit.

### 13.5 Generic webhooks

- [ ] Create webhook with valid HTTPS URL.
- [ ] Reject malformed, unsafe, localhost, or disallowed URLs according to policy.
- [ ] Select event types.
- [ ] Save encrypted secret without returning the secret in list responses.
- [ ] Update URL/events/active state.
- [ ] Test delivery success, failure, timeout, retry, and disabled state.
- [ ] Delivery payload excludes unrelated/private data.
- [ ] Delete webhook with manager permission.
- [ ] Existing secret is not displayed or logged.

### 13.6 Chat webhooks

- [ ] Slack provider setup and URL validation.
- [ ] Discord provider setup and URL validation.
- [ ] Mattermost provider setup and URL validation.
- [ ] Telegram provider setup/token/chat validation.
- [ ] Generic provider setup.
- [ ] Event selection, lead time, channel, and active state.
- [ ] Test delivery response and error state.
- [ ] Secret/token masking in UI, API, logs, and errors.
- [ ] Unconfigured provider displays a clear unavailable/setup state.

### 13.7 Automations and sync rules

- [ ] Automation list, skeleton, empty, and error states.
- [ ] Create/edit/delete rule.
- [ ] Select provider and repository.
- [ ] Select workflow event/column mapping.
- [ ] Label sync rule create/update/delete.
- [ ] Paused-link state is visible.
- [ ] Resume sync requires intended confirmation.
- [ ] Invalid rule combinations are rejected.
- [ ] A provider failure does not mutate unrelated project tasks.
- [ ] Duplicate events are idempotent.

### 13.8 Explicitly deferred/unavailable integrations

- [ ] Google Tasks is presented as optional/not required, not as silently working.
- [ ] Email/ntfy/Gotify/chat delivery behavior matches configured provider availability.
- [ ] Outbound delivery worker staging is not represented as completed delivery.
- [ ] Billing actions point to the external billing owner or show the documented unavailable result.
- [ ] Public sharing is not enabled beyond the explicit share-token policy.

## 14. Account, notification, workspace, project, and admin settings

### 14.1 Account profile

- [ ] Open account information settings.
- [ ] Edit display name.
  - [ ] Empty/whitespace/max-length/unsafe values handled.
  - [ ] Autosave success/error and refresh persistence.
- [ ] Upload/change avatar.
  - [ ] Type/size/dimension validation.
  - [ ] Crop/preview/cancel/save.
  - [ ] Removal and fallback initials.
  - [ ] No private file becomes public.
- [ ] Change password.
  - [ ] Current password required where configured.
  - [ ] New password rules and confirmation.
  - [ ] Wrong current password, weak password, reuse, and network failure.
  - [ ] Session behavior after password change.
- [ ] Delete account.
  - [ ] Exact confirmation is required.
  - [ ] Owner/sole-owner transfer rules are enforced.
  - [ ] Deletion impact is explained.
  - [ ] Session is ended and old private URLs fail.
  - [ ] Authored project data follows the documented retention policy.

### 14.2 Preferences and appearance

- [ ] Theme picker: light, dark, system, preview, persistence.
- [ ] Language picker: every supported locale, persistence, fallback, reload.
- [ ] Default project view preference.
- [ ] Task detail display preference.
- [ ] Week-start preference.
- [ ] Preference autosave and failure/retry behavior.
- [ ] Invalid local storage preference does not break startup.
- [ ] Preferences are scoped to the correct user, not shared across accounts.

### 14.3 Notification settings

- [ ] Open notification settings with loading/error/empty states.
- [ ] Email channel.
  - [ ] Enabled/disabled state.
  - [ ] Address/identity display.
  - [ ] Save/error state.
- [ ] Webhook channel.
  - [ ] URL validation.
  - [ ] Secret masking.
  - [ ] Test/save/delete.
- [ ] ntfy channel where configured.
- [ ] Gotify channel where configured.
- [ ] Event preferences.
  - [ ] Assignment.
  - [ ] Mention.
  - [ ] Comment/activity.
  - [ ] Due-date reminder.
  - [ ] Lead time values.
  - [ ] Completed/cancelled suppression.
- [ ] Workspace/project notification rules.
  - [ ] Select projects.
  - [ ] Select channels.
  - [ ] Enable/disable rule.
  - [ ] Edit/delete rule.
  - [ ] Duplicate rule handling.
- [ ] Notification settings do not grant access to the underlying task.

### 14.4 Workspace settings

- [ ] Workspace general settings.
- [ ] Ownership transfer.
  - [ ] Eligible candidate list is correct.
  - [ ] Self/removed/non-member candidate is rejected.
  - [ ] Owner confirmation and post-transfer session behavior.
  - [ ] Previous owner receives the correct role.
- [ ] Workspace danger zone.
  - [ ] Owner-only guard.
  - [ ] Exact confirmation.
  - [ ] Safe redirect after archive/delete.
- [ ] Workspace labels.
  - [ ] Create, edit, recolor, rename, reorder if supported.
  - [ ] Delete with task references.
  - [ ] Duplicate name/case normalization.
  - [ ] Label use updates task picker/filter/cache.
- [ ] Workspace import settings.
  - [ ] Source selection.
  - [ ] Validation and permission.
  - [ ] Progress/failure/rollback.

### 14.5 Project settings navigation

- [ ] Project settings navigation lists only permitted sections.
- [ ] Breadcrumbs identify workspace/project/settings section.
- [ ] Escape/back navigation does not lose unsaved data.
- [ ] Unknown/deleted project settings route shows a safe unavailable state.
- [ ] Project settings links preserve the selected project.

### 14.6 Developer/admin settings

- [ ] Developer/API key screen is permission-gated.
- [ ] Create key.
  - [ ] Secret shown only at creation where intended.
  - [ ] Key scope and expiration are clear.
  - [ ] Secret is never returned in later list responses.
- [ ] Revoke key.
  - [ ] Old key stops working.
  - [ ] Confirmation and audit behavior.
- [ ] Admin users directory.
  - [ ] Search, pagination, loading, error, empty.
  - [ ] Edit role/status only when allowed.
  - [ ] Cannot remove the final required admin/owner accidentally.
- [ ] Admin workspace directory.
  - [ ] Search, pagination, ownership, archive, and access controls.
- [ ] Admin actions do not bypass task-level visibility unintentionally.

## 15. Privacy, security, and data integrity

### 15.1 Authorization and tenant isolation — release-blocking

- [ ] Every project/task/member/comment/attachment/link/time-entry/notification endpoint checks the authenticated actor.
- [ ] UI-hidden mutation controls are also rejected server-side.
- [ ] Workspace A IDs cannot read or mutate Workspace B data.
- [ ] Project A IDs cannot read or mutate Project B data.
- [ ] Task IDs cannot bypass project visibility.
- [ ] Ticket numbers cannot bypass task visibility.
- [ ] Comment IDs cannot bypass task visibility.
- [ ] Relation IDs cannot reveal hidden related tasks.
- [ ] Attachment IDs and R2 keys cannot bypass authorization.
- [ ] Calendar-feed URLs are scoped and revocable.
- [ ] Webhook IDs/secrets cannot be enumerated or retrieved by unauthorized users.
- [ ] Notification endpoints cannot be used to probe hidden task existence.
- [ ] Search/result counts do not reveal hidden records.
- [ ] Public pages do not reuse authenticated data caches incorrectly.

### 15.2 Input validation and output safety

- [ ] IDs, slugs, emails, names, URLs, dates, enums, positions, and numeric values have server-side bounds.
- [ ] Unknown enum values are rejected or normalized safely.
- [ ] JSON/body size limits are enforced.
- [ ] SQL-like, HTML, Markdown, script, event-handler, CSS, and template payloads are harmless.
- [ ] URL validation blocks unsafe schemes and unintended internal network targets where applicable.
- [ ] File names and MIME types are validated independently.
- [ ] Error messages do not expose stack traces, SQL, tokens, secrets, or private identifiers.
- [ ] Logs redact auth tokens, webhook secrets, API keys, and private attachment URLs.
- [ ] CORS, cookie, CSRF, and origin behavior matches deployment policy.

### 15.3 Revisions, idempotency, and consistency

- [ ] Every optimistic task mutation sends/handles the expected revision where required.
- [ ] Stale updates return a conflict rather than overwriting newer data.
- [ ] Retry after timeout does not duplicate task, comment, label, relation, notification, invitation, attachment, or webhook records.
- [ ] UI cache is invalidated after create/update/delete/move/archive.
- [ ] WebSocket updates do not duplicate or erase local unsaved edits.
- [ ] Hard refresh reconciles the UI with the server source of truth.
- [ ] Partial multi-record operations leave a documented, recoverable state.
- [ ] Deleting or moving a parent resource handles dependent data safely.

### 15.4 Privacy and retention

- [ ] Private project data is absent from page source and client state when not authorized.
- [ ] Public metadata is limited to the approved field list.
- [ ] Deleted/archive data follows documented retention and restore policy.
- [ ] Account deletion removes/revokes active sessions, keys, invitations, feeds, and tokens.
- [ ] Export/delete flows do not retain unexpected copies in browser storage, logs, or public caches.

## 16. Accessibility and interaction quality

### 16.1 Keyboard and focus

- [ ] Every interactive control is reachable in a logical order.
- [ ] Visible focus indicator is present in light/dark/high-contrast modes.
- [ ] Menus, popovers, dialogs, comboboxes, date pickers, and drag surfaces support keyboard use or an equivalent action.
- [ ] Escape closes the topmost dismissible surface only.
- [ ] Focus returns to the triggering control after close.
- [ ] Tab does not enter hidden/inert content.
- [ ] Keyboard shortcuts do not interfere with text editing.

### 16.2 Semantics and announcements

- [ ] Buttons have accessible names and indicate pressed/expanded/disabled state.
- [ ] Inputs have labels, descriptions, and error associations.
- [ ] Status, priority, labels, and completion are not communicated by color alone.
- [ ] Loading, success, failure, and save states are announced appropriately.
- [ ] Drag/drop movement has an accessible keyboard alternative and announcement.
- [ ] Task counts, pagination, and filter changes are announced where needed.
- [ ] Screen-reader reading order matches the visual task hierarchy.

### 16.3 Responsive behavior

- [ ] No horizontal overflow at 360px for auth, dashboard, project, task, settings, and public pages.
- [ ] Touch targets meet the documented minimum size.
- [ ] Popovers stay inside the viewport or reposition correctly.
- [ ] Long names, emails, URLs, labels, and comments wrap or truncate safely.
- [ ] Board/list/calendar/gantt remain usable on touch screens.
- [ ] Mobile navigation does not hide the only route to save/cancel/close.
- [ ] Orientation changes preserve state.

## 17. Performance, resilience, and observability

### 17.1 Performance

- [ ] Initial signed-out auth page loads within the target budget.
- [ ] Authenticated dashboard loads without unnecessary duplicate API calls.
- [ ] Project with a realistic task count remains interactive.
- [ ] Large description/editor content remains usable.
- [ ] Large labels/member lists remain searchable without keystroke lag.
- [ ] Large attachment/image does not freeze the main thread.
- [ ] Board drag remains responsive during network latency.
- [ ] Calendar/gantt/timeline remain responsive with many dated tasks.
- [ ] Search/filter does not issue one request per keystroke when debouncing is required.
- [ ] WebSocket reconnect does not create unbounded timers/listeners.
- [ ] Cached data does not grow without bound during workspace/project switching.

### 17.2 Resilience

- [ ] Every read has loading, empty, error, and retry behavior.
- [ ] Every mutation has pending, success, failure, and rollback/retry behavior.
- [ ] Refresh during any mutation produces a consistent result.
- [ ] Browser back during a pending mutation is safe.
- [ ] Multiple tabs converge after mutations.
- [ ] App recovers after API/WebSocket restoration.
- [ ] Stale local preferences and cached server data are recoverable.

### 17.3 Observability

- [ ] Client errors identify route/action without logging secrets.
- [ ] Server errors include a correlation/request ID where supported.
- [ ] Important mutations create the intended activity/audit event.
- [ ] Integration delivery failures are visible and diagnosable.
- [ ] Permission denials are distinguishable from not-found without leaking resource existence.
- [ ] Analytics, if enabled, do not include task descriptions, comments, secrets, or private URLs.

## 18. API, Admin actions, and MCP parity

### 18.1 API contract parity

- [ ] Project list/get/create/update/archive behavior matches the Projects client adapter.
- [ ] Task list/get/create/update/delete/duplicate/move behavior matches the client adapter.
- [ ] Status normalization (`planned`/`inbox`, `archived`/`cancelled`) is consistent everywhere.
- [ ] Priority normalization is consistent everywhere.
- [ ] Assignee identity fields resolve to the same user in UI and API.
- [ ] Columns use status categories consistently for board moves.
- [ ] Comments/activity/time entries/notifications/custom fields/labels/relations/external links map correctly.
- [ ] API collection envelopes are handled for empty, one, and many records.
- [ ] Unexpected/malformed API payloads fail safely without crashing the app.

### 18.2 Admin action coverage

- [ ] Every exposed project action is permission-checked.
- [ ] Every exposed action validates project/workspace/task ownership.
- [ ] Admin action success responses contain the fields the client expects.
- [ ] Admin action errors preserve the intended HTTP status.
- [ ] Archive/delete actions honor expected revisions.
- [ ] Bulk actions honor idempotency.
- [ ] File/attachment actions protect private media.
- [ ] Webhook secret encryption/decryption key handling is correct.

### 18.3 MCP coverage

- [ ] Discovery lists only enabled/authorized project tools.
- [ ] Read tools respect workspace/project/task visibility.
- [ ] Mutation tools require the intended confirmation for risky actions.
- [ ] Tool input validation rejects unknown/unsafe fields.
- [ ] Tool results do not expose secrets or hidden records.
- [ ] Revoked/expired MCP authorization stops access immediately or within the documented TTL.
- [ ] MCP behavior matches the same source-of-truth mutations as the web UI.

## 19. Regression and release sign-off

### 19.1 Minimum smoke path

- [ ] Sign in.
- [ ] Open a workspace.
- [ ] Create/open a project.
- [ ] Create a task.
- [ ] Set title, status, priority, assignee, label, start date, and due date.
- [ ] Open task detail.
- [ ] Edit description and save.
- [ ] Add comment.
- [ ] Add relation/subtask.
- [ ] Move task across board columns.
- [ ] Verify task in list, calendar, backlog, and gantt/timeline where dated.
- [ ] Refresh and verify persistence.
- [ ] Sign in as another role and verify the permission boundary.
- [ ] Open the project through a direct link.
- [ ] Verify privacy/public sharing behavior.

### 19.2 Regression after task/project changes

- [ ] Existing tasks remain visible in the correct columns.
- [ ] Existing task links still resolve.
- [ ] Existing labels and custom-field values remain readable.
- [ ] Existing comments/activity/history remain readable.
- [ ] Existing attachments remain private and downloadable to authorized users.
- [ ] Existing saved views still load.
- [ ] Existing notifications still open the correct resource.
- [ ] Existing members keep the correct effective permissions.
- [ ] Existing public links follow the new visibility policy.
- [ ] Existing integration secrets are not exposed or invalidated unexpectedly.

### 19.3 Release gate

- [ ] No security-critical checkbox is `Fail` or `Blocked` without an explicit decision.
- [ ] No core feature is represented as successful when it is actually unavailable by design.
- [ ] Automated unit/component tests pass.
- [ ] Typecheck passes.
- [ ] Production build passes.
- [ ] Projects privacy/security tests pass.
- [ ] Projects UI smoke tests pass.
- [ ] Manual role/visibility matrix is recorded.
- [ ] Mobile/accessibility smoke pass is recorded.
- [ ] Open defects have owners, severity, and a release decision.
- [ ] Evidence for every changed feature is linked from the release notes or issue.

## 20. Coverage map to the current codebase

Use these locations to find the closest existing automated test before writing a new one:

- [Projects app](../Projects/)
- [Projects unit/component tests](../Projects/src/)
- [Projects browser smoke tests](../Projects/tests/)
- [Projects client adapter](../Projects/src/lib/projects-client.ts)
- [Projects routes](../Projects/src/routes/)
- [Project permissions package](../Projects/vendor/projects-permissions/src/)
- [Project API implementation](../Maps/functions/_projects.js)
- [Admin project API actions](../Maps/functions/api/admin.js)
- [Privacy tests](../tests/projects-privacy.test.mjs)
- [Project parity notes](PROJECTS_KANEO_PARITY.md)

### Existing test areas to extend first

- [ ] Auth, password reset, OTP, captcha, and device approval.
- [ ] Workspace invitations, member access, roles, and capabilities.
- [ ] Project general/visibility settings.
- [ ] Board drag/reorder and task status updates.
- [ ] List, backlog, calendar, and gantt behavior.
- [ ] Task detail, description autosave, labels, subtasks, relations, comments, and attachments.
- [ ] Filters, saved views, bulk selection/actions, import/export, and search.
- [ ] Custom fields and task custom-field values.
- [ ] Notifications, watchers, and time entries.
- [ ] API/client adapter mapping and optimistic revision handling.
- [ ] Public project privacy and cross-workspace isolation.

### Features that need explicit product confirmation before being marked passing

- [ ] Public project share-token policy.
- [ ] Project deletion versus archive semantics.
- [ ] Calendar-feed availability and revocation behavior.
- [ ] GitHub/GitLab/Gitea credential and webhook setup.
- [ ] Chat/email/ntfy/Gotify delivery providers.
- [ ] Automation and sync-worker delivery guarantees.
- [ ] Google Tasks bridge.
- [ ] Billing ownership and expected UI behavior.
- [ ] Workspace/project data retention after account deletion.
