# Halal Finder — Design System

## Overview

The design system is split across two CSS files with strict separation of concerns:

| File | Responsibility |
|---|---|
| `src/styles/design-tokens.css` | Single source of truth — all tokens (colours, radii, shadows, spacing, type scale, transitions) and every reusable template class |
| `src/styles/styles.css` | Component layout, positioning, and unique visual overrides that differ from a template |

`styles.css` imports `design-tokens.css` via `@import`. Everything that can be expressed as a template lives only in `design-tokens.css`.

---

## Rules

1. **Never hard-code a hex colour or pixel value** inside a component rule. Use a `--token`.
2. **Template-first.** Before writing any visual CSS in `styles.css`, check whether a template class already covers it. If not, add a new template to `design-tokens.css` first.
3. **Templates own visual design only** — colour, typography, border, shadow, interaction states, internal spacing/padding. Layout and positioning (`position`, `top/right/bottom/left`, `z-index`, `flex-grow`, margins that affect surrounding elements) live in `styles.css`.
4. **Component aliases** — when a JS-generated or legacy class is visually identical to a template, add it as an extra selector on the template rule in `design-tokens.css` rather than duplicating the block in `styles.css`.
5. **One CTA per screen / card.** Only one `.btn-primary` should be visible at a time. Use `.btn-secondary` or `.btn-success-pill` for accompanying actions.

---

## How to add a new component

1. Pick the matching template class (see tables below).
2. Add it to the element in `index.html` (or in the JS string that builds the markup).
3. In `styles.css` add a rule **only** for layout / unique visual overrides.
4. If no template fits, define one in `design-tokens.css` first, document it in this file, then reference it.

---

## §1 — Design Tokens

All tokens are CSS custom properties on `:root`.

### Brand palette

| Token | Value | Usage |
|---|---|---|
| `--accent` | `#1A73B8` | Primary blue — interactive elements, active states |
| `--accent-soft` | `#e8f1f8` | Blue tint surface, soft backgrounds |
| `--accent-muted` | `#6da8d2` | De-emphasised blue, pulse animations |
| `--gold` | `#D8B56A` | Prayer / current-time highlight |
| `--gold-soft` | `#faf5eb` | Gold tint surface |
| `--success` | `#1FA86A` | Green — mosques, confirmed features |
| `--success-soft` | `#e8f6ee` | Green tint surface |
| `--danger` | `#d64545` | Red — errors, destructive actions |
| `--danger-vivid` | `#c62828` | Red hover/active — prominent danger state |
| `--danger-soft` | `#fce8e8` | Red tint surface |

### Transit colours

Used for leg badges and route chips. Match HSL operator brand colours exactly.
All transit tokens have brighter dark-mode overrides in `styles.css` for contrast against `--surface`.

| Token | Light | Dark | Line type |
|---|---|---|---|
| `--hsl-bus` | `#1A73B8` | `#4da8e8` | Bus |
| `--hsl-trunk` | `#FF6319` | `#ff8a50` | Trunk / Metro |
| `--hsl-tram` | `#1FA86A` | `#3ee09a` | Tram |
| `--hsl-metro` | `#FF6319` | `#ff8a50` | Metro |
| `--hsl-rail` | `#8C4799` | `#E896E3` | Rail |
| `--hsl-ferry` | `#00B9E4` | `#40d0f0` | Ferry |
| `--hsl-foli` | `#008161` | `#2ee8b7` | Föli bus (Turku) |

### Route & mode colours

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--walk` | `#52525b` | `#94a3b8` | Walking route lines, leg badges |
| `--funicular` | `#71717a` | `#a1a1aa` | Funicular leg badges |

### Surface palette

| Token | Value | Usage |
|---|---|---|
| `--surface` | `#ffffff` | Primary card / sheet background |
| `--surface-2` | `#E6EBEF` | Secondary fill, disabled backgrounds, segment bar bg |
| `--surface-3` | `#cdd5dc` | Stronger fill, hover border colour |
| `--text` | `#1a2433` | Primary body text |
| `--text-2` | `#506070` | Secondary / subdued text |
| `--text-3` | `#8d99a5` | Placeholder / muted / icon default |
| `--border` | `#d5dce3` | Default border |
| `--border-light` | `#E6EBEF` | Separator / divider lines |

### Border radii

| Token | Value | Typical use |
|---|---|---|
| `--r-xs` | `6px` | Tiny chip, step icon |
| `--r-sm` | `10px` | Input fields, cards, buttons |
| `--r-md` | `14px` | Popup content, medium cards |
| `--r-lg` | `20px` | Floating pills, picker overlay |
| `--r-xl` | `24px` | Sheets, overlays, search card |
| `--r-pill` | `999px` | Pill shapes, badges |

### Shadows (keep flat — very subtle)

| Token | Value | Typical use |
|---|---|---|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,.06)` | Segment active state |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,.07)` | Floating pills, zoom pill |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,.08)` | Sheets, overlays, search dropdown |

### Typography scale

#### Sizes

| Token | Value |
|---|---|
| `--txt-xs` | `11px` |
| `--txt-sm` | `12px` |
| `--txt-base` | `13px` |
| `--txt-md` | `14px` |
| `--txt-lg` | `15px` |
| `--txt-xl` | `16px` |
| `--txt-2xl` | `18px` |
| `--txt-3xl` | `22px` |

#### Weights

| Token | Value |
|---|---|
| `--fw-regular` | `400` |
| `--fw-medium` | `500` |
| `--fw-semibold` | `600` |
| `--fw-bold` | `700` |

### Spacing scale

| Token | Value |
|---|---|
| `--sp-1` | `4px` |
| `--sp-2` | `6px` |
| `--sp-3` | `8px` |
| `--sp-4` | `10px` |
| `--sp-5` | `12px` |
| `--sp-6` | `14px` |
| `--sp-7` | `16px` |
| `--sp-8` | `20px` |
| `--sp-9` | `24px` |

### Transitions

| Token | Value | Use |
|---|---|---|
| `--t-fast` | `.15s ease` | Hover colour swaps |
| `--t-med` | `.25s ease` | Subtle open / close |
| `--t-spring` | `.35s cubic-bezier(.32,.72,0,1)` | Sheets, slide-ins |

### Component size constants

| Token | Value | Controls |
|---|--|---|
| `--btn-icon-size` | `42px` | Map control icon buttons (zoom, search, prayer) |
| `--btn-roundel-size` | `32px` | Header / close roundel buttons |
| `--btn-roundel-sm-size` | `30px` | Compact roundels (calendar nav, focused-back) |
| `--tab-h` | `56px` | Tab bar height — used in positioning calculations |

### Safe areas

| Token | Maps to |
|---|---|
| `--safe-t` | `env(safe-area-inset-top, 0px)` |
| `--safe-b` | `env(safe-area-inset-bottom, 0px)` |

---

## §3 — Button Templates

Convention: `.btn-<type>[-<variant>]`

Each template is fully self-contained for visual design. Layout (margin, flex-grow, position, width) is set by the caller in `styles.css`.

### `.btn-icon`

Bare icon button. Lives **inside** a parent surface card — provides no background of its own.

**Size:** `--btn-icon-size` (42 px)  
**States:** default `--text-3` → hover `--text-2` → active `--accent`  
**Used by:** zoom-in, zoom-out, search-pill toggle icon, prayer-pill toggle icon

---

### `.btn-icon-card`

Icon button that **is** its own floating surface card. Provides background, border, border-radius, and shadow.

**Size:** `--btn-icon-size` (42 px)  
**States:** default `--text-3` → hover `--text-2` → active `--accent`  
**Active/locked:** `.active` class → accent fill, white icon  
**Used by:** `#style-picker-btn`

---

### `.btn-primary`

Filled accent CTA. Use for the **single strongest action** on any given screen or card. Do not place two `.btn-primary` actions side by side.

**Height:** set by the component (typically 44–48 px)  
**States:** hover `brightness(1.12)` · disabled `opacity: .35`  
**Component aliases in selector:** `.pp-dir-btn`  
**Layout overrides needed in styles.css:** height, any width or flex context  
**Used by:** `#dir-go`, `#sg-submit`, `#ed-submit`, `#dir-sum-edit`, `.pp-dir-btn`, `.pin-act-dir`

---

### `.btn-secondary`

Ghost / outline button. Use for **secondary actions** alongside a primary button.

**States:** hover — darker text + darker border  
**Component aliases in selector:** `.pp-share-btn`, `.pp-edit-btn`  
**Used by:** popup share button, popup edit button

---

### `.btn-danger-pill`

Danger-coloured outline pill. Use for **recoverable destructive** actions (e.g. "Clear route" — the route can be re-entered).

**Shape:** pill (`--r-pill`)  
**Background:** `--danger-soft` fill with danger border  
**Used by:** `#dir-clear-btn`

---

### `.btn-danger-filled`

Filled danger button. Use only for **hard-destructive** actions with no easy undo.

**Shape:** rounded (`--r-sm`)  
**Used by:** `.pin-act-rm` (remove dropped pin), `.pop-del` (delete saved pin)

---

### `.btn-success-pill`

Success-coloured outline pill. Use for a **go / navigate** action that is positive but not the primary CTA on the screen.

**Hover:** fills to solid green  
**Used by:** `.mosque-nav-btn` (navigate to mosque)

---

### `.btn-roundel`

32 px circular icon button — **neutral / dismiss** actions.

**Size:** `--btn-roundel-size` (32 px)  
**Background:** `--surface-2`  
**States:** hover `--text-2`  
**Used by:** `.sheet-x` (all close buttons), `#snackbar-close`, prayer header buttons

---

### `.btn-roundel-accent`

32 px circular icon button — **positive / add** action.

**Background:** `--accent`, white icon  
**Hover:** `brightness(1.12)`  
**Used by:** `.sheet-action-btn` (add/+ buttons on sheet headers)

---

### `.btn-roundel-subtle`

32 px circular icon button — **secondary positive** action. Slightly elevated from `.btn-roundel`.

**Background:** `--surface-2`, `--text-2` icon  
**Hover:** `--surface-3` background, `--text` icon  
**Used by:** `.sheet-action-btn-subtle` (edit-style header actions)

---

### `.btn-roundel-sm`

30 px circular icon button. Same visual as `.btn-roundel` but fits tighter layout contexts.

**Size:** `--btn-roundel-sm-size` (30 px)  
**Component aliases in selector:** `.cal-nav`, `#dir-focused-back`  
**Used by:** calendar previous/next arrows, directions focused-route back button

---

### `.btn-segment`

One option inside a **segmented control** container. The container itself (e.g. `#dir-mode-toggle`) provides: `--surface-2` background, `--r-sm` radius, 3 px padding.

**Active:** white background, `--text`, shadow  
**Used by:** `.mode-opt` (drive / transit / cycle / walk), `.time-opt` (depart / arrive)

> **Note on `.time-opt` active colour:** The time selector overrides active colour to `--accent` in `styles.css` — this is an intentional component-specific divergence.

---

### `.btn-chip`

Standalone toggle pill chip. Default = inactive outline; `.active` = filled accent.

**Shape:** pill (`--r-pill`)  
**Component aliases in selector:** `.tf-chip` (JS-generated tag filter chips)  
**Active:** accent fill  
**Used by:** `#tf-toggle` (tag filter toggle), `.tf-chip` items

> **Note on `#tf-toggle` open state:** JS adds `.open` instead of `.active`. An override in `styles.css` maps `.open` to the same filled-accent appearance.

---

### `.btn-inline`

Inline text action. Looks like a hyperlink inside a sentence. No border or background.

**Font:** inherits size from parent, `--fw-semibold`, `--accent` colour  
**States:** underline fades in on hover  
**Component aliases in selector:** `.empty-suggest`  
**Used by:** "Suggest a place" link in the empty state

---

### `.btn-tab`

Bottom / side navigation tab item.

**Layout:** `flex-direction: column`, icon + label  
**Active (`.active-tab`):** accent colour + pill indicator bar below icon (mobile) or left edge (desktop)  
**Special states:** `.tracking` — pulsing accent animation, `.route-active` — static accent  
**Used by:** `#home-btn`, `#dir-btn`, `#places-btn`, `#locate-btn`

> The `.tab` selector (JS state class) is kept alongside `.btn-tab` in the HTML. Tab-specific state overrides (`active-tab`, `tracking`) are scoped to `.tab.*` in `styles.css` because they involve animation keyframes and responsive repositioning of the indicator bar.

---

## §4 — Typography Templates

Convention: `.t-<role>`

| Template | Size / Weight | Colour | Overflow | Used by |
|---|---|---|---|---|
| `.t-panel-heading` | `--txt-2xl` / semibold | `--text` | — | `.sheet-head h2`, `.suggest-head h3`, `#edit-card h3` |
| `.t-item-title` | `--txt-lg` / semibold | `--text` | ellipsis | `.r-name`, `.pl-name`, `.ds-name`, `.pp-title` |
| `.t-item-sub` | `--txt-sm` / regular | `--text-3` | ellipsis | `.r-addr`, `.pl-addr`, `.ds-addr`, `.pp-sub` |
| `.t-micro-label` | `--txt-xs` / bold | `--text-3` | — | `.cal-weekdays span`, `.tp-wheel-label`, `.itin-zones-label` |
| `.t-caption` | `--txt-sm` / medium | `--text-3` | — | `.itin-time`, `.pl-tags-summary`, `.leg-dist` |
| `.t-body-sm` | `--txt-base` / regular | `--text-2` | — | Inline descriptions, directions summary text |

`.t-item-title` and `.t-item-sub` have their commonly-used component classes (`r-name`, `pl-name`, `ds-name`, `r-addr`, `pl-addr`, `ds-addr`) added directly into the selector list so no class needs adding in HTML for existing elements.

`.t-micro-label` similarly includes `.cal-weekdays span`, `.tp-wheel-label`, `.itin-zones-label` in the selector.

---

## §5 — Input / Field Templates

### `.t-field-wrap`

The visible bordered container that wraps an `<input>`, `<select>`, or `<textarea>`.

**States:** default border → hover `--surface-3` → focus-within `--accent`  
**Use:** add to the wrapper `<div>` alongside an icon and the input element.

### `.t-field-input`

The raw input element inside `.t-field-wrap`.

**Resets** native border/outline, transparent background  
**Inherits** font family, weight `--fw-medium`, size `--txt-lg`  
**Placeholder:** `--text-3`, `--fw-regular`

---

## §6 — Chip & Badge Templates

### `.chip` / `.pp-chip` / `.sp-chip`

Display badge chip. Set `--chip-c` to control tint (text colour + 14% background via `color-mix`).

| Modifier | Variable | Semantics |
|---|---|---|
| `.chip-yes` / `.pp-chip-yes` | `--chip-c: var(--success)` | Positive / confirmed (green) |
| `.chip-no` / `.pp-chip-no` | `--chip-c: var(--danger)` | Negative / missing (red) |
| `.chip-warn` / `.pp-chip-warn` | `--chip-c: var(--gold)` | Partial / cautionary (amber) |

**Usage:** Popup tag chips, stop popup route chips. `partially_halal` uses `.pp-chip-warn`.

### `.tag-chip` / `.sg-tag`

Tri-state chip used in suggest and edit forms for feature tags (halal-certified, prayer-room, etc.). State is driven by the `data-state` attribute.

| `data-state` | Appearance | Icon shown |
|---|---|---|
| *(none)* | Outline, `--text-2` | Hidden |
| `"yes"` | Green fill (`--success-soft` / `--success`) | `.tag-icon.tag-yes` or `.sg-tag-icon.sg-yes` |
| `"no"` | Red fill (`--danger-soft` / `--danger`) | `.tag-icon.tag-no` or `.sg-tag-icon.sg-no` |

`.sg-tag` is the name used for JS-generated chips in the suggest form. Its state icons use `.sg-tag-icon` instead of `.tag-icon`, but the visual rules are shared via the same selector in `design-tokens.css`.

---

## §7 — Pill Component Templates

Three reusable patterns for the floating pill controls on the map.

### `pill-expand`

A collapsible pill that animates from icon-wide (44 px, `.collapsed` class present) to a full card (`.collapsed` removed). Width of the expanded state is component-specific and set in `styles.css`.

**Collapsed:** `--r-lg` radius, `--shadow-md`  
**Expanded:** `--r-xl` radius, `--shadow-lg`  
**Toggle:** add/remove `.collapsed` class in JS

### `pill-expand-icon`

The icon button inside a `pill-expand`.

**Default behaviour (search style):** icon fades out and becomes non-interactive when the pill opens — it reappears in a different position inside the body content.

**Prayer style override:** keep the icon pinned top-left while expanded by adding `opacity: 1; pointer-events: auto` and `position: absolute; top: 0; left: 0` in `styles.css`.

### `pill-expand-body`

The content region of a `pill-expand`. Fades in on expand; `height: 0` + hidden when `.collapsed`.

### `pill-panel`

A floating card that slides out to the **left** of its pill parent. Vertically centred on the pill. Parent element must be `position: relative / absolute / fixed`.

**Open/close:** toggle `.hide` class. Unlike normal `.hide` (which uses `display: none`), `.pill-panel.hide` keeps `display: flex` with higher specificity so the CSS transition can still play — it uses `opacity: 0`, `pointer-events: none`, and a slight rightward translateX.

---

## §8 — Snack / Toast Template

Base card chrome for all in-app notifications. Used by `.share-toast` (JS-injected copy/share toast) and `#geo-notice` (non-Finland visitor banner).

### Usage

```html
<div class="snack">
  <div class="snack-icon snack-icon--success">
    <!-- svg icon -->
  </div>
  <div class="snack-body">
    <span class="snack-label">Place submitted</span>
    <span class="snack-sub">Thank you — we'll review it soon</span>
  </div>
</div>
```

### Icon colour variants

| Class | Colour | Use case |
|---|---|---|
| `.snack-icon--success` | Green | Submitted / confirmed |
| `.snack-icon--error` | Red | Failure / error |
| `.snack-icon--clock` | Blue | Prayer / time-based alert |
| `.snack-icon--info` | Blue | Informational banner |

### What stays in styles.css for snacks

- `position`, `bottom`, `left`, `z-index`
- `width`, `max-width`, `min-width`
- `opacity` and `transform` for enter/exit animation
- `white-space: nowrap` override for compact single-line toasts

---

## §9 — Scrollable Container Template

The `.t-scroll` utility class (and its auto-included component aliases) applies uniform scrollbar chrome: thin 3 px scrollbar, transparent track, `--border` thumb.

### Currently auto-included in the selector list

| Selector | Component |
|---|---|
| `.t-scroll` | Generic utility — add to any new scrollable container |
| `#places-scroll` | Places list scroll area |
| `#dir-results` | Directions results list |
| `#suggest-form` | Suggest overlay form |
| `#edit-form` | Edit overlay form |
| `.sp-routes` | Stop popup route chip list |

### What stays in styles.css

- `flex: 1; min-height: 0` (layout)
- `scroll-behavior: smooth` (behaviour override, component-specific)
- `max-height` constraints

---

## Responsive breakpoints

| Breakpoint | Description |
|---|---|
| `max-width: 380px` | Very small phones — tighten search, stack pin actions |
| `max-width: 768px` | Mobile — font-size bumps (≥16 px prevents iOS zoom), touch target sizes, sheet safe-area padding, hide summary bar |
| `min-width: 769px` | Desktop — tab bar moves to right edge (vertical strip), sheets emerge from right instead of bottom |

---

## Component-specific notes

### Popup action buttons (`pp-dir-btn`, `pp-share-btn`, `pp-edit-btn`)

Visual chrome comes entirely from `.btn-primary` and `.btn-secondary` templates. In `styles.css` only `flex: 1`, `height: 34px`, and `padding: 0` (padding override — popup buttons are narrower than standard) are set.

### `#tf-toggle` vs `.btn-chip`

The tag filter toggle uses `.btn-chip` but JS adds `.open` class instead of `.active`. An override in `styles.css` maps `.open` to the same filled-accent appearance and rotates the chevron arrow.

### `.tab` vs `.btn-tab`

HTML elements have **both** classes. `.btn-tab` provides the base template; `.tab` is retained as the JS selector for state management (`active-tab`, `tracking`, `route-active`) and is where animation keyframes are scoped.

### `#snackbar-close` (route snackbar close button)

Uses `.sheet-x` class (rendered on a blue `--accent` background). In `styles.css` an ID-scoped override sets the background to `rgba(255,255,255,.18)` and the colour to `#fff` to keep contrast against the blue snackbar background.

### Suggest / Edit overlays on mobile

On `max-width: 768px`, the overlays transition from centred modal to bottom-sheet. `display: none` cannot animate, so `.hide` on `#suggest-overlay` and `#edit-overlay` is overridden to `display: flex` with `opacity: 0; pointer-events: none`, and the card slides in via `translateY`.
