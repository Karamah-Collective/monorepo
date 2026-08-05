# Admin Dashboard Rollout — Status Tracker

**Status tracker.** This is the durable, cross-session source of truth for getting the new `/admin` React dashboard live. Update checkboxes as steps complete. See the original design plan at `~/.claude/plans/we-will-need-that-twinkly-pillow.md` for the full rationale if anything here needs more context.

## Why

Approvals used to mean hand-editing Google Sheet cells, then were deferred to a separate admin panel (`admin.maps.karamahcollective.com`, Cloudflare Pages project `halal-finder-admin`) that turned out to be old code built for the retired Sheets/GAS backend. `functions/api/admin.js` already had every approval action needed (built during the D1 migration) — this effort replaces its auth with per-user Firebase login and builds a real React dashboard against it, living in this repo's new `/admin` folder.

## Code — done

- [x] `functions/_firebase-verify.js` — `verifyFirebaseIdToken` now returns `name`, accepts optional `env.FIREBASE_PROJECT_ID` override.
- [x] `functions/api/admin.js` — `adminKey` retired, replaced with `authenticateAdmin()` (Firebase ID token + `emailVerified` + `@karamahcollective.com` domain check). Generic audit-log hook on every write action. New actions: `log-auth-event`, `admin-log`, `admin-events`, `admin-eid-prayers`. CORS restricted to `ADMIN_ALLOWED_ORIGINS`.
- [x] `schema.sql` — `audit_log` table added (with the documented, intentional exception to the emailHash-only rule).
- [x] `admin/` — full React + Vite dashboard: login/signup (name+email+password, domain-gated) + email-verification gate, dashboard stats, sortable/filterable tables with dropdowns/toggles for Places, Pending New, Pending Edits, Events, Event Edits, Eid, Reviews, Wishes, Contacts, and the Activity Log. `npm run build` verified clean.
- [x] Backend smoke-tested locally (`wrangler pages dev`): missing/garbage token → 401, unknown action → 400, CORS preflight headers correct.
- [x] `audit_log` table applied to **preview** D1 (`halal-finder-db-preview`) — verified present.
- [x] `audit_log` table applied to **production** D1 (`halal-finder-db`) — verified present.

## Manual steps — in progress

- [x] **Firebase console** (`halal-map-karamah` project → Authentication → Sign-in method): Email/Password enabled and saved. "Email link (passwordless sign-in)" intentionally left disabled — confirmed by the user that this feature is hidden/unused in the main public app too, so no conflict.
- [x] **Cloudflare Pages — repoint `halal-finder-admin`**: connected to `Karamah-Collective/halal-finder`, production branch `main`, build command `npm install && npm run build`, output `dist`, root directory `admin`, automatic deployments enabled. Confirmed live in the dashboard.
- [ ] **Build watch paths** on the `halal-finder-admin` project (Settings → Builds): was showing `*` (rebuilds on every repo commit) — being changed to `admin/*` so it doesn't rebuild on every public-site commit.

## Manual steps — deferred (not blocking)

- [ ] **Cloudflare WAF rate-limiting rule** on `/api/admin*` — deferred by the user (dashboard's Deploy button was hanging). Exact config to use when resumed, given this Cloudflare plan only offers a 10-second rate-limit window (longer windows need Business/Enterprise):
  - **When incoming requests match** (use "Edit expression"):
    ```
    (http.host eq "maps.karamahcollective.com" and starts_with(http.request.uri.path, "/api/admin"))
    ```
  - **With the same characteristics**: IP
  - **When rate exceeds**: **20 requests** per **10 seconds**
  - **Then take action**: **Block** (not Challenge — this is a plain JSON API called via `fetch()`, not a browser page; a challenge can't be solved by an API call and would just lock out real users)
  - **For duration**: 10 seconds (or longer, if the duration picker's up-arrow reveals more options — not essential either way)
  - **Status**: Active
  - This is an extra abuse-protection layer, not required for the app to work — safe to add whenever convenient.

## Manual steps — only after the above is live and verified

- [ ] Retire `ADMIN_SECRET`: delete from `.dev.vars` and as a Cloudflare Pages secret (Production + Preview) on the **public site's** `maps` project. Nothing reads it anymore, but hold off removing it until the new Firebase-based auth is confirmed working end-to-end in production, as a rollback safety net.

## Next test once Firebase + Cloudflare Pages steps are confirmed done

Sign up on the live (or locally-run) `/admin` app with a real `@karamahcollective.com` test address → check the verification email → click it → sign in → confirm the dashboard loads real stats and a pending row can be approved/rejected and shows up in the Activity Log.
