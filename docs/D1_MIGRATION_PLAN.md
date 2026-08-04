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

### Phase 2 — Migration tooling ✅ done
- [x] `xlsx` added as a devDependency only.
- [x] `scripts/migrate-to-d1.js` — parses `scripts/local-backups/sheets/halal-finder-sheet.xlsx`, transforms rows, generates batched INSERT SQL into gitignored `scripts/migrate-to-d1/generated/`. Batches are capped at 80KB (D1 rejects statements over ~100KB with `SQLITE_TOOBIG` — discovered empirically, not documented).
- [x] `--verify-only` mode: row-count + SHA-256 checksum comparison (source xlsx vs. D1) per table; prints sample mismatched rows on failure.
- [x] Rehearsed end-to-end against local D1 with the **real production backup** (today's xlsx pull) — all 14 tables verified byte-for-byte clean: draft=180, new_places=169, edits=42, contacts=1, places=185 (matches the ~185 places the user confirmed), tags=63, eid_new=1, eid_prayers=20, events=2, event_edits=3, wishes=4, reviews=192, saved_places=25, account_meta=3. Zero constraint violations (10 real boycotted places, no duplicate reviews, no multi-home accounts).

**Important discovery during this phase** (real data disagreed with `Code.gs`'s header comments in ways worth remembering):
- Several sheets (`EidNew`, `EventEdit`, `Contact`, `Events`, `Wishes`, `Edit`) are padded to ~999 physical rows by Sheets/export, almost all blank — `migrate-to-d1.js` filters to fully-non-blank rows only, which is what makes the row counts above correct.
- `Events`/`EventEdit` have 8 extra real columns (`location_name`, `location_address`, `lat`, `lng`, `organizer_name`, `organizer_place_id`, `location_gmaps_link`, plus a genuinely-used `reject_reason`) beyond `Code.gs`'s documented `EVENT_HEADERS`/`EVENT_EDIT_HEADERS`. All but `reject_reason` are confirmed dead (no Code.gs function reads/writes them, always blank in real data) and were not migrated. `reject_reason` **is** real (written by `adminRejectEvent`/`adminRejectEventEdit`) and is migrated as its own column, not an overload.
- `adminRejectEid`'s `reason` parameter is silently discarded by `Code.gs` today (no column stores it) — the D1 `eid_new.reject_reason` column exists anyway for a future admin.js to actually use, at zero cost.

### Phase 3 — Shared logic ports ✅ done
- [x] `functions/_shared.js` — `sha256`/`truncate`/`allowedOrigin`/`json`/`helsinkiTimestamp`, deduped from the 4 copies in `functions/api/{submit,reviews,account,wishes}.js`.
- [x] `functions/_gas-compat.js` — `namesMatch`/`normaliseName`, `normaliseAddress`/`SWEDISH_TO_FINNISH`, `normaliseMapsLink`, `parseTagString`/`normaliseTags`/`buildLabelToIdMap` (D1-backed), `isSponsorActiveForDate`/`getTodayHelsinkiDateString`, `isInsideFinlandBounds`, `generateId` (D1-backed collision check), `isDuplicateInPlaces`/`isDuplicateInNew` (D1-backed, full-table-scan port — dataset is small enough that this exactly mirrors Code.gs's own full-sheet-scan approach rather than risking a SQL-prefilter/JS-logic drift).
- [x] `functions/_google-maps.js` — `resolveUrl`/`parseMapsUrl` (URL resolution simplified vs. Code.gs: Workers' `fetch()` already exposes the fully-redirected `response.url`, so the manual hop-by-hop fallback wasn't needed, only the body-scrape fallback), `getPlaceDetails`/`findPlaceIdFromText` (Places API), `buildGoogleInfoBlob`/`extractPhoneFromDetails`/`convertGoogleHours`/`extractGoogleReviewText`/`normalizeGoogleReviewRating`, `reverseGeocode`/`forwardGeocode` (Nominatim, not Google — see scope decisions), and `enrichFromMapsLink` — a single shared pipeline consolidating what were two near-duplicate ~150-line functions in Code.gs (`enrichPendingRows` for New, `enrichEidPendingRows` for EidNew), parameterized by a `rich` flag (New submissions get hours/reviews/rating/phone/google_info; Eid submissions only ever needed name/address/coords/website).
- All three pass `node --check` (syntax only — full behavioral validation happens in Phase 6 against live D1).

**Known pre-existing gap, not fixed here** (found while reading `submit.js`): the frontend already sends rich event-location fields (`locationName`, `locationAddress`, `locationLat/Lng`, `organizerName`, `organizerPlaceId`) for event submissions, and `submit.js` forwards them, but `Code.gs`'s actual `Events`/`EventEdit` append logic never reads or persists them — they're silently dropped today. This matches the "dead columns" found in Phase 2. Phase 4's `submit.js` port keeps dropping them too (behavior parity, not a fix) — flagging here in case it's worth fixing in a later, separate task.

### Phase 4 — Rewrite `functions/api/*.js` against D1 ✅ done (code written + syntax-checked; behavioral validation is Phase 6)
- [x] `submit.js` — dedup, enrichment (Places Details + Nominatim), Draft/New/Edit/Contact/Event/EventEdit/EidNew writes, my-submitted-places/edits reads.
- [x] `reviews.js` — Firebase-idToken-only; `send-otp`/`verify-otp` removed. **Upsert via `UNIQUE(place_id, email_hash)`** instead of Code.gs's scan-then-branch.
- [x] `account.js` — sync-saved/save/unsave/resolve-import, atomic `erase-data` via `db.batch()`.
- [x] `wishes.js`, `places.js`, `eid-prayers.js` — straightforward D1 query ports.
- All 6 pass `node --check`.

**Resolved**: user chose to remove the legacy fallback entirely. `src/reviews.js` no longer has any `verifyToken`/`isVerified()`/`STORAGE_KEY_VERIFY_TOKEN` code — `_resolveReviewIdentity()` is Firebase-idToken-only, and the review form always shows the sign-in gate (Google/Microsoft/email-magic-link — already the only *new*-token entry point pre-migration) when signed out. Nothing else in `src/` referenced these symbols, so this was a clean, self-contained removal.

### Phase 5 — New admin API, no UI ✅ done (code written + syntax-checked; behavioral validation is Phase 6)
- [x] `functions/api/admin.js` — all 10 GET + 16 POST admin actions, `adminKey` guard (plain `===`, matches Code.gs), `db.batch()` for approve-new/approve-edit/approve-eid/approve-event-edit's multi-table side-effects, unrestricted CORS on this file only.
- Parity note: `adminRejectEid` matches Code.gs exactly in discarding its `reason` argument (Code.gs never stored it either — see Phase 2's note on `eid_new.reject_reason` existing for future use, not current use).

### Phase 6 — Local end-to-end validation ✅ done, within a real constraint (see below)
Ran `wrangler pages dev . --port 8788` against local D1 (seeded with the real migrated production data from Phase 2) and exercised every endpoint with `curl`:
- [x] **Fully verified via real HTTP, against real data**: `/api/places` (all/places/tags/events actions — 185 places, correct tag normalization, correct sponsor/boycott gating), `/api/eid-prayers` (20 rows), `/api/wishes` GET (4 rows), `/api/reviews` GET (185 grouped entries incl. Google-shadow rows). All 10 `/api/admin` GET actions (admin-stats, pending-new/edits/events/event-edits/eid, admin-places/contact/wishes/reviews). `adminKey` guard rejects wrong/missing key with 401.
- [x] **Write paths verified live, including on real data**: `approve-edit` on the one real pending edit (renamed "Muslim Forum of Finland" → "Rauhapiiri Ry", tags correctly re-parsed) — confirmed in `/api/places` afterward and confirmed the row left `pending-edits`. `update-boycott` toggle, confirmed suppressing sponsor fields but (correctly, matching Code.gs) *not* hiding the place itself. `approve-new` on a synthetic pending row — confirmed random-id generation, Places insert, and correct tag JSON, then cleaned up.
- [x] **Auth-gated error paths verified**: `/api/account` sync-saved, `/api/reviews` check/submit, `/api/submit` my-submitted-places — all correctly return `invalid_token`/`reviewed:false` (never a 500) against a garbage token, proving the Firebase-verification failure path is wired correctly even though a *successful* real token can't be fabricated locally.

**Real constraint, not a gap I could close alone**: `/api/submit`'s and `/api/wishes`'s POST paths require a real reCAPTCHA v3 response token, and `/api/reviews`/`/api/account`'s POST paths require a real signed Firebase ID token — both are cryptographically verified against live external services (Google's reCAPTCHA siteverify, Google's Secure Token JWKS) and can't be forged from a local script. Confirmed the failure paths behave correctly (403/"Verification failed", 401/"invalid_token" — never a crash), but the actual *successful* submission/dedup/enrichment/save code paths for these four actions are verified by code review + the same schema/columns already proven correct via the tests above, not by a live HTTP round-trip. **This is exactly what Phase 7.5's manual click-through (real browser, real sign-in, real reCAPTCHA) is for** — treat that step as the true first end-to-end test of new-place submission, review submission, and save/favorite, not a formality.

### Phase 7 — Single consolidated human checkpoint (in progress)
- [x] `wrangler login` — done, account "Karamah Collective" (karamahcollective@gmail.com).
- [x] Real D1 databases created and migrated, both verified byte-for-byte against the source: `halal-finder-db` (id `a360600d-c92c-42c4-a41b-fe493866f13f`, production) and `halal-finder-db-preview` (id `13c3fa62-68a5-4e51-adf8-8c668abfd9c9`, preview). Region EEUR.
- [x] Real Pages project name discovered: **`maps`** (not `halal-finder` — fixed in `wrangler.toml`). Also discovered the user's separate admin panel is real and already live at `admin.maps.karamahcollective.com` (Pages project `halal-finder-admin`) — the eventual repoint target for Phase 5's `/api/admin`.
- [x] `ADMIN_SECRET` generated fresh, set as a **production** Cloudflare secret via `wrangler pages secret put` (CLI only supports production — Preview secrets need the dashboard, see below).
- [x] Confirmed `NOMINATIM_REV`/`NOMINATIM_VB` already exist as production secrets from before this migration — zero new setup needed for geocoding.
- [x] **`MAPS_API_KEY`** — provided by the user, set as a production secret.
- [x] **Dashboard visit — done.** D1 bound on both environments (Production → `halal-finder-db`, Preview → `halal-finder-db-preview`, binding name `DB`). Note: this Pages project's Settings has a Production/Preview toggle near the top (easy to miss — it's above the "Build" section) — Preview turned out to have its own, mostly-empty variable set (only `DIGITRANSIT_URL`/`DT_API_KEY`/`NOMINATIM_REV`/`NOMINATIM_VB`/`TRANSITOUS_URL` pre-existed there). Added `ADMIN_SECRET`, `MAPS_API_KEY`, and `RECAPTCHA_SECRET` (needed for `/api/submit` and `/api/wishes` POST — not flagged until this step) to Preview as secrets. All three real secret values are also saved locally in `src/config.local.js` (gitignored) and `.dev.vars` for future reference/local testing.
- [x] **This repo's deployment convention discovered mid-Phase-7**: Cloudflare Pages here only builds two specific branches — `deploy` (production) and `preview` — not arbitrary pushed branches (confirmed: pushing `d1-migration` directly showed "Skipped" in the dashboard). Changes reach either by *promoting* curated files onto that branch (see `.github/prompts/deploy.prompt.md`'s established `git checkout <source> -- <file-list>` pattern — deliberately excludes `package.json`/`wrangler.toml`, which each branch keeps its own copy of). Promoted `d1-migration` → `preview` this way (commit `745d1c9`, later `5ea1551` for the bugfix below) — `deploy`/production untouched throughout.
- [x] **Preview click-through found 2 real bugs, both fixed and reverified against local D1 before reshipping:**
  1. reCAPTCHA rejected all `/api/submit` and contact-form submissions on the preview domain — not a code bug, the reCAPTCHA site key is domain-restricted and `*.pages.dev` wasn't registered. Fixed by the user adding the bare hostname `maps-cdo.pages.dev` (no protocol) to the reCAPTCHA admin console's allowed domains — covers every preview deployment's hash subdomain automatically.
  2. Saving a favorite threw a 502 — `functions/api/account.js`'s `saveSavedPlace` used `ON CONFLICT(email_hash, kind, place_id) DO NOTHING` against `idx_saved_places_placeid_kinds`, a **partial** unique index (`WHERE kind IN ('favorite','visited')`). SQLite requires an `ON CONFLICT` target to repeat a partial index's `WHERE` clause exactly, or it throws `ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint` instead of matching — reproduced locally, fixed by adding the matching `WHERE` clause, reverified before pushing. Checked the rest of the codebase for the same pattern: `idx_saved_places_one_home` (the other partial index) is never targeted by an `ON CONFLICT` (the `home` kind uses DELETE-then-INSERT instead), so this was the only occurrence.
- [ ] Preview click-through continues — awaiting user confirmation that favorites/submissions/reviews all work now.
- [ ] Final go-ahead given: fresh data pull → `--remote` import into `halal-finder-db` → verify → merge to production

### Phase 8 — Decommission Sheets/Apps Script (optional, user's own pace, weeks later)
- [ ] Archive the Apps Script web app deployment
- [ ] Optionally export/delete the Google Sheet
- [ ] Remove `GAS_URL`/`SHEETS_URL` env vars from the Cloudflare dashboard
- [ ] Repoint `scripts/fetch-and-cache-places.js`'s static-cache refresh at the site's own API
- [ ] Retire the xlsx-backup path in favor of `wrangler d1 export`
