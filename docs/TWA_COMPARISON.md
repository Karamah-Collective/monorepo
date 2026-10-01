# Android TWA (`bubblewrap`) vs. Full Capacitor Android — Decision Comparison

**Status:** Decision-support document (Phase 4, release-eng). No implementation
was performed — this is a comparison for `cartographer` / `mobile-captain` to
decide the Android store path.
**Date:** 2026-10-01
**App:** Manarah (Karamah Maps), `appId com.karamahcollective.maps`, Capacitor
8.5.2 shell, vanilla-JS PWA bundle in `Maps/dist` (~14 MiB on disk).

---

## 1. Executive summary

For a small single-purpose app like Manarah, shipping the **full Capacitor
Android build remains the recommended path**: it is the route the team has
already scaffolded, tested on the Pixel 7 emulator, and wired to all three
installed native plugins. The decisive reason is **offline and auth behavior**:
Capacitor serves `dist` locally from `capacitor://localhost`, so the map render
and app UI bootstrap even when the network is poor, whereas a TWA wraps the
**remote HTTPS origin** and every screen load, auth session, and API call
depends on that origin being reachable. TWA's main wins — no Android build
toolchain, instant web-deploy updates — are defensible once the hosted origin
is production-stable, but they trade away the native plugin parity the team
just shipped and add a Google Play service dependency whose public
free-tier/paid status is not settled. **Recommendation: keep the Capacitor
Android app as the store path.** Review TWA only if a later decision
de-prioritizes offline/resilience and wants web-deploy-speed updates.

---

## 2. What each is / how they ship

### Android TWA (Trusted Web Activity, `bubblewrap`)
- Google Play's "install the website as an app" model. Instead of bundling the
  app's files inside the APK, the Play listing becomes an installable
  **wrapper** whose job is to open the real **HTTPS origin**.
- Two Google Play ingredients in addition to the listing itself:
  1. **Digital Asset Links** — an `assetlinks.json` published on the HTTPS
     origin at `https://<origin>/.well-known/assetlinks.json` proving the
     site-owner controls the domain and maps it to the Play app ID.
  2. A `manifest.json` (the PWA's existing manifest) that declares
     `display: standalone`, icons, and `id`-style identity for the TWA.
- `bubblewrap` ([`@bubblewrap/cli`](https://github.com/GoogleChromeLabs/bubblewrap))
  is the Google Chrome Labs CLI that validates the manifest and generates the
  TWA project/package. The Play listing then ships that generated TWA, which
  opens the hosted origin in a sandboxed browser app shell.
- **Service coupling:** every user session is a session against the public
  origin. No origin reachability == no app.

### Full Capacitor Android app (current path)
- The `Maps/dist` asset bundle is copied into the APK by
  `npx cap sync android` (generated into `Maps/android/app/src/main/assets/public/`,
  verified present) and served from the device's WebView filesystem at
  `capacitor://localhost`.
- The APK is built by Gradle (`npx cap build android`), signed with an Android
  publishing keystore, and submitted to Play Console as a `.apk`/`.aab`.
- **No hosted-origin dependency:** the app shell, UI, and map render boot from
  the bundled copy. Runtime API calls still go out to Cloudflare
  (`maps.karamahcollective.com`) and third-party tile/routing APIs, but a
  failure of any one endpoint degrades only the feature that needs it — the app
  itself stays up.
- One consequence: update cycles go through **Play Store review + rollout**,
  not instant web deploy.

---

## 3. Comparison table

| Dimension | Full Capacitor Android (current) | TWA via `bubblewrap` |
|---|---|---|
| **Install payload size** | Full APK: `dist` ~14 MiB on disk + Capacitor/plugin JARs + Android runtime. Verify exact APK size at build time (`npx cap build android` then read `dist/*.apk`). | Tiny wrapper APK; the app's ~14 MiB stays on the HTTPS origin and downloads at first-run. |
| **Offline / flaky-network behavior** | Bundled assets boot from `capacitor://localhost`; map + UI render without the network. Only data/API fetches need connectivity. | App *is* the remote origin — no origin, no UI. Requires an always-on origin (and any CAPTCHA/auth flows survive the WebView/TWA session model). |
| **Update model** | Play Store review + rollout per release (`versionCode`/`versionName` bumped in `Maps/android/app/build.gradle`; currently `1`/`"1.0"`). | Web deploy is **instant** for all TWA users (no store review for asset changes); store re-review only for the tiny wrapper's own metadata. |
| **Native plugin access (geolocation / share / deep link / background)** | Full `@capacitor/*` plugin layer installed: `capacitor-app 8.1.1`, `capacitor-geolocation 8.2.2`, `capacitor-share 8.0.2` (confirmed in `Maps/android/capacitor.settings.gradle` + `Maps/ios/App/App/capacitor.config.json`). New plugins (e.g. `@capacitor/motion` for compass, a TTS plugin, background-geolocation) are drop-in in future. | **No `@capacitor` plugin runtime.** TWA exposes only the constrained `TwaManifest`/web-platform surface inside a browser sandbox. Geolocation: modern Android WebView can serve the standard `navigator.geolocation` (permission prompt may render differently inside a TWA, and no native permission-UI control). Share: `navigator.share` absence/limits match the web PWA today, *not* the native plugin behavior. Deep links: no `capacitor://…/appUrlOpen`-style hooks — deep-link runds to Manarah's `?r=`/`?p=` state would have to rely on the TWA's URL-handling/`appUrlOpen` mapping, a weaker surface. Background geolocation: **not available** (web API scope differs between TWA and native services). TTS: unavailable unless the WebView exposes `speechSynthesis` (iOS WKWebView famously does not expose it). |
| **Play Store review / policy** | Standard review of the full APK; Play checks Android content rating, data-safety form, platform compatibility. All of the app's declared permissions (location, optional account auth) are scrutinized and tied to whether the app is actually using the native permissions APIs. | Same storefront review, but Google additionally validates the **Digital Asset Links** handshake and the origin's manifest. Review risk shifts toward "is your hosted origin secure/compliant" rather than "is your APK well-behaved". Content-rating + data-safety forms apply to both. |
| **CI / build complexity** | Requires the Android build chain (JDK 21 per the logged fix — Capacitor 8 targets `source release: 21`, not the documented 17), Gradle, and a **keystore + password** kept out of git. Build already proven on the local Pixel 7 emulator, and there is an iOS-only CI workflow on `macos-15`. | No Android toolchain needed (manifest + `assetlinks.json` + a small TWA bundle). Simpler CI: publish `assetlinks.json` with the web deploy, run `bubblewrap` validation, upload the TWA package. |
| **Cost / free tiers** | Free of external service fees: signing cert for Play is a one-time cost; Google's $25 Play developer fee + Play review fees apply to any listing. | The "free via g.co/uw" TWA offer from Google's brief bubblewrap launch window has been replaced: TWA enrollment on Google Play is now a **paid Play service** (developer fee + review). I could not verify a current public price offline — **verify the current pricing/fee at submission time** (`npm view @bubblewrap/cli` itself is free; it is the *Play service* that charges, not the CLI). |
| **Long-term maintenance** | One native shell + plugin layer to keep in sync with Capacitor releases; update costs are every-Capacitor-major. Fully owned by the team. | Maintenance shifts to the hosted origin (HTTPS, CORS, headers, `assetlinks.json` rotation) and to Google's TWA feature roadmap; the wrapper itself is thin. Risk: if Google changes TWA requirements, a store submission may need rework on Google's timeline. |

---

## 4. Deep-link + auth consideration (Manarah specifics)

Manarah's runtime has three network touchpoints that behave differently on the
two paths:

1. **Identity layer (Firebase Auth)** — `Maps/src/auth.js` signs in with
   Google, Microsoft, Facebook, or email/password via the Firebase **Web** SDK
   ES modules and `signInWithPopup`-style flows (verified in source). Firebase
   Auth requires a **reachable HTTPS origin** whose domain is allowlisted; the
   Firebase project `halal-map-karamah` must have the app's domain authorized.
   - *Capacitor:* the app boots from `capacitor://localhost`, so auth opens a
     popup/redirect against Firebase over the network. The app must be served
     in an environment where Firebase's popup works — the known WebView-OAuth
     risk from the migration plan's risk register. Already in scope today.
   - *TWA:* the TWA **is** the HTTPS origin, so Firebase Auth's cookie/redirect
     model works natively — that is the one place TWA is *better* for auth.
     But login is then tied to TWA's browser-session sandbox and to the
     origin's stability.

2. **`fetch("/api/config")`** — `Maps/src/config.js` loads runtime config from
   a **relative** `/api/config` (a Cloudflare Pages Function) at startup, with
   **committed defaults** as fallback:
   - *Capacitor, served from `capacitor://localhost`:* the relative fetch fails
     locally; `config.js` silently falls through to the committed defaults
     (the Digitransit/Waltti endpoints, transit URLs, Turnstile site key, and
     Firebase config) already visible in the bundle. **The app works** with
     production defaults baked in — this is exactly what the current Phase 2–3
     build relies on.
   - *TWA, served from the hosted origin:* `/api/config` resolves correctly
     against the origin, so env-var-driven API keys/flags behave exactly as the
     web app. **Better** in the sense of parity with the hosted web app — but
     it requires the origin to be up.
   - **Implication:** TWA and Capacitor will read configuration differently
     unless the Capacitor build's `config` handling is changed; conversely, a
     TWA that loses origin reachability loses even the defaults path that
     Capacitor guarantees on-disk.

3. **Tile/DATA APIs** — map tiles (OpenFreeMap), routing (Digitransit /
   Transitous / OSRM), geocoding (Nominatim), prayer times (AlAdhan) are all
   remote on **both** paths; only the app's own UI bundle differs in delivery
   (bundled vs. origin-served). No behavioral difference besides the
   origin-reachability coupling noted above.

**Net:** TWA is superior for the *auth + config* pairing but inferior for
offline boot and native-plugin parity — and it makes the whole app depend on
one hosted origin that Manarah's current Capacitor build explicitly does not
depend on.

---

## 5. Recommendation and switching plan

**Recommendation:** ship the full Capacitor Android app (the current path).
Reasons, in order:
- Bundled startup + committed config defaults make the app resilient and
  review-clean on-device, independent of the hosted origin.
- The three installed native plugins (geolocation, share, deep links) keep
  their intended behavior, and the parked roadmap (compass/motion, TTS,
  background geolocation) only has a native-`@capacitor` home.
- The TWA service is no longer the free g.co/uw offering it started as and its
  current fee/standing needs external verification — a moving dependency for a
  small app that already has a working Android build.

**Conservative label for the table:** the free-tier status of Google's TWA
program is **unverified offline**; treat it as a paid Play service until
confirmed at submission time.

### If we later switch, the steps are:

- Publish `https://maps.karamahcollective.com/.well-known/assetlinks.json`
  mapping the Play app ID to the origin (add it to the Cloudflare Pages `_headers`/static route for `Maps/`), then point the Play listing at the origin.
- Run `npx bubblewrap init --manifest https://maps.karamahcollective.com/manifest.json`
  (or the current `@bubblewrap/cli` flow) to generate + validate the TWA package; keep `bubblewrap` purely in CI, never in the app repo.
- Re-file the Play data-safety + content-rating forms for the TWA listing and
  confirm the app's auth flows (Firebase redirect) still pass under the TWA
  sandbox — verify with a manual install before inviting beta testers.

---

## Appendix — facts verified on disk (2026-10-01)

- `@bubblewrap/cli@1.25.0` is the latest published version (npm registry,
  checked live); it is free/open-source and validates manifests + generates TWA
  projects. The *Google Play TWA service* is the paid/verifiable-at-time
  component.
- `Maps/android/capacitor.settings.gradle` lists `capacitor-app`,
  `capacitor-geolocation`, `capacitor-share`; `Maps/ios/App/App/capacitor.config.json`
  mirrors the same package list — three plugins installed, none scalar.
- `Maps/android/app/build.gradle` version: `versionCode 1`, `versionName "1.0"`.
- `Maps/dist` on disk ~14 MiB; exact APK size is a build-time output, not
  computed here.
- `Maps/src/config.js` loads `./config.local.js` (dev, gitignored) then falls
  back to `fetch("/api/config")`, and finally to committed defaults — the
  Capacitor bundle runs on the defaults, which are correct for production.
- Firebase Web SDK (Google + generic OAuth for Microsoft/Apple + Facebook +
  email/password) confirmed in `Maps/src/auth.js`; `FIREBASE_CONFIG`'s
  `authDomain: halal-map-karamah.firebaseapp.com`.
- No app-specific `assetlinks.json` exists anywhere in the repo today; the
  origin `https://maps.karamahcollective.com` is the production Maps domain
  (per `DEPLOYMENT.md` line 89).