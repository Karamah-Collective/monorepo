# Preference Log

The Architect reads this file at the start of every session to understand
what you like, what you've decided, and how you want things done.

---

## Preferences

> Long-lived style and development opinions that apply across the project.

### Visual / Design
- Rendering HTML with `Array.map()` into `innerHTML` must use `.join("")` — commas between elements are never acceptable.
- Design should feel flat and minimal — very subtle shadows only (`--shadow-sm/md/lg`).
- One primary CTA per screen/card. Secondary actions use outline or pill variants.
- Template-first: every visual pattern should exist as a reusable class in `design-tokens.css` before being used in `styles.css` or JS.

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

---

## Patterns to Avoid

> Things that were tried and rejected, or that the user has explicitly said "don't do."

<!-- Append new entries below this line -->

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
