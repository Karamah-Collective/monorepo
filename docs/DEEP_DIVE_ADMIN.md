# Deep dive: Karamah Admin

Admin is the internal control plane. It does not replace Maps, Website, Links, or Forms backends; it authenticates staff, presents workspaces, calls owner APIs, shows state clearly, and invalidates/refetches data after mutations.

## Shell and authentication

`main.jsx` loads React/Vite and global styles. `App.jsx` defines auth and authenticated routes. `layout/navigation.js` defines discoverable groups and permissions. Pages live in `src/pages`; reusable behavior in `src/components`; API/query clients in `src/api`; tokens and styles in `src/styles`.

AuthContext` and `AuthGuard` provide browser UX. Clients attach Firebase bearer tokens. Maps, Website, and Forms Functions verify tokens through `shared/firebase-verify.mjs`, then load current roles/resource ownership. Hidden navigation is not authorization, and `VITE_*` variables are browser-visible.

## Data and product workspaces

React Query manages cache keys, refetch, mutation invalidation, loading, empty, and error states. API modules own transport/error normalization; pages should not duplicate token or URL policy.

Maps owns places, submissions, events, reviews, settings, analytics, health, reports, and access. Website owns content/team/subscribers. Links owns hub settings/links. Forms owns editor/publishing/responses/exports/collaboration. Workspace owns profile/preferences/logs/reports/access.

Admin is dense and operational: reuse tokens, tables, status badges, dark mode, responsive layout, focus states, and confirmation patterns. Every mutation needs pending/failed/success feedback and server enforcement.

## Role-scoped MCP

The Admin MCP page at `/workspace/mcp` manages named OAuth connections. A
connection's selected grants are capped by the user's current role; an
administrator may explicitly choose `admin:*` to follow all current and future
capabilities. The consent route at `/mcp/authorize` is Firebase-backed and
shows the live permission set before issuing a one-time authorization code.

The remote endpoint is `/mcp` on the Admin domain. It uses Streamable HTTP and
registers typed tools from the shared action registry. Tools disappear from
`tools/list` and fail closed when a role is downgraded, even if their OAuth
connection remains active. Destructive or external-side-effect tools require
an exact, short-lived confirmation challenge. Administrators can revoke one
connection without affecting another.

## Test and release

Run `npm run build:admin` and `npm run test:admin`, plus affected owner API tests. Verify an authorized sign-in, changed workspace, safe mutation/read, loading/error state, and denied access. Cloudflare Pages serves Admin `dist`; Firebase authorized domains, public API origins, and owner services must match production.
