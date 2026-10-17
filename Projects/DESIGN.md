---
name: Karamah Projects
description: A quiet, dense workspace for turning connected projects into visible, actionable work.
colors:
  primary: "#262626"
  primary-foreground: "#fafafa"
  canvas: "#ffffff"
  canvas-dark: "#191919"
  surface-muted: "#f5f5f5"
  surface-dark: "#1c1c1c"
  ink: "#262626"
  ink-muted: "#737373"
  border: "#00000014"
  border-dark: "#ffffff0f"
  accent-wash: "#0000000a"
  focus: "#8a8a8a"
  timeline-today: "#fff8f5"
  danger: "#b66f74"
  warning: "#d97706"
  success: "#059669"
  board-lane: "#00000005"
  board-card: "#ffffff"
  board-card-selected: "#f2f2f2"
  board-card-done: "#ffffff99"
  urgent: "#ad6268"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.333
    letterSpacing: "0.01em"
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.333
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  xxl: "1rem"
  pill: "999px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.25rem"
  6: "1.5rem"
  8: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 0.75rem"
    height: "2rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 0.75rem"
    height: "2rem"
  input-default:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 0.75rem"
    height: "1.875rem"
  card-default:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xxl}"
    padding: "1.5rem"
  board-card:
    backgroundColor: "{colors.board-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0.75rem"
    height: "6.125rem"
  view-pill:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.lg}"
    padding: "0.125rem"
---

# Design System: Karamah Projects

## 1. Overview

**Creative North Star: "The Quiet Operations Desk"**

Projects is a working surface, not a marketing surface. Its visual job is to
make a connected workspace, its projects, and the next task legible at a
glance. The system is therefore compact, monochrome-first, and tactile at the
edges: hierarchy comes from exact alignment, typography, quiet tonal changes,
and predictable interaction states rather than decoration. This carries the
Karamah direction forward: calm, capable, community-minded software that feels
structured and quietly premium.

The interface is intentionally familiar to people who use serious project
tools. A persistent inset application shell holds a collapsible sidebar and a
single content workspace. The sidebar is navigation and context; the project
header is orientation and view control; the content surface is where work is
changed. Color is reserved for status, selection, focus, and semantic feedback.
It must never become a decorative wash across a screen.

This document is the normative visual and interaction reference for new
Projects surfaces. The current implementation is tokenized in
`Projects/src/index.css`, and primitives live in `Projects/src/components/ui`.
When a new surface needs a value, use an existing semantic token or primitive
before adding a one-off class.

**Key Characteristics:**

- Dense but breathable task-management UI; compact controls with generous
  enough touch targets.
- Warm monochrome light and dark themes, with muted semantic colors only where
  they communicate state.
- Plus Jakarta Sans for product copy and Geist Mono for dates, IDs, counts, and
  machine-like metadata.
- Low, broad depth from tonal layering and hairline borders; no glossy or
  ornamental elevation.
- Motion that explains change—route entry, view selection, drag feedback, and
  toast lifecycle—without turning navigation into choreography.

### Audit posture

The system was extracted from the live Projects source tree: global CSS
tokens, the shared button/card/input/badge/toast/sidebar primitives, the app
shell, project layout, project navigation, and board/list/backlog surfaces.
Static `impeccable detect` found two repeated deviations: list and backlog
drop states use a `border-l-4` accent stripe. New work should use the board's
whole-surface drop treatment instead—a subtle inset outline plus tonal wash—so
the target is clear without making a column look branded or damaged. This is
recorded as design debt; it was not changed during this documentation-only
audit.

Two smaller consistency notes are intentional implementation debt rather than
new tokens: workspace-level layouts use a compact `40px` header while the
project layout uses `44px` to fit its view controls, and the global stylesheet
also contains a large editor-specific component layer. New work should use
`40px` for workspace utility pages, `44px` for project work surfaces, and add
global CSS only when a behavior is genuinely cross-cutting.

Validation completed with repository layout and documentation checks, a
production Projects build, JSON/section validation for this document, and the
existing authenticated Playwright smoke suite (`4/4`, desktop and mobile).
That smoke suite covers the auth surface and viewport overflow, not a seeded
board screenshot or every authenticated route. A screenshot-level browser
audit would therefore be a useful follow-up, but it is not required to use
this design system and does not require a new dependency for implementation.

## 2. Colors

Projects uses a near-neutral palette with a black/white center of gravity.
Light mode is white canvas, black text, and low-opacity black boundaries. Dark
mode inverts those relationships with near-black surfaces and low-opacity white
boundaries. Semantic colors are small signals, not a second brand palette.

### Primary

- **Working Ink** (`#262626`): primary actions, active navigation, headings,
  and high-confidence emphasis in light mode. In dark mode, the role becomes
  near-white ink against the dark canvas.
- **Primary Contrast** (`#fafafa`): text on primary buttons and other filled
  primary controls.

### Semantic accents

- **Muted success** (`#059669`): successful save, completion, or confirmed
  delivery. Use as an icon or small label signal before using it as a fill.
- **Muted warning** (`#d97706`): attention required, paused work, or a risky
  setting. Do not use it for ordinary metadata.
- **Muted danger** (`#b66f74`): destructive actions, overdue status, and
  failure. Pair with text or an icon; never communicate danger by color alone.

The existing token ramp also includes blue information and neutral chart
colors. Those are permitted only for their semantic roles. A new feature must
not introduce a saturated project-specific accent without a product reason.

### Neutral surfaces

- **Canvas** (`#ffffff` light / approximately `#191919` dark): page and shell
  background.
- **Surface** (`#ffffff` light / `#1c1c1c` dark): cards, popovers, dialogs, and
  the board card surface.
- **Muted surface** (`#f5f5f5` light): sidebar and quiet secondary grouping;
  in dark mode this is a low-opacity white layer over the dark canvas.
- **Ink** (`#262626` light / `#ededed` dark): primary readable text.
- **Muted ink** (`#737373` light / `#8f8f8f` dark): descriptions, secondary
  metadata, empty-state guidance, and inactive controls.
- **Boundary** (`#00000014` light / `#ffffff0f` dark): hairline borders and
  separators. Boundaries should establish a relationship, not draw attention.
- **Accent wash** (`#0000000a` light / `#ffffff0a` dark): hover, selected,
  and pressed feedback on otherwise neutral controls.

### Task-specific roles

- **Lane** (`#00000005` light / `#0000001f` dark): board column ground. It
  separates a lane from the canvas without looking like a colored panel.
- **Task card** (`#ffffff` light / `#1c1c1c` dark): active task surface.
- **Selected task** (`#f2f2f2` light / `#262626` dark): selected task ground;
  use the selected border or focus ring in parallel.
- **Timeline bars** (soft sage for projects, lavender for people, and blue for
  task spans): planning data may carry restrained color while the shell and
  controls remain neutral.
- **Today marker** (a faint dusty-coral wash): orienting information may use a
  small warm signal in the date header and its matching column.
- **Calendar status bars** (blue for active work, lavender for review, and sage
  for completion): status color belongs to the scheduled work span; unknown
  statuses stay neutral.
- **Project progress** (a muted sage fill): completion can use a quiet positive
  signal in progress rings and bars.
- **Completed task** (`#ffffff99` light / near-transparent white dark): quiet
  completion treatment. Keep the title and ID visibly de-emphasized, but do
  not reduce them below practical contrast.
- **Urgent / overdue** (`#ad6268` light / `#ca8589` dark): priority and due
  date signal. Use on a compact bar, icon, or text chip.

### Named rules

**The One Signal Rule.** A surface may use one dominant semantic accent at a
time. If a task is overdue and selected, selection remains neutral and overdue
remains a small red signal; do not paint the entire card red.

**The Contrast-First Rule.** Text and state must remain understandable in both
themes and in grayscale. Every color state needs a shape, label, icon, border,
or position cue as backup.

**The Quiet Canvas Rule.** Keep color away from the page background. The
canvas, sidebar, and project shell should remain primarily white/black/neutral;
accent washes belong to the control or state that earned them.

## 3. Typography

**Display Font:** Plus Jakarta Sans (with `ui-sans-serif`, `system-ui`,
`sans-serif` fallbacks)

**Body Font:** Plus Jakarta Sans (same fallback stack)

**Label/Mono Font:** Geist Mono Variable (with `ui-monospace` fallbacks)

**Character:** Plus Jakarta Sans gives the product a human, quietly polished
voice without introducing a display face into a dense tool. Geist Mono makes
task identifiers, dates, counts, and other structured values feel exact and
easy to scan. Do not use the mono face for paragraphs or primary action copy.

### Hierarchy

- **Display** (`600`, `30px`, `1.2`, `-0.02em`): onboarding or a rare page-level
  title. It is not a dashboard decoration and should not appear in every
  route.
- **Headline** (`600`, `20px`, `1.3`, tight tracking): a page or dialog title
  that establishes the current job.
- **Title** (`600`, `16px`, `1.4`): project names, task-sheet titles, card
  headings, and section titles.
- **Body** (`400`, `14px`, `1.5`): standard navigation, descriptions, table
  content, form fields, and task metadata.
- **Label** (`500`, `12px`, `1.333`, slight positive tracking): compact control
  labels, chips, helper text, and uppercase section markers. Use case only when
  it improves scanning; do not turn the product into all caps.
- **Mono metadata** (`400`, `12px`, `1.333`, tabular numerals): task keys,
  dates, due labels, counters, shortcut keys, and other values whose alignment
  matters.

### Type rules

- Prefer weight and spacing before increasing size. A board card title stays
  compact and truncates to one line; it does not expand a card unpredictably.
- Use `line-clamp-1`/ellipsis for dense row and card labels. Preserve a full
  accessible name in `title`, `aria-label`, or the detail surface.
- Keep prose in descriptions to roughly 65–75 characters per line where the
  layout permits. Dense data tables and timelines may be wider.
- Use `font-variant-numeric: tabular-nums` with Geist Mono for counts and
  dates. Never align important numeric information with proportional body text.
- At phone widths, keep focused editable fields at least `16px` to prevent iOS
  zoom; preserve the same visual hierarchy with spacing rather than tiny type.

**The Two-Voice Rule.** Product language speaks in Plus Jakarta Sans. Data
language speaks in Geist Mono. A component should never mix the two casually;
the mono face is a signal that the value is structured or machine-like.

## 4. Elevation

Projects is flat by default and layered by purpose. The strongest depth cue is
the difference between canvas, surface, muted surface, and a low-contrast
boundary. Shadows are broad and faint, mainly for cards, popovers, toasts, and
drag feedback. Avoid a stack of nested shadows: it makes a dense workspace
feel heavy and competes with the task content.

### Shadow vocabulary

- **Soft surface:** the shared card treatment (`shadow-xs/5`) plus the faint
  one-pixel inner highlight used by the UI primitives. Use for cards and
  panels that need a readable edge against a similar background.
- **Board card:** light mode `0 1px 2px #0000000a`; dark mode
  `0 1px 2px #00000033, 0 4px 12px -4px #00000059`. This is structural but
  intentionally small.
- **Floating menu / popover:** `0 10px 28px` at low black opacity plus a
  `0 1px 2px` contact shadow. Use for menus, autocomplete, slash menus, and
  dialogs—not for ordinary list rows.
- **Toast:** the shared `shadow-lg/5` treatment with a quiet one-pixel inner
  edge. Toasts need separation from content but should not become alerts with
  giant glow.
- **Drag preview:** the board overlay may lift to approximately
  `0 8px 24px rgb(0 0 0 / 12%)` and a restrained focus ring. The preview must
  stay visually anchored to the pointer and must not capture pointer events.

### Motion and depth

- Default state transitions use `160ms` with
  `cubic-bezier(0.23, 1, 0.32, 1)`; route content and row entrance may use
  `160–180ms`.
- Drag reflow uses the same curve around `200ms`; the overlay is the only
  pointer-following layer.
- View changes, collapsibles, toasts, and menus may animate opacity,
  translate, scale, or height when that motion explains a state change.
- `prefers-reduced-motion: reduce` removes movement and keeps only essential
  opacity feedback. Never use motion to hide a layout shift.

**The Flat-by-Default Rule.** A resting control has no decorative glow. Depth
appears only when a surface is elevated, focused, selected, hovered, or being
dragged.

## 5. Components

Components should feel restrained and tactile: clear edges, compact spacing,
and feedback that is visible without being loud. All interactive components
must have default, hover, focus-visible, active/pressed, disabled, loading,
and error states where the state applies.

### Buttons

- **Shape:** `10px` (`rounded-lg`) for standard controls; compact `6px`
  (`rounded-md`) for extra-small actions; icon-only controls retain the same
  shape as their neighboring text controls.
- **Primary:** Working Ink fill, Primary Contrast text, `32px` desktop height
  (`36px` for the default/base size when the context needs it), compact
  horizontal padding, and a small inset highlight. Use for the one primary
  action in a surface.
- **Secondary / outline:** surface background with the boundary token. Hover
  adds the accent wash; it does not change to a saturated fill.
- **Ghost:** transparent at rest, accent wash on hover/pressed, and readable
  text. Use for sidebar actions, view controls, and low-risk secondary actions.
- **Destructive:** muted danger fill for the final destructive action;
  destructive outline for reversible or secondary destructive choices.
- **Focus / disabled / loading:** focus-visible uses a `2px` ring plus a
  background offset; disabled controls remain legible at reduced opacity and
  lose pointer events; loading preserves button geometry and replaces the
  label visually with the spinner while keeping the accessible name.
- **Touch:** pointer-coarse controls must expose a minimum `44px` hit area even
  when the visual icon is smaller.

### Inputs and fields

- **Style:** `30px` desktop compact height (`34px` default), `8px` radius,
  surface background, low-opacity boundary, body text, and a faint contact
  shadow. Text inputs are not pills.
- **Focus:** boundary changes to the ring token and a `3px` low-opacity ring;
  error focus uses the destructive token. Do not rely on a browser-default
  outline or color alone.
- **Error / disabled:** errors keep the field readable, add a concise message
  and destructive border/ring; disabled fields are visibly inactive but retain
  their label and value contrast.
- **Search:** prefix the field with the search icon, preserve a clear action,
  and keep the input compact in toolbars. Search results should show what was
  matched, not only a spinner.

### Cards and containers

- **Standard card:** `16px` (`rounded-2xl`) radius, surface background, thin
  boundary, shared soft surface elevation, and `24px` padding for general
  content. Use the card primitive when the boundary communicates grouping.
- **Dense card/panel:** use `10px` radius and `12–16px` padding for task
  surfaces, settings rows, and compact panels.
- **Do not card everything:** a list, section, or page shell may use dividers
  and negative space when another boundary would add no meaning.
- **Nested surfaces:** use tonal layering and a smaller inner radius. Avoid
  visible double borders and repeated shadows.

### Task cards

- **Geometry:** every board task card is `98px` tall, `12px` padding, `10px`
  radius, and one-line title truncation. The bottom metadata row always keeps
  a fixed-height slot so completed and active cards align.
- **Content order:** optional ID/selection/assignee row, one-line title, then
  a compact chip row for priority, due date, subtasks, checklists, pull
  requests, labels, and custom fields. Completed cards replace the metadata
  chips with a relative completion date such as Today, Yesterday, or 3 days
  ago.
- **States:** resting uses a hairline boundary and tiny shadow; hover raises
  boundary contrast; selected uses neutral selected fill plus selected border;
  keyboard focus uses the focus border; drag hides the source card and shows
  one overlay with a restrained lift. Completed cards reduce text emphasis but
  retain a stable date signal.
- **Interaction:** the full card is keyboard reachable and draggable unless
  disabled. Context-menu and chip controls must stop their own pointer events
  from starting a card drag.

### Board columns and drop targets

- **Column:** flexible column with a quiet lane ground, `12px` radius, compact
  header, internal vertical scroll, and `16px` inter-column gap. The board
  scrolls horizontally; columns do not squeeze task cards below a usable
  width.
- **Drop feedback:** the target column gets a full perimeter boundary/ring and
  restrained selected wash while the pointer is over it. Do not use a thick
  colored stripe at only one edge. Empty columns must still expose the full
  droppable area.
- **Sorting:** automatic sort states explain why manual ordering is not
  available. The explanation is a small anchored status hint, not a modal.

### Chips, badges, and metadata

- **Shape:** compact chips use `6px` radius and a one-pixel boundary; status
  badges may use the same compact shape. Pill shapes are reserved for true
  tags, counts, avatars, or progress indicators.
- **Color:** neutral at rest; semantic variants use low-opacity semantic wash
  with readable semantic foreground. Keep urgent and overdue red small.
- **Content:** labels truncate with a title/tooltip, icons are `12–14px`, and
  date/count values use Geist Mono.

### Navigation and shell

- **App shell:** a `2px` desktop inset around the main content, rounded outer
  shell, persistent sidebar, and a compact `40–44px` header. Keep the right
  side open for workspace actions, theme, and view controls.
- **Sidebar:** muted surface, `8px` menu rows, `32px` row height, `8px` group
  rhythm, and a neutral accent wash for active rows. The workspace switcher is
  the context anchor; Projects is a collapsible group with a plus action.
- **Collapsed sidebar:** preserve a minimum content inset so the body never
  touches the left border. Icon-only rows require tooltips and the same focus
  ring as expanded rows.
- **Project header:** breadcrumb/context first, view pill after context, tools
  at the far edge. The view pill is content-sized, horizontally scrollable on
  narrow screens, and keeps the active item visible.
- **Mobile:** the sidebar becomes an off-canvas sheet; project navigation uses
  a mobile selector; toolbars wrap or scroll rather than overflow the viewport.

### View switchers and toolbars

- **View pill:** `8px` radius, `2px` inner padding, neutral background, compact
  icon+label items, and one active accent wash. Active view changes may glide
  horizontally, but the selected state must update immediately.
- **Toolbar:** one row of search, filter, display, and action controls with
  `4–8px` gaps. Actions that modify data should be separated from view/filter
  controls by a hairline divider.
- **Backlog/list:** group headers use the same chevron, count, and plus
  vocabulary as the sidebar. Drop feedback must follow the board whole-surface
  rule.

### Dialogs, menus, sheets, and toasts

- **Dialogs:** use a surface, `16px` radius, compact title/description stack,
  clear footer actions, and a single primary action. Destructive dialogs state
  the consequence in plain language.
- **Menus:** surface, `8–10px` radius, compact `28–32px` rows, grouped by
  relationship, and keyboard navigable. Do not use menus for information that
  should remain visible in the page.
- **Sheets:** task detail is a focused work surface with a stable header and
  scrollable body; preserve the task title and primary actions while scrolling.
- **Toasts:** bottom-right by default, max `360px`, `4.5s` timeout, icon plus
  concise title and useful description, swipe/dismiss support, and semantic
  icon color. A toast states what happened, to which subject, and what action
  is available; it does not become a mini-log.

### Empty, loading, and error states

- Prefer skeletons that match the eventual geometry for initial loading.
- Empty states name the missing object and give one next action; do not show
  decorative illustrations in a dense workspace.
- Errors are calm, specific, and actionable. Put the detail near the failed
  surface and expose retry or recovery when possible.
- Never hide a failed save behind an optimistic state with no rollback or
  explanation.

### Iconography and accessibility

- Use the established Lucide icon family at `14–16px` for inline controls and
  `20px` only for prominent navigation or empty states. Icons inherit semantic
  color and never carry meaning alone.
- Every icon-only control has an accessible name and a tooltip when the
  sidebar is collapsed. Keep keyboard focus visible with the shared ring.
- Use semantic elements and aria state (`aria-expanded`, `aria-pressed`,
  `aria-current`, `role=status`, `role=alert`) rather than styling a `div` to
  behave like a control.
- Support keyboard dragging and movement, screen-reader instructions, touch
  hit areas, dark mode, and `prefers-reduced-motion`.

## 6. Do's and Don'ts

### Do:

- **Do** use the existing semantic tokens in `Projects/src/index.css` before
  inventing a literal color or one-off shadow.
- **Do** keep the interface primarily white/black/neutral, reserving muted
  semantic color for status, selection, focus, and feedback.
- **Do** use Plus Jakarta Sans for product language and Geist Mono for dates,
  IDs, counts, and structured metadata.
- **Do** keep task cards equal in height, titles to one line with ellipsis, and
  metadata slots stable so columns align.
- **Do** make the entire valid drop target visibly respond during a drag.
- **Do** preserve a minimum `44px` touch target even when an icon visually
  measures `16px` or less.
- **Do** provide default, hover, focus-visible, active, disabled, loading,
  error, empty, and reduced-motion behavior where applicable.
- **Do** keep the primary action obvious and make secondary actions quiet.
- **Do** use dividers and negative space when a card boundary would not explain
  ownership or elevation.
- **Do** validate new dense surfaces at 360px wide, keyboard-only, light mode,
  dark mode, and grayscale.

### Don't:

- **Don't** use generic SaaS styling, excessive empty space, scattered
  alignment, decorative cards, glassmorphism, HUD-like controls, heavy shadows,
  neon color, or oversized typography.
- **Don't** make the visual weight of the interface compete with the user's
  task.
- **Don't** put saturated brand colors across the canvas or color every card;
  subtle is the default and semantic is the exception.
- **Don't** use a thick `border-l-4` stripe as the only drop confirmation.
- **Don't** use a different button shape, input height, icon family, or focus
  treatment for a new screen.
- **Don't** use display fonts, all-caps paragraphs, or mono text for ordinary
  prose and task titles.
- **Don't** let a long title grow a task card or cause sibling cards to have
  different heights.
- **Don't** communicate completion, urgency, danger, or selection with color
  alone.
- **Don't** use decorative motion, orchestrated page-load sequences, or motion
  that hides a layout shift. Honor reduced motion.
- **Don't** invent non-standard modals, custom scrollbars, weird form
  controls, or hover-only actions without a keyboard/touch equivalent.
- **Don't** nest multiple high-contrast borders and shadows around a single
  content group.
