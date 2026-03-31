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
| `--accent` | `#08705B` | Brand teal — interactive elements, active states |
| `--accent-soft` | `#e6f2ef` | Teal tint surface, soft backgrounds |
| `--accent-muted` | `#4a9a88` | De-emphasised teal, pulse animations |\n| `--on-accent` | `#fff` | Text/icons on any accent or coloured background |
| `--gold` | `#b89030` | Sponsor / Eid highlight, partially-halal chip |
| `--gold-soft` | `#fdf6e8` | Gold tint surface |
| `--sponsor` | `var(--gold)` | Alias — sponsor badge/chip colour |
| `--sponsor-soft` | `var(--gold-soft)` | Alias — sponsor badge/chip background |
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
| `--surface-2` | `#f0f0f0` | Secondary fill, disabled backgrounds, segment bar bg |
| `--surface-3` | `#d9d9d9` | Stronger fill, hover border colour |
| `--text` | `#191919` | Primary body text |
| `--text-2` | `#525252` | Secondary / subdued text |
| `--text-3` | `#8c8c8c` | Placeholder / muted / icon default |
| `--border` | `#dedede` | Default border |
| `--border-light` | `#efefef` | Separator / divider lines |

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
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,.06)` | Micro-subtle — filter toggles, small tags |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,.06)` | Segment active state |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,.07)` | Floating pills, zoom pill |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,.08)` | Sheets, overlays, search dropdown |

### Typography scale

**Font:** Plus Jakarta Sans (variable, 200–800 weight, SIL OFL 1.1). Self-hosted in `src/styles/fonts/` with latin + latin-ext subsets (covers Finnish ä/ö/å).

**OpenType:** `font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1` enabled globally.

#### Sizes

| Token | Value |
|---|---|
| `--txt-xs` | `11px` |
| `--txt-sm` | `13px` |
| `--txt-base` | `14px` |
| `--txt-md` | `15px` |
| `--txt-lg` | `16px` |
| `--txt-xl` | `18px` |
| `--txt-2xl` | `20px` |
| `--txt-3xl` | `24px` |
| `--txt-display` | `30px` |

#### Weights

Three-tier hierarchy — **regular** (body/captions) → **medium** (interactive/titles) → **bold** (headings/CTAs). Semibold is for emphasis within a group (labels, badges).

| Token | Value | Tier |
|---|---|---|
| `--fw-regular` | `400` | Body text, captions, muted content |
| `--fw-medium` | `500` | Item titles, chips, tabs, secondary buttons |
| `--fw-semibold` | `600` | Badges, form labels, micro-labels |
| `--fw-bold` | `700` | Panel headings, primary CTAs, hero text |

#### Letter-spacing

| Token | Value | Use |
|---|---|---|
| `--ls-tight` | `-0.025em` | Headings, display text (large text needs tighter tracking) |
| `--ls-normal` | `0` | Body, default |
| `--ls-wide` | `0.015em` | Small text, chips (helps legibility below 13px) |
| `--ls-caps` | `0.06em` | Uppercase micro-labels, badges |

### Spacing scale

| Token | Value |
|---|---|
| `--sp-0` | `2px` |
| `--sp-0h` | `3px` |
| `--sp-1` | `4px` |
| `--sp-1h` | `5px` |
| `--sp-2` | `6px` |
| `--sp-2h` | `7px` |
| `--sp-3` | `8px` |
| `--sp-3h` | `9px` |
| `--sp-4` | `10px` |
| `--sp-4h` | `11px` |
| `--sp-5` | `12px` |
| `--sp-6` | `14px` |
| `--sp-7` | `16px` |
| `--sp-7h` | `18px` |
| `--sp-8` | `20px` |
| `--sp-9` | `24px` |
| `--sp-10` | `28px` |
| `--sp-11` | `36px` |

### Transitions

| Token | Value | Use |
|---|---|---|
| `--t-fast` | `.15s ease` | Hover colour swaps |
| `--t-med` | `.25s ease` | Subtle open / close |
| `--t-spring` | `.35s cubic-bezier(.32,.72,0,1)` | Content expand/collapse (grid-template-rows) |
| `--t-slow` | `.4s ease` | Theme transition — whole-page color shifts |
| `--t-x-slow` | `.5s ease` | Heavy transitions — map canvas filter |
| `--ease-expo` | `cubic-bezier(.16,1,.3,1)` | Sheets, panels — aggressive deceleration |
| `--ease-spring-pop` | `cubic-bezier(.34,1.56,.64,1)` | Tool pills — bouncy overshoot enter |

### Component size constants

| Token | Value | Controls |
|---|--|---|
| `--btn-icon-size` | `42px` | Map control icon buttons (zoom, search, prayer) |
| `--btn-roundel-size` | `32px` | Header / close roundel buttons |
| `--btn-roundel-sm-size` | `30px` | Compact roundels (calendar nav, focused-back) |
| `--tab-h` | `56px` | Tab bar height — used in positioning calculations |

### Puck shape

| Token | Value | Usage |
|---|---|---|
| `--puck-r` | `50% 50% 50% 8px` | Asymmetric puck border-radius — place/search/custom/eid markers |
| `--puck-r-sm` | `50% 50% 50% 7px` | Smaller puck radius — location indicator |
| `--puck-border` | `2.5px solid #fff` | Marker border |
| `--puck-border-sm` | `2.5px solid #fff` | Location indicator border |

### Popup tip

| Token | Value | Usage |
|---|---|---|
| `--popup-tip-w` | `30px` | Curvy tip width (horizontal anchors) |
| `--popup-tip-h` | `12px` | Curvy tip height (horizontal anchors) |
| `--popup-tip-offset` | `-11px` | Tip position offset from card edge |
| `--popup-tip-clip-down` | `path('M 0,0 C … 30,0 Z')` | Clip-path for bottom-anchored popups |
| `--popup-tip-clip-up` | `path('M 0,12 C … 30,12 Z')` | Clip-path for top-anchored popups |
| `--popup-tip-clip-left` | `path('M 12,0 C … 12,30 Z')` | Clip-path for left-anchored popups |
| `--popup-tip-clip-right` | `path('M 0,0 C … 0,30 Z')` | Clip-path for right-anchored popups |

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
| `.chip-sponsor` / `.pp-chip-sponsor` / `.pl-sponsor-chip` | `--chip-c: var(--sponsor)` | Sponsored place (gold) |

**Usage:** Popup tag chips, stop popup route chips. `partially_halal` uses `.pp-chip-warn`. Sponsored places use `.pl-sponsor-chip` in list cards and `.pp-sponsor-badge` in popups.

### `.sponsor-badge` / `.pp-sponsor-badge`

Inline gold badge indicating a sponsored place. Used in popup headers and anywhere a compact "Sponsored" label is needed. Tinted from `--sponsor` token.

### `.pp-promo-btn`

Icon-only CTA button in the popup action row for sponsored places with a CTA link. Gold-tinted outline style.

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

---

## §13 — Skeleton Loading System

Animated placeholder UI for any content that loads asynchronously. Skeletons shimmer in place of real content so the layout feels instant.

### Base classes (in `design-tokens.css`)

| Class | Purpose |
|---|---|
| `.skel-bone` | Apply to any skeleton element — sets `--surface-2` background, `--r-xs` radius, and shimmer animation (1.2 s alternate pulse to 45 % opacity). Dark mode overrides to `--surface-3`. |
| `.skel-line` | Generic line placeholder (12 px tall, pill radius). Combine with `.skel-bone`. |
| `@keyframes shimmer` | Shared animation — `opacity: 1 → 0.45`, 1.2 s ease-in-out, infinite alternate. |

### Layout variants (in `styles.css`)

Each variant mirrors the corresponding real component's dimensions so content doesn't shift when the skeleton is replaced.

| Variant | Mirrors | Structure |
|---|---|---|
| `.pl-skeleton` | Place card (`.pl-card` grid) | Icon (28 × 28) + body (2 lines) + badge pill |
| `.prayer-skel-item` | Prayer time row | Name line (56 px) + time line (40 px), spaced between |
| `.itin-skeleton` | Itinerary card (`.itin-card`) | Duration bar + time line + 3 badge pills |
| `.search-skel-item` | Search result (`#results-list li`) | Icon (38 × 38) + name line + address line |
| `.sp-skel-routes` | Stop popup route chips | 4 pill chips (36 × 18) |

### Usage pattern

```js
// Show skeleton while data loads
container.innerHTML = Array.from({ length: 6 }, (_, i) =>
  '<li class="pl-skeleton" style="--i:' + i + '">' +
    '<div class="skel-bone skel-icon"></div>' +
    '<div class="skel-body">' +
      '<div class="skel-bone skel-line skel-line-long"></div>' +
      '<div class="skel-bone skel-line skel-line-short"></div>' +
    '</div>' +
    '<div class="skel-bone skel-badge"></div>' +
  '</li>'
).join("");

// Replace with real content when data arrives
container.innerHTML = realHTML;
```

### Rules

1. Every async-loaded content area should show a skeleton, never a blank space or plain "Loading…" text.
2. Skeleton dimensions should approximate the real content height to minimise layout shift.
3. Use `.skel-bone` on every placeholder element — it carries the shimmer animation.
4. Match the skeleton count to the typical content count (e.g. 5 prayer rows, 3 itinerary cards, 6 place cards).
5. Dark mode is automatic via the `.skel-bone` override in `styles.css`.
- `max-height` constraints

---

## §10 — Puck Map Marker Template

Convention: `.puck-mk`

The asymmetric teardrop ("puck") is the app's universal marker shape — a rounded shape with one flat corner, rotated -45 deg so the flat corner points down.

| Class | Purpose |
|---|---|
| `.puck-mk` | Standalone puck marker (generic) |

**Aliased classes** (added to the same selector in `design-tokens.css`):

| Alias | Component |
|---|---|
| `.place-mk` | Place markers on the map |
| `.search-mk` | Search result marker |
| `.custom-mk` | Custom dropped-pin marker |
| `.home-mk` | Home pin marker |
| `.eid-mk` | Eid prayer location marker |

### What the template provides

- `display: flex; align-items: center; justify-content: center`
- `width/height: var(--icon-md)` (38 px)
- `border: var(--puck-border)` (2.5 px white)
- `border-radius: var(--puck-r)` (50% 50% 50% 8 px)
- `transform: rotate(-45deg)`
- `box-shadow: 0 2px 8px rgba(0,0,0,0.2)`
- Child `svg` counter-rotated 45 deg

### What stays in styles.css

- `background` colour per-type (`--place-c`, `--accent`, `--gold`, `--home`)
- `position: relative` (for popup anchoring)
- `animation` (fadeIn on search/custom/eid markers)
- Unique `box-shadow` overrides (e.g. search-mk has accent-coloured shadow)

### Sponsor marker modifiers

| Class | Effect |
|---|---|
| `.place-mk--sponsor-basic` | White marker border plus outer gold ring. Applied to basic tier. |
| `.place-mk--sponsored` | White marker border plus static gold ring and warm glow. Applied to featured & spotlight. |
| `.place-mk--spotlight` | Pulsing gold ring/glow via `@keyframes sponsorPulse`. Applied to spotlight only (stacks with `--sponsored`). |

### Sponsor carousel (places panel)

Horizontal scroll strip at the top of `#places-scroll` listing all sponsored places. Rendered by `_renderSponsorCarousel()` in `places.js`.

| Class | Purpose |
|---|---|
| `.sponsor-carousel` | Container with bottom border |
| `.sponsor-carousel-hdr` | Section header — aliased onto `pl-section-hdr` for visual alignment |
| `.sponsor-carousel-track` | Flex row, `overflow-x: auto`, `scroll-snap-type: x mandatory`, hidden scrollbar |
| `.sponsor-card` | 180px horizontal card (type dot + name/addr body), `scroll-snap-align: start` |
| `.sponsor-card-dot` | 22px type icon circle |
| `.sponsor-card-body` | Flex column (name + address), `min-width: 0` for ellipsis |

Auto-scroll: 3s tick interval, pauses on interaction, resumes after 8s. Desktop wheel → horizontal scroll.

### Promos overlay panel

Centralized promo code listing. Button + overlay following the Eid panel pattern.

| Element | Class/ID | Purpose |
|---|---|---|
| Trigger button | `#promos-pill` `.btn-icon-card` | Standalone icon button, positioned beside prayer pill |
| Overlay backdrop | `#promos-overlay` | Fixed inset, `--overlay-bg`, uses `.hide` for open/close |
| Card | `#promos-card` | Centered card (380px max-width), `suggest-head` header, scrollable list |
| Promo item | `.promo-item` | Horizontal button: `.promo-dot` (28px circle) + `.promo-body` (name, code, text) |

---

## §11 — Puck Location Indicator Template

Convention: `.puck-loc`

A smaller puck pointing backward (-135 deg) for "you are here".

**Aliased class:** `.loc-puck`

### What the template provides

- `border: var(--puck-border-sm)`
- `border-radius: var(--puck-r-sm)` (50% 50% 50% 7 px)
- `box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent)`

### What stays in styles.css

- `width/height` (24 px — different from `--icon-md`)
- `background: var(--accent)`
- Absolute positioning within `.loc-marker`
- `transform: translate(-50%, -50%) rotate(-135deg)`
- `z-index`, `transition`
- Dark-mode shadow override

---

## §12 — Curvy Popup Tip Pattern

Not a class template (pseudo-elements can't take class names). Instead, a documented pattern using `--popup-tip-*` tokens applied via `::after` on `.maplibregl-popup-content`.

### Pattern (applied in styles.css for each popup type)

```css
.{type}-popup-wrap .maplibregl-popup-tip { display: none !important; }

.{type}-popup-wrap .maplibregl-popup-content::after {
  content: "";
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: var(--popup-tip-w);
  height: var(--popup-tip-h);
  background: var(--surface);
  pointer-events: none;
}

/* Per anchor direction: */
/* bottom → bottom: var(--popup-tip-offset); clip-path: var(--popup-tip-clip-down) */
/* top    → top:    var(--popup-tip-offset); clip-path: var(--popup-tip-clip-up)   */
/* left   → swap w/h, clip-path: var(--popup-tip-clip-left)                       */
/* right  → swap w/h, clip-path: var(--popup-tip-clip-right)                      */
```

### Applied to

| Popup type | Anchors supported |
|---|---|
| `.place-popup-wrap` | bottom, top, left, right |
| `.stop-popup-wrap` | bottom, top, left, right |
| `.eid-popup-wrap` | bottom, top |

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

---

## §8 — Sponsorship Templates

Templates for sponsored place UI elements. All sponsorship visuals use `--sponsor` / `--sponsor-soft` token aliases (mapped to the gold palette). Boycott always suppresses sponsorship — client code checks `!place.boycott` before rendering any sponsor UI.

### `.pp-sponsor`

Gold badge pill displayed in popup header row next to the type badge. Contains an ℹ️ SVG that opens a tooltip on tap.

**Shape:** pill (`--r-pill`)
**Colours:** `--sponsor-soft` background, `--sponsor` text
**Used by:** `showPlacePopup()` in `places.js`

### `.pl-sponsor-chip`

Inline gold chip next to place name in list cards. Identical pattern to `.pl-boycott-chip` but uses sponsor colours.

**Used by:** `_buildCard()` in `places.js`

### `.r-sponsor-label`

Inline "· Sponsored" label in search result rows.

**Used by:** `showResults()` in `search.js`

### `.pp-sponsor-tip`

Tooltip shown when tapping the ℹ️ icon on the sponsor badge. Positioned absolutely below the badge, auto-removed after 5 seconds.

### Marker glow classes

| Class | Tier | Effect |
|---|---|---|
| `.place-mk--sponsor-basic` | Basic | Gold border + gentle float animation (4s) |
| `.place-mk--sponsored` | Featured | Gold ring + glow pulse + soft bounce (3s) |
| `.place-mk--spotlight` | Spotlight | Stronger glow pulse + lively bounce with 6% scale (2.2s) |

### Sponsor carousel

| Class | Purpose |
|---|---|
| `.sponsor-carousel` | Container `<li>` at top of places list |
| `.sponsor-carousel-title` | "Sponsored Places" heading |
| `.sponsor-carousel-track` | Horizontal scroll flex container |
| `.sponsor-carousel-card` | Individual card (140px wide, snap-to-start) |
| `.sponsor-carousel-dot` | Type icon dot (20px, coloured by place type) |
| `.sponsor-carousel-name` | Place name (truncated) |
| `.sponsor-carousel-addr` | Address (truncated) |

### Promos Pill (`#promos-snack`)

Pill-expand element beside the Prayer Times pill. Lists all places with active promo codes (`sponsor_promo`). Hidden when no promos exist.

| Class | Purpose |
|---|---|
| `#promos-snack` | Container, uses `.pill-expand` pattern |
| `#promos-pill` | Icon button (tag icon, gold colour) |
| `#promos-header` | Header row with icon + "Promos" text |
| `#promos-list` | Scrollable list of promo items |
| `.promo-item` | Single promo row (click to copy code) |
| `.promo-item-icon` | Coloured type icon (24px) |
| `.promo-item-body` | Name + description |
| `.promo-item-code` | Promo code badge (gold) |

### Keyframes

| Name | Cycle | Used by |
|---|---|---|
| `sponsorPulse` | 2s ease-in-out | `.place-mk--sponsored`, `.place-mk--spotlight` (glow ring) |
| `sponsorFloat` | 4s ease-in-out | `.place-mk--sponsor-basic` (subtle vertical drift) |
| `sponsorBounce` | 3s ease-in-out | `.place-mk--sponsored` (soft vertical bounce) |
| `sponsorBounceScale` | 2.2s ease-in-out | `.place-mk--spotlight` (bounce + 6% scale pulse) |
