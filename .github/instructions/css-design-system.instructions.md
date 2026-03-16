---
description: "Use when editing or creating CSS files. Enforces design token usage, template-first patterns, and styles.css vs design-tokens.css separation."
applyTo: "src/styles/**/*.css"
---

# CSS Editing Rules

## File Responsibilities

| File | What goes here |
|------|----------------|
| `src/styles/design-tokens.css` | All tokens (`:root` custom properties), all template classes (`.btn-*`, `.t-*`, `.snack-*`, `.pill-*`, `.tag-chip`, etc.), component alias selectors, resets, font-face |
| `src/styles/styles.css` | Layout, positioning, z-index, margins, flex contexts, and **only** visual overrides that intentionally diverge from a template for a specific component |

## Mandatory Practices

1. **Tokens only** — never write a bare hex colour, `px` font-size, `px` border-radius, box-shadow literal, or transition duration. Use `--token` values.
2. **Check templates first** — before adding visual rules in `styles.css`, search `design-tokens.css` for an existing template class.
3. **New templates go in tokens** — if you need a new visual pattern, create a template class in `design-tokens.css` and document it in `docs/DESIGN_SYSTEM.md`.
4. **Alias, don't duplicate** — if a component class looks identical to a template, add it to the template's selector list.
5. **Z-index: `--z-*` tokens only.**
6. **Transitions: `--t-fast`, `--t-med`, `--t-spring` only.** Create a new `--t-*` token if genuinely needed.
7. **Breakpoints: `380px`, `768px`, `769px` only.** Don't invent new ones.
8. **Spacing: `--sp-*` tokens only.**
