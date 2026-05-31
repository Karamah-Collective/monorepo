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
- No button size/transform feedback on hover/press/tap. Color/filter/opacity feedback only.
- Buttons should be fully rounded pill-shaped (`--r-pill`). Primary, secondary, and danger buttons all use `--r-pill` (999px). Icon-card buttons use `--r-lg` (20px). Form inputs use `--r-md` (14px).
- Buttons must be EITHER icon-only OR text-only. Never combine an icon with text in the same button. Structural indicators (chevrons for expand/collapse, thumbs-up with vote counts) and mode segment icons are exempt.
- Design vision: "Premium Utility" — clean, airy, generous spacing, dramatic typography hierarchy, consistent radii + animations across all components.
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

- **2026-05-12 — Type scale tightened: 12→30 instead of 11→36.** Smaller spread across the scale. xs bumped 11→12, xl 18→17, 2xl 20→19, 3xl 26→22 (panel headings), 4xl 30→26, display 36→30. Middle (sm/base/md/lg) unchanged. Step ratios now ~1.06–1.15x, much more even.
- **2026-05-12 — Weight hierarchy: 4-tier (regular/medium/semibold/bold).** Bold reserved for panel h2/h3 headings and primary CTAs only. Semibold for badges, counts, section labels, popup titles. Medium for interactive elements (chips, tabs, sort options, form labels). Regular for body/descriptions/placeholders.
- **2026-05-12 — No hardcoded font-size values in app CSS.** All app component font sizes use `--txt-*` tokens. Only exceptions: MapLibre control overrides (9px !important), legal links (9px), and monospace code textarea (10px).

- **2026-05-16 — In-app review system: triple-identity anti-abuse, no login.** Reviews use fingerprint + deviceId + IP hash for triple dedup. reCAPTCHA at 0.7 threshold. 5 reviews/day rate limit per fingerprint. Most aggressive anti-abuse without requiring authentication.
- **2026-05-16 — Reviews: hybrid moderation (ratings instant, text moderated).** Star ratings (1–5) take effect immediately. Text reviews (optional, 20–500 chars) go to "pending" status for admin approval. Separates the rating signal from potentially harmful content.
- **2026-05-16 — Reviews: update, not block, on repeat visits.** When a user with an existing review submits again, their star rating is UPDATED (replaced). Text reviews are append-only — cannot edit or delete previous text.

- **2026-04-29 — Turn overlay must point to the exact snapped maneuver coordinate.** The floating turn badge may sit beside the road, but its pointer tip must land on the actual on-route turn point itself, using the snapped route coordinate rather than a nearby raw step lat/lng or arbitrary side offset.

- **2026-04-29 — GPS sim phone testing: URL param + route playback.** Added `?sim` URL parameter to auto-activate GPS sim on phone (no keyboard shortcut available). Added route playback engine that auto-walks along computed route at configurable speed (walk/cycle/drive/fast). Badge made tappable with close button.

- **2026-04-08 — Cemeteries are a first-class place type, not static-only.** Cemetery entries must be addable through the same suggest/edit form flow as other places and loaded from Google Sheets / API like any other place. `places.json` must not be the only source of truth.
- **2026-04-08 — Form spam protection: reCAPTCHA over client cooldowns.** Removed client-side 60-second submission cooldowns from suggest, edit, contact, and wishlist forms. Keep reCAPTCHA and in-flight button disabling; do not reintroduce minute-long local cooldown UX.
- **2026-04-08 — Cemetery theme behavior: dark mode must recolor all cemetery affordances consistently.** Cemetery pins, popup badges, and place-list visuals must all follow the same tokenized dark-mode color override, not just the list row styling.
- **2026-04-08 — Navigation camera behavior: manual map control must always break follow mode instantly.** During navigation, GPS follow is default only until the user manually pans/zooms/rotates. The map must then stay in the user-chosen view with no auto-centering until recenter is explicitly tapped. Recenter restores GPS follow and heading-up orientation.

- **2026-04-21 — Navigation autocentering reverted to the original GPS-centered follow.** Reverted the experimental fixed-puck / secondary interpolation model. `_smartFollow()` again uses the original `map.easeTo()` camera recentering on the live GPS position during follow mode. The user prefers the original behavior over the experimental stationary-puck camera model.

- **2026-04-30 — Navigation camera: 3 distinct tiers, not a continuous curve.** User explicitly wants three zoom/pitch levels (standard cruising, full zoom-in at turns, full zoom-out on highways) rather than a speed-based continuous gradient. Transitions between tiers should be smooth but aggressive (don't linger at intermediate states).
- **2026-04-30 — Navigation camera: standard is the true default state.** After a turn, the camera must return to standard zoom/tilt unless another real maneuver is very close. Turn zoom should only activate near actual overlay-backed maneuver steps, not broadly in advance and not for road curves or continuation/name-change steps.
- **2026-04-30 — Navigation camera: do not zoom out until the puck has cleared the turn.** Releasing turn zoom on step advance is too early. Keep turn zoom/flat pitch active until route progress has moved a small distance beyond the fired maneuver point, then return to standard.
- **2026-04-30 — Navigation camera: any non-full-turn state must regain tilt immediately.** Once turn hold ends, pitch should snap back to the current standard or far-tier tilt instead of easing up slowly from 0. Flat pitch is only acceptable in the full turn-zoom state.
- **2026-04-30 — Navigation camera: smooth tilt changes, but never stay flat outside full turn zoom.** When leaving full turn zoom, reintroduce some tilt immediately, then ease smoothly to the active tier's final pitch. Hard pitch snaps are acceptable only into the fully flat turn state, not out of it.
- **2026-04-21 — Navigation follow cadence: keep the original GPS-centered follow, but run it on every location update.** The camera should not wait for the throttled route-processing loop. Route snapping, step logic, HUD math, and reroute checks can stay separately throttled at 250 ms, while `_smartFollow()` stays on the raw location stream with short easing (300 ms) and EMA jitter smoothing (α=0.35).
- **2026-04-21 — Navigation follow jitter: EMA smoothing on camera target.** Raw GPS noise on every tick caused micro-jitter. Applied exponential moving average (α=0.35) on follow target position and bearing. Same GPS-centered model — no fixed puck, no secondary camera model.
- **2026-04-20 — Heading from route geometry, not raw GPS bearing.** Primary heading source is the route polyline 60m ahead of the snap point (`_routeBearingAtSnap()`). GPS-to-GPS bearing is fallback only (off-route or near route end). Smoothed with 0.25 blend factor via shortest-arc interpolation.
- **2026-04-20 — NAV_VIEW zoom: drive 16–17, walk 17–18, cycle 16.5–17.5, transit 16–17.** Third round of zoom-out. User consistently wants wider field of view during navigation.

- **2026-04-05 — Directions lookup must prioritize approved map places.** Route origin/destination/waypoint search should surface `placesData` matches before Digitransit/Nominatim results, and typed auto-resolve should use the same merged ranking so approved places are not replaced by generic venues.

- **2026-04-04 — Wishlist approval system: pending review before public.** All new wishes are hidden from the public wishlist until an admin marks `approved = yes` in the Google Sheet. Matches the existing place-approval workflow. Existing wishes will need manual approval to re-appear.
- **2026-04-04 — Wishlist pre-loads with places, no per-open fetch.** Wishes are fetched once in background during app startup (alongside places). When user opens the wishlist, pre-loaded data renders instantly — no loading spinner or wait. Session-scoped only (no localStorage cache for wishes) to avoid stale data.
- **2026-04-04 — Wishlist expand/collapse: direct DOM toggle, not full re-render.** Read More/Show Less now toggles the description class directly and animates the card height via `animateSheetHeight` with `force: true` (bypasses mobile skip). Avoids wasteful full innerHTML rebuild for a single toggle.
- **2026-04-04 — Optional name/email on wish submissions.** Users can optionally provide name and email when submitting a wish. Stored in Sheet columns G (name) and H (email). Email validated server-side if provided. Purpose: contact users when their wish is implemented.

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

- **2026-03-31 — Font swap: Inter → General Sans → Plus Jakarta Sans.** Inter was the most overused AI-default font. General Sans was tried but user found it renders thin/soft at small sizes with poor visibility. Replaced with Plus Jakarta Sans (Google Fonts, SIL OFL 1.1, variable 200–800). High x-height, excellent ClearType hinting, crisp at all sizes. Self-hosted with latin + latin-ext subsets (Finnish ä/ö/å). Total: ~49KB (27KB latin + 22KB latin-ext).
- **2026-03-31 — Type scale bumped for readability.** `--txt-xs`: 10→11px, `--txt-sm`: 12→13px, `--txt-base`: 13→14px, `--txt-md`: 14→15px. Upper scale unchanged (lg=16, xl=18, 2xl=20, 3xl=24, display=30). User explicitly asked for fonts that aren't "barely visible" — the old 10/12/13px floor was too small.
- **2026-03-31 — Weight tier system: regular→medium→bold.** Reduced semibold/bold overuse. Item titles, chips, tabs, secondary buttons demoted from semibold (600) to medium (500). Micro-labels and badges from bold (700) to semibold (600). Creates three clear tiers: regular (body/captions), medium (interactive), bold (headings/CTAs).
- **2026-03-31 — Letter-spacing token system.** Four tokens: `--ls-tight` (-0.025em) for headings, `--ls-normal` (0) default, `--ls-wide` (0.015em) for small text, `--ls-caps` (0.06em) for uppercase labels. All hardcoded values in both CSS files replaced with token references.
- **2026-03-31 — OpenType features enabled globally.** `font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1` on `:root`. Added `.t-tabular-nums` template class for alignment in numeric columns.

- **2026-04-01 — Search icon anchored to `#tf-row`, not the expanding wrapper.** `flex-grow` + `margin-left: auto` on `.pl-search-wrap` causes subtle right-edge jitter on mobile during the expand animation. Fix: icon button (`#pl-search-icn-btn`) moved out of `.pl-search-wrap` to be a sibling; anchored with `position: absolute; right: 16px` on `#tf-row` (which gets `position: relative`). Descendant selectors that referenced `.pl-search-icn` inside `.pl-search-wrap` updated: focus-within → adjacent sibling combinator (`+`), hover border → `:has()` on `#tf-row`.
- **2026-04-01 — Style picker panel: keep left-opening, shrink only on narrow viewports.** User rejected "open above" fix AND blanket 768px shrink. Correct approach: `max-width: calc(100vw - edge - btn - 16px)` safety net at `≤768px`; thumbnail/padding shrink only at `≤399px` (the breakpoint below which the full 337px panel can't fit). iPhone 13 Pro Max (428px) keeps full 52px thumbnails; iPhone 15 (393px) gets 44px. User wants maximum size retained on devices that support it.

- **2026-04-03 — Speedometer: standalone floating puck, not inline chip.** User found the inline HUD chip too small and barely visible. Speedometer must be prominent, beautiful, conform to design language, compact, and non-blocking. Standalone 56px circular puck, bottom-left of map.
- **2026-04-03 — Navigation: divergence detection for missed turns.** If GPS distance to the current step is increasing while distance to the next step is decreasing, skip the current step early. Don't wait for threshold entry — react when the trajectory proves the maneuver was passed.
- **2026-04-03 — Navigation: always-follow recentering.** Always `easeTo` to GPS position on every tick (revised from edge-only). If user pans away, yield immediately and show a recenter button. The user wants the map to always track them during navigation, not wait until they reach the edge.

- **2026-04-04 — Speedometer always visible during nav (0 km/h shown, not hidden).** User wants the speedometer visible at all times while navigating — even when stationary. Previously it hid itself at 0 km/h. Now shows "0" while stopped and becomes visible immediately on nav start.
- **2026-04-04 — Mobile map drag in nav: remove `_programmaticMove` guard from `_onUserDrag`.** The 600ms `easeTo` kept `_programmaticMove = true` for most of the time between GPS ticks, silently swallowing touch drags on mobile. Fix: drop the guard, always call `map.stop()` first to abort in-flight animation, then set `_following = false`. PC was unaffected because mouse drags are precise and don't overlap the animation timing.
- **2026-04-04 — Covered-route overlay: dark semi-transparent line on already-traversed segment.** MapLibre source `nav-covered-src` + layer `nav-covered-ln` (`rgba(55,55,65,0.58)`) added on nav start and updated each GPS tick. Removed on nav stop. Shows the user exactly which portion of the route has been covered.
- **2026-04-04 — GPS sim (Shift+G) enabled for current dev session.** The `initGpsSim()` call in `app.js` was commented out for production. Activated for testing nav features. Remember to re-comment before shipping.
- **2026-04-03 — Speedometer: median filter + accuracy gating.** GPS jitter can produce 24 km/h while stationary. Robust pipeline: 5m min distance, 0.5s min interval, 200 km/h cap, 4-sample median filter before exponential smoothing.
- **2026-04-03 — Roundabout trigger radius: 15m drive, 12m walk.** Small Finnish roundabouts need very tight triggers. Route-progress catch-up and divergence detection handle any misses.
- **2026-04-04 — Recenter button: white surface + green icon, location arrow.** Same icon as the main app Locate button. White bg with accent-colored icon matches the speedometer's visual weight.
- **2026-04-04 — Navigation follow: jumpTo instead of easeTo.** Overlapping easeTo animations at 1s intervals cause visible jitter. jumpTo is instant — no animation overlap, perfectly smooth tracking.
- **2026-04-04 — HUD row2: 3 chips (turn distance, dest distance, ETA).** Distance-to-next-turn is the primary cruising info. Destination distance and ETA are secondary context. All live-updating.
- **2026-04-04 — Approach-then-fire: exponential time-factor, not linear.** The fire distance uses an exponential decay on the time factor: `0.8 + 2.2 × e^(-speed/15)`. This gives ~3s lead at walking (tight, precise — user explicitly wants turns to fire "at the very turn point"), decaying to ~0.8s at highway speed (GPS tick spacing). Floor 2m, cap 30m. Vehicles naturally decelerate before turns so the live speed drops automatically — no special braking logic needed. Hysteresis also scales: `max(2, fireM × 0.4)`. User rejected the previous 5m floor as "too gracious for walking" (6 seconds of lead at 3 km/h).
- **2026-04-04 — Turn chip shows actual next maneuver icon.** Replaced generic `↱` arrow with the next step's real `iconHtml` SVG (turn-left, turn-right, roundabout, etc.) scaled to 14px via `.nav-chip-icon` class.
- **2026-04-04 — Implemented wishes sink to bottom with locked votes.** Wishes marked `implemented = yes` in the Sheet always appear below active wishes. They show a green "Implemented" chip and their vote button is disabled (read-only). Sort within each group is by votes desc.
- **2026-04-04 — Wishlist 4-tier status: Active → In Progress → Implemented → Out of Scope.** `implemented` column accepts blank/Inprogress/Yes/Out of Scope. Badges use place-type colors: In Progress = `--hsl-ferry` (prayer room cyan), Implemented = `--success` (mosque green), Out of Scope = `--hsl-trunk` (restaurant orange). In Progress + Implemented lock votes; Out of Scope keeps votes open.

- **2026-04-13 — Transit nav: three-phase stop model (towards → at → past) + board hold.** Transit intermediate stops now show "Towards X" when far, "At X" when within 150m, instead of prematurely "Passing X". Board steps hold advancement until scheduled departure + 30s or 300m movement. Wait-time countdown shown at boarding stops.

- **2026-05-09 — Shadow hierarchy: 3-tier floating depth.** `--shadow-md` for static controls, `--shadow-xl` (multi-layer) for popups/modals/snackbars, `--shadow-float` (wide diffuse) for tab bar/sheets/premium floating UI. Never use hardcoded `rgba()` for shadows on major components.
- **2026-05-09 — Card hover: accent-tinted, not gray.** Place list cards and itinerary cards use `color-mix(accent 25%, border)` for hover border and `--shadow-accent-sm` for hover shadow. Subtle brand warmth instead of generic gray shift.
- **2026-05-09 — Sheet radius: 28px on mobile (r-2xl).** Mobile bottom sheets use `--r-2xl` (28px) top corners for modern iOS-like feel. Desktop side panels also use `--r-2xl`.
- **2026-05-09 — Skeleton shimmer: directional gradient sweep.** All skeleton loading states use a 3-stop horizontal gradient that slides across, replacing basic opacity pulse. More premium, directional light feel.
- **2026-05-09 — Tab indicator: wider with accent glow.** Active tab indicator is 20px (was 16px) with `--r-pill` radius and subtle accent-tinted box-shadow behind it. Transition uses `--ease-spring-pop` for bouncy feel.

- **2026-04-14 — Navigation: 3D tilted perspective view per travel mode.** Drive 55°, walk 45°, cycle 50°, transit 35°. GPS dot offset to lower third of screen for forward-looking view. Dynamic zoom scales with speed (wider at highway, tighter at walking pace) and boosts near turns. Map auto-rotates heading-up only when speed > 3 km/h. Untilts to flat 2D on nav stop.
- **2026-04-14 — Auto-centering: only drag breaks follow, not zoom/rotate/pitch.** Zoom, rotate, pitch, and wheel gestures are allowed while following — the next GPS tick restores the nav camera. Only actual panning (drag) exits follow mode.
- **2026-04-14 — Nav zoom tighter: drive 17–18.5, walk 18–19, cycle 17.5–18.5, transit 17–17.5.** Previous values still too far out. User wants tight street-level view.
- **2026-04-14 — GPS dot positioned just above HUD via viewport-relative offset.** `_aheadOffset()` computes `0.2 × viewport height` dynamically — GPS dot lands at ~70% down the screen. Replaces fixed per-mode pixel values.
- **2026-04-14 — 3D buildings tied to follow state during nav.** Following (recenter hidden) → 3D off. Not following (recenter visible) → 3D restored. On nav stop, 3D restored if it was active before nav.
- **2026-04-14 — pitchend auto-3D skipped during nav-mode.** `map.on('pitchend')` in map-controls now returns early when `body.nav-mode` is set, preventing buildings from re-enabling when nav tilts the map.
- **2026-04-14 — Auto-zoom: geometry-driven, not nav-step-driven.** `_computeNavZoom()` now scans the route polyline ahead of the GPS snap point for bearing changes (≥35° cumulative = "turn"). Distance to the first turn determines zoom boost. Lookahead window scales with speed (100m walk → 400m highway). Completely independent of navigation text step timing. Nav steps have complex fire rules; the route line is always accurate.
- **2026-04-14 — Commit message conventions: use `ci()` for release/deploy, not `chore:`.** Version bumps + data refreshes = `ci(release)`. Branch promotions to production = `ci(deploy)`. Actual bug fixes = `fix()`. New features = `feat()`. Only use `chore:` for tooling with zero user impact (deps, build scripts). See `docs/COMMIT_CONVENTIONS.md` for full standards.

- **2026-04-14 — Navigation camera ownership: nav-mode blocks locate auto-pan.** `showCurrentLocation()` in `src/map-controls.js` was still calling `flyTo`/`easeTo` on GPS updates whenever a route existed. During turn-by-turn navigation this fought the nav camera, recentred the GPS dot to the screen middle, and ignored the HUD offset. Fix: when `body.nav-mode` is active, the regular locate watcher never moves the camera; navigation owns it completely.
- **2026-04-14 — Recenter button state is authoritative for follow mode.** During navigation, visible recenter button = no auto-centering. `_smartFollow()` now exits not only when `_following` is false, but also whenever the recenter button is visible. This matches the user rule directly instead of trusting internal state alone.
- **2026-04-14 — Mobile nav touch suppression kept for first-drag smoothness.** `touchstart` on the map canvas still calls `map.stop()` and `_smartFollow()` still pauses while `_touchCount > 0`, so the first drag is not fighting an in-flight nav animation.
- **2026-04-14 — First mobile pan must break follow on touchmove, not dragstart.** After recenter, waiting for MapLibre `dragstart` was too late on phone: the first gesture got consumed canceling nav follow. Fix: record the initial touch point and call `_stopFollowing()` as soon as one-finger movement exceeds a small threshold (10 px). The first drag now becomes the pan itself.

- **2026-04-18 — Nav zoom zoomed out: drive 16–17, walk 17–18, cycle 16.5–17.5, transit 16–17.** Reduced another 0.5 from initial fix. User still wanted more road visible.
- **2026-04-18 — GPS interpolation: rAF loop replaces discrete easeTo.** GPS updates at ~1 Hz caused stepped movement (300ms animation + 700ms static). Replaced with `requestAnimationFrame` loop that smoothly lerps + extrapolates between fixes at 60fps using `map.jumpTo()`. Bearing uses shortest-arc interpolation. Loop pauses during touch and stops on nav stop/pause/drag.
- **2026-04-18 — Route-geometry heading replaces raw GPS bearing.** GPS-to-GPS bearing jittered wildly from satellite noise, causing the entire map to spin. New primary heading source: bearing of the route polyline looking ~60m ahead from the snapped position. This follows the actual road shape and is immune to GPS jitter. Falls back to GPS bearing only when off-route. Smoothed with 0.25 blend factor.

- **2026-04-28 — Navigation icons: Lucide library as icon source.** All `maneuverIconSvg()` paths replaced with official Lucide icons (ISC license). Custom hand-drawn SVG paths removed. This establishes Lucide as the icon library for navigation UI.
- **2026-04-28 — Turn indicators: on-road symbols + floating overlay badge.** Standard navigation pattern: (1) white directional chevrons along the route line at 80px intervals showing direction of travel, (2) Lucide-based turn icons at each maneuver point via a MapLibre symbol layer, (3) a prominent floating teal badge (40×40) at the next upcoming turn that auto-advances.
- **2026-04-29 — Route line: single solid color, no alternating step colors.** Removed the alternating color per-step logic. Route should be one uniform color; turns are communicated by icons on the road, not by color changes.
- **2026-04-29 — Turn overlay: offset side-label, not centered on road.** The turn overlay must not block the road. It sits beside it (anchor="right", offset left) like a road-name text label in the reference image.
- **2026-04-29 — Turn overlay badge: filled accent background with white icon.** The accepted turn overlay treatment is a filled teal/brand-accent badge with a white icon and matching pointer, not the earlier white-surface variant.
- **2026-04-29 — Turn arrows IN the road, not floating above.** White turn icons rendered directly at the maneuver point coordinates on the route line (within the line width visually). No repeating chevrons along the line — only one icon at each actual turn point.
- **2026-04-29 — On-road turn marker: exactly 4m of highlighted road + fixed-size arrow tip 2m into the outgoing road.** The turn segment must be the last 2m of the incoming road plus the first 2m of the next road. The arrow itself must be screen-sized like the side overlay badge, not zoom-scaled, and its visible tip must sit at the +2m point on the new road.
- **2026-04-29 — Turn highlight stays bright in dark mode.** The on-road turn segment and arrow fill should remain bright white or equivalent high-contrast color even in dark theme.\n- **2026-04-29 — Nav zoom: much smoother + much more aggressive, especially on phone.** Widened zoom ranges to ~3 levels, added EMA smoothing (α=0.08), quadratic turn boost (2.8 max), mobile +0.6 boost. All modes now dynamic. Longer easing (900ms).
- **2026-04-29 — Nav zoom on turns must be even tighter; zoom speed must match vehicle speed.** Turn boost raised to 3.8 with +1 level above max on close turns. Zoom EMA α and easing duration are now speed-dynamic: walk α=0.06/900ms (buttery), highway α=0.22/350ms (snappy). Zoom transitions keep pace with the vehicle instead of using a fixed rate.
- **2026-04-29 — Nav zoom wobble fix: dead zone + calmer alpha.** Frequent micro zoom in/out felt wobbly. Added 0.35-level dead zone so zoom ignores target changes smaller than that. Lowered alpha range from 0.06–0.22 to 0.04–0.14 for calmer, more deliberate zoom transitions.
- **2026-04-29 — Nav zoom must be continuous, not stepped.** EMA advancing in discrete steps each GPS tick caused visible staircase zoom (animate-pause-animate-pause). Fix: removed EMA entirely; zoom target is dead-zone-gated (only commits when raw target departs by >0.35 levels) and MapLibre's `easeTo` easing handles all interpolation continuously. Duration raised to 1100ms base / 500ms min so each animation overlaps the next GPS tick, producing one unbroken motion.
- **2026-04-29 — Nav zoom anti-trigger-happy: 3s hold, asymmetric dead zone, 55° turn threshold.** Zoom was cycling in/out on gentle curves. Three fixes: (1) turn detection raised from 35° to 55° cumulative deviation — only real turns trigger zoom; (2) asymmetric dead zone: 0.30 to zoom in (responsive), 0.70 to zoom out (reluctant) — prevents instant zoom-out after a curve passes; (3) 3-second hold timer after each zoom commit — locks the level so rapid oscillation is impossible.
- **2026-04-29 — Nav zoom on ALL high-attention maneuvers, not just sharp turns.** Zoom-in now also triggers for lane changes, merges, forks, on/off ramps, and roundabouts — any situation where the driver needs to focus. Two independent trigger sources: geometry scan (≥55° bearing) + step-type scan (maneuver-based). Closest trigger wins. Principle: zoom in whenever the chance of a mistake is high.
- **2026-04-29 — Nav zoom must be fully zoomed BEFORE the turn, not at it.** Zoom was peaking at dist=0 (at the turn point), but with easing delay the car had already passed. Fix: speed-scaled lead offset (20m walk → 80m at 100km/h) shifts the boost curve so zoom peaks before the maneuver. Also: roundabout clusters (entry + exit steps) now keep zoom locked through the entire sequence — no zoom-out between entry and exit.
- **2026-04-29 — Roundabouts: max zoom BEFORE entry, not at entry.** Roundabouts need to be at max zoom before the car enters. Fix: `_roundaboutAheadDist()` scans upcoming steps; when a roundabout is within lead range (40m walk → 120m at 100km/h), force-commits max zoom immediately, bypassing dead zone and hold timer. Combined with existing cluster lock, zoom is max from approach through exit.

- **2026-04-29 — Nav HUD at top, GPS dot at bottom.** Nav HUD moved from bottom of screen to top (safe-area-aware). GPS dot pushed to ~85% down the viewport using `map.setPadding({ top: 0.70×vh })` to maximize the forward-looking map view. Speedometer and recenter button repositioned to bottom corners independent of HUD. The map moves around the fixed GPS dot position — the dot stays at the same screen location always.

- **2026-04-29 — GPS puck hard-anchored via setPadding, not offset.** Hard rule: GPS puck must NEVER go above the bottom 20% of the screen during navigation. Implemented via `map.setPadding({ top: 0.70×vh })` (not `easeTo offset`). setPadding shifts MapLibre's effective viewport center to the puck position, so ALL operations (zoom, rotate, pinch-zoom, bounds-fit) pivot around it. The puck is a true fixed anchor like an FPS crosshair. Padding is set on nav start/resume, removed on nav stop (with `easeTo padding` transition).

- **2026-04-30 — Nav turns: pitch=0 (top-down) + max zoom, speed-aware lead.** At every turn and roundabout, the map must flatten to top-down (pitch=0) and zoom to absolute maximum BEFORE the car arrives. Lead distance scales aggressively with speed (30m walk → 140m at 100km/h). On straight roads, tilt and zoom restore for forward-looking view. Non-negotiable: no matter what, map must be fully zoomed and flat before ANY turn.
- **2026-04-30 — Nav camera: rAF loop with jumpTo replaces easeTo.** `easeTo` with 1Hz GPS caused stepped movement. Replaced with `requestAnimationFrame` loop using `map.jumpTo()` at 60fps. Smooth interpolation + gentle extrapolation between GPS fixes. Pitch and zoom smoothed per-frame with small alphas. Loop pauses on touch, stops on nav stop/pause/drag.
- **2026-04-30 — Nav zoom at turns must force-commit (bypass dead zone).** When within the speed-scaled lead distance of any turn, max zoom is force-committed immediately, bypassing the normal dead zone + hold timer. This guarantees the map is already at max zoom before the car reaches the turn.
- **2026-04-30 — Turn overlay markers shown for ALL turns, not just next.** All upcoming turn badges visible simultaneously on the map so the user can see what's coming. Passed turns are removed automatically as the user progresses.
- **2026-04-30 — Bearing lookahead reduced near turns.** On L-shaped roads, 60m lookahead caused the map to pre-rotate toward the upcoming road, pushing the turn off-screen. Fix: when close to a turn, lookahead is clamped to `turnDist * 0.5` (min 10m) so the bearing stays aligned with the current road segment.
- **2026-04-30 — Map rotation only on physical movement, not standing.** Heading updates are gated behind 3m minimum accumulated movement. If standing still (even if GPS jitters or device rotates), the map stays fixed. Only actual walking/driving triggers rotation.
- **2026-04-30 — Zoom-out easier on long straights.** Dead zone for zoom-out reduced from 0.70 to 0.40 levels. Hold timer reduced from 3s to 2s. This lets the map zoom out and tilt for a wider forward view on long straight roads between turns.

- **2026-05-01 — One-time event dates are mandatory.** The date input for one-time events now has `required` and validation rejects submission without a date. Previously optional.
- **2026-05-01 — Recurring events: structured patterns, not free text.** Replaced the free-text recurrence input with a structured chip-based selector. Patterns stored as parseable strings (`weekly:5`, `monthly-day:1:0`) so the system can compute exact occurrence dates. Legacy free-text patterns degrade gracefully (displayed as-is but not date-resolvable).
- **2026-05-01 — Event list filters: date + proximity + mosque.** Events overlay now has a sticky filter bar with date range chips (Upcoming/Today/This week/This month/All), a proximity "Nearby" toggle that sorts by distance from user GPS, and a mosque dropdown. All combine additively.
- **2026-05-01 — Multi-select days/dates in recurring events.** Day chips, month-date chips, ordinal chips, and monthly day-of-week chips all support toggle (tap to select, tap again to deselect). Users can pick multiple days/dates per recurrence pattern (e.g., "Every Mon, Wed, Fri"). Pattern format uses comma-separated values: `weekly:1,3,5`.

## Patterns to Avoid

> Things that were tried and rejected, or that the user has explicitly said "don't do."

<!-- Append new entries below this line -->

- Don't add transform-based movement to buttons (translateY on hover, scale on active). The user finds these movement effects annoying. Color/opacity/filter hover states are fine. Pre-existing transforms (nav-recenter, place pin markers) are exempt.

- Don't use raw GPS-to-GPS bearing for navigation heading — GPS jitter causes the map to spin randomly. Always derive heading from the route polyline geometry at the snap point.

- Route-field search and route auto-resolve should share the same candidate pipeline. If the main map has an approved place match, directions must rank it ahead of generic geocoder POIs and de-duplicate overlapping results by normalized name/coords.

- Avoid redesign concepts that mainly rearrange floating pills, bottom docks, or glass overlays without changing the underlying layout architecture.

- Don't use Cloudflare KV or any paid/tiered storage for link shortening. Keep sharing fully stateless.
- Don't use NLP libraries, ML models, or external language-processing APIs for search intent detection. Keep it lightweight with curated regex patterns.
- Don't use asymmetric easing for expand vs collapse — both directions must use `--t-spring`. No `ease` for expand + `spring` for collapse.
- Don't use `height: 0` without transition for collapse — use `grid-template-rows: 0fr` pattern instead.
- Don't use Inter, Roboto, Arial, General Sans, or system-font-first stacks as the primary typeface. Plus Jakarta Sans is the project font.
- Don't use fonts that render thin/soft at small sizes. The user demands crisp, visible, modern typography with proper weight.
- Don't hardcode `letter-spacing` values — always use `--ls-tight`, `--ls-wide`, or `--ls-caps` tokens.
- Don't use `font-weight: 600` (semibold) as the default "emphasis" weight — reserve it for badges/labels. Use medium (500) for interactive elements and titles.
- React / any framework rejected for this project — vanilla JS + design tokens delivers the same UX with zero build overhead.
- Don't auto-recenter the map on every GPS tick during navigation unless the user is actively following. The user wants always-follow as the default, but if they pan away, stop recentering and show a recenter button. Never fight the user's intentional map panning.
- Don't enable 3D buildings during navigation — extruded geometry obstructs the tilted forward-looking view. Auto-disable on nav start, restore on nav stop if they were active before.
- Don't use raw GPS-to-GPS bearing for navigation heading — GPS jitter (5–20m accuracy) causes the map to spin randomly. Always prefer route polyline geometry for heading when on-route.
- Don't add a second navigation-only camera-follow model when the original GPS-centered autocentering is what the user wants. Avoid fixed overlay pucks or extra follow interpolation unless explicitly requested again.
- Don't use round dots or long arbitrary coordinate spans for turn markers. The road itself should carry the turn highlight, and the arrow tip belongs on the outgoing road at a fixed distance.

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
- All letter-spacing must use tokens: `--ls-tight` for headings (≥18px), `--ls-wide` for small text (≤12px) and chips, `--ls-caps` for uppercase labels. Never hardcode em values.
- Approach-then-fire for all modes: entering trigger radius starts tracking, fires only on closest-point pass-through or speed-scaled proximity. Route-progress and divergence detection remain as safety nets.
- Approach fire distance and hysteresis both scale with speed — never use static metre values for speed-dependent navigation thresholds.
- No physical movement effects on buttons (translateY lift on hover, scale press on active). Hover should use color/opacity/filter changes only. Keep transform effects that were pre-existing (e.g. nav-recenter, place pin markers).
- Focus-visible rings must use `--focus-ring` token, never custom outline/box-shadow values. `:focus` (mouse) stays suppressed; `:focus-visible` (keyboard) shows the ring.
- List items should set `style="--i:${index}"` for stagger animation delay. No separate JS timers needed.
- `prefers-reduced-motion: reduce` must be respected — all animations and transitions suppressed.
- `::selection` uses accent tint, not browser default blue.
- Input focus states should use `--shadow-accent-sm` glow in addition to accent border-color.
- Floating UI (tab bar, sheets, snackbars) uses `--shadow-float`. Popups/modals use `--shadow-xl`. Static controls use `--shadow-md`. Never hardcode `rgba()` for shadows on major components.
- Card hover states use accent-tinted border (`color-mix(accent, border)`) + `--shadow-accent-sm` for brand warmth. Not plain gray border shift.
- Skeleton loading uses directional gradient sweep animation, not basic opacity pulse.
- Route-geometry heading: `_routeBearingAtSnap()` looks N metres ahead on the polyline from the snap point. Immune to GPS noise. Smooth with shortest-arc blend factor. GPS bearing is fallback only.
- Navigation follow should use the original GPS-centered `easeTo` autocentering path unless the user explicitly asks to revisit the camera model.
- When navigation follow feels stepped, keep the original GPS-centered camera model and feed `_smartFollow()` from every location update. Throttle route math separately instead of making the camera wait for it.
- On turns, the map MUST be fully top-down (pitch=0) and at maximum zoom. On straight roads, restore tilt and zoom out for forward-looking view. The transition must complete BEFORE the turn based on speed.
- GPS smoothing: use a rAF interpolation loop with `jumpTo` at 60fps, extrapolating between discrete GPS fixes. Never use `easeTo` for follow — it creates stepped motion with discrete GPS updates.

---

## Session Notes

> Short notes from individual sessions for continuity.

<!-- Append new entries below this line -->

### 2026-05-09 — Premium UI polish sweep

**a. Shadow system upgrade — multi-layer depth hierarchy:**
- Added `--shadow-xl` (popup-grade, 2-layer: tight + medium spread) and `--shadow-float` (premium wide diffuse for floating UI like tab bar, sheets, snackbars).
- Tab bar, sheets, snackbars upgraded from flat `--shadow-lg` to `--shadow-float`.
- Popups (place, stop, eid) upgraded from hardcoded `rgba()` to `--shadow-xl`.
- Snack template, pill-panel, search dropdown all upgraded.
- Dark mode overrides added for `--shadow-xl` and `--shadow-float`.
- Hardcoded dark mode popup shadows replaced with token references.

**b. Sheet radius bump:**
- Added `--r-2xl: 28px` token.
- Mobile sheets use `--r-2xl` for modern iOS-like rounded corners.
- Desktop side panels use `--r-2xl` for consistent feel.

**c. Skeleton shimmer upgrade:**
- Replaced basic opacity pulse animation with directional gradient sweep.
- Uses a 3-stop linear gradient that slides across the element, creating a premium "light reflection" effect.

**d. Tab indicator refinement:**
- Active dot widened from 16px to 20px.
- Border-radius changed from `2px` to `--r-pill` for softer pill shape.
- Added subtle accent-tinted glow (`box-shadow`) behind the indicator dot.
- Desktop vertical indicator matches (20px height, pill radius, glow).
- Transition upgraded to `--ease-spring-pop` for bouncy feel.

**e. Card hover refinement:**
- `.pl-card` hover now uses accent-tinted border (`color-mix(accent 25%, border)`) instead of plain gray `surface-3`.
- Hover shadow upgraded from `--shadow-sm` to `--shadow-accent-sm` for brand warmth.
- `.itin-card` hover similarly upgraded to accent-tinted border + shadow.

**f. Form focus glow:**
- All form inputs (`.sg-label input/select/textarea`) now get `box-shadow: var(--shadow-accent-sm)` on focus, not just border-color change.
- Direction fields (`.dir-field`) get accent border-color + glow on focus-within.
- Transition property includes `box-shadow` for smooth glow entry.

**g. Scrollbar refinement:**
- Width increased from 3px to 5px for better visibility.
- Thumb uses `--surface-3` (was `--border`, barely visible).
- Thumb gets pill border-radius for soft rounded ends.

**h. Button transform revert (from previous sweep):**
- Removed all `transform: translateY(-1px)` hover and `scale(0.9x)` active states from all 16 button templates.
- Removed `--t-press` token.
- User explicitly dislikes physical movement effects on buttons. Color/filter/opacity hover states kept.

**Files modified:** `src/styles/design-tokens.css`, `src/styles/styles.css`, `docs/DESIGN_SYSTEM.md`, `docs/PREFERENCE_LOG.md`.

### 2026-04-30 — 3-tier navigation camera system

Replaced the continuous speed-based zoom/pitch curve with a clear 3-tier system:

**Tier A — Standard (cruising between turns):**
- Moderate zoom (drive: 16.5), tilted view (55°)
- This is the default state after turns and between maneuvers

**Tier B — Turn zoom-in (approaching maneuvers):**
- Zoomed in (drive: 17.8), flat pitch (0°) for clarity
- Only triggers for real maneuver steps with overlays (`turn`, `end of road`, ramps/forks/roundabouts)
- Narrow trigger window: starts at 90m, fully commits at 22m (drive mode)
- Roundabouts use a slightly less aggressive variant to keep the full circle visible

**Tier C — Far zoom-out (highway/long stretches):**
- Wider view (drive: 15.5), high tilt (65°) for maximum forward visibility
- Triggers only when the next real maneuver is confirmed >1200m away (drive mode)
- No intermediate blend: standard remains the default until a true highway-style stretch

**Key parameters (drive mode):**
- turnStart: 90m, turnFull: 22m
- farThreshold: 1200m
- Post-turn rule: if the next real maneuver is not within 20m, force standard immediately
- Turn-exit rule: keep turn zoom until route progress clears the fired maneuver point by a small buffer (~8m drive, smaller on walk/cycle)
- Pitch rule: when turn hold ends, restore the current tier's tilt immediately; only full turn zoom stays flat
- Pitch transition rule: after turn hold ends, restore a minimum visible tilt immediately, then smooth to the target tilt with a faster recovery alpha
- Fixed a step-distance accumulation bug that was undercounting later maneuver distances and keeping the camera in turn mode too often

**User preference:** standard is the true default view; zoom in only near actual turns, zoom out harder only on genuine long no-turn stretches.

### 2026-05-09 — Two micro-fixes

**a. Hide search icon when places tab is empty:**
- In `renderPlacesList()`, added a pre-search count check after type+tag filtering but before query filtering.
- If the tab has zero items (e.g. "Saved" with nothing saved), `#pl-search-icn-btn` gets `.hide` and any open search is closed.
- When items exist, the search icon is shown normally.

**b. Fix style picker 2px shift on open:**
- Root cause: `.pill-panel.hide` used `scale(0.96)` combined with `translateY(-50%)` — the 4% scale interpolation caused a ~2px apparent vertical shift of options during the open transition.
- Fix: removed `scale(0.96)` from `.pill-panel.hide`. The panel now animates with opacity + translateX only, which is cleaner and eliminates the content shift.

**Files modified:** `src/places.js`, `src/styles/design-tokens.css`, `docs/PREFERENCE_LOG.md`.

**Files:** `src/navigation.js`

### 2026-04-30 — Post-turn zoom-out + route overview button

**a. Post-turn zoom-out proportional to next turn distance:**
- After passing a turn (step fires), zoom hold is immediately released (`_zoomHoldUntil=0, _smoothZoom=null, _renderZoom=null` in `_advanceStep`).
- Per-frame zoom-out alpha now scales with delta magnitude: larger zoom-outs (after turns with long straights ahead) animate faster (α up to 0.06), small deltas stay gentle (α=0.025). Formula: `α = min(0.06, 0.025 + |delta| * 0.02)`.
- Result: map zooms out quickly after turns proportional to how far the next turn is (farther = lower target zoom = bigger delta = faster animation).

**b. Route overview button:**
- New "Overview" button (expand icon) in bottom-right, same position as recenter button.
- Mutually exclusive visibility: overview shows when following (normal nav), recenter shows when user panned away or entered overview.
- On tap: stops follow mode, fits map to full route bounds (`fitBounds` with 60px padding, pitch 0, bearing 0), shows recenter.
- Recenter tap restores follow + shows overview again.
- Managed in startNavigation, stopNavigation, pauseNavigation, resumeNavigation.
- Visual style aliased to `.nav-recenter` template (44px circle, surface bg, accent color, shadow-md).

**Files:** `src/navigation.js`, `index.html`, `src/styles/styles.css`, `src/styles/design-tokens.css`.

### 2026-04-30 — Turn-aware pitch/zoom + rAF GPS smoothing

**a. Turn-aware pitch (flat top-down at turns):**
- Added `_computeNavPitch()` — dynamically flattens pitch to 0 (top-down bird's-eye) when approaching any turn or roundabout.
- Lead distance scales with speed: 30m at walking → 120m at 100km/h. Map is fully flat BEFORE the turn.
- Restoring tilt on straight roads uses slower alpha (deliberate, not jarring).
- Roundabouts force-flat immediately when within lead range.

**b. Aggressive turn zoom (force max before turn):**
- When within speed-scaled lead distance of any turn, max zoom is force-committed immediately (bypasses dead zone + hold timer).
- Lead raised from 80m to 140m max. Boost raised to 4.5. Absolute cap raised from mobileMax+1.0 to mobileMax+1.5.
- Result: map is guaranteed at max zoom before the car reaches the turn point.

**c. rAF interpolation loop (60fps smooth GPS):**
- Root cause of stepped movement: discrete GPS at ~1Hz → `easeTo` animation-pause-animation cycle.
- Solution: `requestAnimationFrame` loop with `map.jumpTo()` at 60fps.
- Each GPS fix updates `_interpCurrFix`. Between fixes, the loop extrapolates position and bearing (capped at 1.2× interval).
- Pitch smoothed per-frame (α=0.06 flatten, α=0.025 restore). Zoom smoothed per-frame (α=0.08 in, α=0.03 out).
- Loop pauses while fingers on screen, stops on nav stop/pause/follow-break.
- `_smartFollow` no longer calls `easeTo` — it just feeds targets to the loop.

**d. Turn overlays for ALL turns (not just next):**
- `_turnOverlayMarkers[]` array replaces single `_turnOverlayMarker`.
- All upcoming turns shown simultaneously so user sees what's coming.
- Passed markers removed as route progresses.

**e. Bearing no longer pre-rotates toward upcoming road:**
- On L-shaped roads, 60m lookahead caused map to rotate 90° early, pushing turn off-screen.
- Fix: when turn is within lookahead distance, clamp `effectiveLookahead = turnDist * 0.5` (min 10m).
- Map stays aligned with current road segment until physically reaching the turn.

**f. Map only rotates on actual movement:**
- Heading updates now gated by 3m accumulated movement (`_lastHeadingMoveDist`).
- Standing still = map stays fixed, even if GPS jitters or device rotates.

**g. Zoom-out on long straights:**
- `ZOOM_DZ_OUT` reduced from 0.70 to 0.40, `ZOOM_HOLD_MS` from 3s to 2s.
- Allows the map to zoom out and tilt for wider view between turns.
- `FOLLOW_SMOOTH_ALPHA` raised from 0.18 to 0.35 for more responsive position tracking.

**Files:** `src/navigation.js`, `docs/PREFERENCE_LOG.md`.

### 2026-04-18 — Fix mojibake, zoom out nav view, smooth GPS interpolation

**a. Mojibake fix in navigation.js:**
- File had double-encoded UTF-8 (CP-1252 → UTF-8). Box-drawing `─`, em-dash `—`, arrows `→`/`↱` all corrupted.
- Fixed with Python script: decode as CP-1252, re-encode as UTF-8. All 7 non-ASCII character types verified clean.

**b. Navigation zoom reduced ~2 levels:**
- Drive: 18–19 → 16–17, Walk: 18.5–19 → 17–18, Cycle: 18–19 → 16.5–17.5, Transit: 17.5–18.5 → 16–17.
- Two rounds of reduction: user kept asking for more road visible.

**c. Smooth GPS position interpolation (rAF loop):**
- Root cause of stepped movement: `easeTo` 300ms animation + 700ms static gap between 1 Hz GPS fixes.
- Solution: `requestAnimationFrame` loop that smoothly interpolates positions between GPS fixes.
- On each GPS fix, previous target becomes the start, new fix becomes the target.
- Between fixes, linear interpolation from start to target (t=0→1). After t=1, gentle extrapolation along the same velocity vector (capped at t=1.5).
- Bearing uses shortest-arc interpolation to avoid 360° wrapping.
- Zoom interpolated smoothly between fix values.
- Uses `map.jumpTo()` per frame for zero-lag updates.
- Loop pauses during touch gestures, stops on nav stop/pause/drag-break.

**d. Route-geometry heading replaces raw GPS bearing:**
- Root cause of map spinning: `_updateHeading` computed bearing from consecutive GPS positions. GPS jitter (5–20m noise) caused wild bearing changes even on straight roads.
- Solution: Primary heading now derived from route polyline geometry at the snap point, looking ~60m ahead. This follows the actual road shape and is immune to satellite noise.
- Falls back to GPS-to-GPS bearing only when off-route (no snap data available).
- Smoothed with 0.25 blend factor (lower = smoother) to avoid snapping on sharp corners.

**Files:** `src/navigation.js`, `docs/PREFERENCE_LOG.md`.

### 2026-04-05 — Directions autocomplete now prefers approved map places

- **Bug root cause:** `src/directions.js` used its own geocoder-only lookup path (`_dtGeoSearch` / Nominatim fallback), so approved places in `placesData` either did not appear in route suggestions or were outranked by generic external POIs.
- **Fix:** Added a local directions place search that matches against `placesData`, merges those results ahead of geocoder results, de-duplicates overlapping entries, and reuses the same merged lookup for both autocomplete suggestions and typed `Find Routes` auto-resolution.
- **Regression coverage:** Added a deterministic Playwright test that stubs local places plus Digitransit geocoding and verifies the local approved place appears first in the directions suggestions.
- **Files:** `src/directions.js`, `tests/07-directions.spec.js`.

### 2026-04-04 — Wishlist: approval system, pre-loading, animation, name/email

**a. Animated expand/collapse (Read More / Show Less):**
- Replaced full `_render()` call on expand toggle with direct DOM class toggle + `_animateWishCard()`.
- Added `force: true` option to `animateSheetHeight()` so wishlist modal animates on all screen sizes (the generic helper skips on mobile ≤768px which is correct for bottom sheets but not centered modals).
- `_toggleExpand()` function: finds the specific wish card by `data-id`, toggles `.wish-desc--open` class, and wraps in `_animateWishCard()` for smooth FLIP height animation.

**b. Optional name and email fields:**
- Added two optional fields to the "Make a Wish" form in `index.html`: Name (`maxlength=100`) and Email (`maxlength=254`, `type=email`).
- CF Function (`wishes.js`): validates email format if provided (`EMAIL_RE`), truncates both fields, passes to GAS.
- GAS (`Code.gs`): stores in new columns G (name) and H (email). `WISH_HEADERS` expanded. `ensureWishSheet` auto-upgrades existing sheets with missing headers.

**c. Approval system:**
- New column I (approved) in Wishes sheet. New wishes get empty string (pending).
- `getWishesJSON()` now filters: only returns wishes where `approved === 'yes'`.
- Post-submit toast changed to "It will appear after review" (was: instant refresh + "Thanks for your input").
- Removed `_lastFetch = 0; _fetchWishes()` after submit — approved wishes appear via next pre-load.

**d. Pre-load wishes alongside places:**
- New `preloadWishes()` export in `wishlist.js` — calls `_fetchWishesApi()` in background, stores in module-level `_wishes`.
- Called from `app.js` right after `initWishlist()` in the lazy-load block.
- `_open()` now uses pre-loaded data: instant render if available, shows "Loading..." if in progress, falls back to `_fetchWishes()` if no preload started.
- Session-scoped only — `_wishes` resets on page reload, no localStorage caching.

**Files modified:** `src/wishlist.js`, `src/utils.js`, `src/app.js`, `index.html`, `functions/api/wishes.js`, `scripts/apps-script/Code.gs`, `docs/PREFERENCE_LOG.md`.

### 2026-04-04 — Approach-then-fire step advancement + maneuver icons in turn chip

**a. Approach-then-fire algorithm — speed-dynamic, all modes:**
- **User feedback:** Static 8m fire distance is fine for cars but should scale with speed. Walking should use the same approach logic — firing 20m before the actual turn feels like misfiring.
- **Change:** Replaced static `APPROACH_FIRE_M = 8` with `_approachFireM()` function: `max(5, speed_m/s × 0.8)` clamped to [5m, 30m]. At walking 5 km/h → 5m, cycling 20 km/h → 5m, driving 60 km/h → 13m, driving 100 km/h → 22m, driving 120 km/h → 27m.
- **Hysteresis also speed-scaled:** `max(3, fireM × 0.4)` — prevents GPS jitter false-triggers at all speeds.
- **Walk mode now uses approach-then-fire** instead of immediate trigger-radius fire. Removed the `navMode !== "walk"` branch split.
- Constants: `APPROACH_FIRE_MIN_M = 5`, `APPROACH_FIRE_MAX_M = 30`.

**b. Turn chip shows actual maneuver icon:**
- Replaced generic `↱` text with the next step's real SVG icon (`navSteps[navStepIdx + 1].iconHtml`).
- Added `.nav-chip-icon` class in design-tokens.css: `display: inline-flex; align-items: center`, SVG scaled to `14px × 14px`.
- Uses `innerHTML` instead of `textContent` since we're inserting SVG markup. Distance text escaped with `esc()`.

**Files:** `src/navigation.js`, `src/styles/design-tokens.css`.

### 2026-04-04 — Recenter icon, speed limits, 3-chip HUD, smooth follow

**a. Recenter button restyled:**
- Icon changed to the same location arrow SVG used by the main app's Locate button (`M3 11l19-9-9 19-2-8-8-2z`).
- Background changed from accent (teal) to white surface with green accent icon. Dark mode: AMOLED black background.
- Consistent with the app's visual language — users recognise it instantly.

**b. Speed limit overlay from OSRM:**
- Added `annotations=maxspeed` to OSRM route request URL.
- OSRM returns per-segment speed limits from OSM data (array of `{speed, unit}` or `{none: true}`).
- Stored as `dir.directMaxspeeds`, carried into navigation as `_maxspeeds[]`.
- `_lookupSpeedLimit(segIdx)` maps the snapped route segment index to the speed limit.
- When current speed exceeds the limit, `hudSpeedVal.style.color = "var(--danger)"` (red).
- When under limit or limit unknown (0), color resets to default.
- Gracefully handles: no maxspeed data (OTP fallback routes), `{none: true}` segments, mph→km/h conversion.

**c. km/h text enlarged:**
- Changed from hardcoded `9px` to `var(--txt-xs)` (11px). Now legible.

**d. HUD row2 redesigned — 3 chips:**
- **Turn chip** (amber/warning): `↱ 2.3 km` — live distance to next turn, real-time countdown.
- **Destination chip** (accent/teal): `📍 14.2 km` — remaining distance to destination.
- **ETA chip** (surface-2/neutral): `ETA 14:32` — estimated arrival time.
- Removed old pattern of showing "for X km" in the instruction text (moved to dedicated chip).
- Dark mode styles for turn chip: amber tint background.

**e. Smooth auto-recentering:**
- Replaced `map.easeTo()` (600ms animation) with `map.jumpTo()` in `_smartFollow`.
- `easeTo` at 1s GPS intervals caused overlapping animations → visible jitter/stuttering.
- `jumpTo` is instant — no animation to overlap. The GPS puck is always centered with zero lag.
- `_programmaticMove` flag still wraps jumpTo to prevent `_onUserDrag` false-triggers.

**Files:** `src/navigation.js`, `src/directions.js`, `src/styles/design-tokens.css`, `index.html`.

### 2026-04-03 — Follow mode, robust speedo, desktop layout, live distance

**a. Always auto-recenter (not edge-only):**
- Changed from edge-detection recentering to always-follow: every GPS tick calls `map.easeTo` to center on user. User panning still sets `_following = false` and shows recenter button.

### 2026-04-04 — Wishlist mobile behavior split

**a. Wishlist stays modal, form slides from bottom:**
- User explicitly wants the wishlist itself to remain a centered window on phones, matching its prior behavior.
- Only the “Make a Wish” form should open like the other phone forms: bottom-aligned sheet with slide-up motion.
- Mobile overlay selectors in `styles.css` must exclude `#wish-overlay` / `#wish-card` and include only `#wish-form-overlay` / `#wish-form-card` for bottom-sheet behavior.

**Files:** `src/styles/styles.css`.

### 2026-04-04 — Wishlist: 4-tier status system

**Replaces** the earlier "implemented wishes sink to bottom" section.

**a. Sort order: Active → In Progress → Implemented → Out of Scope:**
- `implemented` column in Wishes sheet now accepts: blank (active), `Inprogress`, `Yes`, `Out of Scope`.
- Server-side (`getWishesJSON`) and client-side (`_sortWishes`) apply the same 4-tier priority sort.
- Within each tier, sorted by votes descending.

**b. Status badges (pp-badge style, matching place type badges):**
- **In Progress** → `--hsl-ferry` (cyan) — same as Prayer Room badge
- **Implemented** → `--success` (green) — same as Mosque badge
- **Out of Scope** → `--hsl-trunk` (orange) — same as Restaurant badge
- Uses `.wish-status-badge` class: uppercase, pill, `--txt-xs`, `--fw-semibold`, `--ls-caps`, 12% tint background. Same visual as `pp-badge` in place popups, no icons.
- Active wishes have no badge.

**c. Vote locking:**
- **In Progress** and **Implemented** wishes have disabled vote buttons (`.wish-vote--locked`).
- **Out of Scope** wishes remain votable — users can still express demand for future scaling.
- **Active** wishes remain votable as before.

**d. Admin validation updated:**
- `adminUpdateWishField` now accepts `Yes`, `Inprogress`, `Out of Scope`, or blank for col 10. Col 9 (approved) unchanged.

**Files:** `scripts/apps-script/Code.gs`, `src/wishlist.js`, `src/styles/design-tokens.css`.

### 2026-04-04 — Wishlist votes should toggle and use a like icon

**a. Vote interaction and icon semantics:**
- User wants wishlist votes to be reversible: tapping the same vote button again must remove the vote.
- Vote affordance should use a like/vote icon (thumbs-up), not a generic up arrow.
- Wishlist vote state must stay consistent across local UI state and server-side device tracking.

**Files:** `src/wishlist.js`, `functions/api/wishes.js`, `scripts/apps-script/Code.gs`.

### 2026-04-04 — Localhost data features need GAS fallback when CF Functions are absent

**a. Local static dev should mirror live data reads:**
- On localhost, Cloudflare Pages Functions are not running, so data features that rely on `/api/*` need the same direct `SHEETS_URL` fallback pattern used by places/eid.
- Wishlist loading should fall back from `/api/wishes` to `config.local.js -> SHEETS_URL?action=wishes` during local dev.

**Files:** `src/wishlist.js`.

### 2026-04-04 — Wishlist window size changes should animate like other panels

**a. Reuse shared height animation pattern:**
- User wants wishlist window size updates to animate smoothly instead of snapping.
- Wishlist desktop card should use the same shared height transition helper pattern already used elsewhere in the app.

**Files:** `src/wishlist.js`, `src/styles/styles.css`.

### 2026-04-04 — Wishlist descriptions must default to a strict two-line clamp

**a. No character-based truncation for wish descriptions:**
- User wants wish descriptions capped to exactly two rendered lines by default on both desktop and phone.
- Full description text should stay in the DOM; expansion must happen only when the user explicitly presses “Read more”.
- The “Read more” control should appear only when the clamped description actually overflows the two-line limit.

**Files:** `src/wishlist.js`, `src/styles/design-tokens.css`.
- Removed `EDGE_MARGIN_PX` constant — no longer needed.
- Works identically on desktop and mobile.

**b. Desktop speed/recenter positioning:**
- Mobile: above the HUD (bottom + 130px / 126px nav-mode). Unchanged — already perfect.
- Desktop (≥769px): flanking the HUD at same height (`bottom: 28px`), using `calc(50% - 260px)` left/right to sit just outside the 400px-wide HUD.

**c. Robust speedometer:**
- **Min distance raised:** 2m → 5m noise floor. Rejects more GPS jitter.
- **Min time interval:** 0.1s → 0.5s. Short intervals amplify small GPS errors into huge speeds.
- **Median filter:** 4-sample sliding window. Rejects outlier spikes before smoothing.
- **Speed cap:** Discard raw readings > 200 km/h (GPS teleport).
- **Heavier smoothing:** 0.3/0.7 old/new (was 0.4/0.6) for more stable reading.
- **Faster decay:** When stationary >3s (was 2s), decay factor 0.4 (was 0.5), cutoff at <2 km/h (was 1).
- **History reset:** `_speedHistory = []` on start/stop nav.

**d. Recenter button icon:**
- Replaced compass arrow (`M3 11l19-9`) with GPS crosshair (circle + crosshairs) — properly centered, universally recognized as "re-center on location".
- SVG: 20×20 with `stroke-width: 2`.

**e. Real-time distance to next turn:**
- The distance chip already had live `fmtDist(_liveDistToNextM)` — shows km when ≥1km, metres when <1km.
- **New:** "Continue on [road] for X km" — the instruction text now includes the live distance when cruising on a long segment (>300m from next maneuver).
- For depart/new name/continue steps, appends "— X km" to the existing instruction.
- Both the chip AND the instruction text update every GPS tick, giving a prominent countdown.

**Files:** `src/navigation.js`, `src/styles/styles.css`, `index.html`.

### 2026-04-03 — Nav overlap fix, button hiding, live "Continue for X km"

**a. Speedometer/recenter positioned above HUD:**
- Changed `bottom` from `14px` (same as HUD) to `130px` on desktop, `126px` on mobile nav-mode. Clears the HUD with ~14px gap.
- Previously overlapped the HUD on mobile (HUD is nearly full-width on small screens).

**b. All non-essential buttons hidden during navigation:**
- Moved hide rules from mobile-only `@media (max-width: 768px)` to apply at ALL screen sizes.
- Added `#contact-pill-wrap` and `#style-picker` to the existing nav-mode hide list.
- Now hidden: search, tools, zoom, prayer, eid, promos, tab bar, route snackbar, contact, style picker.

**c. "Continue for X km" live navigation instructions:**
- **Problem:** After completing a turn onto a 10km road, the HUD showed the old turn instruction with the static step distance. No "Continue on E12 for 10 km" countdown.
- **Solution:** Added `_updateLiveHUD()` called every GPS tick (1s throttle):
  - **Live distance chip:** Always shows `_liveDistToNextM` (GPS distance to next maneuver point) instead of the static step distance.
  - **Continue mode:** When `_liveDistToNextM > 300m` and the current step is a completed maneuver (turn, fork, merge, exit roundabout, etc.), shows "Continue on [road name]" with straight-ahead icon.
  - **Approach preview:** When `_liveDistToNextM <= 150m`, previews the NEXT step's instruction and icon (e.g., "Turn right onto Road Y" with the turn icon), giving advance warning. "Then:" line updates to show the step after the approaching one.
- Added `name` (road name) field to rawSteps in directions.js for both OSRM (`step.name`) and OTP (`step.streetName`), carried through `buildDirectStepsFromData`.
- `_COMPLETED_MANEUVERS` set: turn, fork, merge, on/off ramp, end of road, exit roundabout/rotary, roundabout turn, use lane. Excludes depart (its instruction IS the continue message) and roundabout entry (user is inside the roundabout, not on a straight road).
- Transit steps: live distance chip updates but instruction override is skipped (`step.type !== "direct"`).

**Files:** `src/navigation.js`, `src/directions.js`, `src/styles/styles.css`.

### 2026-04-03 — Roundabout radius tightened + smart follow mode

**a. Roundabout radius reduced to 15m (drive) / 12m (walk):**
- Previous 30m/20m was still too wide for small Finnish roundabouts where OSRM entry/exit maneuver points can be 10–30m apart. Now 15m requires being essentially at the maneuver point, combined with route-progress catch-up and divergence detection as safety nets.

**b. Smart follow mode replaces aggressive recentering:**
- **Old:** `map.easeTo` on every single GPS update — yanked the map to center on every tick.
- **New:** Edge-detection recentering. Auto-recenter only when the GPS puck approaches within 60px of the viewport edge. Smooth `easeTo` with 600ms duration.
- **User pan detection:** `map.on("dragstart")` sets `_following = false`. A `_programmaticMove` guard prevents our own `easeTo` calls from triggering this.
- **Recenter button:** When user pans away, a teal accent-colored 44px circle button appears bottom-right with a compass arrow icon. Clicking it re-centers on the current GPS position and re-enables auto-follow.
- **State reset:** `_following` reset to `true` on start/resume/stop. Button hidden on pause/stop.
- All existing `map.easeTo` calls in nav (start, resume, sim, reroute) wrapped with `_programmaticMove` guard.

**Decision:** Navigation must never fight the user for map control. Auto-follow is the default, but any manual pan immediately yields to the user. Re-center is always one tap away.

**Files:** `src/navigation.js`, `index.html`, `src/styles/design-tokens.css`, `src/styles/styles.css`.

### 2026-04-03 — Roundabout fixes, divergence advance, speedometer redesign

**a. Roundabout exit detection fix:**
- Roundabout/rotary maneuver steps (`roundabout`, `exit roundabout`, `rotary`, `exit rotary`, `roundabout turn`) now get a tighter `_triggerRadius`: 30m for driving (was 50m), 20m for walking. Roundabouts are spatially compact — the 50m radius was triggering both "enter" and "exit" simultaneously.

**b. Divergence-based early advance (3rd detection method):**
- Added to `_advanceStep` after proximity scan and route-progress catch-up.
- Logic: if distance to the next step is increasing but distance to the step after that is decreasing (`distToAfter < distToNext`), the user has passed the next step. Advance to the step after it.
- Safety bound: `distToAfter < _triggerRadius(afterStep) * 3` — prevents false triggers when the user is nowhere near the upcoming step.
- This catches turns missed by both proximity (never entered radius) and route-progress (coords may not have perfect routeProgressM ordering).

**c. Speedometer redesigned — standalone floating puck:**
- Moved from inside HUD (tiny chip, barely visible) to a standalone circular indicator.
- 56px circle with large speed number + small "km/h" label below.
- Positioned bottom-left of the map, same vertical level as the HUD.
- Uses design tokens throughout: `--surface`, `--border`, `--shadow-md`, `--txt-lg`, `--fw-bold`, `--text`, `--text-3`.
- Dark mode: AMOLED black background matching HUD.
- Hidden at 0 km/h, hidden on pause/stop.
- `pointer-events: none` — doesn't interfere with map interaction.
- User preference: speedometer must be visible, beautiful, conform to design language, compact, non-blocking.

**Files:** `src/navigation.js`, `index.html`, `src/styles/design-tokens.css`, `src/styles/styles.css`.

### 2026-04-03 — Catch-up shows NEXT instruction + speedometer

**Bug fix — catch-up showed wrong instruction:**
When route-progress catch-up detected the user had passed step N, it set `navStepIdx = N` — the HUD then displayed step N's instruction (already passed), not step N+1 (the one the user actually needs). Fix: catch-up now advances to `lastPassedIdx + 1` so the HUD always shows the upcoming instruction the user needs to follow. If the passed step is the last step (arrival), it stays on that step.

**Speedometer:**
- Speed computed from consecutive GPS samples in `processPosition`. Uses `_hDistM / timeDelta * 3.6` for km/h.
- Exponential smoothing (0.4/0.6 old/new) avoids jitter from GPS noise.
- 2-metre minimum distance filter ignores micro-movements (stationary noise).
- Speed decays toward 0 when stationary for >2s — no perpetual ghost speed.
- Displayed as a `nav-chip-speed` chip in the HUD row2, left of distance/ETA.
- Uses `font-variant-numeric: tabular-nums` so digits don't jitter horizontally.
- Hidden when speed is 0 (stationary), shown with `X km/h` when moving.
- Dark mode styled to match existing nav chips.
- State (`_prevSpeedPos`, `_speedKmh`) reset on start/stop navigation.

**Files:** `src/navigation.js`, `index.html`, `src/styles/design-tokens.css`.

### 2026-04-03 — Navigation step-advancement unit bug fix + route-progress catch-up
- **Root cause:** `haversineDistance()` returns **km** but every threshold in `navigation.js` was in **metres**. The movement guard required 10 km of movement (impossible) — navigation was permanently stuck at step 0.
- **Fix:** Added `_hDistM()` wrapper (`haversineDistance * 1000`) and replaced all 6 call sites in navigation.js. Now `snapToRoute`, `_buildRouteProgress`, `_advanceStep`, `distAlongRoute`, and `_findNearestCoordIdx` all compute in metres, matching their threshold constants.
- **Collateral fix:** Off-route detection (`snap.dist > 50`) was also broken (comparing km vs metres) — now works at 50m as intended.
- **Route-progress catch-up (user request b):** Added second detection method in `_advanceStep`. When proximity scan misses (user moved past the trigger zone between GPS samples), fall back to route-progress comparison: if the user's snapped `progressM` exceeds a step's `routeProgressM`, that step is marked as passed. Steps are ordered by route progress so scanning stops at the first un-passed step.
- **User preference:** Navigation should never get stuck — if a turn is missed, catch up to the next relevant instruction rather than staying on the old one.
- Files: `src/navigation.js`.

### 2026-04-03 — GPS Simulation Module for Navigation Testing
- **New module:** `src/gps-sim.js` — mouse cursor on map becomes the GPS signal. Activate with **Shift+G**.
- **How it works:** `mousemove` on map → `map.unproject()` → `setCurrentLocationState()` dispatches `"hf:current-location-updated"` — the exact same event real GPS produces. The app is completely unaware it's simulated.
- **Integration:** Navigation.js receives positions via `_onLocationUpdate` → `processPosition()` — step advancement, off-route detection, rerouting all run naturally. Places.js uses it for distance sorting.
- **Marker:** Reuses existing `.loc-marker` / `.loc-puck` / `.loc-ring` CSS. When sim starts, if real GPS tracking is active, it auto-stops it (clicks locate button to toggle off) to avoid competing sources.
- **Indicator:** Red pulsing "GPS SIM" pill badge fixed top-center with `--danger` background, `--z-overlay`, crosshair cursor on map canvas.
- **Throttle:** 100 ms mousemove throttle (10 Hz). Navigation.js has its own 1000 ms GPS_PROCESS_INTERVAL, so nav updates happen at realistic ~1 Hz.
- **Click:** Clicking the map gives an immediate precise fix — useful for testing exact trigger points.
- **Lazy-loaded** in `app.js` after `map.on("load")` alongside other non-critical modules.
- **Files:** `src/gps-sim.js` (new), `src/app.js` (lazy-load), `src/styles/styles.css` (badge CSS).

- **2026-04-03 — GPS sim: cursor-as-GPS for navigation testing.** Mouse position feeds `setCurrentLocationState()` at 10 Hz. Toggle via Shift+G. Red badge indicator. Auto-stops real GPS on activation.

### 2026-03-31 — Typography overhaul: font, scale, weights, tracking
- **Font swap (two rounds):**
  1. First replaced Inter with General Sans — user hated it, found it thin/soft at small sizes with poor visibility.
  2. Replaced General Sans with **Plus Jakarta Sans** (Google Fonts, SIL OFL 1.1, variable 200–800). High x-height gives excellent readability. Crisp ClearType hinting on Windows. Clean geometric with slightly rounded terminals. Self-hosted with latin + latin-ext (Finnish ä/ö/å): 27KB + 22KB = 49KB total.
- **Type scale bumped for readability:** xs 10→11, sm 12→13, base 13→14, md 14→15. Upper scale unchanged. User explicitly demanded fonts that aren't "barely visible" — old 10/12/13px floor was too small.
- **Weight rebalancing:** Demoted ~20 template selectors from semibold→medium (item titles, chips, tabs, secondary buttons, subtags, nav chips). Micro-labels/badges from bold→semibold. Three-tier system: regular (body) → medium (interactive) → bold (headings/CTAs).
- **Letter-spacing tokens:** Created `--ls-tight` (-0.025em), `--ls-normal` (0), `--ls-wide` (0.015em), `--ls-caps` (0.06em). Replaced all ~18 hardcoded letter-spacing values across both CSS files.
- **OpenType features:** Enabled `kern`, `liga`, `calt` globally. Added `.t-tabular-nums` template for numeric alignment.
- **Font stack pruned:** Removed Roboto, Helvetica Neue, Arial from fallback chain. Now: `'General Sans', -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', sans-serif`.
- **Files modified:** `design-tokens.css`, `styles.css`, `index.html` (preload), `sw.js` (cache), `DESIGN_SYSTEM.md`, `PREFERENCE_LOG.md`.
- **New font file:** `src/styles/fonts/GeneralSans-Variable.woff2` (38,132 bytes).

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

### 2026-04-13 — Transit navigation: stop-aware three-phase model + wait times

**Problem:** During transit navigation, arriving at a boarding stop (e.g., Puistola) caused the HUD to immediately cascade through intermediate stops ("Passing Tapanila") because the board step fired and the next step's instruction appeared — even though the user hadn't boarded the train yet and Tapanila was 2km away.

**Solution — three changes:**

**a. Board-step hold mechanism:**
- When `_advanceStep` lands on a `transit-board` step, it sets `_transitHoldUntil = departTimeMs + 30s`.
- While the hold is active, step advancement is blocked — the HUD stays on the board instruction.
- Hold releases when: (1) departure time + 30s buffer has passed, OR (2) user has moved >300m from the boarding stop (clearly on the vehicle).
- On release, force-advances past the board step so the next tick picks up the first intermediate stop.

**b. Dynamic transit live HUD (`_updateTransitLiveHUD`):**
- **Board step:** Shows countdown — "P arrives in 3 min", "P arriving soon", then "Board P → Helsinki".
- **Intermediate stops:** Three-phase — "Towards Tapanila" (far), "At Tapanila" (within 150m). Stops remaining + next stop preview in sub-line.
- **Alight step:** "Get off at X" (far), "Get off now — X" (within 150m).
- **Walk step:** Live distance to walk destination + departure countdown for next vehicle.

### 2026-04-14 — Navigation: 3D perspective view + auto-centering fix

**a. 3D navigation view (Google Maps-style):**
- Navigation now tilts the map into a forward-facing 3D perspective instead of flat 2D.
- Per-mode camera settings via `NAV_VIEW` constant:
  - **Drive:** 55° pitch, zoom 14.5–17.5, 80px ahead offset
  - **Walk:** 45° pitch, zoom 17–17.5, 60px ahead offset
  - **Cycle:** 50° pitch, zoom 15.5–17, 70px ahead offset
  - **Transit:** 35° pitch, zoom 15–16, 30px ahead offset
- GPS dot pushed to lower third of screen via `offset: [0, aheadPx]` — shows more road ahead.
- Smooth 1200ms tilt transition on nav start; 800ms untilt on nav stop.
- Recenter restores full nav view (pitch + zoom + bearing + offset).

**b. Dynamic auto-zoom (`_computeNavZoom`):**
- Zoom out as speed increases (0→120 km/h → max→min zoom).
- Zoom in when approaching a turn (<300m) — up to +1 zoom level boost.
- Walk/transit use nearly fixed zoom (no speed-based change).

**c. Auto-rotation bearing threshold:**
- Map heading only updates when speed > 3 km/h — prevents GPS jitter from rotating the map while stationary.
- When stationary, bearing holds at last value via `map.getBearing()`.

**d. Initial heading from route direction:**
- On nav start, computes heading from the first few route coordinates so the map immediately faces the route direction instead of defaulting to north.

**e. Auto-centering aggressiveness fix:**
- Removed canvas-level `pointerdown` listener that broke follow mode on ANY touch (including accidental taps, marker clicks).
- Follow now only breaks on deliberate gestures: drag (MapLibre `dragstart`), zoom (`zoomstart`), rotate (`rotatestart`), pitch (`pitchstart`), or desktop scroll (`wheel`).
- All MapLibre event handlers check `e.originalEvent` to distinguish user vs programmatic — our `easeTo` calls never trigger false follow-breaks.
- Quick taps on the map no longer exit follow mode. Matches Google Maps behavior.

**f. Cleanup: removed dead `_programmaticMove` flag:**
- Was set in many places but never read as a guard (all guards used `e.originalEvent` check instead). Removed entirely.

**g. Camera animation: 800ms linear easing replaces old 600ms easeTo:**
- At 1000ms GPS interval, the 800ms animation is ~80% complete when the next tick starts → seamless continuous tracking without overlap jitter.
- Linear easing (`t => t`) makes consecutive calls blend smoothly.

**Files:** `src/navigation.js`.

**c. Step data enrichment:**
- Board steps now carry `departTimeMs` (epoch ms from scheduled departure).
- Intermediate stops carry `estimatedArrivalMs` (linearly interpolated from leg start/end times).
- Default instruction for intermediate stops changed from "Passing X" to "Towards X" (overridden dynamically by live HUD).

**New constants:** `TRANSIT_AT_RADIUS_M` (150m), `TRANSIT_BOARD_HOLD_BUFFER_MS` (30s), `TRANSIT_DEPART_MOVE_M` (300m).
**New state:** `_transitHoldUntil` — reset in startNavigation/stopNavigation.

**Files:** `src/navigation.js`.
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

### 2026-04-28 — Navigation turn markers, direction arrows, and Lucide icons

**a. GPS sim confirmed enabled** — `initGpsSim()` already active in `app.js` for testing.

**b. Route line made solid single color:**
- Removed the alternating step-color logic (`["case", segType === roundabout → purple, idx % 2 → color/altColor]`) from `_drawDirectPrimary` in directions.js.
- Route line now uses a uniform solid `color` for all modes. Turns are indicated by on-road icons instead of color changes.

**c. Turn arrows embedded directly IN the road:**
- Removed the repeating chevron layer (`nav-arrow-ln`) — replaced by per-maneuver icons.
- White Lucide turn icons rendered to 32×32 canvas, placed as MapLibre symbol layer (`nav-turns-sym`) at each maneuver point.
- Icons sit directly on the route line at turn locations, like the arrow shown inside the road in Google Maps navigation.

**d. Turn overlay as side-label (not blocking road):**
- Changed from centered-on-road badge to an offset label: anchor="right", offset=[-12, 0] — sits beside the road like a street name label.
- Styled as 36×36 white card with teal accent border and teal icon (instead of teal-filled badge).
- Non-blocking: doesn't obscure the route line or turn icon on the road.

**e. Lucide icons replace custom SVGs:**
- `maneuverIconSvg()` in `directions.js` rewritten to use Lucide icon paths (ISC license, v1.12.0).
- All icons use consistent Lucide design language: 24×24 viewBox, stroke-based, 2.5 stroke-width, round caps/joins.

**Files:** `src/navigation.js`, `src/directions.js`, `src/styles/design-tokens.css`, `docs/PREFERENCE_LOG.md`.
- Name font: `--txt-sm` → `--txt-base` (matching `.pl-name`)
- Addr font: `--txt-xs` → `--txt-sm` (matching `.pl-addr`)
- Card width: 180px → 200px (accommodates larger icon/fonts)
- Track padding: `var(--sp-5)` → `16px` left/right (aligns first card with list content area)

### 2026-05-01 — Masjid Events Feature

**Full events system for mosques/prayer rooms:**

1. **Data schema (Google Sheet "Events" tab):**
   - Columns: id, place_id, title, description, event_date, event_time, end_time, recurring, recurrence_pattern, url, approved, created_at
   - Events require admin approval before becoming visible
   - Past one-time events auto-filtered out server-side

2. **API integration:**
   - Events served in `?action=all` response alongside places/tags
   - Cache key bumped from `all_v1` → `all_v2` to accommodate events data
   - CF submit function accepts `formType: "event"`

3. **Popup events section:**
   - Shows for all mosques/prayer rooms (even if no events yet)
   - Displays event cards with title, date/recurrence badge, time, optional external link
   - Small "+" button in section header to submit new events for that mosque
   - Events list scrollable with max-height 180px

4. **Places list card badge:**
   - `.pl-event-chip` shows event count inline after place name
   - Accent-tinted pill matching the sponsor/boycott chip pattern

5. **Dedicated Events tab:**
   - New "Events" chip in places panel type filter bar
   - Shows all approved events across all mosques
   - Grouped: Recurring first, then Upcoming (by date)
   - Each card shows: title, mosque name, schedule badges, description, link + view mosque buttons
   - Search works across event title, description, and mosque name
   - Tag filter + sort controls hidden on events tab

6. **Event submission form:**
   - Full overlay form (same pattern as suggest-a-place)
   - Fields: mosque (dropdown), title, description, one-time/recurring toggle, date, recurrence pattern, start/end time, URL
   - reCAPTCHA protected
   - Opens from: popup "+" button (mosque pre-selected), or places panel "+" when on events tab
   - Mobile: slides up from bottom like other forms

**Design decisions:**
- Events section uses accent/teal color (matches mosque green in spirit but uses brand accent for interactive elements)
- Event cards are compact flat surface-2 backgrounds (no borders, minimal)
- External link buttons use small accent-tinted square icons
- Recurring events show a repeat/refresh icon
- The events tab icon is a calendar with a filled square (distinct from other tab icons)

### 2026-05-01 — Events: Refactored from Tab to Inline + Pill

**User feedback:** Events is NOT a place → should NOT have its own tab in the places panel.

**Changes made:**
1. **Removed Events tab** — deleted the "Events" type chip from index.html and all `activeTypeFilter === "events"` logic from places.js
2. **Added expandable event drawer on place cards** — mosques/prayer rooms with events get a small pull-tab (calendar icon + count + chevron) below the card content. Clicking expands/collapses a list of event cards inline.
3. **Added events pill** — a calendar button beside the eid/promos pills that opens a full events overlay (same pattern as eid overlay). Lists ALL events across all mosques.
4. **Fixed event form** — submit button now uses `height: var(--h-submit)`, form padding matches suggest form (`16px 16px 20px`, gap `--sp-6`), radio buttons sized at 16px with `--fw-medium`.
5. **Added dummy events** — 5 test events seeded in places.js for development (BICC + Rabita mosques).

**Preferences expressed:**
- Events should NOT be a standalone tab — they belong attached to the place
- Events pill beside prayer time pill (similar to promo and eid pill) for ALL events
- The expanding drawer approach over a separate view
- Event form must strictly follow existing design language (input heights, button height, dropdown styling)

**Files modified:** `src/places.js`, `src/styles/styles.css`, `src/styles/design-tokens.css`, `index.html`

**Files modified:**
- `scripts/apps-script/Code.gs` — Events sheet schema, getEventsJSON, doPost event handling
- `functions/api/submit.js` — Accept event formType, validate event fields
- `src/places.js` — eventsData state, popup rendering, list card badge, events tab, submission form JS
- `src/styles/design-tokens.css` — Event chip, event card, event list card templates
- `src/styles/styles.css` — Popup events section layout, event overlay layout, mobile responsive
- `index.html` — Events type chip, event submission form overlay
- `docs/DESIGN_SYSTEM.md` — New template documentation

**Files modified:** `src/places.js`, `src/styles/styles.css`, `index.html`
**Decisions:**
- DESIGN UNIFORMITY is paramount — all sponsor UI must use same icon shapes, font sizes, padding, and layout patterns as existing components.
- `.pl-dot` shape (28×28 rounded square with `var(--r-xs)`) is the canonical icon style — never use circles for type icons.
- Place card font sizes (`--txt-base` name, `--txt-sm` addr) are the canonical sizes — carousel cards and promo items must match.

### 2026-04-29 — Road visibility: stronger casings + service road casing

**Problem:** Roads blended into the map in both light and dark mode. Minor/service roads had no casing at all (white on white). Secondary/primary casings were `#ccc` — barely visible against the white background and white fill.

**Fix:**
- **New `road_service_casing` layer** added before `road_service` in `map-style.js`. Minor/service roads now have a visible grey outline (`#d0d0d0`).
- **Darkened casing colors:** Secondary/tertiary `#ccc` → `#b8b8b8`, Primary `#ccc` → `#aaa`, Trunk/motorway `#f4d880` → `#e0c060`.
- **Widened casing-fill gaps:** Casing widths increased at low zooms (where the gap was sub-pixel): secondary z8 0.5→1.2, primary z6 0.3→0.8, trunk z6 0.4→0.8, motorway z5 0.4→0.8.
- **Bridge casings updated** to match: minor bridge `#ccc` → `#c0c0c0` (wider), major bridge `#ccc` → `#aaa` (wider).
- **Config + editor:** `road_service_casing` added to `BASE_COLORS`, `LAYER_PROP`, and editor UI groups.
- Dark mode benefits automatically — the canvas invert+contrast filter amplifies the now-stronger casing-fill contrast.

**Files:** `src/map-style-config.js`, `src/map-style.js`, `src/map-style-editor.js`.

### 2026-05-01 — Event edit request feature

Added "Request Edit" functionality for events, matching the existing place edit pattern.

**What was added:**
- **Apps Script:** New `event-edit` formType handler in `doPost()`. Creates an `EventEdit` sheet (auto-created) with columns: Timestamp, EventID, PlaceID, Title, Description, EventDate, EventTime, EndTime, Recurring, RecurrencePattern, URL, Score, ChangesSummary, Approved.
- **CF Function:** `event-edit` added to allowed `formType` values in `submit.js`. `eventId` field validation added.
- **Event form dual mode:** `openEventOverlay()` now accepts an optional `editEvent` parameter. When provided, the form pre-fills all fields (title, description, mosque, schedule, date/time, URL, recurring pattern) and switches heading to "Request Edit" / submit button to "Submit Edit Request".
- **Recurring pre-fill:** `_prefillRecurringFromPattern()` parses stored pattern strings and restores frequency, day-of-week, month-date, ordinal, and biweekly anchor selections.
- **Changes summary:** Edit submissions auto-generate a diff summary comparing original vs new values.
- **Edit buttons on event cards:** Both popup event cards (`.pp-ev-edit-btn`) and events overlay list cards (`.ev-overlay-edit-btn`) now have a pencil icon button. Same visual pattern as the existing link button.

### 2026-05-09 — Tab reorganisation: Mosques-only + Religious tab

**Decision:** Mosques tab now shows mosques only (previously included cemeteries as a subsection). A new "Religious" tab replaces the old "Prayer" tab and contains prayer rooms, cemeteries, and any future religious place types. This makes the taxonomy scalable — new religious categories (e.g. Islamic schools) can be added to `RELIGIOUS_TYPES` without changing tab UI.

**Changes:**
- `index.html` — Replaced `data-type="prayer_room"` chip with `data-type="religious"` chip. Label "Prayer" → "Religious". Icon changed from person to crescent+star.

### 2026-05-09 — UI polish sweep: micro-interactions, accessibility, motion

**Full redesign audit and targeted upgrades** applied across the design system.

**New tokens added:**
- `--shadow-accent-sm` / `--shadow-accent-md` — brand-tinted shadows for focused inputs and hovered primary CTAs
- `--focus-ring` / `--focus-ring-inset` — accessible keyboard focus indicator (double-ring pattern)
- `--t-press` — 100ms snappy timing for button press/release feedback
- `--stagger-unit` — 35ms per-item delay for sequential list entry animation

**Button micro-interactions (all templates):**
- **Hover:** `translateY(-1px)` lift on filled buttons + tinted shadow on primary CTA
- **Active/pressed:** `scale(0.90–0.98)` depending on button size — simulates physical click
- **Focus-visible:** accessible ring on all interactive elements (keyboard only, not mouse)
- Applied to: `btn-icon`, `btn-icon-card`, `btn-primary`, `btn-secondary`, `btn-danger-pill`, `btn-danger-filled`, `btn-success-pill`, `btn-secondary-pill`, `btn-roundel`, `btn-roundel-danger`, `btn-roundel-accent`, `btn-roundel-subtle`, `btn-roundel-sm`, `btn-chip`, `tf-chip`, `ev-filter-chip`

**Staggered list entry animations:**
- `staggerFadeUp` keyframe — 8px translateY + opacity fade with `--ease-expo`
- Applied to search results (`#results-list li`), place cards (`.pl-card`), and direction route cards (`.itin-card`)
- `--i` CSS variable added to search results and direct route cards for sequential delay

**Card hover elevation:**
- Place cards (`.pl-card`): border darkens + subtle shadow on hover, surface-2 on active
- Route cards (`.itin-card`): shadow + border on hover
- New `.t-card-hover` template for reuse on any card

**Typography:**
- `text-wrap: balance` on `.t-panel-heading` — prevents orphaned words on panel headings

**Input focus:**
- `.t-field-wrap` and `#search-box`: accent-tinted glow (`--shadow-accent-sm`) on focus
- New `.t-input-glow` template for standalone inputs

**Accessibility:**
- Skip-to-content link (`<a class="skip-link">Skip to map</a>`) — hidden until focused
- `prefers-reduced-motion`: all animations and transitions suppressed when OS setting is on
- `::selection` styling: accent-tinted highlight instead of browser-default blue
- `:focus-visible` ring on all buttons and tabs (separated from `:focus` which stays suppressed for mouse clicks)
- Tab bar `.tab:focus-visible` now shows the focus ring (previously suppressed)

**Scrolling:**
- `scroll-behavior: smooth` added globally on `html, body`

**Dark mode:**
- `--shadow-accent-sm`, `--shadow-accent-md`, `--focus-ring` overridden for dark theme

**Files modified:** `src/styles/design-tokens.css`, `src/styles/styles.css`, `index.html`, `src/search.js`, `src/directions.js`, `docs/DESIGN_SYSTEM.md`
- `src/places.js` — Added `RELIGIOUS_TYPES = new Set(["prayer_room", "cemetery"])`. All three filter blocks (markers, tag bar, list rendering) updated to use `RELIGIOUS_TYPES.has()` for the `religious` tab. Removed the separate cemetery subsection that was hardcoded under the mosque tab. Tag filter bar merges tags from all religious types via `flatMap`. Search placeholder updated.
- `icons.js`, `map-controls.js` — No changes needed; individual type colors and heatmap scoring remain per-type.

**Files modified:** `index.html`, `src/places.js`, `docs/PREFERENCE_LOG.md`.
- **Design uniformity:** Edit button in popup cards uses the same 26×26 accent-tinted style as `.pp-ev-link`. Overlay list edit button uses subtle opacity fade matching the link icon.

**Files modified:** `scripts/apps-script/Code.gs`, `functions/api/submit.js`, `src/places.js`, `index.html`, `src/styles/design-tokens.css`, `src/styles/styles.css`

**Spreadsheet setup required:** No manual spreadsheet setup needed — the `EventEdit` sheet is auto-created on first event edit submission. Headers: Timestamp | EventID | PlaceID | Title | Description | EventDate | EventTime | EndTime | Recurring | RecurrencePattern | URL | Score | ChangesSummary | Approved.

### 2026-04-29 — Navigation zoom: smoother + more aggressive, mobile boost

**Problem:** Zoom in/out during navigation was too subtle (only 1 zoom level range) and jerky (no smoothing between levels). Especially bad on phone where the small display needs more dramatic zoom changes to show turns vs long roads.

**Fix (5 changes):**
- **Widened zoom ranges ~3×:** Drive 16–17 → 14.5–17.5, Walk 17–18 → 16–18.5, Cycle 16.5–17.5 → 15–18, Transit 16–17 → 15–17.5. Now 2.5–3 zoom levels of dynamic range.
- **Mobile boost:** +0.6 zoom levels on screens ≤768px (`MOBILE_ZOOM_BOOST`). Phones zoom in tighter on turns.
- **Stronger turn boost:** 1.2 → 2.8 max, with quadratic ramp (`t²`) instead of linear — zoom accelerates as you approach the turn.
- **EMA zoom smoothing:** `ZOOM_SMOOTH_ALPHA = 0.08` — very gradual zoom changes, no jarring jumps. Resets on nav start/stop/recenter.
- **All modes now dynamic:** Walk and transit were previously fixed zoom — now they use speed-dynamic zoom with mode-appropriate speed caps (walk 8 km/h, cycle 35 km/h, drive/transit 120 km/h).
- **Longer easing:** `FOLLOW_DURATION_MS` 450 → 900ms to give MapLibre more time to animate the now-larger zoom transitions.

**Files:** `src/navigation.js`.

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

### 2026-05-10 — Unified transition polish sweep

**Goal:** Add beautiful, consistent transitions across the app where content swaps or visibility toggles were previously instant.

**a. Places tab content cross-fade:**
- Switching between type filter chips (All/Mosques/Spaces/Restaurants/Shops/Saved) now fades out the list, swaps content, then fades in with per-card stagger animation.
- Uses a new `.pl-fading` class on `#places-scroll` with `opacity var(--t-med)` transition.
- Falls back to instant swap on mobile (≤768px) or when sheet is closed, to avoid jank on low-end devices.
- Same cross-fade applied to tag filter changes and "clear all filters" action.
- `CROSSFADE_MS = 150` — fast enough to feel responsive, slow enough to be perceived.

**b. Heatmap toggle fade:**
- Heatmap layer now fades in/out smoothly using MapLibre's `heatmap-opacity-transition` (350ms).
- On enable: layer starts at opacity 0, then animates to zoom-interpolated opacity via `requestAnimationFrame`.
- On disable: opacity animates to 0, then layer visibility set to "none" after fade completes.
- Prevents the jarring instant-on / instant-off effect.

**c. Map marker fade:**
- Place markers now fade in/out when crossing zoom thresholds (cluster zoom, heatmap pin zoom).
- Changed from instant `visibility: hidden` to CSS class toggle `.mk-hidden` with `opacity var(--t-med)` transition.
- `pointer-events: none` on hidden markers prevents ghost taps during fade.

**e. Marker entrance fade on tab switch:**
- When switching tabs, markers are created with `mk-hidden` (opacity 0), then revealed via double-rAF to ensure the browser commits the initial hidden state before transitioning to visible.

### 2026-05-10 — Qibla compass (mobile-only)

**New feature — mobile-only Qibla compass overlay:**
- Added a "Qibla" button at the bottom of the expanded prayer times list (after Isha row).
- Button only appears on mobile (`window.innerWidth < 769`) and when `DeviceOrientationEvent` is available.
- Tapping opens a full-screen overlay with a rotating compass showing direction to the Kaaba.

**Implementation:**
- **`src/qibla.js`** — new lazy-loaded module with:
  - Qibla bearing calculation using great-circle formula (Kaaba: 21.4225°N, 39.8262°E).
  - `DeviceOrientationEvent` listener for compass heading (iOS `webkitCompassHeading` + Android `alpha`).
  - iOS 13+ permission flow via `DeviceOrientationEvent.requestPermission()`.
  - Low-pass smoothing filter (α=0.15) with shortest-arc interpolation for jitter-free rotation.
  - `requestAnimationFrame` render loop for 60fps smooth compass.
  - GPS `watchPosition` for live bearing updates as user moves.
  - Full cleanup on close: removes event listeners, clears watch, cancels rAF.
  - "Locked on" detection — when phone is within ±5° of Qibla bearing.
- **Prayer panel integration** — `_hasOrientationSupport()` check + `_openQiblaOverlay()` lazy-imports `qibla.js`.

**Visual design (premium redesign):**
- SVG compass face with tick marks every 10° (major at 30°, cardinal at 90°).
- Radial gradient background on compass dial.
- Double-ring: decorative outer ring + functional inner ring.
- Fixed center pointer (accent-colored triangle + crosshair dot) — does not rotate.
- Compass ring rotates so north always points to true north.
- Kaaba indicator: accent-colored dot with pulsing ring on the ring edge at Qibla bearing.
- "Locked on" state (within ±5°): ring border turns accent with glow, Kaaba dot turns success green, bearing number turns accent, status text turns success green.
- Bearing displayed as hero number (`--txt-3xl`, `--fw-bold`, tabular-nums).
- Full dark mode: surface-2 card background, inverted radial gradient, adjusted borders.
- Card enter animation: scale(0.94) + translateY(8px) + opacity for depth.
- Pulsing Kaaba indicator using `qibla-pulse` keyframe (scale 0.6→1.6 with fade).

**Files created:** `src/qibla.js`
**Files modified:** `index.html`, `src/prayer.js`, `src/styles/styles.css`, `docs/PREFERENCE_LOG.md`
- Applies to all `addPlaceMarkers()` calls: tab switch, filter change, clear filters, fav toggle, initial load.

**d. Respects `prefers-reduced-motion`:**
- All new transitions suppressed by the existing global `@media (prefers-reduced-motion: reduce)` rule.

**Files modified:** `src/styles/styles.css`, `src/places.js`, `src/map-controls.js`
**New CSS:** `.pl-fading`, `.mk-hidden`, `#places-scroll > ul` transition
**New JS:** `_crossFadePlacesList()`, `CROSSFADE_MS`, heatmap fade-in/out logic, `HEATMAP_FADE_MS`
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

### 2026-04-01 — Refactoring agent + code quality standards for open-source readiness
- **Created `.github/agents/refactorer.agent.md`** — a dedicated safe-refactoring agent that works file-by-file in three tiers: (T1) JSDoc, console.log removal, `_` prefix standardisation, dead code removal; (T2) magic number extraction, custom event constants, function decomposition; (T3) CF Function error handling standardisation, import ordering.
- **Added §I (Code Quality Standards) to The Architect** (`.github/agents/the-architect.agent.md`) — 9 rules that all new code must follow: JSDoc on exports, no magic numbers, `_` prefix on private state, no debug logging, ≤100-line functions, import ordering, event name constants, CF error patterns, no dead code. This prevents new code from needing future refactoring.
- **Codebase audit findings** (informing the refactorer): ~8,500 LOC across 22 JS files. Consistent: camelCase, UPPER_CASE constants, named exports, no `var`, `esc()` usage, `.join("")`. Inconsistent: no JSDoc on 40+ exports, ~15 console.logs in prod, mixed `_` prefix usage on module state, ~40 magic numbers, 3 functions >150 lines (findRoutes, encodeCompactRoute, initSheetDrag).
- **Files created:** `.github/agents/refactorer.agent.md`
- **Files modified:** `.github/agents/the-architect.agent.md`, `docs/PREFERENCE_LOG.md`

### 2026-04-04 — Wishlist feature: community feature request board

**New feature — Wishlist:**
A full community wishlist / feature-request board integrated into the app.

**Architecture decisions:**
- **Storage:** Google Sheets "Wishes" tab (cols: id, title, description, votes, created, votedDevices). Same pattern as all other data — Sheet → Apps Script → CF Function proxy → client.
- **Vote dedup:** Dual approach — `hf_device_id` in localStorage (stable per browser profile) sent with each vote; server-side comma-separated device ID list per wish in column F. Same device can't vote twice (server is authoritative). Incognito/different browser can bypass — acceptable without auth.
- **API:** Single CF Function `functions/api/wishes.js` handles GET (list, 5-min edge cache) and POST (add/vote, reCAPTCHA-protected). Follows existing patterns (allowedOrigin, truncate, JSON error responses).
- **Client module:** `src/wishlist.js` — lazy-loaded after map.on("load"). Optimistic vote UI with server reconciliation.

**UI decisions:**
- **Button placement:** Star icon `btn-icon-card` pill, positioned in the tools group (bottom-right). Inside tools toggle on phone/tablet, always visible on desktop. 4th tool alongside Search, Style, Contact.
- **Overlay:** Same pattern as Contact overlay — fixed overlay with centered card, `.hide` class toggle, backdrop tap to close.
- **Two views:** List view (scrollable wish cards sorted by votes) and form view (title + description inputs). Toggle between them via header buttons.
- **Card design:** Wish card with title, 2-line description preview (expandable "Read more"), and upvote button (arrow + count) on the right side.
- **Add button:** Accent-colored + roundel in the header bar (top-right of list view, left of close button).
- **Form view back button:** Arrow-back in the close button position, navigates back to list (not closes overlay).

**Files created:** `functions/api/wishes.js`, `src/wishlist.js`
**Files modified:** `index.html` (pill button + overlay markup), `src/app.js` (lazy-load + init + fast-tap), `src/tutorial.js` (wishlist steps for desktop + phone/tablet), `src/styles/design-tokens.css` (wish templates + scrollbar aliases), `src/styles/styles.css` (overlay layout, pill positioning across all breakpoints, nav-mode hide), `sw.js` (pre-cache wishlist.js), `scripts/apps-script/Code.gs` (wishes CRUD, ensureWishSheet, getWishesJSON)

### 2026-04-14 — Mobile navigation: free roam must override all auto-center

Second pass root-cause fix after the first attempt proved incomplete.

**a. Actual root cause:**
- `src/map-controls.js` still recentred the map on every GPS update whenever `dir.routeLayers.length > 0`.
- That path ignored navigation follow state, recenter button visibility, and the HUD offset.
- Result: tapping recenter briefly placed the GPS dot correctly above the HUD, then the regular locate watcher pulled it back to screen center on the next GPS tick.
- Result: the recenter button could be visible while the map still auto-centered.
- Result: the first drag felt stuck because the locate watcher and nav camera were both scheduling map movement.

**b. Final fix:**
- In `src/map-controls.js`, GPS-driven `flyTo`/`easeTo` is skipped entirely whenever `body.nav-mode` is active.
- In `src/navigation.js`, `_smartFollow()` also exits whenever the recenter button is visible, making the UI state authoritative: button showing = no auto-follow.
- Existing touch suppression stays in place: `touchstart` calls `map.stop()` and `_smartFollow()` pauses while `_touchCount > 0`.
- Added early touch-drag detection in `src/navigation.js`: once a one-finger movement exceeds 10 px, `_stopFollowing()` runs immediately instead of waiting for MapLibre `dragstart`.

**c. Behavior guarantee:**
- Recenter button hidden: navigation may auto-follow and keep the GPS dot above the HUD.
- Recenter button visible: no auto-centering from either navigation or the base locate watcher.
- After tapping recenter, the first real drag immediately becomes free map movement on phone instead of being consumed by follow cancellation.
- Desktop behavior stays unchanged because the locate-watcher guard is scoped to `body.nav-mode`, not to platform.

**Files:** `src/map-controls.js`, `src/navigation.js`.

### 2026-04-20 — Navigation: zoom out, encoding fix, jumpTo follow, route-geometry heading

**a. Zoom out navigation view (3rd round):**
- NAV_VIEW reduced by ~2 levels per mode:
  - drive: 18–19 → 16–17
  - walk: 18.5–19 → 17–18
  - cycle: 18–19 → 16.5–17.5
  - transit: 17.5–18.5 → 16–17
- User consistently wants to see more road ahead during navigation.

**b. Mojibake encoding fix:**
- File had double-encoded UTF-8 (UTF-8 bytes interpreted as CP-1252, then re-encoded as UTF-8).
- Fixed 92 lines via line-by-line `encode('cp1252').decode('utf-8')` with fallback.
- Restored all box-drawing chars (─), em dashes (—), arrows (→, ↱), middle dots (·), multiplication signs (×).

**c. Stationary GPS dot — jumpTo replaces easeTo in _smartFollow:**
- **Problem:** `easeTo` animated over 300–800ms. Between frames, the GPS marker (at real coordinates) drifted ahead of the still-animating map center → visible "GPS runs ahead, map chases" effect.
- **Fix:** `map.jumpTo()` is instant — the map tiles move underneath while the GPS dot stays at its fixed screen position (lower third via offset). Zero lag between GPS update and map position.
- Removed dead `FOLLOW_DURATION_MS` constant (no longer used).
- `_recenter()` and `startNavigation()` keep `easeTo` for one-time smooth transitions.

**d. Route-geometry heading (anti-jitter):**
- **Problem:** GPS-to-GPS bearing changed wildly from GPS jitter (5–20m noise), causing the map heading to spin randomly even on straight roads.
- **Fix:** New `_routeBearingAtSnap()` function looks 60m ahead on the route polyline from the current snap position. Uses road geometry (immune to GPS noise) as the primary heading source.
- Smoothed with `HEADING_SMOOTH_FACTOR = 0.25` via shortest-arc interpolation (`_blendHeading()`).
- GPS-to-GPS bearing remains as fallback only when off-route or near the route end.
- Constants: `HEADING_LOOKAHEAD_M = 60`, `HEADING_SMOOTH_FACTOR = 0.25`.

**Files:** `src/navigation.js`.

### 2026-04-21 — Navigation: camera follow decoupled from route throttle and matched to puck lerp

**Problem:** The first fix attempted to smooth `jumpTo`, but camera follow was still fed by the throttled navigation processor (`processPosition()` at 1Hz). That meant the camera still only got new targets once per second. The interpolation was also target-to-target instead of rendered-state-to-target, so the puck could still outrun the map.

**Correct fix:**
- `_onLocationUpdate()` now drives camera follow on every location update before the throttled route-processing path runs.
- `processPosition()` remains throttled at 1Hz for step advancement, off-route detection, HUD math, and speed limits.
- `_smartFollow()` now animates from the current rendered follow state to the newest GPS fix, not from previous raw target to current raw target.
- Camera follow uses the same easing pattern as the location puck lerp in `map-controls.js` (`1 - (1 - t)^3`, 1000 ms), keeping the puck visually stationary while the map glides underneath.
- Removed the previous target-timestamp/extrapolation model entirely.
- `_recenter()`, nav start/resume, pause, stop, and manual follow-break all reset or stop the follow lerp cleanly.

**User intent reinforced:** During navigation, the GPS location should feel anchored in one stable screen position with a consistent amount of map ahead. The map moves around the puck smoothly; the puck should not appear to run ahead and the camera should not step once per second.

**Files:** `src/navigation.js`.

### 2026-04-21 — Navigation: fixed follow puck and snapped camera target to stop map shake

**Problem:** Even after decoupling camera follow from the 1Hz route throttle, the map could still shake because follow mode was visually anchored to live GPS jitter. When the camera follows raw GPS noise, the entire map wobbles under the user even if the puck stays near the intended screen position.

**Fix:**
- Added a stationary navigation puck overlay (`#nav-fixed-puck`) at the follow anchor point (~70% viewport height).
- While `body.nav-mode.nav-following` is active, live `.loc-marker` map markers are hidden and the fixed overlay puck becomes the only visible location anchor.
- Camera follow now prefers the snapped route position whenever GPS is within 40m of the route.
- Micro-jitter is ignored entirely: new follow targets are skipped if movement is <1.5m and bearing/zoom deltas are negligible.
- Nav start, resume, and recenter all initialize the camera from the same snapped follow target, so the overlay puck and map agree immediately.

**User intent reinforced:** During navigation, the puck should feel locked in one stable position and the same amount of road should remain visible ahead. GPS noise should not shake the map.

**Files:** `index.html`, `src/styles/styles.css`, `src/navigation.js`.

### 2026-04-21 — Navigation: restored original GPS autocentering

**Problem:** The experimental follow models (jumpTo, secondary interpolation, fixed overlay puck, snapped camera target) made navigation feel worse to the user than the original camera behavior.

**Fix:**
- Removed the fixed navigation puck overlay from `index.html` and `src/styles/styles.css`.
- Removed the experimental navigation-only follow interpolation / UI state from `src/navigation.js`.
- Restored the original `_smartFollow()` behavior: `map.easeTo()` recenters directly on the live GPS position during navigation follow mode.
- Restored the original lifecycle flow: camera follow is triggered from `processPosition()` again, and nav start/resume/recenter use the live GPS/step centers instead of secondary follow targets.

**User preference:** The original map autocentering the GPS is preferred over the stationary-puck / custom follow-camera experiments.

**Files:** `src/navigation.js`, `index.html`, `src/styles/styles.css`.

### 2026-04-21 — Navigation: shorter, smoother follow steps

**Problem:** After restoring the original GPS-centered autocentering, the map still moved in visible smooth "steps" because camera updates were still tied to the throttled route-processing loop.

**Fix:**
- Kept the original GPS-centered `map.easeTo()` follow model.
- Moved `_smartFollow()` back onto every `hf:current-location-updated` event.
- Moved `_updateSpeed()` to the raw location stream as well so follow zoom/bearing reacts faster.
- Left route snapping, step advancement, HUD math, covered-route updates, and reroute checks throttled separately at 250 ms.
- Shortened follow easing to 180 ms on touch devices and 220 ms on desktop so repeated GPS fixes blend together instead of chunking.

**User preference:** If the camera feels stepped, shorten the cadence of the existing follow behavior instead of reintroducing a different follow-camera model.

**Files:** `src/navigation.js`.

### 2026-04-21 — Navigation: EMA jitter smoothing on follow target

**Problem:** After switching to per-tick camera updates, GPS noise caused visible micro-jitter — the map trembled slightly instead of gliding smoothly.

**Fix:**
- Added EMA (exponential moving average, α=0.35) on the follow target position (`_smoothLng`, `_smoothLat`) and bearing (`_smoothBearing`).
- `_smartFollow()` now feeds the smoothed coordinates to `map.easeTo()` instead of raw GPS values.
- Bearing uses shortest-arc EMA to avoid wrap-around artifacts near 0°/360°.
- EMA state resets on nav start, nav stop, and recenter so the camera snaps to real GPS immediately after any mode change.
- Unified follow duration to 300 ms (was 180/220 split) — long enough for MapLibre to interpolate between ticks, short enough to feel responsive.
- Same GPS-centered `map.easeTo()` model — no new camera abstraction, no fixed puck.

**User feedback:** "fantastic! now it's genuine real time movement! it just feels jittery and not smooth, but everything else is perfect!"

**Files:** `src/navigation.js`.

### 2026-04-29 — GPS sim: route playback + phone activation

**Problem:** GPS sim module only worked on desktop (mouse events + Shift+G shortcut). No way to test navigation on phone.

**Solution — three additions to `src/gps-sim.js`:**

1. **URL param `?sim` auto-activation:** Adding `?sim` to the URL auto-activates GPS sim 1.5s after map load. Ideal for phone testing — no keyboard needed.

2. **Route playback engine:** When GPS sim is active and a route exists (direct or transit), a Play button auto-walks the simulated GPS position along the route coordinates at configurable speed. Uses `requestAnimationFrame` for smooth continuous movement. Binary-search interpolation along cumulative-distance array for precise positioning.

3. **Playback speed presets:** Walk (5 km/h), Cycle (15 km/h), Drive (40 km/h), Fast (100 km/h). Default is Drive. Active speed highlighted with accent color.

4. **Tappable badge:** GPS SIM badge now has `pointer-events: auto` and an x close button. On phone, tap x to stop sim.

**Controls panel:** Fixed horizontal bar below the badge with play/pause, speed presets, and stop button. Uses `--surface-2` bg, `--accent` for active states, `--danger` for stop.

**Interaction during playback:**
- Mouse/tap position feed disabled while playback is running (prevents accidental jumps)
- Pause resumes from current position (resets dt to avoid time-jump)
- Stop resets progress to 0

**Files modified:** `src/gps-sim.js`, `src/styles/styles.css`.

### 2026-04-29 — Turn overlay pinned to the actual turn point

**Problem:** On phone, the floating turn badge could visually miss the maneuver because the marker was using the raw step lat/lng while the white turn highlight used the snapped route coordinate, and the marker offset placed the pointer tip short of the actual turn.

**Fix:**
- Added `_turnOverlayCoord(step)` in `src/navigation.js` so direct maneuvers use `navRouteCoords[step.coordIdx]`, matching the same road vertex used by the 4m white turn highlight.
- Added `_cssPx()` and changed the overlay marker offset to `- --nav-turn-pointer-size`, so the pointer tip lands on the maneuver coordinate instead of sitting several pixels away from it.
- Existing markers now also update their offset when the overlay advances.

**Files modified:** `src/navigation.js`.

### 2026-05-01 — Structured recurring events + event list filters

**a. One-time events: date is now mandatory.**
- `#ev-date` input has `required` attribute. Form validation marks it `.invalid` if empty when submitting a one-time event.

**b. Recurring events: structured pattern selector replaces free-text input.**
- New module `src/event-recurrence.js` — recurrence engine with pattern builder, parser, human-readable formatter, and date resolver.
- Frequency chips: Daily, Every week, Every other week, Monthly.
- Weekly/biweekly: day-of-week chip picker (Mon–Sun).
- Monthly: sub-type toggle (On a date / On a day):
  - On a date: 1–31 compact chip grid.
  - On a day: ordinal (First–Fourth, Last) + day-of-week.
- Biweekly: anchor date input to define the bi-weekly cycle start.
- Live preview label showing resolved pattern + next occurrence date.
- Pattern stored as structured string (e.g., `weekly:5`, `monthly-day:1:0`, `biweekly:3:2026-05-07`).
- Legacy free-text patterns still display correctly (graceful fallback).

**c. Event list filters:**
- Date filters: Upcoming (default), Today, This week, This month, All.
- Proximity sort: "Nearby" toggle that sorts by haversine distance from user location (requests GPS if needed).
- Mosque filter: dropdown populated with mosques that have events.
- All filters combine — date filter + mosque filter + proximity sort.
- Empty state shown when no events match filters.

**Pattern format (updated — multi-value):**
- `daily` — every day
- `weekly:1,3,5` — every week on Mon, Wed, Fri (comma-separated, 0=Sun..6=Sat)
- `biweekly:1,3:2026-05-05` — every other week on Mon+Wed, anchored from date
- `monthly-date:1,15` — monthly on the 1st and 15th
- `monthly-day:1,-1:0,5` — first and last Sun and Fri of each month

**Multi-select implementation:**
- State variables changed from scalars to `Set` objects: `_evDaysOfWeek`, `_evMonthDates`, `_evOrdinals`, `_evMonthlyDows`.
- Chip click handlers use `toggle` pattern (tap = add to Set + `.active`, re-tap = remove from Set + remove `.active`).
- `_buildCurrentPattern()` spreads Sets into arrays for `buildPattern()`.
- `buildPattern()` in `event-recurrence.js` accepts arrays for `days`, `monthDates`, `ordinals`.
- `parsePattern()` returns arrays via `_parseNums()` (splits comma-separated values).
- `formatRecurrence()` uses `_joinList()` for human-readable multi-value output (e.g., "Mon, Wed, and Fri").
- Validation checks `.size` instead of `== null`.

**Files modified:** `src/event-recurrence.js`, `src/places.js`, `index.html`, `src/styles/design-tokens.css`, `src/styles/styles.css`.

### 2026-05-15 — Comprehensive design audit & visual overhaul

Full design audit requested: "beautiful, useful, modern, dynamic" with "uniform, consistent design, styles, color, typography, animation." Priority: phone > PC > tablet. Constraint: no button size feedback on hover/press/tap.

**a. Token foundation upgrades (design-tokens.css):**
- `--txt-4xl: 28px` added, `--txt-display: 30→32px` — dramatic heading scale
- `--r-lg: 20→18px`, `--r-xl: 24→22px`, `--r-3xl: 32px` added — slightly tighter radii, new large tier
- `--h-input: 44px` — minimum touch-friendly input height
- `--h-submit: 44→48px` — taller CTA buttons
- `--stagger-unit: 35→40ms` — slightly slower stagger for elegance
- `.t-panel-heading` bumped to `--txt-3xl`
- `.pl-card` radius `--r-sm→--r-md`, padding increased
- `.btn-tab` padding increased, indicator 4→6px bottom + 20→24px width + stronger glow
- `.btn-primary` added letter-spacing `--ls-tight`
- `.pill-expand:not(.collapsed)` radius `--r-xl→--r-2xl`
- `.snack` padding/gap increased, icon 30→34px
- `.t-field-wrap` added `min-height: var(--h-input)`
- `.skel-bone` gradient refined (3-stop, 100deg angle)

**b. Dark mode contrast fixes:**
- `--border: #2a2a2a→#333333`, `--border-light: #262626→#282828` — from ~1.2:1 to visible contrast
- `--surface-2: #222222→#1a1a1a`, `--surface-3: #333333→#2e2e2e`
- `--text: #efefef→#f0f0f0`, `--text-2: #b8b8b8→#b0b0b0`, `--text-3: #909090→#808080`

**c. Sheets overhaul:**
- `.sheet` radius `--r-2xl→--r-3xl`, shadow tokenized to `--shadow-float`
- `.sheet-drag` padding tokenized, `.sheet-head` padding tokenized, h2 `--txt-2xl→--txt-3xl` + line-height 1.15
- Desktop width `400→420px`

**d. All popup upgrades (place, stop, eid):**
- Width `280→320px`, min-width `200→220px`, radius `--r-md→--r-lg`
- New `@keyframes popupFadeIn` (fade + scale(0.96→1)) replaces basic fadeIn
- Inner padding tokenized, gaps tokenized, title `--txt-md→--txt-lg` + letter-spacing
- Fav buttons: `min-width/min-height: 44px` for touch targets
- Action buttons: height `34→38px`

**e. Overlay cards (contact, wish, suggest, edit):**
- Max-width increased 20px, radius `--r-xl→--r-2xl`, shadow `--shadow-lg→--shadow-xl`
- Close scale `0.96→0.97`
- Form padding/gap tokenized and increased

**f. Search & results:**
- Search dropdown radius `--r-xl→--r-2xl`
- Results list item padding tokenized

**g. Direction panel:**
- Mode bar, time bar, Go button padding/margins tokenized
- Go button height `--h-field→--h-submit`
- Results area padding tokenized, loading area spacing tokenized

**h. Prayer snack:**
- Position tokenized, header padding tokenized, time item padding tokenized

**i. Places list:**
- `.pl-dot` 28→32px + radius `--r-xs→--r-sm` + svg 14→15px
- Direction input padding tokenized

**j. Documentation:**
- `DESIGN_SYSTEM.md` updated: new tokens `--r-3xl`, `--txt-4xl`, `--h-input`, `--h-submit`, `--h-field`, updated `--r-lg/--r-xl` values, `--stagger-unit`, `--txt-display`

**Files modified:** `src/styles/design-tokens.css`, `src/styles/styles.css`, `docs/DESIGN_SYSTEM.md`, `docs/PREFERENCE_LOG.md`.

### 2026-05-14 — Comprehensive design overhaul (continued)

Continued the full design audit and overhaul for uniform, modern, premium look.

**Token refinements (design-tokens.css):**
- Surface: `--surface-2: #f5f5f5` (was #f0f0f0), `--surface-3: #e0e0e0` (was #d9d9d9)
- Text: `--text: #111111` (was #191919), border: `--border: #e2e2e2` (was #dedede)
- Type scale: `--txt-3xl: 26px` (was 24px), `--txt-4xl: 30px` (new), `--txt-display: 36px` (was 30px)
- Added line-height tokens: `--lh-tight: 1.15`, `--lh-snug: 1.3`, `--lh-normal: 1.5`, `--lh-relaxed: 1.65`
- Added `--card-pad` / `--card-pad-lg` for consistent card inner spacing
- `--stagger-unit: 30ms` (was 35ms)
- Shadow system: all tiers upgraded with multi-layer, wider spread values
- Template refinements: `.t-panel-heading` bigger, `.pl-card` r-md + card-pad, all buttons r-pill, `.t-field-wrap` r-md, `.snack` r-2xl, step dots + tab indicators bigger

**Styles.css uniform upgrades:**
- All overlay cards (suggest, edit, contact, wish, eid, events, privacy): r-2xl, shadow-xl, max-width 420px, spring transitions
- All form containers: padding sp-7/sp-8, gap sp-7
- All form inputs: padding sp-5/sp-6, r-md, modern focus ring
- Sheet: r-3xl, smoother 0.35s transitions, shut scale 0.95
- Sheet drag handle: thinner, wider (40px), more breathing room
- Popup: r-lg, wider (220-320px), popupEnter animation (scale+fade)
- Search dropdown: r-2xl, expo ease transition, tokenized padding
- Direction suggest: r-md, expo ease, tokenized padding
- Tutorial card: r-2xl, shadow-xl, more padding
- Sponsor card: r-md, sp-4/sp-5 padding
- Itinerary card: r-md, spring animation
- Direction field: r-md, modern focus ring
- Zoom pill: r-xl
- Tab filter row: tokenized spacing
- Dark mode: refined surface/border/shadow values throughout

**DESIGN_SYSTEM.md updated:** new line-height tokens, corrected surface/text/border values, corrected type scale values, stagger-unit value.

**Files modified:** `src/styles/design-tokens.css`, `src/styles/styles.css`, `docs/DESIGN_SYSTEM.md`, `docs/PREFERENCE_LOG.md`.

### 2026-05-09 — Event drawer/card compact redesign

User wanted the event section in place list cards to be more compact, beautiful, and take up less space.

**Event card template (design-tokens.css):**
- Removed background fill (`var(--surface-2)`) — cards were visually heavy
- Added subtle left accent border (`2px solid accent@35%`) instead — clean hierarchy without bulk
- Removed border-radius (was `--r-xs`) — no box framing needed without background
- Tightened padding: `sp-1h sp-3 sp-1h sp-4` (was `sp-2h sp-3`)
- Meta text color: `--text-3` (was `--text-2`) for better hierarchy
- Meta gap: `sp-1h` (was `sp-2`), info gap: `1px` (was `sp-0h`)
- Link/edit buttons: removed background fill, hover adds tint. Sized down to 28px (was 34px)

**List drawer (styles.css):**
- Removed `border-top` and `padding-top` — less visual overhead per card
- Margin-top: `sp-1` (was `sp-2`)
- Toggle padding: `sp-1` (was `sp-1h`)
- Replaced `max-height` animation hack with `grid-template-rows: 0fr/1fr` + spring transition for smoother expand/collapse
- Added `.pl-ev-body-inner` wrapper (JS markup updated) for proper grid animation

**Popup events section (styles.css):**
- Gap: `sp-1h` (was `sp-2`), padding-top: `sp-2` (was `sp-3`)
- Events list gap: `sp-1` (was `sp-1h`)

**Preference confirmed:** Events should be visually minimal — no card containers, use spacing and accent lines for hierarchy instead.

**Files modified:** `src/styles/design-tokens.css`, `src/styles/styles.css`, `src/places.js`, `docs/PREFERENCE_LOG.md`.

### 2026-05-09 — Event drawer pull-tab design

User wanted the collapsed event toggle to look like a compact "pull tab" instead of a full-width row.

**Changes:**
- Toggle restyled from full-width row to centered pill tab: `inline-flex`, `r-pill`, `accent@8%` background tint
- Font size: 10px (was `--txt-xs` / 11px), smaller icons (10px calendar, 8px arrow)
- Padding: `sp-0h sp-4` — very compact vertically
- Removed redundant inline `pl-event-chip` from the name row — pull tab handles event count
- Drawer container: `align-items: center` to center the pill
- Hover: pill background deepens to `accent@14%`
- Arrow: 60% opacity for subtlety, rotates on open

**Preference confirmed:** Event indicators should be compact pill-style pull tabs, not full-width interactive rows. Avoid redundant badges when the pull tab already communicates event count.

**Files modified:** `src/styles/styles.css`, `src/places.js`, `docs/PREFERENCE_LOG.md`.

### 2026-05-11 — Places sheet closing during inline search (mobile)

**Problem:** On phone, the places sheet would sometimes close unexpectedly while the user was searching in the `#pl-search-input` inline search. The scrim click handler in `directions.js` closed the entire sheet when a stray tap landed on the scrim area (map background) — easy to trigger accidentally on mobile with virtual keyboard viewport changes.

**Root cause:** Two issues:
1. The scrim click handler (`directions.js`) unconditionally called `closePlacesSheet()` whenever the directions panel was shut — it didn't check whether the places inline search was active.
2. `#pl-search-input` had `font-size: 14px` (`--txt-base`), below the 16px iOS auto-zoom threshold. Focusing the input triggered Safari's auto-zoom, causing viewport shifts that increased the chance of misplaced touch events.

**Fix:**
1. Added `dismissPlacesSearch()` export to `places.js` — returns `true` if the search was open (and closes it + blurs input), `false` otherwise.
2. Modified scrim click handler in `directions.js`: if `dismissPlacesSearch()` returns `true`, the scrim tap only closes the search, NOT the entire sheet.
3. Changed `#pl-search-input` font-size from `--txt-base` (14px) to `--txt-lg` (16px) — prevents iOS auto-zoom on focus.

**Files modified:** `src/places.js`, `src/directions.js`, `src/styles/styles.css`.

### 2026-05-11 — UI polish: remove focus artifacts and auto-focus on popups

**Problem:** When popups opened (places, pins, transit stops, etc.), the direction button appeared "active" with a green focus ring. Similarly, search inputs showed a prominent green inset focus ring that didn't match the minimal design.

**Changes:**
1. **Disable popup auto-focus** — Added `focusAfterOpen: false` to all MapLibre Popup constructors (5 files: places.js, search.js, map-controls.js, eid-prayers.js, transit-stops.js). MapLibre's default behavior was focusing the first button, triggering `:focus-visible` styling.

2. **Remove search input focus rings** — Added explicit `box-shadow: none` on `:focus` and `:focus-visible` for both `#search-input` (main search) and `#pl-search-input` (inline places search). Both are borderless transparent inputs that don't need visual focus treatment — parent `.search-box` and `.pl-search-wrap` already provide visual context.

**Preference encoded:** Popups should open without stealing focus. Search inputs should be visually quiet on focus. No green highlights on transient interactions.

**Files modified:** `src/places.js`, `src/search.js`, `src/map-controls.js`, `src/eid-prayers.js`, `src/transit-stops.js`, `src/styles/styles.css`.

### 2026-05-11 — Opening hours feature

**Data format:** `hours` field on place objects — `{ "mon": "10:00-22:00", "tue": null, ... }`. Supports per-day schedules, multiple ranges per day (comma-separated), and null for closed days.

**a. Apps Script (Code.gs):**
- `getPlaceDetails()` now requests `opening_hours` from Google Places API.
- New `convertGoogleHours()` function converts Google's periods format to compact `{day: "HH:MM-HH:MM"}` JSON.
- `enrichPendingRows()` extracts and stores opening hours during enrichment.
- Opening hours stored in: Draft col I, New col Q, Edit col L, Places col O.
- `getPlacesJSON()` reads Places col O → `place.hours` in the API response.
- `copyNewRowToPlaces()` and `applyEditToPlaces()` copy hours to Places sheet.

**b. Submit API (submit.js):**
- Added `openingHours` field truncation (MAX_NOTES_LEN).

**c. Forms (index.html + places.js):**
- Both suggest and edit forms have optional "Opening Hours" section with checkbox toggle.
- "Same hours every day" mode (simple: one open/close time pair).
- "Different hours by day" mode (per-day open/close + per-day "Closed" checkbox).
- Edit form pre-fills existing hours from place data.

**d. Popup card (places.js):**
- Shows expandable "Hours" section with clock icon, Open/Closed badge, and accordion day-by-day table.
- Today's row highlighted with bold weight.
- Closed days shown in red italic.

**e. Places list card:**
- Open/Closed chip badges inline with place name.

**f. Open Now filter:**
- "Open Now" toggle button in toolbar (clock icon, green active state).
- Filters both the list and map markers to show only currently-open places.
- Integrated into clear-filters flow.

**Files modified:** `scripts/apps-script/Code.gs`, `functions/api/submit.js`, `index.html`, `src/places.js`, `src/styles/design-tokens.css`, `src/styles/styles.css`.

### 2026-05-12 — Typography standardization sweep

**Problem:** Too much font-size variation (11px–36px), excessive bold usage, hardcoded pixel sizes and weights scattered across both CSS files and JS.

**a. Type scale tightened — smaller spread, more harmonious:**
- `--txt-xs`: 11→12px (badges/labels more readable)
- `--txt-xl`: 18→17px, `--txt-2xl`: 20→19px (slight pull-in)
- `--txt-3xl`: 26→22px (panel headings — was too large for a map app)
- `--txt-4xl`: 30→26px, `--txt-display`: 36→30px
- Middle stays: sm=13, base=14, md=15, lg=16 (unchanged)
- New scale: 12→13→14→15→16→17→19→22→26→30 (even step ratios ~1.06–1.15x)

**b. Weight tier standardized — 4 clear levels:**
- `--fw-regular` (400): body text, descriptions, placeholders, helper text
- `--fw-medium` (500): interactive labels, chips, tabs, form labels, sort options, distances, style picker labels, places count, pf-labels, sponsor chips, boycott chips
- `--fw-semibold` (600): badges, counts, section headers, popup titles, tag summaries, tag type headers, active sort, active pf-labels, open/closed chips, event chips
- `--fw-bold` (700): ONLY panel headings (h2/h3), primary CTA buttons, segment buttons(→semibold)

**c. Hardcoded sizes replaced with tokens:**
- All `font-size: 9px/10px` in app code → `var(--txt-xs)` (except MapLibre/legal chrome which stays 9px)
- All `font-size: 13px` in JS inline styles → `var(--txt-sm)`
- All `letter-spacing: 0` → `var(--ls-normal)`
- `--fw-normal` (nonexistent) → `--fw-regular`

**d. Weight demotions (bold overuse fix):**
- **bold→semibold:** badge counts, tf-count, event dot count, section headers, sort labels, tag-type, tags-summary, popup titles, active pf-label, active sort, btn-segment
- **semibold→medium:** distances, style-opt labels, places-ct count, pf-labels, sort options, open/closed chips, sponsor chips, event chips, tf-group-count
- **bold→semibold in design-tokens.css:** snack-tc-badge

**Files modified:** `src/styles/design-tokens.css`, `src/styles/styles.css`, `src/search.js`

### 2026-05-16 — In-app community reviews & ratings system

**Full implementation of an independent review/rating system separate from Google ratings.**

**Anti-abuse architecture (triple-identity + moderation):**
- Browser fingerprint: canvas + WebGL + hardware signals → SHA-256 hash
- localStorage device ID: `hf_device_id` (shared with wishlist)
- Server-side IP hash: CF-Connecting-IP → SHA-256 via CF Function
- reCAPTCHA v3 threshold: 0.7 (aggressive)
- Triple dedup: fingerprint OR deviceId OR ipHash match = same user
- Rate limit: 5 reviews per fingerprint per 24h
- Text moderation queue: text reviews start as "pending", ratings are instant

**User preferences expressed:**
- Most aggressive anti-abuse possible — reviews directly affect businesses
- Hybrid moderation: star ratings instant, text reviews require admin approval
- Anonymous reviews (no login), 1–5 stars + optional text (min 20 chars)
- Replace Google ratings entirely with community ratings
- Users can UPDATE their star rating (replaces previous) but cannot edit/delete text
- Newest-first sorting for review lists
- Popup shows summary (avg + count), tapping opens full overlay

**Data architecture:**
- Google Sheet "Reviews" tab: placeId | rating | text | deviceId | fingerprint | ipHash | timestamp | status
- Apps Script handles: dedup check, rate limiting, update-or-insert logic, grouped JSON with averages
- CF Function `/api/reviews`: GET (5-min edge cache), POST (reCAPTCHA + IP hash + forward)
- Client cache: localStorage `hf_reviews_v1`

**UI integration:**
- Place cards: small rating chip (star + avg + count) in `.pl-meta`
- Place popups: community rating section (star display + avg + count), clickable to open overlay
- Reviews overlay: fixed centered card with summary stats, star distribution, review list, write form
- Star input: interactive 5-star clickable component
- Write form: star rating + optional text area (20–500 chars) + char counter + submit

**Module loading:**
- `reviews.js` statically imported by `places.js` (since places renders rating chips)
- `loadReviews()` called at end of `loadPlacesData()` (non-blocking background fetch)
- Removed redundant lazy-import from app.js (ES modules are singletons — static import from places.js already loads it)

**Files created:** `functions/api/reviews.js`, `src/reviews.js`, `docs/REVIEWS_IMPLEMENTATION.md`
**Files modified:** `scripts/apps-script/Code.gs`, `src/places.js`, `src/utils.js`, `src/wishlist.js`, `src/app.js`, `index.html`, `src/styles/styles.css`
**Decisions:**
- Reviews are completely independent from Google ratings — own data store, own UI, own aggregation
- `getDeviceId()` extracted to `src/utils.js` as shared utility (used by both wishlist and reviews)
- No edit/delete for text reviews — prevents gaming; users can only update their star rating
- 5 reviews/day per fingerprint is aggressive enough to prevent bulk abuse without login
- SW already caches `/api/reviews` via own-origin stale-while-revalidate (no change needed)

### 2026-05-16 — Review UI polish: design language uniformity

**Popup rating section redesigned to match events/hours section pattern:**
- New `.pp-reviews` wrapper with `border-top` separator (matches `.pp-events`, `.pp-hours`)
- Section header with gold star icon + "REVIEWS" uppercase label (matches `.pp-events-hdr` pattern)
- Rating row (avg + stars + count) has pill-shaped hover background (`--gold-soft`)
- Empty state shows outlined star icon + "Be the first to review" (inviting CTA, not grey text)

**Reviews overlay refinements:**
- Split card into fixed header (`.rv-overlay-hdr`) + scrollable body (`.rv-overlay-body`)
- Summary section gets `--gold-soft` background + `--r-lg` radius (visually distinct area)
- Distribution bars get white background (contrasts against gold-soft) + slightly taller (7px)
- Distribution labels use `--fw-medium` + `--text-2` (was `--text-3`)
- Empty state redesigned: centered flex column with circular gold-soft icon holder + descriptive text
- "Write a review" button gets a pencil icon (edit SVG)
- Review cards: padding + hover background instead of bottom-border + no padding
- Star gaps widened to 2px (was 1px) for better star separation
- Star buttons use `filter: brightness(1.15)` hover (no transform per user preference)

**Form improvements:**
- Form gets `--surface-2` background + `--r-lg` radius (visually contained area)
- Added "YOUR RATING" uppercase label above star input for clarity

**Files modified:** `src/reviews.js`, `src/places.js`, `src/styles/styles.css`

### 2026-05-16 — Reviews overlay: strict design language conformance (round 3)

**User feedback:** "the design of the popup does not follow the design language of the app itself — e.g. the button height doesn't match etc."

**Root cause:** The reviews overlay was using bespoke header, title, and close button classes instead of reusing the canonical overlay pattern (`.suggest-head`, `.btn-roundel`, `.sheet-x`). Button heights, padding, form styling, and empty state all deviated from established app patterns.

**Changes (markup — reviews.js):**
- Replaced bespoke `.rv-overlay-hdr` + `.rv-overlay-title` + custom close button with `.suggest-head` + `<h3>` + `.btn-roundel.sheet-x` — exact same pattern used by suggest, contact, wish, and events overlays
- Summary section now conditionally shown (hidden when 0 reviews — was showing a meaningless "0.0" average)
- Removed `.rv-divider` element entirely (header border-bottom handles separation)
- Added mobile drag handle (`<div class="sheet-drag"><span></span></div>`)
- Empty state simplified from circular icon holder + descriptive text to plain `<p>` "No reviews yet"
- Removed `.rv-form-label` ("YOUR RATING" uppercase label) — form is self-explanatory with star input
- Fixed form insertion target — was inserting relative to removed divider, now inserts before `.rv-list`

**Changes (CSS — styles.css):**
- Removed bespoke `.rv-overlay-hdr`, `.rv-overlay-title` rules (now reused `.suggest-head`)
- Removed `.rv-divider` rule (divider element removed)
- Removed `.rv-form-label` rule (element removed)
- Removed `.rv-empty-icon` rule (icon holder removed)
- `.rv-overlay-card`: max-width → 420px (was variable)
- `.rv-overlay-body`: padding → `sp-6 sp-8 sp-8`, gap → `sp-6`
- `.rv-summary`: removed `--gold-soft` background (too heavy), increased gap to `sp-6`
- `.rv-avg-num`: font-size 36px, letter-spacing `--ls-tight`
- `.rv-dist-bar`: height 6px (was 7px), background `--surface-2`
- `.rv-write-btn`: added `height: var(--h-submit)`, `flex-shrink: 0`
- `.rv-submit-btn`: added `height: var(--h-submit)`, `flex-shrink: 0`
- `.rv-form`: removed `background`, `border-radius`, `padding` (was `--surface-2` box — no other form in the app uses this), increased gap to `sp-4`
- `.rv-list`: added `border-top: 1px solid var(--border-light)` + `padding-top: sp-4` for visual separation
- Removed orphaned `.rv-overlay-hdr` mobile override (class no longer exists)

**Patterns enforced:**
- All overlays must use `.suggest-head` for header, `.btn-roundel.sheet-x` for close
- All submit/CTA buttons must use `height: var(--h-submit)`
- Forms should not have their own background/radius — they live inside the overlay body
- Empty states should be minimal text, not elaborate icon compositions

**Files modified:** `src/reviews.js`, `src/styles/styles.css`

### 2026-05-16 — Button uniformity audit

Full audit of every button in the project to enforce two rules:

**Rule 1: No scale/transform feedback on buttons.**
Removed `:active { transform: scale(...) }` and `:hover { transform: scale(...) }` from:
- `.rv-write-btn` (was 0.98 active)
- `.rv-star-btn` (was 0.88 active, 1.15 hover)
- `.rv-submit-btn` (was 0.98 active)
- `.rv-action-btn` (was 0.98 active)
- `.pp-rating` (was 0.98 active)
- `.nav-recenter` / `.nav-overview` (was 0.95 active, 1.08 hover)

Replaced with color/opacity/filter-only feedback (`filter: brightness(0.92)`, `opacity: 0.75`).

**Rule 2: Buttons are EITHER icon-only OR text-only.**
Removed decorative SVG icons from:
- `.rv-write-btn` — pencil icon removed, now text-only "Write a review"
- `#dir-go` — arrow icon removed, now text-only "Find Routes"
- `.tf-open-now-chip` — clock icon removed, now text-only "Open Now"
- `.qibla-btn` — compass icon removed, now text-only "Qibla"

**Kept as-is (structural/functional exemptions):**
- `.sg-hours-disclosure` chevron (expand/collapse indicator)
- `.tf-group-toggle` chevron (expand/collapse indicator)
- `.pl-city-toggle` chevron (expand/collapse indicator)
- `.wish-vote` thumbs-up (functional icon with count)
- `.mode-opt` transport icons (mode differentiation, not decoration)

**Files modified:** `src/reviews.js`, `src/places.js`, `src/prayer.js`, `index.html`, `src/styles/styles.css`, `src/styles/design-tokens.css`, `docs/PREFERENCE_LOG.md`.

### 2026-05-17 — Eid prayer submission flow + Code.gs dead code removal

**a. Eid banner deferred to Phase 2 data:**
- `_showBannerWhenReady()` now only fires after the API response (or fallback failure), not from cached/static Phase 1 data.
- Prevents showing stale Eid counts before fresh data arrives.

**b. Full Eid place submission pipeline:**
- Added `<option value="eid_prayer">Eid Prayer Place</option>` to suggest form type dropdown.
- Built `#sg-eid-fields` container: mosque organizer multi-select (dropdown + chips), custom organizer input, date picker, jamaats text field.
- `_populateEidOrgDropdown()` sources mosque names from `placesData`.
- Multi-org selection with chips and remove buttons.
- Custom organizer add button with height/radius matching input field.
- Time normalization regex handles "9", "9am", "9:00", "08.30" → "HH:MM" 24h format.
- Payload uses `formType: "eid"` routed through existing `/api/submit` → Apps Script.
- CF Function: added `'eid'` to allowed `formTypes`, eid field truncation.
- Apps Script: `formType === 'eid'` → "EidNew" sheet, `ensureEidNewSheet()`, `enrichEidPendingRows()`, `getPendingEid()`, `adminApproveEid()`, `adminRejectEid()`, `copyEidNewToEidPrayers()`, `onSheetEdit` extended for EidNew.

**c. UI polish:**
- Tags section hidden for eid_prayer type (irrelevant).
- Organizer dropdown excludes non-mosque places.
- `.sg-eid-org-add-btn` class: matches input height (`--sp-5`/`--sp-6` padding), `--r-md` radius, `--txt-sm` font.
- Gap in `.sg-eid-fields` matches form spacing (`--sp-7`).
- "Custom Organizer" label changed to "Add" (concise).
- Jamaat time format validation with user-friendly error messaging.

**d. Dead code removal from Code.gs (~313 lines removed):**
- Removed `testSendEmail()` — one-time auth test, already run.
- Removed `setupTriggers()` + `setupEnrichmentTrigger()` + `setupApprovalTrigger()` — one-time trigger setup, already run.
- Removed `migrateTagsToIds()` — one-time migration, already run.
- Removed `migrateHalalStatusTags()` — one-time migration, already run.
- Removed `normaliseExistingAddresses()` — one-time migration, already run.
- Removed `backupNewToDraft()` — one-time backup, already run.
- Removed `reEncryptPlaceIds()` — one-time ID migration, already run.
- Removed `testUrlParsing()` — test helper, not production code.
- Removed `seedCuisineTags()` — one-time seed, already run.
- Updated file header comments to remove references to deleted functions.
- Kept: `forceEnrichAll()`, `backfillOpeningHours()`, `deduplicateNewSheet()`, `deduplicatePlacesSheet()` (useful manual maintenance utilities).
- Kept: `invalidateReviewsCache()` (no-op but called by 2 active functions).

**Files modified:** `src/eid-prayers.js`, `index.html`, `src/places.js`, `functions/api/submit.js`, `scripts/apps-script/Code.gs`, `src/styles/styles.css`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-19 — User Guide: Mobile-First Rewrite

**Preferences expressed:**
- User guide must be mobile-first — phone UI screenshots as the primary visuals because most users are on phone.
- Screenshots must be properly cropped to the actual UI element — never show the full screen when you can crop.
- Screenshots must NEVER include toasts, banners, or notification overlays — those are ephemeral and confuse the guide.
- Optimize the HTML guide for phone viewing and professional presentation.
- Desktop screenshots are acceptable as small secondary previews but phone is the hero.

**Decisions:**
- **2026-05-19 — Guide layout: 560px max-width, mobile-first CSS.** Default styles target 390px viewport. `@media (min-width: 480px)` for larger sizes. Not desktop-first.
- **2026-05-19 — Phone-frame screenshot treatment.** Mobile overview uses `.phone-frame` class: centered, max-width 320px, `--r-2xl` radius, deep shadow for device feel.
- **2026-05-19 — Desktop shown as thumbnail aside, not equal hero.** Desktop overview is a 120px thumbnail inside a muted `.desktop-note` box below the phone hero.
- **2026-05-19 — Form screenshots crop to `#suggest-form` element, not `#suggest-overlay`.** The overlay includes backdrop/scrim which makes the screenshot too large and noisy.
- **2026-05-19 — Toast/banner suppression in all captures.** `hideToasts()` hides `.snack`, `.eid-banner`, `.toast`, `[class*='banner']` before every screenshot.
- **2026-05-19 — All tab clicks use `{ force: true }` in Playwright.** Mobile bottom sheets intercept clicks on the tab bar; force bypasses actionability checks.

**Files modified:** `scripts/capture-guide-screenshots.js`, `docs/user-guide.html`, `docs/user-guide.css`.

### 2026-05-28 — Reviews overlay height transitions

**Problem:** Opening the review form changed the reviews overlay height instantly because `reviews.js` removed/inserted form DOM while `.rv-overlay-card` was at `height: auto`.

**Fix:** Added a scoped FLIP-style height helper for `.rv-overlay-card`: pin current height, perform the DOM swap, measure the new natural height, then animate `height` with `--t-spring`. Wrapped the write-review form insertion, email-to-OTP verification step, OTP fallback, and invalid-token fallback.

**Pattern:** Review overlay content swaps should animate the card height instead of relying on immediate auto-height reflow.

**Files modified:** `src/reviews.js`, `src/styles/styles.css`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-28 — Cross-form overlay height transitions and changelog restore

**Problem:** The review overlay height animation needed to carry over to other dynamic form surfaces such as event recurrence fields, suggest/edit opening hours, and Eid prayer submission fields. Recent commits also had no central changelog coverage.

**Fix:** Promoted the review-specific FLIP height logic to shared `animateElementHeight()` in `src/utils.js`, then reused it in reviews, event schedule/recurrence controls, suggest/edit hours disclosure/add/remove flows, suggest tag accordions, and suggest Eid organizer chip updates. Added `height var(--t-spring)` to overlay card transitions for suggest, edit, contact, wish form, event, Eid, and reviews-compatible card surfaces.

**Documentation:** Created root `CHANGELOG.md` with an Unreleased section plus backfilled notes for commits `898f686`, `04a183e`, and `dc5d830`. Added the overlay-height pattern to `docs/DESIGN_SYSTEM.md`.

**Pattern:** Any overlay card whose visible content changes after opening should wrap the mutation in `animateElementHeight()` unless the card is hidden or the user has enabled reduced motion.

**Files modified:** `CHANGELOG.md`, `docs/DESIGN_SYSTEM.md`, `docs/PREFERENCE_LOG.md`, `src/places.js`, `src/reviews.js`, `src/styles/styles.css`, `src/utils.js`.

---

### 2026-05-29 — Google review source moved to Sheets, no live per-open API calls

**Preference:** Google ratings/reviews must not be fetched on every overlay open due to API quota limits. Instead, store them in the Reviews sheet and refresh manually when needed.

**Implementation:**
- `Reviews` sheet schema extended with `H=googleReview` (JSON array) and `I=googleRating` (number).
- Apps Script now exposes Google-backed review items via `getReviewsJSON()` by parsing `googleReview`, tagging those items as `source: "google"`, and combining them with community reviews.
- Added manual Apps Script helper: `refreshAllGoogleReviewsAndRatings()` to bulk update all places into Reviews `H:I` using Google Places APIs.
- Removed Cloudflare live Google review fetch path so `/api/reviews` is now sheet-driven only.

**Opening hours rule (explicit):**
- New-place enrichment writes Google opening hours only when `New!Q` is empty.
- If user submitted opening hours, those are preserved and used over Google-derived values.

**Files modified:** `scripts/apps-script/Code.gs`, `functions/api/reviews.js`, `src/reviews.js`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-29 — New approval copies Google reviews from New R/S

**Bug:** Approving a place created a `Reviews` row with the generated place ID, but `googleReview` and `googleRating` stayed blank. The approval copy path still read only 17 columns from `New`, so values in `New!R:S` were outside the fetched row array.

**Fix:** `copyNewRowToPlaces()` now reads 19 columns from `New`, making `r[17]` and `r[18]` available for `upsertGoogleReviewForPlaceId()`. Added approval-time logging that reports whether the Google review payload and rating were present.

**Files modified:** `scripts/apps-script/Code.gs`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-29 — Google-only places still show ratings

**Bug:** Google-only places could show text reviews but no rating panel because the frontend ignored review records with `count=0`, and the Apps Script aggregate required `googleRatingCount` even when `googleRating` existed.

**Fix:** Frontend `getPlaceRating()` now derives an aggregate from rated review items when the aggregate count is missing. Apps Script `getReviewsJSON()` now treats a bare Google rating as at least one rating when no Google rating count or review item count exists.

**Files modified:** `src/reviews.js`, `scripts/apps-script/Code.gs`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-29 — Height animation removed from static forms

**Preference:** Height animation should not run on static-height forms. It interferes with add-place, edit-place, contact, wish-form, and similar form cards.

**Decision:** Keep `animateElementHeight()` for window-style overlays where the card naturally resizes, such as reviews and event/Eid-style windows. Static form cards should only use their normal open/close transform transitions.

**Implementation:** Removed height animation wrappers from suggest/edit opening-hours controls, suggest Eid fields, organizer chips, tag accordions, and custom cuisine insertion. Removed `height var(--t-spring)` from static form card transitions while preserving it for event/Eid/reviews windows.

**Files modified:** `src/places.js`, `src/styles/styles.css`, `docs/DESIGN_SYSTEM.md`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-30 — Reviews count + mobile sheet polish

**User feedback:** Google review totals were appearing capped at the small review sample returned by Google, e.g. Suomen Islamilainen Yhdyskunta showed only the five Google text reviews plus one community review instead of the full Google Maps rating count. The review summary also needed to follow the Google-style distribution/average layout while retaining Google vs Community source chips, and the phone review overlay needed the same bottom-sheet slide behavior as other windows.

**Fix:**
- Apps Script now carries `user_ratings_total` through New!T into Reviews!J as `googleRatingCount`, including approval-time copy into the generated place ID row.
- Google review import still stores review rating/text/author/time only and ignores photo/profile-image fields.
- Review summary changed to distribution bars on the left and a large average/stars/count block on the right, with source chips showing Google and Community counts.
- Static stars now support partial fill for decimal ratings.
- Phone review overlay now keeps its DOM long enough for the close animation, uses the shared `.suggest-head`/`.sheet-x` header and mobile drag handle, and matches mobile form typography more closely.
- Cache version bumped to `20260530-1`.

**Important API constraint:** Google Places officially returns only up to five review text objects; the app can display the full Google rating count via `user_ratings_total`, but not every Google review text unless Google exposes/permits that source for the place.

**Files modified:** `scripts/apps-script/Code.gs`, `src/reviews.js`, `src/styles/styles.css`, `index.html`, `sw.js`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-30 — Reviews rating block compact action polish

**User feedback:** The ratings summary needed tighter alignment, the large "Write a review" CTA should only appear when there are no reviews, places with existing reviews should use a small green plus button beside close like the Places window, and the "X Text Reviews" label should be removed.

**Fix:**
- Existing-review state now shows an icon-only `.btn-roundel-accent` plus button in the review header beside the close button.
- Zero-review state keeps the large text-only "Write a review" CTA in the body.
- Removed the text-review count header from the list.
- Tightened the summary grid, spacing, distribution row heights, source chip spacing, and review-card padding for a more compact aligned rating block.
- Cache version bumped to `20260530-2`.

**Files modified:** `src/reviews.js`, `src/styles/styles.css`, `index.html`, `sw.js`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-30 - Reviews text, rating sample, and form hide polish

**User feedback:** The full Google count was now visible, but visible text reviews and per-review ratings needed to reflect the stored Google sample instead of looking like every item was 5 stars. The rating summary also needed a true two-column row with centered right-side metrics, and the verification/write-review panel needed its own hide button.

**Fix:**
- Review cards now extract Google/community text defensively from string, localized object, original, translated, and comment-shaped fields.
- Review cards now normalize and display each item's own numeric rating beside filled stars, including defensive support for named star-rating payloads.
- Apps Script Google review import and parser now use the same defensive text/rating normalization, while still ignoring review photos/profile images.
- Rating summary stays compact in one row: distribution bars on the left, average/stars/total/source chips centered vertically on the right.
- Verification and write-review panels now include a section-only hide button that restores the review summary without closing the reviews overlay.
- Cache version bumped to `20260530-3`.

**Constraint:** Google Places exposes `user_ratings_total` for the full count, but the stored text/rating list is still limited to the small review sample returned by Google unless another permitted data source is added.

**Files modified:** `scripts/apps-script/Code.gs`, `src/reviews.js`, `src/styles/styles.css`, `index.html`, `sw.js`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-30 - Reviews visual fill and collapse polish

**User feedback:** Decimal stars should look like the star itself is partially filled, not like a smaller orange star inside a grey outline. The rating bars column and right-side average/details column should occupy the same visual height. Hiding the verification/write section should animate instead of disappearing instantly.

**Fix:**
- Static star fill SVGs now keep their full intrinsic width and are clipped by the fill container, producing a real partial-star fill.
- Rating summary grid items now stretch to one row height; bars distribute across the left column while average/details stay vertically centered on the right.
- Verification/write sections now fade and slide before the review summary height animation restores the compact state.
- Cache version bumped to `20260530-4`.

**Files modified:** `src/reviews.js`, `src/styles/styles.css`, `index.html`, `sw.js`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-30 - Reviews panel collapse and list rows

**User feedback:** Verification expand/collapse should feel like the app's existing smooth extend-collapse interactions, not a fade/slide. Individual reviews should read as a list like Events and Eid windows, not as separate cards.

**Fix:**
- Review verification/write UI now mounts inside a `grid-template-rows` collapse wrapper, matching the Places/event drawer pattern.
- Removed the fade/slide close treatment from review forms; hiding the section now collapses the panel from `1fr` to `0fr` before restoring the summary.
- Review items now use flat list rows with separators, compact metadata, and a slim leading rail instead of rounded card-like rows.
- Cache version bumped to `20260530-5`.

**Files modified:** `src/reviews.js`, `src/styles/styles.css`, `index.html`, `sw.js`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-30 - Reviews ordering and simple height animation

**User feedback:** Review rows should not have a left vertical rail; use the same flat list feeling as Events/Eid. Community reviews must appear before Google reviews. The rating bars and rating details need an explicitly equal height. Verification expansion should be a smooth simple animation, not layered motion.

**Fix:**
- Removed the review-row leading rail/avatar entirely; reviews are now simple flat rows with separators.
- Text reviews are sorted with community reviews first, then Google reviews, preserving newest-first order within each source.
- Rating summary now defines a shared `--rv-summary-h` and applies it to both the bars column and the average/details column.
- Simplified verify/write motion to one inner `grid-template-rows` animation using `--t-med`, with no outer height animation layered on top.
- Cache version bumped to `20260530-6`.

**Files modified:** `src/reviews.js`, `src/styles/styles.css`, `index.html`, `sw.js`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-30 - Place rating chip toned down

**User feedback:** The small rating chip on place cards did not match the app design language and the amber/orange treatment was too harsh.

**Fix:**
- Restyled `.pl-rating-chip` as a neutral metadata pill with `--surface`, `--border-light`, and subdued text colors.
- Kept only the star as a restrained review accent using a muted `color-mix`, instead of filling the entire chip with amber.
- Cache version bumped to `20260530-7`.

**Files modified:** `src/styles/styles.css`, `index.html`, `sw.js`, `docs/PREFERENCE_LOG.md`.

---

### 2026-05-31 - Mobile place popup viewport centering

**User feedback:** Place popup cards have grown with ratings, events, hours, notes, and actions, and on phones they can overflow when the map centers the marker first and then opens the popup above it.

**Fix:**
- Phone place popups now open invisibly, measure the rendered card, compute the map center that places the card itself in the viewport center, move once, then reveal the popup.
- Removed the old marker-centered mobile padding path for place popups.
- Phone popup cards now have a viewport-capped height with `.pp-inner` scrolling internally so richer cards stay usable on small screens.
- The curvy popup tip remains outside the scroll-clipped card body by keeping MapLibre popup content overflow visible.
- Follow-up: corrected the zoomed-out animation path to move toward the selected pin with MapLibre's camera `offset`, avoiding the visible off-direction flight followed by a final snap.
- Follow-up: replaced the offset `easeTo()` with a short frame-by-frame camera tween that keeps the popup center on a straight screen-space path while zooming, making the zoomed-out open motion calmer and more linear.
- Follow-up: applied the same measured popup-card centering to desktop and shortened/optimized the tween to one cheap camera jump per frame for a snappier feel.
- Follow-up: user rejected any janky/laggy movement. Reverted popup camera motion to MapLibre's native `easeTo()` with a precomputed measured final center, prioritizing smooth renderer-driven movement over custom per-frame control.
- Follow-up: fixed the too-zoomed-out curved path by splitting only large zoom changes into native phases: a short same-zoom pan to the future popup anchor, then a zoom around the selected place pin.
- Follow-up: user rejected the visible two-step pan/zoom rhythm. Reverted to one continuous native `easeTo()` using a linear easing curve and measured final center, prioritizing one-go motion over split-phase path control.
- Follow-up: to reduce remaining curve while preserving one-go native motion, capped per-open zoom delta so very zoomed-out starts no longer attempt a large pan+zoom in one transition.
- Follow-up: removed adaptive per-open zoom cap after user reported inconsistent popup-open zoom levels. Popup-open camera now always targets the same configured zoom level (`PLACE_POPUP_MIN_ZOOM`) again.

**Pattern:** For rich mobile map popups, center the popup card after measurement rather than centering the underlying marker coordinate.

**Files modified:** `src/places.js`, `src/styles/styles.css`, `tests/13-places-popup-regression.spec.js`, `docs/DESIGN_SYSTEM.md`, `docs/PREFERENCE_LOG.md`.
