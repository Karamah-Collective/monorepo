# Store Submission Assets — Google Play & App Store Connect Audit

**Status:** Phase 4 audit (release-eng). Facts verified on disk 2026-10-01.
No image assets were generated; this is a mapping of required store assets to
what exists today, sized per the stores' current published guidance (any spec
that could not be verified offline is marked "verify at submission time").
**Owner legend:** user = must be supplied/approved by the account-holder ·
worker = a release-eng/native shop step · CI = scriptable in the existing
GitHub Actions or the local Playwright project.

---

## 1. Google Play requirements

| Asset | Spec | Exists today? | Owner |
|---|---|---|---|
| **App icon** | 512×512, 32-bit PNG or JPEG, ≤ 1,024 KB, **no alpha** | **GAP — see note below** | user (master) → worker (raster pipeline) |
| **Feature graphic** | 1024×500 landscape, JPG/PNG ≤ 2 MB | **GAP** | user (marketing) |
| **Phone screenshots** (min 2, target 8) | 16:9 or 9:16, min 320 px | **PARTIAL — capability exists, no committed shots** | CI (Playwright) |
| **Promo video** (optional) | ~30–120 s, MP4/WebM | **GAP-sided (optional)** | user |
| **Privacy policy URL** | reachable HTTPS URL required | **PARTIAL — see note** | user |
| **Data-safety form** | declare collection/use categories | **PARTIAL — draft below** | worker + user approval |
| **Content rating questionnaire** | self-certified (e.g. "Everyday / General") | **GAP — needs filing** | user (in console) |
| **App category** | suggestion: "Maps & Navigation" (verify taxonomy at submission time) | **GAP — console input** | user |

### App icon note (placeholder → real gap)
The Android generated template ships a **placeholder `ic_launcher` raster set**
(`Maps/android/app/src/main/res/mipmap-*{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}` with
`ic_launcher.png`, `ic_launcher_round.png`, `ic_launcher_foreground.png`, plus
`drawable/ic_launcher_background.xml`). The Phase 0 icon decision (preference
log) defers store artwork to Phase 4: **the user is supplying a master icon**
(the brand master `Maps/docs/guide-images/icon.ico` exists). **However** — the
Phase 4 raster script `Maps/scripts/icons-from-master.mjs` currently **writes
corrupt PNGs** (see the Current-state table section III for the byte-level
finding). So the real gap for the Play icon is twofold: (1) run a **fixed**
icon pipeline against the user's master to produce a valid 512×512 no-alpha
store icon, and (2) make sure that same fix covers the native launchers.

### Privacy policy URL
Manarah's privacy policy today is an **in-app overlay fully inline in
`Maps/index.html`** ("Privacy Policy" overlay, ~line 1998; content is embedded,
nothing fetched) — there is **no Maps-hosted routing page** at
`maps.karamahcollective.com/privacy`. A separate **standalone page exists only
on the Website project** (`Website/privacy-policy.html`, listed in the Website
deploy allowlist in `tooling/deploy-agent.mjs`). **The store form wants a
reachable public HTTPS URL — the practical gap:** publish
`https://maps.karamahcollective.com/privacy` (as a static `Maps/` route) or
link the store form to `https://karamahcollective.com/privacy-policy.html`
before filing. Which canonical URL to use is a user/lead decision and a tiny
content-deploy step.

### Data-safety form — draft (to be confirmed by user)
Claimed categories, honest to what the code does (no inventing):
| Declaration | Status |
|---|---|
| Location — precise, **on explicit user action only** (locate-me, set home, save pin). Not continuous; **not stored server-side**, per the in-app privacy text ("never sent to our servers"). | declare: "Approximate location" in the consent-free sense or "Precise location" with the on-action caveat — *decide with counsel at filing* |
| Personal info — collected **only on voluntary account auth** via Firebase (Google/Microsoft/Facebook/email-password). Identity handled by Firebase; app stores a one-way email hash for sync. | declare: "Part of user profile creation" (auth) |
| Contact info — name/email/phone only from the voluntary contact form (delivered via Brevo, stored as email, not in D1). | declare if filing the full set |
| **Sensitive data** — none collected. Religious orientation inferred? No — the app never asks for or stores religion. Declare "not collected". | OK to declare "not collected" |
| Photos/videos — only review photos the user uploads to R2 (behind sign-in). | declare "photo uploads" (user-content) |
| Payment — none. Communications/advertising — none (no ads, no tracking pixels; Cloudflare Web Analytics counts visitors without personal data; third-party tile/routing/prayer APIs are client-side calls). | declare "not collected" for payment; "analytics" disclaimed as non-personal |

**Key messaging** to keep consistent between Play data-safety and App Store
privacy labels: *no ads, no tracking, no continuous location, no personal data
transmitted except what the user volunteers.*

### Content rating questionnaire
Play's questionnaire is self-certified with the filing. A single-purpose map
app with no simulated gambling, no explicit content, no IARC-weight answers
expects a low-complexity "General/Everyone" result — **filing is a manual
console step for the account-holder** (release-eng cannot authenticate).

---

## 2. App Store Connect requirements

| Asset | Spec | Exists today? | Owner |
|---|---|---|---|
| **App icon** (universal asset) | **1024×1024 PNG, opaque, no alpha** | **GAP** — master 1024-capable, current iOS asset is broken (see section III) | user (master) → worker |
| **Screenshots 6.5″/5.5″** | ≥ 1284×2778 effective portrait; provide 6.5″ (and 5.5″ for tablet tiers) | **PARTIAL — capability exists, no shots committed** | CI (Playwright) |
| **iPhone screenshots only minimum** | 1 of 6.5″ family usable to launch on iOS | same; first filing can be iPhone-only | CI |
| **Privacy nutrition labels** (location, login) | Apple App Store privacy questionnaire | **PARTIAL — draft below** | worker + user |
| **App preview video** (optional) | ~15–30 s, MP4 | GAP (optional) | user |
| **Description / keywords / URLs** | ~50 chars title, ~4000 desc, support URL | **PARTIAL** — copy from `mobile-captain`; support URL can be the site | user + lead |
| **Age rating** | IARC/Apple rating questionnaire | **GAP — manual filing** | user |

### Privacy nutrition labels — draft (Apple form)
| Label | Draft answer |
|---|---|
| **Location** | "Precise location" only via explicit user action (locate, save home/pin); area basis: Finland. Never logged to server; not tied to identity unless user chooses to sync their chosen home/pin (one-way hash). |
| **Login** | Optional, third-party (Firebase: Google/Microsoft/Facebook/email-password). Data synced:
favourites/saved-pins/visited/home-location plus review content — all behind that optional login. |
| **Contacts** | Name/email/phone from the voluntary contact form; sent to the org's mailbox via Brevo; not stored in the DB. |
| **Photos/Video** | Review photos the user uploads (sign-in required); stored privately in R2 and served only while the review is public. |
| **Analytics** | Cloudflare Web Analytics (visitor counts, no cookies/personal data). Disclose in the store's "Analytics" row as non-personal. |
| **No ads / no tracking / no purchases (in-app)** | Declare "not collected"/"none" — honest per the in-app privacy text. |

Apple's exact answer-set wording changes; use the drafts as the factual basis,
not as paste-in values — **verify at submission time.**

---

## 3. Current-state table (with byte-level verification)

### I. Web manifest icons (source of the PWA identity)
| File | Spec | Verified | Verdict |
|---|---|---|---|
| `Maps/dist/data/icons/icon-192.png` | 192×192 | ✓ proper PNG 192×192 RGBA | OK |
| `Maps/dist/data/icons/icon-512.png` | 512×512 | ✓ proper PNG 512×512 RGBA | OK |
| `Maps/dist/data/icons/favicon.png` | (site favicon) | ✗ **corrupt** — IHDR 0×0, zero length, un-inflatable | **GAP** |

### II. Android native launcher assets
| Path | File(s) | Verified | Verdict |
|---|---|---|---|
| `Maps/android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` + `_round.png` + `_foreground.png` | 48–192 px buckets | ✗ **all corrupt** — IHDR fields `w=0 h=0 bitDepth=8 colorType=6`, zero-length IHDR, un-inflatable IDAT | **GAP** |
| `Maps/android/app/src/main/res/drawable/ic_launcher_background.xml` | Android adaptive background | single solid color (expected) | PARTIAL — regenerable by fixed pipeline |
| `Maps/android/app/src/main/res/drawable-land-*/` … `splash.png` | android splash screens | present, default template | PARTIAL (template art OK to keep or replace) |

### III. iOS universal app icon
| File | Verified | Verdict |
|---|---|---|
| `Maps/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (universal 1024) | ✗ **corrupt** — identical degenerate IHDR (0×0), un-inflatable | **GAP** |

### IV. Playwright screenshot capability
`Maps/tests/playwright.config.js` defines phone projects with the exact form
factors store submissions expect: **Pixel 7** (412×839, Chromium), **Galaxy
S24** (360×780), **iPhone 15 Pro** (393×659, WebKit). The shareable marker is
that this suite **already captures device screenshots** (used for review
artifacts). To produce store screenshots a small Playwright spec that
`page.screenshot()`s route-views (list, place detail, directions, prayer times)
at these viewports is a clean CI job, including transparent/9:16 variants.
Capture at 2× for the 6.5″/5.5″ App Store minimums (≈ 1284×2778 effective).

### V. What the corrupted-file finding means
- `Maps/scripts/icons-from-master.mjs` (Phase 4 icon pipeline, written by a
  prior release-eng pass) is the **single source** that wrote all three broken
  sets. Its master decode, PNG writer, and raster-array handling need a
  before-shipping fix (the writer emits an IHDR chunk with byte-length `0` and
  CRC `0`). The master source `Maps/docs/guide-images/icon.ico` (432 KB,
  256×256 32bpp entry) exists and the script's ICO decoder lines (65–98)
  are plausible — the failure is in the PNG/array path, and the script's own
  `pngEncode`/`chunk`/`downscale` chain is the likely fault. Because the file
  state is authoritative (the *known-good* `icon-512.png` 512×512 was NOT
  produced by this script), **treat every generated raster as untrustworthy**
  until a fixed script is run and re-verified. This is the literal **#1
  blocking gap** for both stores' icon slots.

### VI. Asset ownership map
| Asset | Owner | Notes |
|---|---|---|
| Master brand icon (user Master) | user → worker raster | fix + rerun icons-from-master; then `npx cap sync` |
| Feature graphic / promo video / marketing shots | **user** (needs a designer or the brand kit) | no invented copy — pull from `mobile-captain` |
| Store screenshots | **CI** (Playwright fills the gap) | see section IV |
| Privacy policy public URL | **user/lead** | deploy on Maps origin first |
| Data-safety / privacy-label / age-rating questionnaire answers | worker drafts + **user files in consoles** | drafts in sections 1–2 |
| App category / keywords / descriptions | lead (copy from `mobile-captain`) → user files | — |

---

## 4. Privacy declarations gap list (honest, no invented data use)

- **Location.** Only on explicit user actions (locate-me, set home, save pin).
  Precise, Finland-basis. Never logged server-side; not tied to identity unless
  the user opts into account sync (then only the *chosen* home/pin coords are
  synced). Compass/heading listeners exist in the web layer but only drive
  on-screen UI; verify how to characterize "compass" on the store forms
  (it is on-device orientation data, no network path).
- **Login / identity.** Firebase Auth (third-party). Email-password involves
  password handling *by Firebase*, never stored by us; account links use a
  one-way email hash. Users can use the app fully without an account.
- **No ads / no tracking / no purchases.** No advertising SDKs, no analytics
  pixels, no in-app purchases, no affiliate data. Cloudflare Web Analytics is
  visitor-count analytics only (no cookies/personal data) — declared as
  analytics, not tracking.
- **Forms.** Suggest-a-place is anonymous; contact form collects name/email/
  optional phone (Brevo-transmitted, not DB-stored). Review uploads are
  user-authenticated content stored in R2.
- **Children.** Policy text (in-app) states the service is not directed at
  under-16s and does not knowingly collect from them — carry the same through
  the store content-rating answers.
- **Third-party services in the privacy narrative** (Digitransit, Transitous,
  OSRM, Nominatim, OpenFreeMap, Esri, AlAdhan, MapLibre, Firebase, Brevo) are
  already documented in the in-app policy — the store "third parties" row
  should list the user-visible ones (Firebase Auth, Brevo) and mention the
  map-data APIs as data providers, with the org taking responsibility. File
  consistent between Play data-safety and Apple labels.

---

## 5. Suggested next steps (release-eng)

1. **Fix `Maps/scripts/icons-from-master.mjs`** (PNG writer bug) and rerun,
   then re-verify every raster (IHDR 13-byte length, nonzero dimensions,
   inflatable IDAT) and `npx cap sync` into the shells — unblocks the single
   strongest store-asset gap.
2. Decide the **canonical public privacy URL** (Maps origin vs.
   karamahcollective.com) — required to file either console.
3. Add a **Playwright store-shot spec** (reuse Pixel 7 / Galaxy S24 /
   iPhone 15 Pro projects) so CI can emit 16:9 / 9:16 screenshots on demand.
4. Have the user file the Play and Apple questionnaire answers from the drafts
   (account-holder-only step).

*All speculative store limits (512 KB/1 MB icon caps, 1024×500 feature graphic,
6.5″/5.5″ screenshot min-size, promo-video format) are per current public
guidance; confirm exact numbers inside each console at submission time.*