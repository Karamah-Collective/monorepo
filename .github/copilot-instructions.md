# Halal Finder — Copilot Instructions

## Project Overview

A map-based PWA for finding halal-certified places in Finland. Built with **vanilla JS, MapLibre GL, and Cloudflare Pages (free tier)**. No bundler, no framework, no runtime npm deps.

## Hard Constraints

- **Static site only.** No SSR, no build step, no bundler. ES modules via `<script type="module">`.
- **Cloudflare Pages free tier.** Functions in `functions/` run on Workers runtime (V8, not Node.js). 100 K invocations/day, 10 ms CPU.
- **Google Sheets as database.** Data served via Apps Script → `/api/places` proxy → client. Never query Sheets directly from client JS.
- **Zero runtime dependencies.** `devDependencies` (Playwright) are dev-only. No node_modules deployed.
- **Security hardened.** Full CSP + HSTS + CORS + SRI + `esc()` + `Sec-Fetch-Site` gating. See `_headers` and `functions/_middleware.js`.

## Architecture

| Path | Purpose |
|------|---------|
| `src/styles/design-tokens.css` | Single source of truth — all CSS tokens and reusable template classes |
| `src/styles/styles.css` | Component layout, positioning, and unique visual overrides only |
| `src/*.js` | Feature modules (search, places, directions, prayer, etc.) |
| `functions/api/*.js` | Cloudflare Pages Functions (proxy, submit, config) |
| `functions/_middleware.js` | Data protection + OG meta rewriting |
| `scripts/apps-script/Code.gs` | Google Apps Script (Sheet ↔ API bridge) |
| `sw.js` | Service worker (pre-cache + stale-while-revalidate) |
| `_headers` | Cloudflare security headers + CSP |
| `docs/DESIGN_SYSTEM.md` | Full design system reference — tokens, templates, usage rules |
| `docs/PREFERENCE_LOG.md` | Running log of user preferences and decisions — read at session start |

## Design System (always follow)

- **Tokens only** — no hard-coded colours, sizes, radii, shadows, or transitions. Use `--token` custom properties.
- **Template-first** — check `design-tokens.css` for existing template classes before writing visual CSS.
- **Separation** — `design-tokens.css` = visual design. `styles.css` = layout + position + overrides.
- **Alias pattern** — if a JS class looks like an existing template, add it to the template's selector list.
- **Z-index** — always use `--z-*` tokens.

## Code Conventions

- Vanilla JS, no framework. ES modules via `<script type="module">`.
- `esc()` from `src/utils.js` for all user text injected into HTML.
- `.join("")` when building HTML from `Array.map()`.
- Inline styles only for truly dynamic runtime values.
- Cloudflare Functions use V8 Web APIs only — no Node.js builtins.
- Lazy-load non-critical modules after `map.on("load")`.

## Security Checklist (every change)

- `esc()` all user input before HTML injection.
- Server-side validation is authoritative; client-side is UX.
- CORS: `allowedOrigin()` on all API responses.
- CSP: update `_headers` when adding new external resources.
- No secrets in client code. Use `config.local.js` (gitignored) or Cloudflare env vars.

## Before Committing

Use the `/pre-commit-review` prompt to validate changes against design system, accessibility, performance, security, and code quality.

## Preference Tracking

After any session where the user makes a design choice or expresses a preference, append it to `docs/PREFERENCE_LOG.md`. Future sessions should read this file first.
