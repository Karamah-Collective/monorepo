# Commit Message Conventions

This document defines commit message standards for Halal Finder to maintain a clean, readable git history and enable automated tooling (changelog generation, CI/CD parsing, etc.).

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

Required. Must be **lowercase** and one of:

| Type | Use Case | Example |
|------|----------|---------|
| `feat` | New feature or user-facing improvement | `feat: add transit stop adaptive radius` |
| `fix` | Bug fix | `fix: prevent double-tap zoom breaking follow mode` |
| `refactor` | Code restructuring (no feat/fix) | `refactor: extract _bearing() to module level` |
| `perf` | Performance improvement | `perf: cache bearing calculations` |
| `docs` | Documentation changes | `docs: add navigation camera API guide` |
| `style` | Code style, formatting (no logic) | `style: normalize section headers` |
| `test` | Test additions/fixes | `test: add 05-animations e2e coverage` |
| `chore` | Maintenance, deps, tooling (no user impact) | `chore: update Playwright to v1.50` |
| `ci` | CI/deployment/versioning/release | `ci(release): v20260414-2 (places + nav)` |
| `sec` | Security fixes | `sec: add CSP header for new CDN source` |

### Scope (optional)

Parentheses. Narrows the type to a component or area:
- `ci(release)`, `ci(deploy)`
- `feat(navigation)`, `feat(search)`
- `fix(transit)`, `fix(auth)`

### Subject

- **Imperative mood**: "add", not "adds" or "added"
- **Lowercase** (except proper nouns: Maps, Finland)
- **No period** at end
- **≤50 characters** (enforced by pre-commit hook in future)
- Clear, concise description of what the commit *does*, not why

### Body (optional)

After a blank line. Use for:
- Why the change was needed (motivation)
- What alternatives were considered
- Any breaking changes (start with `BREAKING CHANGE:`)

Example:
```
This commit refactors the auto-zoom algorithm to be geometry-driven instead of
step-timing-driven. Previously zoom bounced unpredictably when navigation steps
fired at irregular intervals. The new algorithm scans the route polyline ahead
for bearing changes (≥35°), making zoom smooth and predictable.

See docs/PREFERENCE_LOG.md for full rationale.
```

### Footer (optional)

Reference related issues/PRs:
```
Closes #123
Relates to #456
```

## Commit Type Classification

### NOT a Chore

- Version bumps paired with data refreshes (`ci(release)`)
- Disabling features for deployment (`ci(release)`)
- Branch promotions for production (`ci(deploy)`)
- Releasing new algorithmic features (use `feat`)

### IS a Chore

- Dependency updates (`chore: update Playwright to v1.50`)
- Code cleanup with zero user impact (`chore: remove dead _programmaticMove flag`)
- Tooling setup (`chore: add .editorconfig`)

## Examples

### Good Commits

```
feat(navigation): add 3D tilted perspective view per travel mode

- Drive 55°, walk 45°, cycle 50°, transit 35°
- GPS offset responsive to viewport height (0.2 × vh)
- Smooth 1200ms tilt animation on nav start
```

```
fix(map-controls): skip auto-3D during navigation

Extruded building geometry obstructs the tilted forward-looking view during
turn-by-turn navigation. Add nav-mode guard to pitchend listener to prevent
re-enabling 3D after navigation tilts the map.
```

```
ci(release): v20260414-2 (places refresh + nav improvements)

- VERSION: 20260414 → 20260414-2 (cache-busting)
- PLACES: 139 entries, 6 tags, 16 eid prayers (refreshed from Sheets)
- GPS SIM: disabled for production
- NAV: geometry-driven zoom, 3D building state management
```

```
ci(deploy): promote v20260414-2 to production

Cloudflare Pages will now build and deploy to the main domain.
```

### Bad Commits

```
chore: bump version and stuff
```
❌ Too vague; should be `ci(release):`; body missing

```
chore: update places
```
❌ Unclear what changed; should be `ci(release):` with detailed body

```
chore: fix navigation zoom
```
❌ This is a `fix`, not `chore`

## Pre-Commit Hook (Future)

When automated tooling is added:
- Length checks (subject ≤50 chars)
- Type validation (only allowed types)
- Scope format validation
- Imperative mood linting (optional)

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Angular Commit Message Guidelines](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#-commit-message-guidelines)
- [Project PREFERENCE_LOG.md](PREFERENCE_LOG.md) — decisions on navigation, zoom, etc.
