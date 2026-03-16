---
description: "Review all staged or recently changed files for design system compliance, architecture constraints, security, accessibility, performance, and code quality before committing."
mode: agent
---

You are running a **Pre-Commit Review** for the Halal Finder project.

## Steps

1. Read `docs/PREFERENCE_LOG.md` to understand the user's established patterns and preferences.
2. Identify which files have been changed (check git status or ask the user).
3. For each changed file, review against ALL applicable categories below.

---

### Design System Compliance
- All colours, sizes, radii, shadows, transitions use `--token` values
- Template classes used instead of ad-hoc styling
- New templates documented in `docs/DESIGN_SYSTEM.md`
- `styles.css` only has layout/position — no visual design leaks
- Component aliases used where applicable (no duplicate style blocks)

### Architecture Constraints
- No bundler, framework, or SSR patterns introduced
- No new runtime npm dependencies (zero deps policy)
- Cloudflare Functions use V8 Web APIs only — no Node.js builtins (`fs`, `path`, `process`, `Buffer`, `require`)
- Client JS never queries Google Sheets directly — always through `/api/` proxy
- Non-critical modules lazy-loaded after `map.on("load")`
- Service worker `VERSION` and `index.html` `?v=` param stay in sync if changed

### Security
- `esc()` used for all user-supplied text in JS HTML generation
- No secrets (API keys, tokens) in client-side code
- CORS: `allowedOrigin()` on all new/changed API responses
- CSP in `_headers` updated if new external resource added
- Input validation: server-side is authoritative, max lengths enforced
- Error responses don't leak internals (no stack traces, no upstream URLs)
- `Sec-Fetch-Site` check intact for protected paths

### Accessibility
- Interactive elements have sufficient contrast
- Touch targets ≥ 44px on mobile
- Focusable elements have visible focus styles
- Images/icons have `aria-label` or `aria-hidden="true"`

### Performance
- CSS animations use `transform`/`opacity` (GPU-composited), not `top`/`left`/`width`
- No unnecessary reflows (no read-then-write layout in same frame)
- No heavy CSS selectors (deeply nested, universal `*` in mid-chain)
- New fetch calls respect existing caching strategy
- Cloudflare Function logic stays within 10 ms CPU budget

### Code Quality
- `.join("")` used for Array.map HTML building
- No console.log left in production code
- Event listeners cleaned up if components are destroyed
- No floating promises (async errors handled)

---

## Output Format

```
# Pre-Commit Review

## Files Reviewed
- [list]

## Issues Found
### 🔴 Must Fix (blocks commit)
- [file:line] issue

### 🟡 Should Fix (quality concern)
- [file:line] issue

### 💡 Suggestions (optional improvement)
- [file:line] suggestion

## Constraint Check
- [ ] Static site — no bundler/SSR introduced
- [ ] Zero runtime deps — no new packages
- [ ] CF free tier — functions stay lightweight
- [ ] Security — CSP/CORS/esc() intact

## Preference Check
- [any new preferences detected → will be logged to PREFERENCE_LOG.md]

## Verdict: ✅ Ready / ⚠️ Fix required
```
