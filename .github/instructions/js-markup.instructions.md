---
description: "Use when editing JavaScript files that generate HTML markup, DOM elements, popups, toasts, or any UI rendered from JS. Enforces design system compliance in dynamic content."
applyTo: "src/**/*.js"
---

# JS UI Markup Rules

## DOM Generation

1. **Use template CSS classes** from `design-tokens.css` — never inline styles for colours, fonts, radii, shadows, or spacing that the design system covers.
2. **Inline styles are only acceptable** for truly dynamic values: calculated positions, runtime dimensions, or data-driven transforms.
3. **`esc()` all user-supplied text** before injecting into HTML strings. The utility lives in `src/utils.js`.
4. **`.join("")`** when building HTML from `Array.map()` — commas between elements are a bug.

## Component Patterns

- Buttons → use `.btn-primary`, `.btn-secondary`, `.btn-roundel`, etc.
- Typography → use `.t-item-title`, `.t-item-sub`, `.t-caption`, etc.
- Snackbar/toasts → use `.snack`, `.snack-icon--success/error/clock/info`, `.snack-body`, `.snack-label`, `.snack-sub`.
- Chips/badges → use `.tag-chip` / `.sg-tag` with `data-state`.
- Scrollable areas → add to `.t-scroll` selector list in `design-tokens.css`.

## When Adding New UI

1. Check `docs/DESIGN_SYSTEM.md` for existing templates.
2. If nothing fits, define a new template in `design-tokens.css` first.
3. Document it in `docs/DESIGN_SYSTEM.md`.
4. Then use it in the JS file.
