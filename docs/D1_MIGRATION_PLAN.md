# Google Sheets → Cloudflare D1 Migration Plan

**Status tracker.** This is the durable, cross-session source of truth for this migration. Update the checkboxes as work completes. If you're picking this up in a new session, read this file first, then `scripts/apps-script/Code.gs` for any specific business-logic question — it's the ground truth for everything being ported.

Working branch: `d1-migration` (created off `main`). Production (`deploy` branch) and the existing `preview` branch are untouched throughout — the live Google Sheet and Apps Script deployment also stay untouched until Phase 8, as the explicit rollback safety net.

## Why

The live "database" is a Google Sheet read/written through a Google Apps Script web app (`GAS_URL`), which every `functions/api/*.js` Cloudflare Pages Function forwards to. That's slow (external HTTP hop, Apps Script cold starts) and the exec URL is a public, unauthenticated surface. The app is already 100% Cloudflare Pages — D1 binds directly into the existing Functions with zero extra network hop, and its free tier comfortably covers current/near-future scale (500 places, 100-200 daily visitors).

## Scope decisions (don't re-litigate without new information)

- **No admin UI built here.** A separate admin panel (different codebase, not in this repo) currently drives approvals by hand-editing Sheet cells — `Code.gs`'s `onSheetEdit` trigger reacts to those edits. This migration only builds D1-backed admin API endpoints (`functions/api/admin.js`) with the same actions/`adminKey` contract; the user repoints their panel at these later, on their own schedule.
- **Legacy anonymous OTP review flow is retired, not ported.** Firebase Auth already covers identity end-to-end. `send-otp`/`verify-otp` and the `Verifications` table are dropped entirely (this also removes the only reason a new outbound-email dependency would have been needed). Reviews require a Firebase `idToken` going forward for `submit`/`check` (matching `delete`/`my-reviews`, which were already Firebase-only). **Historical OTP-submitted review rows still migrate as normal data** — only the *creation mechanism* is retired.
- **Geocoding needs no new API or billing.** The app already calls free, keyless OpenStreetMap Nominatim client-side (`src/directions.js`, `src/search.js`, via `NOMINATIM_REV`/`NOMINATIM_VB` already exposed through `functions/api/config.js`). Server-side enrichment reuses this instead of GAS's `Maps.newGeocoder()`.
- Net effect: **this migration needs zero new third-party vendor signups.**
- All genuinely human steps (Cloudflare login, D1→Pages dashboard binding, retrieving `MAPS_API_KEY`, manual preview click-through, final cutover go-ahead) are consolidated into one Phase 7 checkpoint, not scattered.

## Phases

### Phase 1 — Tracking doc + schema + local dev harness ✅ done
- [x] This file created.
- [x] `schema.sql` — 14 tables + indexes (`Verifications` intentionally dropped, see scope decisions).
- [x] `wrangler.toml` with a local-only D1 binding named `DB` (no login needed for `--local`).
- [x] Schema applied locally via `npx wrangler d1 execute halal-finder-db --local --file=schema.sql`; all 14 tables confirmed present (`account_meta`, `contacts`, `draft`, `edits`, `eid_new`, `eid_prayers`, `event_edits`, `events`, `new_places`, `places`, `reviews`, `saved_places`, `tags`, `wishes`).

### Phase 2 — Migration tooling
- [ ] `xlsx` added as a devDependency only.
- [ ] `scripts/migrate-to-d1.js` — parses `scripts/local-backups/sheets/halal-finder-sheet.xlsx`, validates headers, transforms rows (splits Approved/reject-reason overload, applies the same blank-row-skip guards `getPlacesJSON()` uses), generates batched INSERT SQL into gitignored `scripts/migrate-to-d1/generated/`.
- [ ] `--verify-only` mode: row-count + SHA-256 checksum comparison (source xlsx vs. D1) per table, plus random full-row diffs.
- [ ] Rehearsed end-to-end against local D1, verification clean.

### Phase 3 — Shared logic ports
- [ ] `functions/_shared.js` (dedupe `sha256Hex`/`truncate`/`allowedOrigin`/`json`).
- [ ] `functions/_gas-compat.js` (`namesMatch`, `normaliseAddress`, `normaliseTags`, `isSponsorActiveForDate`, `generateId`, dedup proximity matching, etc.).
- [ ] `functions/_google-maps.js` (Places Details HTTP calls + Nominatim reverse/forward geocoding).

### Phase 4 — Rewrite `functions/api/*.js` against D1
- [ ] `submit.js`
- [ ] `reviews.js` (Firebase-idToken-only; `send-otp`/`verify-otp` removed)
- [ ] `account.js`
- [ ] `wishes.js`
- [ ] `places.js`
- [ ] `eid-prayers.js`

### Phase 5 — New admin API, no UI
- [ ] `functions/api/admin.js` — all 26 admin GET/POST actions, `adminKey` guard, D1 `batch()` transactions for approval side-effects, unrestricted CORS on this file only.

### Phase 6 — Local end-to-end validation
- [ ] Every rewritten action exercised via `wrangler pages dev` + local D1, diffed against the documented GAS contract.

### Phase 7 — Single consolidated human checkpoint
- [ ] `wrangler login`
- [ ] Real D1 database(s) created (`halal-finder-db` [+ preview]) and migrated
- [ ] D1 bound to the Pages project in the Cloudflare dashboard (Settings → Functions → D1 database bindings, variable `DB`) — no CLI equivalent exists for Git-integration Pages projects
- [ ] `MAPS_API_KEY` provided by the user (from Apps Script → Project Settings → Script Properties, or Google Cloud Console) and set as a Cloudflare secret
- [ ] `ADMIN_SECRET` generated fresh and set as a Cloudflare secret
- [ ] Branch pushed, preview deployment clicked through manually by the user
- [ ] Final go-ahead given: fresh data pull → `--remote` import → verify → merge to production

### Phase 8 — Decommission Sheets/Apps Script (optional, user's own pace, weeks later)
- [ ] Archive the Apps Script web app deployment
- [ ] Optionally export/delete the Google Sheet
- [ ] Remove `GAS_URL`/`SHEETS_URL` env vars from the Cloudflare dashboard
- [ ] Repoint `scripts/fetch-and-cache-places.js`'s static-cache refresh at the site's own API
- [ ] Retire the xlsx-backup path in favor of `wrangler d1 export`
