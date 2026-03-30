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
- When exploring major UI redesigns, the user prefers a true architectural rethink over cosmetic restyling of the existing floating-control layout.
- Avoid redesign directions that feel scattered, overly glassy, or HUD-like. The user wants compact, advanced, beautiful product-shell layouts with stronger structural order.
- Redesign mockups should stay lightweight and visual. Use minimal copy and minimal feature detail so the user can judge look, feel, and layout without reading through dense UI content.

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

- **2026-03-27 — Full UI redesign direction: product shell over floating HUD.** User rejected two floating-control redesign concepts as too scattered / not beautiful enough. Preferred next-step direction is a complete layout rethink with stronger structure, such as a navigation rail, dedicated workspace pane, and map as canvas rather than stacking independent floating controls.

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
- **2026-03-23 — Dedup guardrails: aggressive fuzzy matching for New sheet.** Community submissions are archived verbatim in Draft (including dupes). The New sheet (approval queue) must be duplicate-free. Dedup uses: fuzzy name matching (normalised, substring ≥5 chars), Maps link normalisation, proximity (~50 m) + same type, and checks against both Places (approved) and New (pending). False positives (valid place blocked from New) are acceptable since Draft preserves everything and admin can manually add.
- **2026-03-23 — Cuisines sorted alphabetically everywhere.** Cuisine subtags (and all subtag groups) are sorted alphabetically by label immediately after tagsData is loaded, affecting forms, popups, cards, and filter bar.
- **2026-03-23 — Forms must never scroll horizontally.** All form containers (suggest, edit, contact) have `overflow-x: hidden`. The `.sg-subtags-inner` panel uses `min-width: 0` instead of `width: fit-content` to prevent overflow.
- **2026-03-24 — noCoverage regions: OSM Overpass as fallback route source.** Cities without Digitransit/Waltti GTFS coverage (Kokkola, Seinäjoki) get route data from OpenStreetMap route relations instead. Build-time: bulk Overpass query for route relations + proximity matching to stops. Runtime: per-stop Overpass query as fallback when cached routes are empty.
- **2026-03-24 — Admin dashboard: separate CF Pages project.** Admin dashboard lives in `admin/` folder, deployed as its own Cloudflare Pages project (root dir = `admin/`). Completely isolated from the main maps app — own HTML, JS, CSS, Functions, headers. Only shared touchpoint is `Code.gs` (Apps Script). Auth via invite-only tokens stored in admin CF env vars (`ADMIN_TOKENS` JSON). Double-gate: CF validates user token, passes `ADMIN_SECRET` to GAS. Session stored in `sessionStorage` (clears on tab close). Design tokens copied from main app for visual consistency. All free-tier, zero paid services.

- **2026-03-28 — Brand color integration: neutral surfaces + teal accent.** Brand teal `#08705B` replaces blue as `--accent`. All surfaces, text, and borders are **pure neutral** grays (no warm tint). Brand color `#FDFCF8` explicitly rejected — never use it; warm-tinted surfaces feel ugly. Other brand colors (`#0B3C49`, `#BAB397`, `#F2C879`) available as solid fills where appropriate but not forced into the palette. Dark-mode brand colors stay nearly identical to light (`--accent: #0a7a63`, only ~5% lighter). Transit/Digitransit colors untouched.
- **2026-03-28 — AMOLED-black dark mode + pure-white light mode.** Dark mode surface is now `#000000` (true black) for AMOLED power savings, with stepped grays `#111111` / `#1c1c1c`. Light mode body + map background is pure `#ffffff`. No warm tint on any surface or background — ever.

- **2026-03-28 — `--on-accent` token for white-on-colored backgrounds.** All `color: #fff` / `stroke: #fff` on accent/danger/success backgrounds replaced with `var(--on-accent)`. Literal `#fff` kept only for marker border outlines and body background.
- **2026-03-28 — Half-step spacing tokens.** Added `--sp-0` through `--sp-11` with half-steps (0h, 1h, 2h, 3h, 4h, 7h) to cover all values used in templates without bare px.
- **2026-03-28 — `--t-slow` and `--t-x-slow` for theme transitions.** Theme color crossfade uses `--t-slow` (0.4s), map canvas filter uses `--t-x-slow` (0.5s). All other transitions use `--t-fast`/`--t-med`/`--t-spring`.

- **2026-03-29 — Navigation auto-starts on panel close.** No explicit "Start navigation" button. Closing the directions panel when a route is active automatically starts turn-by-turn. Opening the panel or clearing the route stops it.
- **2026-03-29 — Navigation: explicit Navigate button, no auto-start.** Reversed earlier auto-start decision. Navigate buttons (teal, turn-right arrow) added to route cards. HUD close only stops nav; route stays on map.
- **2026-03-29 — Hook pattern for circular module dependencies.** When module A needs to call module B's functions but B already imports from A, use a `setHooks()` export in A that B calls at module evaluation time to register its callbacks. Avoids import cycles.
- **2026-03-29 — Simulator always visible.** The nav simulator button is always shown (not dev-gated) so the user can verify step-by-step progression without GPS.
- **2026-03-29 — Navigation step changes require GPS confirmation at the actual trigger point.** Turn-by-turn navigation must not preview future instructions early or advance from generic movement alone. A step advances only when the live GPS fix is inside that step's proximity threshold and the snapped route progress matches that maneuver's exact route position.

- **2026-03-30 — Navigation step advancement: movement guard replaces cooldown timers.** The root cause of the cascade bug was a time-based `STEP_ADVANCE_COOLDOWN` that only slowed cascading (3s per step) rather than stopping it. The new mechanism uses two conditions that must both hold: (1) user must have moved `_minMoveDist()` metres from `_lastTriggerPos` (set to GPS position at nav start, updated on every step fire); (2) user must be within `_triggerRadius()` of the next step's lat/lng. GPS noise is bounded by the accuracy circle (~15-20 m), so a 25 m drive threshold makes it physically impossible to cascade from a standstill. Also removed `buildDirectStepsFallback` (DOM-parsing, proportional coord estimation — fundamentally broken) and the `_isGpsConfirmedAtStep` route-progress window check (shortcircuited to `true` when `routeProgressM` was `0`, causing early fires). `_stepFired[]` array prevents any already-passed step from re-triggering.

- **2026-03-30 — Places panel inline search: expand-to-search pattern.** Search button (icon-only) sits right of sort, expands into full input on click. Filter/sort labels collapse to icon-only via `.pl-searching` class to make room. 120 ms debounce. Scoped to current tab (mosque tab searches only mosques, etc.). Searches name + address from database only (not OSM). `<mark>` highlight on matching text. Context-aware placeholder per tab.
- **2026-03-30 — Neutral border-left for expandable groups.** City group list and filter tag group inner borders changed from `--accent-soft` (teal in dark mode) to `--border` (neutral gray) for theme consistency. User dislikes teal in structural/decorative lines.

---

## Patterns to Avoid

> Things that were tried and rejected, or that the user has explicitly said "don't do."

<!-- Append new entries below this line -->

- Avoid redesign concepts that mainly rearrange floating pills, bottom docks, or glass overlays without changing the underlying layout architecture.

- Don't use Cloudflare KV or any paid/tiered storage for link shortening. Keep sharing fully stateless.
- Don't use NLP libraries, ML models, or external language-processing APIs for search intent detection. Keep it lightweight with curated regex patterns.
- Don't use asymmetric easing for expand vs collapse — both directions must use `--t-spring`. No `ease` for expand + `spring` for collapse.
- Don't use `height: 0` without transition for collapse — use `grid-template-rows: 0fr` pattern instead.
- React / any framework rejected for this project — vanilla JS + design tokens delivers the same UX with zero build overhead.

---

## Patterns to Follow

> Established approaches that should be reused in similar situations.

- Component aliases: when a JS class is visually identical to a template, add it to the template selector in `design-tokens.css` rather than duplicating.
- Inline styles in JS should only be used for truly dynamic values (e.g. calculated positions). All visual design comes from CSS classes.
- Use `esc()` for all user-supplied text in JS-generated HTML.
- Scrollable containers get the `.t-scroll` template or are added to its selector list.
- Popup tips use `clip-path: path()` for organic concave curves — never CSS border-triangles or rotated squares with border-radius.
- Puck marker shape is a template (`.puck-mk` in `design-tokens.css`). New marker types should be added as aliases on the template selector, not as duplicate rule blocks.
- For regions without GTFS coverage, use OpenStreetMap Overpass `relation["route"="bus"]` queries to get bus route data. Build-time bulk matching + runtime per-stop fallback.
- All expand/collapse animations must use `--t-spring` (`0.35s cubic-bezier(0.32, 0.72, 0, 1)`) symmetrically in both directions. Use `grid-template-rows` for content collapsing.
- Sheet transitions must include all four properties: `transform`, `opacity`, `visibility`, `height`. Never omit `opacity` — it causes instant-disappear on close even if `transform` has a transition.
- When delaying DOM cleanup after a CSS transition (e.g. `hidden = true`, `innerHTML = ""`), use `setTimeout` with a guard check on the expected state, and cancel the timeout on re-open.
- Asymmetric open/close transitions for discrete UI elements (tool pills, popups): bouncy `--ease-spring-pop` for enter, quick `ease-in` for exit. Sheets and content areas keep symmetric easing.
- Use `--ease-expo` for sheet/panel transitions — aggressive deceleration feels modern. Pair with `scale()` in the start state for depth cues.
- Hook pattern for circular imports: export a `setHooks()` function from module A, call it from module B at evaluation time to register callbacks. Never create `import` cycles between modules.
- Navigation step advancement must use dual confirmation: GPS proximity to the maneuver point plus matching progress along the route geometry. Do not reveal future turn text before that trigger is confirmed.

---

## Session Notes

> Short notes from individual sessions for continuity.

<!-- Append new entries below this line -->

### 2026-03-30 — Places panel inline search + border color fix
- **Inline search:** Added a search bar to the places panel `#tf-row`. A magnifying glass button on the right expands into a full input field. Filter/sort text labels collapse to icon-only (via `.pl-searching` parent class) to free space. Search is scoped to the active tab — if on "Mosques", only mosques are searched (name + address). 120 ms debounced input triggers a re-render with `<mark>` highlights on matched text. Custom empty state when search yields no results. Search cleared on tab switch or clear-all.
- **Border color fix:** `.pl-city-group-list` and `.tf-group-inner` border-left changed from `var(--accent-soft)` to `var(--border)`. The teal/green hue in dark mode was undesirable for structural lines.
- **Preference:** User dislikes accent/teal coloring on structural decorative lines — keep them neutral gray.
- Files: `index.html`, `src/styles/styles.css`, `src/places.js`, `src/styles/design-tokens.css`.

### 2026-03-30 — Navigation step-advancement logic rewrite

**Problem:** Turn-by-turn navigation cascaded through all steps in ~15 seconds even when the user didn't physically move. Root causes:
1. `STEP_ADVANCE_COOLDOWN` (3s) only slowed cascading — one step per 3s until route end.
2. `_isGpsConfirmedAtStep` shortcircuited to `true` when `step.routeProgressM` was `0` or non-finite, bypassing the route-progress guard entirely.
3. `buildDirectStepsFallback` estimated step coordinates proportionally from DOM elements — inaccurate and unreliable.

**Fix (complete rewrite of advancement logic):**
- Replaced cooldown timer with **movement guard**: `_lastTriggerPos` is set to the GPS position at nav start and updated when each step fires. A step can only advance after the user has physically moved `_minMoveDist()` metres from `_lastTriggerPos`.
- Movement thresholds: drive=25m, cycle=12m, walk=8m, transit=20m — all above GPS noise (~15-20m) and below shortest real inter-maneuver distances.
- Trigger radius per step type: drive=40m, walk=18m, cycle=25m, transit-board/alight=50m, transit-stop=80m.
- Added `_stepFired[]` boolean array — once-fired guard prevents any step from re-triggering.
- Removed `buildDirectStepsFallback` entirely.
- Removed `_isGpsConfirmedAtStep`, `_stepProgressWindow`, `_stepTriggerThreshold`, `STEP_ADVANCE_COOLDOWN`.
- Simulator (`simNextStep`) now also updates `_lastTriggerPos` so GPS nav can resume sensibly after simulation.
- Files modified: `src/navigation.js`.


- **Pin hover:** Added `transition: transform var(--t-fast)` to `.place-mk` and `.custom-mk`. Hover on `.place-mk-wrap` scales inner puck to `rotate(-45deg) scale(1.15)`. Uses `@media (hover: hover)`. No interference with sponsored pin animations (transitions are on the child, animations run on same element but override).
- **Tutorial skip:** First "Assalamu Alaikum" slide now shows a "Just explore" ghost pill button (left side of footer via `justify-content: space-between`) alongside the "Get started" primary pill. Clicking it calls `dismiss()` immediately — marks tutorial done without stepping through. New `.tut-skip-btn` template added to `styles.css`.
- Files: `src/styles/styles.css`, `src/tutorial.js`.

### 2026-03-27 — UI Redesign Mock v3 (full architectural shift)
- User rejected the first two mock directions as not cohesive or beautiful enough.
- New mock created at `docs/ui-redesign-v3.html` using a fundamentally different layout: vertical navigation rail, dedicated left workspace, large map canvas, and right contextual inspector.
- This direction intentionally avoids the earlier floating-dock / glass-HUD concepts and treats the interface more like a structured product shell.

### 2026-03-27 — Animation uniformity + typography refinement
- **User complaint:** "fed up with ununiformity" — prayer opens smooth/closes suddenly, city groups expand suddenly/collapse smoothly.
- **Root causes:** City groups used `ease` for expand (slow start) vs `spring` for collapse. Prayer snack body used `height: 0` with no transition on close. Prayer-times-list/ramadan-card had different durations for open vs close (0.4s vs 0.35s).
- **Fix:** All expand/collapse animations standardized to `--t-spring` symmetrically. Prayer snack close now uses `grid-template-rows: 0fr` on `#prayer-expanded-wrap`. Subtag groups, filter chips, itinerary legs, intermediate stops, dir-time-bar, custom-time-row, pill-expand width, pill-panel all normalized.
- **Typography:** Sheet headings and form headings bumped from `semibold` to `bold`, letter-spacing tightened to `-0.02em` for more visual hierarchy. Panel heading template updated. Added `--txt-display: 26px` token. Itinerary duration tracking tightened to `-0.03em`.
- **Decision:** `--t-spring` is the universal expand/collapse timing. Framework (React) rejected — not needed for design quality.
- Files: `src/styles/styles.css`, `src/styles/design-tokens.css`.

### 2026-03-27 — UI Redesign Mock v4 (lighter presentation)
- User felt the previous redesign mock contained too much information and wanted a cleaner visual mockup.
- New mock created at `docs/ui-redesign-v4.html` with the same high-level shell direction but stripped down to minimal content so the evaluation focuses on visual feel and layout only.

### 2026-03-24 — Missing bus stops in Kokkola & Seinäjoki
**Problem:** Kokkola (219 stops) and Seinäjoki (475 stops) had no visible bus stops except the train station. Root cause: Digitransit Waltti has no GTFS data for those cities' local bus networks, so all bus stops got `routes: []` in the cache → `hasRoutes=0` → hidden on map.
**Fix (two phases):**
1. **Visibility:** Added `noCoverage` detection in `build-cache.js` — regions where <10% bus stops match Waltti routes are flagged. Client (`processTransitStops`) skips hide logic for `noCoverage` stops.
2. **Route data from OSM:** Since Waltti/Digitransit has no route data, added Overpass-based route fetching:
   - Build-time: `build-cache.js` fetches `relation["route"="bus"]` for noCoverage bboxes, matches to stops via OSM ID + proximity grid (~80m). Pre-populates cache.
   - Runtime: `fetchStopRoutesFromOSM()` in `transit-stops.js` queries Overpass when user clicks a noCoverage stop without cached routes (finds nearby bus_stop/stop_position nodes → gets parent route relations).
   - Result: 83/475 Seinäjoki and 16/219 Kokkola stops got pre-cached routes. Remaining stops try Overpass on click.
**Files modified:** `scripts/build-cache.js`, `src/transit-stops.js`, `scripts/transit-cache.json`.

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

### 2026-03-28 — GPS Puck Rotation Fix + Route Follow Mode
- **Bug fix:** GPS puck arrow was pointing 90° to the right (east) instead of north when heading was 0. Root cause: the rotation offset in `_applyConeRotation()` was `-135` but should be `+135` to compensate for the sharp corner being at the bottom-left (225° from north) of the teardrop shape. CSS default rotation also updated from `-135deg` to `135deg`.
- **New feature:** When GPS tracking is active AND a route is displayed (`dir.routeLayers.length > 0`), the map now auto-pans to follow the user's position on each GPS update using `easeTo` (600 ms). This lets users follow a route hands-free without repeatedly re-centering.
- Files: `src/map-controls.js`, `src/styles/styles.css`.

### 2026-03-29 — Navigation trigger confirmation hardening
- User requirement: no amount of generic movement should advance turn-by-turn steps; the next step should appear only after GPS confirms the user is actually inside that step's trigger point.
- Fix: navigation now stores GPS accuracy, computes cumulative route-progress checkpoints for each maneuver, and only advances when both conditions pass: the live GPS fix is within the step threshold and the snapped route progress matches that maneuver's point on the route.
- HUD change: removed premature next-step preview text so future instructions are not shown before the trigger is confirmed.
- Validation: targeted Playwright smoke run passed app-load checks; one unrelated pre-existing failure remains in `tests/01-dom-elements.spec.js` for the suggest-form Google Maps field requirement.
- Files: `src/navigation.js`, `src/map-controls.js`, `src/utils.js`.

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

### 2026-03-23 — Multi-Region Transit Support (All Waltti Cities)
- Expanded transit stop coverage from 2 regions (Helsinki HSL + Turku Föli) to 17 Finnish transit cities.
- New cities: Tampere, Lahti, Jyväskylä, Kuopio, Oulu, Joensuu, Lappeenranta, Hämeenlinna, Kotka, Kouvola, Mikkeli, Vaasa, Pori, Rovaniemi, Kajaani.
- Added Finland-wide rail bbox for VR intercity train stations between cities.
- All new cities use the existing Digitransit Waltti endpoint (same API key, no new keys needed).
- Transit cache builder (`build-cache.js`) now fetches in batches of 3 regions with auto-retry for failed batches.
- Cache version bumped to v3; localStorage cache key bumped to `hf_transit_v2`.
- Transit routing in `directions.js` now routes within any Waltti city pair via the Waltti endpoint.
- No visual changes — new stops use the same rendering pipeline (GTFS dotColor → type fallback).
- Files modified: `src/transit-stops.js`, `src/directions.js`, `scripts/build-cache.js`, `scripts/transit-cache.json`.

### 2026-03-23 — GTFS Color Contrast Fix for Multi-Region Stops
- Audited all 26 unique GTFS route colors from Waltti + HSL transit agencies.
- Found 12 bright colors (yellows, cyans, limes, pinks) with <3:1 contrast on light backgrounds, and 2 deep colors (navy, magenta) with <3:1 on dark surfaces.
- Fix strategy: `color-mix()` in CSS — blend 72% original + 28% `#222` for light mode, 62% original + 38% white for dark mode.
- Applied to `.sp-chip` (route chips), `.sp-badge` (stop type badge), `.sp-icon` (stop icon).
- Added `labelColor` property computation in `processTransitStops()` for map text labels: bright GTFS colors (luminance > 0.38) get darkened for readable map labels with white halo.
- All 3 label layers (`transit-major-label`, `transit-tram-label`, `transit-bus-label`) now prefer `labelColor` → `dotColor` → static fallback.
- Result: 25/26 colors pass ≥3:1 in both modes. One extreme yellow (`#ffcd42`, Hämeenlinna only) improved from 1.5:1 to 2.6:1.
- Existing HSL/Föli colors unaffected (still 4.7–7.1 light, 5.0–8.4 dark).
- Files modified: `src/styles/styles.css`, `src/transit-stops.js`.

### 2026-03-24 — Kokkola and Seinäjoki city bus support added
- User noticed Kokkola train station was already showing on the map — that was
  due to the Finland-wide rail bbox (Helsinki–Oulu main line passes through it).
- Added dedicated bounding boxes for Kokkola and Seinäjoki city bus networks
  (both have full Waltti GTFS feeds in Digitransit).
- Transit cache grew from 26,897 → 27,582 stops: +219 Kokkola, +475 Seinäjoki.

### 2026-03-28 — Animation JS-driven close fixes (round 2)
- **Context:** Previous CSS-only fix standardized all transitions to `--t-spring`, but 4 animations still had JS-driven abruptness where code defeated the CSS transitions.
- **Prayer vertical close:** `togglePrayerExpanded()` cleared `innerHTML = ""` immediately on collapse, removing DOM content before the `grid-template-rows: 1fr → 0fr` transition could play. Fix: delay the innerHTML clear by 350ms with a guard check (`if (!el.classList.contains("expanded"))`).
- **Prayer horizontal close:** `#prayer-expanded-wrap` had a `grid-template-rows` transition that the search bar doesn't have, making the prayer pill shrink both vertically and horizontally (search only shrinks horizontally via `width` transition + instant `height: 0`). Fix: removed the `transition` from `#prayer-expanded-wrap` so grid changes are instant, matching the search bar's `.pill-expand-body` pattern.
- **Sheet close (places + directions):** Both `closePlacesSheet()` and `closeDirPanel()` set `hidden = true` immediately after adding `.shut`, which removed elements from layout before the CSS `transform: translateY(100%)` transition could play. Fix: delay `hidden = true` by 400ms via `_hideTimeout`, with cancellation on re-open to prevent stale timeouts.
- **City group expand:** Lazy content injection and `.shut` removal in the same JS frame caused the browser to skip the intermediate `0fr` layout state, preventing the `grid-template-rows: 0fr → 1fr` transition. Fix: forced reflow via `void body.offsetHeight` after lazy content injection, before removing `.shut`.
- **Decision:** Use `setTimeout` with duration matching CSS transition for deferred cleanup. Cancel pending timeouts on re-open. Guard innerHTML clearing with state checks.
- Files: `src/prayer.js`, `src/places.js`, `src/directions.js`, `src/styles/styles.css`.

### 2026-03-27 — Sheet close animation (CSS transition fix)
- **Problem:** Places and routes sheets had smooth open animations (slide up/in + fade in) but no visible close animation — they disappeared instantly.
- **Root cause:** Mobile `.sheet` CSS transition only covered `transform` and `height`, but `.sheet.shut` also sets `opacity: 0` and `visibility: hidden`. Without `opacity` in the transition list, the sheet snapped invisible before the `transform: translateY(100%)` slide could play. Desktop already had `opacity` in the transition but was missing `visibility`.
- **Fix:** Added `opacity` (with spring curve) and `visibility` to the `.sheet` transition on both mobile and desktop breakpoints. Now closing matches the tools-toggle pattern: smooth slide + fade out, then `visibility: hidden` flips at the end.
- **Decision:** Sheet transitions must include all four properties: `transform`, `opacity`, `visibility`, `height`. The `visibility` transition keeps the element rendered during the animation, then hides it discretely at the end (CSS spec: `visibility` stays at the start value for the full duration, then flips).
- Files: `src/styles/styles.css`.

### 2026-03-27 — Modern animation overhaul (sheets + tools toggle)
- **User feedback:** Open/close animations for places, routes, and tools toggle felt "old fashioned" — wanted something modern and sleek.
- **New easing tokens:** Added `--ease-expo: cubic-bezier(0.16, 1, 0.3, 1)` (aggressive deceleration for sheets/panels) and `--ease-spring-pop: cubic-bezier(0.34, 1.56, 0.64, 1)` (bouncy overshoot for small elements like pills).
- **Mobile sheets:** Duration 0.4s → 0.32s, easing → `--ease-expo`, `.shut` now `translateY(100%) scale(0.92)` (adds shrink depth cue during slide), `transform-origin: bottom center` added. Opacity fades at 0.2s (faster than transform for "materialize" effect).
- **Desktop sheets:** Duration 0.35s → 0.28s, easing → `--ease-expo`, `.shut` now `translateX(20px) scale(0.97)` (less travel + scale depth, was `translateX(40px)` no scale).
- **Tools toggle — asymmetric open/close:** Enter uses `--ease-spring-pop` at 0.38s (bouncy pop with overshoot), exit uses `ease-in` at 0.18s (quick pull-away). Start scale 0.92 → 0.82 (more dramatic pop). Stagger tightened: open 0/0.04/0.08s, close 0/0.02/0.04s.
- **Scrim:** Matched to faster sheet timing (0.3s → 0.2s with `--ease-expo`).
- **Decision:** Asymmetric easing (bouncy enter, fast exit) is acceptable for discrete UI elements like tool pills. Sheets keep symmetric easing.
- Files: `src/styles/design-tokens.css`, `src/styles/styles.css`.

### 2026-03-24 — Kokkola and Seinäjoki city bus support added
- User noticed Kokkola train station was already showing on the map — that was
  due to the Finland-wide rail bbox (Helsinki–Oulu main line passes through it).
- Added dedicated bounding boxes for Kokkola and Seinäjoki city bus networks
  (both have full Waltti GTFS feeds in Digitransit).
- Transit cache grew from 26,897 → 27,582 stops: +219 Kokkola, +475 Seinäjoki.
- Both cities added to WALTTI routing array in `directions.js` so Digitransit
  Waltti endpoint is used when both origin and destination are within either city.
- Files modified: `src/transit-stops.js`, `src/directions.js`, `scripts/build-cache.js`, `scripts/transit-cache.json`.

### 2026-03-24 — OSM ref tag filter removed (codeless stops fix)
- Root cause of sparse stops in Lahti, Pori, Lappeenranta, Mikkeli, Kouvola,
  Rovaniemi, Kajaani: build-cache.js and transit-stops.js filtered out any
  bus/tram stop lacking an OSM `ref` tag (the stop code).
- These cities have incomplete OSM tagging — their bus stops exist in the DB
  but lack ref tags because local transit authorities never contributed them.
- Fix: removed `!el.tags.ref` guard; codeless stops now reach the existing
  name+location fallback matching logic (was already in place, just unreachable).
- Result: 14,371 → 26,897 stops across all 17 regions.
- Pattern to follow: never gate OSM data inclusion on a secondary tag; use it
  only as a matching signal, not a filter.
- Files modified: `scripts/build-cache.js`, `src/transit-stops.js`.

### 2026-03-25 — Sponsorship System Implementation (v1)
**Scope:** Full implementation of the sponsorship feature from `docs/sponsorship-plan-print.html`.
**Data model:** 3 new Google Sheet cols (J=`sponsor_tier`, K=`sponsor_promo`, L=`sponsor_promo_text`). Boycott always suppresses sponsor data server-side (Apps Script) and client-side (JS rendering).
**Files modified:**
- `scripts/apps-script/Code.gs` — reads cols J–L, boycott suppresses sponsor output
- `src/styles/design-tokens.css` — `--sponsor`/`--sponsor-soft` aliases, `.pp-sponsor` badge, `.pl-sponsor-chip`, `.pp-promo-btn`, `.r-sponsor-label`, `.pp-sponsor-tip`, `sponsorPulse`/`sponsorPulseStrong` keyframes
- `src/styles/styles.css` — `.place-mk--sponsored`/`--spotlight` marker glow, carousel styles, dark mode overrides
- `src/places.js` — popup sponsor badge + tooltip + promo button, list card chip, carousel at list top, marker glow class, first-encounter transparency toast
- `src/icons.js` — `makePlaceMarkerHTML()` accepts `sponsorTier` param → glow class
- `src/search.js` — `_localPlaceSearch()` score boost (featured +0.15, spotlight +0.25), max 2 sponsored in top 4, "· Sponsored" label in results
- `functions/_middleware.js` — Spotlight shares append "— Sponsored Partner" to OG description
- `docs/DESIGN_SYSTEM.md` — §8 Sponsorship Templates section added
**New tokens:** `--sponsor`, `--sponsor-soft`
**New templates:** `.pp-sponsor`, `.pl-sponsor-chip`, `.r-sponsor-label`, `.pp-sponsor-tip`
**New keyframes:** `sponsorPulse`, `sponsorPulseStrong`
**Decisions:** Tooltip text avoids "halal verification" language. Search label format: "Name ✓ verified · Sponsored". Carousel only for Spotlight restaurants, max 6.

### 2026-03-25 — Sponsorship v1 fixes
**Feedback applied:**
- Carousel shows all place types, not just restaurants. Title changed to "Sponsored Places".
- Removed promo link button from popup — promo access is via the Promos Pill only.
- Added Promos Pill (#promos-snack) next to Prayer Times pill. Lists all places with active promo codes. Tap a code to copy. Uses pill-expand pattern.
- Carousel cards now show type icon dot + name + address.
- Promos pill repositions below prayer pill when prayer is expanded.
**Files modified:** `places.js`, `index.html`, `styles.css`, `design-tokens.css`
**Decisions:**
- Sponsored places can be any type (mosque, shop, restaurant, prayer room) — not just restaurants.
- No promo button in popup — promos are centralised in the Promos Pill panel.
- Promo codes are plain text copied to clipboard (no unique IP-hash suffix in v1).

### 2026-03-25 — Sponsorship System Implementation (Phase 1–8)
**What was built:** Full sponsorship system code across 8 phases — data layer through transparency toast.
**Files modified:**
- `scripts/apps-script/Code.gs` — extended `getPlacesJSON()` to read sponsor columns J–L (tier, CTA, promo text). Boycott suppresses sponsor data server-side.
- `src/styles/design-tokens.css` — added `--sponsor` / `--sponsor-soft` aliases for `--gold`, sponsor chip templates (`.chip-sponsor`, `.pp-chip-sponsor`, `.pl-sponsor-chip`), `.sponsor-badge`, `@keyframes sponsorPulse`.
- `src/styles/styles.css` — added `.place-mk--sponsored` (static glow), `.place-mk--spotlight` (pulse animation), `.pl-sponsor-chip`, `.pp-sponsor-badge`, `.pp-promo-btn`, `.r-sponsor-label`, `.sponsor-toast` + dismiss button.
- `src/places.js` — popup "Sponsored" badge in header, promo button (external link icon) in action row for places with CTA, gold glow classes on markers (featured=static, spotlight=pulse), "Sponsored" chip in list cards, first-encounter transparency toast (localStorage gated, 8s auto-dismiss).
- `src/search.js` — sponsored places boosted to top of local results, "Sponsored" label in search dropdown.
- `functions/_middleware.js` — fixed OG meta sponsor suffix to use `place.sponsor?.tier` (nested object) instead of `place.sponsor_tier`.
- `docs/DESIGN_SYSTEM.md` — documented sponsor tokens, chip modifiers, badge templates, marker modifiers.
**Data shape:** `place.sponsor = { tier: "basic"|"featured"|"spotlight", cta?: "url", text?: "promo text" }`. Boycott always suppresses.
**Decisions:**
- Sponsor data is a nested `sponsor` object (not flat fields) for clean optional semantics.
- Boycott suppression is double-gated: server-side in Apps Script + client-side guards in every UI touchpoint.
- Toast uses localStorage key `hf_sponsor_toast_seen` — shown once per device, auto-dismisses after 8s or on "OK" click.

### 2026-03-25 — Sponsorship UI Overhaul (per user feedback)
**What changed:** Major rework of sponsor UI based on user feedback ("this is crap").
**Removed:**
- External link button from popup action row (was opening sponsor URL in new tab)
- First-encounter sponsor transparency toast (localStorage-gated, `_maybeSponsorToast`)
- Sponsor toast CSS (`.sponsor-toast`, `.snack-dismiss`)
- Old `.pp-promo-btn` action-row styles
**Added:**
- **Promos pill** (`#promos-snack`) — beside prayer pill at `left: 68px`. Lists all places with promo codes. Tap a promo to copy code + show toast with promo text. HTML was already in `index.html`; added JS wiring + CSS.
- **Popup promo copy button** — tag icon positioned beside fav star (`right: 34px`). Copies promo code via `copyToClipboard()`, shows toast with code + promo text.
- **Sponsored carousel** — horizontal scroll strip at top of places list inside `#places-scroll`. Filtered by active type tab (all=all, restaurant=only sponsored restaurants, etc). Cards show type dot + name + address. Click opens popup. Scroll-snap, no scrollbar.
**Files modified:** `src/places.js`, `src/styles/styles.css`

### 2026-03-25 — Sponsored carousel smooth showcase pass (round 6)
**User request:** Keep manual scrolling, but make the carousel feel smoother and ensure it auto-scrolls on its own so sponsored places are visible even when the user does nothing.

**Behavior chosen:**
- Auto-scroll is now a smooth showcase strip, not a continuous rAF crawl.
- The carousel advances one card-width at a time with smooth scrolling, which keeps each sponsor readable before moving on.
- Manual interaction still wins immediately: wheel, touch, and pointer input pause the showcase, then it resumes shortly after inactivity.
- Desktop wheel scrolling is also smoothed so horizontal movement no longer feels abrupt.

**Implementation decisions:**
- Replaced the rAF-based pixel crawl with timed smooth card-to-card advancement.
- Restored smooth programmatic scrolling on the carousel track because the auto-scroll is now step-based rather than per-frame.
- Auto-scroll resume delay shortened so the strip behaves like an always-on showcase instead of a one-time animation.

**Files modified:** `src/places.js`, `src/styles/styles.css`

### 2026-03-25 — Sponsored carousel loop stability fix (round 7)
**Problem:** On phone, the sponsored carousel could eventually drift to the real scroll edge, making auto-scroll appear to jump backward to the start. Manual swipes could also feel stuck until the user lifted and touched again.

**Root cause:** Loop normalisation was happening too late and only after scroll settled. That allowed the browser to hit the physical edge of the duplicated strip during fast touch interaction or longer auto-scroll sessions.

**Fix pattern:**
- Recenter the carousel invisibly during scroll, not only after scrolling ends.
- Keep all auto-scroll targets inside the middle loop band rather than advancing against absolute scroll positions.
- Snap alignment should be relative to the middle loop band, never to the raw scroll origin.
- Mobile touch cooldown still pauses snapping/auto-scroll for usability, but recentering remains allowed because it is visually invisible and prevents edge stalls.

**Files modified:** `src/places.js`

### 2026-03-25 — Sponsored carousel forward-only wrap fix (round 8)
**Problem:** Even with loop recentering, phone auto-scroll could still appear to move in the opposite direction. Root cause: when the next logical card wrapped across the loop boundary, smooth scrolling was being asked to animate to a smaller absolute `scrollLeft`, which the browser rendered as backward motion.

**Fix pattern:**
- Before every auto-advance, move the current aligned position into a safe forward band with enough room for one more card-width to the right.
- Only then run the smooth scroll forward.
- Never ask `scrollTo({ behavior: "smooth" })` to cross a loop boundary by lowering the absolute target value.

**Files modified:** `src/places.js`
**Decisions:**
- No external links from popup — promo access is copy-to-clipboard only.
- No initial sponsor toast — user explicitly doesn't want it.
- Promos pill shows all places with a `sponsor.cta` value (the promo code).
- Carousel filters by active type tab, so "Restaurants" tab shows only sponsored restaurants.
- Promo button in popup uses tag icon (same as promos pill icon) for consistency.

### 2026-03-25 — Sponsored carousel mobile rAF animation fix (round 9)
**Problem:** On phone, auto-scroll still went backward after several forward advances. Manual scroll worked perfectly; only auto-scroll was affected. Worked fine on PC.

**Root cause (3 issues):**
1. `scrollTo({ behavior: "smooth" })` on mobile browsers can be cancelled or redirected when `scrollLeft` is modified mid-animation. The scroll handler was calling `_recenterCarouselLoop` on every scroll event — including during the auto-scroll's smooth animation — and this `scrollLeft` write was fighting the browser's smooth scroll engine on mobile.
2. `_getAlignedCarouselLeft` used `Math.round` which could return `bounds.max` at boundary conditions, causing downstream functions to smooth-scroll to the edge where recentering then jumped backward.
3. The combination of issues 1+2 created a cascade: smooth scroll target near boundary → scroll event fires mid-animation → recentering writes scrollLeft → browser cancels/reverses smooth scroll → visible backward motion.

**Fix (3 changes):**
1. **Replaced `scrollTo({ behavior: "smooth" })` with manual `requestAnimationFrame` animation** (`_animateCarouselTo()`). This gives us full control over the scroll position each frame — no browser smooth-scroll engine to fight with. Used for both auto-advance (400ms) and snap-to-card (300ms).
2. **Guarded `_recenterCarouselLoop` in scroll handler** so it only runs when auto-scroll is NOT active. `advance()` already recenters before each step, so scroll-handler recentering during auto animation is both unnecessary and harmful on mobile.
3. **Bounds-clamped `_getAlignedCarouselLeft`** — added `if (aligned >= bounds.max) aligned -= metrics.oneSet` to prevent `Math.round` from overshooting into the boundary.

**Pattern to follow:** Never use `scrollTo({ behavior: "smooth" })` for programmatic carousel animations on mobile. Use rAF-driven animation with easing instead — it's immune to mid-scroll interference from event handlers.

**Files modified:** `src/places.js`

### 2026-03-25 — Sponsored pin tier selections finalized
**User selections from the comparison page:**
- **Basic:** B3 — white border + outer gold ring
- **Featured:** F2 — white border + static gold ring and glow
- **Spotlight:** S2 — white border + pulsing gold ring and glow

**Reasoning captured:** The white border remains more legible on the map than a pure gold border, so sponsored tiers should keep the white edge for contrast and push the sponsorship signal into an outer gold ring/glow layer instead.

**Implementation pattern:**
- Basic keeps the normal white puck border and adds a clean outer gold ring only.
- Featured keeps the white puck border and adds a static gold ring + warm glow.
- Spotlight reuses the featured base and adds the animated gold pulse; animation should happen outside the white border, not replace it.

**Files modified:** `src/styles/styles.css`, `src/styles/design-tokens.css`, `docs/DESIGN_SYSTEM.md`

### 2026-03-25 — Sponsorship UI Visual Refinement (round 3)
**What changed:** Visual polish of carousel, promos access, and map pin glow based on user feedback ("the carousel is just ugly!").

**Carousel redesign:**
- Tall vertical cards → compact horizontal row cards (22px type dot | name + address, both ellipsed)
- Section header now uses `pl-section-hdr` class for visual alignment with city-group headers (tag icon + "Sponsored" + count badge)
- Desktop mouse wheel → horizontal scroll via `wheel` event listener with `preventDefault` translating `deltaY` to `scrollLeft`
- Auto-scroll: 3s interval, scrolls one card width per tick, loops to start. Pauses on any pointer/touch/wheel interaction, resumes after 8s.
- Three lifecycle functions: `_startCarouselAuto()`, `_pauseCarouselAuto()`, `_clearCarouselAuto()`

**Promos access changed from pill-expand to overlay panel:**
- Old: `#promos-snack` pill-expand pattern (like prayer times) at `left: 68px` — got overshadowed when prayer pill expanded
- New: `#promos-pill` standalone `btn-icon-card` button + `#promos-overlay` fixed overlay panel (matching Eid prayer panel pattern)
- Overlay: centered card with `suggest-head` header, scrollable promo list, backdrop click to close
- Promo items: type dot (28px circle) + body column (name, code, description text)
- Pill repositions right when prayer pill is expanded (`#prayer-snack:not(.collapsed) ~ #promos-pill` CSS)
- `index.html` updated: pill-expand div → btn-icon-card button + overlay div

**Map pin glow strengthened:**
- `.place-mk--sponsor-basic` (basic tier): gold border only (`border-color: var(--sponsor) !important`)
- `.place-mk--sponsored` (featured tier): gold border + dual box-shadow (3px ring at 50% opacity + 10px glow at 30%)
- `.place-mk--spotlight` (spotlight tier): same as featured + `@keyframes sponsorPulse` animation (ring pulses 3px→6px, glow pulses 10px→16px)
- `sponsorPulse` keyframes strengthened from single to dual box-shadow pulse

**Files modified:** `src/places.js`, `src/styles/styles.css`, `src/styles/design-tokens.css`, `index.html`
**Decisions:**
- Promos button follows Eid button UX pattern (standalone button → overlay panel), not pill-expand pattern.
- Carousel cards are 180px wide, horizontal layout, with scroll-snap. Auto-scroll is a passive showcase, not intrusive.
- Three-tier pin glow: basic = subtle gold border, featured = static gold glow ring, spotlight = pulsing gold glow.
- Auto-scroll resumes after 8s of inactivity — long enough to not feel intrusive.

### 2026-03-25 — Sponsorship Design Uniformity Pass (round 4)
**User demand:** "UNIFORM DESIGN IS THE KEY" — all sponsor UI must match existing design patterns (place cards, section headers, icon shapes).

**a. Sponsored pins on top when overlapping:**
- Set `el.style.zIndex` on marker elements: basic=2, featured=3, spotlight=4
- Ensures sponsored pins render above regular pins when zoomed out

**b. Promos button DOM order + Eid stacking:**

### 2026-03-27 — Skeleton Loading States
**What was built:** Replaced all blank/spinner loading states with animated skeleton placeholders across the app.
**Files modified:** `src/styles/design-tokens.css`, `src/styles/styles.css`, `src/places.js`, `src/prayer.js`, `src/directions.js`, `src/search.js`, `src/transit-stops.js`, `docs/DESIGN_SYSTEM.md`.
**Design system changes:**
- Promoted `.skel-bone`, `.skel-line`, and `@keyframes shimmer` to `design-tokens.css` as reusable templates.
- Added 5 skeleton layout variants to `styles.css`: `.pl-skeleton` (places cards), `.prayer-skel-item` (prayer times), `.itin-skeleton` (itinerary cards), `.search-skel-item` (search results), `.sp-skel-routes` (transit stop routes).
- Documented skeleton system in `DESIGN_SYSTEM.md` §13.
**Decisions:**
- 2026-03-27 — Skeleton shimmer: opacity pulse (1 → 0.45, 1.2s ease-in-out alternate) over gradient sweep. Simpler, GPU-friendly, consistent with existing flat design.
- 2026-03-27 — Skeleton counts: 6 place cards, 5 prayer rows, 3 itinerary cards, 4 search results, 4 transit route chips — match typical content visible without scrolling.
- 2026-03-27 — Search shows local results instantly + skeletons for pending API results. If no local matches, full skeleton.
- 2026-03-27 — Transit stop routes: skeleton chip pills replace old spinner+text pattern.
- 2026-03-27 — Places skeleton shown via `!placesLoaded` guard in `renderPlacesList()` — first-visit users see shimmer while data fetches.

### 2026-03-28 — CSS Design System Compliance Sweep
**What was fixed:** Comprehensive tokenization of hardcoded values across `design-tokens.css` and `styles.css`.
**New tokens created:**
- `--on-accent: #fff` — text/icons on any accent or colored background (stable across light/dark mode)
- `--shadow-xs: 0 1px 2px rgba(0,0,0,0.06)` — micro-subtle shadow for filter toggles (+ dark override)
- `--sp-0: 2px`, `--sp-0h: 3px`, `--sp-1h: 5px`, `--sp-2h: 7px`, `--sp-3h: 9px`, `--sp-4h: 11px`, `--sp-7h: 18px`, `--sp-10: 28px`, `--sp-11: 36px` — half-step spacing tokens
- `--t-slow: 0.4s ease` — theme transition duration
- `--t-x-slow: 0.5s ease` — heavy transitions (map canvas filter)
**Hardcoded `#fff` → `var(--on-accent)`:** 37 instances across both CSS files — all `color: #fff`, `stroke: #fff` on colored backgrounds. Kept literal `#fff` for marker border rings and body/surface backgrounds.
**Hardcoded transitions → tokens:** ~53 instances. `0.12s/0.15s` → `--t-fast`, `0.2s` → `--t-fast`, `0.25s ease` → `--t-med`, `0.4s ease` → `--t-slow`, `0.5s ease` → `--t-x-slow`.
**Hardcoded gap/padding → `--sp-*`:** ~25 instances in design-tokens.css template classes tokenized.
**480px breakpoint → 380px:** Tutorial card responsive breakpoint corrected to approved set.

### 2026-03-29 — Turn-by-Turn Navigation Module
**What was built:** Google Maps–style turn-by-turn navigation engine with HUD overlay that replaces the route snackbar when the directions panel is closed.

**Architecture:**
- New module `src/navigation.js` (~560 lines) — navigation engine, HUD controller, GPS handler, simulator.
- **Hook pattern** to avoid circular imports: `directions.js` exports `setNavHooks()`, `navigation.js` calls it at module evaluation time to register `maybeStart`, `stop`, `isActive`. This lets `directions.js` call nav functions without importing from `navigation.js`.
- Unified step model: all modes (drive/walk/cycle/transit) produce normalized step objects with `{ type, mode, instruction, distance, iconHtml, lat, lng, ... }`.

**Modes supported:**
- **Direct (drive/walk/cycle):** Uses raw OSRM step data stored in `dir.directSteps` during route calculation. Includes maneuver type/modifier, location coordinates, and pre-rendered instruction text. Fallback: DOM-parsing from `.direct-step` elements.
- **Transit:** Builds steps from OTP itinerary legs — walk segments (single instruction), board (route + headsign), intermediate stops (passing notifications), alight (get off). Color-coded route chips using `legCssColor()`.

**GPS integration:**
- Listens for custom `hf:current-location-updated` event (already dispatched by `map-controls.js`).
- `snapToRoute()` — nearest-point-on-polyline algorithm for route snapping.
- `_advanceStep()` — proximity-based step advancement with mode-specific thresholds: walk 25m, cycle 35m, drive 40m, transit stops 80m, transit board/alight 60m.
- Off-route detection: 50m threshold, 3 consecutive off-route readings → `_triggerReroute()`. Cooldown of 15s.
- Rerouting: updates `dir.origin` to current position, calls `findRoutes()`, restarts navigation with new data.

**HUD:**
- Replaces route snackbar when nav is active (`updateSnackbar()` returns early if `_navHooks.isActive()`).
- Top bar: maneuver icon (48px accent square with SVG), instruction text, distance to next maneuver, mode badge, expand/exit buttons.
- Bottom bar: ETA, remaining time, progress bar, simulator button.
- Transit mode: color-coded route chips (`nav-route-chip`), stop dots, mode-specific icons.
- Uses `snackUp` animation for entry, `snackDown` for exit.

**Integration points in directions.js:**
- `closeDirPanel()` → calls `_navHooks.maybeStart()` (auto-start on panel close)
- `openDirPanel()` → calls `_navHooks.stop()` (return to itinerary view)
- `clearRoute()` → calls `_navHooks.stop()` + clears `dir.directRouteCoords/directSteps`
- `findRoutesDirect()` → stores `dir.directRouteCoords` and `dir.directSteps` for nav module access
- `_dtDirectRoute()` and `_osrmDirectRoute()` → return `rawSteps` arrays with coordinates

**Simulator:** `simNextStep()` advances step index and `easeTo` step coordinates. Allows full testing without GPS.

**Bug fixes applied (from code review):**
- All DOM element references in `renderHUD()`, `updateETADisplay()`, `_triggerReroute()`, `simNextStep()` guarded with null checks.
- `leg.legGeometry?.points` guard in `buildTransitSteps()` and `startNavigation()` — transit legs without geometry are safely skipped.

**New design tokens:** `--z-nav-hud: 10`
**New template classes:** `.nav-maneuver-icon`, `.nav-instruction`, `.nav-distance`, `.nav-next-info`, `.nav-eta`, `.nav-progress`, `.nav-progress-fill`, `.nav-route-chip`, `.nav-stop-dot`, `.nav-mode-badge`, `.nav-sim-btn`
**Files modified:** `src/navigation.js` (new), `src/directions.js`, `index.html`, `src/styles/styles.css`, `src/styles/design-tokens.css`, `src/app.js`, `sw.js`
**Decisions:**
- 2026-03-29 — Auto-start navigation on panel close, not via explicit button.
- 2026-03-29 — Hook pattern for circular dependency avoidance between directions.js ↔ navigation.js.
- 2026-03-29 — Simulator button always visible (not gated to dev mode) so user can test without GPS.
- 2026-03-29 — Off-route threshold 50m, reroute after 3 consecutive OOR readings, 15s cooldown.
- 2026-03-29 — Mode-specific step advancement thresholds (walk=25m, cycle=35m, drive=40m, transit=60-80m).
**Box-shadow on `#tf-toggle`/`#sort-toggle`:** `0 1px 2px rgba(0,0,0,0.06)` → `var(--shadow-xs)`.
**Tests:** 132/136 passed (4 failures are pre-existing `sg-gmaps required` test, unrelated).
**Docs updated:** `DESIGN_SYSTEM.md` — new tokens documented in spacing, shadow, transition, and brand palette tables.
**Files modified:** `src/styles/design-tokens.css`, `src/styles/styles.css`, `docs/DESIGN_SYSTEM.md`.

### 2026-03-27 — Location priority & distance sort guard
**What was built:** (a) Toast when user tries to sort by distance with no location and no home set. (b) Live location takes priority over home for all distance features; home is a fallback.
**Files modified:** `src/places.js`
**Changes:**
- Added `_resolveUserLocation()` helper: checks live GPS first → falls back to home → sets `userLocLat/Lng` for distance badges and card rendering.
- `tryGetUserLocation()` now calls `_resolveUserLocation()` first, so home-location users see distance badges without needing GPS.
- Distance sort handler: tries GPS → falls back to home → shows toast "Enable location or set a home address" if neither available.
- `hf:current-location-updated` listener now also updates `userSortLat/Lng` and re-resolves location, so switching GPS on mid-session immediately updates distance sort.
- `hf:home-updated` listener now re-resolves location, so setting a home address immediately enables distance badges.
**Decisions:**
- 2026-03-27 — Live location always takes priority over home for distance features (badges, sort, "Most Relevant" anchor). Home is only used when live location is inactive.
- 2026-03-27 — Distance sort toast: "Enable location or set a home address" with sub "Needed to sort by distance" — clear, actionable.
- Root cause: `#promos-pill` was before `#prayer-snack` in DOM → CSS `~` sibling combinator couldn't work
- Fix: moved `#promos-pill` + `#promos-overlay` in `index.html` to after `#eid-pill` section
- DOM order now: `#prayer-snack` → `#eid-pill` → `#promos-pill` (all siblings)
- Added Eid-aware stacking: `#eid-pill:not(.hide) ~ #promos-pill` shifts promos 52px right
- Added combined rule for prayer expanded + Eid visible

**c. Promo overlay redesigned for uniformity:**
- Icon: `border-radius: 50%` → `var(--r-xs)` (rounded square matching `.pl-dot`)
- SVG: 10×10 → 14×14 (matching `.pl-dot svg`)
- Layout: `display: flex` → `display: grid` with `"icon name code" / "icon addr code"` (matching `.pl-card` grid)
- Added address row (`.promo-addr`) — was missing
- Promo code: moved to right column with `--txt-lg` bold gold — eye-catching
- Promo text: small right-aligned subtitle under code
- Removed `.promo-body` wrapper (grid areas replace it)
- Padding: `14px 16px` matching `.pl-card`

**d. Carousel header matches section headers:**
- Added: `font-size: var(--txt-xs)`, `font-weight: var(--fw-bold)`, `text-transform: uppercase`, `letter-spacing: 0.06em`, `color: var(--text-3)`
- Padding: `var(--sp-3) 16px var(--sp-2)` — aligns with `#places-list` content start (16px horizontal padding)
- Removed `pl-section-hdr` class from HTML (was non-functional outside `#places-list`)
- Removed separate `.sponsor-carousel-hdr span` color rule (inherited from parent)

**e. Carousel cards match place cards:**
- Icon: 22×22 circle → 28×28 rounded square (`var(--r-xs)`, matching `.pl-dot`)
- SVG: 10×10 → 14×14 (matching `.pl-dot svg`)
- Name font: `--txt-sm` → `--txt-base` (matching `.pl-name`)
- Addr font: `--txt-xs` → `--txt-sm` (matching `.pl-addr`)
- Card width: 180px → 200px (accommodates larger icon/fonts)
- Track padding: `var(--sp-5)` → `16px` left/right (aligns first card with list content area)

**Files modified:** `src/places.js`, `src/styles/styles.css`, `index.html`
**Decisions:**
- DESIGN UNIFORMITY is paramount — all sponsor UI must use same icon shapes, font sizes, padding, and layout patterns as existing components.
- `.pl-dot` shape (28×28 rounded square with `var(--r-xs)`) is the canonical icon style — never use circles for type icons.
- Place card font sizes (`--txt-base` name, `--txt-sm` addr) are the canonical sizes — carousel cards and promo items must match.
- Promo overlay uses grid layout identical to `.pl-card` grid template.
- Carousel header must exactly match section header typography (xs, bold, uppercase, 0.06em letter-spacing).

### 2026-03-25 — Sponsored carousel rebuilt from scratch (round 5)
**User correction:** Previous carousel loop implementation was rejected. The user wants the card design kept, but the carousel behavior and edge spacing rebuilt cleanly.

**Final carousel requirements implemented:**
- Cards must never touch the left or right window edge.
- Auto-scroll must be one-directional and truly infinite.
- Manual scrolling must still work in either direction.
- On desktop, mouse-wheel over the carousel must scroll the carousel horizontally instead of the page vertically.

**Implementation decisions:**
- Replaced the fake 2x duplicate-strip loop with a proper 3x looped track.
- Added a dedicated `.sponsor-carousel-viewport` wrapper that owns the side padding. The scrollable track itself no longer fakes edge spacing with pseudo-element spacers.
- Infinite loop works by starting at the middle set and normalising scroll position back into the middle band when the user or auto-scroll crosses the loop boundary.
- Auto-scroll uses `requestAnimationFrame` continuous movement in one direction, not stepped card jumps.
- Manual wheel/touch/pointer interaction pauses auto-scroll for 8 seconds, then resumes.
- Manual scrolling remains fully bidirectional because only the auto-scroll direction is constrained.

**Files modified:** `src/places.js`, `src/styles/styles.css`

### 2026-03-25 — Sponsorship date gating (start/end dates)
**What changed:** Code.gs already had `sponsor_start_date` (col M) and `sponsor_end_date` (col N) in the Places sheet, with `getPlacesJSON()` emitting `sponsor.startDate` / `sponsor.endDate` (YYYY-MM-DD strings). Client code was not respecting these dates.

**Fix:**
- Added `activeSponsor(place)` helper in `places.js` — returns `place.sponsor` if sponsorship is currently active (today is between startDate and endDate, both inclusive, both optional), otherwise `null`. Exported for cross-module use.
- Replaced all `place.sponsor && !place.boycott` checks in `places.js` (list cards, map markers, popup badge, popup promo button, promos pill, sponsor carousel) with `activeSponsor(place)`.
- Updated `search.js` to import `activeSponsor` and use it for search result boosting and sponsor label display.
- Re-fetched `data/places.json` to pick up sponsor date fields from GAS.

**Data shape update:** `place.sponsor = { tier, cta?, text?, startDate?, endDate? }`. Missing dates = no bound (always active if no start, never expires if no end).

**Files modified:** `src/places.js`, `src/search.js`, `data/places.json`

### 2026-03-26 — Sponsor pin movement animations (tier-differentiated)
**User request:** Add physical movement to sponsored map pins, with different intensity per tier.

**Animation design:**
- **Basic** (`sponsorFloat`): very subtle 1.5px vertical float, 4s cycle. Barely perceptible unless you look for it.
- **Featured** (`sponsorBounce`): soft 3px vertical bounce, 3s cycle. Clearly noticeable but not distracting.
- **Spotlight** (`sponsorBounceScale`): lively 4px bounce + 6% scale pulse, 2.2s cycle. Combined with `sponsorPulse` glow. Eye-catching.

All use GPU-composited `transform` only (preserving the `-45deg` puck rotation). No layout-triggering properties.

**New keyframes:** `sponsorFloat`, `sponsorBounce`, `sponsorBounceScale`
**Files modified:** `src/styles/design-tokens.css`, `src/styles/styles.css`, `docs/sponsorship-mockups.html`, `docs/sponsorship-plan-print.html`, `docs/SPONSORSHIP_PLAN.md`, `docs/DESIGN_SYSTEM.md`
**Decisions:**
- Movement intensity scales with tier: basic=barely visible, featured=noticeable, spotlight=eye-catching.
- Movement is separate from glow — they compose independently (spotlight gets both glow pulse + bounce+scale as two concurrent animations).
- Pin demo sections in both mockup HTMLs updated to show all 3 tiers + basic tier added to demo.
- Tier comparison tables updated to describe movement type per tier.

### 2026-03-29 — Navigation HUD Redesign (E1 Clean Baseline) + UX Changes
**What changed:** Major navigation UX overhaul based on user feedback.

**UX behavior changes:**
- **No auto-start navigation.** Closing the directions panel no longer auto-starts nav. Instead, Navigate buttons (teal, turn-right arrow icon) are added to both direct and transit route cards. User must explicitly tap Navigate.
- **Closing HUD doesn't clear route.** Exit button on HUD only stops navigation and re-shows the route snackbar. The route remains on the map.
- **Mobile full-screen nav.** `body.nav-mode` class hides search card, tool pills, zoom pill, prayer snack, eid pill, promos pill, tab bar, and route snackbar. HUD repositions to bottom of screen without tab bar offset.

**HUD redesign (E1 — Clean Baseline chosen from 8 variants):**
- Two-row chip layout replaces hero/footer structure.
- **Row 1:** 40px maneuver icon (accent bg, r-sm) + column (instruction + detail text) + 32px roundel close button (standard ✕).
- **Row 2:** Tag chips (distance chip in accent-soft, ETA chip in surface-2) + 28px circular control buttons (sim, expand).
- Progress bar: 2px with surface-2 track background.
- Compact padding: sp-3/sp-4 (was sp-4/sp-5).

**Dark mode added for HUD:**
- `html.dark-mode #nav-hud`: `#1c1c1e` bg, `#2c2c2e` border.
- Distance chip: `rgba(8,112,91,0.2)` bg, `#5ac8ad` text.
- ETA chip: `#2c2c2e` bg, `#adadad` text.
- Control buttons: `#2c2c2e` bg, hover `#3a3a3c`.
- Progress bar track: `#2c2c2e`.

**Navigate button redesign:**
- Icon: paper plane → turn-right arrow (`M5 12h14M13 6l6 6-6 6`).
- Color: green (`--success`) → teal (`--accent`).

**Removed from HUD:** `.nav-distance` standalone span, `.nav-mode-badge`, `.nav-exit-btn`, `.nav-sim-btn`, `.nav-hud-hero`, `.nav-hud-footer`, `.nav-hud-meta`, `.nav-eta`, `.nav-remaining`, `.nav-eta-sep`.
**Added to HUD:** `.nav-chip`, `.nav-chip-dist`, `.nav-chip-eta`, `.nav-detail`, `.nav-progress-bar`, `.nav-hud-row1`, `.nav-hud-row2`, `.nav-hud-col`, `.nav-tags`.
**Removed import:** `dirModeIconSvg` (was only used for mode badge, now removed).

**Files modified:** `index.html`, `src/styles/design-tokens.css`, `src/styles/styles.css`, `src/navigation.js`, `src/directions.js`, `sw.js`.

**Decisions:**
- 2026-03-29 — E1 Clean Baseline chosen over E2–E8 variants (Frosted, Accent Spine, Inset Track, Dark Slab, Divided Band, Outlined, Floating Island). User wanted the cleanest, most standard option.
- 2026-03-29 — Navigate button uses teal accent, not green success. Turn-right arrow icon, not paper plane.
- 2026-03-29 — No auto-start on panel close. Explicit Navigate button required (reverses earlier auto-start decision).
- 2026-03-29 — HUD close = stop nav only, route stays on map. User can re-enter nav or clear from snackbar.
- 2026-03-29 — Standard roundel close button on HUD (not a small ctrl-btn).
- 2026-03-29 — Chip-based info display (distance + ETA as tag chips) preferred over separate text elements.
- 2026-03-29 — Navigation starts with pan to first step, not route overview.
- 2026-03-29 — Expand/maximize pauses nav, doesn't stop it. Navigate button resumes from exact position if route unchanged. New route calculation invalidates paused state.

### 2026-03-29 — Navigation Start Pan + Pause/Resume
**a. Pan to first step on start:**
- `startNavigation()` now calls `map.easeTo()` to the first step's coordinates after rendering the HUD, so the user immediately sees where to go instead of the route overview.
- `resumeNavigation()` similarly pans to the current step position.

**b. Expand pauses instead of stopping:**
- Added `navPaused` state flag + `pauseNavigation()` and `resumeNavigation()` exports.
- `pauseNavigation()`: hides HUD, removes GPS listener, but preserves all state (steps, stepIdx, coords, etc.).
- `resumeNavigation()`: restores HUD, re-attaches GPS listener, pans to current step. Returns `true` if resumed, `false` if nothing to resume.
- HUD expand button now calls `pauseNavigation()` + `openDirPanel()` instead of `stopNavigation()`.
- `openDirPanel()` now calls `_navHooks.pause()` instead of `_navHooks.stop()`.
- Navigate button handlers: try `_navHooks.resume()` first; only call `_navHooks.startNav()` if resume returns false.
- `findRoutes()` invalidates paused state (`_navHooks.stop()`) when recalculating, so changed routes don't stale-resume.
- `clearRoute()` already calls `stop()` which resets `navPaused = false`.
- Hook interface expanded: `{ startNav, stop, pause, resume, isActive, isPaused }`.

**Stale ref cleanup:** Fixed 2 remaining `hudDistance` references in `_triggerReroute()` and `simNextStep()` → changed to `hudDistChip`.

**Files modified:** `src/navigation.js`, `src/directions.js`, `sw.js`.
