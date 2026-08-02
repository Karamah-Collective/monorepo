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
| `--surface-2` | `#f5f5f5` | Secondary fill, disabled backgrounds, segment bar bg |
| `--surface-3` | `#e0e0e0` | Stronger fill, hover border colour |
| `--text` | `#111111` | Primary body text |
| `--text-2` | `#525252` | Secondary / subdued text |
| `--text-3` | `#8c8c8c` | Placeholder / muted / icon default |
| `--border` | `#e2e2e2` | Default border |
| `--border-light` | `#efefef` | Separator / divider lines |

### Border radii

| Token | Value | Typical use |
|---|---|---|
| `--r-xs` | `6px` | Tiny chip, step icon |
| `--r-sm` | `10px` | Input fields, cards, buttons |
| `--r-md` | `14px` | Popup content, medium cards |
| `--r-lg` | `20px` | Floating pills, popup content, picker overlay, icon-card buttons |
| `--r-xl` | `24px` | Sheets (desktop), overlays, search card |
| `--r-2xl` | `28px` | Sheet corners (mobile), desktop side panels |
| `--r-3xl` | `32px` | Sheet corners (mobile), large overlays |
| `--r-pill` | `999px` | Pill shapes, badges |

### Shadows (keep flat — very subtle)

| Token | Value | Typical use |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,.06)` | Micro-subtle — filter toggles, small tags |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,.06)` | Segment active state |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,.07)` | Floating pills, zoom pill |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,.08)` | Sheets, overlays, search dropdown |
| `--shadow-xl` | `0 8px 24px -4px rgba(.10) + 0 2px 6px -1px (.05)` | Multi-layer — popups, modals, snackbars |
| `--shadow-float` | `0 12px 48px -8px rgba(.08) + 0 4px 12px -4px (.04)` | Wide diffuse — tab bar, floating panels |
| `--shadow-accent-sm` | `0 1px 4px accent@12%` | Brand-tinted glow — focused inputs |
| `--shadow-accent-md` | `0 4px 12px accent@10%` | Brand-tinted depth — hovered primary CTAs |

### Focus & accessibility

| Token | Value | Usage |
|---|---|---|
| `--focus-ring` | `0 0 0 2px surface, 0 0 0 4px accent@50%` | Keyboard focus indicator on buttons, links |
| `--focus-ring-inset` | `inset 0 0 0 2px accent@50%` | Focus indicator on inputs and textareas |

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
| `--txt-3xl` | `26px` |
| `--txt-4xl` | `30px` |
| `--txt-display` | `36px` |

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

### Line-height

| Token | Value | Use |
|---|---|---|
| `--lh-tight` | `1.15` | Display text, headings |
| `--lh-snug` | `1.3` | Subheadings, card titles |
| `--lh-normal` | `1.5` | Body text, default |
| `--lh-relaxed` | `1.65` | Long-form content, descriptions |

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
| `--stagger-unit` | `30ms` | Per-item delay for staggered list entry animations |

### Component Sizing

| Token | Value | Use |
|---|---|---|
| `--h-submit` | `44px` | Submit/CTA button height |
| `--h-field` | `46px` | Direction / date input row height |
| `--h-search` | `48px` | Search box height |

**Correction (2026-08-02):** this table previously listed a `--h-input: 44px` token ("Minimum touch-friendly height for form inputs") and `--h-submit: 48px`/`--h-field: 42px` — none of which matched `design-tokens.css`. `--h-input` was never actually defined anywhere in the stylesheet (any `var(--h-input)` reference silently resolved to the browser's initial `height` value, `auto`), and `--h-submit`/`--h-field`'s real values are `44px`/`46px`, not `48px`/`42px`. Found the hard way: a `.btn-google` height override referencing the phantom `--h-input` silently collapsed that button to ~20px, caught by an automated Playwright bounding-box assertion, not by visual review (see `docs/PREFERENCE_LOG.md`'s 2026-08-02 entry for the full incident). Corrected the table to match the actual CSS and added the previously-undocumented `--h-search`. If you need a 44px "safe minimum touch target" height for a new form control that isn't literally a submit button, `--h-submit` is the closest existing 44px token — introduce a new dedicated token rather than reintroducing a bare `--h-input` name with an assumed value.

### Component size constants

| Token | Value | Controls |
|---|--|---|
| `--btn-icon-size` | `42px` | Map control icon buttons (zoom, search, prayer) |
| `--btn-roundel-size` | `32px` | Header / close roundel buttons |
| `--btn-roundel-sm-size` | `30px` | Compact roundels (calendar nav, focused-back) |
| `--tab-h` | `56px` | Tab bar height — used in positioning calculations |
| `--nav-turn-marker-size` | `36px` | Navigation turn overlay badge and fixed road-arrow size |
| `--nav-turn-icon-size` | `20px` | Navigation overlay icon size |
| `--nav-turn-pointer-size` | `8px` | Navigation turn overlay pointer width |
| `--nav-turn-highlight` | `#fff` | Bright on-road turn segment and arrow fill |
| `--nav-turn-arrow-edge` | `color-mix(...)` | Subtle edge for the on-road arrow so it stays visible on map tiles |

### `.nav-turn-overlay` and `.nav-turn-road-arrow`

Navigation turn markers use a shared fixed-size system so the side overlay badge and the on-road arrow stay visually aligned.

**`.nav-turn-overlay`**: fixed accent badge with right-edge pointer; sits beside the road and must never block the route geometry.

**`.nav-turn-road-arrow`**: fixed-size on-road arrow marker anchored by its visible tip, not its center. Use for the outgoing-road direction marker only; keep it screen-sized and do not scale it with map zoom.

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

## §2.5 — Interaction & Motion Templates

### `.skip-link`

Visually hidden link that appears on keyboard focus. Positioned fixed at the top of the page. Skips to `#map` for keyboard-only users.

### `.stagger-in`

Apply to a list container. Children with `style="--i:N"` receive sequential `staggerFadeUp` animation (translate + opacity) with `--stagger-unit` delay between each item.

### `.t-card-hover`

Apply to any card element. Adds elevated shadow on hover. Uses `--t-med` timing.

### `.t-input-glow`

Apply to standalone inputs not inside `.t-field-wrap`. Adds accent-tinted box-shadow on focus via `--shadow-accent-sm`.

### Button interaction states

All button templates (`.btn-primary`, `.btn-secondary`, `.btn-roundel`, etc.) include:
- **Hover:** color, filter, or border changes (no positional transforms)
- **Active:** `filter: brightness(0.92)` or `opacity` change — never `scale` or `translateY`
- **Focus-visible:** `--focus-ring` box-shadow for keyboard accessibility
- No `translateY` or `scale` on hover/active — the user prefers static buttons with color-only feedback

### Button content rule

Buttons must contain EITHER an icon OR text — never both together.

**Exempt:** structural indicators (chevrons for expand/collapse), functional icons with numeric counts (vote thumbs-up), segmented control mode icons (transport mode differentiators), inline loading spinner + status text (e.g. `.btn-spinner` + "Signing in…"), and brand-mandated third-party sign-in buttons where the vendor's own guidelines require logo + label together (`.btn-google`'s "G" logomark + "Continue with Google").

### `prefers-reduced-motion`

All animations and transitions are suppressed when the user has enabled "Reduce motion" in their OS settings.

### Overlay height transitions

Dynamic window-style overlays use `animateElementHeight()` from `src/utils.js` around content-mode swaps. The helper pins the current card height, runs the DOM change, measures the natural height, then animates `height` with `--t-spring`. Use this for reviews verification/rating swaps and event/Eid-style overlay windows whose card height is natural. Do not use it on static-height forms such as suggest, edit, contact, or wish form cards.

`src/menu.js`'s Account section (`_animateMenuPanelHeight()`) is a second consumer of the same shared helper, scoped to `.menu-account-panel` — the toggle open/close of `#menu-email-signin-panel` (and its swap to the "check your email" message) animates the same way as reviews.js's `_animateReviewCardHeight()`/`.rv-overlay-card`. `.menu-account-panel` needs its own `transition: height var(--t-spring)` in `styles.css` for this to work — `animateElementHeight()` relies on the target element's own CSS transition, it doesn't set one inline. `#menu-email-signin-panel` also carries a `border-top`/`padding-top` divider (the same convention as `.pp-reviews`) so the expanded panel reads as attached to the sign-in row above it rather than a disconnected stack.

### `::selection`

Text selection uses a 25% tint of `--accent` instead of the browser default blue.

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
**Component aliases in selector:** `.pp-contact-btn`, `.pp-share-btn`, `.pp-edit-btn`  
**Used by:** popup share button, popup edit button, place-detail Contact (Call) button

---

### `.btn-google`

Third-party brand button for "Sign in with Google" — the **one intentional exception** to template-first token reuse. Google's own branding guidelines (developers.google.com/identity/branding-guidelines) mandate a specific white/neutral (or dark-theme) button chrome with an unaltered, uncolored multi-color "G" logomark; recoloring it to `--accent` would look like an unofficial knockoff and undermine the exact trust signal the button exists to provide. Combine with `.rv-action-btn` for shared sizing (width/height/radius) with the email sign-in button beside it — `.btn-google` overrides background/border/text-color/font-weight, plus `font-size` (`var(--txt-base)`, 14px, matching Google's own documented label spec instead of `.rv-action-btn`'s 16px default; height is deliberately left at `.rv-action-btn`'s real `var(--h-submit)`, 44px — see the Component Sizing correction note above for why an earlier pass's height override was wrong).

**New dedicated tokens (not derived from `--accent`/`--surface`, fixed brand values):**

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--google-btn-bg` | `#ffffff` | `#131314` | Button fill |
| `--google-btn-border` | `#747775` | `#8e918f` | 1px button border |
| `--google-btn-text` | `#1f1f1f` | `#e3e3e3` | Button label + `.btn-spinner` override colour |
| `--google-g-blue` | `#4285f4` | *(same)* | "G" logo blue segment |
| `--google-g-green` | `#34a853` | *(same)* | "G" logo green segment |
| `--google-g-yellow` | `#fbbc05` | *(same)* | "G" logo yellow segment |
| `--google-g-red` | `#ea4335` | *(same)* | "G" logo red segment |

The four `--google-g-*` logo colors never change between light/dark — only the button chrome (`bg`/`border`/`text`) has a dark-mode override, matching Google's own rule that the logo itself must never be recolored.

**Icon:** `.btn-google-icon` (18×18) — inline SVG, matching how every other icon in this app is embedded (no external asset, no logo CDN fetch). `.btn-spinner` gets a scoped `.btn-google .btn-spinner` override since the default white-on-`--accent` spinner colors are invisible against this button's light/neutral chrome.

**Button content rule exception:** this is a documented exception to "icon OR text, never both" — Google's own button design requires the logo + label together for recognizability, the same category of exception as a loading-spinner + status text.

**Used by:** `#menu-google-signin` (Menu sheet Account section) and the "Continue with Google" button in `src/reviews.js`'s `_showSignInPrompt()` (the "sign in to write a review" gate) — both render the identical markup from a single shared source: `GOOGLE_G_LOGO_SVG`/`GOOGLE_SIGNIN_LABEL`/`GOOGLE_SIGNIN_BTN_HTML` live in `src/icons.js` (this app's existing home for shared inline-SVG icon markup, alongside `PLACE_CONFIG`/`MODE_PATHS`/etc.) and are imported by both `menu.js` and `reviews.js` rather than duplicated — see `docs/PREFERENCE_LOG.md` for the follow-up that brought the two buttons into sync.

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

### `.pl-event-chip`

Inline badge on place list cards indicating the number of active events. Accent-tinted pill. Positioned after the place name alongside sponsor/boycott badges.

### `.pp-ev-card`

Compact event entry inside a place popup. Displays event title, date/time metadata, recurrence icon, and an optional external link button. Lives inside `.pp-events-list`.

### `.ev-list-card`

Full-width event card used in the Events tab of the places panel. Shows title, mosque name, schedule badges, optional description, and action buttons (link + view mosque).

### `.ev-recur-badge` / `.ev-date-badge` / `.ev-time-badge`

Schedule metadata badges inside `.ev-list-card-meta`. Recurring badge uses accent tint pill; date/time badges are plain text secondary color.

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
| `.place-popup-wrap` | bottom, top, left, right — dropped-pin / current-location popups only (`search.js`, `map-controls.js`); combined with `.pin-popup-wrap` in the className |
| `.stop-popup-wrap` | bottom, top, left, right |
| `.eid-popup-wrap` | bottom, top |

Note: directory place details no longer use a MapLibre popup — see "Place detail sheet" below.

---

## Responsive breakpoints

| Breakpoint | Description |
|---|---|
| `max-width: 380px` | Very small phones — tighten search, stack pin actions |
| `max-width: 768px` | Mobile — font-size bumps (≥16 px prevents iOS zoom), touch target sizes, sheet safe-area padding, hide summary bar |
| `min-width: 769px` | Desktop — tab bar moves to right edge (vertical strip), sheets emerge from right instead of bottom |

---

## Component-specific notes

### Popup action buttons (`pp-dir-btn`, `pp-contact-btn`, `pp-share-btn`, `pp-edit-btn`)

Visual chrome comes entirely from `.btn-primary` and `.btn-secondary` templates. In `styles.css` only `flex: 1`, `height: 34px`, and `padding: 0` (padding override — popup buttons are narrower than standard) are set.

**`.pp-contact-btn`** sits between Directions and Share in `.pp-actions` (order: Directions → Contact → Share → Edit). Icon-only (phone icon, no text — consistent with the Button content rule). Renders only when `place.phone` is present; absent phone means the button doesn't render at all, same "absence means unknown" convention as the rest of the Google-enriched fields. Tapping sets `window.location.href = 'tel:' + place.phone` directly. `place.website` is intentionally **not** wired into this button — it already has its own link in the `.pp-contact` row above the tags (phone/website/Google Maps), and the place data model has no place-level email field, so there's no second channel to build a call/email chooser around yet. If an email field is added later, this is the button to extend into a chooser.

### Place detail sheet

`openPlaceSheet()` (`src/places.js`) builds the same `.pp`/`.pp-inner` content that used to live in a floating MapLibre popup, but injects it into `#place-sheet-body` inside `#place-sheet` — a `.sheet` (the same bottom-sheet-on-mobile/right-panel-on-desktop structure as `#places-sheet`/`#dir-panel`), opened via the shared `initSheetDrag()` engine. There is no camera movement tied to opening it — the map stays exactly where it is, matching how the Places list and Directions panel already behave. `#place-sheet-close` doubles as a back button (swapped icon + `fromListScrollTop` restore) when opened from a places-list card, mirroring `#dir-close`'s back-arrow convention.

### `#tf-toggle` vs `.btn-chip`

The tag filter toggle uses `.btn-chip` but JS adds `.open` class instead of `.active`. An override in `styles.css` maps `.open` to the same filled-accent appearance and rotates the chevron arrow.

### `.tab` vs `.btn-tab`

HTML elements have **both** classes. `.btn-tab` provides the base template; `.tab` is retained as the JS selector for state management (`active-tab`, `tracking`, `route-active`) and is where animation keyframes are scoped.

### `#snackbar-close` (route snackbar close button)

Uses `.sheet-x` class (rendered on a blue `--accent` background). In `styles.css` an ID-scoped override sets the background to `rgba(255,255,255,.18)` and the colour to `#fff` to keep contrast against the blue snackbar background.

### Suggest / Edit overlays on mobile

On `max-width: 768px`, the overlays transition from centred modal to bottom-sheet. `display: none` cannot animate, so `.hide` on `#suggest-overlay` and `#edit-overlay` is overridden to `display: flex` with `opacity: 0; pointer-events: none`, and the card slides in via `translateY`.

### Menu sheet — Account section (sign-in, profile, "Your reviews")

Reuses existing templates wholesale rather than inventing new form/list chrome: the sign-in prompt (`#menu-google-signin`/`#menu-email-signin-panel`) is built from `.rv-action-btn`/`.rv-resend-link`/`.rv-field`/`.rv-input`/`.rv-verify-error` (the same classes `src/reviews.js`'s own sign-in prompt uses — both places originally shared the exact same visual component). The signed-in "Your reviews" list reuses `.rv-list`/`.rv-review-card` via the Component Alias Pattern (`.acc-review-row` added as an extra selector alongside `.rv-review-card`, with a `styles.css`-only `flex-direction: row` override so the edit/delete icon buttons sit beside the review text instead of below it) plus `.btn-roundel`/`.btn-roundel-danger` for the edit/delete icon buttons themselves — no new button chrome anywhere in this section.

**`#menu-google-signin` now uses `.btn-google` instead of `.btn-primary`** (see `.btn-google` in §3 above) — it was originally a plain accent-green pill with just the text "Continue with Google", which didn't read as an actual Google sign-in affordance. It's now Google's own standard white/light (dark-theme in dark mode) button with the real multi-color "G" logomark inlined as SVG, per Google's official branding guidelines. This is the one place in the Account section that intentionally does **not** match the app's own palette — see the `.btn-google` writeup for the reasoning. `src/reviews.js`'s own Google sign-in button (`_showSignInPrompt()`) still uses the old `.rv-action-btn.btn-primary` look and was deliberately left untouched in this pass (scoped change, `#menu-google-signin` only) — flagged in `docs/PREFERENCE_LOG.md` as a follow-up to bring into visual consistency with the Menu button.

Only two genuinely new things were added: `.menu-account-panel`/`.menu-account-profile`/`.menu-account-avatar`/`.menu-account-info`/`.menu-account-name`/`.menu-account-email` (a plain flex layout for the signed-in identity chip — initials-in-a-circle avatar using `--accent-soft`/`--accent`, no profile photo rendered even though Google supplies one, to avoid a new `img-src` CSP allowance for a single small avatar), and — **obsolete as of 2026-08-02, see below** — a press-twice-to-confirm delete interaction on `.acc-review-delete` (first click swapped the icon to a checkmark for 3s, a second click within that window deleted). That pattern no longer exists in the codebase in this shape: it's been replaced by the real Yes/No `showConfirmDialog()` component documented below, per explicit user feedback that a press-twice icon-morph didn't read as a clear enough confirmation. Any earlier note in this file or `docs/PREFERENCE_LOG.md` describing `DELETE_CONFIRM_WINDOW_MS`/"click again to confirm" as the current reference is historical — do not point new work at it.

### Generic Yes/No Confirm Dialog (`showConfirmDialog()`, `.confirm-overlay`)

**The current reference for any confirm-before-destructive/state-changing-action pattern**, superseding the press-twice interaction above. A single reusable async function in `src/utils.js` — `showConfirmDialog({ title, message, confirmLabel, cancelLabel, variant, icon })` — returns `Promise<boolean>` (`true` if confirmed). Built and torn down entirely in JS per call (creates `.confirm-overlay`/`.confirm-card`, appends to `document.body`, removes itself after resolving), matching `showToast()`'s own create-on-demand convention rather than a static always-in-the-DOM overlay like `#reviews-overlay`/`#promos-overlay`.

**Shell:** `.confirm-overlay` is a fixed, centered, `--overlay-bg`-backed backdrop (`--z-overlay`) — the exact same fixed-centered-overlay shape as `#promos-overlay`/`#promos-card`, just expressed as reusable classes instead of one static named element, since this is spawned on demand from anywhere in the app rather than owned by one feature module. `.confirm-card` is a small centered card (max-width 320px) with an icon circle (`.confirm-icon`, accent-tinted by default; `.confirm-icon--danger` red-tinted), a title (`.confirm-title`), an optional description (`.confirm-desc`), and two equal-weight peer buttons in `.confirm-actions` (`.btn-secondary` Cancel + either `.btn-danger-filled` or `.btn-primary` for the confirm action, chosen by the `variant` option) — mirroring the "two equal-weight buttons in one row" convention already established by `.menu-account-signin-row`.

**Variant:** `variant: "danger"` (red icon + `.btn-danger-filled` confirm button) for hard-destructive actions with no easy undo, matching `.btn-danger-filled`'s own definition — used for review delete. `variant: "default"` (accent icon + `.btn-primary` confirm button) for a state-changing but non-destructive action — used for account sign-out.

**Dismissal:** clicking the backdrop, pressing Escape, or clicking Cancel all resolve `false`; clicking the confirm button resolves `true`. Calling `showConfirmDialog()` again while one is already open resolves the first call `false` and replaces it, rather than stacking two dialogs — this app never needs more than one confirmation in flight.

**Used by:** `src/menu.js`'s `.acc-review-delete` (Your reviews list, `variant: "danger"`) and `#menu-signout` (`variant: "default"`) — see docs/PREFERENCE_LOG.md for the full before/after writeup. This is now the component to reuse for any future destructive/state-changing confirmation in this app, rather than a native `window.confirm()` (which would break the app's own overlay/toast-driven UI feel) or a second bespoke inline-confirm pattern.

**2026-08-02 addendum — signed-out row layout.** `#menu-google-signin` and the email sign-in toggle now sit in one `.menu-account-signin-row` (`display:flex`) as two **equal-weight peer buttons** instead of a full-width Google button stacked over a small centered `.rv-resend-link` text link. Both are `.rv-action-btn` with `flex: 1` (an even ~50/50 split at the same 44px height); the email toggle changed from a text link to a real text-labeled `.btn-secondary` button ("Continue with email" — mirrors Google's own phrasing), not an icon-only afterthought — an icon-only-email-button treatment was tried first and explicitly rejected ("these buttons should be similar size and looking, one option is not better than the other"). `.btn-secondary`'s *default* border/text (subtle by design everywhere else it's used) also had to be overridden to this app's higher-contrast neutral tokens (`--text-2` border / `--text` label) in this specific row — reusing the default made the email button read as visibly fainter than `.btn-google`'s solid border + near-black text even at matching size. See "Menu sheet visual fixes" below for the full reasoning.

### Menu sheet visual fixes (Support row layout, Google sign-in row, Map View grouping)

Found via real-browser Playwright inspection (not guessed from a screenshot description — see `docs/PREFERENCE_LOG.md` for the root-cause writeup), then extended mid-task by a follow-up round of feedback that changed the target layouts for all three:

- **`.menu-row` (Support section rows) is inset from the sheet's own edges, and Contact us / Wishlist now sit side by side instead of stacked.** The hover pill previously shared `.sort-opt`'s full-bleed fill (`background: var(--surface-2)` edge-to-edge, no horizontal margin) — fine inside the narrow `#sort-wrap` dropdown where the rounded corners *are* the container's own corners, but inside the much wider Menu sheet it read as a stray floating box flush against the sheet's own edges. `.menu-row` itself gets `border-radius`/inset sizing; a new `.menu-row-pair` wrapper (`display:flex`) holds both rows side by side, supplying the same `var(--sp-3)` outer inset the standalone row used to get from its own margin (`.menu-row-pair .menu-row` switches to `flex:1; width:auto; margin:0` inside the pair) — so the breathing-room fix carries over intact to the new two-up layout instead of being lost when the layout changed.
- **`#menu-google-signin` and the email sign-in option now share one row as two equal-weight peer buttons**, instead of stacking a full-width Google button over a small centered text link. An intermediate treatment (Google button taking most of the row, small icon-only email button beside it) was tried and explicitly rejected — neither button should read as more "primary" than the other. Both are `.rv-action-btn` with `flex: 1` (an even ~50/50 split, same 44px height); Google keeps its full logo + exact required "Continue with Google" label (their guidelines mandate both together, and the specific text can't be abbreviated), and the email option is a real text-labeled `.btn-secondary` button ("Continue with email" — deliberately mirrors Google's own phrasing) at matching size/weight — a small `.menu-account-signin-row .btn-secondary` override re-tightens its font-size/weight to 14px/medium (undoing `.rv-action-btn`'s 16px/bold default) so it visually matches `.btn-google`'s own override instead of looking heavier or lighter. `.btn-google`'s own height is unchanged from `.rv-action-btn`'s `var(--h-submit)` (44px — see the correction note below); only its `font-size` is overridden to `var(--txt-base)` (14px), matching Google's documented label spec, since the shared 16px bold CTA label was the actual source of the "oversized" complaint, not the height.
- **Second-pass fix: equal size wasn't enough — border/text contrast had to match too.** Even after the equal-width fix above, `.btn-secondary`'s *default* border/text (`--border` `#e2e2e2` / `--text-2` `#525252`) is deliberately subtle everywhere else it's used in this app (a genuinely de-emphasized secondary action) — reused as-is next to `.btn-google`'s solid `~#747775` border + near-black `#1f1f1f` text, the email button still read as visibly fainter/less "real" even at identical size. Fixed with a scoped override, `.menu-account-signin-row .btn-secondary { border-color: var(--text-2); color: var(--text) }` (plus a `:hover` darkening to `--text`) — this app's own higher-contrast neutral tokens, not a literal copy of Google's specific brand gray. Both tokens already have correct dark-mode overrides, so no separate dark-mode rule was needed.
- **Accepted trade-off:** at the narrowest tested width (380px), "Continue with Google"'s exact required text wraps to two lines within its half of the row (and "Continue with email" may too, at some widths, now that both use matching phrasing length) — verified via screenshots that this doesn't clip or look broken (the pill stays 44px tall, text stays vertically centered) — a reasonable trade-off given Google's fixed label text can't be shortened and the row is a genuine 50/50 split.
- **Correction, found by an automated test, not visual review: `--h-input` doesn't exist.** The first pass of this fix set `.btn-google { height: var(--h-input) }`, following what `docs/DESIGN_SYSTEM.md`'s own Component Sizing table (incorrectly) documents. `--h-input` was never actually defined anywhere in `design-tokens.css` — a `var()` reference to an undefined custom property with no fallback resolves `height` to its initial value (`auto`), which silently collapsed the button to ~20px (just the 14px label's line-height) instead of 44px. This slipped past *visual* screenshot review (a uniformly-shrunk centered-content button doesn't obviously look "broken" at a glance) but was caught immediately by a numeric Playwright bounding-box assertion (`tests/04-map-controls.spec.js`). Also discovered while investigating: `--h-submit` in this codebase is actually `44px`, not the `48px` this same Component Sizing table documents — meaning the *original* (pre-fix) Google button was already 44px all along, not 48px as assumed from the docs. **Fix:** removed the bogus height override entirely (the button already inherits the correct, real 44px from `.rv-action-btn`) and kept only the font-size change. `docs/PREFERENCE_LOG.md` has the full incident writeup; the Component Sizing table's stale `--h-input`/`--h-submit`/`--h-field` values are flagged there as a separate, not-yet-fixed documentation-drift finding (out of scope for this pass to reconcile everywhere).
- **`#style-panel` (Map View section) is now grouped into two labeled sub-sections side by side in the same row — "Theme" (Light/Dark/Auto) and "Overlay" (Satellite/Heatmap) — replacing the flat, unlabeled row of 4 thumbnails with a stray divider between the 2nd and 3rd item.** The divider was presumably an earlier, unfinished attempt at this same grouping instinct; it's now a real `border-left` on the second `.style-group`, reusing `--border` like every other divider in this app. Label choice: **"Theme"** for the light/dark/auto trio (this app's own existing vocabulary — `setTheme()`/`currentTheme` already use "theme" internally) and **"Overlay"** for satellite/heatmap (both are literally rendered as an overlay on top of the base map, not a base theme swap) — considered "Layer"/"Style" as alternatives but "Overlay" reads least ambiguous next to "Theme" specifically. Any leftover space after the two groups (they're sized to their own content: 3 vs 2 options, left-aligned) is now expected/normal, not a bug — the original whitespace complaint was about 4 *unlabeled* thumbnails not filling the row for no apparent reason; a labeled, intentionally-grouped pair of controls not needing the full row width is a completely different, non-buggy situation. Thumbnail size dropped from 52px to 44px (and `.style-opt` padding tightened) so both groups reliably fit in one row without wrapping even at this app's narrowest documented breakpoint (380px) — confirmed via `element.scrollWidth` checks at 380px and 412px, not just visual judgment. The old `<399px` shrink-thumbnails media-query override is now dead code (identical to the new default) and was removed.

### Menu sheet — Preferences section (prayer method/madhab, 12-hour time, reduce motion, Auto theme)

Real preference controls, replacing the former "More settings coming soon" placeholder — grew from 2 to 4 total across this task (2 requested up front, 2 more added per an explicit "add more preferences if possible, 1-2 tasteful additions" follow-up request):

- **Prayer calculation method + Asr madhab** — two `<select>` elements (`#pref-prayer-method`, `#pref-prayer-school`) styled with `.rv-field`/`.rv-field-label` (reused from the Account section's email field — no new field-wrapper chrome) plus a new `.rv-select` class. `.rv-select` adds the custom dropdown chevron as a **Component Alias** on `.sg-label select`'s existing rule (Suggest-form select styling — appearance-reset + inline chevron SVG + dark-mode chevron-color override), rather than duplicating that chevron treatment a second time. `#pref-prayer-method`'s 23 options are populated by JS from `prayer.js`'s exported `PRAYER_METHODS` list (fetched directly from `https://api.aladhan.com/v1/methods`, not guessed); `#pref-prayer-school`'s 2 options (Standard / Hanafi) are static HTML, same as any other short hardcoded `<select>` in this app (`#sg-type`, `#ed-type`).
- **Reduce motion** — a new `.pref-switch`/`.pref-switch-thumb` toggle-switch template (§3-adjacent; no on/off switch existed anywhere in this app before this control). A `<button role="switch" aria-checked>` rather than a native checkbox, matching this app's existing button-driven state-toggle convention (`.btn-chip.active`, `.sort-opt.active`) instead of introducing a native form control that would need its own separate styling system. New dedicated size tokens: `--switch-w` (44px), `--switch-h` (24px), `--switch-thumb-size` (18px). Off state: `--surface-3` track. On state (`.on` class): `--accent` track, thumb translated via `transform: translateX(...)` (GPU-composited, not a layout-triggering property). This is genuinely the first on/off switch component in the codebase — reuse it for any future binary preference (the 12-hour-time toggle below reuses it immediately) rather than inventing a second pattern.
- **12-hour prayer times (added later, per the "add more preferences" follow-up)** — a second `.pref-switch` instance. Off (default) keeps this app's existing 24-hour `en-GB` time formatting exactly as it always was; on switches to `en-US`-locale `hour12` formatting (e.g. "5:12 PM") for the Ramadan suhoor/iftar labels and the expanded prayer-times list. Purely a display-format change — no re-fetch needed, since the underlying prayer time data doesn't change — so `prayer.js` exports a lightweight `refreshPrayerTimeDisplay()` (no network call) alongside the network-hitting `refreshPrayerTimes()` used by the method/madhab selects, both funnelling through one shared `_applyPrayerTimesToUI()` renderer so there's exactly one place that pushes `prayerTimesToday` out to the DOM.
- **"Auto" theme (added later, per the "add more preferences" follow-up — check Map View's Light/Dark for a 'follow system theme' option)** — confirmed via grep that this app had **zero** existing `prefers-color-scheme` handling anywhere before adding this, so it's purely additive, not a competing mechanism with anything pre-existing. Lives as a third `.style-opt` in the Map View section's Theme group (not the Preferences section — it's a Theme option, not a standalone preference row), reusing the exact same button/thumbnail template as Light/Dark. `map-controls.js` gained a `themeMode` ("light"/"dark"/"auto") distinct from the pre-existing `currentTheme` ("light"/"dark", the actually-*resolved* visual theme) — "auto" isn't a third visual theme, it resolves to light or dark based on `matchMedia("(prefers-color-scheme: dark)")` and keeps following that media query live via a `change` listener for as long as "auto" stays selected, mirroring the exact "explicit override on top of an OS-level media feature" shape `utils.js`'s reduce-motion toggle already established (same session, same pattern, applied to a second OS-level preference). The "Auto" thumbnail (`.thumb-auto`) has no real map style to preview, so it's a fixed light/dark diagonal split (`linear-gradient(135deg, #eef1ee 50%, #1a1a1e 50%)`) — a deliberately fixed, theme-independent pair of tones, same reasoning as the Google "G" logo colors never being recolored by dark mode (the whole point of the swatch is to show both halves at once, regardless of which theme is currently active).
- **Layout:** `.menu-pref-panel` (styles.css) mirrors `.menu-account-panel`'s exact padding (`var(--sp-2) 14px var(--sp-4)`) so every Menu sheet section's content lines up under the same 14px left inset as its section label — no new spacing scheme invented for this section.
- **Single reduce-motion mechanism, not two competing ones.** `utils.js`'s `isReduceMotionActive()`/`setReduceMotionOverride()`/`getReduceMotionOverride()` are the one source of truth for "should this app dampen animations right now?" — an explicit override (this Preferences toggle) takes precedence over the OS-level `prefers-reduced-motion` media feature; absent an override, the OS setting is followed live (a `matchMedia(...).addEventListener("change", ...)` listener keeps the class in sync if the user changes their OS setting while the app is open). Applied via `html.reduce-motion`/`body.reduce-motion`, mirroring the exact `html.dark-mode`/`body.dark-mode` class-toggling pattern `map-controls.js`'s `setTheme()`/`restoreSavedTheme()` already use (an IIFE applies the class as early as possible, before first paint, the same way dark mode does). The CSS that used to be a bare `@media (prefers-reduced-motion: reduce)` block in `design-tokens.css` is now scoped to `html.reduce-motion *` instead — both `animateElementHeight()` (utils.js) and `reviews.js`'s review-panel-close animation were updated to check `isReduceMotionActive()` instead of querying the raw media feature directly, so every motion-related check in the codebase (CSS and JS) now reads from this one mechanism.
- **Refresh behavior:** changing either prayer dropdown calls `prayer.js`'s `refreshPrayerTimes()` export, which re-fetches today's times using the last-known coordinates (no new geolocation prompt) and updates every dependent bit of UI (Ramadan suhoor/iftar labels, the collapsed snack's countdown, the prayer watcher, and — if already open — the expanded prayer-times list) via the shared `_applyPrayerTimesToUI()` renderer.
- **Lazy-load discipline preserved:** `menu.js` (imported eagerly, wires the Menu sheet on every page load) never statically imports `prayer.js` (a deliberately lazy, non-critical module per `src/app.js`'s post-map-load `Promise.all`). `initMenuPreferences()` dynamically `import()`s `prayer.js` instead — called from `app.js` right after `initMenuAccount()`, by which point `prayer.js` is already loaded and initialized by the same `Promise.all` block, so the dynamic import just resolves to the cached module namespace rather than forcing a second, earlier load.

### Firebase Auth CDN loading (`index.html` / `src/auth.js`)

Firebase's SDK loads exactly like MapLibre GL: two SRI-pinned `<script type="module" src="https://www.gstatic.com/firebasejs/10.13.0/...">` tags in `index.html` (script-src/connect-src/frame-src additions in `_headers`; `identitytoolkit.googleapis.com`/`securetoken.googleapis.com`/the `halal-map-karamah.firebaseapp.com` authDomain/`apis.google.com` are the extra CSP entries Firebase Auth specifically needs beyond the SDK's own script origin). `src/auth.js` then has its own top-level `import` statements from those exact same URLs — the browser's module map de-duplicates by URL, so this doesn't trigger a second network fetch; it's just how `auth.js` gets the SDK's bindings into its own module scope. `auth.js`/`reviews.js`'s use of the SDK is still lazy at the *app-code* level (dynamically `import()`-ed only after map load, alongside this app's other non-critical modules), even though the raw CDN bytes are fetched eagerly by the two script tags — the same trade-off MapLibre itself already makes (a large, unconditionally-eager CDN dependency, functionally required for anyone to use the map at all vs., here, optional for anyone who never signs in).

---

## §8 — Sponsorship Templates

Templates for sponsored place UI elements. All sponsorship visuals use `--sponsor` / `--sponsor-soft` token aliases (mapped to the gold palette). Boycott always suppresses sponsorship — client code checks `!place.boycott` before rendering any sponsor UI.

### `.pp-sponsor`

Gold badge pill displayed in popup header row next to the type badge. Contains an ℹ️ SVG that opens a tooltip on tap.

**Shape:** pill (`--r-pill`)
**Colours:** `--sponsor-soft` background, `--sponsor` text
**Used by:** `openPlaceSheet()` in `places.js`

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
