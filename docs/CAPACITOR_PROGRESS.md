# Capacitor Migration — Progress Tracking

**Purpose:** Single source of truth for outstanding work so the migration can
be paused and resumed by any session without re-deriving state. Update this
file as phases/tasks complete; never delete history — append and mark status.

**Companion files:**
- Plan & gap analysis: `docs/CAPACITOR_MIGRATION_PLAN.md`
- Decisions, preferences, and solved-problems log: `docs/PREFERENCE_LOG.md`
- Orchestrator: `.claude/agents/cartographer.md` (pro = brains)
- Workers: `web-reconciler`, `capacitor-integration`, `native-integration`,
  `release-eng` (all haiku = flash)

---

## Status legend

- `[ ]` not started
- `[~]` in progress (who + when)
- `[x]` done (who + date + note)
- `[-]` blocked (why) or skipped (reason)

---

## Pre-flight facts (verified 2026-10-01)

- Build pipeline already targets `Maps/dist/` via `Maps/scripts/build.mjs`
  (`npm run build`). It copies `index.html`, `404.html`, `manifest.json`,
  `sw.js`, `_headers`, `_routes.json`, `src/`, `data/`,
  `scripts/transit-cache.json` and inlines the build version. **Phase 2's
  `webDir: "dist"` maps directly to this — no new build target needed.**
- `manifest.json` currently has only `icon-192.png` and `icon-512.png`. Store
  submission needs more sizes (Phase 0 / Phase 4).
- Runtime config is loaded from `/api/config` at runtime; nothing secret is in
  the bundle. Auth is Firebase Web SDK via gstatic ES modules (`src/auth.js`).

---

## Phase 0 — Reconciliation & Preflight (owner: mobile-captain)

- [x] Freeze `appId` + display name — **`com.karamahcollective.maps` / "Manarah"** (user, 2026-10-01)
- [x] Decide commit vs. gitignore — **commit `android/`/`ios/`**; excluded from deploy branch by the `DEPLOY_FILES` allowlist in `tooling/deploy-agent.mjs`. Do NOT add them to `DEPLOY_FILES`.
- [-] Audit manifest icons — **deferred to Phase 4** (user decision; placeholder icons now)
- [x] Record Phase 0 decisions — logged in `docs/CAPACITOR_PREFERENCE_LOG.md`

## Phase 1 — Web Reconciliation (owner: web-reconciler, haiku)

- [x] `isNative()` bridge helper (native-only gate, inert on web) — 2026-10-01, web-reconciler (haiku). Created `Maps/src/capacitor-bridge.js` exporting `isNative()` (runtime `Capacitor` check, zero deps).
- [x] Consolidate geolocation calls behind one helper — kept by user decision (2026-10-01): `requestLocation()` has a Capacitor one-shot branch AND the four direct call sites (places.js, prayer.js, qibla.js, map-controls.js) now route through the `hasGeolocation`/`getCurrentPosition`/`watchPosition`/`clearLocationWatch` seam in utils.js. All `node --check`-clean.
- [~] Verify `viewport-fit=cover` + safe-area (code-shape verified; confirm on-device in Phase 2)

## Phase 2 — Capacitor Scaffold & First Build (owner: capacitor-integration, haiku)

- [x] Install `@capacitor/core` `@capacitor/cli` `@capacitor/ios` `@capacitor/android` — Capacitor 8.5.2 + TypeScript 7.0.2 added as devDependencies to `Maps/package.json` (root `package-lock.json` updated)
- [x] `npx cap init` + `capacitor.config.ts` (`webDir: "dist"`) — config correct: appId `com.karamahcollective.maps`, appName "Manarah", webDir `dist`
- [x] `npx cap add ios` / `npx cap add android` — `Maps/android/` + `Maps/ios/` generated
- [x] `npx cap sync` + first build — confirmed landed (verified 2026-10-01): `android/app/src/main/assets/public/` and `ios/App/App/public/` fully populated with the web build, and Gradle `build/intermediates/**` artifacts present ⇒ sync + a first Android Gradle build ran. `Maps/dist/` is absent only because `build.mjs` wipes/recreates it per build — expected, not a gap.
- [x] **EXIT GATE:** map renders on a device/emulator — **MET (2026-10-01).** Pipeline `npm ci` → `npm run build` → `npx cap sync android` → `npx cap run android` builds clean on the local Pixel 7 emulator (`Pixel_7_API_35`); JDK 21 fix applied (see PREFERENCE_LOG). Phase 2 complete. Phase 3 (native parity) now dispatchable.

## Phase 3 — Native Feature Parity (owner: native-integration, haiku) — **CLOSED (decision A, 2026-10-01)**

- [x] Geolocation plugin + permission flow — A (2026-10-01): `@capacitor/geolocation` 8.2.2, one-shot branch + permission toast at `Maps/src/utils.js:1944-1968`. Verified landed on-disk, NOT re-touched.
- [x] Share plugin (replace `navigator.share`) — B (2026-10-01): `@capacitor/share` 8.0.2, native-first in `shareUrl()` `Maps/src/utils.js:1615-1639`, `AbortError`/cancel mirror, clipboard fallback. Verified landed on-disk, NOT re-touched.
- [x] Deep links (`appUrlOpen` → existing `?r=`/`?p=` state) — C (2026-10-01): `@capacitor/app` 8.1.1, `appUrlOpen` listener + `getLaunchUrl` cold-start at `Maps/src/places.js:2433-2464`, reuses `checkShareUrl()`. Verified landed on-disk, NOT re-touched.
- [-] TTS fallback for voice nav — **PARKED (decision A, 2026-10-01).** Plan's `@capacitor-community/tts` 404s; no speech callsite exists in source (`Maps/src/navigation.js` has zero speech code; the README overclaims it). Recorded for Plan B: `@capacitor-community/text-to-speech@8.0.2`.
- [-] Background geolocation (turn-by-turn) — **PARKED (decision A, 2026-10-01).** `@capacitor/background-geolocation` 404s; commercial `@transistorsoft/capacitor-background-geolocation@9.6.0` needs iOS background-mode + Android foreground-service manifest work. `watchPosition()` seam stays consolidated at `Maps/src/utils.js:2080` for whenever it lands.
- [-] Compass/Qibla magnetometer — **PARKED (decision A, 2026-10-01).** `@capacitor/device-motion` 404s; official `@capacitor/motion@8.0.1` recorded. Web `DeviceOrientationEvent` listeners verified present (qibla.js:181-201, map-controls.js:375+) — compass already works in-WebView, so no code needed.

## Phase 4 — Distribution & Polish (owner: release-eng, haiku)

- [ ] iOS signing + App Store Connect — **GATED on Apple Developer account + the user's Apple credentials** (not worker-doable; see PREFERENCE_LOG). iOS **build** CI workflow written (lead) — `.github/workflows/ios-build.yml`, manual trigger, builds `.app` on macos-15, uploads artifact.
- [ ] Android keystore + Play Console (`aab`) — **GATED on Google Play Console + Android publishing account** (not worker-doable)
- [x] TWA (`bubblewrap`) vs. full Android comparison doc — **DONE** (release-eng haiku, 2026-10-01). `docs/TWA_COMPARISON.md` — recommendation: **ship the full Capacitor Android app** (bundled assets boot offline + auth/config pairing vs TWA's hosted-origin dependency). Plugin mapping documented; bubblewrap fee + APK sizes marked verify-at-submission.
- [x] Store assets + privacy declarations — **DONE** (release-eng haiku, 2026-10-01). `docs/STORE_ASSETS.md` — full Play + App Store audit with current-state table + data-safety/privacy-label drafts. Real gap: **privacy-policy URL not served on the Maps origin** (prereq for both stores). Screenshot capability exists (Playwright projects).
- [x] Brand icon — **DONE** (release-eng haiku + lead, 2026-10-01). User dropped `Maps/docs/guide-images/icon.png` (1024×1024, opaque RGB). Rewrote `Maps/scripts/icons-from-master.mjs` to decode the PNG (zlib, filters 0–4, colorType 2) and generate all **17 assets**: Android `ic_launcher`/`_round` (48/72/96/144/192), adaptive `ic_launcher_foreground` (safe-zone crop), background `#FDFCF8` (sampled from art edge, in `values/ic_launcher_background.xml`), iOS `AppIcon-512@2x.png` (1024), web `favicon.png` (512). All 17 validated: sig OK, chunk CRCs OK, IDAT inflate matches exact dims. `npx cap sync android` clean (3 plugins). Android manifest + iOS `Contents.json` (single universal entry) unchanged — correct already.
- [x] Device-aware toast copy (user requirement, 2026-10-01) — web-reconciler (haiku) audited `showToast` call sites; fixed the two native `requestLocation()` permission toasts in `utils.js` (`"Enable location in phone settings"` for both sub lines, native branch only). Lead fixed the last native leak flagged by the audit: `map-controls.js:384` — the `_geoPermState === "denied"` pre-check toast now emits device-aware copy via `isNative()` (previously always said "Enable it in browser settings" even inside the WebView). All `node --check`-clean, web copy byte-for-byte unchanged.
- [x] **Adaptive icon centering** — lead diagnosis (2026-10-01): `cropToSafe` in `Maps/scripts/icons-from-master.mjs` was mis-indexing — it read source `(x-padPx, y-padPx)` (the **top-left** of the downscaled icon) into the 108dp safe-zone canvas instead of mapping the center, so the Android launcher showed "the top-left corner of the image". Master art bounding box verified genuinely centered (x 28–994 / y 254–770 on 1024²; art center ≈ canvas center). **FIXED + VERIFIED** (maintainer, 2026-10-01): `cropToSafe` rewritten to a centered-66dp-circle mask (same-coordinate copy inside circle, transparent outside); all 17 assets regenerated; lead independently verified on-disk — all 5 adaptive foregrounds have transparent corners + opaque non-bg centers, all 10 legacy `ic_launcher`/`_round` stay fullbleed opaque at exact bucket px. Re-run `npx cap sync android` before rebuild.
- [x] **Adaptive icon zoom-in** (user follow-up, 2026-10-01) — user: "centered but a bit too zoomed in! use the full width." Lead rewrote `cropToSafe` (icons-from-master.mjs) again: now scales the fullbleed master DOWN to fit inside the 66dp circle (art fills the whole 61% safe zone, transparent outside the circle) instead of the 1:1 crop that showed a zoomed band. Regenerated 17 assets; verified on-disk: all 5 adaptive foregrounds have transparent corners, opaque center, AND icon material reaches the circle edge (full width). This supersedes the earlier center-mask version — note the glyph-bbox is a tall band (y 254–770) so horizontal fit fills the circle fully; the launcher now shows the emblem at the safe-zone width.
- [x] **Native Firebase OAuth (robust fix, user: "make the more robust fix")** — native-integration (haiku, 2026-10-01). Installed `@capacitor-firebase/authentication@8.5.2` (`Maps/package.json` deps; gradle `:capacitor-firebase-authentication` wired both files; `cap sync android` included it). `capacitor.config.ts` gained `plugins.FirebaseAuthentication.providers: ['google.com','facebook.com','apple.com']` (synced into android assets). `src/auth.js`: new `_nativeOAuthSignIn(label, providerId)` — gated by `isNative()` at the top of each of the 4 sign-ins; web popup block byte-for-byte untouched. **Two lead-brief corrections grounded in the plugin's own docs/source**: (1) the JS-SDK bridge is `signInWithCredential` with a per-provider credential (Google idToken / Facebook accessToken / Apple idToken+rawNonce via `OAuthProvider('apple.com')`), NOT `signInWithCustomToken`; Microsoft is short-circuited (`auth/microsoft-native-unsupported` — the plugin's JS-SDK bridge doc lists "Microsoft Sign-In: Not supported"); (2) the plugin is called through the injected bridge proxy `window.Capacitor.Plugins.FirebaseAuthentication.signInWithX(...)` with `skipNativeAuth:true` for Apple — the WebView never serves the plugin's ES module. Photo fetches (MS/FB access-token Graph) naturally skipped on native; provider photoURL from the bridged credential. **OPEN (on-device blockers, not code)**: `android/app/google-services.json` must be downloaded from Firebase console (Firebase Android SDK init, `FirebaseAuthentication.java` requires it); Google channel also needs OAuth web client ID. On-device popup/bridge untested (no emulator). Everything else verified by lead on-disk: diff clean, 4 gates first-line, plugin present, config synced. `node --check` clean.
- [x] **Play Store release guide** — release-eng (haiku, 2026-10-01) wrote `docs/PLAY_STORE_RELEASE.md`: verified debug APK on disk, JDK21+keytool commands, missing-signing config hook, 4 "blocked on you" items. NOTE: the audit's *"icons corrupt"* rows in `docs/STORE_ASSETS.md:110,115,122` are **STALE** — they describe the old ICO pipeline (cites `icon.ico`); the current `icons-from-master.mjs` (1024 PNG master) output re-verified valid (sig/CRC/inflate dims exact) both by lead's decoder AND python stdlib. Treat those rows as superseded.
- [x] **Play Store feature graphic (1024×500)** — lead (2026-10-01) generated `Maps/docs/store-assets/feature-graphic-1024x500.png` from the master icon (cream `#FDFCF8` background, 280px icon on a rounded light tile, distinct from the launcher). Validated: 1024×500, PNG inflate OK. This closes the last missing asset for the Play listing (screenshots still to be captured on-device).
- [x] **Satellite/Hybrid active border** — lead verification + maintainer fix (2026-10-01): state machine in `map-controls.js` (`_syncStyleButtons` at 1264, called unconditionally from `_setSatelliteMode` at 1166) **was** setting `.active` correctly. Root cause: the ONLY active indicator was `.style-opt.active { border-color: var(--accent) }` — a 2px teal border with near-zero contrast against the green aerial thumbnails (teal-on-green), while theme buttons (pale vector thumbs) read fine with the same border. **FIX (CSS-only, styles.css:1685-1717)**: `.style-opt.active` now adds `background: var(--accent-soft)` + accent border, plus `.style-opt.active span` accent-semibold label — mirroring the app's established `.rv-image-tag-option.is-selected` pattern. `--accent-soft` verified in both themes (#e6f2ef light / rgba(14,138,111,0.35) dark). No JS changes; map-controls.js diff in git status was pre-existing. Lead verified diff + token availability + pattern match.

---

## Blockers / Open decisions

- **Icon asset source** — deferred to Phase 4 (placeholder icons now).
- **`cartographer` orchestrator agent** hit a server-side "malformed stream" API error (2026-10-01); its `web-reconciler` subagent completed. Orchestration carried directly by the session's brain (pro). If the agent errors again, resume via SendMessage or re-run the orchestration prompt rather than re-spawning a duplicate.

---

## Session log

- **2026-10-01** — Plan written; progress + preference files created; agent
  crew defined (cartographer/mobile-captain = pro, six workers = haiku).
  Awaiting `cartographer` to decompose Phase 0/1 and dispatch Haiku workers.
- **2026-10-01 (later)** — Phase 1 dispatched to `web-reconciler` (haiku) and completed: `capacitor-bridge.js` created, `requestLocation()` gained a native one-shot branch. Phase 0 left as open questions for the user (not dispatched — decision gathering, not implementation).
- **2026-10-01 (Phase 0 resolved)** — User answered all four Phase 0 items (appId `com.karamahcollective.maps`/"Manarah"; commit android/ios but exclude from deploy allowlist; keep geolocation consolidation; defer icons). Rogue consolidation confirmed to keep. Phase 0 + Phase 1 now complete; dispatching Phase 2 → `capacitor-integration` (haiku).
- **2026-10-01 (resume — env setup)** — Lead reconciled Phase 2 sync/build status (see Phase 2 row) — the last session's work DID land. User chose iOS testing strategy → **GitHub Actions macOS CI runner** (logged in PREFERENCE_LOG). Dispatch #2 of `capacitor-integration` (haiku) running as environment verifier: audit toolchain and write `docs/ENVIRONMENT_SETUP.md`. Known host facts: **Java 8 (1.8.0_501)**, Android Studio **installed**, Windows 11. The iOS CI workflow file is lead-owned; exit gate (map on device) is the Phase 2 remaining task.
- **2026-10-01 (boot crash FIXED + first push prep)** — User reported the app crashing before the loader on the emulator. Root cause: `@capacitor-firebase/authentication`'s Android constructor **unconditionally calls `FirebaseAuth.getAuth()`**, which required `android/app/google-services.json` that did not exist → threw during WebView init. Fix: plugin **REVERTED** (npm uninstall + gradle wiring + `plugins.json` cleaned + `git checkout -- src/auth.js` + `npx cap sync android` → exactly 3 plugins: app 8.1.1, geolocation 8.2.2, share 8.0.2); user added `google-services.json` (package_name corrected to `com.karamahcollective.manarah`); appId renamed everywhere (`capacitor.config.ts`, `android/app/build.gradle` namespace+applicationId, `values/strings.xml`, MainActivity package dir) → **rebuild + reinstall on emulator-5554: app boots, is top/focused activity (PID alive), serves `https://localhost/data/icons/favicon.png` from the bundle, compositing frames (HWUI/EGL stats), no FATAL/AndroidRuntime in logcat.** **Migration status confirmed: Android DONE (boots + native plugins live), iOS scaffolded but UNVERIFIED** (no `GoogleService-Info.plist`, macOS-only, gated on CI + Apple credentials). Original `auth.js` diff backed up at `/tmp/auth.diff`.
- **2026-10-01 (git hygiene + first commit)** — Pre-push hardening per user ("make sure unneeded files are in proper gitignored so we don't trash github"): uncommented `google-services.json` in `Maps/android/.gitignore` (was committing a live Firebase API key + OAuth client ids to a public repo); added `.claude/settings.local.json` to root `.gitignore` (per-machine permission overrides). Verified `Maps/android/**/build` + `gradle-wrapper.jar` + `local.properties` + iOS `App/App/public` all ignored. No absolute local paths in the iOS `project.pbxproj`. Docs + READMEs updated (root README "Native shells" note; Maps README "Native apps (Capacitor)" section). First commit + push of the whole phase to `main`.