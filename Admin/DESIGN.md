# Karamah Collective administration

## Direction

A compact community operations workspace. Light mode uses a very pale golden
ivory canvas and navigation with green actions. Dark mode reverses
the emphasis with deep green-charcoal surfaces and warm gold actions. The type
system remains self-hosted Geist and Geist Mono with Phosphor icons.
Color signals state; avoid ornamental gradients, artificial analytics, or continuous
animation that competes with moderation work.

In light mode, barely-golden ivory and quiet warm neutrals own the environment while green
owns interactive actions, focus, active editor tabs, selected controls, and
links. The gold cast must be perceptible but very light, never saturated.
In dark mode, deep green
owns the environment while warm gold owns those same interactive roles. Filled
controls always use a neutral high-contrast foreground, never green text on gold.
Semantic danger, warning, and success roles remain independent of this inversion.

## Composition and navigation

- Desktop: grouped sidebar with the Website logo, a visible collapse/expand control,
  animated label compression, and persistent preference.
- Tablet (768–1100 px): default to the icon rail; allow expansion.
- Phone: one drawer with a backdrop, focus containment, Escape dismissal, and inert
  background. Close it after navigation.
- Keep the breadcrumb and page search available in every layout. Ctrl/Cmd K opens
  a native modal with keyboard navigation and routes through normal links so unsaved
  settings protection still applies.
- Dashboard: a compact metric strip, review queue, category distribution, team
  activity, and workspace shortcuts. Counts come from the existing admin API.
- Collections: optional column filters, keyboard sorting, row density, local table
  scrolling, always-visible pagination, and actionable empty results.
- Review moderation: keep the collection row compact and route review publication,
  individual image visibility, and reviewer access into the shared native editor
  dialog. Visibility changes are reversible; account bans require confirmation and
  never silently republish content when removed.
- Settings: section navigation preserves the full draft across sections. Saving,
  validation, and revision conflict detection retain the existing API contract.

## Shared foundations

`styles/tokens.css` owns palette, type, spacing variables, focus, and base styles.
`styles/layout.css` owns the shell, controls, authentication, and motion.
`styles/dashboard.css`, `table.css`, `editors.css`, and `cells.css` own their
respective surfaces. Reuse these components before adding page-specific styles.

Use 150–260 ms transitions for pointer interactions and brief staggered dashboard
entrances. Animate transform and opacity. Keyboard page changes skip entrance motion;
`prefers-reduced-motion` disables movement. Do not delay access to controls.

## Validation

From `Admin/`: `npm run build` and `npm test` (install dependencies at the monorepo root).
Browser fixtures intercept modules only inside Playwright; no test authentication
bypass is shipped in the application. Tests cover all routes at phone, tablet, and
desktop widths, collection controls, moderation API payloads, settings drafts,
search, drawer focus, error/empty states, and reduced motion.

`node Admin/tests/audit.mjs after` from the repository root captures dashboard
screenshots with local fixture data. Production Firebase sign-in and live writes
are not exercised by these UI tests.
