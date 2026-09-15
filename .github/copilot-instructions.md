# Karamah Collective monorepo

Read the root README and DEPLOYMENT.md for current commands and project boundaries.

- `Maps/`: vanilla JavaScript/MapLibre PWA, Cloudflare Pages Functions, existing D1 database. Its frontend URLs remain `/src`, `/data`, `/api` on the Maps domain.
- `Website/`: static collective website, Pages Functions, Google Sheets via Apps Script. Keep Sheets as this application's source of truth.
- `Admin/`: React/Vite dashboard, authenticated requests to each application's API. Preserve the shared responsive design in Admin/DESIGN.md.
- `shared/`: server-side Firebase JWT verification shared by both APIs.
- `tooling/`: local servers and repository checks.

Use npm workspaces and the root package-lock.json. Install with `npm ci` at the repository root. Build with `npm run build`; validate layout with `npm run check`. Start everything with `npm run dev`. Pages builds from `Maps`, `Website` and `Admin`, each outputting `dist`.

## Design and code conventions

For Maps, read `Maps/docs/PREFERENCE_LOG.md` and `Maps/docs/DESIGN_SYSTEM.md`. Reuse tokens and templates in `Maps/src/styles/design-tokens.css`, use `Maps/src/styles/styles.css` for layout, and escape user content with `esc()` from `Maps/src/utils.js`.

For Admin, reuse the current shell, tokens, fields, tables, loading/error states and compact responsive layout. Keep keyboard navigation, reduced motion and unsaved-change protection intact.

Pages Functions use Workers Web APIs, not Node filesystem/process APIs. Browser code must never contain service secrets. Keep Maps configuration in its local ignored files / Cloudflare variables; Website keys belong in Website secrets and Apps Script properties. Check authorization server-side, validate all writes, and retain optimistic revision checks. Never expose private signups through a public route.

Keep production/preview database bindings distinct. Do not copy selected files into stripped deployment branches; deploy complete monorepo revisions. Do not push or change live deployments without task authorization. The older map-specific agent documents use repository-prefixed paths.
