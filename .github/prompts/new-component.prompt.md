---
description: "Scaffold a new UI component following the design system. Creates the template in design-tokens.css, layout in styles.css, documents it, and provides the JS/HTML usage snippet."
mode: agent
---

You are scaffolding a **new UI component** for the Halal Finder project.

The user will describe what they need. You will:

1. Read `docs/DESIGN_SYSTEM.md` to understand existing templates and naming conventions.
2. Read `src/styles/design-tokens.css` for current tokens and where to insert.
3. **Choose a name** following existing conventions:
   - Buttons: `.btn-<type>[-<variant>]`
   - Typography: `.t-<role>`
   - Pills: `.pill-<variant>`
   - Snacks: `.snack-<part>`
   - Other: `.component-<part>`
4. **Create the template** in `design-tokens.css`:
   - Use only `--token` values
   - Include hover/active/focus states with `@media (hover: hover)` guard
   - Include disabled state if applicable
5. **Add layout rules** in `styles.css` (position, margin, z-index, size constraints).
6. **Document** the new template in `docs/DESIGN_SYSTEM.md` under the appropriate section.
7. **Provide a usage snippet** — both static HTML and JS `createElement` patterns.
8. If the component is visually similar to an existing one, suggest using the alias pattern instead.

## Output

```
### New Component: .component-name

**Template added to:** design-tokens.css (line ~N)
**Layout added to:** styles.css (line ~N)
**Documented in:** DESIGN_SYSTEM.md § section

**HTML usage:**
<element class="component-name">...</element>

**JS usage:**
const el = document.createElement("div");
el.className = "component-name";
```
