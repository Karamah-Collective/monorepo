# Service catalogue and integrations

This catalogue records the external services, Cloudflare products, and supporting runtimes actually used by the Karamah Collective platform. It is the answer to: what does this provider do, which application calls it, where does its configuration live, and what must happen if it fails?

Read [Platform architecture](PLATFORM_ARCHITECTURE.md) for application boundaries and [Data, identity, and security](DATA_IDENTITY_SECURITY.md) for the trust model.

## Cloudflare: delivery, runtime, data, and abuse protection

Cloudflare is the platform substrate. Each workspace—Maps, Website, Admin, Links, and Forms—is a separately deployed Cloudflare Pages project. Pages serves static assets from each workspace’s `dist` output and discovers dynamic handlers in the matching `functions/` folder. This separation gives every product its own domain, build, deployment history, configuration, bindings, and availability signal.

Pages Functions run in the Workers-style V8 runtime, not a long-running Node server. A function receives a web-standard request and Cloudflare environment bindings, then can return a response, query D1, access R2, verify a token, or call a provider. Do not rely on local disk, `process`, Node server APIs, or durable in-memory state.

### Cloudflare D1

D1 is the SQLite-compatible database used through server-side bindings. `halal-finder-db` is reserved for Manarah maps, moderation, map settings, and map analytics lookups. `karamah-admin-db` owns shared Admin control-plane data for Website, Links, access/roles, inbox/Gmail, MCP, reports, and audit records. `forms-db` is dedicated to form definitions, immutable versions, submissions, answers, file metadata, assets, and collaborators. Browser code never connects directly to D1.

Use prepared statements with bound parameters; schema changes are forward-only numbered migrations in `Maps/migrations/`. Production, Preview, and local environments must remain isolated. A deployed function can build successfully but still fail if its project has the wrong D1 binding, so verify the real product flow after binding changes.

### Cloudflare R2

R2 is private object storage. Maps binds `MEDIA` to `manarah-media`; Forms binds `MEDIA` to `forms-media`. D1 records business metadata while R2 holds binary objects. An object key is never a public URL by itself: a Pages Function decides whether a particular object may be read.

Forms distinguishes public presentation assets from private respondent uploads. The public media endpoint may return only intentional presentation assets. Do not make the bucket public or reuse an upload route as a public asset route.

### Cloudflare Turnstile

Turnstile protects applicable public submissions from automated abuse. A browser gets an ephemeral challenge token from a public site key; the server verifies it with `TURNSTILE_SECRET_KEY` through Cloudflare before accepting the protected write. Maps shares verification logic in `Maps/functions/_turnstile.js`; Forms obtains safe client configuration through its configuration flow and performs server-side verification.

The site key can be visible in the browser. The secret cannot. In production, an absent/failed verification must fail the protected action safely with a usable retry message; it must never silently become an allow-all path.

### Cloudflare Analytics GraphQL API

Maps’ analytics helper uses Cloudflare’s GraphQL Analytics API for traffic-level aggregates. It reads `CLOUDFLARE_ANALYTICS_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` only in a Pages Function, then returns a limited aggregate payload to Admin. Traffic analytics are an observation feature: a provider failure should show a bounded Admin warning, never break public products or expose account/token data.

## Firebase Authentication and Google identity

Firebase Authentication is the shared identity provider. Admin and appropriate public flows use the Firebase browser SDK for sign-in and obtain an ID token. Firebase web configuration is public by design; it identifies a project and is not equivalent to a service credential.

The edge function remains the security boundary. `shared/firebase-verify.mjs` verifies RS256 Firebase ID tokens with Google public keys in a Workers-compatible implementation, validates expected claims/project, and returns verified identity data. The owner API then makes the real permission decision from current roles, collaboration, ownership, and resource state.

Client-side `AuthGuard`, hidden navigation, or a known UID are not authorization. They improve the interface but cannot stop a modified browser from calling an endpoint. Provider enablement and authorized domains are Firebase-console policy; adding a sign-in method requires checking both client flow and server-side policy.

## Product and operational analytics

### PostHog

PostHog supplies product/event-oriented Manarah analytics. Maps server-side analytics code queries it with `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, and optional host configuration, then exposes aggregate feature-use data to Admin. PostHog answers questions such as discovery actions, searches, place views, category interest, or entry modes.

### Cloudflare Analytics

Cloudflare Analytics answers a different question: edge traffic/request behaviour. It should not be expected to equal PostHog, because their bot filtering, event timing, caching, blockers, identity, and aggregation definitions differ. Admin must label source and period rather than presenting independently produced counts as one metric.

### UptimeRobot

UptimeRobot independently checks the Manarah and Forms web/API/D1 monitors. It is both the alerting source and the data source for Admin’s Analytics & Health System Health section. The browser never calls it directly. Admin calls the authenticated Maps Admin API; Maps calls UptimeRobot v3 using `UPTIMEROBOT_API_KEY`, safely transforms data, and caches it server-side for approximately three minutes.

The expected monitor names are `Manarah`, `Manarah API`, `Manarah D1`, `Forms`, `Forms API`, and `Forms D1`. That name mapping is code, not a cosmetic convention. Renaming a monitor requires updating `Maps/functions/_uptimerobot.js` in the same release.

UptimeRobot data is observational. Its UI may contain values/histograms unavailable in its API response. Admin must not invent unavailable timestamps or per-check histories. Component availability bars use a fixed 24-hour window for comparable meaning; selected range is clearly used for incident history.

## Transactional and compatibility services

### Brevo

Brevo provides transactional email for documented Website/Maps operational flows such as access/contact/report delivery. `BREVO_API_KEY` belongs only in the owning Pages project’s secret store. A browser never calls Brevo. Treat mail as an external side effect: define whether a record can be saved if delivery fails, provide a safe user response, and do not expose raw provider failures or recipient data.

### Google Sheets and Apps Script compatibility

The repository retains Google Sheets and Apps Script compatibility code for historic Website and Maps workflows. `Website/functions/_sheets.js`, `Website/reference/google_apps_script.js`, and Maps script/reference material may be operationally relevant during migration. The current platform direction is D1-backed content and owner APIs; do not start new product work with a spreadsheet unless a reviewed reason requires it.

Apps Script has independent deployment/versioning/configuration. A Pages deployment does not deploy an Apps Script project. If a flow uses shared secrets between a GitHub scheduled caller and a Pages endpoint, configure the values in each required runtime as documented—secrets do not automatically propagate between platforms.

## Manarah map, search, travel, and prayer providers

| Service | Role in Manarah | Integration guidance |
| --- | --- | --- |
| MapLibre GL | Browser map renderer | Imperative map/layer/event work lives in Maps modules; keep UI state boundaries clear. |
| OpenFreeMap | Vector map tiles/styles | A map style/tile failure should not expose internals or make unrelated product data invalid. |
| Nominatim | OSM geocoding/reverse geocoding | Use directory-first search, debounce and geographically constrain queries; respect rate limits. |
| Digitransit HSL/Waltti | Finnish transit routing/geocoding | Uses GraphQL and subscription configuration; route results are transient advice, not authoritative place data. |
| OSRM | Walk/cycle/drive routes | Normalize alternatives; gracefully show unavailable directions without breaking map discovery. |
| Transitous | Transit fallback | Communicate fallback quality/status rather than pretending it is the same local provider. |
| Aladhan | Prayer-time data | Preserve location/date assumptions and provide safe unavailable states on failure. |
| Google Maps links | Managed enrichment/location input | Treat share links as variable input, resolve safely server-side where designed, and respect provider/data policy. |

These integrations chiefly run in Maps browser modules such as `directions.js`, `search.js`, `map-init.js`, and `prayer.js`. They are enhancements around the core community directory. A failure should not corrupt place data or prevent the basic application from loading.

## Capacitor, native shells, and GitHub Actions

Capacitor packages the Manarah PWA into Android and iOS shells. The native projects use Capacitor plus App, Geolocation, and Share plugins. Web releases and app-store/native releases are separate processes: a Pages deployment does not update an installed native binary. Do not commit generated platform output, signing material, or downloaded native Firebase configuration.

GitHub Actions runs operational automation, including D1 backups. Action secrets are separate from Cloudflare Pages secrets. The D1 backup workflow requires constrained Cloudflare credentials and stores exports in a private R2 backup bucket according to the documented retention policy. D1 Time Travel is the first option for recent recovery; retained exports support longer-term recovery.

## Configuration ownership

| Configuration type | Correct owner |
| --- | --- |
| Pages build branch/root/output and production bindings | Cloudflare Pages project dashboard; documented in `DEPLOYMENT.md` |
| Server provider keys | Owning Pages project secret; ignored local `.dev.vars` for local testing |
| Browser-safe Firebase/project origins | Client/build configuration |
| GitHub scheduled workflow credentials | GitHub repository secrets/variables |
| Native Firebase configuration | Per-machine/native platform configuration, never committed |

Never put a server key in a `VITE_*` variable, a public JSON configuration route, a screenshot, or a browser request. After changing a secret/binding, redeploy the owning Pages project and verify its real path.

## Integration failure policy

| Category | Examples | Expected behaviour |
| --- | --- | --- |
| Integrity/security critical | D1 write, Firebase verification, Turnstile | Fail closed; do not accept ambiguous data. |
| Public enhancement | geocoding, route, prayer provider | Preserve the core product and offer safe unavailable/fallback state. |
| Observation | PostHog, Cloudflare Analytics, UptimeRobot | Never block product actions; show bounded Admin notice or safe stale/empty data. |
| Side effect | Brevo email | Follow documented persistence/retry policy; do not leak provider errors. |

Before adding a service, document its product owner, call site, data shared with it, public/secret configuration, rate/timeout/caching behaviour, failure experience, monitoring, and deployment setup. Update this catalogue and the owner app guide in the same change.
