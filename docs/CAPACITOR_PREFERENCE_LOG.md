# Capacitor Migration — Decision & Preference Log

**Purpose:** Record every decision, solved problem, and expressed preference
from the Capacitor migration so nothing is re-litigated and no mistake repeats.
Append chronologically; newest at top of each section. This is the migration's
memory — read it at the start of every migration session.

**Companions:**
- `docs/CAPACITOR_MIGRATION_PLAN.md` — the plan & gap analysis
- `docs/CAPACITOR_PROGRESS.md` — resumable task state
- `Maps/docs/PREFERENCE_LOG.md` — the architect's broader project memory
  (design system, general app preferences)

**Rule:** if you hit a problem and solve it, or if the user expresses a
preference, log it here *before* moving on. Never assume the next session will
re-derive it.

---

## Decisions

- **iOS CI workflow — lead-owned, written (2026-10-01):** `.github/workflows/ios-build.yml` (workflow_dispatch only) builds the iOS `.app` on a `macos-15` runner and uploads it + `Maps/dist` as an artifact. It does **NOT** boot the iOS Simulator on CI — that is not a supported GitHub Actions operation; simulator/physical-device install of the built `.app` is a manual step, and signing is gated on Apple credentials (Phase 4). Keep the Java version here in sync with the JDK 21 host fix.
- **Phase 3 closure — decision A (user, 2026-10-01):** Phase 3 is **DONE via A/B/C** (geolocation, share, deep links shipped). **D (TTS), E (background geolocation), F (compass) are PARKED**, not shipped — and **plan B is kept for later** (user explicitly reserved it). Rationale: F's web `deviceorientation` listeners already work in the WebView (verified present, qibla.js/map-controls.js); D would wire a plugin into a voice navigator that **does not exist in source** (the README overclaims it — `Maps/src/navigation.js` has zero speech code); E requires a commercial plugin + iOS-background/Android-foreground manifest work. Parked alternatives (do NOT re-derive): D `@capacitor-community/text-to-speech@8.0.2` · E `@transistorsoft/capacitor-background-geolocation@9.6.0` · F `@capacitor/motion@8.0.1`. Do not re-litigate D/E/F in Phase 3; revisit under "Plan B" only if the user asks.
- **Plugins actually installed this session: NONE.** Tasks D/E/F installed no plugin (all three named packages 404 on registry).
- **Skipped plugin — `@capacitor-community/tts` (D, 2026-10-01):** 404 / does not exist on the npm registry. Not installed; no substitute installed. Canonical alternative recorded: `@capacitor-community/text-to-speech@8.0.2`.
- **Skipped plugin — `@capacitor/background-geolocation` (E, 2026-10-01):** 404 / does not exist. Not installed; no substitute installed. Canonical commercial alternative recorded: `@transistorsoft/capacitor-background-geolocation@9.6.0`.
- **Skipped plugin — `@capacitor/device-motion` (F, 2026-10-01):** 404 / does not exist. Not installed. Official Ionic alternative recorded: `@capacitor/motion@8.0.1`.
- **iOS testing strategy (user decision, 2026-10-01):** iOS cannot be built or run on the user's Windows 11 PC (Xcode + iOS Simulator are macOS-only; no Windows iOS simulator exists). Decision: validate iOS via a **GitHub Actions macOS runner** — CI builds the iOS app and captures simulator screenshots/artifacts, so no Apple hardware is needed. Android is tested locally on the Windows Android emulator. The iOS CI workflow file itself is a lead-owned task (pending), not haiku-worker scope.
- **Phase 1 bridge seam (2026-10-01):** `isNative()` lives in a new `src/capacitor-bridge.js` and is implemented against the runtime `window.Capacitor` global using `typeof Capacitor !== "undefined"` guards — no SDK import in Phase 1 (the SDK is not yet installed). Zero runtime deps; inert on web.
- **Geolocation native branch (2026-10-01):** one-shot (non-watch) `requestLocation()` calls route through `Capacitor.Plugins.Geolocation.getCurrentPosition` when `isNative()` is true and the plugin exists; watch-mode and the direct `navigator.geolocation` call sites (places.js, prayer.js, qibla.js, map-controls.js) are deliberately deferred to Phase 3 plugin wiring.
- **Rogue geolocation consolidation — KEEP (user decision, 2026-10-01):** the accidental duplicate worker's rewiring of the four direct `navigator.geolocation` call sites through the new `hasGeolocation`/`getCurrentPosition`/`watchPosition`/`clearLocationWatch` seam in `utils.js` is **kept** (not reverted). Rationale: behavior-preserving and genuine Phase 3 prep; the `node --check`-clean centralization is acceptable even though it landed early.
- **appId / appName (user decision, 2026-10-01):** bundle id = `com.karamahcollective.maps`, display name = **"Manarah"**.
- **Commit vs. gitignore (user decision, 2026-10-01):** commit `android/` and `ios/`, **but keep them out of the Cloudflare deploy branch.** No separate folders needed — the deploy branch is already regenerated from an explicit `DEPLOY_FILES` allowlist in `tooling/deploy-agent.mjs` (line 53) that never lists `android/ios/`; they simply won't be copied to `preview`/`deploy`. Standing rule for Phase 2+: do **not** add `Maps/android` or `Maps/ios` to `DEPLOY_FILES`.
- **Icon assets (user decision, 2026-10-01):** deferred to Phase 4. Proceed now with placeholder/default icons; finalize store artwork during distribution. **RESOLVED 2026-10-01:** user supplied `Maps/docs/guide-images/icon.png` (1024×1024, 8-bit, colorType 2 opaque). All 17 native/web assets generated + validated; `npx cap sync` run. The generator is now `Maps/scripts/icons-from-master.mjs` (PNG-in path; the old ICO path was replaced — the ICO decode is gone). If the art updates, re-run `node scripts/icons-from-master.mjs` + `npx cap sync`.

## Solved problems / mistakes to avoid

- **`cap run android` cannot pass `-gpu` to the emulator (2026-10-01):** `native-run` (invoked by `cap run android`) boots the emulator with a hardcoded `-avd <name> -port 5554.. -verbose` — no GPU flag, no passthrough. To get hardware GL, boot the AVD manually with `-gpu host` FIRST (or `-gpu swiftshader_indirect` if the host GPU is unavailable), then run `adb devices`; if native-run can't see the running emulator under the default port, use `-gpu host` + keep port 5554 free, or fall back to `npx cap run android` after a manual boot and let it target `emulator-5554`.
- **Adaptive-icon safe-zone crop has to map the center, not the top-left (2026-10-01):** `cropToSafe` in `Maps/scripts/icons-from-master.mjs` originally read source `(x-padPx,y-padPx)` into output `(x,y)` — i.e. it projected the source's **top-left** region into the safe zone. For the Android 8+ adaptive icon, the 108dp canvas's center-66dp circle is the only visible part; output pixel (x,y) must map to source (x,y) and everything outside the 66dp circle must be transparent. The fix is a centered-circle mask; the `ic_launcher_foreground.png` bucket files are NOT `ic_launcher`/`ic_launcher_round` (those stay fullbleed).
- **Capacitor 8 Android needs JDK 21, not 17 (2026-10-01):** Capacitor's docs say JDK 17, but Capacitor 8's `capacitor-android` library compiles at `source release: 21` — Gradle fails with `error: invalid source release: 21` under a JDK 17 `JAVA_HOME`. The local fix on this machine: point `JAVA_HOME` at the already-installed OpenLogic JDK 21 (`C:\Program Files\OpenLogic\jdk-21.0.4.7-hotspot`). Recorded because this contradicts the common "17 is safe" guidance and would cost a future session the same 30 minutes.
- **`setx` only affects NEW shells (2026-10-01):** every `setx JAVA_HOME`/`PATH` write lands in the registry; the open terminal keeps the stale value until reopened. Gradle reads `JAVA_HOME` from the current process env, so a build in the same window after `setx` reads the OLD value — always close+reopen before `npx cap run android`. PowerShell also does not expand `%VAR%` (`echo %JAVA_HOME%` prints the literal) — use `$env:JAVA_HOME`.
- **Bare `Capacitor` identifier vs `window.Capacitor` (2026-10-01):** the bridge uses a bare `Capacitor` reference guarded by `typeof Capacitor !== "undefined"`. This is safe here because the only non-`typeof` access is inside `isNative()` (a function body, not module-evaluation time), so the ES-module TDZ trap does not apply. If Phase 3 wants a fully TDZ-proof seam, `window.Capacitor` throughout is equivalent — note for later, not required now.
- **Deploy isolation already handled (2026-10-01):** committing `android/`/`ios/` cannot pollute the deploy branch because `tooling/deploy-agent.mjs` builds `preview`/`deploy` from an explicit `DEPLOY_FILES` allowlist. Learn this once — future "keep X out of deploy" requests usually reduce to "don't add X to `DEPLOY_FILES`".
- **Empty-prompt agent spawn (2026-10-01):** an orchestrator accidentally launched a duplicate `web-reconciler` with an empty prompt, which then overstepped scope. Guard: never spawn a worker without a complete brief; if a duplicate hand-off appears mid-task, reconcile the working tree against the reporting agent's diff before proceeding.

## User preferences (explicit statements)

- **Model split (2026-10-01):** pro model (`deepseek-v4-pro-0813`, aliased as
  `opus`/`sonnet`) is the brain — planning/orchestration. Flash model
  (`deepseek-v4-flash-0731`, aliased as `haiku`) does all grunt work. Keep most
  token spend on flash; spend pro only on judgment, trade-offs, architecture.
- **Do not suggest a framework rewrite.** Vanilla JS + Capacitor wrap is the
  approved path; React/Flutter/React Native migration are off the table.
- **Track progress + preferences explicitly.** Every migration session must
  update `CAPACITOR_PROGRESS.md` and this file so work resumes cleanly.

## Session notes

- **2026-10-01 (device-aware toasts, web-reconciler haiku + lead)** —
  User requirement: "depending on the device the toasts might need to
  update — e.g. web toast might say one thing, android something else."
  web-reconciler audited all `showToast`/notice call sites: the only
  native-reachable copy assuming a browser was in
  `map-controls.js:384` (the `_geoPermState === "denied"` pre-check bails
  before `requestLocation()`'s native branch, so its "Enable it in browser
  settings" copy showed inside the WebView). Fixed: the two native-only
  permission toasts in `utils.js:1959,1961` ("Enable location in phone
  settings"); and the map-controls pre-check now picks copy via `isNative()`.
  Web copy untouched; `node --check` clean. Lesson: any toast that can fire
  BEFORE a native branch runs (fast-bail pre-checks, cached permission
  reads) needs its own `isNative()` guard — do not assume the reject path
  will be reached.
- **2026-10-01 (Phase 3-D/E/F triage, native-integration haiku)** — Tasks D, E, F were received as a resume brief. Findings: all three named plugins (`@capacitor-community/tts`, `@capacitor/background-geolocation`, `@capacitor/device-motion`) return **404 / do not exist** on the npm registry. Task D additionally blocked because the product has **no web speech-synthesis callsite** (`Maps/src/navigation.js` has zero speech code; `SpeechSynthesisUtterance` appears only in `Maps/README.md` — the README overclaims a voice navigator that was never implemented in source). No substitutes installed (mission hard-rule); alternatives recorded for mobile-captain:
  - D → `@capacitor-community/text-to-speech@8.0.2` (canonical, ionic community, maintained 2026-06-15)
  - E → `@transistorsoft/capacitor-background-geolocation@9.6.0` (commercial, transistorsoft; iOS background-mode + Android foreground-service required — significant manifest work)
  - F → `@capacitor/motion@8.0.1` (official Ionic workspace; tracks accelerometer + compass heading)
  Verified A-C landed on disk (DID NOT re-touch them); web `DeviceOrientationEvent` listeners present for F; `npm run build` + `npx cap sync android` **PASS** (3 plugins synced: app 8.1.1, geolocation 8.2.2, share 8.0.2).
- **2026-10-01 (Phase 0/1 orchestration)** — Phase 0 decomposed into open user decisions (appId/appName, commit-vs-gitignore, icon source); no worker dispatched (decision gathering). Phase 1 dispatched to `web-reconciler` (haiku) and completed. Phase 2+ gated behind Phase 0 decisions.
- **2026-10-01 (Phase 0 decisions recorded)** — User resolved all four open items: appId `com.karamahcollective.maps` + name "Manarah"; commit android/ios (deploy-branch isolation handled by allowlist); keep the rogue geolocation consolidation; defer icons to Phase 4. `cartographer` agent itself hit a server-side "malformed stream" error but its `web-reconciler` subagent completed; orchestration carried by the session's brain directly. Dispatch Phase 2 → `capacitor-integration` (haiku) next.
- **2026-10-01 (session close)** — User paused the migration for the session. State at close: Phase 0 + Phase 1 complete; Phase 2 scaffold generated (Capacitor 8.5.2 devDeps, `Maps/android`, `Maps/ios`, correct `capacitor.config.ts`) but the worker's `cap sync` + first-build/final-report had not landed yet. Nothing committed to git. Resume point: see `docs/CAPACITOR_PROGRESS.md` "session close-out" entry.
- **2026-10-01 (boot crash + git hygiene, lead)** — *Crash:* the native Firebase OAuth plugin crashed boot because its Android constructor requires `google-services.json` unconditionally. Decision: **revert the plugin** (A) rather than ship a boot guard, since the config is per-developer and the web `signInWithPopup` path works. Re-add only when native OAuth is actually being shipped, using the recorded diff (`/tmp/auth.diff`). *Git:* committed `android/` + `ios/` to `main` (standing Phase 0 decision) but with **`google-services.json` gitignored** — it holds live Firebase API keys + OAuth client ids and must remain per-machine (template's commented-out ignore line was a latent secret leak). Keep `.claude/settings.local.json` out of git too. iOS `GoogleService-Info.plist` still missing → iOS native OAuth also parked.
