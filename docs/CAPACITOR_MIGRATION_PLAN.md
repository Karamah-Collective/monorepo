# Capacitor Integration Plan — Manarah (Karamah Maps)

**Status:** Proposed — awaiting approval to execute
**Owner:** `cartographer` (orchestrator) → `mobile-captain` (lead executor)
**Last updated:** 2026-10-01

---

## 0. Goal & Non-Goals

**Goal:** Wrap the existing vanilla-JS PWA in Capacitor to ship native iOS and
Android apps — **without** a framework rewrite and **without** regressing the
web version.

**Non-goals (explicitly out of scope):**
- No React/Vue/Svelte migration. The web app stays vanilla ES modules.
- No replacement of MapLibre GL JS with a native map SDK.
- No changes to the Cloudflare backend (`functions/`, D1, R2) — it already
  works for any HTTP client.
- No separate native codebase. One web codebase + a thin native shell.

**North-star constraint:** `index.html` + `src/` + `functions/` + `manifest.json` +
`sw.js` continue to be the *only* product surface. Capacitor is an adapter
around that surface, never a fork of it.

---

## 1. Why Capacitor (decision context)

- The product is a **map-first PWA** with a mature, irreplaceable MapLibre GL
  JS integration (custom 1,096-line vector style, 3D terrain, heatmap, 4
  visual modes, 60fps). Options that port to a native map SDK (Flutter,
  React Native) would regress this core surface.
- The backend is already **web-standards-only** (Cloudflare Workers/D1/R2 +
  plain-HTTP third-party APIs), so it needs zero changes for native.
- Capacitor reuses the existing web app *as-is*; native gaps are filled by a
  small, well-defined plugin set rather than a rewrite.
- See `docs/` discussion of the Flutter/React alternatives for the full
  trade-off analysis this decision is based on.

---

## 2. Target Architecture

```
                        ┌─────────────────────────────────────────┐
                        │           capacitor.config.ts            │
                        │  (webDir = dist/, appId, plugins)        │
                        └─────────────────────────────────────────┘
                                         │
   ┌──────────────┐   ┌──────────────┐   │   ┌──────────────┐   ┌──────────────┐
   │  iOS (Xcode) │   │ Android      │   │   │  Web (today) │   │  PWA (today) │
   │  native shell│   │ (Gradle/AGP) │   │   │ Cloudflare   │   │ installable  │
   └──────────────┘   └──────────────┘   │   │  Pages        │   └──────────────┘
            │               │            │   └──────────────┘
            └───────┬───────┘            │
                    │  Capacitor bridge  │
                    ▼                    ▼
        ┌─────────────────────────────────────────────────┐
        │   The single web app (unchanged product logic)  │
        │   index.html · src/*.js · src/styles/*.css      │
        │   manifest.json · sw.js · data/*                │
        │   → talks to functions/api/* over HTTPS         │
        └─────────────────────────────────────────────────┘
```

**Key points:**
- The web app is copied verbatim into `dist/`; Capacitor serves that copy from
  the device's WebView filesystem, not from the Cloudflare URL.
- Backend APIs stay on Cloudflare; the native app is a client of the same
  endpoints the browser uses. No local backend.
- `manifest.json` / `sw.js` are ignored by the native shell (a WebView has no
  service worker); all offline and caching behavior is native-only.

---

## 3. Native-Surface Gap Analysis

This table is the heart of the plan. Each row is a feature the current web app
relies on, its web implementation, and whether/how it needs native adaptation.

| # | Feature | Web implementation (today) | Capacitor behavior | Action |
|---|---------|---------------------------|--------------------|--------|
| 1 | Map rendering (MapLibre GL JS) | WebGL `<canvas>` | Runs in WKWebView / Android WebView | **None** (may need a `@capacitor/core` Metal/ANGLE check on very old devices) |
| 2 | Vector/raster/Glyph tile caching | `sw.js` multi-tier caches | **No SW in WebView** | Accept online-only OR add `@capacitor/filesystem` cache layer (Phase 4, optional) |
| 3 | Geolocation (locate, nav) | `navigator.geolocation` | Same API in WebView; requires native permission prompt | `@capacitor/geolocation` (authoritative permission + permission-status UI stub) |
| 4 | Background location (turn-by-turn) | Not supported | iOS background modes + Android foreground-service | `@capacitor/background-geolocation` plugin (Phase 3) — the one genuinely *new* capability |
| 5 | Compass / Qibla | `DeviceOrientationEvent` | Works in modern WebViews, but truncated-heading + iOS permission models differ | `@capacitor/device-motion`-style magnetometer plugin OR keep web API behind a `@capacitor/plugins` check |
| 6 | Voice nav (Web Speech) | `speechSynthesis` | **WKWebView has no `speechSynthesis`** (iOS); Android varies | `@capacitor-community/tts` fallback (Phase 3) |
| 7 | Share | `navigator.share` | Absent in most WebViews | `@capacitor/share` |
| 8 | OAuth sign-in (Firebase) | Firebase Web SDK + gstatic ES modules | WebView OAuth popups are unreliable; Apple requires native Sign in with Apple | **Largest auth risk** — see §6 |
| 9 | Push / notifications | None | New capability | `@capacitor/push-notifications` (Phase 4, optional) |
| 10 | Deep links (share `?r=`/`?p=`) | URL hash/params | Native app links (`manarah://`) + App Store universal links | `@capacitor/app` + `App.addListener('appUrlOpen')` (Phase 3) |
| 11 | Haptics / native UI polish | None | Native feel | `@capacitor/haptics`, native status bar / safe-area config (Phase 2–3) |
| 12 | Status bar / safe area | CSS `viewport-fit=cover` + `env(safe-area-inset-*)` | WebView maps these correctly if viewport meta is set (it is) | Verify only |
| 13 | App lifecycle / deep-link resume | `visibilitychange` | `@capacitor/app` resume events | Phase 3 |

**Summary:** Items 1, 2, 12 need *no* code or are verification-only. Items
3, 4, 7, 10, 13 need a Capacitor plugin behind a `Capacitor.isNativePlatform()`
guard. Items 6 and 8 are the two features that **degrade** inside a WebView and
need a real native plugin or an alternative flow (see §6).

---

## 4. Repository / Monorepo Layout

Capacitor lives **inside** `Maps/` as an additional native layer, preserving the
monorepo's single-root-install convention.

```
Maps/
├── package.json                 # add Capacitor deps; keep dev-only
├── capacitor.config.ts          # appId, appName, webDir, plugins
├── dist/                        # BUILT web app (new build output target)
│   └── (index.html + src copy)
├── android/                     # generated native Android project (gitignored? see note)
├── ios/                         # generated native iOS project (gitignored? see note)
└── (existing) src/ functions/ manifest.json sw.js ...
```

**Decision point — whether to commit `android/`/`ios/`:** recommended YES for
team reproducibility and CI, but gate it on whether the team also builds these
locally on Windows (iOS requires macOS/Xcode regardless). Record the decision
in `PREFERENCE_LOG.md`.

---

## 5. Phased Execution Plan

### Phase 0 — Reconciliation & Preflight (owner: `mobile-captain`, reviewed by `cartographer`)

- Confirm the build pipeline outputs a single static `dist/`.
- Audit `manifest.json` (bump icons to include iOS-sized 512 + Android
  adaptive icons), because App Store/Play Store require specific icon artwork.
- Freeze on `appId` (reverse-DNS, e.g. `com.karamahcollective.maps`) and
  display name ("Manarah").
- Record decisions in `PREFERENCE_LOG.md`.

### Phase 1 — Web Reconciliation (owner: `web-reconciler`, reviewed by `mobile-captain`)

- Add `src/capacitor-bridge.js` (or extend `utils.js`) with:
  - `export const isNative = () => Capacitor.isNativePlatform();`
  - Feature gate so native-only plugin calls never run in the browser.
- Route all geolocation calls through a single `getLocation()` helper that
  already exists in `utils.js` → add a Capacitor branch.
- Verify `viewport-fit=cover` + safe-area CSS renders correctly in WebView.

### Phase 2 — Capacitor Scaffold & First Build (owner: `capacitor-integration`)

- `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
- `npx cap init` with the frozen appId/name.
- Add `capacitor.config.ts` (`webDir: 'dist'`).
- Produce a build that opens the app in a WebView on both platforms (happy
  path only — map loads, no plugin features yet).
- **Exit gate:** map renders on a physical device, before any plugin work.

### Phase 3 — Native Feature ParitUMS (owner: `native-integration`)

- Geolocation plugin + permission flow.
- Share plugin (replace `navigator.share` fallback).
- Deep-link handling (`appUrlOpen`).
- TTS fallback for voice nav (iOS has no `speechSynthesis`).
- Background geolocation for turn-by-turn (the one truly new capability).
- Compass/magnetometer plugin or verified `DeviceOrientationEvent` behavior.

### Phase 4 — Distribution & Polish (owner: `release-eng`, reviewed by `cartographer`)

- iOS: Xcode target, signing, App Store Connect.
- Android: signing keystore, Play Console, `aab` build. Also evaluate the
  zero-code **TWA / `bubblewrap`** path as a lower-effort alternative to the
  Play Store for Android (document the comparison).
- Push notifications (optional).
- Store assets, screenshots, privacy declarations (location, motion, TTS).

---

## 6. Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Firebase OAuth in WebView** — gstatic ES-module popups and Apple Sign-In | **High** | Native OAuth via `@capacitor-community/apple-sign-in` + Firebase native SDK bindings, OR keep the WebView redirect flow but verify on real devices first. **Do not assume the browser popup flow works.** |
| **Map performance in WebView** — WKWebView WebGL is solid but older Android WebViews vary | Medium | Target modern WebView; test on a real low-end Android device in Phase 2. |
| **No service worker in WebView** — offline tile cache lost | Medium | Accept online-only for v1; add a Filesystem cache layer in Phase 4 only if needed. |
| **Voice nav missing on iOS** (`speechSynthesis` absent in WKWebView) | Medium | `@capacitor-community/tts` fallback in Phase 3. |
| **Compass reliability** (truncated heading on some Android WebViews) | Low | Magnetometer plugin or `deviceorientationabsolute` check; fall back to GPS heading. |
| **iOS build toolchain unavailable on Windows** | Medium | CI (GitHub Actions macOS runner) for iOS builds; Android/build locally. |
| **Dual maintenance drift** — web + native diverge | Medium | Hard rule: native shell never forks product logic; plugins only behind `isNative()` gates. |

---

## 7. Definition of Done

1. Native iOS + Android builds open the app and render the map correctly.
2. Shared backend (`functions/`) requires **zero** changes.
3. All native-only code sits behind `isNative()` gates and is inert on web.
4. The web app (Cloudflare-deployed) is unaffected by the Capacitor layer.
5. Deep links, share, geolocation, and (Phase 3) voice + background nav work
   on-device with the same data flow as the browser.
6. `PREFERENCE_LOG.md` records every decision made during the migration.

---

## 8. Agent Ownership Map

| Workstream | Primary agent | Reviewer agent | Model |
|------------|---------------|----------------|-------|
| Orchestration / task routing | `cartographer` (orchestrator) | — | **opus** |
| Overall plan + mobile lead | `mobile-captain` | `cartographer` | **opus** |
| Web reconciliation (JS gates) | `web-reconciler` | `mobile-captain` | **haiku** |
| Capacitor scaffold + build | `capacitor-integration` | `mobile-captain` | **haiku** |
| Native plugin integration | `native-integration` | `mobile-captain` | **haiku** |
| Store release + signing + TWA | `release-eng` | `cartographer` | **haiku** |
| Ongoing generic maintenance | `maintainer` (new) | `the-architect` | **haiku** |
| Code-quality / refactor | `refactorer` (existing) | `the-architect` | **haiku** |
| Design-system / architecture | `the-architect` (existing) | — | **opus** |