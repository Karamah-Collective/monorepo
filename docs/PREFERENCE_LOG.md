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
- Expand/collapse UI should reveal by clipping container height/opacity, not by moving or squashing inner text/icons.
- Date/time picker: drum roller style (iOS-like) with gradient depth tiers, not calendar grid or dropdown selects. Compact, unified, smooth drag interaction.

### Architecture / Development
- Static site only — no bundler, no SSR, no frameworks. Vanilla JS ES modules.
- Zero runtime dependencies. Dev dependencies (Playwright) only.
- Cloudflare Pages free tier — all server logic in `functions/` using V8 Web APIs, not Node.js.
- Google Sheets as database — data served via Apps Script → `/api/places` proxy → client.
- Secrets in `config.local.js` (gitignored) for local dev, Cloudflare env vars for production.
- Lazy-load non-critical modules after `map.on("load")` for faster startup.
- Service worker for offline support and instant repeat visits.
- Prefer direct code fixes first; only add extra test-focused follow-up when explicitly requested or needed to validate a risky change.
- Prefer simple, high-return product improvements in the early stage rather than complex ranking or location logic.

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
- **2026-03-18 — Dark mode GTFS color contrast: brighten, don't replace.** GTFS-provided route colors (raw hex from API) have low contrast on dark surfaces. Fix: use `color-mix(55%, white)` for text/chip colors in dark mode, `filter: brightness(1.35)` for background-colored badges, and increase timeline opacity. Never change the base light-mode color — only override in dark mode.

- **2026-03-19 — NLP-lite proximity search: pattern table, not NLP library.** User wants natural-language "near me" search but explicitly no heavy language processing. Solution: curated regex pattern table with proximity triggers + category keywords. No external API, no ML, no new dependencies. Just string matching.

- **2026-03-20 — Route sharing v2: embedded transit itinerary, exact-minute time.** Shared transit routes must open the EXACT same itinerary on the receiver's device — not re-query and pick by index. Solution: DEFLATE-compress the full itinerary (legs, geometry, stops, times) into the share URL. Non-transit routes (deterministic) still re-query. Time encoding upgraded from 15-minute granularity to exact minutes. Old v1 links still decode but new shares use v2. Backward compat with old format explicitly not required.

- **2026-03-23 — Pin marker shape: Design 2B (Upward Puck).** All map markers (place, search, custom, home, eid) use an asymmetric teardrop shape — `border-radius: 50% 50% 50% 8px`, rotated -45 deg. `--icon-md` bumped from 34 px to 38 px for better visibility.
- **2026-03-23 — Location indicator: Style E (Navigation Puck).** Same puck shape as pins but smaller (24 px, 7 px corner), rotated -135 deg (pointing backward), with a pulsing ring. Heading-aware rotation with smooth interpolation.
- **2026-03-23 — Popup tip shape: concave S-curve clip-path.** MapLibre's default CSS border-triangle tip replaced with `clip-path: path()` using bezier S-curves for organic, seamless flow into the card body. No sharp points. Works on all anchor directions.
- **2026-03-23 — Home icon size: standardised to 15x15 / stroke-width 2.5.** Was 14x14 / 2.2, causing the home icon to appear smaller than all other popup/marker icons.

---

## Patterns to Avoid

> Things that were tried and rejected, or that the user has explicitly said "don't do."

<!-- Append new entries below this line -->

- Don't use Cloudflare KV or any paid/tiered storage for link shortening. Keep sharing fully stateless.
- Don't use NLP libraries, ML models, or external language-processing APIs for search intent detection. Keep it lightweight with curated regex patterns.

---

## Patterns to Follow

> Established approaches that should be reused in similar situations.

- Component aliases: when a JS class is visually identical to a template, add it to the template selector in `design-tokens.css` rather than duplicating.
- Inline styles in JS should only be used for truly dynamic values (e.g. calculated positions). All visual design comes from CSS classes.
- Use `esc()` for all user-supplied text in JS-generated HTML.
- Scrollable containers get the `.t-scroll` template or are added to its selector list.
- Popup tips use `clip-path: path()` for organic concave curves — never CSS border-triangles or rotated squares with border-radius.
- Puck marker shape is a template (`.puck-mk` in `design-tokens.css`). New marker types should be added as aliases on the template selector, not as duplicate rule blocks.

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

### 2026-03-20 — Drum Roller Date/Time Picker
- Replaced the old calendar + scroll-wheel time picker with a unified drum roller (Variant L "Gradient Depth").
- User chose this style after reviewing 10 general picker designs, then 12 drum roller variants.
- Key design: 3 side-by-side drum columns (date · hour : min) with depth tiers (font-size/weight/opacity fade away from center).
- Interaction: Pointer Events for unified mouse+touch, velocity-based inertia on flick release, rubber-band damping at edges.
- Compact layout: 28px cell height, 5 visible rows, tight separators (`·` and `:` in `--txt-sm`).
- Past-time prevention: past cells are greyed/struck-through, selecting a past time flashes an error toast and snaps back.
- Single trigger button replaces the old separate date/time input fields.
- Places card notes now match eid prayer card notes style (italic, `--text-2` colour, no upper border separator).
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

### 2026-03-21 — Places Window Collapsible & Tap Fixes
- Recently viewed section is now a collapsible group identical to city groups (chevron + name + count badge).
- Removed the clock icon from the recently viewed header — plain text only.
- Collapsible section trigger area reduced to just the chevron and city name (wrapped in a `<button class="pl-city-toggle">`), not the entire row.
- Suppressed `cardSlideIn` animation on nested cards inside `.pl-city-group-list` to eliminate compositor saturation during sheet opening (root cause of multi-tap issue on mobile).
- Removed `scroll-behavior: smooth` from `#places-scroll` to prevent unwanted scroll resets during expand/collapse.
- Scroll position preserved across expand/collapse toggles.

### 2026-03-23 — Map Canvas Shrink / White-Screen Root Cause
- Desktop root cause: during Places sheet transitions, `#map` could be measured below the real app viewport for a moment, and MapLibre `resize()` then locked the WebGL canvas buffer to that undersized measurement, leaving part of the app white.
- Phone root cause: the same undersized resize path existed, but repeated fast place switches also stacked sheet-close, popup-open, and map movement work at once, which made the mobile renderer more likely to hit the bad canvas state and blank the screen.
- Fix pattern: enforce viewport floor sizing on the map host/canvas, resync the MapLibre viewport after transitions, and serialize phone place focus so animation settles before the popup opens.

### 2026-03-23 — Pin & Popup Design System Formalization
- Chose Design 2B (Upward Puck) for all map markers and Style E (Navigation Puck) for location indicator.
- Created popup design comparison page (`docs/pin-designs.html`) with 6 popup styles (P1–P6).
- Implemented concave S-curve curvy popup tip via `clip-path: path()` on `::after` pseudo-element, replacing MapLibre's default border-triangle tip. Applied to all 3 popup types (place, stop, eid) across all anchor directions.
- Simplified dark-mode popup tip rules from 20+ declarations to 2 shared `::after background: var(--surface)` rules.
- Reduced location indicator size ~14% (puck 28→24 px, ring 46→40 px, container 48→42 px).
- Standardised home icon SVGs to 15x15 / stroke-width 2.5 (was 14x14 / 2.2).
- Created design tokens: `--puck-r`, `--puck-r-sm`, `--puck-border`, `--puck-border-sm`, `--popup-tip-w/h/offset`, `--popup-tip-clip-down/up/left/right`.
- Created template classes: `.puck-mk` (aliased with all marker types), `.puck-loc` (aliased with `.loc-puck`), `.popup-tip-base` (documented pattern for pseudo-elements).
- Refactored `styles.css` — all marker classes now use token-based templates for shared visual properties and only define unique overrides (background, animation, custom shadows).
- All popup `::after` rules now reference `--popup-tip-*` tokens instead of hardcoded values.
- Updated `DESIGN_SYSTEM.md` with §10–§12 covering puck markers, location indicator, and curvy popup tip pattern.
