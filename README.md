# Halal Finder Helsinki

A community-driven Progressive Web App for discovering halal food, shops, and prayer spaces across Helsinki and Finland. Built with vanilla JavaScript ES Modules and MapLibre GL, deployed globally on Cloudflare Pages.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
  - [Map & Navigation](#map--navigation)
  - [Place Discovery & Filtering](#place-discovery--filtering)
  - [Search & Geocoding](#search--geocoding)
  - [Directions & Routing](#directions--routing)
  - [Turn-by-Turn Navigation](#turn-by-turn-navigation)
  - [Prayer Times & Qibla](#prayer-times--qibla)
  - [Eid Prayer Locations](#eid-prayer-locations)
  - [Community Features](#community-features)
  - [Progressive Web App](#progressive-web-app)
  - [Tutorial & Onboarding](#tutorial--onboarding)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Local Development Setup](#local-development-setup)
- [Configuration & Environment Variables](#configuration--environment-variables)
- [Backend (Cloudflare Functions & D1)](#backend-cloudflare-functions--d1)
- [Data Management](#data-management)
- [Service Worker & Caching](#service-worker--caching)
- [CSS & Design System](#css--design-system)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Overview

Halal Finder Helsinki is a mobile-first web application that helps the Muslim community in Helsinki and across Finland locate halal restaurants, grocery shops, mosques, prayer rooms, and cemeteries. The app provides:

- An interactive map with 76+ community-verified halal locations
- Real-time transit, walking, cycling, and driving directions
- Daily prayer times with Ramadan and Eid support
- A Qibla compass using the device magnetometer
- Community reviews with email OTP verification
- Offline capability through a service worker

The entire frontend is written in plain JavaScript with no framework. Zero runtime npm dependencies — the only libraries are MapLibre GL (loaded from a CDN) and Playwright (dev-only for testing).

---

## Features

### Map & Navigation

**MapLibre GL 3 vector map** using OpenFreeMap tiles with a fully custom style definition (`src/map-style.js`, 1 096 lines). The style includes:

- Background, water, landcover, landuse, buildings, roads, bridges, railways, and labels
- Zoom-dependent opacity and width interpolation for roads and labels
- One-way arrow symbols on appropriate road segments
- Administrative boundary rendering

**Map Styles** — four visual modes switchable via the style picker pill:

| Mode | Description |
|------|-------------|
| Light | Default clean light map |
| Dark | Full dark theme (also respects `prefers-color-scheme`) |
| Satellite | ArcGIS World Imagery raster tiles |
| Heatmap | Dynamic heatmap of halal-place density |

**3D Terrain** — toggleable via `map-controls.js`. Uses AWS terrain-dem raster tiles to extrude building heights and elevation.

**URL Hash Persistence** — the map state (`zoom/lat/lng`) is stored in the URL hash so direct links to specific locations work.

**Finland Mask** — a GeoJSON fill layer covers areas outside Finland to focus the experience.

**Map Controls:**

- Zoom in / zoom out buttons with disabled state at min/max zoom
- Locate button — requests browser geolocation, shows an accuracy circle, auto-centers the map
- Home marker — saves and restores a custom home location locally when signed out, or syncs it to the signed-in account
- Style picker — light, dark, satellite, heatmap radio buttons
- Heatmap toggle — dynamic place scoring visualization

---

### Place Discovery & Filtering

All halal locations are stored in `data/places.json` (76+ entries). Each place has a type, tags, coordinates, address, opening hours, and optional sponsor or boycott metadata.

**Place Types:**

| Type | Icon Color | Description |
|------|-----------|-------------|
| Mosque | Green | Full mosques with prayer hall |
| Prayer Room | Teal | Dedicated prayer spaces (offices, malls, etc.) |
| Restaurant | Orange | Halal food establishments |
| Shop | Purple | Halal groceries and butcheries |
| Cemetery | Grey | Muslim burial sites |

**Tag Filtering** — each type has its own set of granular capability tags:

*Mosques & Prayer Rooms:*
`5 Daily Prayers` `Jummah (Friday)` `Taraweeh` `Eid Prayer` `Janaza` `Quran Classes` `Sisters Section` `Sisters Wudu`

*Restaurants:*
`Halal Certified` `Fully Halal` `Partially Halal` `No Alcohol` `Halal Meat` `Delivery Available` `Cash Only`

*Shops:*
`Halal Meat` `Butchery` `Groceries` `Asian Products` `African Products` `Arab Products` `Halal Certified`

**Place Popups** — clicking any marker opens a card showing:
- Name, address, current open/closed status
- Opening hours for all days of the week
- Tags as visual chips
- Community rating (star average + review count)
- Sponsor badge if applicable
- Quick-action buttons: Directions, Share, Save to Favorites, Report

**Favorites** — users can star any place; saved locally when signed out and synced to the signed-in account when available. Favorites are accessible in the Places sheet under a Favorites filter.

**Sponsorship System** — places can have active sponsor badges tied to date ranges. A `boycott` flag on a place overrides any sponsor display.

**Opening Hours** — stored as a JSON object per place (`"mon": "09:00-22:00"`) and displayed with real-time open/closed status based on the current local time.

---

### Search & Geocoding

The collapsible search pill at the top of the screen provides:

**Geocoding Sources (in priority order):**

1. **Local places search** — instant filter against `placesData` by name, address, or type
2. **Nominatim (OpenStreetMap)** — forward geocoding bounded to the Helsinki metro area (`NOMINATIM_VB` bounding box)
3. **Digitransit** — transit-aware address autocomplete for Finnish addresses

**Dropped Pins** — any map tap during search pick-mode creates a dropped pin with:
- Reverse geocoding via Nominatim to get a human-readable address
- Save pin locally when signed out, or sync it to the signed-in account, with an optional name
- Share pin via Web Share API or clipboard (URL-encoded format)
- "Get Directions" shortcut from the pin popup

**Clear** — the × button clears the search input, hides results, and removes any temporary markers.

---

### Directions & Routing

The Directions panel is a bottom sheet that supports four travel modes and provides full routing with itinerary visualization.

**Travel Modes:**

| Mode | Backend | API |
|------|---------|-----|
| Transit | Digitransit HSL (Helsinki/Espoo/Vantaa) | GraphQL |
| Transit (fallback) | Digitransit Waltti (Turku/Föli region) | GraphQL |
| Transit (cross-regional) | Transitous (MOTIS v2) | REST |
| Walk | OSRM | REST |
| Cycle | OSRM | REST |
| Drive | OSRM | REST |

**Transit Routing (Digitransit):**
- Queries the HSL GraphQL API with origin, destination, departure/arrival time
- Renders per-route GTFS brand colors (tram red, metro orange, bus blue, train green, ferry teal)
- Shows zone badges and estimated fare information
- Automatically falls back to Waltti for Turku-area trips and to Transitous for inter-city routes

**Walk / Cycle / Drive Routing (OSRM):**
- Fetches alternative routes (up to 3) and renders them with opacity toggling
- Road corridor is highlighted along the selected route
- Speed and max-speed annotations from OSRM are used for ETA calculation

**Time Picker:**
- Depart Now (default) / Depart At / Arrive By via radio toggle
- Custom date/time via native `<input type="datetime-local">`

**Waypoints:**
- Up to 3 intermediate stops between origin and destination
- Tap "+" to enter pick mode; tap on the map to set the waypoint
- Remove individual waypoints with the × button

**Itinerary Rendering:**
- Expandable leg cards showing mode icon, start/end stops, times, and duration
- Transit legs show route number, all intermediate stops, arrival times, and zone info
- Walking legs show step-by-step turn instructions

**Route Visualization on Map:**
- Origin marker (green dot), destination marker (red pin)
- Route polyline in mode-specific color
- Alternative routes in lighter opacity
- Active step highlighting during navigation

**Origin/Destination Picking:**
- Click any marker or the map to set origin or destination in pick mode
- Reverse geocoding label appears immediately on tap
- "Use my location" button in the pick mode overlay
- "Nearest mosque" shortcut — scores mosques using prayer-context awareness (see Prayer Times)

**Route Sharing:**
- URL-encoded compact representation stored in `?r=` parameter
- Web Share API for native sharing on mobile; clipboard fallback on desktop

**Route Snackbar:**
- Compact summary card (duration, distance, departure time) visible when the full Directions sheet is collapsed

---

### Turn-by-Turn Navigation

A full voice + visual turn-by-turn navigator built on top of OSRM step data and the Web Speech API.

**Features:**
- Parses OSRM / OTP step maneuvers (turn left, continue, arrive, etc.)
- Announces upcoming maneuvers via `SpeechSynthesisUtterance`:
  - "In 200 metres, turn right onto Fleminginkatu"
  - "You have arrived at your destination"
- Highlights the current step's road segment on the map in real time
- Tracks user position via `watchPosition`; detects when the user is off-route
- Pause/resume without clearing the route
- Auto-dismiss when the destination geofence is entered
- **Mosque alert** — when arriving near a mosque during a prayer window, highlights the nearest mosque with a contextual notification

---

### Prayer Times & Qibla

**Prayer Times (`src/prayer.js`):**

- Fetches from the **Aladhan API** using the user's current latitude/longitude
- Displays all five daily prayers: Fajr, Dhuhr, Asr, Maghrib, Isha
- **Prayer Snack** — always-visible compact pill at the bottom showing:
  - The current/next prayer name
  - Live countdown (updates every minute)
  - Quick button to find the nearest contextually-appropriate mosque
- **Ramadan Mode** — automatically detected from Aladhan's Hijri month data:
  - Shows Suhoor (pre-dawn meal) time and Iftar (breaking fast) time
  - Ramadan card appears in the Places sheet
- **Friday handling** — Dhuhr is labelled "Jummu'ah" every Friday
- **Prayer-contextual mosque scoring** — when finding the "nearest mosque" the algorithm weights:
  - Friday + Dhuhr window → strongly prefers mosques with Jummah tag
  - Ramadan + Isha window → strongly prefers mosques with Taraweeh tag
  - Eid window → strongly prefers mosques with Eid Prayer tag
  - All other times → base distance scoring across all 5-daily-prayer mosques

**Qibla Compass (`src/qibla.js`):**

- Full-screen mobile overlay
- Uses `DeviceOrientationEvent` to read the device's magnetic compass heading
- Calculates the great-circle bearing to the Kaaba (21.4225°N, 39.8262°E) from the user's geolocation
- Applies a low-pass filter and renders at 60 fps via `requestAnimationFrame`
- Shows a "Locked" badge when the compass bearing is within 5° of Qibla
- Gracefully falls back to displaying the raw compass heading if device orientation permission is denied

---

### Eid Prayer Locations

A seasonal feature (`src/eid-prayers.js`) for listing outdoor Eid prayer venues across Helsinki.

- **Two-phase loading:**
  1. Immediately loads from a pre-cached static file (`data/eid-prayers.json`)
  2. Background fetch from `/api/eid-prayers` (Cloudflare Function → D1) to get any updates
- Filters entries so only future events are shown
- Renders distinct map markers separate from regular places
- **Banner** — a temporary dismissible notice when Eid locations are available
- **Share** — each Eid location can be shared via `?eid=<id>` URL parameter
- Data is managed in Cloudflare D1 via the admin API

---

### Community Features

**Reviews (`src/reviews.js`):**

The review system requires signing in before submission to prevent spam and allow account-linked edits/deletes.

Flow:
1. User taps "Write a Review" on a place popup
2. User signs in with Google, Microsoft, or email/password via Firebase Authentication
3. Email/password accounts must verify their email before continuing
4. User submits a 1–5 star rating with optional text (20–500 characters)
5. Review appears in the list with a Verified badge and is linked using a one-way hash of the verified email

Review display:
- Scrollable list per place
- Shows user email (anonymized), star rating, date, text
- Average rating and total count displayed on the place card and popup
- Verified / Unverified badge per review
- 5-minute client-side cache to avoid redundant API calls

**Wishlist / Feature Requests (`src/wishlist.js`):**

A community board for requesting new features or reporting data gaps.

- Vote on existing wishes (per-device, `localStorage`-persisted)
- Submit a new wish (name, description, category)
- Status labels: `Active` / `In Progress` / `Implemented` / `Out of Scope`
- Sorted by status priority then vote count descending
- Backed by Cloudflare D1 via `/api/wishes`

**Contact Form (`src/contact.js`):**

- Name, email, and message fields
- reCAPTCHA v3 spam protection
- Submissions are written to Cloudflare D1 via `/api/submit`
- Toast notification on success or error

**Suggest a Place / Suggest an Edit:**

- "Suggest Place" overlay — fill in name, type, address, coordinates, tags
- "Suggest Edit" overlay — pre-populated form for an existing place
- Tag chips are toggleable (click cycles true/false)
- Submitted via `/api/submit` (Cloudflare Function → D1)
- Admin workflow reviews and approves suggestions in the D1-backed admin API

---

### Progressive Web App

The app is fully installable as a PWA on iOS (Add to Home Screen) and Android (Install App prompt).

**manifest.json:**

```json
{
  "name": "Halal Finder Helsinki",
  "short_name": "Halal Finder",
  "display": "standalone",
  "theme_color": "#08705B",
  "background_color": "#f2f2f2",
  "start_url": "/"
}
```

**Service Worker (`sw.js`):**

Implements a multi-tier caching strategy:

| Cache | Strategy | Size Limit | Contents |
|-------|----------|-----------|---------|
| `hf-shell-YYYYMMDD` | Stale-while-revalidate | Unlimited | JS, CSS, fonts, data files |
| `hf-tiles-YYYYMMDD` | Stale-while-revalidate | 500 entries | Vector map tiles |
| `hf-glyphs-YYYYMMDD` | Cache-first (immutable) | 64 entries | MapLibre font glyphs |
| `hf-sat-YYYYMMDD` | Stale-while-revalidate | 300 entries | Satellite imagery tiles |

Dynamic API calls (Digitransit, Aladhan, reCAPTCHA) bypass the cache entirely (network-only).

Cache invalidation: the `VERSION` constant in `sw.js` must match the `?v=YYYYMMDD` query string on CSS and JS imports in `index.html`. Bumping the version causes the service worker to install a fresh cache and delete the old one on activation.

On install, the service worker pre-caches 44 shell assets so the app loads instantly on subsequent visits even without a network connection.

---

### Tutorial & Onboarding

A 10-step spotlight tour runs on first visit only (`src/tutorial.js`). It highlights specific UI elements sequentially and explains each one.

Steps:
1. Map markers and icon meanings
2. Search bar and geocoding
3. Places sheet and type/tag filtering
4. Saving to Favorites
5. Prayer snack pill
6. Directions panel
7. Travel mode selector
8. Route legs and transit details
9. Style picker (Light/Dark/Satellite)
10. Celebrate / settings prompt

A `localStorage` flag prevents the tutorial from showing again on return visits. Users can re-launch it from the Settings overlay.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Map Engine | MapLibre GL 3.6.2 | CDN, pinned version; ~350 KB gzip |
| Language | Vanilla JavaScript ES Modules | Zero framework |
| Styling | CSS 3 with Custom Properties | 283 KB total (tokens + layout) |
| Fonts | Plus Jakarta Sans (WOFF2) | Latin subset, self-hosted |
| Transit Routing | Digitransit HSL + Waltti (GraphQL) | Primary Finnish transit |
| Transit Fallback | Transitous / MOTIS v2 (REST) | Cross-regional trips |
| Walk/Cycle/Drive | OSRM (REST) | No API key required |
| Geocoding | Nominatim (OSM) | Bounded to Helsinki |
| Alt Geocoding | Digitransit Geocoding API | Transit-aware |
| Prayer Times | Aladhan REST API | 5 daily prayers + Ramadan |
| Transit Stops | Overpass API + local cache | 10 498 stops pre-cached |
| Voice | Web Speech API | Turn-by-turn announcements |
| Compass | DeviceOrientationEvent | Qibla bearing |
| Serverless | Cloudflare Pages Functions | 7 API functions |
| Data Persistence | Cloudflare D1 | Places, reviews, contact, saved account data |
| Spam Protection | Google reCAPTCHA v3 | Reviews, contact, suggest |
| Offline | Service Worker | Stale-while-revalidate |
| Testing | Playwright | 1 005 tests, 4 browsers |
| Hosting | Cloudflare Pages | Global CDN, auto-deploy |
| Package Manager | npm (dev only) | No runtime dependencies |

---

## Project Structure

```
Maps/
├── index.html                  # Single-page app shell (87.5 KB, 1 170 lines)
├── manifest.json               # PWA manifest
├── sw.js                       # Service worker (10.3 KB)
├── package.json                # Dev dependencies only (Playwright, serve)
├── _headers                    # Cloudflare Pages HTTP headers
├── _routes.json                # Cloudflare Pages routing rules
├── .gitignore
│
├── src/
│   ├── app.js                  # Entry point — SW registration, module loading, fast-tap
│   ├── config.js               # Two-tier config loader (local vs. Cloudflare)
│   ├── config.local.js         # !! git-ignored — local API keys (copy from config.template.js)
│   ├── config.template.js      # Template showing all required config variables
│   │
│   ├── map-init.js             # MapLibre singleton (map instance + initial style)
│   ├── map-style.js            # Full HSL vector tile style definition (1 096 lines)
│   ├── map-style-config.js     # Theme customization controls
│   ├── map-style-editor.js     # Live style editor with preset toggles
│   ├── map-controls.js         # Zoom, locate, home, style picker, heatmap, 3D terrain
│   │
│   ├── places.js               # Place markers, popups, filtering, favorites (4 436 lines)
│   ├── directions.js           # Routing — transit, OSRM, UI, waypoints (2 516 lines)
│   ├── navigation.js           # Turn-by-turn voice/visual navigator (2 581 lines)
│   ├── search.js               # Search bar, geocoding, dropped pins (483 lines)
│   ├── prayer.js               # Prayer times, Ramadan, Qibla launcher (332 lines)
│   ├── qibla.js                # Qibla compass (DeviceOrientationEvent) (239 lines)
│   ├── eid-prayers.js          # Seasonal Eid prayer locations (481 lines)
│   ├── reviews.js              # Community ratings + OTP verification (1 140 lines)
│   ├── wishlist.js             # Feature request board (403 lines)
│   ├── contact.js              # Contact form overlay (278 lines)
│   ├── transit-stops.js        # Transit stop rendering + Overpass API (787 lines)
│   ├── gps-sim.js              # Dev-only location simulator (443 lines)
│   ├── tutorial.js             # 10-step first-run spotlight tour (520 lines)
│   ├── icons.js                # SVG helpers, PLACE_CONFIG, color definitions (331 lines)
│   ├── utils.js                # Toast, sheets, clipboard, crypto, haversine (1 302 lines)
│   ├── event-recurrence.js     # Calendar event parsing helpers (331 lines)
│   │
│   └── styles/
│       ├── styles.css          # Component layout and CSS (223.9 KB)
│       ├── design-tokens.css   # Design system CSS custom properties (59.7 KB)
│       └── fonts/              # Plus Jakarta Sans WOFF2 subsets
│
├── data/
│   ├── places.json             # 76+ halal locations (coordinates, hours, tags)
│   ├── tags.json               # Tag definitions per place type
│   ├── eid-prayers.json        # Pre-cached Eid prayer locations
│   ├── finland-outside-mask.geojson  # GeoJSON for map masking outside Finland
│   ├── icons/                  # PWA icons (192px, 512px)
│   └── thumbs/                 # Place thumbnail images
│
├── functions/api/              # Cloudflare Pages serverless functions
│   ├── config.js               # Returns runtime config to the client
│   ├── places.js               # Places proxy with 1-hour CF cache
│   ├── reviews.js              # Reviews CRUD + OTP send/verify
│   ├── eid-prayers.js          # Eid locations proxy
│   ├── submit.js               # Place suggestion / contact form handler
│   ├── wishes.js               # Wishlist GET + vote + submit
│   └── geo.js                  # IP-based geolocation fallback
│
├── scripts/
│   ├── update-all.js           # Master update runner
│   ├── build-secrets.js        # Injects env vars into src/config.js at build time
│   ├── build-cache.js          # Regenerates transit stop cache
│   ├── fetch-and-cache-places.js
│   ├── check_places_osm.py     # Validates place coords against OSM
│   ├── strip-comments.py       # Minification helper
│   └── apps-script/            # Legacy retired Apps Script source
│
├── tests/
│   ├── helpers.js
│   ├── 01-dom-elements.spec.js # 12 test files covering all features
│   ├── 02-map-controls.spec.js
│   ├── ...
│   └── 12-mobile.spec.js
│
└── docs/                       # Extended documentation
```

---

## Architecture

### Module Loading

`src/app.js` is the single entry point. It:

1. Registers the service worker (skipped on `localhost` in dev)
2. Imports and initializes core modules synchronously: `map-init`, `directions`, `navigation`, `places`, `search`
3. After the map fires its `load` event, lazy-loads non-critical modules:
   - `transit-stops`, `prayer`, `map-style-editor`, `contact`, `eid-prayers`, `gps-sim`, `wishlist`
4. Applies the **fast-tap handler** — synthesizes immediate `click` events on touch interactions to eliminate the 300 ms mobile delay
5. Prevents pinch-zoom outside the map container (iOS Safari workaround)
6. Wires up the privacy overlay and tools toggle

### Config System

Two environments share the same export shape:

**Local dev** (`src/config.local.js`, git-ignored):
- Copy `src/config.template.js` to `src/config.local.js` and fill in real values
- Loaded via a dynamic `import()` with a try/catch fallback

**Production** (`functions/api/config.js`):
- `scripts/build-secrets.js` runs at Cloudflare build time
- Reads `process.env` and generates `src/config.js` with the same export shape
- `src/config.js` (regenerated) is committed — it contains no secrets when built by Cloudflare

### Data Flow

```
Browser
  └─ src/app.js
       ├─ places.js ──────────── data/places.json (bundled fallback)
       │                         └─ /api/places (Cloudflare → D1, 1h cache)
       ├─ prayer.js ──────────── aladhan.com/v1/timings (real-time)
       ├─ directions.js ──────── Digitransit GraphQL / OSRM REST / Transitous REST
       ├─ search.js ──────────── Nominatim / Digitransit Geocoding
       ├─ reviews.js ─────────── /api/reviews (Cloudflare → D1)
       ├─ transit-stops.js ───── Overpass API + scripts/transit-cache.json (local)
       └─ eid-prayers.js ─────── data/eid-prayers.json + /api/eid-prayers
```

### Backend Architecture

All mutable data lives in Cloudflare D1. Cloudflare Pages Functions are the single backend for reads, writes, auth-gated account sync, and admin actions:

```
Client → Cloudflare Pages Function (CORS, cache headers, auth checks)
              └─ Cloudflare D1 database
```

Cloudflare Functions add:
- CORS protection (single allowed origin)
- Cloudflare CDN cache headers (`s-maxage`, `stale-while-revalidate`)
- Secrets kept server-side (RECAPTCHA_SECRET, ADMIN_SECRET)

---

## Local Development Setup

### Prerequisites

- Node.js 18+ (for Playwright tests and build scripts)
- A modern browser (Chrome / Firefox / Safari)
- Git

### Steps

**1. Clone the repository**

```bash
git clone <repo-url>
cd Maps
```

**2. Install dev dependencies**

```bash
npm install
```

This installs Playwright and `serve` (a local static server). There are no runtime dependencies.

**3. Create your local config**

```bash
cp src/config.template.js src/config.local.js
```

Open `src/config.local.js` and fill in the values. See [Configuration](#configuration--environment-variables) for what each variable does. At minimum you need:
- `DT_API_KEY` — get a free key from [digitransit.fi/developers](https://digitransit.fi/developers/)
- `RECAPTCHA_SITE_KEY` — register at google.com/recaptcha (v3)

**4. Start the dev server**

```bash
npx serve .
```

The app is served from `http://localhost:3000`. MapLibre tiles, OSRM, and Nominatim work without a key. Digitransit and reCAPTCHA require the keys from step 3.

**5. (Optional) GPS Simulator**

A dev-only GPS simulator is included (`src/gps-sim.js`). It is lazy-loaded only when `location.hostname === 'localhost'`. Use it to simulate walking/driving routes without leaving your desk — open the GPS Sim panel from the settings overlay.

### Running Tests

```bash
npx playwright test
```

Tests are in the `tests/` directory. 12 spec files × multiple scenarios = 1 005 tests covering DOM structure, map controls, places filtering, directions, prayer times, and mobile layout. Tests run against `localhost:3000` so the dev server must be running.

---

## Configuration & Environment Variables

All configuration is typed in `src/config.template.js`. Copy this to `src/config.local.js` for local development.

| Variable | Description | Where to Get |
|----------|-------------|-------------|
| `DIGITRANSIT_URL` | HSL GraphQL endpoint (Helsinki/Espoo/Vantaa transit) | Digitransit developer portal |
| `DIGITRANSIT_WALTTI_URL` | Waltti GraphQL endpoint (Turku/Föli transit) | Digitransit developer portal |
| `DIGITRANSIT_GEO_URL` | Digitransit forward geocoding endpoint | Digitransit developer portal |
| `DIGITRANSIT_REV_URL` | Digitransit reverse geocoding endpoint | Digitransit developer portal |
| `TRANSITOUS_URL` | Transitous (MOTIS v2) REST endpoint | Public endpoint, no key |
| `DT_API_KEY` | Digitransit API key (required for all DT calls) | digitransit.fi/developers |
| `NOMINATIM_REV` | Nominatim reverse geocoding URL | Public, no key |
| `NOMINATIM_VB` | Nominatim bounding box (`W,N,E,S`) | Set to Helsinki metro area |
| `HF_TOKEN_KEY` | AES encryption key for route/pin sharing URLs | Any strong random string |
| `RECAPTCHA_SITE_KEY` | reCAPTCHA v3 public site key | Google reCAPTCHA Admin |

**Production-only (Cloudflare environment variables, never committed):**

| Variable | Description |
|----------|-------------|
| `RECAPTCHA_SECRET` | reCAPTCHA v3 server-side secret (for protected form writes) |
| `ADMIN_SECRET` | Shared secret for the D1-backed admin API |
| `BREVO_API_KEY` | Brevo transactional email API key for contact-form alerts |
| `DEV_SKIP_RECAPTCHA` | Local-only flag for testing the contact form on localhost |

Set these in the Cloudflare Pages dashboard under Settings → Environment Variables.
For local contact-form testing, copy `.dev.vars.example` to `.dev.vars`, set
`DEV_SKIP_RECAPTCHA=true`, and add a real `BREVO_API_KEY`. Wrangler loads
`.dev.vars` for `npx wrangler pages dev .`; the file is gitignored.

---

## Backend (Cloudflare Functions & D1)

### Cloudflare Pages Functions (`functions/api/`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/config` | GET | Returns non-secret config variables as JSON to the client |
| `GET /api/places` | GET | Reads place data from D1; adds 1-hour Cloudflare cache |
| `GET /api/reviews?placeId=` | GET | Fetches reviews for a place |
| `POST /api/reviews` | POST | Submit, check, delete, and list account reviews |
| `GET /api/eid-prayers` | GET | Fetches Eid prayer locations from D1 |
| `POST /api/submit` | POST | Place suggestion, place edit, contact email, event submissions |
| `GET /api/wishes` | GET | Lists feature wishes |
| `POST /api/wishes` | POST | Vote on or submit a wish |
| `GET /api/geo` | GET | IP-based geolocation fallback |

All functions share common patterns:
- Check `Origin` header against an allowed origin whitelist
- Read/write Cloudflare D1 through the `DB` binding
- Return appropriate `Cache-Control` headers for Cloudflare CDN

### Cloudflare D1

D1 is bound to the Pages Functions as `DB` and stores places, tags, reviews,
wishes, legacy contacts, Eid prayers, submitted edits, account sync rows, and
admin metadata. New contact-form submissions are sent by email through Brevo
instead of being stored in D1. The legacy Apps Script/Google Sheets backend is
retired.

---

## Data Management

### Adding or Editing a Place

Places are stored in `data/places.json`. Each entry follows this schema:

```json
{
  "id": "unique-kebab-id",
  "name": "Place Name",
  "type": "mosque",
  "address": "Street 1, 00100 Helsinki",
  "city": "Helsinki",
  "lat": 60.1699,
  "lng": 24.9384,
  "hours": {
    "mon": "09:00-22:00",
    "tue": "09:00-22:00",
    "wed": "09:00-22:00",
    "thu": "09:00-22:00",
    "fri": "09:00-23:00",
    "sat": "10:00-22:00",
    "sun": "closed"
  },
  "tags": {
    "daily_prayers": true,
    "jummah": true,
    "taraweeh": false,
    "eid_prayer": true,
    "sisters_section": true,
    "sisters_wudu": false
  },
  "notes": "Optional free-text notes.",
  "sponsor": {
    "name": "Sponsor Name",
    "startDate": "2026-01-01",
    "endDate": "2026-12-31"
  }
}
```

Tag keys available per type are defined in `data/tags.json`.

After editing `places.json`, bump the cache version in `sw.js` (the `VERSION` constant) and the matching `?v=` query strings in `index.html` to force the service worker to pick up the new data.

### Updating the Transit Stop Cache

The transit stop cache (`scripts/transit-cache.json`, ~4.4 MB, 10 498 stops) is pre-generated to avoid expensive Overpass API calls on every page load.

To regenerate:

```bash
node scripts/build-cache.js
```

This queries Overpass for all public transit stops in Finland and writes the result to the cache file. Run this periodically (monthly is sufficient) to pick up new stops.

---

## Service Worker & Caching

### VERSION Bump (required after any file change)

The service worker uses a date-based version string (e.g., `20260610`) to manage cache lifecycle. After any change to shipped files (JS, CSS, data):

1. Update `VERSION` in `sw.js`
2. Update all `?v=YYYYMMDD` query strings in `index.html` (CSS links, JS imports, data fetches)

The version string must match exactly. A mismatch causes the service worker to skip update and serve stale files.

### Stale-While-Revalidate

The shell cache (JS, CSS, fonts, JSON data) uses stale-while-revalidate:
1. Return the cached response immediately (zero latency)
2. Fetch the network response in the background
3. Update the cache entry with the fresh response for the next visit

This means users always see an instant load, and get updated content on their next visit after you deploy.

### Network-Only APIs

The following requests always bypass the cache to ensure real-time data:
- Digitransit GraphQL (transit routes)
- Aladhan prayer times
- Nominatim geocoding
- reCAPTCHA verification
- All `/api/*` endpoints

---

## CSS & Design System

The design system lives in two files:

### `src/styles/design-tokens.css`

CSS custom properties organized into:

**Colors:**
```css
--accent: #1A73B8          /* Primary blue — CTAs, links */
--success: #08705B         /* Brand green — mosques, PWA theme */
--gold: #D4A226            /* Prayer time highlights, Ramadan */
--danger: #D32F2F          /* Errors, remove actions */
```

**Surfaces & Text:**
```css
--surface: #FFFFFF         /* Default background */
--surface-2: #F5F5F5       /* Secondary */
--surface-3: #ECECEC       /* Tertiary */
--text: #000000
--text-secondary: #666666
--border: #E0E0E0
```

**Spacing (4px base scale):** `--sp-0` through `--sp-8`

**Border Radius:** `--r-xs` (6px) through `--r-pill` (999px)

**Shadows:** `--shadow-sm`, `--shadow-md`, `--shadow-lg`

**Z-index stack:**
```css
--z-map: 1      /* MapLibre canvas */
--z-bar: 10     /* Search pill, map controls */
--z-sheet: 20   /* Bottom sheets */
--z-modal: 30   /* Overlays */
--z-scrim: 40   /* Dark backdrop */
--z-tooltip: 50 /* Popovers */
```

**Transitions:**
```css
--transition-fast: 150ms ease    /* Immediate feedback */
--transition-base: 250ms ease    /* Default */
--transition-slow: 350ms ease    /* Major state changes */
```

**Dark mode** — full token overrides under `@media (prefers-color-scheme: dark)`.

### `src/styles/styles.css`

Component layout, responsive breakpoints, and animations. Organized by component:
- Scrollbars, map container
- Search pill expand/collapse
- Bottom sheets (drag handle, snap animations)
- Tab bar
- Directions panel and itinerary
- Prayer snack
- Overlays and modals
- Buttons, chips, cards
- Mobile-specific overrides (breakpoint: 768px)
- Touch tap targets (44px minimum)

---

## Testing

Tests are written with Playwright and live in `tests/`. There are 12 spec files:

| File | Coverage |
|------|---------|
| `01-dom-elements.spec.js` | Core HTML structure and element presence |
| `02-map-controls.spec.js` | Zoom, locate, style picker controls |
| `03-places.spec.js` | Place markers, popups, filtering |
| `04-favorites.spec.js` | Favorite saving and persistence |
| `05-directions.spec.js` | Routing panel, mode switching |
| `06-search.spec.js` | Search bar, geocoding, dropped pins |
| `07-prayer.spec.js` | Prayer snack, Ramadan mode |
| `08-reviews.spec.js` | OTP flow, rating submission |
| `09-wishlist.spec.js` | Voting, submission |
| `10-tutorial.spec.js` | Spotlight tour steps |
| `11-pwa.spec.js` | Manifest, service worker registration |
| `12-mobile.spec.js` | Touch interactions, responsive layout |

**Run all tests:**
```bash
npx playwright test
```

**Run a specific file:**
```bash
npx playwright test tests/03-places.spec.js
```

**Run with headed browser (for debugging):**
```bash
npx playwright test --headed
```

Tests run against Chrome, Firefox, Safari (WebKit), and Mobile Chrome by default.

---

## Deployment

The app is deployed to Cloudflare Pages via Git integration. Every push to `main` triggers a production build.

### Build Command

```bash
node scripts/build-secrets.js
```

This reads environment variables from the Cloudflare Pages dashboard and writes `src/config.js` with the correct API keys.

### Environment Variables (Cloudflare Pages)

Set these in the Cloudflare Pages dashboard → Settings → Environment Variables:

```
DIGITRANSIT_URL
DIGITRANSIT_WALTTI_URL
DIGITRANSIT_GEO_URL
DIGITRANSIT_REV_URL
TRANSITOUS_URL
DT_API_KEY
NOMINATIM_REV
NOMINATIM_VB
HF_TOKEN_KEY
RECAPTCHA_SITE_KEY
RECAPTCHA_SECRET
ADMIN_SECRET
BREVO_API_KEY
```

### Deployment Checklist

Before merging to `main`:

- [ ] Bump `VERSION` in `sw.js` to today's date (`YYYYMMDD`)
- [ ] Update matching `?v=YYYYMMDD` in `index.html`
- [ ] Verify `data/places.json` is valid JSON (`node -e "require('./data/places.json')"`)
- [ ] Run `npx playwright test` and confirm all tests pass
- [ ] Check dark mode, satellite mode, and mobile layout in a real browser

### Cloudflare Pages Headers

`_headers` configures security and caching headers:
- `Content-Security-Policy` for script-src, connect-src
- `Cache-Control` for static assets
- `X-Frame-Options: DENY`

`_routes.json` ensures `/api/*` routes are handled by Cloudflare Functions and not served as static files.

---

## Contributing

### Adding a New Place

1. Add the place entry to `data/places.json` following the schema above
2. Verify coordinates are accurate (use openstreetmap.org to find lat/lng)
3. Use `scripts/check_places_osm.py` to cross-check coordinates against OSM data
4. Bump the cache version and test locally

### Adding a New Feature

1. Create a new module in `src/` if the feature is self-contained (see existing modules for patterns)
2. Import it lazily in `src/app.js` after the map `load` event if it is non-critical
3. Add a test spec in `tests/` covering the new functionality
4. Export and expose any public API from the module (follow the existing export conventions)
5. Add design tokens to `src/styles/design-tokens.css` if new colors or spacing are needed

### Code Style

- Vanilla ES Modules, no TypeScript, no framework
- Arrow functions for callbacks; `function` declarations for named module functions
- No comments unless the **why** is non-obvious from the code
- CSS custom properties for all colors, spacing, and z-index — never hardcode values
- `localStorage` keys follow the pattern `hf-<feature>-<key>`

### Commit Message Format

```
type: short description; bump to YYYYMMDD
```

Types: `feat`, `fix`, `chore`, `style`, `refactor`, `test`, `docs`

---

*Halal Finder Helsinki — built for the community, by the community.*
