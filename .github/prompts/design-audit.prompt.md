---
description: "Run a full design and code consistency audit across all CSS, JS, and Cloudflare Functions. Reports token violations, template gaps, constraint breaches, security issues, and undocumented patterns."
mode: agent
---

You are running a **Full Project Audit** on the Halal Finder project.

## Steps

1. Read `docs/DESIGN_SYSTEM.md` for the full token and template reference.
2. Read `src/styles/design-tokens.css` for all current tokens and templates.
3. Read `src/styles/styles.css` and check for:
   - Hard-coded hex colours, px font sizes, px border-radii, literal box-shadows, or bare transition durations (should be `--token` refs)
   - Visual design rules that should be in a template class in `design-tokens.css`
   - Z-index values not using `--z-*` tokens
4. Scan all `src/**/*.js` files for:
   - Inline styles that duplicate what design tokens or template classes provide
   - `Array.map(...).join()` missing `.join("")` when building HTML
   - User text injected into HTML without `esc()`
   - console.log left in production code
   - Any runtime npm dependency usage
5. Scan `functions/**/*.js` for:
   - Node.js API usage (fs, path, process, Buffer, require)
   - Missing CORS headers (`allowedOrigin()`)
   - Missing input validation (type checks, length limits)
   - Error responses that leak internal details
   - Secrets/URLs hard-coded instead of using env vars
6. Check `_headers` for:
   - CSP completeness (are all external resources covered?)
   - Missing security headers
7. Check `sw.js` for:
   - VERSION synced with current deployment
   - All critical assets in pre-cache list
8. Cross-reference: tokens/templates in `design-tokens.css` vs `DESIGN_SYSTEM.md` — flag undocumented ones.

## Output Format

```
# Full Project Audit Report

## Design Token Violations
- [file:line] description

## Template Gaps
- [component] should use template X but doesn't

## Layout Leaks (visual rules in styles.css)
- [selector] has visual property that belongs in a template

## JS Markup Issues
- [file:line] inline style / missing esc() / missing .join("")

## Architecture Constraint Violations
- [file:line] description (e.g. Node.js API in CF function)

## Security Issues
- [file:line] description

## Documentation Gaps
- [token/template] exists in CSS but not in DESIGN_SYSTEM.md

## Summary
X issues found across Y files. Z are security-related.
```
