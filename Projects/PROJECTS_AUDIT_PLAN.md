# Projects audit and shipping plan

Status: complete for the requested interaction/build audit; typing follow-up recorded

This audit covers the project workspace interaction surface and production
readiness. The goal is to remove real defects and unnecessary compatibility
code without flattening healthy route, domain, or test boundaries.

## Loop 1 - baseline

- [x] Inventory scripts, routes, source-file counts, and known warnings.
- [x] Reproduce board drag/drop failures with focused tests and browser smoke.
- [x] Inspect the project view header and calendar overflow at desktop and 360px.
- [x] Inspect timeline controls and low-density date rendering.

## Loop 2 - interaction fixes

- [x] Make board drag/drop reliable for pointer, touch, keyboard, filtered lists,
      and column targets.
- [x] Keep the calendar handle visible and animate view changes in the top bar.
- [x] Move timeline navigation, today, and zoom controls into the timeline pane
      without leaving a redundant date-range toolbar.
- [x] Make low zoom use readable month/week density rather than cramped labels.
- [x] Normalize Admin assignee IDs and emails so people rows can resolve names.

## Loop 3 - code audit

- [x] Identify dead or duplicated code with repository search and build reachability.
- [x] Remove the unsupported API-key dependency and keep its settings screen absent.
- [x] Remove only proven-unused compatibility/dead files.
- [x] Keep small components separated where they isolate a route, domain behavior,
      accessibility state, or test boundary.
- [x] Keep an architecture note for intentionally modular areas.

The source tree is intentionally modular: 1,636 files under `src` (850 TypeScript
and 784 TSX) are route, domain, editor, UI, and test modules. Generated dependency
and build files are not source bloat and are excluded by the repository ignore
rules. No unsafe bulk merge was made just to reduce the file count.

## Loop 4 - validation evidence

- [x] Focused board, view-header, and client-normalization tests.
- [x] Complete Projects test suite: 295 files and 1,522 tests passed.
- [x] Production build: Vite completed successfully in 31.13 seconds.
- [x] Playwright smoke checks: 4 passed at desktop and mobile sizes.
- [x] Production bundle scan for local-only/test-only leakage and removed
      API-key features.
- [x] Production dependency audit: `npm audit --workspace Projects --omit=dev`
      reports zero vulnerabilities.
- [x] Review active external-import surfaces: no Jira/Linear import UI was found.
- [x] Record known non-blocking warnings and follow-up work below.

## Known non-blocking follow-up

- The production build reports a few chunks over 500 kB because the copied app
  includes the editor, language tooling, and Mermaid. It is a performance
  optimization opportunity, not a build failure. The next safe improvement is
  route-level lazy loading/manual chunking measured against real usage.
- The strict TypeScript check still reports 147 legacy adapter/router typing
  diagnostics across the copied app. The current compatibility client intentionally bridges
  the Admin API at runtime, while the generated Kaneo route/client types are not
  present. This is separate from the requested interaction fixes: production
  build, unit/integration tests, and Playwright smoke tests pass. It should be
  repaired in a dedicated typing pass rather than hidden with relaxed compiler
  settings.
- The full development dependency tree still reports audit findings during
  install; production dependencies are clean. Do not run `npm audit fix --force`
  as part of this UI fix because it can introduce unrelated breaking upgrades.
- The Playwright suite currently covers authenticated shell/no-overflow smoke
  paths. Full authenticated board/timeline screenshot coverage still requires
  a seeded browser session; the local `browser-use` CLI is not installed here.
- Existing persisted compatibility identifiers are retained where changing them
  would invalidate stored editor content or local user preferences. They are not
  rendered as product branding; visible labels use `Projects`.

## Guardrails

- Do not merge files solely to reduce a file count; preserve domain boundaries.
- Do not change the existing Projects interaction model while fixing layout bugs.
- Do not add local-testing affordances to the production UI.
