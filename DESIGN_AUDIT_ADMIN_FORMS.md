# Admin and Forms quick design audit

Date: 2026-10-04

Scope: Admin workspace and public Forms application

Method: static implementation audit against `DESIGN_SYSTEM.md`, `Admin/DESIGN.md`, shared tokens, and responsive CSS. Browser automation was intentionally excluded.

## Audit health score

| Dimension | Score | Key finding |
| --- | ---: | --- |
| Accessibility | 3/4 | Several recently added controls fall below the established 40–44 px interaction target. |
| Performance and motion | 3/4 | Motion is generally GPU-safe, but Forms layers multiple entrance animations and Admin animates a layout-driven grid track. |
| Responsive design | 3/4 | Core layouts reflow well; dense Access and editor toolbars need clearer phone sizing and wrapping. |
| Theming | 3/4 | Token use is strong, with a few hard-coded presentation surfaces that become visually harsh in dark mode. |
| Anti-patterns and consistency | 3/4 | The visual direction is coherent, but late cascade overrides have created inconsistent spacing and control dimensions. |
| **Total** | **15/20** | **Good; a focused consistency pass is warranted.** |

## Documented findings

### P1 · Cover images can render with distorted proportions

- **Location:** `Forms/styles.css`, public form card artwork.
- **Impact:** `width:100%`, `height:auto`, and a limiting `max-height` can conflict, compressing tall source images instead of cropping them proportionally.
- **Fix:** Give the artwork a bounded responsive height and use `object-fit:cover` so the source aspect ratio is preserved without making cards oversized.

### P1 · Some new interactive targets are too small

- **Location:** `Admin/src/styles/access.css` and `Admin/src/styles/forms.css`.
- **Impact:** Access edit controls, permission choices, and the rich-text toolbar are harder to operate on touch screens and visually misalign with Admin’s shared control height.
- **Fix:** Normalize compact desktop controls and raise phone targets to at least 40–44 px while retaining Admin’s dense desktop character.

### P1 · QR finder corners ignore logo-overlap compositing

- **Location:** `Admin/src/pages/QrGeneratorPage.jsx`, QR composition pass.
- **Impact:** Body modules crossing the logo adopt the overlap palette, while the three finder frames and centers remain above the logo in their original color. This makes the logo integration visibly inconsistent, especially at large logo sizes.
- **Fix:** Run finder pixels through the same foreground/background classification, overlap color, and opacity blend as every other QR module. Scanner validation remains the final safety gate.

### P2 · Access page spacing is governed by overlapping generations of rules

- **Location:** `Admin/src/styles/access.css`.
- **Impact:** Multiple role-builder and page-level overrides produce uneven horizontal padding, repeated selector corrections, and fragile tablet behavior.
- **Fix:** Add one final, explicit rhythm layer using the existing settings spacing tokens, aligned section insets, and predictable breakpoint changes.

### P2 · Motion is layered more heavily than the task requires

- **Location:** `Forms/styles.css`, form shell, section, question blocks, and catalogue cards; `Admin/src/styles/access.css`, navigation groups.
- **Impact:** Nested entrance animations make Forms feel slower and can cause visual movement after content is already usable. The Admin navigation expands by animating `grid-template-rows`, a layout property.
- **Fix:** Keep one entrance per meaningful surface, remove per-question and per-card choreography, and restrict the navigation transition to opacity.

### P2 · Interaction transitions do not share one timing vocabulary

- **Location:** `Forms/styles.css` and recent Admin feature styles.
- **Impact:** Some controls use unnamed CSS easing while others use the shared exponential curve, making adjacent interactions feel subtly inconsistent.
- **Fix:** Standardize state feedback to approximately 160–200 ms with the existing `--ease` token and transform/opacity-only movement.

### P2 · QR preview surround is visually disconnected in dark mode

- **Location:** `Admin/src/styles/links.css`.
- **Impact:** A permanently white outer preview frame creates a large glare block even when the QR canvas itself uses another approved background.
- **Fix:** Use the themed inset surface for the preview surround while leaving the generated QR canvas colors untouched.

### P3 · Mobile headers and action groups need more deterministic alignment

- **Location:** `Admin/src/styles/forms.css` and `Forms/styles.css`.
- **Impact:** Wrapped controls can inherit desktop alignment, leaving uneven action widths or compressed labels at narrow widths.
- **Fix:** Make phone action groups full-width where appropriate, keep labels readable, and preserve consistent vertical gaps.

## Positive findings

- Both applications already use a coherent brand palette and appropriate light/dark theme inversion.
- Forms has a complete reduced-motion override and strong responsive form-control sizing.
- Admin uses shared typography, border, radius, focus, and semantic-state tokens consistently.
- Public Forms preserves readable line lengths and uses clear question hierarchy rather than decorative card stacking.
- Loading, empty, error, pending, and success states are present across the primary workflows.

## Correction plan

1. Make QR finder corners obey the same logo-overlap composition rules as body modules.
2. Normalize recent Admin spacing and interaction dimensions.
3. Consolidate Access page rhythm at desktop, tablet, and phone breakpoints.
4. Simplify Forms entrance motion and standardize easing.
5. Correct proportional public cover rendering and compact card composition.
6. Theme the QR preview surround and complete reduced-motion coverage for the recently added Admin surfaces.
