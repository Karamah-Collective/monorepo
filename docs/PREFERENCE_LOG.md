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
- Buttons must be EITHER icon-only OR text-only. Never combine an icon with text in the same button. Structural indicators (chevrons for expand/collapse, thumbs-up with vote counts), mode segment icons, inline loading spinners + status text, and brand-mandated third-party buttons (e.g. Google's "G" logo + "Continue with Google" label, per Google's own branding guidelines) are exempt.
- Third-party brand buttons (Google Sign-in, etc.) should follow the vendor's own official button design over this app's palette — trust/recognizability of a well-known brand mark outweighs internal color consistency for that one component. Use dedicated brand-color tokens (not derived from `--accent`), same convention as HSL transit operator colors.
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
- **Do not run Playwright or any automated test suite unless the user explicitly asks for it.** (2026-08-02, standing rule, supersedes the softer wording this line used to have.) User's own words: "do not run any playwrite test at all unless i ask for it — do not test anything, just code, ill do the testing manually." A `node --check` syntax sanity pass is fine; a browser/Playwright verification pass is not, even for behavior changes (animation, layout) that would normally warrant one. The user tests every change themselves in a real browser and finds automated verification passes redundant and slow during iteration.
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

- **2026-08-02 (later same day) — Three Menu-sheet visual polish fixes, root-caused live via Playwright rather than guessed from screenshot descriptions.** (1) `.menu-row`'s hover pill was edge-to-edge with the sheet (no horizontal margin) — fine in the narrow `#sort-wrap` dropdown it shares CSS with, but read as a stray floating box against the much wider Menu sheet. Fixed by insetting `.menu-row` only (margin + reduced padding, `.sort-opt`'s own look untouched) so the pill has the same breathing room this app's other pill components get. (2) `.btn-google` inherited the shared `.rv-action-btn` 48px/16px CTA sizing, reading as oversized next to the small "Use an email link instead" text link beside it — shrunk to `--h-input` (44px)/`--txt-base` (14px), matching Google's own 14px label spec while staying at this app's documented mobile touch-target minimum (not Google's real-world ~40px, which would dip below it). (3) `#style-panel`'s 4 style thumbnails bunched left (default `flex-start`), leaving dead space before the Menu sheet's right edge — fixed with `justify-content: space-between`, confirmed safe since `#style-panel` only renders inside the Menu sheet now (Phase 2 already removed its old standalone popover).
- **2026-08-02 (later same day) — Reduce-motion becomes a single JS-computed mechanism, not two competing ones.** Added an explicit in-app "Reduce motion" toggle (Menu → Preferences) on top of the pre-existing bare `@media (prefers-reduced-motion: reduce)` CSS block. Rather than layering a second mechanism on top of the first, replaced the raw media query with a `html.reduce-motion` class applied by `utils.js`'s `isReduceMotionActive()`/`setReduceMotionOverride()` — computed from an explicit user override if set, else the live OS `prefers-reduced-motion` value (kept in sync via a `matchMedia` change listener). Both `animateElementHeight()` and `reviews.js`'s panel-close animation were switched from querying the raw media feature directly to this same helper, so every motion check in the codebase — CSS and JS — now reads from one source of truth. Mirrors the `html.dark-mode`/`body.dark-mode` class-toggling pattern exactly (early-applied IIFE before first paint, same as `map-controls.js`'s `restoreSavedTheme()`).
- **2026-08-02 (later same day) — Prayer calculation method/madhab added as real Preferences controls, method list sourced by live API call, not guessed.** Fetched `https://api.aladhan.com/v1/methods` directly to get the authoritative method-id → label list (23 methods, excluding `99`/CUSTOM which needs extra angle params this app has no UI for) rather than trusting memory or the (non-numeric) branding docs page. Defaults (method 3 = Muslim World League, school 0 = Shafi/standard) exactly match the previous hardcoded call, so existing users see zero behavior change until they actively open Preferences and pick something else. Changing either dropdown calls a new `prayer.js` export, `refreshPrayerTimes()`, which re-fetches with the last-known coordinates (no new geolocation prompt) and updates every dependent bit of UI, including the expanded prayer-times list if it's already open.
- **2026-08-02 (later same day) — First toggle-switch component in the codebase (`.pref-switch`).** Confirmed via grep that no on/off switch existed anywhere before "Reduce motion" needed one. Built as a `<button role="switch" aria-checked>` rather than a native checkbox, matching this app's existing button-driven state-toggle convention (`.btn-chip.active`, `.sort-opt.active`) instead of introducing a native form control needing its own separate styling system. This is now the reference to reuse for any future binary preference, not a one-off.
- **2026-08-02 (later same day) — Correction to the Google-button fix above: `--h-input` doesn't exist; height was never the real problem.** An automated Playwright bounding-box assertion (not visual review) caught that `.btn-google`'s `height: var(--h-input)` silently resolved to `auto` (~20px, just the label's line-height) because `--h-input` was never actually defined in `design-tokens.css` — `docs/DESIGN_SYSTEM.md`'s own Component Sizing table documented a token that doesn't exist in the stylesheet. Also found while investigating: `--h-submit` is actually `44px` in this codebase, not the documented `48px` — meaning the *original* Google button (before any of this session's changes) was already 44px all along. **Fix:** removed the bogus height override entirely; `.btn-google` now only overrides `font-size` (14px, Google's real spec) and inherits height unchanged from `.rv-action-btn`'s real `--h-submit` (44px). Corrected `docs/DESIGN_SYSTEM.md`'s Component Sizing table to match the actual CSS (`--h-submit: 44px`, `--h-field: 46px`, added the previously-undocumented `--h-search: 48px`) rather than leaving the stale values for the next person to trip over. **Pattern:** a uniformly-shrunk button whose content is still centered doesn't obviously look "broken" in a screenshot — this is exactly the kind of bug only a numeric assertion catches, not eyeballing a render.
- **2026-08-02 (later same day) — Mid-task course correction from you, folded into the same pass: Map View restructured into Theme/Overlay columns, Support rows merged side by side, Account sign-in condensed into one row, plus two more Preferences additions.** You reviewed the in-progress work and asked for four changes on top of the original brief, all addressed before wrapping up:
  1. **Map View → two labeled column-groups in one row**, replacing the single flat row of 4 unlabeled thumbnails (whose stray divider between the 2nd/3rd item was presumably an earlier, unfinished attempt at the same grouping instinct). Labels: **"Theme"** (Light/Dark/Auto — reusing this app's own existing vocabulary, `setTheme()`/`currentTheme`) and **"Overlay"** (Satellite/Heatmap — both are literally rendered as an overlay atop the base map, not a base theme swap). Considered "Layer"/"Style" for the second label; "Overlay" read least ambiguous paired next to "Theme". Shrunk thumbnails 52px→44px and tightened `.style-opt` padding so both groups reliably fit in one row without wrapping even at this app's narrowest documented breakpoint (380px) — verified via `element.scrollWidth` checks at 380px/412px, not just eyeballing a screenshot. The old `<399px` thumbnail-shrink media query became dead code (identical to the new default) and was deleted.
  2. **Support: Contact us / Wishlist now sit side by side** in a new `.menu-row-pair` instead of stacked. Carried the edge-inset hover-pill fix over intact: the pair container supplies the same `var(--sp-3)` outer inset the standalone row used to get from its own margin, and `.menu-row` inside the pair switches to `flex:1; width:auto; margin:0` rather than losing the fix when the layout changed.
  3. **Account: Google sign-in + email option now share one row.** Google's button keeps its full logo + "Continue with Google" label at its real branding-minimum size (`flex:1` inside a new `.menu-account-signin-row`) — never shrunk below what Google's guidelines require. The email option changed from a full-width-adjacent text link to an icon-only `.btn-roundel-subtle` button (reusing the exact envelope icon already used for Support's "Contact us" row) — still a real, clearly-actionable button, not decorative text, satisfying your explicit "still clearly a real actionable control" requirement.
  4. **Two more Preferences additions, per your "add 1-2 more, if possible" ask:** (a) **"Auto" theme** — confirmed via grep this app had zero existing `prefers-color-scheme` handling before adding it, so it's purely additive. Lives as a third Theme option (not a Preferences-section row, since it's a Theme choice) — `map-controls.js` gained a `themeMode` ("light"/"dark"/"auto") distinct from the pre-existing resolved `currentTheme` ("light"/"dark"), following the OS media query live via a `change` listener for as long as "auto" is selected — the exact same "explicit override on top of an OS-level media feature" shape as the reduce-motion toggle, applied to a second OS preference in the same session. The "Auto" swatch is a fixed light/dark diagonal split (not a real map style to preview), deliberately theme-independent like the Google logo colors. (b) **12-hour prayer times** — a second `.pref-switch` instance; off (default) keeps the existing 24-hour `en-GB` formatting exactly as before, on switches to 12-hour `en-US`/`hour12` formatting for the Ramadan labels and expanded prayer list. Purely a display-format change (no re-fetch) — `prayer.js` gained a lightweight `refreshPrayerTimeDisplay()` alongside the network-hitting `refreshPrayerTimes()`, both funnelling through one shared `_applyPrayerTimesToUI()` renderer.
- **2026-08-02 (later same day, refinement) — Account sign-in row: equal-weight peer buttons, not a primary+icon pair.** You saw a mockup of the "Google button takes most of the row, small icon-only circle beside it" treatment from the prior message and rejected it outright: *"these buttons should be similar size and looking as well, one option is not better than the other."* Reworked `.menu-account-signin-row` so both buttons are `.rv-action-btn` with `flex: 1` (an even ~50/50 split at the same 44px height) — Google keeps its exact required label ("Continue with Google" + full logo, per their branding guidelines) and the email option became a real text-labeled `.btn-secondary` button ("Use email") instead of a bare icon, with a small `.menu-account-signin-row .btn-secondary` override matching its font-size/weight to `.btn-google`'s (14px/medium) so neither button carries more visual weight than the other. **Trade-off surfaced and accepted:** at the narrowest tested width (380px) "Continue with Google" wraps to two lines inside its half of the row — Google's guidelines mandate the exact label text (no abbreviating to just "Google"), so given a hard 50/50 split, a two-line wrap is the correct trade-off over either violating the required text or letting Google's button dominate the row again. Verified via screenshots at 380px/412px/desktop that the wrap doesn't clip or look broken (pill stays 44px tall, text stays vertically centered). Test tightened from "same row" to explicitly assert near-equal width (`< 30px` difference) and equal height, not just adjacency, since the visual-weight-parity requirement is the actual thing being tested here.
- **2026-08-02 (later same day, second refinement) — same-size buttons still had mismatched *visual weight*: border/text contrast, not just box dimensions.** After the equal-width fix above, you flagged a remaining, more subtle mismatch: "Continue with Google" had a solid, clearly-visible dark outline, while "Use email" (reusing `.btn-secondary`'s *default* styling) had a faint, low-contrast light-gray border — same size, but one still read as more "real" than the other. **Root cause, found by actually comparing the tokens each button uses, not by re-guessing:** `.btn-secondary`'s default border/text (`--border` `#e2e2e2` / `--text-2` `#525252`) is *deliberately* subtle everywhere else it's used in this app (a genuinely de-emphasized secondary action, e.g. popup Share/Edit buttons) — reusing that default as-is for a button meant to be a full *peer* to `.btn-google` (solid `#747775`-ish border, near-black `#1f1f1f` text) was simply the wrong visual target, not a bug in the template itself. **Fix:** added `.menu-account-signin-row .btn-secondary { border-color: var(--text-2); color: var(--text) }` (this app's own higher-contrast neutral tokens, not a literal copy of Google's specific brand gray — copying a competitor's exact brand color onto a non-Google element would be its own kind of wrong) plus a hover state darkening to `--text`. Both tokens already have correct dark-mode overrides (`--text-2`→`#b8b8b8`, `--text`→`#f0f0f0`), so no separate dark-mode rule was needed. **Also updated the label** from "Use email" to "Continue with email" — explicitly mirroring Google's own phrasing (you'd offered "feel free to update the text/design") so the two buttons read as parallel, symmetric options rather than one having branded phrasing and the other a generic action word. Verified via screenshots (light + dark) that both buttons now show matching border weight and text darkness.
- **2026-08-02 (later same day, third micro-fix) — "Continue with email" was overflowing its half of the row.** Added `overflow-wrap: break-word` to `.menu-account-signin-row > *` so long labels wrap safely instead of overflowing, regardless of exact font metrics. CSS-only tweak; quick visual check, no full test pass re-run (per your steer to keep these last few cosmetic nudges lightweight).
- **2026-08-02 — `#menu-google-signin` restyled to Google's official light/dark "Sign in with Google" button, not the app's own accent-green pill.** New `.btn-google` template (`design-tokens.css`) with dedicated brand tokens (`--google-btn-bg/border/text`, `--google-g-blue/green/yellow/red`) and a light/dark override pair matching Google's own published button spec exactly (light: `#ffffff`/`#747775`/`#1f1f1f`; dark: `#131314`/`#8e918f`/`#e3e3e3`). The "G" logomark is inline SVG (official 4-path/4-color mark), never recolored between themes. Chose the standard white/neutral button over "keep dark-green pill + inline G" — recognizability/trust of the exact well-known Google affordance was judged more important than internal palette consistency for this one third-party auth button. `src/reviews.js`'s identical-looking Google sign-in button was deliberately left as `.rv-action-btn.btn-primary` (untouched) per the task's explicit scope — flagged as a follow-up to bring into visual consistency with the Menu's button later.
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

- **2026-07-18 — Events decoupled from mosques: independent location + organizer.** An event's location can be an existing directory place (any type) OR a custom location (rented hall, outdoor spot). The organizer is a separate, independent field — free text, optionally linked to an existing directory place. Neither requires the other. Schema: `Events`/`EventEdit` sheets gained `location_name, location_address, lat, lng, organizer_name, organizer_place_id, location_gmaps_link`; `place_id` is now optional.
- **2026-07-18 — Location/Organizer UX: single search combobox, not button toggle + selects.** Superseded the initial button-toggle implementation (too many steps per user feedback). Both Location and Organizer are now one type-ahead search input over `placesData` with a trailing "use custom" option always visible — even when a matching place exists, so the user isn't forced onto an unwanted match. Reused the existing `.dir-suggest` directions-autocomplete template rather than inventing new dropdown CSS. Choosing "use custom location" reveals only a Google Maps Link (required) + optional name override — resolved server-side via the same `resolveUrl`/`parseMapsUrl` pipeline as place enrichment, so no manual address typing or pin-dropping.
- **2026-07-18 — Event location search: halal directory first, then OSM/Digitransit, same as the main search bar.** Exported `searchDirLocations()` from `directions.js` (was private `_searchDirLocations`, backing the directions from/to autocomplete) and reused it for the event form's location combo instead of a `placesData`-only filter. Picking a non-directory OSM/Digitransit result stores its name+coordinates directly (no Google Maps link needed — the result already gives you both) — the gmaps-link "custom location" path is now the last resort for locations found nowhere else. Organizer intentionally stays `placesData`-only (an organizer is a named entity, not a geocodable place).
- **2026-07-18 — Events pill is always visible, even at zero events.** Previously hidden entirely until at least one event existed, so there was no way to discover/submit the first one. Now always shown; only the count badge hides when the upcoming-event count is 0.
- **2026-07-18 — Maps enrichment: decode `ftid=0xHEX:0xHEX` into a place_id.** Root cause of "phone links don't enrich but PC links do": mobile Google Maps share-sheet short links (`maps.app.goo.gl`) resolve to `maps.google.com/?q=Name,Address&ftid=0xHEX:0xHEX` — no `ChIJ...` place_id and no `?cid=`. `parseMapsUrl()` in `Code.gs` now extracts the second `ftid` hex segment and converts it to decimal via `BigInt` (exceeds `Number.MAX_SAFE_INTEGER`) into `cid:<decimal>`, so `getPlaceDetails()` gets the full Places API payload (hours/rating/reviews/website) instead of falling back to bare geocoding.
- **2026-08-02 — Reviews-sheet row matching: normalize every comparison, not just the newest one.** Root cause of "review delete does nothing, front and back": `getMyReviews()` (Phase 7) was the only one of four Reviews-row-matching functions in `Code.gs` that called `.toString()` on the raw `getValues()` cell before comparing it — `handleReviewCheck`, `handleReviewSubmit`'s dedup, and `handleReviewDelete` all used a bare strict `===` directly against raw Sheets output. That asymmetry meant a review could be found and listed by the lenient function while the stricter, unnormalized delete match silently failed to recognize "the same" row. Fixed by routing every placeId/emailHash/status comparison in the Reviews sheet (and the Places sheet's own `placeExists` check in `handleReviewSubmit`) through one new `_normReviewCell()` helper, closing the whole class rather than one call site.
- **2026-08-02 — Cross-device sync gains real deletion propagation, with an explicitly acknowledged residual gap.** Phase 8's original union-merge ("never deletes on either side") was correct-as-designed but structurally couldn't propagate a removal from one signed-in device to another. Fixed with a "known synced" baseline (`hf_sync_known_v1` in localStorage) so the merge can now tell "genuinely new local item" apart from "previously-synced item removed elsewhere" — push-new happens first, then remove-if-known-but-missing. Verified (and corrected) the original hypothesis that the merge only ran once at initial sign-in — it doesn't; Firebase's `onAuthStateChanged` already re-fires `EVT.AUTH_CHANGED` on every page load that restores a signed-in session, and the listener registration order (already fixed for the Phase 9.1 magic-link race) means that already works. Added an explicit `getCachedAccount()`-gated reconcile call anyway, as a deliberate belt-and-suspenders addition rather than the primary fix. **Residual edge case, not solved:** a local removal made fully offline (whose own `_backgroundSync` unsave call never reaches the server, no retry/queue) can be silently resurrected by that same device's own next reconcile-from-server pull, since nothing distinguishes "the server never learned about this removal" from "another device added this."
- **2026-08-02 — Real Yes/No confirm dialog replaces press-twice-to-confirm.** User explicitly asked for a real confirmation instead of the icon-morph press-twice pattern, for both review delete and account sign-out. Built one reusable `showConfirmDialog()` (`src/utils.js`) + `.confirm-overlay`/`.confirm-card` template, used for both actions rather than two bespoke implementations. Press-twice is now explicitly marked obsolete in `docs/DESIGN_SYSTEM.md` (not silently left as a stale "reference implementation" pointer).
- **2026-08-02 — `_insertReviewPanel()`'s height lock on `.rv-overlay-card` must always be released, not just set.** Root cause of "expanding the sign-in prompt's email step doesn't grow the card, content gets clipped": `_insertReviewPanel()` (called whenever the write-review/sign-in panel is inserted) set `card.style.height` to a fixed px value directly — bypassing `animateElementHeight()`'s contract entirely — and had no code path to ever clear it while the panel stayed open. Every subsequent `_animateReviewCardHeight()` call (email-step toggle, error reveal, "check your email" message, invalid-token retry) then FLIPped from that stale, pre-panel-insertion height as its baseline instead of the card's true current size, so growth kept getting measured against — and re-capped at — a height from before the panel even existed. This exact symptom was independently observed and logged (unfixed) in `docs/ACCOUNTS_AND_REDESIGN_PLAN.md`'s Phase 9.1 entry months earlier ("zero reviews… star row clipped… ~106px scroll pane"), confirming it as a real, reproducible defect rather than a one-off. Fixed by releasing the lock (`card.style.removeProperty("height")`) once `.rv-write-panel`'s own open transition ends (`transitionend` on `grid-template-rows`, plus a timeout fallback for reduced-motion/interrupted cases) — mirroring the release `_restoreReviewSummary()` already does on close. `src/menu.js`'s `.menu-account-panel`/`_animateMenuPanelHeight()` has no equivalent raw pin and was confirmed unaffected by the same class of bug.

## Patterns to Avoid

> Things that were tried and rejected, or that the user has explicitly said "don't do."

<!-- Append new entries below this line -->

- Don't inline-expand reviews (or any variable-length/potentially-long content) by default in the place-detail sheet or any primary info card. Reviews must stay a compact summary chip that taps through to a separate overlay (`#reviews-overlay`) — never full review text inline, since that pushes fixed important facts (tags, hours, notes) out of immediate view. (2026-07-31)

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
- Full-bleed hover fills (background color spanning a row's entire width, no horizontal margin) work fine inside a narrow floating dropdown/popover where the rounded corners double as the container's own corners (`.sort-opt` inside `#sort-wrap`) — but the same fill reads as a disconnected floating box inside a wide bottom sheet. Rows inside wide sheets/panels need an explicit inset margin so their hover pill has breathing room from the sheet's own edges, even when reusing an existing hover-fill template via the Component Alias Pattern.
- When a shared CTA sizing class (`.rv-action-btn`, 48px/16px) is applied to a third-party brand button with its own official spec (Google's 14px label), don't assume the shared size is automatically right for that one button — check the vendor's actual spec and override just that button's height/font-size if the shared size reads oversized next to a smaller sibling control, while staying at or above this app's own documented touch-target minimum (`--h-input`, 44px).
- Root-cause visual bugs live via Playwright (`getBoundingClientRect()`, `getComputedStyle()`, hover/hover-simulated screenshots) before writing a CSS fix, even when a screenshot description sounds unambiguous — this session's Support-row/Google-button/style-panel fixes were all confirmed against real computed geometry, not just the text description of the bug.
- Reduce-motion (and any future "override an OS-level media-query preference") should be a single JS-computed class (`html.<feature>`) fed by `localStorage` override ?? live `matchMedia(...).matches`, with both CSS and any JS-level checks reading from the same class/helper — never a bare `@media` block left running in parallel with a new in-app toggle.
- Any code that sets an inline `style.height` (or similar) on an element outside of `animateElementHeight()`'s own contract (e.g. a one-off "freeze during this DOM mutation" pin) must have an explicit, guaranteed release path — a `transitionend` listener plus a `setTimeout` fallback, same pattern `animateElementHeight()`'s own `cleanup()` uses — not just a release that happens to occur as a side effect of some later, unrelated call. An orphaned pin silently caps every future height-animation on that element to a stale baseline.

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

### 2026-06-09 — Pin-click pan-only, toast stacking, directions back button

**a. Pin click: remove zoom, pan-only with smoother motion:**
- Removed the forced zoom-to-`PLACE_POPUP_MIN_ZOOM` (15) behaviour on pin/card click. Camera now pans only — never changes the user's current zoom level.
- `PLACE_POPUP_MIN_ZOOM` constant removed entirely (no longer referenced).
- `PLACE_POPUP_MOVE_MS` increased 380 → 460 ms for a calmer feel.
- `_easePlacePopupCamera` changed from linear (`t`) to ease-out cubic (`1 - (1-t)³`) — quick start, smooth settle.
- Added `PLACE_POPUP_CENTER_Y_OFFSET = -55` so the popup centre target sits 55px above the geometric viewport centre, giving the pan a slightly farther, more purposeful motion and keeping the place comfortably above any bottom UI chrome.
- `_centerPopupCardInViewport`: removed `map.getZoom() < PLACE_POPUP_MIN_ZOOM` from the `shouldMove` condition — panning now triggers on off-centre delta only.
- `_animatePopupCameraToCenter`: uses `map.getZoom()` (current zoom) for Mercator projection math; `zoom:` key removed from `map.easeTo()`.

**b. Toast notification stacking (list view):**
- `showToast()` in `utils.js` no longer removes an existing `#share-toast` — multiple concurrent notifications are now supported.
- Added `_getToastStack()` helper that lazily creates a `#toast-stack` container (appended to `<body>` once).
- Each toast is appended to the stack rather than `body`, so they lay out vertically via flexbox.
- Exit animation: toast first fades out (`share-toast-show` removed), then gets `share-toast-collapsing` which collapses `max-height`, padding, and margin — the entries above slide down smoothly as the gap closes.
- `showLoadingToast` and `showOfflineBanner` are unaffected — they remain standalone fixed elements outside the stack.
- CSS in `styles.css`: `#toast-stack` is `position: fixed; bottom: calc(--tab-h + --safe-b + 20px); left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px`. Individual `#toast-stack .share-toast` override `position: relative`, use `translateY(10px)` as enter state.

**c. Directions panel back button (from places list):**
- When the user taps the directions button on a places-list card (`.pl-dir-btn` inside `#places-list`), the directions panel `#dir-close` button converts to a back arrow (← icon, accent colour) instead of ×.
- On back-tap: `closeDirPanel()` runs (resets the button), then `openPlacesSheet()` is called immediately, and `requestAnimationFrame` restores the exact `#places-scroll` scrollTop the user was at.
- State: `_fromPlacesContext = { scrollTop }` in `directions.js`, set by `setFromPlacesContext(scrollTop)` (new export). Cleared in `closeDirPanel()` via `_resetDirCloseButton()` — so any other close path (scrim, swipe, nav start) silently resets without opening places.
- The popup's direction button (`.pp-dir-btn` inside the map popup) does NOT set this context — back button only applies to the places-list flow.
- New CSS: `#dir-close.dir-close--back { color: var(--accent) }` for visual distinction.

**Decisions logged:**
- 2026-06-09 — Pin-click camera: zoom removed, pan-only. Ease-out cubic + -55px Y offset replaces linear motion to min-zoom.
- 2026-06-09 — Toast stacking: `#toast-stack` flex container, collapse transition for exit. `showLoadingToast`/`showOfflineBanner` remain standalone.
- 2026-06-09 — Directions back button: only from places-list (`.pl-dir-btn`), not from map popup. Scroll position restored via `requestAnimationFrame`.

**Files modified:** `src/places.js`, `src/directions.js`, `src/utils.js`, `src/styles/styles.css`, `docs/PREFERENCE_LOG.md`.

### 2026-06-10 — Toast stacking: smooth slot animation via CSS Grid

**Root cause of wobble:** The previous toast stacking used `max-height: 0 → 100px` to open space for a new toast. Because the actual toast content is only ~50px tall, the layout shift happened in the first half of the transition (when `max-height` reached real content height), then appeared to stall. Existing toasts above jumped up suddenly rather than gliding.

**Fix — CSS Grid `grid-template-rows: 0fr → 1fr` technique:**
- Each toast is now wrapped in a `.toast-slot` div (a grid container with `display: grid; grid-template-rows: 0fr`).
- The `.share-toast` element sits inside as the grid child with `min-height: 0; overflow: hidden`.
- `grid-template-rows: 0fr → 1fr` interpolates proportionally to the real content height — no wasted animation time, no jump.
- The slot handles `grid-template-rows` + `margin-bottom` (layout animation). The inner `.share-toast` handles only `opacity` + `transform: translateY` (visual animation).
- Timing: both animate simultaneously on enter. On exit, opacity fades first (0.22s), then the slot closes (0.28s).

**All 7 toast/banner functions updated** in `src/utils.js`:
- `showLoadingToast` / `hideLoadingToast` — slot wraps the toast; `hideLoadingToast` finds slot via `t.parentElement`.
- `showToast` — slot created per toast, removed after 2.4s + 0.3s collapse.
- `showEarlyDevNotice` / `showGeoNotice` — slot in closure for dismiss handler.
- `showOfflineBanner` / `hideOfflineBanner` — added `_offlineBannerSlot` module-level var alongside existing `_offlineBannerEl`.

**CSS changes in `src/styles/styles.css`:**
- Removed `max-height` and `margin-bottom` animations from `#toast-stack .share-toast`.
- Removed the `share-toast-collapsing` rule for the stack context (no longer needed — slot handles collapse).
- Added `.toast-slot`, `.toast-slot.toast-slot-show`, `.toast-slot.toast-slot-collapsing` rules.
- Updated `#toast-stack #geo-notice, #toast-stack #dev-notice` overrides to remove `max-height` / `margin-bottom` and add `min-height: 0`.

**Decision logged:** 2026-06-10 — Toast wobble fix: grid-template-rows slot wrapper replaces max-height collapse. Existing toasts glide up smoothly because the animation is proportional to actual content height.

**Follow-up fixes (same session):**

**a. Toast animation lag — replaced double-rAF with `void slot.offsetHeight`:**
- Root cause: double `requestAnimationFrame()` added ~33ms of delay before the transition started (2 frames at 60fps). The slot appeared in the DOM but the animation didn't begin, creating a perceptible lag.
- Fix: `void slot.offsetHeight` forces a synchronous layout reflow that commits `grid-template-rows: 0fr` to the browser in the current frame. The show class is added immediately after — animation begins on the very next paint (~16ms). Applied to all 5 toast/banner functions.

**b. "Finding location" toast skipped when GPS already denied:**
- Root cause: `showLoadingToast("Finding your location…")` was called unconditionally before `requestLocation()`, even when the geolocation permission was already "denied" in the browser.
- Fix: Added `_geoPermState` module-level var in `map-controls.js`. Initialized via `navigator.permissions.query({ name: "geolocation" })` on module load (resolves from browser cache in one microtask). A `"change"` listener keeps it updated if the user toggles permissions mid-session. The `showCurrentLocation()` function checks `_geoPermState === "denied"` before calling `showLoadingToast`, returning early with only the "Location is off" toast.

**Files modified:** `src/utils.js`, `src/map-controls.js`, `src/styles/styles.css`, `docs/PREFERENCE_LOG.md`.

### 2026-07-18 — Events decoupled from mosques + Maps enrichment fix

**a. Events are no longer mosque-only.** An event can happen at any existing directory place (mosque, restaurant, shop, etc.) or at a custom location — a rented hall, outdoor spot, or anywhere not already listed. Independently, an event's organizer may or may not be an existing directory place.

- **Schema (`scripts/apps-script/Code.gs`):** `EVENT_HEADERS`/`EVENT_EDIT_HEADERS` extended with `reject_reason, location_name, location_address, lat, lng, organizer_name, organizer_place_id`. `place_id` is now optional — populated for an existing-place venue, blank for a custom location (in which case `location_name`/`location_address`/`lat`/`lng` are used instead). Added `_upgradeSheetHeaders()` migration helper (same pattern as `ensureWishSheet`) so existing sheets gain the new columns without data loss.
- **Backend:** New `_resolveEventLocation(data)` geocodes a custom location's address server-side via the existing `forwardGeocode()` helper — no pin-drop UI needed for events. `getEventsJSON()` no longer requires `place_id`, only `title` + `approved` + some usable location. `applyEventEditToEvents()` now always overwrites the location+organizer field group together (even when blank) so switching between existing-place/custom-location modes during an edit doesn't leave stale data from the other mode.
- **Frontend (`index.html`, `src/places.js`):** Event form's "Mosque" select replaced with a location-mode toggle (`.ev-loc-chips`, aliased onto the `.ev-schedule-chips` template per the component-alias pattern) switching between "Existing Place" (any place type) and "Custom Location" (name + address text fields). Added an organizer select-or-type-text combo (`#ev-organizer-select` + `#ev-organizer-name`), mirroring the existing Eid-organizer combo pattern. Event cards/list/popup updated to show `ev.locationName` and "Organized by …" when present, and to fall back to the event's own `lat`/`lng` for nearby-distance sorting when there's no linked place.
- Documented the model in `.github/agents/the-architect.agent.md` under a new "Events Model" section so future work doesn't re-couple location and organizer.

**b. Maps link enrichment fix (mobile share links weren't enriching).** Root cause: mobile Google Maps share-sheet short links (`maps.app.goo.gl`) resolve to `maps.google.com/?q=Name,Address&ftid=0xHEX:0xHEX`, not the desktop `google.com/maps/place/...!1sChIJ...` form. `parseMapsUrl()` had no handling for `ftid=`, so it fell back to bare forward-geocoding — the event/place still got a name, address, and coordinates, but never the richer Places API data (hours, rating, reviews, website) that a proper place_id unlocks. Fixed by extracting the second `ftid` hex segment and converting it to decimal via `BigInt` (the value exceeds `Number.MAX_SAFE_INTEGER`) into `cid:<decimal>`, reusing the existing `?cid=` handling path.

**Follow-up (same session) — Location/Organizer UX reworked from button-toggle to search combobox.** The initial "Existing Place / Custom Location" button toggle + plain `<select>`s were too many steps (user feedback). Replaced both Location and Organizer with a single type-ahead search input over `placesData`, reusing the `.dir-suggest`/`.ds-icon`/`.ds-text`/`.ds-name`/`.ds-addr` templates already built for the directions search-autocomplete (`setupDirAutocomplete` in `directions.js`) instead of inventing new dropdown CSS. A trailing "use custom location" / `Use "<query>" as organizer` option is always present in the results list — even when a matching place exists — so the user is never forced onto an unwanted match.

- Choosing "use custom location" now reveals only a **Google Maps Link** (required) + an optional display-name override, instead of manual name/address text entry. The link is resolved server-side via the same `resolveUrl`/`parseMapsUrl` pipeline as place enrichment (including the `ftid=` fix above) — `location_gmaps_link` is a new Events/EventEdit column; `enrichPendingRows()`'s pattern was mirrored into a new `enrichPendingEventRows()` (`Code.gs`), called synchronously right after a custom-location event/edit is submitted, same as the existing `mapsLink → enrichPendingRows()` precedent for new places.
- **Action needed in the Apps Script project:** add a periodic time-driven trigger for `enrichPendingEventRows` (Triggers page) as a retry safety net, the same way `enrichPendingRows`/`enrichEidPendingRows` already have one — the synchronous call only covers the common case.
- `src/places.js`: added a generic `_setupEventPlaceCombo()` helper wiring both combos; removed the earlier `_setEventLocationMode`/`.ev-loc-chips` button-toggle code entirely (dead code, not left behind).

**Follow-up 2 (same session) — Combo layout bugs + enrichment still failing for a second phone link.**

- **Layout root cause:** `.sg-label` is `display:flex;flex-direction:column;` and relies on `align-items:stretch` (default) to make direct-child `input`s full width. The new combo inputs are nested one level deeper inside `.dir-field-wrap`, so they weren't direct children and fell back to the browser's intrinsic ~170px input width ("too short"). Fixed with `.dir-field-wrap > input { width:100%; box-sizing:border-box; }`. Separately, `#ev-loc-custom-fields` had two `.sg-label`s stacked with no internal gap (the outer `#event-form` `gap` only applies between its own direct children) — fixed by giving `#ev-loc-custom-fields` its own `display:flex;flex-direction:column;gap:var(--sp-4)`, matching the existing `#ev-recurring-fields` pattern.
- **Enrichment still failing on a second real link — root cause confirmed via `testResolveMapsLink()` execution log.** For this particular `maps.app.goo.gl` link, `UrlFetchApp` never got an `X-Final-Url` header (the redirect page embeds the destination as a JSON string inside a `<script>` blob instead of issuing a real HTTP 3xx), so `resolveUrl()` fell into its body-regex extraction fallback. That fallback had two bugs: (1) the match's negated character class `[^"'\s<>]` didn't exclude backslash, so it swallowed the trailing `\` of the JSON string's closing escaped quote; (2) unicode escapes like `=` (for `=`) inside the embedded string were never decoded — only `&` was special-cased as a truncation point, and even then it truncated rather than decoded. Net effect: `resolveUrl` returned a mangled string like `...?q=RAVINTOLA...Finland\` — `parseMapsUrl` correctly found nothing in it (no literal `q=`), and the empty name/address then made `forwardGeocode('')` throw `Invalid argument: location`. Fixed both bugs: the match regex now uses an alternation — `(?:[^"'\s<>\\]|\\u[0-9a-fA-F]{4})*` — that lets `\uXXXX` escapes through as valid content while still stopping at a lone backslash (the actual closing-quote boundary), and all `\uXXXX` sequences are decoded via `String.fromCharCode` before the existing percent-decode step. Verified against the exact malformed string from the log in standalone Node before applying.
- Added `testResolveMapsLink()` debug function (`Code.gs`, next to `forceEnrichAll()`) — hardcode a link, run it directly from the Apps Script editor's Run button (uses currently-saved code, no redeploy needed), reads `resolveUrl`/`parseMapsUrl`/`getPlaceDetails`/`forwardGeocode` output straight from `Logger.log`. This is what surfaced the actual root cause above — prefer this over guessing when a link fails again.

**Enrichment confirmed working by the user after this fix.**

**Follow-up 3 (same session) — Events pill always visible + location search reuses the halal+OSM search bar.**

- **a. Events pill always visible.** `renderEventsPill()` used to hide the whole pill when `eventsData` was empty. Removed that early return — the pill is now unconditionally shown (it's already called on every initial load regardless of event count); only its `.pill-count` badge hides when the upcoming count is 0.
- **b. Location combo now searches halal directory + OSM/Digitransit, matching the main search bar.** Previously the location combo only filtered `placesData` client-side, so anything not already in the halal directory forced the "use custom location" Google Maps Link path even for well-known OSM places (parks, malls, community halls). Exported `_searchDirLocations` from `directions.js` as `searchDirLocations` (dropped the underscore per the exported-symbol convention) and reused it directly — it already does exactly this: local halal places scored/prioritized first (`_searchLocalDirPlaces`), then Digitransit geocoding, then Nominatim (OSM) fallback, merged and deduped (`_mergeDirSearchResults`). Also added `id`/`placeType` to `_searchLocalDirPlaces`'s returned local items (previously only used by directions from/to, which doesn't need a place id) so the event combo can tell a directory match apart from a bare OSM result.
  - `_setupEventPlaceCombo()` gained an optional `searchPlaces` (async, debounced 300ms — same debounce as the directions autocomplete) — provided for Location, omitted for Organizer (which stays a synchronous `placesData`-only filter, since an organizer is a named entity, not a geocodable place).
  - Selecting a directory match → existing `place_id` flow, unchanged. Selecting a bare OSM/Digitransit result → new **"geocoded" location mode**: name + lat/lng come directly from the search result, no Google Maps link needed and no server-side resolution at all. Selecting "use a custom location" → unchanged Google Maps Link flow, now the true last resort for locations findable nowhere else.
  - `Code.gs`: `_resolveEventLocation()` now accepts `data.locationLat`/`data.locationLng` (used verbatim when present, geocoded path) ahead of the `locationGmapsLink` resolution path (custom path) — mutually exclusive, checked in that order. `functions/api/submit.js` validates `locationLat`/`locationLng` are finite numbers in valid ranges before forwarding, dropping them otherwise.
- **c. Google Sheet migration — no manual sheet editing needed.** `ensureEventSheet()`/`ensureEventEditSheet()`'s header migration (`_upgradeSheetHeaders()`) already runs automatically the next time anyone submits a test event or edit. Added `upgradeEventSheetsNow()` (next to `testResolveMapsLink()`) as a one-click way to run that migration immediately from the Apps Script editor, without waiting for a submission or touching the spreadsheet UI by hand.

**Files modified:** `scripts/apps-script/Code.gs`, `functions/api/submit.js`, `index.html`, `src/places.js`, `src/directions.js`, `src/styles/styles.css`, `src/styles/design-tokens.css`, `.github/agents/the-architect.agent.md`, `docs/PREFERENCE_LOG.md`.

**Follow-up 4 (same session) — Audited Code.gs for dead/leftover code.** User asked to remove unused placeholder/one-time/test functions. Did a real call-graph analysis (every function checked against `doGet`/`doPost`/`onSheetEdit`/every other function, not just a keyword guess) and found exactly 7 functions never called by any production path: `forceEnrichAll`, `backfillOpeningHours`, `deduplicateNewSheet`, `deduplicatePlacesSheet`, `refreshAllGoogleReviewsAndRatings` (pre-existing manual maintenance tools) plus `testResolveMapsLink`/`upgradeEventSheetsNow` (this session's new debug tools). **User chose to keep all 5 legacy tools as-is** — they're manual recovery/maintenance utilities, not truly dead code, so leaving them is a legitimate choice, not deferred cleanup.
- **Found and fixed a real leftover from testing:** `OTP_RATE_PER_EMAIL_HOUR`/`OTP_RATE_PER_IP_HOUR` (email verification rate limits, `Code.gs` ~line 3087) were loosened to 50/hour and 100/hour with `// TODO: restore to 3/10 after testing` comments that were never followed up on. Restored to the documented production values (3 and 10). This is the kind of thing to actively grep for (`TODO|FIXME|placeholder`) whenever asked to clean up leftover test code — it's a more meaningful signal than "function is never called," since a loosened security constant doesn't show up in a call-graph analysis at all.

### 2026-07-31 — Place detail redesigned as a bottom sheet (Phase 1 of accounts/redesign roadmap)

Part of a larger planned initiative (accounts, cross-device sync, decluttered menu — see `docs/ACCOUNTS_AND_REDESIGN_PLAN.md`). This session shipped the first, purely-frontend phase: replacing the floating MapLibre popup used for directory place details with a bottom sheet, reusing the app's existing `.sheet` + `initSheetDrag` structural pattern (same one driving `#places-sheet`/`#dir-panel`) instead of a third bespoke popup-positioning system.

- **Root motivation:** the floating popup had accumulated a lot of camera-centering machinery (`_animatePopupCameraToCenter`, `_centerPopupCardInViewport`, Mercator projection math, mobile-focus-lock/RAF-chain sequencing) purely to keep a growing card framed on screen. A sheet doesn't need any of that — it's simply anchored to the bottom/side of the viewport like Places and Directions already are. All of that machinery (plus `focusPlaceOnPhone`/`lockMobilePlaceFocus`/`runAfterPlacesSheetClose` and their state vars) was deleted rather than ported, since it no longer serves any purpose once there's no popup card to keep centered.
- **`showPlacePopup()` renamed to `openPlaceSheet()`** (`src/places.js`) — same content-building logic (badge header, title, address, tags, boycott callout, notes, hours, events, actions, fav/promo buttons) unchanged, now injected into `#place-sheet-body` inside a new `#place-sheet` (`index.html`) instead of a `maplibregl.Popup`. Opening a place never moves the map camera now — consistent with Places/Directions, and a deliberate simplification versus the old "pan to frame the popup" behavior.
- **Reviews are now inline**, not just a tap-through chip. New `buildInlinePlaceReviewsHTML()`/`wireInlinePlaceReviews()` exports in `src/reviews.js` reuse the existing private `_buildReviewCard`/`_compareReviewPriority` helpers and the `.rv-list`/`.rv-review-card` template classes already styled for the reviews overlay — up to 3 recent text reviews show directly in the sheet, with "Write a review"/"See all N reviews" still opening the full `#reviews-overlay` (that overlay's own write/OTP flow is untouched; account-based review editing is a later phase).
- **Back-button convention reused, not reinvented.** Opening the sheet from a places-list card morphs `#place-sheet-close` into a back arrow (mirrors `#dir-close`'s `dir-close--back` icon-swap-only convention exactly — no color override, since the existing sibling doesn't have one either despite an earlier log entry claiming it does; see note below) that reopens `#places-sheet` at the saved scroll position. Opened from a marker click, search result, sponsor card, or shared link, it's a plain close.
- **Simplified `openPlaceAfterSheetClose`/`runAfterPlacesSheetClose` away entirely.** They existed only to RAF-chain "close places-sheet, then open the popup" around the old camera-timing requirements. Since sheets have no such timing dependency, every call site now just does `closePlacesSheet(); openPlaceSheet(place, {...})` back-to-back — the exact same synchronous pattern the list→directions handoff already used (`src/places.js`'s `.pl-dir-btn` handler), now applied consistently.
- **Found a real bug while cleaning up CSS:** `.place-popup-wrap`'s card-chrome rules (padding/shadow/curvy-tip/close-button-hide) looked exclusive to the old place popup, but are also used — combined with `.pin-popup-wrap`, which has no CSS of its own — by the dropped-pin and current-location popups (`search.js`, `map-controls.js`). Initially deleted this CSS as dead, then caught it via a repo-wide grep for `place-popup-wrap`/`showPlacePopup` before finishing and restored it (including the mobile viewport-cap block and the `popupEnter` keyframe). **Lesson: when retiring a CSS class tied to one feature, grep the whole `src/` tree for that exact class/selector name before deleting — don't assume single ownership just because one call site is the one being changed.**
- **Doc correction:** `docs/DESIGN_SYSTEM.md`'s "Directions panel back button" description said `#dir-close.dir-close--back { color: var(--accent) }` exists in CSS — it doesn't (checked; only the icon-swap is real). Not fixed here (out of scope for this session), but flagging so nobody "matches" a rule that was never actually shipped.

**Verification (real browser, not just code review):** this sandbox's headless Chromium has no GPU/WebGL by default, which breaks MapLibre's `map.on('load')` and therefore most interactive Playwright assertions — confirmed this is pre-existing (identical failures reproduce against the untouched original code via `git stash`), not caused by this change. Added `--use-gl=angle --use-angle=swiftshader` launch args to `tests/playwright.config.js` *temporarily* to get a working map for real verification, then reverted that file before finishing — forcing software rendering globally would slow down test runs on machines with a working GPU, so it doesn't belong in the committed config for a sandbox-only problem.

With a working map, ran the full regression cycle and compared every failure against `git stash`-reverted original code to separate "pre-existing" from "caused by this session":
- `tests/13-places-popup-regression.spec.js`: rewrote the obsolete "popup card opens centered inside viewport" test into two new ones (sheet opens with content; close button returns to the list at the saved scroll position) — both pass. The 3 existing rapid-click/canvas-sizing tests needed their `openPlaces()`/`#places-btn` re-click helper changed to close the place sheet via its own back button first (`#place-sheet-close`) — selecting a place now opens a real sheet with the shared `#scrim` (`--z-scrim: 11` sits above `--z-bar: 10`, the tab bar), so `#places-btn` is legitimately unclickable until the sheet closes, exactly like it already was for Places/Directions. Not a bug — the old floating popup just never had a scrim to block the tab bar.
- `tests/06-places.spec.js`: the "Place Popup" describe block asserted `.maplibregl-popup` directly — updated all 5 tests to assert `#place-sheet`/`#place-sheet-body` instead (renamed the block to "Place Detail Sheet"). The other 4 failures in this file (tag filter row, tag count badge, favourite toggle, saved tab) reproduce identically on unmodified original code — pre-existing, untouched.
- `tests/11-pin-markers.spec.js` — **found and fixed a real regression, not just a stale assertion:** 5 of 9 failures were a genuine behavior change. The default Helsinki view has an actual place marker sitting almost exactly at the map's screen center; the test's double-click coordinates targeted dead-center. Double-clicking directly on that marker now opens then immediately closes its detail sheet (one action per click), which consumes both clicks before they reach the map's own `dblclick`-to-drop-a-pin handler — confirmed by clicking a nearby empty area instead (pin drops correctly, `customCount: 1`) and by reproducing the exact-center failure against original code too (marker was already there; original code just happened to still let the pin drop through). Concluded this isn't worth a code fix — double-clicking an existing marker to *also* drop a redundant duplicate custom pin on top of it was never a meaningful interaction, and the sheet correctly opening/closing on those two clicks is arguably more correct than before. Fixed by offsetting all 6 double-click coordinates in this test file away from dead-center, with a comment explaining why. The remaining 4 failures (all in the "Search Marker" describe block, mocked-geocoding-dependent) reproduce identically on unmodified original code.
- **Rule of thumb applied throughout:** never conclude "pre-existing flakiness" from a hunch — reproduce the exact same test against `git stash`-reverted original code first. This caught one real regression (the pin-marker one above) that would have been wrongly written off as environment noise otherwise.

**Files modified:** `index.html`, `src/places.js`, `src/reviews.js`, `src/directions.js`, `src/search.js`, `src/styles/styles.css`, `sw.js`, `tests/06-places.spec.js`, `tests/11-pin-markers.spec.js`, `tests/13-places-popup-regression.spec.js`, `docs/DESIGN_SYSTEM.md`, `docs/PREFERENCE_LOG.md`. Cache bumped to `20260731`.

### 2026-07-31 (same day, follow-up) — Place sheet: reviews must never push key info out of view; header alignment fix

**User feedback (with screenshots):** the shipped Phase 1 sheet had two real problems. (1) The close button visually looked disconnected/misaligned from the card. (2) Far more importantly — **inline reviews are unacceptable if they push the important stuff (tags, hours, notes) out of immediate view.** Direct quote: "reviews should always be collapsable/separate window like before, never expanded in a way that the important information are hidden." A place with many long Google reviews (e.g. "Döner Harju Aikatalo", "Burger King Forum" — 15k reviews) rendered 2-3 full review paragraphs *before* the tags/hours section, forcing a scroll past a wall of text just to see basic facts.

**Root-caused the alignment complaint properly before guessing at a fix** — used Playwright with software-WebGL launch args to load the real app, `getBoundingClientRect()` the close button and sheet, and pixel-sampled the screenshot with PIL to check actual rendered colors at the button's location. Conclusion: there was **no literal "floating outside the card" bug** (pixels were white/on-card the whole way up) — the real problem was a wasted, purposeless-looking empty header strip (a lone right-aligned button with nothing else in the row), which reads as "misaligned" even though it's technically contained correctly. Lesson: when a visual bug report doesn't match the DOM geometry, verify with actual pixel sampling before trusting your own read of a screenshot — a screenshot description can be wrong even when carefully considered.

**Fixes:**
- **Reviews reverted to compact-chip-only, tap-to-expand into the existing `#reviews-overlay`** — exactly the pre-Phase-1 behavior. Deleted `buildInlinePlaceReviewsHTML()`/`wireInlinePlaceReviews()` from `src/reviews.js` entirely (dead code once unused, not left behind "just in case"). `_renderPlaceSheetReviews()` in `places.js` now only calls `_renderPopupRating()`.
- **Header fixed to match this app's own established bottom-sheet convention** (Places/Directions: `.sheet-head` with an `<h2>` title + close button) instead of the ad-hoc empty `.place-sheet-head` bar from the first pass. `#place-sheet-title` (new `<h2>`) is set to the place name on open; the redundant `.pp-title` div inside the body is removed (now dead — deleted its CSS too, since nothing creates that element anymore). This closes the header row with actual content instead of empty space, and reads as intentional/consistent rather than "misaligned."
- Re-verified end-to-end with the same Playwright + pixel-sampling technique: opening the highest-review-count place (Burger King Forum, 15,016 reviews) now shows title in the header, zero inline review cards, and body content order `badge → address → rating chip → tags → boycott → notes → hours → actions` — everything important visible without scrolling.
- Updated the two Phase-1 tests that asserted `.pp-title` inside `#place-sheet-body` (`06-places.spec.js`, `13-places-popup-regression.spec.js`) to check `#place-sheet-title` instead. Re-ran the full `06`/`13` suites — only the same 3 confirmed-pre-existing failures remain (tag filter row, tag count badge, saved tab).

**Pattern to follow:** for any place-detail-sheet content addition going forward, default to **compact summary + tap-through to a separate overlay/window** for anything variable-length or potentially long (reviews, long descriptions) — never inline-expand it by default in the primary card, since that structurally can't guarantee important fixed-size facts (tags, hours) stay above the fold.

**Files modified:** `index.html`, `src/places.js`, `src/reviews.js`, `src/styles/styles.css`, `sw.js`, `tests/06-places.spec.js`, `tests/13-places-popup-regression.spec.js`, `docs/PREFERENCE_LOG.md`. Cache bumped to `20260731-2`.

### 2026-07-31 (same day, Phase 2) — Consolidated Menu panel replaces 4 stacked side-rail pills

Second phase of the accounts/redesign roadmap (`docs/ACCOUNTS_AND_REDESIGN_PLAN.md`). Purely structural/UX — no behavior change to Contact, Wishlist, or Map Style themselves, just where their entry points live.

- **Side rail decluttered from 6 pills down to 3.** Removed `#contact-pill-wrap`, `#wish-pill-wrap`, the standalone `#style-picker` pill, and `#tools-toggle` (the phone/tablet "more" fan-out button that used to group these same four things behind an extra tap). The rail is now just Search + Zoom + one new `#menu-pill`, identically on every viewport — this directly replaces the old `#tools-toggle` responsive-collapse system rather than adding a second one alongside it.
- **New `src/menu.js` module** (same shape/size as `contact.js`/`wishlist.js`) opens `#menu-sheet`, built on the same `.sheet` + `initSheetDrag` pattern as Places/Directions/the Phase-1 place sheet — not a new UI primitive. Four sections in order: **Account** (placeholder "Sign in — coming soon" until Phase 5), **Map View** (`#style-panel`'s existing 4 style buttons moved in verbatim, same click handlers in `map-controls.js`, unchanged), **Support** (Contact/Wishlist rows opening the existing unchanged overlays), **Preferences** (empty placeholder).
- Used the **Component Alias Pattern** for the two new row/label styles instead of writing parallel CSS: `.menu-section-label` is aliased onto the existing `.sort-section-label` template rule, `.menu-row` onto `.sort-opt` (+ its hover state) — new semantic class names as extra selectors on existing template rules, not duplicated declarations.
- **Simplified `src/app.js`:** deleted the entire phone/tablet/desktop conditional pill-grouping wiring block outright (~30 lines) — it existed only to decide *when* to collapse pills into `#tools-toggle`; with Menu being the only mode everywhere, there's nothing left to conditionally wire.
- **Removed now-dead CSS:** the full responsive fan-out system for `#tools-toggle` (base rule + the shared hide/reveal breakpoint block + phone/tablet/short-desktop fan-out blocks) from `styles.css`, and the `.pill-panel`/`.pill-panel.hide` template rule from `design-tokens.css` (confirmed `#style-panel` — its sole consumer — no longer references that class once it became static content inside the Menu sheet instead of its own toggleable popover). Also removed the `#style-picker-btn` open/close click handler and the outside-click-to-close listener in `map-controls.js`'s `_syncStyleButtons()`, since there's no longer an independent popover to open/close — `#style-panel` is just always-visible content, visible whenever the Menu sheet itself is open.
- **Tutorial updated:** merged the tour's separate "Desktop-only" and "Phone+Tablet: tools toggle" step blocks into one unified set (Zoom → Search → Menu → Map Style → Contact → Wishlist → Events, no `layout` restriction) since the Menu pill now behaves identically at every viewport width. Deleted `openToolsMenu()`/`closeToolsMenu()` entirely; `openMenuSheet()`/`closeMenuSheet()` (`menu.js`) return booleans reflecting whether they actually changed state, matching the `before()` hook's existing `true`-if-transition-triggered contract.
- Added `menu.js` to `sw.js`'s precache shell list (new module, would otherwise never get cached for offline use) and bumped the cache version to `20260731-3`.

**Verification (real browser, not code review) — same discipline as Phase 1:**
- Ran the Playwright suite on Desktop Chrome and Pixel 7 with the same temporary sandbox-only `--use-gl=angle --use-angle=swiftshader` launch args in `tests/playwright.config.js`, reverted immediately after this phase's verification concluded (`git checkout -- tests/playwright.config.js`) — same reasoning as Phase 1: this sandbox's headless Chromium has no GPU by default, and forcing software rendering globally isn't something that belongs in the committed config.
- Visually verified the relocated Menu sheet via screenshots at 4 viewport widths (phone, tablet, short-desktop, tall-desktop) in both open/closed states — no overlap, no clipped content, side rail correctly shows only Search/Zoom/Menu everywhere.
- Rewrote the Style Picker test blocks in `tests/01-dom-elements.spec.js`, `tests/04-map-controls.spec.js`, and `tests/12-mobile.spec.js` to target `#menu-pill`/`#menu-sheet`/`#style-panel` instead of the removed `#style-picker`/`#style-picker-btn`/`#tools-toggle`. Two of my own new/updated tests initially failed for a reason that turned out to be the same already-documented convention from Phase 1, not a bug: the shared `#scrim` (`--z-scrim: 11`, above `--z-ctrl-mid`) covers `#menu-pill` itself once `#menu-sheet` is open, so a test can't just click the pill a second time to close it — fixed both tests to close via `#menu-close` instead, same fix pattern as Phase 1's Places-sheet tests.
- `tests/04-map-controls.spec.js` had its own independent copy of the exact dead-center double-click marker collision bug already root-caused in Phase 1's `11-pin-markers.spec.js` (a real place marker sits almost exactly at the map's screen center, so a double-click there gets consumed by the marker's own click handler instead of reaching the map's dblclick-to-drop-pin handler) — fixed with the identical `+160,-160` coordinate offset and a comment pointing back at the original write-up, without re-deriving the root cause since it was already established.
- **Investigated a Pixel-7-only scrim/tap failure in depth rather than assuming it was pre-existing.** "Tapping scrim closes the places sheet" failed with `#places-sheet` never receiving `.shut`. Traced the actual scrim click handler in `directions.js` line-by-line first (confirmed my one added `else if` branch for `menuSheetEl` evaluates false in this scenario and does not short-circuit the chain), then reproduced it directly with a standalone Playwright script outside the test runner — a capturing listener added directly to `#scrim` for `click`/`touchstart`/`touchend` never fired at all when the sheet was open, meaning Playwright's forced tap never even reached the scrim element's hit-test target in the first place (almost certainly because the open `#places-sheet` covers the geometric center of the full-viewport `#scrim` on this narrow 412px-wide viewport, and `{force:true}` still targets the element's bounding-box center). Confirmed via `git stash` against the *original* pre-Phase-1/2 code with the *original* test files that all 8 remaining failures (this one, plus 7 more across `01-dom-elements.spec.js`/`12-mobile.spec.js` — drag-dismiss, touch-target-size, tab-bar-overlap, place-card-height tests) reproduce identically and unrelatedly on unmodified code. None required a fix; none are new regressions from this phase.
- Syntax-checked all modified JS (`node --check`) — no errors. Cleaned up all scratch diagnostic scripts, screenshots, and stray background `serve` processes accumulated during this investigation before finishing.

**Files modified:** `index.html`, `src/app.js`, `src/directions.js`, `src/map-controls.js`, `src/tutorial.js`, `src/styles/styles.css`, `src/styles/design-tokens.css`, `sw.js`, `tests/01-dom-elements.spec.js`, `tests/04-map-controls.spec.js`, `tests/12-mobile.spec.js`, `docs/ACCOUNTS_AND_REDESIGN_PLAN.md`, `docs/PREFERENCE_LOG.md`. New file: `src/menu.js`. Cache bumped to `20260731-3`.

### 2026-07-31 (same day, Phase 3) — Google-enriched place info: scope expanded from "website/phone" to nearly everything Google offers

User asked to expand Phase 3 beyond the plan's original website/phone scope: check what other non-image fields Google's Place Details API can provide "without exhausting the Google limit," and bring all of it into the now-larger place-detail sheet properly, not just contact info.

**Researched the actual billing model before writing any code, since the user asked directly.** Confirmed via Google's own docs (Legacy Place Details API, which this app already uses): fields are billed in three tiers — Basic (free), Contact ($3/1k calls), Atmosphere ($5/1k calls) — and billing is **per call at the highest tier requested**, not per field. The app's existing enrichment call already requests Contact (`opening_hours`, `website`) and Atmosphere (`rating`, `reviews`) fields, so adding more fields from any tier to that same request is free. This call also only fires once per new-place submission/edit via a rate-limited background trigger (`MAX_RUN = 10`), never per page view, so volume was never a real constraint either way.

**Field selection was a collaborative decision, not a unilateral one.** Proposed the full available field list (Google Maps `url`, `business_status`, `price_level`, `wheelchair_accessible_entrance`, `dine_in`/`takeout`/`delivery`/`curbside_pickup`/`reservable`, `serves_vegetarian_food`, `editorial_summary`) and flagged `serves_beer`/`serves_wine` as a judgment call given this is a halal-focused directory. **User's answer:** fetch them, but never display the raw flag — instead, automatically activate the app's existing `no_alcohol` tag (displayed as "Serves alcohol") when either is true. Implemented with one safety rule not explicit in the request but necessary given how sensitive halal-adjacent claims are for this audience: **the auto-tag only fires when the place has no existing explicit `no_alcohol` claim at all** (checked via `tags.hasOwnProperty('no_alcohol')`) — it never overrides a submitter's explicit "Alcohol-free" or "Serves alcohol" claim, since Google's business-category data could be stale and a wrong override on an alcohol claim specifically would be far worse than a wrong override on, say, price level.

**Found and fixed a real pre-existing gap while extending `enrichPendingRows()`:** website was already being fetched from Google on every new-place enrichment pass, but `copyNewRowToPlaces()` never actually copied it into the Places sheet on approval — it was silently discarded every single time. Not something the user asked about; caught it by reading the full copy pipeline before extending it, same "read before extending" discipline as Phase 1's CSS-ownership grep.

**Precedence rule extended to website/phone, matching the existing hours convention:** opening hours already had "user-submitted value wins, Google only fills gaps" logic. Applied the identical precedence to website and phone — a user typing their own website/phone into the suggest form pre-fills the New-sheet row before `enrichPendingRows()` runs, and the enrichment function now checks for an existing value before ever letting Google's fetched value win.

**Schema:** Places sheet gained columns P (website), Q (phone), R (`google_info` JSON blob — mapsUrl/businessStatus/priceLevel/wheelchairAccessible/dineIn/takeout/delivery/reservable/curbsidePickup/servesVegetarian/about, each key present only when true/non-empty), S (enriched-at timestamp, used only to make the new `backfillGoogleInfo()` tool safely re-runnable). New-sheet gained U (phone) and V (a slightly larger carrier version of the same blob that also transiently holds `servesAlcohol` until `copyNewRowToPlaces()` consumes it into tags and strips it — that key never reaches the Places sheet since it's not a Places-facing field). Edit-sheet gained M (website)/N (phone). Added `backfillGoogleInfo()` (mirrors the existing `backfillOpeningHours()` maintenance-tool precedent exactly) so the ~180 places that predate this phase can be backfilled in one optional manual run instead of waiting for their next edit.

**Frontend rendering (`src/places.js` `openPlaceSheet()`):** business-status banner (amber/red per open/permanently-closed) inserted right after the header — most urgent info, so it goes first; a contact row (phone/website/Google Maps link) right after the address; price-level + service-option + accessibility chips folded into the *same* tags row as the existing yes/no halal-status chips (not a separate section) so the sheet doesn't accumulate a "wall of new sections." **Caught a real visual bug during verification, not just code review:** these new info chips initially rendered in the exact same green tint as "yes" tags (e.g. "Alcohol-free"), because this app's `--accent` (`#08705B`) and `--success` (`#1fa86a`) are both dark teals — visually near-identical at 14% chip-tint opacity. Fixed by giving `.pp-info-chip` its own blue tint (`--hsl-bus`, an existing token already used for transit styling, not a new color) so Google-sourced amenity facts are clearly distinct from community-sourced halal-status claims. An attributed "From Google" blurb (editorial summary) was added near the notes section, deliberately styled distinctly from the existing italic user-notes style so it's never mistaken for admin-authored content.

**Verification approach, since no real place has this data until the Apps Script redeploy happens:** used a dynamic `import("/src/places.js")` inside a Playwright `page.evaluate()` to call `openPlaceSheet()` directly with a fully-populated mock place object — the same technique used for a manual visual check (screenshot-verified: status banner, contact row, 8 correctly-tinted info chips, about text all render correctly; separately verified the danger-tier banner variant and confirmed a place with *none* of the new fields renders identically to before, i.e. zero regression). Formalized this into 3 permanent Playwright tests in `tests/13-places-popup-regression.spec.js`, plus DOM-existence tests for the 4 new form fields in `tests/01-dom-elements.spec.js`. Ran the full affected suite (`01-dom-elements`, `06-places`, `13-places-popup-regression` on Desktop Chrome) — the only 6 failures all match already-documented pre-existing flakiness from the Phase 1/2 investigations (tag filters, favourites, saved-tab, the two known-flaky DOM tests); nothing new broke. Syntax-checked `Code.gs` via a temp `.js` copy (the file itself isn't valid to `node --check` directly due to its `.gs` extension) and all modified frontend JS.

**Manual steps still needed from the user (unchanged Apps-Script-deploy pattern from the plan):** paste the updated `Code.gs` and create a new deployment; optionally run `backfillGoogleInfo()` once from the Apps Script editor to backfill the ~180 pre-existing places (otherwise they only pick up this data on their next edit).

**Files modified:** `scripts/apps-script/Code.gs` (gitignored — not tracked, deploy-only), `functions/api/submit.js`, `index.html`, `src/places.js`, `src/styles/styles.css`, `src/styles/design-tokens.css`, `tests/01-dom-elements.spec.js`, `tests/13-places-popup-regression.spec.js`, `docs/ACCOUNTS_AND_REDESIGN_PLAN.md`, `docs/PREFERENCE_LOG.md`.

### 2026-08-01 — Phase 3.1: Contact quick-access button in the place-detail action row (+ a mid-task scope correction)

Small addendum before starting Phase 4 (the fully-manual Firebase console setup): added a "Contact" button to `#place-sheet`'s action row (`.pp-actions`), between the existing Directions and Share buttons — order is now Directions → Contact → Share → Edit.

**Data model check performed first, per instructions.** Grepped `src/places.js`/the Phase 3 changelog above before writing any code: the place object has exactly two contact-adjacent fields — `place.phone` and `place.website` (both from Phase 3's Google enrichment) — and **no place-level email field exists anywhere in the data model.** No guessing or inventing a new field.

**Mid-task correction (before finishing):** the initial build (based on the task brief's literal wording, which allowed for "phone vs. website" as a stand-in for "call vs. email") built a phone-vs-website button: phone-only → direct `tel:` action; website-only → direct `window.open`; both → a small chooser popover (reused `.sort-dropdown` chrome + `.menu-row` items via the component-alias pattern, opening upward since it's the last row in a bottom sheet); neither → button not rendered. Before finishing, the task owner clarified the intended two channels are strictly **phone and email** (not phone and website), and since no email field exists, the button should be **phone-only for now** — website must not be wired into it at all, even as a fallback, since it already has its own link in the existing `.pp-contact` row above the tags. Reworked accordingly: deleted the entire chooser-popover machinery (`_activePlaceContactMenu` state, `_closePlaceContactMenu()`, the outside-click-listener hookup, the `.pp-contact-wrap`/`.pp-contact-menu` CSS, the both/either branching in `openPlaceSheet()`) rather than leaving any of it half-wired "just in case" — a single unconditional phone-only branch replaced it.

**Final behavior:** `.pp-contact-btn` (icon-only phone icon, no text — consistent with the Button content rule) renders only when `place.phone` is present (absence means "unknown," the same convention already established for every other Google-enriched field on this sheet); tapping sets `window.location.href = 'tel:' + place.phone` directly. No popover, no chooser — there's only one channel to route to. Comments in the code explicitly flag this button as the natural extension point if a place-level email field is ever added later.

**Styling:** `.pp-contact-btn` aliased onto the existing `.btn-secondary` template (same visual chrome as `.pp-share-btn`/`.pp-edit-btn` — border/background/hover states, no new colours or shapes) and added to the `.pp-actions` flex-sizing rule (`flex: 1; height: 34px; padding: 0`) alongside the other action buttons. No new tokens were needed.

**Lesson for future task briefs:** when a brief's plain-language framing ("call/email") doesn't match what the actual data model has ("phone/website"), build the narrowest correct thing (phone-only here) and flag the ambiguity explicitly rather than silently substituting one pair of fields for a differently-named pair — the task owner caught this and corrected it mid-session, which is exactly the kind of clarification this project's process expects to surface, not paper over.

**Verification:** added 3 Playwright tests to `tests/13-places-popup-regression.spec.js` (phone present → button renders with "Call" label; website-only-no-phone → no button; neither → no button) via the same mocked-`openPlaceSheet()`-via-dynamic-import technique established in Phase 3. Ran the full `01-dom-elements`/`06-places`/`13-places-popup-regression` suite on Desktop Chrome with the same temporary sandbox-only `--use-gl=angle --use-angle=swiftshader` launch args used in every prior phase (reverted immediately after, confirmed via `git status`/`git diff` that `tests/playwright.config.js` came back clean) — the only failures were the same 6 already-documented pre-existing flaky tests (tag filter row, tag filter count badge, saved-tab, 2 known-flaky DOM tests) that have reproduced identically across every phase of this initiative; nothing new broke. `node --check src/places.js` passed.

**Files modified:** `src/places.js`, `src/styles/styles.css`, `src/styles/design-tokens.css`, `tests/13-places-popup-regression.spec.js`, `docs/DESIGN_SYSTEM.md`, `docs/ACCOUNTS_AND_REDESIGN_PLAN.md`, `docs/PREFERENCE_LOG.md`.

### 2026-08-01 — Phases 5-9: Firebase Auth, hash-only Sheets identity, review auth/edit/delete, cross-device sync

Full implementation of the remaining accounts/redesign roadmap (`docs/ACCOUNTS_AND_REDESIGN_PLAN.md`), following Phase 4's manual Firebase console setup. All code-complete; two things remain user-only: the batched Apps Script deploy (Phase 3 + Phase 6 combined, see below) and real-browser manual sign-in/sync spot-checks that need that deploy to be meaningful end-to-end.

**Phase 5 — Auth client + edge verification.**
- Firebase SDK loads via two SRI-pinned `<script type="module">` tags in `index.html` (`firebase-app.js`/`firebase-auth.js` at `10.13.0`, gstatic CDN) — same "external CDN, no bundler" convention as MapLibre GL, deliberately literal per the task brief even though it means ~250KB is fetched eagerly on every page load regardless of whether the visitor ever signs in (the same trade-off MapLibre itself already makes). `src/auth.js` then has its own top-level `import` from the identical URLs, reusing the browser's module cache rather than re-fetching.
- **Judgment call — where the Firebase config values live:** the plan bullet said to wire them into `src/config.js`/`config.template.js` "same pattern" as the existing `_cfg`/`config.local.js`-driven keys (`DIGITRANSIT_URL` etc). Went a different way: hardcoded `FIREBASE_CONFIG` directly in `config.js`, matching the existing `RECAPTCHA_SITE_KEY` precedent instead — both are public, non-secret, single-environment values, and the `_cfg` indirection exists specifically for values that differ between local/prod or are genuinely secret. `config.template.js` gets an explanatory comment instead of blank fields to fill in, so nobody wastes time trying to set up a local override that doesn't apply.
- `functions/_firebase-verify.js` verifies Firebase ID tokens with zero Firebase Admin SDK dependency (unavailable in Workers runtime — needs Node APIs) — fetches Google's **JWK-format** JWKS (`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`), not the older X.509-certificate JWKS endpoint, specifically to avoid needing a certificate parser: JWK keys import directly via `crypto.subtle.importKey('jwk', ...)`. Confirmed this endpoint's shape via a live fetch before writing any verification code, rather than assuming.
- `src/auth.js`/`src/menu.js`/reviews.js's sign-in prompt all dynamically `import()` the Firebase-dependent code paths rather than statically importing them — keeps the actual JS-level Firebase usage lazy (loaded after map load, alongside this app's other non-critical modules) even though the raw CDN bytes are fetched eagerly by the two script tags. `menu.js`'s own module stays a normal eager import (it's tiny and has no CDN dependency itself); only `initMenuAccount()` — which does the actual `import("./auth.js")` — runs inside the existing lazy `Promise.all` block in `app.js`.
- New `src/events.js` registry (`EVT.AUTH_CHANGED`, `EVT.SAVED_SYNCED`, `EVT.FAVOURITE_TOGGLED`, `EVT.SAVED_PIN_TOGGLED`) for the code added in this session, per the code-quality convention. **Deliberately did not retrofit** the ~15 pre-existing `hf:*` string-literal events elsewhere in the codebase (`hf:reviews-loaded`, `hf:home-updated`, etc.) — out of scope for this task, and the registry's own header comment says so explicitly so it doesn't look like an oversight later.

**Phase 6 — Hash-only identity linkage in Sheets.**
- New **SavedPlaces** sheet (`emailHash, kind, placeId, pinLat, pinLng, pinName, savedAt`) with `ensureSavedPlacesSheet()`/`getSavedPlaces()`/`saveSavedPlace()`/`unsaveSavedPlace()`, dispatched through a new `handleAccountPost()` wired into `doPost` via `formType: 'account'` (mirrors the existing `formType: 'wish'` precedent exactly). `kind: 'home'` is enforced as at-most-one-row-per-user by deleting any existing home row before appending the new one.
- `handleReviewSubmit` now accepts either the legacy OTP `verifyToken` or a pre-verified `emailHash` (sent only by the Cloudflare edge after it itself verified a Firebase ID token — the client never sends a raw emailHash for auth purposes, since that would let anyone claim any email's reviews without proof). The Firebase path **never writes column D (plaintext email)** — new rows write `''`, and edits to an existing row **skip touching column D entirely** rather than blanking it, so a legacy plaintext email from an old OTP-path row is left alone rather than being silently scrubbed as a side-effect of an unrelated edit.
- New `handleReviewDelete()` (own-row-only, matched by `emailHash`+`placeId`) and `getMyReviews()` (per-`emailHash` scan across all placeIds, joined with Places for display names) — both Firebase-only, no legacy-token fallback, since they're new Phase 7 capabilities that only ever ship behind sign-in.
- **Found and fixed a real regression while reading this section, not asked for:** `OTP_RATE_PER_EMAIL_HOUR`/`OTP_RATE_PER_IP_HOUR` were back at the loosened testing values (50/100, with `// TODO: restore after testing` comments) despite the 2026-07-18 session's changelog entry explicitly claiming they'd been restored to 3/10. Since `Code.gs` is gitignored (no commit history to check what happened), the exact cause is unknown, but the fix is the same either way — restored to 3/10 again. Flagging this pattern for future sessions: **a loosened security constant with a "restore after testing" TODO doesn't show up in any call-graph/dead-code analysis, so it has to be actively grepped for (`TODO|FIXME|placeholder`) and cross-checked against its last-logged value whenever touching a file that isn't under version control**, since there's no git blame to lean on.
- **Judgment call — no separate `update` action.** The plan bullet listed `update`/`delete`/`my-reviews` as three new actions for `functions/api/reviews.js`. Only implemented `delete`/`my-reviews` as new actions; "update" folds into the existing `submit` action, which already generalizes create-vs-update via its emailHash-dedup match (exactly how the legacy OTP path has always worked — submitting again with the same identity updates the existing row). Inventing a literal second action name that does the same thing as `submit` would just be two names for one code path, not a meaningful new capability.
- 🧑 **This batches with Phase 3's still-undeployed `Code.gs` changes into one combined deploy** — the plan doc's stated design ("two checkpoints total, not one per feature") holds: Phase 3 added the Google-enrichment columns and never got deployed yet, so this session's Phase 6 changes land in the exact same file, ready for one paste-and-deploy covering both.

**Phase 7 — Review authentication, edit & delete.**
- `functions/api/reviews.js`'s `submit`/`check` actions gained an `idToken` code path (verified via `_firebase-verify.js`, reduced to `emailHash` before ever reaching `Code.gs`) alongside the legacy `verifyToken` path.
- `src/reviews.js`'s entire OTP-entry UI (`_showVerificationForm`, `_sendOTP`, `_verifyOTP`, `_startResendCooldown`, `OTP_RESEND_COOLDOWN_MS`) was **deleted outright as dead code**, not left in "just in case" — once `_showReviewForm()` was rewritten to show a new `_showSignInPrompt()` (Google popup + email magic link) for anyone without a still-valid cached OTP token, nothing in the client ever calls the old OTP-entry functions again. The server-side OTP send/verify machinery (`handleSendOTP`/`handleVerifyOTP`/`Code.gs`) is untouched and still reachable, so anyone with an already-cached legacy token from before this deploy keeps working via `isVerified()` for continuity — this is a client-UI-only replacement, not a backend removal.
- New exports: `fetchMyReviews()`, `deleteReview(placeId)`, `openReviewsOverlayForEdit(placeId, placeName, existing)` (opens the reviews overlay straight into a pre-filled `_showRatingForm`, skipping the summary view — reuses the exact same form component for both "write a new review" and "edit from the Menu's Your Reviews list" rather than building a second edit UI).
- **Menu's "Your reviews" list delete uses a press-twice-to-confirm pattern**, not `window.confirm()` — first click swaps the trash icon to a checkmark for 3 seconds (`DELETE_CONFIRM_WINDOW_MS` in `src/menu.js`), a second click within that window actually deletes. This is the first confirm-before-destructive-action pattern anywhere in this codebase; documented in `docs/DESIGN_SYSTEM.md` as the reference for any future one, specifically to avoid reaching for a jarring native `confirm()` that would break the app's own overlay/toast-driven feel.

**Phase 8 — Cross-device sync.**
- New `functions/api/account.js` (`sync-saved`/`save`/`unsave`, all Firebase-authenticated) and new `src/account-sync.js` doing the union-merge (upload local-only, adopt server-only, never delete either side) on `EVT.AUTH_CHANGED`.
- **Decoupled via events, not direct imports**, to avoid a circular dependency: `account-sync.js` needs to import `places.js` (for `getFavouriteIds`/`setFavouriteState`) and `utils.js` (for saved pins/home) to actually perform the merge, so `places.js`/`utils.js` can't import `account-sync.js` back — instead, `toggleFavourite()`/`toggleSavedPin()` dispatch new `EVT.FAVOURITE_TOGGLED`/`EVT.SAVED_PIN_TOGGLED` events that `account-sync.js` listens for to fire a background sync call. Home location reuses the **pre-existing** `hf:home-updated` event (already dispatched by `setHomeLocation()`/`clearHomeLocation()`) rather than adding a new one, since it already carries exactly the needed `{home}` detail.
- Added non-toggling `setFavouriteState(id, saved)`/`setSavedPinState(lat, lng, name, saved)` setters specifically for the merge's own "adopt a server-only item locally" step — using the toggle functions there would have both double-fired the sync event and mis-attributed direction (adopting a server item isn't a local action that needs re-uploading).
- **Judgment call — home-location conflict resolution.** The plan didn't specify what happens when a local and server home location both exist and disagree. Chose "local wins, re-upload to overwrite the server's" — matches this app's existing established convention that a locally/user-entered value always takes precedence over a synced/fetched one (same reasoning as Phase 3's "user-submitted website/phone/hours beat Google's fetched values").

**Testing.** All of Phases 5-8's Firebase-dependent behavior is exercised via a new `tests/14-auth-account.spec.js`, mocking the Firebase SDK at the network level (not just stubbing app-level functions) since real Google OAuth/email delivery can't be driven from Playwright:
- `tests/helpers.js`'s shared `page` fixture now intercepts `**/firebase-app.js`/`**/firebase-auth.js` and serves a small fake ESM module exposing `initializeApp`/`getAuth`/`GoogleAuthProvider`/`signInWithPopup`/`sendSignInLinkToEmail`/`isSignInWithEmailLink`/`signInWithEmailLink`/`onAuthStateChanged`/`signOut`, plus `window.__mockAuth`/`__mockGoogleUser`/`__mockMagicLinkSent` hooks for tests to drive/inspect it directly.
- **Two real bugs found and fixed during this mock's own development** (both would have been invisible without live-browser verification, not just code review):
  1. **SRI blocks the mock outright.** The two `<script integrity="sha384-...">` tags in `index.html` correctly reject a mocked response body that doesn't match the real file's hash — the browser silently blocks the script (one `console.error`, no thrown exception) and, worse, propagates that failure to any *later* `import` of the same URL from `src/auth.js`, which surfaced as `"Failed to fetch dynamically imported module: .../src/auth.js"` — breaking the entire Account section (stuck on "Loading…" forever) with no directly-obvious connection to SRI at first glance. Root-caused via a standalone Node+Playwright script listening to `console`/`pageerror`/`response` events directly (bypassing the test runner) rather than guessing from the test failure message alone. Fixed by adding a route on `**/*` (filtered to `resourceType() === 'document'`) that fetches the real HTML and strips just the `integrity`/`crossorigin` attributes off the two Firebase `<script>` tags via a version-agnostic regex, registered *before* the specific `firebase-app.js`/`firebase-auth.js` mocks in fixture setup order — Playwright evaluates same-page routes LIFO, so the more specific mocks (registered later) still get first refusal on their own URLs, and this catch-all only ever actually fires for the document navigation request that nothing else matches.
  2. **Mock's `getAuth()` didn't expose a live `currentUser`.** Returned a static `{ app }` instead of `{ app, get currentUser() { return _currentUser } }`, so `auth.js`'s `getIdToken()` (which checks `_auth?.currentUser`) always saw `undefined` and returned `null` even right after a successful mocked sign-in — sign-in/sign-out UI worked fine (doesn't need a token), but anything requiring an idToken (`fetchMyReviews`, `deleteReview`, the Firebase `submit` path) silently no-opped. Fixed by making `currentUser` a live getter mirroring the mock's own internal `_currentUser` state.
  3. **A completely unrelated own-mistake, not a code bug:** a standalone diagnostic script accidentally launched `npx serve ..` from *inside* the project root instead of from `tests/` (where the real Playwright config runs it from), silently serving the parent directory instead of the app — produced a blank page with zero console errors, which looked exactly like a JS crash until checked directly. **Lesson for future ad-hoc diagnostic scripts:** always verify the dev server is actually serving the expected `#app` root element via a raw `curl`/`grep` before trusting anything downstream, especially when reusing a port that a previous `playwright test` run's managed server might have already been using.
- Ran the full suite (`01`-`14`) on Desktop Chrome with the established temporary sandbox-only `--use-gl=angle --use-angle=swiftshader` launch args (reverted after). All 11 new tests pass. Cross-checked every other failing test against files actually touched this session (via `git diff` file lists, since this repo has no commit boundary between "before this session" and "Phases 1-4's already-uncommitted work" to `git stash` against cleanly) — confirmed every failure outside `tests/14` sits in a file (`search.js`, `tutorial.js`, `map-controls.js`, the `Places`/`Tags` data JSON itself) this session never touched, so none of it is attributable to Phases 5-9. See the session's final report for the itemized breakdown (previously-documented-flaky vs. newly-surfaced-but-pre-existing).

**Files modified:** `index.html`, `_headers`, `src/config.js`, `src/config.template.js`, `src/places.js`, `src/utils.js`, `src/reviews.js`, `src/menu.js`, `src/app.js`, `src/styles/styles.css`, `sw.js`, `functions/api/reviews.js`, `scripts/apps-script/Code.gs` (gitignored — deploy-only), `tests/helpers.js`, `tests/playwright.config.js` (temp, reverted), `docs/DESIGN_SYSTEM.md`, `docs/ACCOUNTS_AND_REDESIGN_PLAN.md`, `docs/PREFERENCE_LOG.md`. New files: `src/auth.js`, `src/events.js`, `src/account-sync.js`, `functions/_firebase-verify.js`, `functions/api/account.js`, `tests/14-auth-account.spec.js`. Cache bumped to `20260801`.

### 2026-08-01 (same day, follow-up) — "Signed in but nothing happened": root-caused, two real bugs found and fixed

You deployed the Phase 3+6 `Code.gs` changes to Apps Script, then tested sign-in on the real site and reported: *"the login works, but didn't do anything with the login (e.g. review, saved pages etc)"*. Investigated with the mocked-Firebase Playwright harness rather than trusting a code read — extended `tests/14-auth-account.spec.js` from 11 to 20 tests, all real network-call assertions (captured actual `POST` bodies via `page.route`, not just DOM state).

**Root cause: two real bugs, not one.** Both were invisible to a code read alone — same lesson as the Phase 5-9 SRI-mock/`currentUser`-getter bugs a few hours earlier in this same initiative: mocked-harness verification with real network-call capture is what actually found these, not re-reading the source.

1. **No visible confirmation on sign-in.** `src/menu.js`'s Google-popup success handler had zero UI feedback — compare `src/reviews.js`'s own sign-in prompt, which already does `showToast("Signed in", "check")` on success. For a first-time sign-in with nothing pre-existing to reveal (empty "Your reviews", no saved places yet — which is inherently every user's *first* sign-in), a working sign-in and a silently-broken one looked identical. **Decision:** added the exact same `showToast("Signed in", "check")` call, matching the existing convention exactly rather than inventing a new toast style — for the interactive Google-popup path, and separately for a genuine magic-link-completion event only (never for an ordinary page load that merely restores an already-signed-in cached session, which stays silent per Phase 8's "purely additive, invisible" background-sync design). `src/auth.js`'s `initAuth()` now returns a boolean (`justCompletedMagicLink`) so `menu.js` can tell the difference.
2. **Real race condition (not just a symptom) — Phase 8 sync silently skipped for magic-link sign-ins.** `menu.js`'s `initMenuAccount()` called `await _auth.initAuth()` before `initAccountSync()`. `initAuth()` can *synchronously complete* a pending magic-link sign-in as part of its own execution, dispatching `EVT.AUTH_CHANGED` before `account-sync.js`'s listener for that exact event was even registered — and a `CustomEvent` never replays to a listener that arrives late. The interactive Google-popup path was unaffected (the listener is already registered by the time a user manually clicks that button, since `initMenuAccount()` finished on page load already) — only the magic-link *return-trip* completion could hit this specific ordering bug. **Fix:** reordered so `initAccountSync()` runs before `_auth.initAuth()`. Added a regression test driving a real magic-link completion (mocked SDK's `mockSignInLink=1` URL convention + a same-device email stashed in `localStorage`, per Firebase's own documented flow) that asserts `POST /api/account` `sync-saved` actually fires — this test genuinely failed before the reorder and passes after.
3. **Confirmed NOT a bug: the `emailHash` bridge normalization.** Compared `Code.gs`'s legacy OTP hash (`sha256Hex(email.trim().toLowerCase())`) against both Cloudflare Functions' Firebase-path hash (`sha256(verified.email.trim().toLowerCase())` via Web Crypto). Byte-for-byte equivalent (both trim + lowercase + UTF-8-encode + SHA-256 hex) — the plan's core "anonymous review bridges to a later sign-in with the same email" guarantee holds exactly as designed. Worth stating plainly since it was the most severe hypothesis on the list and it's clean.
4. **Confirmed NOT a bug: the "Your reviews" empty state.** Captured the actual network request/response for a first-time signed-in account with zero reviews — the `POST /api/reviews` `my-reviews` call fires correctly with the real idToken and returns/renders the empty state exactly as designed. This is what a working sign-in looks like for a brand-new account; bug #1 above is why it *read* as broken.

**Ancillary finding, deliberately not fixed (flagged for a future look, out of scope for this investigation):** opening "Write a review" for a place with **zero existing reviews** locks the overlay card at a very short height (`_insertReviewPanel`'s "reveal within the scroll area, don't push content" design), and the newly-revealed star-rating row can end up positioned right at that locked boundary — reproducibly ~8px clipped even after `scrollIntoViewIfNeeded()`/native `scrollIntoView({block:'center'})`, confirmed via `getBoundingClientRect()`/`elementFromPoint()` inspection (a real layout tightness, not a test artifact). Worked around in the test by driving `submitReview()` directly via dynamic import instead of clicking through the UI (this suite's established technique for exercising a mechanism directly when the surrounding UI chrome is an orthogonal concern) — full details and exact repro numbers in the Phase 9.1 entry of `docs/ACCOUNTS_AND_REDESIGN_PLAN.md`.

**Pattern reinforced:** when a user reports "X happened but nothing visible changed," always check for **both** a genuine functional gap **and** a UI-feedback gap before concluding either way — this session had one of each, and they were easy to conflate. A successful-but-silent action is indistinguishable from a broken one to a user, regardless of which it technically is.

**Testing:** all 20 tests in `tests/14-auth-account.spec.js` pass (Desktop Chrome, temporary `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist --enable-unsafe-swiftshader` launch args, reverted immediately after — confirmed clean via `git diff`/`git status` on `tests/playwright.config.js`). Also ran `01-dom-elements`/`04-map-controls`/`06-places`/`11-pin-markers`/`13-places-popup-regression` (85 passed, 8 failed) — every failure is in a file this session never touched (`search.js`/`places.js` filter logic, tag chips, search/dropped-pin popup titles) and matches categories already documented as pre-existing/flaky in this same plan's Phase 1/2 changelog entries; none relate to `auth.js`/`menu.js`.

### 2026-08-02 — "Sign in with Google" button restyle (`#menu-google-signin`)

**Task:** the Menu sheet's Account section Google button was just plain text ("Continue with Google") on the app's own solid accent-green pill — didn't read as an actual Google sign-in affordance. Scoped purely to this one button's visual design: no changes to the email magic-link flow, no changes to anything else in the Account section.

**Researched Google's actual branding guidelines first** (`developers.google.com/identity/branding-guidelines`) rather than guessing at colors: light theme is `#ffffff` fill / `#747775` 1px stroke / `#1f1f1f` text; dark theme is `#131314` fill / `#8e918f` stroke / `#e3e3e3` text; the four-color "G" logomark must never be recolored or placed on a background other than light/dark/neutral. The guidelines page itself doesn't publish the logo's exact hex values or SVG path data, so those came from the well-established, widely-published standard Google brand palette (`#4285F4`/`#34A853`/`#FBBC05`/`#EA4335`) and the canonical 18×18 four-path "G" SVG markup that's been consistently reused across Google's own sample code and the broader ecosystem for years — not invented or approximated.

**Decision: standard white/neutral (Google's own official look), not "keep the dark-green pill + inline a G icon."** Per the task brief's framing and Google's own stated rationale (a slightly-off reproduction of a well-known mark looks worse than no logo at all, and undermines the exact trust signal the button exists to provide), recognizability of the real Google affordance was judged more important than staying inside this app's own accent palette for this one specific third-party auth button. This is the first template in the design system that deliberately does *not* draw from `--accent`/`--surface` — flagged clearly in both `design-tokens.css` and `docs/DESIGN_SYSTEM.md` as an intentional, documented exception, not an oversight.

**Implementation:**
- New tokens in `design-tokens.css`: `--google-btn-bg`/`--google-btn-border`/`--google-btn-text` (fixed brand chrome values, light-mode defaults) plus `--google-g-blue`/`--google-g-green`/`--google-g-yellow`/`--google-g-red` (fixed logo colors, never overridden by theme). Dark-mode overrides for the three chrome tokens only (not the logo colors) added to `styles.css`'s existing `html.dark-mode, body.dark-mode` token-override block, matching the AMOLED-black dark mode pattern documented in this same log — Google's `#131314` dark fill is close to but deliberately distinct from this app's own pure `#000000` `--surface`, since the brand spec calls for a specific near-black, not this app's own AMOLED black.
- New `.btn-google` template class (`design-tokens.css` §3, next to `.btn-secondary`) — combined with the existing `.rv-action-btn` class for shared sizing (width/height/radius/font-size, already shared with the email sign-in button beside it), so `.btn-google` itself only overrides background/border/color/font-weight. Kept `.rv-action-btn`'s layout role intact rather than duplicating sizing rules.
- The "G" logo is inlined as SVG in `src/menu.js` (`GOOGLE_G_LOGO_SVG` constant, 18×18 viewBox, 4 `<path>` elements with `fill="var(--google-g-*)"`) — no external asset, no logo CDN fetch, matching how every other icon in this codebase is embedded. Confirmed `fill="var(--token)"` on inline SVG paths already works in this codebase (e.g. `index.html`'s tutorial mockup SVGs use `stroke="var(--...)"` the same way) before relying on it here.
- **Found and fixed a real latent bug while touching this button's failure-reset path:** the click handler's error branch did `googleBtn.textContent = "Continue with Google"` on a failed sign-in attempt, which would have silently wiped out the new icon+label markup on retry (previously harmless when the button was plain text, but a real regression once it holds an SVG + span). Fixed by extracting the icon+label markup into a `GOOGLE_SIGNIN_BTN_HTML` constant and using `innerHTML = GOOGLE_SIGNIN_BTN_HTML` in both the initial render and the failure-reset path.
- **Found and fixed a second real, easy-to-miss bug:** `.btn-spinner`'s default styling (`border-top-color: var(--on-accent)`, i.e. white) is invisible against the button's new light/white background, and only barely visible against dark mode's near-black background. Added a scoped `.btn-google .btn-spinner` override in `styles.css` using `var(--google-btn-text)` for the spinner arc so the "Signing in…" loading state stays visible in both themes without touching the shared `.btn-spinner` base rule (which the email "Send sign-in link" button still relies on with its original white-on-accent-green coloring).
- Updated the Button content rule's exemption list (`docs/DESIGN_SYSTEM.md`) to explicitly cover this case (brand-mandated third-party sign-in buttons) and the pre-existing-but-previously-undocumented loading-spinner-plus-text pattern, rather than leaving this new SVG+text button as an unexplained violation of "icon OR text, never both."

**Verified in a real browser via Playwright** (not just code review) — this sandbox's headless Chromium needs `--enable-unsafe-swiftshader --use-gl=swiftshader --ignore-gpu-blocklist` launch args for WebGL/MapLibre to initialize at all (same requirement a previous session in this log already documented and reverted from `playwright.config.js`); used a standalone temporary script with those flags to open the real Menu sheet, screenshot the button in light mode, dark mode (`html.dark-mode`/`body.dark-mode` class toggle, matching how `map-controls.js` applies the theme), the "Signing in…" spinner state, and the signed-in view — all confirmed visually correct, spinner visible in both themes, signed-in "Your reviews" panel unaffected. Ran the full `npm test`-equivalent `tests/14-auth-account.spec.js` suite via the standard config (no swiftshader flags) as a sanity pass and it failed across the board with the identical WebGL-context/tutorial-overlay signature this log's Phase 5-9 session already documented as a pre-existing sandbox limitation, unrelated to any code change — did not chase this further since it's a known, previously-logged environment gap, not a regression (confirmed no unintended diff crept into `design-tokens.css`/`styles.css`/`menu.js` via `grep` after the verification run).

**Deliberately out of scope, flagged for later:** `src/reviews.js`'s own "Continue with Google" button (`_showSignInPrompt()`) is visually identical to the old menu button and was **not** touched — the task scoped this change to `#menu-google-signin` only. `docs/DESIGN_SYSTEM.md`'s Account-section note now calls this out explicitly so the inconsistency reads as an intentional, logged deferral rather than something missed.

**Files modified:** `src/styles/design-tokens.css` (new tokens + `.btn-google`/`.btn-google-icon` template), `src/styles/styles.css` (dark-mode token overrides + `.btn-google .btn-spinner` override), `src/menu.js` (SVG logo constant, button markup, failure-reset fix), `docs/DESIGN_SYSTEM.md` (`.btn-google` template writeup, Button content rule exemption, Account-section note), `docs/ACCOUNTS_AND_REDESIGN_PLAN.md` (Phase 5 addendum bullet), `docs/PREFERENCE_LOG.md`.

**Files modified:** `src/auth.js`, `src/menu.js`, `tests/14-auth-account.spec.js`, `docs/ACCOUNTS_AND_REDESIGN_PLAN.md` (new Phase 9.1 section + unblocked several manual-test bullets now that the deploy has landed), `docs/PREFERENCE_LOG.md`.

### 2026-08-02 — Follow-up: `src/reviews.js`'s Google sign-in button brought into visual consistency

**Task:** the previous entry above deliberately left `src/reviews.js`'s own "Continue with Google" button (`_showSignInPrompt()`, the "sign in to write a review" gate) untouched, flagged as a follow-up once the Menu button's new look existed as a proven reference. This session closed that gap — purely a consistency fix, no new design decision.

**Shared-constants home: `src/icons.js`, not a `menu.js` export.** `GOOGLE_G_LOGO_SVG`/`GOOGLE_SIGNIN_LABEL`/`GOOGLE_SIGNIN_BTN_HTML` used to live as local constants inside `src/menu.js`. Moved them into `src/icons.js` (this app's existing home for shared inline-SVG icon markup — `PLACE_CONFIG`, `MODE_PATHS`, `typeIcon()`, etc.) and exported from there, imported by both `menu.js` and `reviews.js`. Considered exporting directly from `menu.js` and importing into `reviews.js` instead, but rejected it: `menu.js` already dynamically `import()`s `reviews.js` (to keep the Account section's Firebase-pulling modules lazy), so a static top-level `reviews.js → menu.js` import would create a real circular-module edge between the two — fragile even though the existing edge is dynamic. `icons.js` has zero dependents that import either `menu.js` or `reviews.js`, so it's a clean shared leaf with no circularity risk, and it's the pattern this codebase already uses for exactly this kind of "small reusable markup fragment" (same category as `src/events.js`'s `EVT` registry being the shared home for cross-module `CustomEvent` names — a small, dependency-free module purpose-built to be imported by multiple feature modules rather than owned by one of them).

**Verified the SVG copy byte-for-byte**, not just "looks right" — diffed the extracted `GOOGLE_G_LOGO_SVG` markup in `icons.js` against the original inline constant in `menu.js` programmatically before deleting the original, since a single mistyped path-data character would have been very easy to miss on visual inspection (a wrong digit in a `path d=` attribute of that length doesn't reliably show up as an obviously "wrong-looking" G).

**Same latent bug pattern applied to `reviews.js`:** `_showSignInPrompt()`'s Google button click handler's failure-reset branch did `googleBtn.textContent = "Continue with Google"`, which would wipe out the icon+label markup on a failed sign-in retry — identical bug to the one already fixed in `menu.js`'s equivalent path. Fixed the same way: `googleBtn.innerHTML = GOOGLE_SIGNIN_BTN_HTML` in both the initial render and the failure-reset branch. Button's class changed from `rv-action-btn btn-primary` to `rv-action-btn btn-google` (the `.rv-action-btn` shared-sizing base stays, matching the email "Send sign-in link" button beside it).

**Testing approach — deliberately did not chase the full `tests/14-auth-account.spec.js` suite through this sandbox's known WebGL gap again.** Re-confirmed (via a fresh probe) that this sandbox's headless Chromium still can't create a WebGL context without the `--use-gl=swiftshader`-family launch flags documented in the entry above, and that this stalls `map.on("load")` — which `initMenuAccount()` (and therefore the entire Menu sheet's Account section, `#menu-pill` included) is gated behind in `app.js` — long enough that essentially the whole `14-auth-account` suite times out regardless of any code change; a baseline, completely unrelated file (`01-dom-elements.spec.js`) run against the same unmodified sandbox showed the identical class of map/tile-dependent flakiness (31/34 passed; the 3 failures were pre-existing WebGL/tile-render-timing issues, not something this session touched). Given that signature was already independently reproduced and logged in the entry above, treated it as confirmed-and-known rather than re-adding swiftshader flags to `playwright.config.js` for a second time. Instead verified the actual rendered result directly: a standalone Playwright script served a minimal harness page from the same static server (bypassing `map.on("load")` and all of `app.js` entirely) that imported `GOOGLE_SIGNIN_BTN_HTML` from `/src/icons.js` and applied `.rv-action-btn.btn-google`, screenshotted in both light and `html.dark-mode` — confirmed the real 4-color G logomark, correct light/dark chrome, and (with the disabled+spinner markup applied manually) the `.btn-google .btn-spinner` visibility override all render identically to the Menu button's already-verified look, in both files' code paths.

**Pattern reinforced:** when a shared UI fragment (icon markup, button HTML) is extracted out of the module that first grew it, verify the *exact* extracted text against the original before deleting the original — don't rely on "the file still contains a `<svg>`" as sufficient confidence when the payload is dense, hand-transcribed path data.

**Files modified:** `src/icons.js` (new exports: `GOOGLE_G_LOGO_SVG`, `GOOGLE_SIGNIN_LABEL`, `GOOGLE_SIGNIN_BTN_HTML`), `src/menu.js` (now imports these from `icons.js` instead of defining them locally), `src/reviews.js` (`_showSignInPrompt()`'s Google button now uses `.btn-google` + `GOOGLE_SIGNIN_BTN_HTML`, failure-reset bug fixed), `docs/DESIGN_SYSTEM.md` (`.btn-google`'s "Used by" note updated to list both call sites and the shared-constants location), `docs/PREFERENCE_LOG.md`.

### 2026-08-02 (later same day) — Bug fix: sign-in prompt's email step didn't grow `.rv-overlay-card`

**Standing rule reiterated for this task and now formally recorded above (Preferences → Architecture/Development):** user said, verbatim, not to run Playwright or any browser/live-rendering verification unless explicitly asked — root-caused and fixed this purely via static code reading and reasoning about the CSS cascade/JS logic. Only verification performed was `node --check` on the edited files.

**Task:** `#reviews-overlay`'s `.rv-overlay-card` has `max-height: min(620px, 85vh); overflow: hidden`. Expanding the "Continue with email" panel inside the sign-in prompt (`emailStep.classList.toggle("hide")`, animated via `_animateReviewCardHeight()` → `animateElementHeight()` in `utils.js`) should grow the card up to that cap, but instead stayed stuck at its previous (smaller) height, clipping the newly-revealed email input/button.

**Root cause, confirmed by reading (not guessing):** `animateElementHeight()` itself (`src/utils.js`) is sound in isolation — it always re-measures fresh via a `height:auto` read before FLIPping, so a stale starting height alone wouldn't normally prevent it from computing a correct, bigger target. The actual defect is in `src/reviews.js`'s `_insertReviewPanel()` (called once, whenever the write-review/sign-in panel is first inserted into `.rv-overlay-body`): it pins `card.style.height` to the card's pre-panel height directly (`card.style.height = card.offsetHeight + 'px'`), entirely bypassing `animateElementHeight()`'s contract, with **no code path to ever release that pin** while the panel stays open. The only release that existed was `_restoreReviewSummary()` on explicit form-close, or an incidental side effect of whatever *other* `_animateReviewCardHeight()` call happened to fire later. This orphaned, never-cleared pin is the exact same defect independently logged as an unfixed "ancillary finding" in `docs/ACCOUNTS_AND_REDESIGN_PLAN.md`'s Phase 9.1 section months earlier (zero-review case, ~106px scroll pane, star row clipped) — strong independent corroboration this is a real, reproducible bug and not a one-off. Confirmed via full trace: no `initSheetDrag`/drag-to-dismiss mechanism touches `.rv-overlay-card` (ruled out); `.rv-overlay-body`'s `flex:1; overflow-y:auto` correctly resolves to content-based sizing (not scroll-clipped) once the card's own height is unconstrained, per the Flexbox spec's `flex-basis` percentage-resolves-to-content rule for indefinite-main-size containers — so once the pin is properly released, natural growth up to the CSS `max-height` cap works exactly as `animateElementHeight()` already assumes.

**Fix (`src/reviews.js`):** `_insertReviewPanel()` now releases its own height lock once `.rv-write-panel`'s own open transition (`grid-template-rows`, CSS-driven) finishes — a `transitionend` listener plus a `setTimeout` fallback (`WRITE_PANEL_OPEN_RELEASE_FALLBACK_MS = 450`, comfortably longer than the panel's 0.3s CSS transition, covering reduced-motion/interrupted-transition cases where `transitionend` never fires) — mirroring the release `_restoreReviewSummary()` already performs on close. This is purely additive: no change to the panel's own visual reveal, no change to `animateElementHeight()` itself. Once released, every subsequent `_animateReviewCardHeight()` call (email-step toggle, error message, "check your email" success message, invalid-token retry) starts from the card's true current size instead of a stale pre-panel baseline, so it can now genuinely grow (or shrink) to fit, capped only by the existing `max-height`.

**Checked the same class of bug elsewhere per the task's instruction:** `src/menu.js`'s `.menu-account-panel`/`_animateMenuPanelHeight()` (the Menu sheet's own email sign-in panel, sharing the same `animateElementHeight()` helper) has **no** equivalent raw-pin step — `emailToggle`'s click handler calls `_animateMenuPanelHeight()` directly with no separate freeze/insert-panel layer, so it was never exposed to this defect. No change needed there; confirmed by reading, not assumed.

**Files modified:** `src/reviews.js` (`_insertReviewPanel()` now releases its height lock on panel-open-transitionend + fallback timer; new `WRITE_PANEL_OPEN_RELEASE_FALLBACK_MS` constant), `docs/ACCOUNTS_AND_REDESIGN_PLAN.md` (Phase 9.1's ancillary-finding bullet updated with a "root cause confirmed and fixed" follow-up), `docs/PREFERENCE_LOG.md`.

### 2026-08-02 (later same day, follow-up) — The height-lock release worked, but the expansion itself was janky — fixed to a single continuous motion

**Standing rule reiterated again, now permanent for this project:** no Playwright, no browser, no live-rendering verification for reviews-panel work — `node --check` only, diagnosis via static reading of the JS/CSS. Applied again here.

**User's report:** the previous fix correctly stopped the card from staying stuck at the wrong height, but "the expansion happens in a janky way, not smoothly."

**Root cause, confirmed by reading `_insertReviewPanel()` and the surrounding CSS (not guessed):** two independent problems compounded into the same visible glitch.

1. **Freeze → invisible-grow → snap, not one motion.** `_insertReviewPanel()` pinned `card.style.height` to its pre-panel value for the *entire* duration of `.rv-write-panel`'s own `grid-template-rows` shut→open reveal, only calling `card.style.removeProperty("height")` after that reveal's `transitionend` (or the 450ms fallback) fired. So the actual sequence was: (a) the panel's internal reveal ran while the outer card was frozen, meaning the growing content was clipped against `.rv-overlay-card`'s `overflow: hidden` the entire time — invisible progress — then (b) the instant the lock released, the card jumped from its pinned pixel height to `auto`. Browsers do **not** reliably interpolate a `height` transition whose end value is the `auto` keyword (there's no defined intermediate geometry to animate through), so that release was an abrupt snap, not a transition — even though `.rv-overlay-card` already had `height` correctly listed in its `transition` shorthand (using `var(--t-spring)`, confirmed present since the 2026-05-28 "Reviews overlay height transitions" entry). Two disjoint phases (a hidden reveal, then a snap) is exactly what reads as "janky, not smooth."
2. **Timing/easing mismatch, independently confirmed.** `.rv-write-panel`'s `grid-template-rows` transition was hardcoded to `0.3s var(--ease-expo)` (`cubic-bezier(0.16, 1, 0.3, 1)`), while `.rv-overlay-card`'s own `height` transition (and every other `grid-template-rows` reveal pattern in `styles.css` bar one unrelated `.pp-hours-body` copy) uses `var(--t-spring)` (`0.35s cubic-bezier(0.32, 0.72, 0, 1)`). Even after fixing (1), these two curves racing at different durations/easings would still read as two motions rather than one.

**Fix:**
- `src/styles/styles.css`: `.rv-write-panel`'s transition changed from the hardcoded `0.3s var(--ease-expo)` to `var(--t-spring)`, matching `.rv-overlay-card`'s own `height` transition and the established codebase convention for this exact grid-reveal pattern.
- `src/reviews.js`: `_insertReviewPanel()` rewritten to FLIP the card's outer height and trigger the panel's `.shut`-class removal **together, from the same `requestAnimationFrame`**, instead of freezing the card for the reveal's full duration and releasing afterward. Sequence now: pin the card at its current height (still needed — prevents the raw DOM insert of the shut panel from itself causing a jump) → momentarily force the panel open with `panel.style.transition = "none"` to read the card's true post-reveal height → revert the panel to `shut` (still no transition) → in the next frame, clear both inline `transition: none` overrides and, in the same synchronous step, set `card.style.height` to the measured target *and* remove `.shut` from the panel. Both the card's `height` transition and the panel's `grid-template-rows` transition now start on the same frame and share `var(--t-spring)`, so they run in lockstep and finish together — one coherent motion instead of hidden-growth-then-pop. The existing `transitionend` + `WRITE_PANEL_OPEN_RELEASE_FALLBACK_MS` release mechanism (from the prior fix) is unchanged in shape, just triggered from inside the synced `requestAnimationFrame` callback instead of unconditionally at insert time.
- `REVIEW_PANEL_ANIMATION_MS` (used by `_restoreReviewSummary()` to time the *closing* collapse before swapping in summary HTML) bumped from `280` to `350` to stay matched to the panel's now-`var(--t-spring)` (0.35s) duration — it was tuned against the old 0.3s value and would otherwise fire ~50-70ms before the (now slightly longer) collapse actually finishes.
- Comments near `WRITE_PANEL_OPEN_RELEASE_FALLBACK_MS` updated to reference `var(--t-spring)`/0.35s instead of the old hardcoded 0.3s.

**Pattern to follow:** when a JS-driven height animation needs to run *alongside* a separate CSS-driven internal reveal (rather than sequenced before/after it), measure both elements' target state by momentarily forcing the end state with `element.style.transition = "none"` (on **both** elements involved), reading layout, reverting, then starting the *real* animated change for both in the same frame/tick so their CSS transitions begin simultaneously. Also: when two elements' motions are meant to read as one, they must share the same transition token (duration + easing), not just both use *some* token.

**Scope respected:** did not touch `animateElementHeight()`'s general contract, and did not touch the Menu sheet's analogous panel (`src/menu.js`'s `.menu-account-panel`/`_animateMenuPanelHeight()`, already confirmed unaffected by the underlying bug family in the prior entry — no separate freeze/insert-panel layer there, so no timing-mismatch or freeze-then-snap risk to begin with).

**Files modified:** `src/reviews.js` (`_insertReviewPanel()` rewritten for synced FLIP; `REVIEW_PANEL_ANIMATION_MS` 280→350; comment updates), `src/styles/styles.css` (`.rv-write-panel` transition now `var(--t-spring)` instead of hardcoded `0.3s var(--ease-expo)`), `docs/PREFERENCE_LOG.md`.

### 2026-08-02 — Email sign-in button hidden (Firebase Spark-plan quota)

Live production testing hit `QUOTA_EXCEEDED: Exceeded daily quota for email sign-in` from Firebase's `sendOobCode` endpoint. Confirmed via Firebase's own docs (firebase.google.com/docs/auth/limits): the **Spark (free) plan allows only 5 email-link sign-in emails per day**, project-wide — not per-user. Blaze (pay-as-you-go) raises this to 25,000/day. Google sign-in is unaffected — it falls under a separate, much larger "Tier 1 Daily Active Users" bucket (3,000/day on Spark) since it never sends an email at all.

**Decision:** hide the "Continue with email" button rather than remove any code, since the user intends to move to Blaze later and re-enable it. Implemented as a single `display: none` inside the existing `.menu-account-signin-row .btn-secondary` rule in `src/styles/styles.css` — the JS wiring in both `src/menu.js` and `src/reviews.js` (event listeners, `EMAIL_SIGNIN_BTN_HTML`, the send-link panel) is completely untouched. **The entire revert, whenever Blaze is enabled, is deleting the one `display: none` line.** Google's button naturally fills the row's full width now, since a `display: none` element doesn't participate in the row's flex layout at all — no other CSS changed.

Files modified: `src/styles/styles.css`.

### 2026-08-02 (later same day) — Three real bugs from live production testing: review delete, cross-device removal, real Yes/No confirms

Standing rule applied throughout, per the task and the permanent Preferences entry above: no Playwright, no browser, no live-rendering verification — root-caused and fixed purely via static reading of `Code.gs`/JS/CSS, `node --check` only.

**Issue 1 — Review delete completely broken, front and back. Confirmed root cause (not a guess): an asymmetric-normalization bug across four Reviews-sheet row-matching functions in `Code.gs`.**

Traced every place a Reviews-sheet row is written or matched, exhaustively, rather than assuming the header comment's column layout held at runtime everywhere: `ensureReviewsSheet()`'s header (`placeId, rating, text, email, timestamp, status, emailHash, googleReview, googleRating, googleRatingCount`), `handleReviewSubmit`'s new-row append and existing-row update (both correctly write/read column G = index 6 for emailHash), `handleReviewCheck`, `handleReviewSubmit`'s own dedup match, `handleReviewDelete`, and `getMyReviews`. Column *positions* were consistent everywhere — no divergence between the append path and the update path, contrary to one of the hypotheses going in. The actual defect: `getMyReviews()` (added in Phase 7, the function that successfully *lists* "Your reviews" and therefore convinces the user the review is right there) was the **only** one of the four match functions that called `.toString()` on the raw `getValues()` placeId cell before comparing/returning it. `handleReviewCheck`, `handleReviewSubmit`'s dedup, and `handleReviewDelete` all used a bare strict `===` directly against whatever `getValues()` handed back — fragile against anything that isn't already a clean, whitespace-free string for that specific row (Sheets' own automatic type-coercion of numeric-looking text, or incidental whitespace from any manual edit/copy-paste of the sheet — either is plausible for a real, human-managed production sheet, and not something verifiable without live access to it). That asymmetry produces exactly the reported symptom: the review is visibly listed (found by the lenient function), but delete's stricter, unnormalized comparison can silently fail to recognize "the same" row and return `not_found` — which `src/reviews.js`'s `deleteReview()`/`src/menu.js`'s `_performDelete()` correctly report as failure rather than lying about success (confirmed both of those client-side functions are wired correctly and were never the problem — same conclusion the task brief itself had already reasoned toward).

Also checked and ruled out: (a) the `emailHash` bridge between the legacy OTP path and the Firebase path — already independently confirmed byte-for-byte identical in the 2026-08-01 Phase 9.1 investigation, re-confirmed here by re-reading both hash computations side by side; (b) `MAX_PLACE_ID_LEN = 6` in `functions/api/reviews.js` — matches `generatePlaceId()`'s actual 6-char output exactly (spot-checked against all 184 ids in the current `data/places.json` snapshot, none numeric-looking), so not a truncation bug; (c) `verifyFirebaseIdToken`/`resolveFirebaseIdentity` — identical code path for submit/check/delete, so couldn't explain a delete-only failure.

**Fix:** new `_normReviewCell(value)` helper (`(value == null ? '' : value).toString().trim()`) in `Code.gs`, and every placeId/emailHash/status comparison in `handleReviewCheck`, `handleReviewSubmit` (including its `Places`-sheet `placeExists` check, the same class of bug applied to a different sheet), `handleReviewDelete`, and `getMyReviews` now routes through it — closing the entire class of drift rather than patching the one call site that happened to get reported. New reviews are now also stored with the normalized placeId (not the raw, possibly-padded value) so future matches against that row stay reliable. Also fixed a smaller, compounding UX gap while in this code: `_performDelete()` in `src/menu.js` previously failed completely silently on the server returning an error — now shows `showToast("Couldn't delete review", "error", ...)`, so a future failure (if one ever recurs) is visibly distinguishable from "nothing happened" instead of looking identical to a broken button.

**Issue 2 — Cross-device removal didn't propagate. Real architectural gap in the original Phase 8 scope (explicitly documented as additive-only), not a bug against it — presented as such, not silently reinterpreted.**

The task's own hypothesis had two parts; verified both against the actual code rather than trusting either blindly:

1. **"The merge only re-runs at initial sign-in, not on later page loads restoring an already-signed-in session" — checked and NOT confirmed as a real gap.** Firebase's `onAuthStateChanged` callback fires once on *every* page load once the SDK resolves the auth state, whether that's a fresh interactive sign-in or simply restoring a persisted session — not only on state transitions. `src/auth.js`'s `initAuth()` dispatches `EVT.AUTH_CHANGED` from directly inside that callback. `src/menu.js`'s `initMenuAccount()` already calls `initAccountSync()` (which registers the `EVT.AUTH_CHANGED` listener) *before* `await _auth.initAuth()` — the exact ordering the 2026-08-01 Phase 9.1 magic-link race fix already put in place for an unrelated reason. So a device that's already signed in and simply reopened/reloaded does already re-run `_syncOnSignIn()` on that load, via the existing mechanism. This part of the original hypothesis doesn't hold up under trace.
2. **"Even when the merge runs, it's purely additive and can't express a removal" — confirmed, and this is the real, sole root cause.** `_mergeFavourites`/`_mergePins`/`_mergeHome` only ever added: server-only items got adopted locally, local-only items got pushed up, and an item removed on one device (via its own correctly-working `_backgroundSync` unsave call, which does correctly delete/mark-unsaved server-side) would sit forever on any *other* device, since that device's own next merge has no way to tell "genuinely new local item, never uploaded" apart from "previously-synced item, now deleted elsewhere" — both look identical as a single local-vs-server-list diff with no additional memory of prior state.

**Fix — real two-way reconcile, with a persisted "known synced" baseline to make the push-vs-remove distinction possible.** `src/account-sync.js` now keeps `hf_sync_known_v1` in localStorage (`_getKnownSyncState()`/`_setKnownSyncState()`), snapshotting the post-merge local truth (favourites/pins/home) after every successful `_syncOnSignIn()`. On the next merge: a local item missing from the server's returned list is pushed up if it's *not* in that baseline (genuinely new, never seen before), or removed locally if it *is* in the baseline (confirmed synced before, now gone server-side — removed on another device). Order matters and is preserved: push-new is evaluated before remove-if-known, so a local addition that hasn't been uploaded yet is never mistaken for something that "was removed elsewhere." Applied identically to favourites (matched by placeId), saved pins (matched by coordinates via the existing `_sameCoords` epsilon), and home location (a singleton, same push/adopt/remove-if-known shape). Also added, per the task's explicit suggested direction and as a deliberate belt-and-suspenders addition rather than the actual fix for point 1 above (since point 1 didn't turn out to be broken): `initAccountSync()` now also calls `_syncOnSignIn()` directly whenever `auth.getCachedAccount()` is already truthy at call time, independent of whatever `EVT.AUTH_CHANGED` does — harmless to call twice, since `_syncOnSignIn()`'s own `_syncing` guard makes a redundant concurrent/sequential call a no-op.

**Residual edge case — stated plainly, not oversold as solved.** A local removal made while the device is genuinely offline never reaches the server at all (`_backgroundSync()` is fire-and-forget, no retry queue, no service-worker background-sync). If a reconcile-from-server pull happens on that same device before connectivity returns and the removal is ever retried, the server's still-has-it copy is indistinguishable from a legitimate "this was added on another device, adopt it" case — nothing in this design (no tombstone/deletion-log) can tell those two apart. That one scenario can still silently resurrect a user's own deliberate removal. This is a real, acknowledged limitation of the fix, not a hypothetical.

**Issue 3 — Real Yes/No confirmation for review delete and sign-out, replacing press-twice-to-confirm.**

Built exactly one reusable component rather than two bespoke ones, per the task's instruction: `showConfirmDialog({ title, message, confirmLabel, cancelLabel, variant, icon })` in `src/utils.js`, returning `Promise<boolean>`. Built and torn down entirely in JS per call — creates `.confirm-overlay`/`.confirm-card`, appends to `document.body`, removes itself after resolving — matching `showToast()`'s own create-on-demand convention (this app already had exactly one precedent for "ephemeral, JS-spawned overlay component," and this follows it rather than adding a second, static-HTML-element pattern like `#reviews-overlay`/`#promos-overlay`). Shell is the same fixed-centered-overlay shape as `#promos-overlay`/`#promos-card` (`--overlay-bg` backdrop, `--z-overlay`, `--r-xl`/`--shadow-xl` card, scale+fade transition), just expressed as reusable classes instead of one static named element, since this one gets spawned from anywhere. Icon circle + title + description reuses the exact visual weight of `.rv-verify-icon`/`.rv-verify-title`/`.rv-verify-desc` (the reviews sign-in prompt's own header pattern) conceptually, though implemented as new dedicated classes (`.confirm-icon`/`.confirm-title`/`.confirm-desc`) rather than literally alias-alising onto those pre-existing `styles.css` rules, since this dialog's icon needs a `--danger` tint variant those don't have. Two equal-weight buttons (`.btn-secondary` Cancel + `.btn-danger-filled` or `.btn-primary` Confirm, depending on `variant`) mirror the "two peer buttons in one row" convention `.menu-account-signin-row` already established, rather than a single dominant CTA + smaller secondary link.

- `variant: "danger"` (red icon, `.btn-danger-filled` confirm button — matches that template's own "hard-destructive, no easy undo" definition) used for `.acc-review-delete`.
- `variant: "default"` (accent icon, `.btn-primary` confirm button — state-changing but not destructive) used for `#menu-signout`.
- Dismissal: backdrop click, Escape, or Cancel all resolve `false`; Confirm resolves `true`. A second call while one is open resolves the first `false` and replaces it (never stacks two dialogs).
- Deleted the entire press-twice apparatus from `src/menu.js` (`DELETE_CONFIRM_WINDOW_MS`, `_handleDeleteClick`, `_resetDeleteButton`, the `data-confirming` dataset/timer state) as dead code, not left "just in case" — grepped the whole `src/`/`tests/` tree first to confirm nothing else referenced it.
- `docs/DESIGN_SYSTEM.md`'s Account-section note now explicitly marks the press-twice description as obsolete (with a pointer to the new component) instead of silently leaving it as a stale "current reference implementation," per the task's explicit instruction not to do that.

**Testing:** rewrote the 3 affected tests in `tests/14-auth-account.spec.js` (sign-out was un-tested-for-confirmation before; press-twice delete test rewritten into a cancel test + a confirm test) to drive the new `.confirm-overlay`/`.confirm-cancel`/`.confirm-ok` markup instead of the old icon-morph assertions. `node --check` passed on every modified JS file (`Code.gs` via a temp `.js` copy, same convention as every prior session touching that gitignored file, plus `account-sync.js`, `utils.js`, `menu.js`, `14-auth-account.spec.js`) — no live browser/Playwright run, per the standing rule.

**Manual step needed:** the same batched `Code.gs` paste-and-redeploy this plan has been tracking since Phase 3 — this session's `_normReviewCell()` fix lands in that same gitignored file.

**Files modified:** `scripts/apps-script/Code.gs` (gitignored — deploy-only), `src/account-sync.js`, `src/utils.js`, `src/menu.js`, `src/styles/design-tokens.css`, `tests/14-auth-account.spec.js`, `docs/DESIGN_SYSTEM.md`, `docs/ACCOUNTS_AND_REDESIGN_PLAN.md`, `docs/PREFERENCE_LOG.md`.

### 2026-08-02 (same day, follow-up) — Optimistic UI, confirm-dialog animation bug, OAuth provider quota research

Handled directly in the main loop rather than via a subagent — the-architect/refactorer agent types were unavailable this session. Followed the same standards (JSDoc, no magic numbers, EVT registry for event names, node --check only, PREFERENCE_LOG.md update) rather than skip them just because no subagent was invoked.

**Bug: `.confirm-overlay` (the new Yes/No dialog) had zero open/close animation — "just appears out of nowhere."** Root cause: `styles.css:94` has a global `.hide { display: none !important; }` utility class. Every other overlay in this app (`#reviews-overlay`, `#contact-overlay`, `#suggest-overlay`, etc.) explicitly re-declares `display: flex !important` inside its own `.hide` rule specifically to out-specificity that global utility and keep the element rendered (just `opacity: 0`) so its fade/scale transition has something to animate from. `.confirm-overlay.hide` (`design-tokens.css`) was built without that line — the dialog was actually `display: none` the entire time it was "hidden," so removing `.hide` snapped it straight to fully-visible with no transition ever running. Fixed by adding the same `display: flex !important` line, matching the established pattern exactly.

**Gap: cross-device favourite/pin sync updated the data but not the UI — "only updates on refresh."** `src/account-sync.js`'s reconcile (`_syncOnSignIn`) already dispatched `EVT.SAVED_SYNCED` after adopting/removing favourites or pins from another device, but nothing in `src/places.js` ever listened for it — the Places list's "Saved" tab and map markers had no way to learn a background sync had happened short of a full page reload (a manual refresh re-runs the whole render pipeline from scratch, which is why that "fixed" it). Added a listener in `places.js` that calls `addPlaceMarkers()` unconditionally and `renderPlacesList()` when the Saved tab is active.

**Gap: review delete waited for server confirmation before updating the UI at all — not genuinely optimistic.** Per the user's explicit ask ("update on the frontend even before the database confirms... if the backend fails, gracefully remove it and give a toast"), `src/menu.js`'s `_performDelete()` now removes the review row immediately on confirm, before the network request resolves, and rolls it back to its exact original position (via `insertBefore`/`nextElementSibling`, not a full re-render) plus a failure toast if the delete actually fails server-side. Same principle extended to `src/account-sync.js`'s `_backgroundSync()`: favourite/pin toggles were already optimistic locally, but if the background save/unsave call to `/api/account` ever actually failed, nothing rolled the local state back or told the user — it just silently stayed "saved" locally while the server never got it. `_backgroundSync` now takes an `onFailure` callback; the favourite/pin listeners in `initAccountSync()` revert via `setFavouriteState`/`setSavedPinState` and re-dispatch `EVT.SAVED_SYNCED` (reusing the listener just added above) plus a toast. Home location's failure path gets a toast only, not a full rollback — reverting home would need capturing the prior home value before the change, a bigger restructure of `utils.js`'s home-location flow not attempted here since it wasn't the reported symptom.

**Copy: review-delete confirmation now names the place** ("Delete your review for Bangladesh Islamic Cultural Center (BICC)?" instead of the generic "Delete this review?"), threaded through from `_wireMyReviewRows`'s existing `byPlaceId` map. Sign-out's dialog text was left as-is — it already reads as specific ("You'll need to sign in again to write reviews or sync your saved places."), and the user didn't flag anything precise about it; worth asking if something particular felt off there.

**Research: which Firebase-supported OAuth providers have the best free sign-in quota, given the 5/day email-link wall.** Confirmed via Firebase's own docs (multiple WebFetch attempts on cloud.google.com/identity-platform/pricing kept truncating — cross-referenced firebase.google.com/docs/projects/billing/firebase-pricing-plans and firebase.google.com/docs/auth/limits instead): Google, Facebook, Microsoft, GitHub, Twitter, Yahoo, Apple, Play Games, and Game Center are ALL grouped under one "Authentication (most options)" no-cost bucket — Tier 1, 3,000 DAU/day on Spark. None of them beats another; only email-link (a distinct outbound-email operation, 5/day) and custom SAML/OIDC enterprise federation (Tier 2, 2/day) are worse. Recommended Microsoft as a second OAuth option alongside Google for users avoiding the email flow, since it shares the same generous quota.

**Files modified:** `src/places.js`, `src/menu.js`, `src/account-sync.js`, `src/styles/design-tokens.css`, `docs/PREFERENCE_LOG.md`.

### 2026-08-02 (same day, follow-up 2) — Optimistic review submit, shorter sign-out copy, Microsoft sign-in added

Follow-up refinement to the entry immediately above, still handled directly in the main loop (subagent types unavailable).

**Optimistic UI extended to writing/editing a review, per the user's explicit example.** `submitReview()`'s UI handler (`_showRatingForm`'s submit click in `src/reviews.js`) previously disabled the button, showed a spinner, and only closed the overlay after the full server round-trip — despite the form's own copy already claiming "Your review will appear immediately," which wasn't true. Now closes immediately and shows a "Submitting…"/"Updating…" toast before the request resolves; on actual failure, reopens the exact same rating form pre-filled with the rating/text just typed (via `openReviewsOverlayForEdit`, the same mechanism already built for the Menu's "edit an existing review" flow) plus an error toast — nothing typed is ever silently discarded. `invalid_token` failures specifically reopen via plain `openReviewsOverlay()` instead (re-render decides sign-in-gate vs. rating form from current auth state, since re-auth is needed before a retry would even make sense). Also checked `src/wishlist.js`'s vote handler as a candidate — already correctly optimistic with rollback+toast (explicitly commented "// Optimistic UI"), so nothing to fix there; it's the pattern the review-delete/submit fixes now match.

**Sign-out dialog shortened.** "You'll need to sign in again to write reviews or sync your saved places." → "You'll need to sign back in for reviews and sync." Same meaning, fewer words, per explicit feedback that the original felt wordy. User confirmed the *rest* of that dialog (title, structure) was fine as-is.

**Microsoft sign-in added as a second OAuth option**, alongside Google — same equal-weight peer-button treatment already established (`.btn-microsoft` mirrors `.btn-google` exactly: same chrome tokens `--google-btn-bg/border/text` reused rather than duplicated under a `--ms-btn-*` name, since both brands' official button guidelines converge on the same white/neutral look; only the logomark differs). New `--ms-red/green/blue/yellow` tokens for Microsoft's official unchanged-since-2012 four-square logomark (`design-tokens.css`), `MICROSOFT_LOGO_SVG`/`MICROSOFT_SIGNIN_BTN_HTML` (`icons.js`), `signInWithMicrosoft()` in `src/auth.js` (uses the generic Firebase `OAuthProvider("microsoft.com")` — there's no dedicated `MicrosoftAuthProvider` class the way `GoogleAuthProvider` exists), wired identically to the Google button in both `src/menu.js` and `src/reviews.js`'s sign-in prompts. The row's existing `flex: 1`-per-visible-child layout handles a third (currently-hidden, per the email quota decision) sibling with no structural change — Google and Microsoft simply split 50/50 the same way Google and email used to. Reasoned (not verified live, per the standing no-testing rule) that no CSP change is needed: `signInWithPopup`'s Microsoft login page opens as a separate top-level browsing context Microsoft's own domain owns, not a CSP-governed embedded resource — the actual result-relay back to the app still goes through the already-whitelisted `authDomain`/`apis.google.com` channels shared with Google's identical popup mechanism. Flag this as the first thing to check if Microsoft sign-in throws a console error in practice.

**Manual step needed (new, not yet done):** enabling Microsoft in Firebase requires an Azure/Microsoft Entra ID app registration (Application ID + Client Secret) pasted into Firebase's Microsoft provider config — Firebase has no built-in Microsoft OAuth client the way it does for Google. Walked the user through this as a guided step-by-step (same convention as the original Phase 4 Firebase console setup).

**Files modified:** `src/reviews.js`, `src/menu.js`, `src/auth.js`, `src/icons.js`, `src/styles/design-tokens.css`, `src/styles/styles.css`, `docs/PREFERENCE_LOG.md`.

**Manual step completed by the user:** their personal Microsoft account had no real Entra tenant of its own (defaulted to the placeholder "Microsoft Services" tenant, which can't do admin tasks — a recurring "Interaction required" popup on every portal search was the symptom, distinct from the app-registration account-type issue). Fixed by signing up for Azure's free trial, which provisions a real tenant. Confirmed via research: creating a tenant this way typically requires a card for identity verification even on the no-cost tier, though app registration and Microsoft sign-in itself stay genuinely free (Entra External ID's free tier covers the first 50,000 monthly active users). App registration recreated correctly afterward ("Any Entra ID Tenant + Personal Microsoft accounts", correct redirect URI) and Microsoft sign-in confirmed working end-to-end by the user.

### 2026-08-02 (same day, follow-up 3) — Personalized welcome toast (new vs. returning), sign-out toast

Handled directly in the main loop (subagent types still unavailable this session).

**"Welcome, X" for new accounts / "Welcome back, X" for returning ones, across all three sign-in methods.** Uses Firebase's own `getAdditionalUserInfo(userCredential).isNewUser` — the standard, correct signal for this, not a guess or a local heuristic. New shared `_resultFromCredential(cred)` in `src/auth.js` extracts `{account, isNewUser}` from any `UserCredential` (Google popup, Microsoft popup, and magic-link completion all return one), so `signInWithGoogle()`/`signInWithMicrosoft()`/`completeMagicLinkSignIn()` all expose it identically instead of three divergent shapes. `completeMagicLinkSignIn()`'s return type changed from a bare `boolean` to `{completed, account?, isNewUser?}` — `initAuth()`'s return type changed to match (was already documented as "callers use this to decide whether a toast is warranted"), with the one caller (`src/menu.js`'s `initMenuAccount()`) updated accordingly.

**First-name resolution, shared across every caller:** new `buildWelcomeGreeting(account, isNewUser)` in `src/utils.js` (not `auth.js`, to keep that module UI-text-free) — `displayName`'s first token if present, else the email's local-part (magic-link sign-ins have no `displayName` at all), else a name-less "Welcome!"/"Welcome back!". Used identically by all 5 call sites: `src/menu.js`'s Google button, Microsoft button, and magic-link-completion path, plus `src/reviews.js`'s Google and Microsoft buttons in the "sign in to write a review" prompt.

**Sign-out toast added** — there wasn't one before; clicking through the Yes/No confirm dialog just silently signed out. "Signed out" on success, "Couldn't sign out" + retry hint on the (very rare, no-network-call-involved) failure path, which was previously swallowed silently.

**Audited for other missing-feedback gaps, per the user's "add more toasts where needed" ask — found none worth adding.** Checked the Preferences section (prayer method, Asr madhab, 12-hour toggle, reduce-motion toggle): all four already have instant, visible confirmation baked into the interaction itself (the dropdown/switch visibly changes state, prayer times visibly update on screen via `refreshPrayerTimes()`/`refreshPrayerTimeDisplay()`) — a toast on top would be redundant noise, not a real gap, so left as-is rather than toasting everything mechanically.

**Files modified:** `src/auth.js`, `src/utils.js`, `src/menu.js`, `src/reviews.js`, `docs/PREFERENCE_LOG.md`.

### 2026-08-02 (same day, follow-up 4) — Review-form spacing (correctly diagnosed this time), place-marker click zoom, Events section opened up to every place type

Handled directly in the main loop (subagent types still unavailable this session).

**Review-form whitespace, actually root-caused after a wrong first guess.** The user had originally reported "too much white space" above the star row; on re-reading the screenshot description, they clarified it was actually between the stars and the review-text field. Spent a long unproductive stretch verifying the height-animation measurement logic (already correct, already fixed in an earlier session) before the clarification arrived — worth remembering: when a spacing complaint doesn't add up against the actual CSS gap values, ask exactly where before re-deriving the whole animation pipeline again. Actual cause: `.rv-rating-label` (`src/styles/styles.css`) reserves a fixed `min-height: 20px` even when empty (no star selected yet) — stacked with `.rv-form`'s own `gap` above and below it, an empty rating label reads as a much bigger dead zone than 20px alone would suggest. Fixed with a plain `.rv-rating-label:empty { min-height: 0; }` — collapses only while blank; once a rating is picked and the label has real text, the original reserved height still applies normally.

**Regular place-marker clicks now zoom/center too, at a deliberately smaller scale than dropped pins.** Custom/searched-location pins already zoom hard on click (`src/search.js`'s `_openPinPopup()` floors at zoom 15 unconditionally via `map.flyTo`) — regular directory place markers (`places-unclustered` layer click, `src/places.js`) previously did nothing but open the sheet, no map movement at all. Per the user's explicit ask ("center the pin and zoom in slightly to separate it out from the other pins"), added a modest relative bump instead of mirroring the pin's fixed floor — new named constants `PLACE_CLICK_ZOOM_BUMP = 1` / `PLACE_CLICK_MAX_ZOOM = 17`, applied via `map.easeTo` (not `flyTo` — the gentler, non-swoopy pan/zoom already used elsewhere for subtle recentering, e.g. `directions.js`'s mid-route centering) rather than the dramatic fly-through-space animation, since this fires on every single place click and shouldn't feel like the same big event as opening a rare dropped pin.

**Events can now be added at any place, not just mosques — closes the gap between the already-generalized Events *data model* (Phase-era work, `docs/ACCOUNTS_AND_REDESIGN_PLAN.md`'s Events Model section: any place_id, OSM result, or custom Gmaps-link location was already supported server-side) and the UI, which still only surfaced the "add event" entry point on mosques.**
- `src/places.js`'s `openPlaceSheet()`: removed the `place.type === "mosque"` gate on the Events section entirely — it's now unconditional, same "always visible even at zero" precedent the top-level `#events-pill` already follows (empty state already reads fine generically: "No events yet").
- `openEventOverlay()` exported (was module-private) and extended with a third `presetLocation: {name, address, lat, lng}` parameter — a brand-new-event equivalent of the existing edit-mode "geocoded" branch (which already handled pre-filling from an OSM/Digitransit result's raw lat/lng, no place_id required). This is what makes custom pins and unsaved search results able to host an event without ever having a directory `place_id`.
- New "Submit an event here" button in `src/search.js`'s shared `_openPinPopup()` (covers both "Dropped Pin" and "Searched Location" popup kinds at once, since they already share this one builder) — calls the newly-exported `openEventOverlay(null, null, {name, address, lat, lng})` using the popup's own resolved address/coordinates. No circular-import risk: `search.js` already depended on `places.js` one-way (for `placesData`/`openPlaceSheet`), so adding `openEventOverlay` to that same import is safe.
- New `.pp-add-event-btn` aliased onto the existing `.btn-secondary` template (same as `.pp-home-btn`/`.pp-share-btn`/`.pp-edit-btn`) in both `design-tokens.css` (base template + hover) and `styles.css` (`.pp-actions` flex-sizing rule) — component-alias pattern, no new one-off styling invented. Reuses the exact calendar icon already used for the Events-section header, for visual consistency.

**Files modified:** `src/places.js`, `src/search.js`, `src/styles/styles.css`, `src/styles/design-tokens.css`, `docs/PREFERENCE_LOG.md`.

### 2026-08-02 (same day, follow-up 5) — Review-form spacing (round 2, more thorough), the *real* marker-click zoom bug, event-only map markers

Handled directly in the main loop (subagent types still unavailable this session).

**Review-form spacing — round 2.** The user's follow-up: still too much space between stars and the text field, and "overall too much empty space." Root cause this time was compounding, not singular: (1) `.rv-rating-label:empty { min-height: 0 }` (the previous fix) still left `.rv-form`'s own `gap` applying on *both sides* of the now-zero-height-but-still-present flex item — changed to `display: none` instead, which removes it from flex participation entirely, eliminating both surrounding gaps, not just its own reserved height; (2) `.rv-form`'s gap tightened `--sp-5` (12px) → `--sp-3` (8px), compounding across all 5 sections; (3) `.rv-star-input`'s own padding tightened `--sp-3 0` (8px) → `--sp-1 0` (4px) — redundant on top of `.rv-star-btn`'s own 44px touch-target sizing, which was *not* touched (accessibility-mandated per this app's own Responsive Discipline rule, not incidental bloat).

**Marker-click zoom — first attempt silently touched the wrong code path.** Confirmed via the `CLUSTER_ZOOM` comment: individual places render as full HTML `maplibregl.Marker` elements at normal zoom (their own `el.addEventListener("click", ...)`  in `addPlaceMarkers()`'s `filtered.forEach()` loop) — the GeoJSON `places-unclustered` *layer* click handler (`map.on("click", "places-unclustered", ...)`) only fires for the sparser low-zoom clustered rendering path. The earlier session's fix only touched the GeoJSON layer handler, which is barely ever hit in normal use — the actual everyday click path had zero changes, hence "not working." Applied the identical `easeTo` fix to the real HTML-marker click handler too; both paths are now consistent.

**Custom-location event popup vs. mosque event section — discussed, not changed.** The user asked directly whether having a single button (custom pins/searched locations) vs. a full section (regular places) is a good idea. Recommended keeping the asymmetry: a place-detail sheet is a large persistent surface suited to a header+list+empty-state; a map popup is small and transient, and ad-hoc locations rarely accumulate a *history* of events worth browsing — the realistic use case is "add the one thing happening here," not "browse this coordinate's event history." The actual underlying concern (an ad-hoc location that already has an event should surface that, not just offer to add one) is what the new event-only marker below solves instead of restructuring the popup.

**New feature: event-only map markers for events at non-directory locations** (e.g. a rented hall for a one-off event) — decided via two confirmed choices: clicking jumps into the existing `#events-overlay` (`_openEventsOverlayToEvent()`, already built for this exact "scroll to and highlight one event's card" purpose — reused as-is, no new popup UI), and the marker gets its own distinct look rather than reusing the dropped-pin style.
- New `addEventOnlyMarkers()` in `src/places.js`: filters `eventsData` for entries with no matching `placesData` entry (`!ev.placeId || !directoryIds.has(ev.placeId)`) and a resolved `lat`/`lng`, further filtered through the already-existing `_nextEventDate(ev) !== null` check (already used elsewhere for "is this event's next occurrence still upcoming," handles one-time and recurring alike) — so a past one-time event's marker just stops appearing on the next refresh (page load or any `eventsData` update), no separate live/midnight timer needed, matching the user's "once the event is done, the marker would also go away" ask for free.
- Wired into both `eventsData = data.events` assignment sites (the only two places it's ever set) — `addPlaceMarkers()` itself wasn't the right hook, since events can refresh independently of place data changing.
- New `.event-mk`/`.event-mk-wrap`/`.event-mk-tip` classes, aliased onto the shared puck-marker template (`.puck-mk, .place-mk, ..., .eid-mk` in `design-tokens.css`) and given the same gold (`var(--gold)`) treatment the Eid-prayer markers already use — reused deliberately, since both represent the same "temporary, date-bound, non-directory-place" marker category; not a new one-off color.
- Follows the same "always visible regardless of zoom, not part of the GeoJSON cluster source" precedent already established for saved custom pins.

**Files modified:** `src/places.js`, `src/styles/styles.css`, `src/styles/design-tokens.css`, `docs/PREFERENCE_LOG.md`.

### 2026-08-02 (same day, follow-up 6) — Place-marker zoom compounded on every click; fixed to a floor, matching this app's own established pattern

The just-added place-marker click zoom used a *relative* bump (`Math.min(currentZoom + 1, 17)`) instead of a fixed floor — clicking through several places in a row kept zooming in further each time (click place 1 → zoom in, click place 2 → zoom in again on top of that, ad infinitum toward the 17 cap) instead of stabilizing. Replaced with the exact `Math.max(currentZoom, floor)` pattern this app already uses everywhere else for "click to focus a point" (dropped/searched pins, home, search results — all floor at zoom 15 in `src/search.js`/`src/map-controls.js`): `PLACE_CLICK_ZOOM = 15`, applied via `Math.max(map.getZoom(), PLACE_CLICK_ZOOM)`. Once the map is already at or past that zoom, clicking a place now just pans/recenters — it never zooms in further, matching the user's explicit "standard zoom limit, once we're there it no longer zooms in, just pans" ask.

**Files modified:** `src/places.js`, `docs/PREFERENCE_LOG.md`.

### 2026-08-02 (same day, follow-up 7) — Zoom floor lowered, Menu icon swapped, Privacy reachable from Support row, Google/Microsoft profile photo sync

Handled directly in the main loop (subagent types still unavailable this session).

- **`PLACE_CLICK_ZOOM` lowered 15 → 14** — direct user feedback that 15 zoomed in too much. One-line tune, same `Math.max(currentZoom, floor)` mechanism from the previous fix, easy to nudge further either way.
- **`#menu-pill`'s icon changed from a hamburger (three lines) to a 2×2 grid** (`index.html`) — the user disliked the hamburger glyph specifically; asked for a grid/app-launcher style icon. Kept the same outline-stroke convention as every other icon in this app (not filled dots, which would've been visually inconsistent with the rest of the icon set).
- **"Privacy" added to the Support row**, alongside Contact us/Wishlist (`index.html`'s `.menu-row-pair`, `src/app.js`). Reuses the already-fully-built `#privacy-overlay` (previously only reachable via a small footer link) — same trivial `overlay.classList.remove("hide")` open pattern already used for Contact/Wishlist, no new overlay built. `.menu-row-pair`'s flex layout needed no changes to accommodate a third item.
- **"Your reviews" empty-state spacing — looked at it, concluded it's not actually over-padded.** The user asked whether it takes too much space and invited a redesign if so. Checked `.menu-placeholder` (6px/14px padding), `.menu-reviews-label` (6px margin-top), `.rv-list` (0 gap) — all modest, consistent with the rest of this app's spacing scale, not the kind of double-counted/reserved-space bug found earlier in the review form. Concluded the perceived gap is just natural end-of-content whitespace (nothing else follows "Your reviews" in the Account panel) rather than a real padding bug, and said so instead of redesigning something that wasn't actually broken.
- **Google/Microsoft profile photo sync — Google done, Microsoft confirmed not possible without much more work.** Verified directly against Firebase's own docs before implementing anything: Google supplies `user.photoURL` automatically; Microsoft does not — Firebase's exact wording, "Microsoft does not provide a photo URL," instead requiring a separate authenticated Microsoft Graph API call (`graph.microsoft.com/v1.0/me/photo/$value`) with additional scopes, which is out of scope for what was asked and not attempted. Implemented for Google: `_cacheAccount()` (`src/auth.js`) now captures `photoURL`; `_buildSignedInHTML()` (`src/menu.js`) renders an `<img class="menu-account-avatar">` when present, falling back to the existing initial-letter avatar for Microsoft/magic-link accounts (which never have one). Added `https://lh3.googleusercontent.com` to `_headers`' CSP `img-src` (Google's profile-photo CDN) and `object-fit: cover` to `.menu-account-avatar` so the photo fills the same 36px circle without distortion — harmless no-op on the existing div/initial-letter fallback, since `object-fit` only affects replaced elements.

**Files modified:** `src/places.js`, `index.html`, `src/app.js`, `src/auth.js`, `src/menu.js`, `src/styles/styles.css`, `_headers`, `docs/PREFERENCE_LOG.md`.

### 2026-08-02 (same day, follow-up 8) — Microsoft profile photo, implemented after confirming it's free

The user asked whether the Microsoft Graph photo fetch (flagged as unimplemented in the entry above) is free, and to build it if so — verified both the cost question and a real architectural constraint before writing any code, rather than assume either.

**Cost, confirmed via research (not assumed):** `/me/photo` is a standard, non-metered Graph endpoint — free for any signed-in user regardless of Microsoft 365 licensing tier, gated only by user consent, not by per-call billing. Also checked whether this even works for *personal* Microsoft accounts (the user's own account is `@outlook.com`, not work/school) — Microsoft's official "Users you can reach with Microsoft Graph" doc confirms personal accounts get consented profile access same as organizational ones, so this isn't work/school-only.

**Real constraint that shapes the implementation:** the Microsoft OAuth access token needed to call Graph is only available in the instant right after an *interactive* `signInWithPopup()` call — Firebase does not persist it, and it cannot be re-derived on a later silent session restore (`onAuthStateChanged` firing on page load only gives a Firebase ID token, never the original provider access token). So the photo can only ever be fetched once, at the moment of a fresh Microsoft sign-in — not re-fetched on every visit. Solved by converting the fetched photo to a `data:` URL (via `FileReader.readAsDataURL`) and caching *that* in `hf_account`/localStorage permanently, rather than a `blob:` URL (which would be silently invalidated on the very next page reload).

**Implementation (`src/auth.js`):**
- `_microsoftProvider.addScope("User.Read")` — Firebase's default Microsoft sign-in doesn't request this scope, and without it the Graph call is rejected even after the user has already consented to sign in.
- `signInWithMicrosoft()` extracts the provider's access token via `OAuthProvider.credentialFromResult(cred)` and fires `_fetchAndCacheMicrosoftPhoto(accessToken)` as fire-and-forget (never awaited) — sign-in itself must succeed/return regardless of whether the photo fetch works, since plenty of Microsoft accounts (especially personal ones) simply have no photo set, which is an expected silent no-op (`res.ok` check), not an error.
- New `_mergeCachedPhoto()` reads whatever account is currently cached (a safe no-op if the user has since signed out) and re-emits `EVT.AUTH_CHANGED` once the photo is ready, so `src/menu.js`'s existing listener re-renders the avatar automatically — no menu.js changes needed, it already listens for exactly this event and already renders `account.photoURL` when present (from the Google-photo work in the previous entry).
- CSP `connect-src` gains `https://graph.microsoft.com` (`_headers`) — the only header change needed; `img-src` didn't need a Microsoft domain added since the photo is now a `data:` URL, not a remote image reference.

**Files modified:** `src/auth.js`, `_headers`, `docs/PREFERENCE_LOG.md`.

### 2026-08-02 (same day, follow-up 9) — A real self-inflicted markup bug, and the privacy policy brought up to date for Firebase auth

**Bug: a stray, dangling `<span>Wishlist</span></button>` in `index.html`, left over from adding the Privacy button to the Support row a few turns back.** The earlier edit's `old_string` match ended right after the Wishlist button's `</svg>`, not including its own trailing `<span>Wishlist</span></button>` — my `new_string` then added a *complete* new Wishlist button (icon + label + closing tag) followed by the new Privacy button, but the *original* trailing `<span>Wishlist</span></button>` that followed the matched region was never consumed, so it stayed in the file as an orphaned, unstyled fragment rendering outside any button — exactly the "plain black Wishlist text floating far to the right" the user spotted. A same-session grep check at the time (counting `wish-pill`/`menu-privacy-pill` ID occurrences) wasn't enough to catch it, since the dangling fragment had no id of its own to count — worth remembering: after any edit that inserts new closing tags near existing ones, check for orphaned fragments by reading the actual surrounding lines, not just grepping for unique IDs.

**Privacy policy updated to describe the current Firebase-based auth, with no mention of the retired OTP flow** (per the explicit ask — "no need to mention the old one, just mention the current auth, and what we store"):
- §2 "Ratings & reviews" rewritten as "Signing in, ratings & reviews": describes signing in via Google, Microsoft, or an email link (Firebase Authentication) to write reviews or sync saved places, and states plainly that only a one-way hash of the verified email is stored, never the email itself. The OTP-specific sentence about temporarily storing "email hash, one-time code, hashed IP, timestamp, and attempt count" was removed outright rather than reworded, since that mechanism no longer exists for new sign-ins.
- §3 "What We Don't Do" — the old "review emails are used only for verification" bullet replaced with the accurate hash-only claim.
- §6 "Third-Party Services" — added a Firebase Authentication entry, linking Google's and (conditionally) Microsoft's own privacy policies, since those are the actual identity providers now handling the sign-in redirect.
- §7 "Data Storage & Security" — rewritten to state Firebase handles sign-in and this app never receives/stores a password, and that the email-hash-only claim applies to both reviews and synced saved places (not just reviews, since Phase 8 added favourites/pins/home sync after this section was last written).
- "Last updated" bumped May 2026 → August 2026.

**Files modified:** `index.html`, `docs/PREFERENCE_LOG.md`.

### 2026-08-02 (same day, follow-up 10) — Privacy policy quick corrections

Two direct wording fixes, per the user's explicit instructions:
- "We never store your plaintext email address for reviews or account sync — only a one-way hash..." → made more assertive per the user's clarification that reviews only ever get the hash and no plaintext email data remains from any prior method: "We do not store your email address for reviews or account sync — only a one-way hash... No plaintext email data is retained from any review." Deliberately no mention of any prior/legacy method by name, per the ask.
- Removed every "or an email link" mention from the privacy policy (the §2 sign-in description, the Firebase Authentication third-party entry, and the §7 Data Storage sentence) — the user confirmed email-link sign-in is not currently available (matches the earlier Firebase Spark-plan quota decision to hide that button), so the policy now only names Google and Microsoft, the two sign-in methods actually offered right now.

**Files modified:** `index.html`, `docs/PREFERENCE_LOG.md`.
