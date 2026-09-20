# Manarah — Design System

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
| `--logo-word` | `#352359` | Official Manarah wordmark colour; dark mode adapts it against the dark canvas |
| `--sponsor` | `var(--gold)` | Alias — sponsor badge/chip colour |
| `--sponsor-soft` | `var(--gold-soft)` | Alias — sponsor badge/chip background |
| `--success` | `#1FA86A` | Green — mosques, confirmed features |
| `--success-soft` | `#e8f6ee` | Green tint surface |
| `--danger` | `#d64545` | Red — errors, destructive actions |
| `--danger-vivid` | `#c62828` | Red hover/active — prominent danger state |
| `--danger-soft` | `#fce8e8` | Red tint surface |
| `--review` | `#d97706` | Amber — star-rating chip |
| `--review-soft` | `#fef3c7` | Amber tint surface |
| `--warning` | `var(--review)` | Alias — warning/cautionary status (e.g. "opening soon"/"closing soon" hours badge, nav turn-instruction chip). **2026-08-03 fix:** this token was referenced in a couple of places but never actually defined anywhere in `:root` — a latent bug where those rules silently fell back to inherited text color instead of amber. Aliased onto `--review` (same hue, already has a tested dark-mode override) rather than introducing a new hex. |
| `--warning-soft` | `var(--review-soft)` | Alias — warning tint background |

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
| `--canvas` | `#f7f7f5` | App/page/map fallback background behind primary UI surfaces |
| `--surface` | `#ffffff` | Primary card / sheet background |
| `--surface-2` | `#f2f2f0` | Secondary fill, disabled backgrounds, segment bar bg |
| `--surface-3` | `#e4e4e1` | Stronger fill, hover border colour |
| `--text` | `#111111` | Primary body text |
| `--text-2` | `#525252` | Secondary / subdued text |
| `--text-3` | `#8c8c8c` | Placeholder / muted / icon default |
| `--border` | `#e2e2e2` | Default border |
| `--border-light` | `#efefef` | Separator / divider lines |

Dark mode mirrors the same compact hierarchy in `styles.css`: `--canvas`
`#090a0a`, `--surface` `#111312`, `--surface-2` `#1a1d1c`, and
`--surface-3` `#272b29`. Keep future neutral fills on this ladder instead of
adding one-off blacks/whites.

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

**Phone typography (2026-08-09):** at `max-width: 768px`, the phone text scale compresses app-wide (`--txt-xs: 11px`, `--txt-sm: 12px`, `--txt-base: 13px`, `--txt-lg: 15px`). Form controls and search/dropdown inputs use normal body-sized text (`--txt-base`) rather than the older oversized `--txt-lg`/`--txt-xl` phone overrides. Supporting labels/chips/segments use `--txt-sm`, list titles use `--txt-sm`, list subtitles/meta use `--txt-xs`, and sheet/form headings use `--txt-lg`. The user prefers the extra map/content clarity over preserving a 16px input floor.

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
| `--t-phone-chrome-slide` | `.3s cubic-bezier(.32,.72,0,1)` | Phone floating-chrome positional shifts |
| `--t-phone-chrome-compact` | `.42s cubic-bezier(.16,1,.3,1)` | Phone map-interaction visual scaling |
| `--t-phone-refine-bar` | `.52s cubic-bezier(.16,1,.3,1)` | Phone Places list-focus refine-bar reveal |
| `--t-phone-refine-bar-collapse` | `.38s cubic-bezier(.16,1,.3,1)` | Phone Places list-focus refine-bar tuck |
| `--t-welcome-logo-enter` | `.38s cubic-bezier(.16,1,.3,1)` | Compositor-only welcome-logo opacity entrance |
| `--t-welcome-logo-breathe` | `1.3s cubic-bezier(.16,1,.3,1)` | Clearly perceptible compositor-only logo breathing while startup work continues |
| `--t-welcome-progress` | `1.05s cubic-bezier(.65,0,.35,1)` | Continuous gold progress-rule sweep during startup |
| `--t-welcome-overlay-exit` | `.42s cubic-bezier(.16,1,.3,1)` | Welcome overlay fade-out during the logo-to-map handoff |

### Scale Tokens

| Token | Value | Use |
|---|---|---|
| `--scale-phone-mainbar-compact` | `.84` | Phone mainbar scale while the map canvas is being manipulated |
| `--scale-phone-chrome-compact` | `.82` | Phone floating-control scale while the map canvas is being manipulated |
| `--welcome-logo-vw` | `58vw` | Desktop welcome logo viewport-relative width |
| `--welcome-logo-max-w` | `430px` | Desktop welcome logo maximum width |
| `--welcome-logo-tablet-vw` | `76vw` | Tablet/phone welcome logo viewport-relative width |
| `--welcome-logo-tablet-max-w` | `360px` | Tablet/phone welcome logo maximum width |
| `--welcome-logo-phone-vw` | `82vw` | Narrow-phone welcome logo viewport-relative width |
| `--welcome-logo-phone-max-w` | `320px` | Narrow-phone welcome logo maximum width |
| `--welcome-logo-rest-scale` | `.975` | Lower bound of the loading-state logo scale |
| `--welcome-logo-rest-opacity` | `.9` | Lower bound of the loading-state logo opacity |
| `--welcome-progress-w` | `76px` | Welcome progress-rule track width |
| `--welcome-progress-segment-w` | `24px` | Moving welcome progress segment width |

Phone map-interaction scaling is applied to runtime-created zone wrappers
(`#phone-chrome-top-zone`, `#phone-chrome-right-zone`,
`#phone-chrome-bottom-zone`), not to individual floating pills. Keep that zone
pattern so top-left actions, the right rail, and the bottom nav preserve their
internal alignment while shrinking proportionally.

### Component Sizing

Place media uses `--place-media-card-w`/`--place-media-card-h` for the compact
snap gallery, `--place-media-nav-size` for desktop overflow controls, and
`--photo-viewer-window-w`/`--photo-viewer-window-h`/
`--photo-viewer-stage-bg` for the in-app expanded viewer. The gallery belongs
directly after place tags and before
hours. Its image buttons open the viewer inside `#app`; the viewer keeps
previous/next controls, arrow-key navigation, an Escape close action, focus
return, touch-swipe navigation, and a live position count. Place-gallery and
review-photo expansion now use the same standard 420px centered form-window
width on desktop and become the same edge-to-edge safe-area viewer on phones.
Opening and closing fade the scrim while the viewer stage fades and moves with
the shared motion tokens. Gallery counts and the place sheet's compact review
count reuse the filled `.count-badge`/`.pl-city-count` treatment; the full
reviews overlay retains its descriptive “N reviews” summary text.
`--review-media-size` sizes published review thumbnails,
`--review-preview-size` sizes selected-upload previews, and
`--review-media-remove-size` sizes the preview's icon-only remove control.
`--review-compose-min-h` keeps the review textarea compact while preserving a
comfortable three-line writing area. The review composer aligns label/counter
and photo-control/file guidance into paired rows instead of stacking each
supporting label on a separate line.
`.pp-media-credit`/`.pp-media-provider`, `.rv-image-picker`, and
`.rv-image-remove` are shared media primitives; gallery and form layout remains
in `styles.css`.

On phones, the place-detail sheet uses content-bounded snap points. Its maximum
height is `min(natural content height, 90dvh)`. The shared 50% and 75% stops are
included only when they fit below that cap, and the measured cap is always the
final stop. For example, a 40%-tall place has only a 40% stop, while a place
taller than 90% has 50%, 75%, and 90% stops. This prevents expansion into empty
space while keeping long place details progressively expandable.

| Token | Value | Use |
|---|---|---|
| `--h-submit` | `44px` | Submit/CTA button height |
| `--h-field` | `46px` | Direction / date input row height |
| `--place-media-card-w` | `154px` | Compact place-gallery thumbnail width |
| `--place-media-card-h` | `102px` | Compact place-gallery thumbnail height |
| `--place-media-card-w-phone` | `132px` | Phone place-gallery thumbnail width |
| `--place-media-card-h-phone` | `88px` | Phone place-gallery thumbnail height |
| `--place-media-nav-size` | `30px` | Fine-pointer gallery rail controls |
| `--photo-viewer-stage-bg` | `oklch(0.17 0.01 155)` | Neutral dark image-containment surface |
| `--photo-viewer-window-w` | `420px` | Shared desktop place/review photo-window width |
| `--photo-viewer-window-h` | `min(620px, 85dvh)` | Shared desktop place/review photo-window height |
| `--photo-viewer-enter-scale` | `0.98` | Shared photo-viewer opening/closing scale |
| `--count-badge-min-w` | `22px` | Shared filled numeric-count badge width |
| `--h-search` | `48px` | Search box height |
| `--places-refine-max-h` | `360px` | Upper bound for animating the phone Places refine bar open/closed |
| `--review-media-size` | `88px` | Published review thumbnail size |
| `--review-preview-size` | `88px` | Selected review-upload preview size |
| `--review-media-remove-size` | `44px` | Touch-safe preview remove control |
| `--review-compose-min-h` | `76px` | Compact review textarea minimum height |

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

Dynamic window-style overlays use `animateElementHeight()` from `src/utils.js` around content-mode swaps. The helper pins the current card height, runs the DOM change, measures the natural height, then animates `height` with `--t-spring`. Use this for reviews verification/rating swaps and event/Eid-style overlay windows whose card height is natural. Do not use it on static-height form cards such as suggest, edit, contact, or wish; if a section inside one of those fixed cards needs to reveal, animate only that inner section so the outer card size remains stable.

`src/menu.js`'s Account section (`_animateMenuPanelHeight()`) is a second consumer of the same shared helper, scoped to `.menu-account-panel` — the toggle open/close of `#menu-email-signin-panel` (and its swap to the "check your email" message) animates the same way as reviews.js's `_animateReviewCardHeight()`/`.rv-overlay-card`. `.menu-account-panel` needs its own `transition: height var(--t-spring)` in `styles.css` for this to work — `animateElementHeight()` relies on the target element's own CSS transition, it doesn't set one inline. `#menu-email-signin-panel` also carries a `border-top`/`padding-top` divider (the same convention as `.pp-reviews`) so the expanded panel reads as attached to the sign-in row above it rather than a disconnected stack.

**`animateElementHeight()`'s `onSettled` option (2026-08-05, later round).** New, optional, backward-compatible callback fired exactly once a height change is fully done and visually settled — synchronously for the skip/reduce-motion/no-real-change cases (nothing is animating, so "settled" is immediate), otherwise once the real CSS transition's own `transitionend` fires (or the fallback timer, if it never does — reuses the SAME completion-detection machinery `animateElementHeight()` already had internally, not a new mechanism). Added specifically for `src/reviews.js`'s `_animateReviewCardHeight()`, which needs to restore a temporarily-suspended `overflow` value once (and only once) the tween genuinely finishes — see that function's own doc comment, and the "reviews sign-in panel less smooth than Menu's" entry below, for why.

**Menu sheet's inner/outer height sync is now ResizeObserver-driven, not a synchronous post-call (2026-08-05, later round — supersedes the "resnap timing" reasoning in the entry below).** `src/menu.js`'s `_resyncMenuSheetHeight()` (keeps `#mp-height-wrap`/`#menu-sheet` in sync with the Account section's real height) is no longer called manually, synchronously, right after `_animateMenuPanelHeight()` from each toggle/back-link handler — a `ResizeObserver` on `#menu-account-body` (stable across re-renders — only its `innerHTML` is ever replaced) now fires it instead, any time the Account section's real rendered size genuinely changes, for any reason. See the "Menu sheet dead-space bug, actual root cause" entry immediately below for the full investigation and why the previous, synchronous-call approach was wrong despite its own confident reasoning.

### Menu sheet dead-space bug — actual root cause (2026-08-05, later round)

A prior round added `_resyncMenuSheetHeight()`, called synchronously immediately after `_animateMenuPanelHeight()` in every sign-in-panel toggle/back-link handler, reasoning that a synchronous `offsetHeight`/`scrollHeight` read taken right after setting a new inline `height` on a transitioning element always reflects the FINAL target, never a mid-transition value. The user tested this live and confirmed the sheet still left dead space below the collapsed email/password panel — the fix didn't work.

**Why that reasoning was wrong, confirmed by re-reading `animateElementHeight()`'s own mechanics (not re-asserted):** the claim is true for `animateElementHeight()`'s OWN internal measurements — but only because every one of those reads happens while the element's OWN `transition` is explicitly `"none"` (disabled): it disables the transition, measures, THEN re-enables the transition and sets the final value, and never reads that element's geometry again afterward. `_resyncMenuSheetHeight()`'s `_syncPaneHeight(menuPaneEl)` call does something categorically different: it reads `menuPaneEl.offsetHeight` — an ANCESTOR of `.menu-account-panel` — in the very same script tick `.menu-account-panel`'s OWN height transition was just re-enabled and retargeted by the PRECEDING `_animateMenuPanelHeight()` call. At that instant zero real time has elapsed on that transition's timeline and no rendering frame has been produced for the new target yet, so a forced synchronous reflow of an ancestor whose size depends on that just-(re)started transition does not reliably report the transition's END value — reading a DIFFERENT element THROUGH an already-active transition on a descendant is not the same, safe case as reading the SAME element with its own transition temporarily disabled. The previous round's reasoning silently generalized from the latter to the former. Confirmed the live symptom matches exactly: the resync ran once, captured an essentially-unchanged (stale) height, and nothing ever corrected it once the panel's own transition had genuinely finished settling later.

**The fix — ResizeObserver, not a smarter synchronous read.** Rather than trying to determine WHEN a synchronous read is safe (a genuinely ambiguous CSS-transition-timing question), a `ResizeObserver` on `#menu-account-body` sidesteps the question entirely: it only ever invokes its callback once the browser has actually computed a real layout for a real rendering opportunity — whether that's an instant, non-transitioned change (reduce motion) or one genuine frame of an in-progress CSS transition. Re-running `_syncPaneHeight()` + `menuSnap.remeasure()` from there needs no theory about timing, because every read it does happens strictly after a real layout pass — always correct for that frame. Since ResizeObserver keeps firing for every subsequent frame `.menu-account-panel`'s height is still changing, `#mp-height-wrap`/`#menu-sheet` continuously, smoothly chase the real value in lockstep with the panel's own animation, all the way to settlement, instead of committing to one unreliable guess at t=0. `initSheetDrag()`'s own snap-cap system (`freshCalc()`/`contentHeight()`/`remeasure()`/`softRemeasure()`) was re-read in full as part of this investigation and confirmed NOT to be an independent contributing cause here — `remeasure()` freely resizes `#menu-sheet` both up and down (no asymmetric "only grows" cap), it just depends on `#mp-height-wrap`'s own height already being correct, which is exactly the layer the ResizeObserver now keeps honest.

### Menu ↔ Profile swap transition (superseded 2026-08-03 — see "Menu/Profile merged sheet" below)

Navigating `src/menu.js`'s signed-in "Profile →" row into `src/profile.js`'s `#profile-sheet` (and back, via Profile's back-arrow close button) used the same generic "close the current sheet, open the destination" pattern every other Menu-to-destination navigation uses (e.g. Menu → place-detail) — but Menu and Profile are both full account-hub sheets of similar size occupying the exact same screen region, so each independently playing its own default open/close transform in that same spot read as two separate windows swapping rather than one continuous surface changing content (user-reported UX complaint, 2026-08-03).

**Fix (this round, since superseded):** `swapSheetsHorizontally()` (`src/utils.js`) coordinated a horizontal "tab swap" between exactly this one sheet pair — the outgoing sheet slides fully off-screen one direction while the incoming sheet slides in from the other, as a single continuous motion. Wired from `src/menu.js`'s `_wireSignedInView()` (forward: Menu → Profile) and `src/profile.js`'s `_closeToMenu()` (back: Profile → Menu).

**Why this wasn't actually enough:** the user tested it and reported it still "wobbled." Root cause: Menu and Profile were still two *independent* `.sheet` elements, and this app's `.sheet` auto-sizes its own height to its own content (`initSheetDrag()`'s drag/snap mechanism). Profile has far more content than Menu (identity card, stats grid, 3 lists, action buttons vs. a handful of short sections), so even with the two sheets' slide perfectly synchronized, each was independently re-measuring/re-snapping to ITS OWN natural height underneath that slide — a visible height reflow the coordinated transform couldn't mask. Synchronizing the *slide timing* solved the wrong half of the problem; the actual fix had to remove the *second sheet* (and its independent auto-height) entirely. See "Menu/Profile merged sheet" below for the real fix, and the mechanism section immediately below this one for how the old (now-removed) two-class approach worked, kept for historical context.

**Old mechanism (removed — `swapSheetsHorizontally()`, `.sheet--swap-left`/`-right`, and `EVT.NAV_TO_MENU` no longer exist in the codebase):**
- Two directional modifier classes, `.sheet--swap-left` / `.sheet--swap-right`, lived in `src/styles/styles.css` immediately after the base `.sheet.shut` rule.
- Each only overrode `.sheet.shut`'s **resting transform** (`.sheet.shut.sheet--swap-left { transform: translateX(-120vw); opacity: 0; }`, mirror for `-right`) — no transition duration/easing of its own, reusing `.sheet`'s own already-declared transition so outgoing/incoming sheets animated on an identical timing curve automatically.
- `120vw` (not `±100%`) so the same two rules were correct at both breakpoints (mobile bottom sheet vs. desktop 420px side panel).
- `swapSheetsHorizontally(outSheet, inSheet, direction, closeOutFn, openInFn)` added the modifier class to both sheets, then called each sheet's own unmodified close/open function, so drag-to-dismiss priming, the mobile height-measurement dance, the `hidden`-attribute timeout, and scrim show/hide all still worked normally. The modifier was removed again on `transitionend` (with a `SWAP_CLEANUP_MS` timeout fallback).
- Scoped narrowly: only the Profile-link click and back-button click called it; `openMenuSheet()`/`closeMenuSheet()`/`openProfileSheet()`/`closeProfileSheet()` themselves were untouched.

### Menu/Profile merged sheet

**The actual fix** for the "wobble": Menu and Profile are no longer two sheets at all — they're two internal panes, `#menu-sheet-body` and `#profile-sheet-body`, riding side-by-side inside one `#mp-pane-track`, inside the single physical `#menu-sheet` element. There is exactly one `initSheetDrag()` instance for this whole surface (owned by `src/menu.js`, the "shell"); `src/profile.js` supplies only the Profile pane's content via an exported `loadProfileContent()` that `src/menu.js` calls whenever it slides to that pane. Internal Menu ↔ Profile navigation never calls the sheet's own `open()`/`close()` at all — only `_setActivePane()` (`src/menu.js`) runs, which toggles a `.mp-pane-track--profile` modifier class (translateX 0 ↔ -50%) and updates the shared header (title text, and the close button's icon/behavior — X-and-real-close on the Menu pane, back-arrow-to-Menu-pane on the Profile pane, the same "back, not close" convention as `src/places.js`'s `_setPlaceSheetCloseAsBack()`).

**How height stability is achieved — 3 iterations, same day (2026-08-03):**

- **Round 1 (superseded):** two independent `.sheet` elements, coordinated by a since-removed `swapSheetsHorizontally()` helper — each sheet still auto-sized to its own content height, so even a perfectly-synced slide still had a height reflow underneath it (Profile is far taller than Menu).
- **Round 2 (superseded):** merging into one sheet with two panes fixed the *reflow*, but the mechanism used to do it introduced a *new* bug. `#mp-pane-track` declared no `align-items` override, so it used flexbox's own default, `stretch`. Per the flexbox spec, a row with `align-items: stretch` and no explicit cross-size computes its own height as the **tallest child's natural content height**, then stretches every other child to match — automatic, zero JS bookkeeping, and since both panes are permanently mounted (never `display: none`, only `inert`/`aria-hidden` + translateX), both always contributed to that calculation regardless of which was showing. This made `#mp-scroll`'s measured height identical no matter which pane was active — genuinely eliminating the reflow — but at a cost: whichever pane was **shorter** than its sibling got force-stretched to match, and since a `.mp-pane`'s own children are normal block-flow (they don't rubber-band to fill the stretched space), the leftover height just sat there as a permanent block of dead white space below the pane's real content, all the way down to the sheet's rounded bottom edge (user-reported via screenshot: an empty Profile pane before its real data loads). Freezing at the tallest-possible height forever is a *stronger* fix for the reflow than "carefully synchronize two animations," but it solves the wrong problem — the sheet should visibly resize to fit whichever pane is showing, not pin at the worst case indefinitely.
- **Round 3 (current):** `.mp-pane-track` no longer stretches its children — `align-items: flex-start` lets each `.mp-pane` size to its own real content, always. But the row's own height, left on `auto`, would *still* equal the taller sibling's height (a flex row's own auto cross-size is the tallest hypothetical item's size regardless of `align-items` — that property only controls whether items are stretched to fill it, not what the row's own size computes to). So `.mp-pane-track` gets an explicit `height: 100%` instead, mirroring `#mp-scroll`'s own height — and `#mp-scroll`'s height is now JS-owned: `src/menu.js`'s `_syncPaneHeight()` (a thin wrapper around `utils.js`'s `animateElementHeight()`, extended with a `measureHeight` override and a `keepExplicitHeight` option for this exact use case) measures the ACTIVE pane's own `offsetHeight` directly (accurate now that panes aren't stretched — the utility's own default "set height:auto, remeasure" trick would still read the tallest-sibling value, since both panes remain permanently mounted) and smoothly tweens `#mp-scroll` to that value on every `_setActivePane()` call, never releasing it back to `auto` afterward (which would instantly reopen the round-2 bug, since `.mp-pane-track`'s `height: 100%` would then resolve against an indefinite ancestor and fall back to auto/tallest-sibling itself). `.mp-pane-track` also gained `overflow: hidden`, so whichever pane isn't active (often the taller one) is hard-clipped below the active pane's height — not just visually hidden but never scroll-reachable either (relying on `#mp-scroll`'s own `overflow-y: auto` alone would let a user scroll down into the inactive pane's blank tail).

  **Keeping the slide and the resize in sync without them fighting:** the height tween (`#mp-scroll`) and the horizontal slide (`#mp-pane-track`'s `transform`) are two *independent* CSS transitions on two *different* elements, both triggered from the same synchronous `_setActivePane()` call, deliberately not the same element — `animateElementHeight()` briefly sets `element.style.transition = "none"` on whatever element it's given as part of its pin/measure/release dance, which would cancel `#mp-pane-track`'s own transform transition (snapping it instantly instead of animating) if the utility were pointed at `#mp-pane-track` itself. Both transitions are hardcoded to the identical `0.32s var(--ease-expo)` so the slide and the resize read as one coordinated motion, not two independently-timed ones.

  **Async content growth (Profile's real data arriving after "Loading…"):** `_goToProfilePane()` calls `_syncPaneHeight()` a *second* time after `loadProfileContent()` resolves — without it, `.mp-pane-track`'s `overflow: hidden` would permanently clip Profile's real (usually taller) content at its earlier placeholder height, since `#mp-scroll`'s pinned height only changes when something explicitly asks it to. This second call is guarded by `_activePane === "profile"`: if the user already navigated back to Menu by the time the async load resolves, resizing `#mp-scroll` at that point would incorrectly resize the *currently-visible* Menu pane based on Profile's unrelated content; the next real switch to Profile measures its by-then-loaded height correctly on its own, so skipping the resize here loses nothing.

  **Keeping `initSheetDrag()`'s drag-snap cap in sync:** switching panes now changes what `#mp-scroll`'s real content height *is* (round 2's shared-tallest-height approach never needed this, since the cap never changed on a pane switch). `_setActivePane()` calls `menuSnap.softRemeasure()` right after `_syncPaneHeight()`, synchronously, in the same tick — safe because `_syncPaneHeight()` has already committed `#mp-scroll`'s target height as a real style value before any frame paints, so `softRemeasure()`'s own forced reflow reads that committed value, not a stale one.

  **Reduce-motion and instant-open:** `animateElementHeight()` already checks `isReduceMotionActive()` before doing anything transition-related, so `_syncPaneHeight()` inherits that for free. The sheet's fresh-open case (`openMenuSheet()` → `_setActivePane("menu", { instant: true })`) uses the same `skip` early-return path `animateElementHeight()` already had, extended so it *still* sets the correct explicit height (just with no transition) rather than leaving `#mp-scroll` unset. `openMenuSheet()` also now clears the sheet's `hidden` attribute *before* calling `_setActivePane()` (reordered from round 2), since accurately measuring `offsetHeight` requires a laid-out (not `display: none`) `#menu-sheet-body`; `.sheet.shut`'s `visibility: hidden`/`opacity: 0` still fully participate in layout, so this reorder changes what's measurable without changing what's painted (everything happens in one synchronous tick, so there's still no flash of the wrong pane).

  **Window resize:** because `#mp-scroll`'s height is now a permanently-pinned JS value rather than a `height: auto` that would naturally reflow, `src/menu.js` adds a debounced `resize` listener (120ms, only while the sheet is open) that re-syncs `#mp-scroll` to whichever pane is currently active, instantly (no transition — a resize snap should feel immediate).

`#mp-scroll` also needs its own explicit `overflow-x: hidden` (`.t-scroll`, the class it also carries, only sets `overflow-y: auto`) — per the CSS overflow spec, a non-`visible` `overflow-y` with an unset `overflow-x` computes `overflow-x` to `auto` too, which would otherwise put a visible horizontal scrollbar under the 200%-wide track (the sheet's own `overflow: hidden` clips it visually either way, but doesn't suppress that scrollbar from appearing).

**IDs preserved on purpose:** the two pane containers keep the exact ids their old standalone sheet bodies had (`#menu-sheet-body`, `#profile-sheet-body`) specifically so neither `src/menu.js` nor `src/profile.js` needed any `getElementById` lookups to change, and so the pre-existing `#menu-sheet-body { padding: ... }` / `#profile-sheet-body .menu-placeholder { padding: 0 }` CSS rules needed zero edits either.

**Accessibility for the off-screen pane:** the inactive pane gets both `inert` (disables focus/tab-into and hit-testing on its subtree) and `aria-hidden="true"`, toggled alongside the track's transform in `_setActivePane()` — necessary because, unlike a normal open/close, the inactive pane is still a fully laid-out, interactive-by-default part of the DOM (just translated out of the visible viewport), so without `inert` its buttons/inputs would remain keyboard-tabbable even while invisible.

**Drag-to-dismiss from either pane, for free:** `initSheetDrag()` binds its drag handlers to `.sheet-drag`/`.sheet-head` (queried once, at init) — since there's now only one of each (shared by both panes, not duplicated per-sheet), dragging closes the *whole* merged sheet identically regardless of which pane is currently showing, with no extra code needed for that requirement.

**Reopening always starts on Menu:** `openMenuSheet()` calls `_setActivePane("menu", { instant: true })` before revealing the sheet, every time it's called — `instant` skips the slide animation (nothing is visible yet at that point to animate) so there's no visible flash of the wrong pane before the correct one settles.

**Cross-module signaling, kept minimal:** `src/menu.js` statically imports `loadProfileContent` from `src/profile.js` (the shell driving its content pane, same direction as before). The reverse direction — `src/profile.js` needing to close the *entire* merged sheet (navigating away to view a place from a review row, or right after "Erase my data" succeeds) — is still event-based (`EVT.ACCOUNT_SHEET_CLOSE`, replacing the now-removed `EVT.NAV_TO_MENU`) rather than an import, to avoid turning that one-directional import into a cycle. Navigating internally between the two panes, however, needs **no event at all any more** — that was `EVT.NAV_TO_MENU`'s entire original purpose (letting Profile's back button reach Menu's `openMenuSheet` without a circular import), and it's now just a same-module function call (`_goToMenuPane()`) inside `src/menu.js`, since the shared header/back-button lives there too.

### Reviews sign-in panel — matching Menu sheet's smoothness (2026-08-05, later round)

User directly compared the Menu sheet's sign-in row → email/password panel swap (feels smooth) against `src/reviews.js`'s identical-looking swap inside the reviews overlay (felt visibly less smooth). Confirmed by reading, not guessed: the reviews sign-in row → panel swap already goes through the exact same primitives as Menu's (`crossFadeSwap()` + `_animateReviewCardHeight()`, architecturally identical to `crossFadeSwap()` + `_animateMenuPanelHeight()`) — `_insertReviewPanel()`'s own hand-rolled FLIP system is NOT involved in this swap at all, it only runs once, for inserting the whole sign-in-prompt card into the overlay in the first place (a job the task explicitly excluded from scope). Both `.rv-overlay-card` and `.menu-account-panel` share the identical `height var(--t-spring)` transition, so timing/easing are provably not the difference.

**Actual difference: `.rv-overlay-card`'s `overflow: hidden` (needed for its rounded corners and to enforce `max-height: min(620px, 85vh)` against a long review list) clips growing content mid-tween; `.menu-account-panel` has no `overflow`/`max-height` of its own at all.** `animateElementHeight()`'s FLIP technique runs `changeFn()` (which reveals the taller panel content) BEFORE the box's own animated height has caught up — for `.menu-account-panel`, nothing clips that, so the revealed content just renders in place immediately while the (invisible, background-less) surrounding space animates in around it, feeling smooth. For `.rv-overlay-card`, the SAME window (box height smaller than its own just-updated content) is genuinely masked by its `overflow: hidden`, un-clipping progressively as the box catches up — a visibly different, more "reveal from behind a moving mask" feel for the identical timing curve.

**Fix:** `_animateReviewCardHeight()` (`src/reviews.js`) now suspends `.rv-overlay-card`'s `overflow` to `visible` for exactly the tween's own duration, restoring it (`overflow: hidden`) the instant the tween genuinely settles, via the new `onSettled` option on `animateElementHeight()` (`src/utils.js` — see its own entry above). Any tween already in flight on the card is force-settled first (`card._heightAnimCleanup?.()`) before the new one suspends `overflow` again, so a rapid second toggle can't have its own suspend-then-restore sequence stomped by the previous call's `animateElementHeight()`-internal re-entrancy guard (which fires on the SAME element and would otherwise restore `overflow: hidden` immediately after this function had just set it to `visible`). `overflow: hidden` is back in force at every OTHER moment — including the tween's own resting start/end points, where content and box height already match and there's nothing to overflow regardless — so the rounded-corner masking and the `max-height` cap against a genuinely long review list are unaffected. Scoped to `_animateReviewCardHeight()` only (benefits every caller of it — the sign-in-success swap, the "check your email" message, the verify-email refresh — not just the row↔panel toggle specifically flagged, since they all share the identical underlying clipping issue); `src/menu.js`'s `.menu-account-panel` needed no equivalent change, since it was never the one with the clipping problem.

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

**Sibling templates:** `.btn-microsoft` (same shared white/neutral `--google-btn-*` chrome, just a different logomark — Microsoft has no dedicated Firebase provider class either, see `src/auth.js`), and `.btn-facebook`/`.btn-apple` below (added 2026-08-05, each with their own brand-mandated chrome instead of reusing Google's neutral tokens).

---

### `.btn-facebook`

Third-party brand button for "Continue with Facebook". Unlike Google/Microsoft (which share one neutral white/dark chrome per both brands' own guidelines), Meta's official button spec calls for a solid Facebook-blue fill with a white "f" wordmark + label — so this does **not** reuse `--google-btn-*`.

**Dedicated tokens (fixed brand values, no light/dark variant — Meta's spec keeps the same blue regardless of the app's own theme):**

| Token | Value | Usage |
|---|---|---|
| `--facebook-btn-bg` | `#1877f2` | Button fill |
| `--facebook-btn-text` | `#ffffff` | Label + logo colour + `.btn-spinner` colour |

**Icon:** `.btn-facebook-icon` (16×16) — the plain standalone "f" glyph (Font Awesome's `facebook-f` mark, not the circled logo — the button's own blue fill already supplies that context, so a circled logo on top would double the shape). Filled with `var(--facebook-btn-text)` rather than a hardcoded colour, since — unlike Google's/Microsoft's multi-colour logos, which must never be recoloured — this is a single-colour wordmark meant to track its button's own foreground colour.

**Spinner:** no `.btn-facebook .btn-spinner` override needed — the default white-on-`--accent` spinner (`border-top-color: var(--on-accent)`, white) already reads correctly against Facebook's always-blue chrome, unlike Google/Microsoft's light/neutral chrome.

**Used by:** `#menu-facebook-signin` (Menu sheet Account section) and the "Continue with Facebook" button in `src/reviews.js`'s `_showSignInPrompt()` — `FACEBOOK_LOGO_SVG`/`FACEBOOK_SIGNIN_LABEL`/`FACEBOOK_SIGNIN_BTN_HTML` live in `src/icons.js`, same shared-source pattern as Google's.

---

### `.btn-apple`

Third-party brand button for "Sign in with Apple". Per Apple's Human Interface Guidelines, this is a solid black button with a white glyph + label in a light context — and, unlike every other OAuth button template in this app, Apple's own guidelines **require** a fully inverted white-button/black-glyph+label variant whenever the surrounding UI is in dark mode (not a judgement call made by this app).

**Dedicated tokens:**

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--apple-btn-bg` | `#000000` | `#ffffff` | Button fill |
| `--apple-btn-text` | `#ffffff` | `#000000` | Label + logo colour + `.btn-spinner` colour |
| `--apple-btn-border` | `transparent` | `#d2d2d7` | 1px button border (only visible on the white dark-mode variant, for definition against light surfaces) |

The dark-mode override lives in `styles.css`'s `body.dark-mode` variable block, alongside every other theme-dependent token swap in this app (same place `--google-btn-*`'s own dark-mode override lives).

**Icon:** `.btn-apple-icon` (16×16) — Simple Icons' monochrome "Apple" glyph, filled with `var(--apple-btn-text)` so it inverts automatically with the button (white mark on the black button, black mark on the white dark-mode variant) — no separate dark-mode-scoped icon rule needed.

**Spinner:** `.btn-apple .btn-spinner` overrides to `var(--apple-btn-text)`, the same single-rule-tracks-both-themes trick `.btn-google`'s own override uses via `--google-btn-text` — needed because Apple's *required* dark-mode variant is a light/neutral button (the same problem Google/Microsoft have), even though the light-mode variant (black button) already has good contrast with the default spinner.

**Used by:** `#menu-apple-signin` (Menu sheet Account section) and the "Continue with Apple" button in `src/reviews.js`'s `_showSignInPrompt()` — `APPLE_LOGO_SVG`/`APPLE_SIGNIN_LABEL`/`APPLE_SIGNIN_BTN_HTML` live in `src/icons.js`, same shared-source pattern as Google's/Facebook's.

**Cancel-popup error codes (Facebook and Apple both):** Firebase Auth's `auth/popup-closed-by-user` / `auth/cancelled-popup-request` codes are generic SDK-level popup-lifecycle codes, not provider-issued — every popup-based provider in this app (Google, Microsoft, Facebook, Apple) surfaces the identical two codes on a user-cancelled sign-in, so the existing "don't show an error for these two codes" check in `src/menu.js`/`src/reviews.js` needed no new codes added for Facebook/Apple.

**`.menu-account-signin-row` layout (updated 2026-08-05, superseded by the same-day "later round" entry below):** was briefly a 2-column CSS grid (`display: grid; grid-template-columns: 1fr 1fr;`) rather than a `flex` row — with 4 OAuth provider buttons (plus the currently-hidden email option), `flex: 1` would squeeze "Continue with X" + icon into an illegibly narrow column even on the desktop side panel. Facebook/Apple are excluded from the shared neutral `--text-2` border override (kept below) since they're solid brand-coloured buttons per their own official specs, not neutral chrome — forcing a shared border onto them would fight their own brand guidelines the same way recolouring their logos would. See the "ONE row, not 2-up-1-down" entry below for the current, superseding layout (3 equal columns).

**`.btn-password` (added 2026-08-05) — traditional email + password sign-in/sign-up.** A genuinely new, additional Firebase Auth mechanism (real `createUserWithEmailAndPassword`/`signInWithEmailAndPassword`), distinct from the passwordless magic-link `.btn-secondary` toggle beside it (currently hidden — see the "Temporarily hidden (2026-08-02)" comment above). Deliberately its **own class**, not a reuse of `.btn-secondary`: reusing it would inherit that class's `display: none` from the hidden-magic-link rule, since both would otherwise share the exact same selector. Visually it's styled identically to `.btn-secondary`/Google/Microsoft's neutral chrome (`border: 1px solid var(--text-2)`, `--txt-sm` label) so it still reads as a peer of that set, and reuses the exact same `grid-column: 1 / -1` full-width span the magic-link button already had — with Google + Microsoft alone currently filling the grid's first row, this sits alone on a clean full-width second row rather than crowding a 5th slot into the grid. Opens `#menu-password-signin-panel` (Menu → Account) / the equivalent `_buildPasswordSignInStep()`-built panel (`src/reviews.js`'s sign-in gate) — both are `.rv-verify-step` panels containing two `.rv-field`s (email, password) and one smart submit button that handles both first-time signup and returning sign-in via an explicit mode-toggle link (`.rv-resend-link`, reused from the OTP-resend template) rather than silently guessing from the Firebase error code — `auth/invalid-credential` alone can't reliably distinguish "no such account" from "wrong password" across Firebase SDK versions. Error-message wording for every `auth/*` code this flow can return lives in one place, `emailPasswordErrorMessage()` (`src/utils.js`), imported by both `src/menu.js` and `src/reviews.js` so the two copies of this panel never drift in wording.

**`.rv-field-input-wrap` / `.rv-field-input-btn` (added 2026-08-05) — new template.** Wraps a single `.rv-input` alongside an absolutely-positioned trailing icon button — currently only the email + password panel's show/hide-password toggle, but written generically for any future "icon button living inside an input" need. `.rv-field-input-wrap` is `position: relative`; its own `.rv-input` child gets `padding-right: calc(var(--sp-10) + var(--sp-6))` (room for the button plus its own inset) so typed text never runs underneath it. `.rv-field-input-btn` is `position: absolute; top: 50%; right: var(--sp-2); transform: translateY(-50%)`. The button itself reuses `.clear-btn` (the existing 28px circular icon-button template from the search bar's clear "×") as a Component Alias rather than inventing new icon-button chrome — `class="clear-btn rv-field-input-btn"`. Show/hide icons are `EYE_SHOW_ICON_SVG`/`EYE_HIDE_ICON_SVG` in `src/icons.js`, same stroke-width-2/24×24-viewBox convention as every other inline icon in that file.

**Eye icon sizing fix (2026-08-05, later same day).** `EYE_SHOW_ICON_SVG`/`EYE_HIDE_ICON_SVG` were the *only* icons in `src/icons.js` with no sizing attribute at all on their `<svg>` tag (every sibling icon in that file carries either a `class="btn-xxx-icon"` with a CSS-driven size, or an explicit `width`/`height`) — that's why the eye toggle rendered oversized inside its 28px `.clear-btn` circle. Fixed by adding `width="14" height="14"` directly on the `<svg>` tag, matching the exact convention `index.html`'s `#clear-input` button already uses for its own small icon-in-a-circle button (bare explicit attributes, no CSS class, since the surrounding `.clear-btn`/`.rv-field-input-btn` already owns the button's own size/position). Path data was left unchanged — this Feather-style eye/eye-off pair (stroke-width 2, 24 viewBox) reads cleanly at 14px without a redraw; the bug was purely a missing sizing attribute, not the shape itself.

**`.rv-back-link` (added 2026-08-05, later same day) — new template.** A "Back to sign-in options" link that appears as the first element inside the expanded email/password panel (`#menu-email-signin-panel`/`#menu-password-signin-panel` in `src/menu.js`, the equivalent JS-built `emailStep`/`passwordStep` in `src/reviews.js`'s sign-in gate). Needed because opening either panel now collapses `.menu-account-signin-row` (Google/Microsoft/Facebook/Apple/email/password) instead of appending the panel below the still-visible row — the prior behavior stacked the full row plus the expanded panel, eating most of this sheet's limited mobile height. Deliberately a **new, distinct template** from `.rv-resend-link` (the pre-existing link style already used in the same panels for "Forgot password?"/the signin↔signup mode toggle) rather than a reuse of it: `.rv-resend-link` is centered and accent-colored, appropriate for an in-panel *action*; `.rv-back-link` is left-aligned (`align-self: flex-start`, breaking from `.rv-verify-step`'s flex-column default of every other child stretching full-width) and a quieter `--text-2`/hover-`--text`, since *navigating back* shouldn't visually compete with the panel's own primary actions. Pairs with a new shared icon, `BACK_CHEVRON_ICON_SVG` (`src/icons.js`, 14×14, stroke-width 2 — the mirror-image direction of `src/menu.js`'s own local `_PROFILE_CHEVRON_SVG`, which points forward/right for "navigate into Profile"). Considered mirroring `src/places.js`'s `_setPlaceSheetCloseAsBack()` pattern (swapping a persistent header close button's icon/meaning to "back") instead, but that pattern applies to a sheet-level close button with exactly one other state to fall back to — this panel already has its own separate sheet/overlay-level close ("×") that must keep meaning "dismiss the whole sign-in prompt," so a second, panel-scoped link reading unambiguously as "back to the other sign-in options" (not "close everything") was the clearer fit. Wiring: each panel's own toggle button (`#menu-email-signin-toggle`/`#menu-password-signin-toggle` in `src/menu.js`, `emailToggle`/`passwordToggle` in `src/reviews.js`) now hides `#menu-account-signin-row`/`signinRow` and reveals the panel (via the existing `_animateMenuPanelHeight()`/`_animateReviewCardHeight()` wrappers around `animateElementHeight()`, unchanged); the new back link reverses both in the same animated step.

**`.menu-account-signin-row` — "ONE row, not 2-up-1-down" (2026-08-05, later round) — supersedes the 2-column entry above.** User feedback from live testing: Google + Microsoft + the visible email option (`.btn-password`) should sit in a single row, not 2-up-1-down. Changed `grid-template-columns` from `1fr 1fr` to `repeat(3, 1fr)` and removed `.btn-secondary`/`.btn-password`'s `grid-column: 1 / -1` full-width span at default widths — with Facebook/Apple/the magic-link email button all still `display: none`, exactly 3 real children remain in DOM order (Google, Microsoft, `.btn-password`), so plain grid auto-placement puts them in one row with zero explicit column assignment needed. **Narrow-viewport fallback:** below 380px (this app's existing tiny-phone breakpoint — reused rather than inventing a new one, e.g. `#search-card`/`.pf-icon` already use it) the grid reverts to `1fr 1fr` with the email/magic-link button's full-width span restored, i.e. back to the pre-existing 2-up-1-down shape — 3 full "Continue with X" labels were judged too cramped below that width even with the font shrink below. **Label font size also dropped a further notch, `--txt-sm` (13px) → `--txt-xs` (11px), for all six buttons in this row** (Google/Microsoft/Facebook/Apple/`.btn-secondary`/`.btn-password`) — with 3 real buttons sharing a row instead of 2, `--txt-sm` left noticeably less of each label visible before hitting its own ellipsis truncation (`.btn-google-label` etc. already had `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` from when Facebook/Apple were added — this round didn't need to add that mechanism, just rely on it more). `--txt-xs` is the smallest size this app's own type scale defines (already used at this exact size for comparably secondary text — `.rv-verify-desc`, `.rv-field-label`), so no new ad hoc value was introduced. **Judgement call, flagged for the user:** `--txt-xs` was applied uniformly across all widths (including the ≤380px fallback and the wider desktop side panel, both of which have more room to spare) rather than only within a narrower breakpoint, for simplicity — worth a look if 11px reads as too small anywhere once live.

**`.rv-back-link` spacing polish (2026-08-05, later round).** Reported: a divider line sat right above "Back to sign-in options," which then read as crammed against the "Email address" field label right below it. Fixed with two changes: (1) the divider's own `padding-top` (`#menu-email-signin-panel`/`#menu-password-signin-panel` previously) went from `var(--sp-4)` (10px) to `var(--sp-6)` (14px), giving more room between the border line and the back-link that follows it; (2) `.rv-back-link` gained `margin-bottom: var(--sp-3)` (8px), stacking on top of `.rv-verify-step`'s own `gap: var(--sp-5)` (12px) between every child, for ~20px of clearance before the next field — deliberately asymmetric (only this link needed extra room on ONE side; every other stacked pair in the panel, field-to-field or field-to-button, already reads fine on the plain shared gap alone), so the fix is scoped to the one element that needed it rather than widening the gap for the whole panel. **New template, `.rv-panel-divider`, replacing the two old ID selectors** (`#menu-email-signin-panel, #menu-password-signin-panel`): this divider treatment was scoped to `src/menu.js`'s Account section only, and was found to be entirely MISSING from `src/reviews.js`'s own JS-built `emailStep`/`passwordStep` panels — a pre-existing inconsistency between the two files' sign-in gates. Converting the two ID selectors into one shared class and adding that class to `emailStep`/`passwordStep` in `src/reviews.js` (alongside the pre-existing `rv-verify-step`) brought both files' panels to the identical visual treatment, rather than fixing the divider spacing in `src/menu.js` alone and leaving `src/reviews.js` both cramped AND divider-less.

**`.rv-back-link` — reverted the `margin-left: -18px` shift (2026-08-05, later round, live-tested and still wrong).** The prior round's `margin-left: -18px` (pulling the whole icon+text box left by the chevron's own 14px + `var(--sp-1)` gap = 18px footprint, so the TEXT would line up flush with "Email address"/"Password" below) was itself wrong and made the misalignment worse, not better: `.rv-verify-step`/`.rv-panel-divider` have no horizontal padding of their own — the 14px inset comes entirely from the parent `.menu-account-panel` — so the divider's border-top, the field labels, and `.rv-back-link`'s own un-shifted position already start at the exact same left edge. Shifting left by 18px moved the chevron icon 18px past that shared edge, into `.menu-account-panel`'s own padding gutter, floating disconnected to the left of the divider line it sits directly under. **Fix: removed the margin entirely** — the chevron's own leading edge (not the trailing label text) is what should align with the divider/field-label edge, matching how every real "‹ Back" pattern actually works (icon anchors to the container edge; label trails it). The label text now sits ~18px right of "Email address" below it, which is expected/conventional for an icon-led link, not a bug.

**OAuth row collapse gets a real animation, not an instant `display: none` (2026-08-05, later round).** Reported: the row (Google/Microsoft/email) previously vanished instantly via `.hide`'s `display: none !important` the moment a panel opened, even though the wrapping panel/card's own height-tween (`_animateMenuPanelHeight()`/`_animateReviewCardHeight()`, both unchanged) resized smoothly around it — the row's abrupt disappearance read as fighting the container's own smooth resize. **New shared helper, `crossFadeSwap(hideEl, revealEl, swapFn)` (`src/utils.js`, next to `animateElementHeight()`):** fades `hideEl` to opacity 0 FIRST (using its own permanent `transition: opacity var(--t-fast)`, now declared on both `.rv-verify-step` and `.menu-account-signin-row`), THEN calls `swapFn` (which does the actual `.hide` toggling, itself still wrapped in the pre-existing height-tween helper — unchanged), THEN cross-fades `revealEl` in. Two new modifier classes, `.fade-swap-out`/`.fade-swap-in` (both just `opacity: 0`), are the only CSS surface this needs — `.fade-swap-in` is applied for one synchronous tick (forced via `void revealEl.offsetHeight`) right as a previously-`.hide`-d element becomes visible again, so its opacity-0→1 transition actually animates instead of skipping straight to 1 with nothing to interpolate from (the same "force a reflow, then toggle the class" idiom `animateElementHeight()` already uses for its own height tween). **Why sequential, not concurrent:** an opacity fade never changes an element's own layout box, so fading `hideEl` out AT THE SAME TIME as the height-tween (which needs `hideEl` to be ALREADY gone to compute the correct target height) would leave the still-full-size fading box visibly disagreeing with the already-final target height for the fade's whole duration; revealing+fading `revealEl` in, by contrast, is safe to run right after `swapFn`, since revealing something changes the target height via its `display: none` state, and fading its opacity in afterward doesn't move that height a second time. Wired identically in all 4 toggle/back-link pairs, both files: `src/menu.js`'s magic-link toggle+back and password toggle+back, `src/reviews.js`'s equivalent `emailToggle`/`emailBackBtn` and `passwordToggle`/`pwBackBtn`.

**Password signup now collects a name (2026-08-05, later round).** Google/Microsoft/Facebook/Apple all supply a `displayName` from the provider for free; email+password signup previously didn't collect one at all, so every password-created account showed up with no name anywhere `account.displayName` is read (e.g. `src/menu.js`'s `_buildSignedInHTML()` falling back to email or "Signed in"). `src/auth.js`'s `signUpWithEmailPassword(name, email, password)` gained a required `name` parameter (previously `(email, password)` — both call sites in `src/menu.js`/`src/reviews.js` updated), imports `updateProfile` from the same `firebase-auth.js` CDN URL, trims the name and rejects an empty/whitespace-only value with `{success: false, error: "missing_name"}` before making any Firebase call, then calls `updateProfile(cred.user, { displayName: trimmedName })` right after account creation. Confirmed (rather than assumed) that `updateProfile()` mutates `cred.user`'s own `displayName` in place once it resolves — the Firebase JS SDK v9 modular Auth implementation applies a successful profile update to the SAME in-memory `User` object, not just server-side — so `_resultFromCredential(cred)`'s existing `_cacheAccount()` call already picks up the new name in the normal case; a defensive merge (`result.account = {...result.account, displayName: trimmedName}`, re-cached to `localStorage`) is kept anyway for the one case where it wouldn't — the `updateProfile()` call itself failing (caught separately, logged via `console.warn`, non-fatal to the signup). **UI:** a new "Full name" `.rv-field` (`#menu-password-name-field` in `src/menu.js`, `pwNameField`/`pwNameInput` in `src/reviews.js`'s JS-built panel) is visible ONLY in signup mode — the exact mirror case of the pre-existing "Forgot password?" link, which is signin-only, toggled the same way inside each file's `updateModeUI()`/`updatePwModeUI()`. Submit handlers in both files validate the trimmed name is non-empty before calling `signUpWithEmailPassword` (via the existing `showError()` inline-error pattern, focusing the name input on failure), mirroring the existing email/password validation already in place. `emailPasswordErrorMessage()` (`src/utils.js`) gained a `missing_name` case ("Please enter your name.") as a defensive backstop for the (should-be-unreachable) case where `src/auth.js`'s own re-validation is what catches it instead of the UI.

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

**Layout:** `flex-direction: column`, icon + label on desktop/side navigation; icon-only visual treatment on mobile while keeping the label span in the DOM
**Active (`.active-tab`):** accent colour + pill indicator bar below icon (mobile) or left edge (desktop)  
**Special states:** `.tracking` — pulsing accent animation, `.route-active` — static accent  
**Used by:** `#home-btn`, `#dir-btn`, `#places-btn`, `#locate-btn`

**Mobile (2026-08-09):** visible tab labels are hidden at `max-width: 768px` and `--tab-h` resolves to `--h-submit` so the mainbar consumes the minimum touch-safe height while preserving each button's `aria-label` and DOM text. Phone-only chrome position variables (`--phone-zoom-bottom`, `--phone-search-bottom`, `--phone-locate-bottom`, `--phone-bar-bottom`) derive from that mainbar height so adjacent controls tighten with it.

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

### `.pl-open-chip` / `.pp-hours-open` / `.status-pill--live`, `.pl-closed-chip` / `.pp-hours-shut` / `.status-pill--rejected`, `.pp-hours-soon` / `.status-pill--pending`

Inline open/closed status pill, same pill shape/sizing across all three. `.pp-hours-open` (green, `--success`) and `.pp-hours-shut` (red, `--danger`) render "Open"/"Closed". `.pp-hours-soon` (amber, `--warning`) is shared by both "Closing soon" and "Opening soon" — one class, text content is what differs. Rendered by `getHoursStatus()` in `src/places.js` (place-detail sheet only; the places-list card badge at `.pl-open-chip`/`.pl-closed-chip` still uses the simpler true/false/null `isPlaceOpenNow()` and has no "soon" state). `getHoursStatus()` flags "soon" within a 30-minute window — closing soon if the current open range ends within 30 min, opening soon if the next range (today, or tomorrow only when it's within 30 min of midnight) starts within 30 min.

`.status-pill--live` / `.status-pill--rejected` / `.status-pill--pending` are **Component Alias** additions on these exact same three rules (contribution-profile plan Phase 4) — `src/profile.js`'s "Your submitted places"/"Your submitted edits" status pills, reusing the identical green/red/amber tint semantics for a moderation-status concept instead of an opening-hours one. A `.status-pill--rejected` with a `title=` attribute (a reject reason present) gets `cursor: help`, matching `.pp-sponsor-badge`'s own `title=`-tooltip precedent.

### `.sponsor-badge` / `.pp-sponsor-badge`

Inline gold badge indicating a sponsored place. Used in popup headers and anywhere a compact "Sponsored" label is needed. Tinted from `--sponsor` token via the `--badge-c` custom property (defaults to `var(--sponsor)`, so every pre-existing usage is unaffected).

### `.verified-badge`

Component Alias of `.sponsor-badge` — sets `--badge-c: var(--accent)` instead of the gold default. Used by `src/profile.js`'s "Verified reviewer" badge next to the account name (shown whenever `isVerifiedContributor()` — signed in via Firebase at all — is true). Accent tint keeps it visually distinct from the gold "Sponsored" badge it shares a shape with.

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

**Mobile chrome note (2026-08-09):** phone-only map-interaction rules may add a transform transition for compacting floating controls, but must preserve `pill-expand`'s `width`, `border-radius`, and `box-shadow` transitions on expandable controls such as `#search-card`. Otherwise the search pill snaps open on phone while desktop remains smooth.

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

### Pinned-footer pattern (action rows that must survive scroll growth)

When a sheet's content region can grow tall enough to push a fixed action row out of view (e.g. an expandable section like Hours), the action row must **not** be a child of the scrollable container — it must be a flex sibling of it, pinned by `flex-shrink: 0` while the scrollable container takes `flex: 1; min-height: 0`.

**Reference implementation:** `#place-sheet` (`index.html`) is a flex column containing `#place-sheet-body.t-scroll` (`flex: 1; min-height: 0`, all variable-length content: tags, notes, hours, events, reviews) followed by `#place-sheet-actions.pp-actions` (`flex-shrink: 0`, the Directions/Call/Share/Edit row) as a true sibling, not nested inside the scroll region. `src/places.js`'s `openPlaceSheet()` clears and repopulates this persistent element on every open rather than creating a new `.pp-actions` div and appending it into the scrollable body — the DOM node itself never moves, only its children.

This is distinct from the `.pp-actions` template's *other* use inside `.pp-inner` for the (non-sheet, still-a-floating-popup) dropped-pin/current-location/home popups in `search.js`/`map-controls.js` — those are small, fixed-content popups with no scroll region at all, so `.pp-actions` there stays a normal last child with no pinned-footer treatment. `#place-sheet-actions`'s ID-selector rule in `styles.css` adds the horizontal padding it needs (since it's no longer inside `.pp-inner`, which normally supplies that for free) without touching the shared `.pp-actions` class rule those popups still rely on.

### Phone Places list-focus mode

`#places-list-focus` is an icon-only header toggle shown on phone only. It
reuses the existing `.sheet.full` snap state on `#places-sheet` and adds the
`.places-list-focus` class so the same Places sheet becomes a list-first view:
the large type-tab row is hidden, search/sort/filter remain in a compact refine
strip, and place cards use a tight grid that still shows name, address,
status/rating/tag metadata, and action buttons. While scrolling down in
list-focus mode, the `.places-refine-collapsed` state tucks the refine strip
away; upward scrolling or direct refine control interaction reveals it again.
Do not auto-reveal the bar on an idle timer. Keep this as a state
of the existing Places sheet rather than opening a second list window; that
avoids duplicating filters, scroll restoration, saved-section collapse state,
and map marker synchronization.

Normal phone Places mode should also stay denser than desktop: smaller type-chip
icons, tighter filter-row padding, and compact place-card spacing. The goal is
more visible places without lowering tap targets below the established tokenized
minimums.

In list-focus mode, the Filter drawer starts with a compact `Show` category row.
`All` and `Saved` are exclusive, while `Spaces`, `Food`, and `Services`
can be combined. This is intentionally stronger than the regular top tabs,
which stay single-select outside list-focus mode. Halal Status is an exclusive
dropdown-style group like Cuisine: `Fully Halal` and `Partially Halal` cannot
both be active in the same filter state.

`docs/place-card-compact-designs.html` is the current standalone concept board
for evaluating tighter two-line place-card layouts before replacing the
production card markup. Phone cards now keep `.pl-tags-summary` and distance
(`.pl-dist`) in `.pl-name-chips` beside the truncated `.pl-title`, while open
status and rating sit in `.pl-addr-chips` beside the address. Phone cards use a
true two-row grid by default and hide the desktop metadata row so status/rating
chips cannot create a broken third row. Desktop cards keep the classic
three-row structure: name, address, then all chips on the `.pl-meta` row,
including the distance chip. The list-focus toggle is phone-only.

At the 769–1199px tablet breakpoint, the generic `.sheet, #places-sheet { display: block; overflow-y: auto }` single-scroll-container override (used so `fit-content` sizing works naturally for most sheets) is itself overridden back to `display: flex` for `#place-sheet` specifically, so the pinned footer survives at that width too — only `#place-sheet-body` keeps its own `overflow-y: auto`.

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

### Map Point Focusing

Use `focusMapPoint()` from `src/map-init.js` for ordinary "show this point" camera moves (place detail, home, current location, dropped/search pins, clusters, Eid popups). It calculates MapLibre padding from the currently open sheet/panel so the focused pin lands in the center of the available map area, and it sends zero padding when no panel is open to clear stale global MapLibre padding from previous sheet-aware moves. On phone, bottom sheets reserve their actual measured height even while the opening transform is still animating, so camera padding is based on available map space rather than the sheet's transient visual position.

### Phone Map-Interaction Chrome

On phone, map-canvas gestures immediately add `body.map-interacting` and keep the compact chrome state for three seconds after the gesture ends. Pressing or focusing visible app chrome clears the grace timer immediately and restores full-size controls because the user has switched from map manipulation back to UI interaction. The compact state scales three runtime-created zone wrappers (`#phone-chrome-top-zone`, `#phone-chrome-right-zone`, `#phone-chrome-bottom-zone`) rather than individual pills. Do not change right-rail or top-left spacing variables in the compact state; the zone transform shrinks each cluster proportionally while preserving internal alignment.

### `#snackbar-close` (route snackbar close button)

Uses `.sheet-x` class (rendered on a blue `--accent` background). In `styles.css` an ID-scoped override sets the background to `rgba(255,255,255,.18)` and the colour to `#fff` to keep contrast against the blue snackbar background.

### Suggest / Edit overlays on mobile

On `max-width: 768px`, the overlays transition from centred modal to bottom-sheet. `display: none` cannot animate, so `.hide` on `#suggest-overlay` and `#edit-overlay` is overridden to `display: flex` with `opacity: 0; pointer-events: none`, and the card slides in via `translateY`.

### Menu sheet — Account section (sign-in, profile, "Your reviews")

Reuses existing templates wholesale rather than inventing new form/list chrome: the sign-in prompt (`#menu-google-signin`/`#menu-email-signin-panel`) is built from `.rv-action-btn`/`.rv-resend-link`/`.rv-field`/`.rv-input`/`.rv-verify-error` (the same classes `src/reviews.js`'s own sign-in prompt uses — both places originally shared the exact same visual component). The signed-in "Your reviews" list reuses `.rv-list`/`.rv-review-card` via the Component Alias Pattern (`.acc-review-row` added as an extra selector alongside `.rv-review-card`, with a `styles.css`-only `flex-direction: row` override so the edit/delete icon buttons sit beside the review text instead of below it) plus `.btn-roundel`/`.btn-roundel-danger` for the edit/delete icon buttons themselves — no new button chrome anywhere in this section.

**Toggling the email/password sign-in panel must resync the OUTER sheet, not just the inner panel (2026-08-05, later round — see `_resyncMenuSheetHeight()` in `src/menu.js`).** `_animateMenuPanelHeight()` only tweens `.menu-account-panel`'s own height; it never touches `#mp-height-wrap` (JS-pinned by `_syncPaneHeight()`) or `#menu-sheet`'s own drag-snap height (`menuSnap`/`initSheetDrag()` in `src/utils.js`). Without an explicit resync, expanding/collapsing the panel left `#mp-height-wrap` and `#menu-sheet` pinned at a stale height — most visibly, collapsing the panel back down left the outer sheet oversized with a dead-space gap below the now-shorter content. Fixed with a new helper, `_resyncMenuSheetHeight()`, called synchronously right after every `_animateMenuPanelHeight()` call in this section (both email and password toggle/back-link handlers, and the "check your email" success-message swap): it calls `_syncPaneHeight(menuPaneEl)` (fixes `#mp-height-wrap`'s stale pin) THEN `menuSnap.remeasure()` (fixes `#menu-sheet`'s own height — deliberately `remeasure()`, not the `softRemeasure()` used elsewhere in this file for pane switches/auth changes, since `softRemeasure()` only updates the drag-snap cap and never actually resizes the sheet). Both calls are required in that order: `remeasure()`'s own `contentHeight()` reads `#mp-scroll.scrollHeight`, which is downstream of `#mp-height-wrap`'s pin — calling it alone, without first correcting that pin, would just recompute the same stale number. See `_resyncMenuSheetHeight()`'s own doc comment in `src/menu.js` for the full reasoning on why reading layout synchronously right after a CSS-transitioned height change reliably measures the FINAL settled height, not a mid-transition one.

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

- **2026-08-11 update — Map View expanded into a compact two-column group grid.** Groups are now **Theme**, **Overlay**, **Detail**, and **Markers**. Each section has exactly three `.style-opt` controls, making each row six items total: Theme+Overlay, then Detail+Markers. Overlay keeps Satellite, Hybrid, and Heatmap. Traffic is no longer an Overlay item; Detailed mode automatically enables traffic detail with the same zoom toast if needed. The Theme/Overlay divider is restored, with the same divider between Detail/Markers. Detail uses three button presets (Clean, Standard, Detailed) instead of a slider; Clean hides minor visual clutter, Standard restores the base map, and Detailed boosts inner road lines, crossings, one-way arrows, bridges, labels, building detail, and traffic detail from saved paint snapshots. Markers uses three button presets (Default, Compact, Bold). Custom Detail/Markers thumbnails use map-thumbnail swatches inspired by Light/Dark/Auto/Satellite/Heatmap rather than standalone SVG glyph icons.
- **2026-08-11 traffic/marker refinement — Marker thumbnails must show actual pin silhouettes, not abstract dots.** Default shows one normal pin, Compact shows smaller grouped pins, and Bold shows a larger glowing pin. Traffic detail renders as MapLibre canvas-image symbols (signal housing, stop octagon, yield triangle, crossing sign, calming bump, roundabout) rather than generic colored circles, and those symbols are clickable with a compact explanatory popup.

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

### Profile sheet (`#profile-sheet`, `src/profile.js`) — contribution-profile plan Phase 4/7

Menu's old in-Account panel (identity card, "Your reviews") was restructured into a dedicated page, reached by tapping a compact **"Profile →" row** in Menu's signed-in Account section. Menu's signed-out state (sign-in buttons) is completely unchanged.

- **Menu's "Profile →" row** (`.menu-account-profile.menu-profile-link`) — the *entire* row (avatar + name) is now one `<button>`, not a static div with a separate sign-out icon-button inside it. `.menu-profile-link` is a thin, mostly-reset wrapper (`background:none; border:none; color:inherit; text-align:left`) around the existing `.menu-account-profile` flex layout, plus a new trailing `.menu-profile-chevron` (a plain right-chevron SVG — no prior "navigates to a sub-page" row existed anywhere in this app to alias onto, so this is a genuinely new, minimal icon rather than a repurposed one). Tapping it closes Menu and opens Profile — the same "close this sheet, then open the destination" convention already used elsewhere in this app (e.g. the old review-row → place-detail navigation, now living in `profile.js` instead).
- **`#profile-sheet`** is structurally identical to `#menu-sheet` (`.sheet-drag`/`.sheet-head`/scrollable body) — **not** `.sheet.full`. The plan that scoped this work suggested `.sheet.full` given how much content this page holds, but reading `initSheetDrag()` (`utils.js`) revealed `.full` is actually the *drag-to-snap-to-100%* runtime state any `.sheet` can enter while being dragged (`onEnd()` adds it; `open()` unconditionally strips it as its very first step on every open) — not a static "always full height" template. Statically marking `#profile-sheet` `.full` in the HTML would therefore have been silently inert (removed by the next `open()` call). Left as plain `.sheet` instead — `initSheetDrag()`'s own `freshCalc()` already auto-picks the "large" (75%→100%) snap mode for genuinely tall content, so Profile gets appropriately-large sizing for free, with no special-casing, exactly like any other content-heavy sheet in this app.
- **Back-arrow close button that actually navigates back, not just closes.** Profile is *always* entered from Menu, so `#profile-sheet-close` permanently shows the back-arrow icon (`_setProfileSheetCloseAsBack()` in `profile.js`, its own local instance of `src/places.js`'s `_setPlaceSheetCloseAsBack()` shape — no shared helper exists for this, by established convention). Tapping it does what `#place-sheet-close`'s own back-arrow does: closes the current sheet **and** reopens the one it came from (Menu) — matching `#place-sheet-close`'s "close + reopen the places list" precedent, not just closing into a dead end. Since `profile.js` can't statically import `openMenuSheet` from `menu.js` without creating a circular import (`menu.js` already statically imports `openProfileSheet` from `profile.js`), this is wired via a new `EVT.NAV_TO_MENU` event (`src/events.js`) instead — the same "avoid circular imports via events" convention `account-sync.js`'s own header comment already documents for its places.js/utils.js imports. **Dragging the sheet down to dismiss it (rather than tapping the close button) still just closes, without reopening Menu** — this exact asymmetry (explicit close-button click reopens the origin; the drag-to-dismiss gesture does not) is inherited directly from `#place-sheet-close`'s own established precedent, not a new inconsistency introduced here.
- **Contribution stats grid** (`.pf-stat-grid`/`.pf-stat-card`/`.pf-stat-num`/`.pf-stat-label`) — a new, genuinely simple 3-column grid template (reviews/favourites/saved-pins/places-added/edits-made counts from `account-profile.js`'s `computeContributionStats()`). No closer existing "stat display" precedent was found to alias onto (the reviews overlay's `.rv-avg-block`/`.rv-avg-num` is a single big number + star row, a different shape for a different purpose) — `.pf-stat-num` borrows the same "large bold tabular-nums number, small muted label below" visual language as `.rv-avg-num`/`.rv-avg-count` (same font-weight/color tokens) without literally reusing the class, since the layout (one number per card, 3-per-row grid) is structurally different.
- **"Verified reviewer" badge** — see `.verified-badge` in §6 above (Component Alias of `.sponsor-badge`, accent-tinted instead of gold).
- **Submission-status pills** — see `.status-pill--live`/`.status-pill--pending`/`.status-pill--rejected` in §6 above (Component Alias of the existing `.pp-hours-open`/`.pp-hours-soon`/`.pp-hours-shut` shapes).
- **"Erase my data" row** — `.menu-row--danger`, a Component Alias variant of the plain `.menu-row` template (recolors text/icon to `--danger`, hover fill to `--danger-soft`/`--danger-vivid` — same danger-hover shape `.acc-review-delete`/`.btn-roundel-danger` already use elsewhere) rather than a new button component.
- **"Your reviews"/"Your submitted places"/"Your submitted edits"** all reuse `.rv-list`/`.rv-review-card`/`.acc-review-row` (moved as-is from Menu) and the new `.pf-submission-list`/`.pf-submission-item`/`.pf-submission-row`/`.pf-submission-name`/`.pf-submission-reason` (a plain flex row + status pill, bordered list-item shape — no template fit an arbitrary "name + status pill" row, so this is a new, minimal, single-purpose template).

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

Pill-expand element beside the Prayer Times pill. Lists all active place promos from `place.promos`; promos are independent of sponsorship and each promo can provide a code, a description, or both. Hidden when no promos exist.

| Class | Purpose |
|---|---|
| `#promos-snack` | Container, uses `.pill-expand` pattern |
| `#promos-pill` | Icon button (tag icon, standard neutral colour) |
| `#promos-header` | Header row with icon + "Promos" text |
| `#promos-list` | Scrollable list of promo items |
| `.promo-item` | Single promo row; copies when a code exists, otherwise shows the description |
| `.promo-item-icon` | Coloured type icon (24px) |
| `.promo-item-body` | Name + description |
| `.promo-code` | Promo code text (`--promo`, mapped to the standard teal accent) |

### Keyframes

| Name | Cycle | Used by |
|---|---|---|
| `sponsorPulse` | 2s ease-in-out | `.place-mk--sponsored`, `.place-mk--spotlight` (glow ring) |
| `sponsorFloat` | 4s ease-in-out | `.place-mk--sponsor-basic` (subtle vertical drift) |
| `sponsorBounce` | 3s ease-in-out | `.place-mk--sponsored` (soft vertical bounce) |
| `sponsorBounceScale` | 2.2s ease-in-out | `.place-mk--spotlight` (bounce + 6% scale pulse) |

---

## 2026-08-11 - Map Visual Customization Follow-up

- Traffic detail popups reuse the dropped-pin floating popup shell: `place-popup-wrap` + `.pp` + `.pp-inner`, with a traffic-specific badge/icon/body only. Do not restyle traffic popups as separate generic cards.
- Traffic detail data is cached per snapped viewport key in memory and `localStorage` (`hf_traffic_detail:*`, 5-year TTL, 160-key cap). Reopening Detailed mode in an already loaded area should render from cache before making any Overpass request, and small pans should stay on the same snapped cache area.
- Traffic detail loading should not wait on one slow Overpass mirror. The client warms the traffic cache in the background at high zoom, races the configured Overpass mirrors in parallel, uses a short Overpass query timeout, and applies a hard client timeout so the detail layer never appears to hang indefinitely.
- Marker-style menu thumbnails should depict the actual app marker family: the rotated `.place-mk`/`.custom-mk` puck shape, solid body, white puck border, and `rotate(-45deg)`, scaled down enough to breathe inside the tiny menu thumbnail. Because the full-size `--puck-r` tail radius becomes too circular at thumbnail scale, preview pucks use a smaller proportional tail radius so the asymmetric puck point remains visible. Their thumbnail background stays the standard light map thumbnail even in dark mode, matching the other map-style previews instead of inheriting dark UI surface colors. Default is a single pin, Small (`markers-compact`) is a small multi-pin cluster, Bold is an enlarged/glowing pin.
- Pedestrian-crossing traffic symbols should use zebra-crossing stripes, not a generic walking-person icon, so the map layer reads as real street infrastructure.

## 2026-09-14 - Promo styling and admin app settings

- Promo icons (`#promos-pill`, `.pp-promo-btn`, `.promos-heading-icon`) now use
  `--text-2`, with `--text` for interactive hover states. Their previous
  `--sponsor`/gold styling incorrectly implied paid sponsorship. Promo code
  text uses the new semantic alias `--promo: var(--accent)`; sponsor visuals
  continue using their existing independent tokens. The promo shortcut border
  uses `--border` instead of `--gold-soft`.
- `.app-notice` is the public Menu notice template. It uses existing surface,
  text, spacing, radius, and line-height tokens, with plain text and an optional
  HTTPS link. Long words wrap and line breaks are preserved. It is hidden when
  disabled or empty. Admin-authored content is rendered using DOM text nodes.
- Admin **App Settings** follows the existing admin form language: quiet
  separated sections, descriptive checkbox rows, shared `.pp-field` inputs,
  a plain notice preview, and a persistent save bar. New `--settings-*` tokens
  in `admin/src/styles/tokens.css` define the reusable editor dimensions and
  typography; responsive fields stack automatically and the save bar adapts
  at the established 768px breakpoint. The admin `--accent-bg` token supplies
  the already-referenced teal tint for promo counts.
- Reset creates a reviewable draft. Discard, reload, validation feedback,
  unsaved navigation protection, and revision conflict checks support admins
  making changes safely. See [App settings setup](APP_SETTINGS.md) for the
  settings behavior and database migration commands.

## 2026-09-14 - Expanded admin runtime controls

- App Settings now uses shared field metadata for appearance, map behavior,
  search/list presentation, navigation, category labels, submission controls,
  and content. The admin page renders booleans as toggle rows, enums as selects,
  long copy as textareas, and quick map presets as plain inline buttons.
- Public appearance defaults are applied through `:root[data-accent-palette]`,
  `:root[data-density]`, and `:root[data-corner-style]`. The palette classes
  update existing semantic tokens such as `--accent`, `--accent-soft`, and
  `--promo`; component CSS keeps reading tokens instead of one-off colors.
- Card metadata visibility uses body classes (`hf-hide-ratings`,
  `hf-hide-hours`, `hf-hide-tags`) so the list renderer stays stable while
  admins control whether ratings, open/closed chips, and tag summaries show.
- Reject popovers reuse App Settings' standard rejection reasons as quick chips
  while preserving the custom textarea. This keeps the repeated moderation
  workflow faster without adding a second settings source.
