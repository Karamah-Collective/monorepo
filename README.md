# Halal Finder Helsinki

> An interactive map for discovering halal-friendly locations across Helsinki — mosques, restaurants, shops, and more — with real-time transit directions, prayer times, and a fully automated test suite.

**Live App** → deployed via Cloudflare Pages · **Stack** → MapLibre GL + Vanilla JS ES Modules · **Tests** → 1005 Playwright tests across Desktop Chrome · Pixel 7 · Galaxy S24 · iPhone 15 Pro

---

## Table of Contents

1. [Features](#1-features)
2. [Project Structure](#2-project-structure)
3. [Quick Start](#3-quick-start)
4. [Configuration & API Keys](#4-configuration--api-keys)
5. [Automated Tests](#5-automated-tests)
6. [Architecture Deep-Dive](#6-architecture-deep-dive)
7. [Data Guide](#7-data-guide)
8. [Design System](#8-design-system)
9. [Deployment (Cloudflare Pages)](#9-deployment-cloudflare-pages)
10. [Contributing](#10-contributing)
11. [Troubleshooting](#11-troubleshooting)
12. [API Reference](#12-api-reference)

---

## 1. Features

### Map & Navigation
- **Vector map** powered by MapLibre GL 3 with OpenFreeMap tiles and a custom HSL colour style
- **Real-time location** tracking via the browser Geolocation API
- **URL-based state** — the map view persists in the URL hash (`#zoom/lat/lng`) so links always open at the right position
- **3D terrain toggle** and satellite / default style switcher
- **First-run tutorial** — a 10-step interactive spotlight tour that guides new users through every feature

### Place Discovery
- **27 verified halal-friendly locations** across Helsinki (2 mosques, 14 shops, 11 restaurants) — continuously growing
- Filter by **place type** (All · Mosque · Restaurant · Shop)
- Granular **tag filtering** per type (e.g. halal-certified, cash-only, delivery, etc.)
- **Favourites** — saved locally via `localStorage`
- **Suggest a place** or **suggest an edit** with a built-in form (powered by Google Apps Script + Sheets)
- **Contact form** — reach the team directly with name, email, and message (reCAPTCHA-protected, stored in Google Sheets)
- **One-tap directions** from any place card or popup

### Search
- Full-text geocoding via **Nominatim** (bounded to Helsinki metro area)
- **Digitransit** autocomplete for transit-aware search
- Dropped pins via **double-click** on the map with save / share / directions options
- Share any location via the Web Share API or clipboard copy

### Directions & Routing
- **4 travel modes**: Transit (bus/tram/metro/train/ferry), Walking, Cycling, Driving
- **Transit routing** via HSL Digitransit GraphQL API with Transitous (MOTIS v2) as community fallback
- **Walk / Cycle / Drive** routing via OSRM (OpenStreetMap Routing Machine)
- Depart now · Depart at · Arrive by time pickers
- Expandable leg-by-leg step details with route numbers and zone badges
- **Interactive pick mode**: tap the map to set origin or destination

### Prayer Times
- Current and next prayer times via the **Aladhan API** (auto-detects location)
- Live countdown to next prayer
- **Ramadan mode** — detected automatically, shows Ramadan card with Suhoor/Iftar times
- "Find nearest mosque" shortcut in the prayer snack

### Developer Quality of Life
- **611 automated Playwright tests** covering DOM structure, data integrity, every UI interaction, animations, mobile touch gestures, and more — run them after any edit across Desktop Chrome, Mobile Chrome, and iPhone 12 (Safari/WebKit)
- Full **design system** with CSS custom properties (design tokens) documented in `docs/DESIGN_SYSTEM.md`
- No build step required — pure ES modules served directly

---

## 2. Project Structure

```
halal-finder/
│
├── index.html                     # Single-page app shell (~1 170 lines)
├── package.json                   # npm scripts — tests only; app has zero runtime deps
├── playwright.config.js           # Playwright E2E test configuration
│
├── data/                          # Static data (checked into git)
│   ├── places.json                # 27 halal locations with tags and coordinates
│   ├── tags.json                  # Tag definitions per place type
│   └── thumbs/                    # Optional place thumbnail images
│
├── src/                           # Application source — all ES modules
│   ├── app.js                     # Entry point (bootstrap + map load handler)
│   ├── config.js                  # Resolves API keys from local or injected config
│   ├── config.local.js            # YOUR API keys — git-ignored, NEVER commit
│   ├── config.template.js         # Template — copy this to config.local.js
│   ├── map-init.js                # Singleton MapLibre map instance
│   ├── map-controls.js            # Locate, style switcher, 3D, URL hash, tab management
│   ├── map-style.js               # Full MapLibre GL vector tile style definition
│   ├── icons.js                   # SVG helpers, PLACE_CONFIG, transit colours, marker HTML
│   ├── utils.js                   # Toast, sheet drag, clipboard, haversine, crypto helpers
│   ├── places.js                  # Places: markers, popups, sheet UI, favourites, tag filters
│   ├── search.js                  # Search bar, geocoding, dropped pins, search markers
│   ├── contact.js                 # Contact form overlay, reCAPTCHA submit
│   ├── directions.js              # All routing: transit + OSRM + panel UI + step rendering
│   ├── prayer.js                  # Prayer times, Ramadan detection, snack UI
│   ├── transit-stops.js           # Transit stop layer (cache -> Overpass API fallback)
│   ├── tutorial.js                # First-run 10-step spotlight tutorial
│   └── styles/
│       ├── design-tokens.css      # All CSS custom properties — single source of truth
│       └── styles.css             # Component layout + unique overrides (imports tokens)
│
├── tests/                         # Playwright automated test suite
│   ├── helpers.js                 # Shared fixtures: API mocking, app loading, helpers
│   ├── 01-dom-elements.spec.js    # DOM structure — every element, ID, and attribute
│   ├── 02-data-integrity.spec.js  # places.json + tags.json validation
│   ├── 03-search.spec.js          # Search expand/collapse, geocoding, results, clear
│   ├── 04-map-controls.spec.js    # Zoom, style picker, home button, URL hash
│   ├── 05-animations.spec.js      # CSS transitions, sheet slides, tab states, toast
│   ├── 06-places.spec.js          # Places sheet, filtering, favourites, popups
│   ├── 07-directions.spec.js      # Directions panel, modes, pick mode, autocomplete
│   ├── 08-prayer-times.spec.js    # Prayer snack, times, Ramadan card
│   ├── 09-tutorial.spec.js        # Tutorial flow, steps, localStorage persistence
│   ├── 10-suggest-edit.spec.js    # Suggest/edit overlays, forms, tag chips
│   └── 11-pin-markers.spec.js     # Search markers, dropped pins, save, remove
│
├── docs/                          # Extended documentation
│   ├── DESIGN_SYSTEM.md           # CSS token reference, templates, component rules
│   ├── FORMS_SHEETS_SETUP.md      # Google Forms/Sheets integration for suggestions
│   └── SECRETS_SETUP.md           # How to obtain and configure all API keys
│
├── scripts/                       # Build and utility scripts
│   ├── build-secrets.js           # Injects env vars into config.js for Cloudflare Pages
│   ├── build-cache.js             # Regenerates transit-cache.json from Overpass API
│   ├── check_places_osm.py        # Validates places against OpenStreetMap data
│   ├── strip-comments.py          # Strips JS comments for production
│   └── transit-cache.json         # Generated cache (3.1 MB) — git-ignored
│
├── lib/                           # Vendored libraries (no CDN dependency)
│   ├── maplibre-gl.js             # MapLibre GL 3 (local copy)
│   └── maplibre-gl.css            # MapLibre GL styles
│
└── apps-script/                   # Google Apps Script backend (place submissions + contact)
    ├── Code.gs                    # Handles form submissions -> Google Sheets (new, edit, contact)
    └── appsscript.json            # Apps Script manifest
```

> Files `config.local.js` and `transit-cache.json` are git-ignored. Never commit them.

---

## 3. Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 16+ | Running tests and build scripts |
| A modern browser | Chrome 90+, Firefox 88+, Safari 14+ | Running the app |
| Git | Any | Version control |

### Step 1 — Clone and install

```bash
git clone https://github.com/Karamah-Collective/halal-finder.git
cd halal-finder
npm install
```

`npm install` only installs dev dependencies (Playwright + `serve`). The app itself has **zero runtime npm dependencies** — it runs as plain HTML/JS/CSS.

### Step 2 — Set up your API keys

```bash
cp src/config.template.js src/config.local.js
```

Open `src/config.local.js` and fill in your keys. At minimum you need a **Digitransit API key** for transit routing. See [Configuration & API Keys](#4-configuration--api-keys) for details.

### Step 3 — Serve locally

The app must be served over HTTP (not opened as a `file://` URL) because it uses ES modules.

```bash
# Recommended — same port the test suite uses
npx serve . -l 4173

# Or Python 3
python -m http.server 8080

# Or VS Code Live Server (click "Go Live" in the status bar)
```

Open **http://localhost:4173**. The map should load with place markers visible within a few seconds.

### Step 4 — Verify everything works

```bash
npm test   # Should show 608 passed, 3 skipped, 0 failed
```

---

## 4. Configuration & API Keys

### How the config system works

```
Local development:        src/config.local.js  (you create this, git-ignored)
                                 ↓
                          src/config.js  (imports from config.local.js)
                                 ↓
                          All source modules import from src/config.js

Production (Cloudflare):  Cloudflare env vars
                                 ↓
                          build-secrets.js  generates  src/config.js
                                 ↓
                          Same modules, same imports
```

### Required configuration keys

| Key | Where to get it | Required? |
|-----|----------------|-----------|
| `DT_API_KEY` | [digitransit.fi/developers](https://digitransit.fi/en/developers/) → Register → API key | Yes — transit routing |
| `DIGITRANSIT_URL` | Fixed value — see template | Yes |
| `TRANSITOUS_URL` | Fixed value — see template | Yes |
| `NOMINATIM_REV` | Fixed value — see template | Yes |
| `NOMINATIM_VB` | Fixed value — see template | Yes |
| `RECAPTCHA_SITE_KEY` | [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin) | No — spam protection only |

### Example `src/config.local.js`

```javascript
// NEVER commit this file — it is git-ignored
export const DIGITRANSIT_URL    = "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1";
export const TRANSITOUS_URL     = "https://api.transitous.org/api/v5/plan";
export const DT_API_KEY         = "your-digitransit-api-key-here";
export const NOMINATIM_REV      = "https://nominatim.openstreetmap.org/reverse";
export const NOMINATIM_VB       = "24.0,60.8,25.8,59.8";
export const RECAPTCHA_SITE_KEY = "";   // leave blank if not using
```

For step-by-step instructions on getting each API key, see **[docs/SECRETS_SETUP.md](docs/SECRETS_SETUP.md)**.

---

## 5. Automated Tests

The project ships with a full **Playwright** end-to-end test suite across **three real browser projects**. Run it after any edit to catch regressions instantly.

### Running tests

```bash
# All 611 tests across Desktop Chrome + Mobile Chrome + iPhone 12
npm test

# Watch what the browser is doing
npm run test:headed

# Interactive Playwright UI — filter, rerun, inspect traces
npm run test:ui

# Single browser project
npm run test:desktop   # Desktop Chrome only
npm run test:mobile    # Pixel 7 (Android flagship, 412×839, Chromium)
npm run test:android   # Galaxy S24 (Android mid-range, 360×780, Chromium)
npm run test:iphone    # iPhone 15 Pro (393×659, WebKit/Safari)
npm run test:phones    # All 3 phone projects together
```

### What is tested

| File | Coverage | Count |
|------|----------|-------|
| `01-dom-elements` | Every HTML element, ID, aria-label, and initial hidden/visible state | 33 |
| `02-data-integrity` | places.json + tags.json schema, unique IDs, coordinate bounds | 14 |
| `03-search` | Expand/collapse, geocoding, result rendering, clear button, no-results | 10 |
| `04-map-controls` | Zoom in/out, style picker, home button, double-click pin, URL hash | 11 |
| `05-animations` | CSS transitions, sheet slide, tab active states, scrim, toast | 12 |
| `06-places` | Sheet open/close, type/tag filtering, favourites, localStorage, popups | 22 |
| `07-directions` | Panel open/close, all 4 travel modes, pick mode, autocomplete, swap | 14 |
| `08-prayer-times` | Prayer pill, countdown, 5 prayer names/times, Ramadan card | 13 |
| `09-tutorial` | All 10 steps, back/next/close, spotlight, localStorage persistence | 12 |
| `10-suggest-edit` | Suggest overlay, edit overlay, forms, tag chip cycling | 14 |
| `11-pin-markers` | Search markers, dropped pins, popups, save, remove | 12 |
| `12-mobile` ⬅ **phones only** | Touch gestures, sheet drag/dismiss/snap, drag handles, mobile CSS sizes, prayer pill, search, tab tap targets ≥44px, style picker, filter chips, scrim, zoom controls, suggest overlay | 99 |
| **Total** | Desktop Chrome · Pixel 7 · Galaxy S24 · iPhone 15 Pro | **1005** |

**Project structure:**
- **Desktop Chrome** — runs specs 01–11
- **Pixel 7** (Android flagship, 412×839, Chromium) — runs specs 01–12
- **Galaxy S24** (Android mid-range, 360×780, Chromium) — runs specs 01–12
- **iPhone 15 Pro** (WebKit/Safari, 393×659) — runs specs 01–12 (WebKit-incompatible specs excluded)

### How the tests work

Tests spin up a **live local HTTP server** (port 4173) automatically. All external API calls are **intercepted and mocked** so tests are fast, deterministic, and work fully offline.

Mocked services (configured in `tests/helpers.js`):

| Service | What the mock returns |
|---------|-----------------------|
| Aladhan (prayer API) | Fixed 5 prayer times, month 1 (not Ramadan) |
| Digitransit geocoding | A single fake "Test Place, Helsinki" result |
| Nominatim reverse geocoding | "Test Street, Helsinki" |
| ipwho.is / ipapi.co | `{ country_code: "FI" }` |
| Google reCAPTCHA | Blocked (aborted) |

### Reading test results

```bash
# After a test run, open the HTML report with screenshots and videos
npx playwright show-report
```

Each failure shows:
- A **screenshot** at the moment of failure
- A **video** of the full test interaction
- The exact **error message** and failing line number

### Adding new tests

1. Create `tests/13-my-feature.spec.js`
2. Import helpers at the top:
   ```javascript
   const { test, expect, setupApp } = require("./helpers");
   ```
3. Use `setupApp(page)` in `beforeEach` — this skips the tutorial and loads the app
4. Mock any new external APIs in `beforeEach` using `page.route()`
5. Follow the existing spec files as patterns

---

## 6. Architecture Deep-Dive

### Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Map engine | MapLibre GL 3 (vendored in `lib/`) | No CDN dependency |
| Language | Vanilla JS, ES Modules | Zero framework overhead |
| Styling | CSS custom properties | Runtime theming, no preprocessor |
| Transit routing | HSL Digitransit GraphQL | Primary |
| Walk/cycle/drive | OSRM REST API | Open-source, no key needed |
| Hosting | Cloudflare Pages | Free, global CDN, env vars at build |
| Testing | Playwright (Desktop Chrome · Pixel 7 · Galaxy S24 · iPhone 15 Pro WebKit) | True E2E across 4 real browsers |

### Module dependency map

```
index.html
  └── src/app.js  (type="module")
        ├── map-init.js        creates the MapLibre map instance
        │     └── config.js
        ├── map-controls.js    locate, style, 3D, tab management
        │     ├── map-init.js
        │     └── utils.js
        ├── places.js          markers, sheet, favourites, filtering
        │     ├── map-init.js, icons.js, utils.js
        │     └── directions.js  (cross-import — see note below)
        ├── search.js          search bar, geocoding, pins
        │     ├── map-init.js, config.js, utils.js
        ├── contact.js         contact form overlay + submit
        │     └── config.js, utils.js
        ├── directions.js      all routing + panel UI
        │     ├── map-init.js, config.js, utils.js, icons.js
        │     └── places.js  (cross-import — see note below)
        ├── prayer.js          prayer times, Ramadan, snack UI
        │     └── config.js, utils.js
        ├── transit-stops.js   transit stop layer
        │     └── map-init.js, config.js
        └── tutorial.js        first-run tour
              └── utils.js
```

> **Cross-import note:** `places.js` and `directions.js` import each other. This is intentional and safe — all cross-module calls happen inside event handlers (not at module evaluation time), so ES module live bindings resolve correctly.

### State management

No central store — each module owns its own state:

| Module | Owns |
|--------|------|
| `places.js` | `placesData`, `activeTypeFilter`, `activeTagFilters`, favourites in `localStorage` |
| `directions.js` | `dir` object — origin, destination, travel mode, active route |
| `search.js` | Active search marker reference |
| `prayer.js` | Prayer times cache, countdown interval |
| `map-controls.js` | Current map style, active tab |
| `tutorial.js` | Current step, `localStorage` done-flag |

### Page load sequence

```
1. index.html parses → src/app.js runs
2. MapLibre map initialises (map-init.js)
3. map "load" event fires
4. places.js  →  fetches data/places.json + tags.json  →  renders markers
5. transit-stops.js  →  reads transit-cache.json  →  renders stop layer
6. prayer.js  →  calls Aladhan API  →  renders prayer snack
7. search.js  →  activates search bar
8. tutorial.js  →  checks localStorage  →  shows tour if first visit
9. map-controls.js  →  reads URL hash  →  flies to stored position
```

---

## 7. Data Guide

### Adding or editing a place

Edit `data/places.json`. Each entry follows this schema:

```json
{
  "id": 28,
  "name": "My Restaurant",
  "type": "restaurant",
  "address": "Mannerheimintie 10, 00100 Helsinki",
  "lat": 60.1695,
  "lng": 24.9354,
  "tags": {
    "halal_cert": true,
    "vegetarian": false,
    "delivery": true
  }
}
```

| Field | Type | Required | Notes |
|-------|------|---------|-------|
| `id` | integer | Yes | Must be unique across all places |
| `name` | string | Yes | Display name on map and in list |
| `type` | string | Yes | One of: `mosque`, `restaurant`, `shop` |
| `address` | string | Yes | Full street address |
| `lat` / `lng` | float | Yes | WGS-84 degrees (Helsinki ~60°N, 25°E) |
| `tags` | object | No | Keys must match tag IDs in `tags.json` for this type |
| `notes` | string | No | Extra info shown in popup |

### Place types and their colours

| Type | Marker colour | Tag category in `tags.json` |
|------|--------------|----------------------------|
| `mosque` | Green (`--success`) | mosque tags |
| `restaurant` | Blue (`--accent`) | restaurant tags |
| `shop` | Orange (`--hsl-trunk`) | shop tags |

### Tag definitions (`data/tags.json`)

```json
{
  "restaurant": [
    { "id": "halal_cert", "label": "Halal certified" },
    { "id": "vegetarian", "label": "Vegetarian options" }
  ],
  "shop": [
    { "id": "halal_meat", "label": "Halal meat" }
  ]
}
```

Rules:
- Tag IDs must be unique within each type
- Tag values in `places.json` must be `true` or `false`
- After editing either file, run `npm test` to verify data integrity

### Regenerating the transit stop cache

```bash
node scripts/build-cache.js
```

Takes ~30 seconds, writes ~3 MB to `scripts/transit-cache.json`. The file is git-ignored.

### Validating places against OpenStreetMap

```bash
python scripts/check_places_osm.py   # requires Python 3 + requests
```

---

## 8. Design System

All visual design is driven by CSS custom properties. Two files, strict responsibilities:

| File | Owns | Never touches |
|------|------|--------------|
| `src/styles/design-tokens.css` | All `--tokens`, template button/chip/pill classes | Layout, positioning, z-index |
| `src/styles/styles.css` | Component layout, `position`, `z-index`, unique overrides | Hard-coded colours or px values |

**Golden rule:** before writing any visual style in `styles.css`, check if a template class in `design-tokens.css` already covers it.

### Quick token reference

| Group | Key tokens |
|-------|-----------|
| Brand | `--accent` (blue) · `--gold` (prayer) · `--success` (green/mosque) · `--danger` (red) |
| Surfaces | `--surface` · `--surface-2` · `--surface-3` · `--text` · `--text-2` · `--border` |
| Radii | `--r-xs` (6px) → `--r-xl` (24px) · `--r-pill` (999px) |
| Shadows | `--shadow-sm` · `--shadow-md` · `--shadow-lg` |
| Spacing | `--space-1` (4px) → `--space-8` (32px) |
| Transitions | `--transition-fast` (150ms ease) · `--transition-base` (250ms ease) |

Dark mode is CSS-only: `@media (prefers-color-scheme: dark)` overrides surface and text tokens. No JavaScript required.

For the complete token catalogue and component template reference, see **[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)**.

---

## 9. Deployment (Cloudflare Pages)

### First-time setup

1. **Push to GitHub** — make sure `config.local.js` is in `.gitignore` (it is by default)

2. **Create a Cloudflare Pages project:**
   - Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
   - Select `halal-finder`
   - Build command: `node scripts/build-secrets.js`
   - Build output directory: *(leave blank — whole repo is served)*

3. **Add environment variables** (Settings → Environment variables → Production):

   | Variable | Value |
   |----------|-------|
   | `DIGITRANSIT_URL` | `https://api.digitransit.fi/routing/v2/hsl/gtfs/v1` |
   | `TRANSITOUS_URL` | `https://api.transitous.org/api/v5/plan` |
   | `DT_API_KEY` | *your Digitransit key* |
   | `NOMINATIM_REV` | `https://nominatim.openstreetmap.org/reverse` |
   | `NOMINATIM_VB` | `24.0,60.8,25.8,59.8` |
   | `RECAPTCHA_SITE_KEY` | *your reCAPTCHA key (optional)* |

4. **Deploy** — Cloudflare auto-deploys on every push to `main`. The `build-secrets.js` script reads env vars and writes `src/config.js` during the build.

### Subsequent deploys

```bash
git add .
git commit -m "feat: add new restaurant"
git push   # Cloudflare picks this up automatically
```

### How `build-secrets.js` works

At build time, Cloudflare runs `node scripts/build-secrets.js`. This reads `process.env` and generates `src/config.js` with the same shape as `config.local.js`. The rest of the app imports from `config.js` in both environments — no code difference.

For comprehensive deployment security guidance, see **[docs/SECRETS_SETUP.md](docs/SECRETS_SETUP.md)**.

---

## 10. Contributing

### Before you start

- Check [open issues](https://github.com/Karamah-Collective/halal-finder/issues) to avoid duplicate work
- For significant changes, open an issue to discuss the approach first

### Workflow

```bash
git checkout -b feat/your-feature-name
# Make changes...
npm test                          # Must pass before submitting
git add .
git commit -m "feat: description of change"
git push origin feat/your-feature-name
# Open a Pull Request on GitHub
```

### Code conventions

- **Indentation:** 2 spaces
- **Variables:** `camelCase` · **Constants:** `UPPER_CASE`
- **Functions:** descriptive verb-noun (`showPlacePopup`, `buildRouteHTML`)
- **CSS:** always use design tokens — never hard-code a colour or pixel value
- **No new runtime dependencies** — keep the zero-dependency philosophy

### Adding a new UI feature checklist

- [ ] HTML in `index.html` using existing naming conventions (`#feature-name`, `.feature-btn`)
- [ ] JS in a new `src/feature.js` module or extension of an existing one
- [ ] Imported in `src/app.js`
- [ ] Styled in `styles.css` using tokens from `design-tokens.css`
- [ ] Tests in `tests/12-feature.spec.js`
- [ ] Token additions (if any) documented in `docs/DESIGN_SYSTEM.md`

### Adding a new place

Edit `data/places.json` (see [Data Guide](#7-data-guide)), run `npm test` to validate, then open a PR.

### Bug reports

Please include:
- Browser + version (e.g., Chrome 122, Mobile Safari 17)
- Device (desktop Windows 11, iPhone 15, etc.)
- Steps to reproduce
- Expected vs actual behaviour
- Console errors (screenshot or paste)

---

## 11. Troubleshooting

### Map shows a blank grey screen

1. Open browser DevTools → Console — look for red errors
2. Make sure you are serving over HTTP, not opening `index.html` directly as `file://`
3. Verify `src/config.local.js` exists and has all required keys
4. Quick tile check (paste into browser DevTools console):
   ```javascript
   fetch("https://tiles.openfreemap.org/planet/20240830_043106_pt/0/0/0.mvt")
     .then(r => console.log("Tiles:", r.status))
     .catch(e => console.error("Tiles failed:", e));
   ```

### Routing returns no results

1. Confirm `DT_API_KEY` is valid — test it directly:
   ```bash
   curl -X POST "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1" \
     -H "Content-Type: application/json" \
     -H "digitransit-subscription-key: YOUR_KEY" \
     -d "{\"query\":\"{ plan(from:{lat:60.17,lon:24.94},to:{lat:60.20,lon:24.95},date:\\\"20260301\\\",time:\\\"120000\\\",numItineraries:1){itineraries{duration}}} }\"}"
   ```
2. Ensure start and end points are within the Helsinki metro area
3. Try walk/cycle/drive mode — these use OSRM and need no API key

### Search returns no results

Nominatim rate-limits to ~1 req/sec per IP. The bounding box constrains results to Helsinki by design. Test it directly:
```
https://nominatim.openstreetmap.org/search?q=mosque+helsinki&format=json
```

### Prayer times not loading

The Aladhan call uses IP-geolocation for coordinates. If you are behind a VPN your IP may resolve outside Finland. The app falls back to Helsinki coordinates if the lookup fails, which should recover automatically.

### Tests failing unexpectedly

```bash
# Run just the failing file
npx playwright test tests/06-places.spec.js --reporter=line

# Run by test name (partial match)
npx playwright test -g "clicking search pill"

# View the HTML report with screenshots and video
npx playwright show-report
```

Common causes:
- **Port 4173 in use** — stop the other process, or change the port in `playwright.config.js`
- **Stale browser binary** — run `npx playwright install chromium`
- **Flaky timing** — tests have `retries: 1`; a single flake auto-retries. If it fails consistently, investigate the actual behaviour

---

## 12. API Reference

### External services

| API | Purpose | Key needed | Docs |
|-----|---------|-----------|------|
| HSL Digitransit | Transit routing (GraphQL) | Yes (free) | [digitransit.fi/developers](https://digitransit.fi/en/developers/) |
| Transitous (MOTIS v2) | Transit fallback | No | [transitous.org](https://transitous.org) |
| OSRM | Walk / cycle / drive routing | No | [project-osrm.org](http://project-osrm.org) |
| Nominatim | Geocoding + reverse geocoding | No (1 req/s) | [nominatim.org](https://nominatim.org) |
| Aladhan | Islamic prayer times | No | [aladhan.com/prayer-times-api](https://aladhan.com/prayer-times-api) |
| OpenFreeMap | Vector map tiles | No | [openfreemap.org](https://openfreemap.org) |
| ipwho.is / ipapi.co | Country detection (prayer times) | No | — |
| Google reCAPTCHA v3 | Form spam protection | Yes (free) | [developers.google.com/recaptcha](https://developers.google.com/recaptcha) |

### Cloudflare Functions (`functions/api/`)

Small serverless handlers that run on Cloudflare Pages — no separate deployment needed.

| Route | File | Purpose |
|-------|------|---------|
| `GET /api/config` | `functions/api/config.js` | Exposes non-secret config to client |
| `GET /api/geo` | `functions/api/geo.js` | IP geolocation proxy |
| `POST /api/submit` | `functions/api/submit.js` | Place suggestion form handler |

### Google Apps Script (`apps-script/Code.gs`)

The "Suggest a place" and "Suggest an edit" forms submit to a deployed Google Apps Script URL. The script validates the submission and appends a row to a Google Sheet for manual review. See **[docs/FORMS_SHEETS_SETUP.md](docs/FORMS_SHEETS_SETUP.md)** for setup instructions and the Google Sheet template.

---

## Quick command cheatsheet

```bash
# ── Development ────────────────────────────────────────────────────────────
npx serve . -l 4173                     # Serve the app locally

# ── Testing ────────────────────────────────────────────────────────────────
npm test                                # All 366 tests, headless
npm run test:headed                     # Tests with visible browser
npm run test:ui                         # Playwright interactive UI
npm run test:desktop                    # Desktop Chrome only
npm run test:mobile                     # Mobile Chrome (Pixel 5) only
npx playwright show-report              # Open last test HTML report
npx playwright test -g "search pill"    # Run tests matching a name

# ── Data ───────────────────────────────────────────────────────────────────
node scripts/build-cache.js             # Regenerate transit-cache.json (~30s)
python scripts/check_places_osm.py     # Validate places against OSM

# ── Deploy ─────────────────────────────────────────────────────────────────
git push                                # Triggers Cloudflare Pages deploy
node scripts/build-secrets.js          # (Runs automatically at deploy time)
```

---

## Version history

| Date | Change |
|------|--------|
| March 2026 | Added full Playwright test suite (366 tests, 11 spec files); tutorial module; suggest/edit overlays with Google Forms backend; deep-link / URL hash location sharing; transit-stop layer; first-run spotlight tutorial |
| 2025 | Initial release — map, places, search, directions, prayer times |

---

*Built with care for the Muslim community in Helsinki.*  
*Questions or issues? Open a [GitHub issue](https://github.com/Karamah-Collective/halal-finder/issues).*
