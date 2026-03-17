# Preference Log

The Architect reads this file at the start of every session to understand
what you like, what you've decided, and how you want things done.

---

## Preferences

> Long-lived style and development opinions that apply across the project.

### Visual / Design
- Rendering HTML with `Array.map()` into `innerHTML` must use `.join("")` — commas between elements are never acceptable.
- Design should feel flat and minimal — very subtle shadows only (`--shadow-sm/md/lg`).
- Popup redesign direction should stay flat and modern, not glassy, blurry, or heavily dimensional.
- One primary CTA per screen/card. Secondary actions use outline or pill variants.
- Template-first: every visual pattern should exist as a reusable class in `design-tokens.css` before being used in `styles.css` or JS.
- Popup tag chips should not include tick/cross glyph prefixes; keep labels plain text.
- For pin popups, use the subtitle text "Dropped pin" (no "Custom location" wording).

### Architecture / Development
- Static site only — no bundler, no SSR, no frameworks. Vanilla JS ES modules.
- Zero runtime dependencies. Dev dependencies (Playwright) only.
- Cloudflare Pages free tier — all server logic in `functions/` using V8 Web APIs, not Node.js.
- Google Sheets as database — data served via Apps Script → `/api/places` proxy → client.
- Secrets in `config.local.js` (gitignored) for local dev, Cloudflare env vars for production.
- Lazy-load non-critical modules after `map.on("load")` for faster startup.
- Service worker for offline support and instant repeat visits.

### Security
- Full CSP, HSTS, CORS, SRI enforcement.
- `esc()` for all user text in JS-generated HTML.
- Server-side validation is authoritative; client-side is UX sugar.
- `Sec-Fetch-Site` gating on `/data/` and `/src/` paths.

---

## Decisions

> Specific choices made during development sessions. Include date and context.

<!-- Append new entries below this line -->

- **2026-03-17 — Shared purple by theme: light `#8C4799`, dark `#E896E3` (shops + trains).** Use the original HSL purple in light mode and the brighter purple in dark mode, consistently for place shop color and rail visuals.
- **2026-03-17 — Popup redesign direction: Design A as the base.** User prefers the Design A popup structure for regular places, wants the existing live popup button treatment preserved, and wants note support included in A-based variants.
- **2026-03-17 — URL shortening: compact binary over Cloudflare KV.** User explicitly rejected KV-based URL shortener — wants "free yet unlimited" with no external storage. Chose client-side binary encoding over base64-JSON. No server-side state needed.
- **2026-03-17 — Popup redesign: badge-pill layout replaces colored header.** All popup types (places, pins, stops) now use a white/surface background with a small colored badge pill instead of a full-width colored header band. Fav star is absolute top-right. Chips are plain-text only (no icons). Address is plain text (no map pin SVG).
- **2026-03-17 — Dark mode contrast: all UI colors via CSS variables.** Every inline color in popup badges, leg timelines, filter chips, and route chips now uses CSS variable references (`var(--success)`, `var(--hsl-bus)`, `var(--walk)`, etc.) instead of hardcoded hex. This ensures auto-adaptation when the theme switches. New tokens `--walk`, `--funicular`, and `--hsl-foli` added with proper dark overrides. Zone badges, tooltips, form invalid borders, fav star, danger pill hover, and place markers all tokenized. Full sweep — no remaining hardcoded non-white DOM colors outside dark-mode overrides.
- **2026-03-17 — Halal status: merged into one grouped concept.** `fully_halal` and `partially_halal` are now grouped under "Halal Status" in `tags.json` (expandable group, not two independent tags). Exclusive: selecting one deselects the other in filter bar and suggest/edit forms. "Partially Halal" uses amber/gold chip (`.chip-warn` / `--gold`) instead of green — sits between green (fully halal) and red (not halal). Data unchanged — both `fully_halal` and `partially_halal` remain as boolean tags in places data.
- **2026-03-18 — Spreadsheet backups: local-only, never committed.** When refreshing `data/places.json`, also download a local `.xlsx` backup of the full spreadsheet into `scripts/local-backups/`. This backup must stay gitignored and must never be pushed to any branch.

---

## Patterns to Avoid

> Things that were tried and rejected, or that the user has explicitly said "don't do."

<!-- Append new entries below this line -->

- Don't use Cloudflare KV or any paid/tiered storage for link shortening. Keep sharing fully stateless.

---

## Patterns to Follow

> Established approaches that should be reused in similar situations.

- Component aliases: when a JS class is visually identical to a template, add it to the template selector in `design-tokens.css` rather than duplicating.
- Inline styles in JS should only be used for truly dynamic values (e.g. calculated positions). All visual design comes from CSS classes.
- Use `esc()` for all user-supplied text in JS-generated HTML.
- Scrollable containers get the `.t-scroll` template or are added to its selector list.

---

## Session Notes

> Short notes from individual sessions for continuity.

<!-- Append new entries below this line -->

### 2026-03-16 — Eid Prayer Locations Feature
- Added temporary Eid prayer locations feature: map markers, popup with jamaat times, directions, and a dismissible banner.
- Data sourced from a new "EidPrayers" Google Sheet worksheet via `/api/eid-prayers` proxy.
- User prefers manual data entry in the Sheet — no community submission form needed for this temporary feature.
- Gold-themed markers and UI to distinguish from regular places.
- Feature is date-filtered (shows only today's or future Eid dates), making cleanup automatic.
- User wants dedicated UI section for temporary features on the root UI — not buried in menus.
- Temporary features should still maintain consistent design language; uniformity is key.
- Replaced ambiguous "tap to view" banner (confused with multiple locations) with a panel overlay listing all locations.
- Added gold-accented Eid pill button (top-left, near prayer snack) that opens the Eid panel overlay.
- Pattern: banner toast → opens panel; location card in panel → flies to map + opens popup.

### 2026-03-17 — Compact Share URL Encoding
- Replaced verbose JSON base64 / query-param share URLs with compact binary encoding (uint16 coords, packed flags).
- Route URLs reduced ~64% (246 → 89 chars with names). Pin/stop/eid URLs reduced ~20-30%.
- Format: `?r=` (routes, compact binary vs legacy JSON auto-detected), `?p=` (pins/stops), `?e=` (eid).
- Full backward compat: old `?r=`(JSON), `?lat=&lng=`, `?eid=`, `?route=1`, `?p=`(encrypted) all still parse.
- Middleware updated for OG tag generation from compact tokens.
- No server-side storage — everything is encoded in the URL itself.
