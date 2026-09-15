> **Monorepo setup:** This application now lives in `Website/`. Install dependencies once at the repository root with `npm ci`. See [the root README](../README.md) and [DEPLOYMENT.md](../DEPLOYMENT.md) for current development, Cloudflare, and Google Sheets instructions. The older standalone setup/deployment commands below are superseded.

# Karamah Collective — Website

> **Community-powered support for Muslims in Finland — clear information, practical guidance, and compassionate connections.**

[![Live Site](https://img.shields.io/badge/Live-karamahcollective.com-0b0f1a?style=for-the-badge)](https://karamahcollective.com/)
[![Hosted on](https://img.shields.io/badge/Hosted%20on-Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

---

## Table of Contents

- [Karamah Collective — Website](#karamah-collective--website)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Tech Stack](#tech-stack)
  - [Project Structure](#project-structure)
  - [Architecture](#architecture)
  - [Sections](#sections)
    - [Hero (Home)](#hero-home)
    - [About](#about)
    - [Programs](#programs)
    - [Janazah Initiative](#janazah-initiative)
    - [Team](#team)
    - [Contact](#contact)
  - [Navigation System](#navigation-system)
    - [Scroll-Spy](#scroll-spy)
    - [Animated Pill Indicator](#animated-pill-indicator)
    - [Mobile Brand Collapse](#mobile-brand-collapse)
    - [Topic Pre-fill](#topic-pre-fill)
  - [Hero Aurora Effect](#hero-aurora-effect)
    - [CSS Layers](#css-layers)
    - [CSS Animations](#css-animations)
    - [JS Enhancements](#js-enhancements)
    - [`hero.html` Prototype](#herohtml-prototype)
  - [Scroll Reveal System](#scroll-reveal-system)
    - [How It Works](#how-it-works)
    - [Staggered Delays](#staggered-delays)
    - [Headline Wipe](#headline-wipe)
    - [Reduced Motion](#reduced-motion)
  - [Contact Form \& Backend](#contact-form--backend)
    - [Client-Side Form Handling](#client-side-form-handling)
    - [Sending State](#sending-state)
    - [Backend (Cloudflare Pages Function + Brevo)](#backend-cloudflare-pages-function--brevo)
    - [Secret Management](#secret-management)
  - [Anti-Bot \& Security](#anti-bot--security)
    - [Four-Layer Bot Protection (Client → Server)](#four-layer-bot-protection-client--server)
    - [HTTP Security Headers (`_headers`)](#http-security-headers-_headers)
    - [AI Crawler Blocking (`robots.txt`)](#ai-crawler-blocking-robotstxt)
  - [Performance Optimizations](#performance-optimizations)
  - [Accessibility](#accessibility)
  - [SEO \& Social Sharing](#seo--social-sharing)
  - [Hosting \& Deployment](#hosting--deployment)
    - [Deploying Updates](#deploying-updates)
    - [Updating the Form Backend](#updating-the-form-backend)
  - [Assets](#assets)
  - [Dark Mode](#dark-mode)
  - [Privacy Policy](#privacy-policy)
  - [Source Code \& Version Control](#source-code--version-control)
  - [License](#license)

---

## Overview

The Karamah Collective website is a single-page application built for a Finnish-Muslim community organization. The name **Karāmah** (كرامة) — derived from the Arabic *karuma* (to be noble) — signifies honour, dignity, respect, and nobility. The website reflects these values through its design: clean, elegant, and intentional.

The entire site is built with **zero frameworks and zero runtime dependencies** — the only external CDN resource is reCAPTCHA (loaded dynamically on form interaction). Tailwind CSS is compiled ahead of time into a minimal static stylesheet (~30 KB) containing only the utilities the site actually uses, and Lucide icons are rendered from an inline SVG map (~2 KB) instead of a CDN script. The site is deployed on Cloudflare Pages with a Pages Function powering the contact form, Brevo sending email notifications, and Google Apps Script used only for the updates opt-in register.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Markup** | HTML5 | Semantic, single-page, `~1,470` lines |
| **Styling** | Tailwind CSS (pre-built) + custom CSS | Purged & minified via CLI; `~1,800` lines of custom CSS + `~800` lines dark mode |
| **Scripting** | Vanilla JavaScript (ES2020+) | No framework; `~2,460` lines |
| **Icons** | [Lucide](https://lucide.dev/) (inline SVG) | 12 icons rendered from a built-in SVG map (~2 KB) — zero CDN |
| **Form backend** | Cloudflare Pages Functions + Brevo | Sends email notifications and writes explicit update opt-ins to Google Sheets |
| **Bot protection** | Google reCAPTCHA v3 | Invisible, score-based verification |
| **Hosting** | Cloudflare Pages | Static deployment, edge-cached, custom headers |
| **Domain** | `karamahcollective.com` | Managed via Cloudflare |

---

## Project Structure

```
deploy/
├── index.html                          # Single-page HTML document (all 6 sections)
├── privacy-policy.html                 # Privacy policy content (loaded as overlay via JS)
├── _headers                            # Cloudflare Pages security headers
├── robots.txt                          # Crawler directives + AI bot blocking
├── .gitignore                          # Ignores build/node_modules
├── README.md                           # Project documentation
├── functions/
│   └── api/
│       ├── config.js                    # Public runtime config (reCAPTCHA site key)
│       └── contact.js                   # Contact form API: reCAPTCHA, Brevo, opt-in sheet write
├── assets/
│   ├── css/
│   │   ├── tailwind.css                # Pre-built, purged Tailwind utilities (~30 KB)
│   │   ├── styles.css                  # Custom styles beyond Tailwind (~1,800 lines)
│   │   └── dark-mode.css               # Dark mode overrides + toggle styling (~800 lines)
│   ├── images/
│   │   ├── kc_logo_big.inline.svg      # Hero section Arabic calligraphy logo
│   │   ├── kc_logo_small.webp          # Header/footer logo — light mode (32×32 WebP)
│   │   ├── kc_logo_small_dark.webp     # Header/footer logo — dark mode (32×32 WebP)
│   │   ├── kc_logo_small_icon.ico      # Favicon
│   │   └── kc_logo_small_site_preview.webp  # OG/Twitter social preview image (512×512)
│   └── js/
│       └── app.js                      # All client-side logic (~2,460 lines)
├── build/                              # Tailwind CSS build tooling (not deployed)
│   ├── tailwind.config.js              # Content paths + typography plugin
│   ├── tailwind-input.css              # Tailwind directives (@tailwind base/components/utilities)
│   ├── package.json                    # npm scripts: build:css, watch:css
│   ├── package-lock.json
│   └── node_modules/                   # Dev dependencies (gitignored)
└── reference/
    ├── google_apps_script.js           # Opt-in register writer (paste into Google Apps Script)
    └── hero.html                       # Standalone aurora prototype / reference file
```

There is no runtime `package.json` or `node_modules` in the deploy root. The `build/` folder contains the Tailwind CSS tooling used to generate `assets/css/tailwind.css` — it is not deployed. The `deploy/` folder itself is served directly by Cloudflare Pages.

---

## Architecture

The site follows a **zero-build, CDN-augmented static architecture**:

```
Browser
  ├── index.html ──────────────── Single HTML document (all sections)
  ├── assets/css/tailwind.css ─── Pre-built Tailwind utilities (~30 KB)
  ├── assets/css/styles.css ───── Custom CSS (aurora, reveals, nav pill, forms)
  ├── assets/css/dark-mode.css ── Dark mode overrides (all viewports)
  ├── assets/js/app.js ────────── All JS (nav, scroll-spy, hero, form, reveal)
  ├── Inline Lucide SVGs ──── Icon rendering (~2 KB, no CDN)
  └── reCAPTCHA v3 (CDN) ──── Invisible bot protection (lazy-loaded)
         │
         ▼  (form submit)
  Cloudflare Pages Function ── Validates + labels low reCAPTCHA scores
         │
         ├── Brevo API ───────── Sends styled email notification
         └── Google Apps Script ─ Writes opt-in row only when updates=yes
```

All logic lives in a single `app.js` file, organized as a series of `init*()` functions called sequentially on `DOMContentLoaded`. There is no module system, no component tree, and no virtual DOM — just careful vanilla JavaScript with modern APIs (`IntersectionObserver`, Web Animations API, `ResizeObserver`, `MutationObserver`, `fetch`, CSS custom properties driven from JS).

---

## Sections

The page is divided into six sections, each identified by an `id` used for scrolling and navigation:

### Hero (Home)

The hero section is the visual centrepiece. It features:

- **Aurora background** — Multi-layered animated gradients with 6 colour clusters (3 green/teal + 3 pink) that slowly swap positions, creating an ever-flowing aurora effect. Uses blur, blend modes, and frosted glass overlay. See [Hero Aurora Effect](#hero-aurora-effect) for details.
- **Arabic calligraphy logo** — `kc_logo_big.inline.svg` loaded as an `<object>` element and inlined at runtime for styling control. The logo animates through brand greens/blues (`#08705B` → `#0B3C49`); in dark mode, lighter variants (emerald-400 → teal-400 → sky-400) are used with a soft glow for contrast against the midnight background.
- **Logo meaning panel** — An interactive tooltip that expands on click/hover to show the Arabic etymology of "Karāmah" (كرامة) with a Wehr dictionary citation (p. 822). On desktop, it auto-peeks after 1,400ms as a subtle hint animation.
- **Headline wipe** — The main heading reveals with a CSS `clip-path: inset()` animation that wipes upward.
- **Qur'anic verse** — "Indeed, We have dignified the children of Adam." — Qur'an 17:70
- **Staggered reveal** — All content blocks enter with staggered delays (0ms, 90ms, 180ms, 300ms).
- **Desktop pinning** — On viewports ≥768px, the hero is `position: fixed` with a spacer div preserving scroll flow. As the user scrolls, content parallaxes, fades, and scales down, creating a "scroll past" effect.

### About

- Organization description with callout card
- Three pillar cards: *Divine Guidance*, *Sustainable Growth*, *Eternal Perspective*
- Mission statement cards
- Two-column grid: *Focus Areas* and *How We Work* (4 bullet points each)

### Programs

Three expandable program cards in a responsive grid:

1. **Janazah Initiative** — End-of-life guidance (`shield-check` icon)
2. **Fajr Journal Club** — Islamic book club for women (`book-open` icon)
3. **Neurodiverse Muslims** — Neurodivergent voices (`brain` icon)

On **desktop** (hover devices), cards show ~1.5 lines of text as a teaser with a fade-to-background gradient overlay hinting at hidden content. Clicking or focusing a card expands it to reveal the full description; only one card expands at a time. On **mobile** (touch devices), all cards are expanded by default — no interaction required. Each card uses `aria-expanded`, `tabindex="0"`, and `role="article"` for accessibility. The expand/collapse transition uses a `max-height` animation (1,200ms expand / 900ms collapse with `cubic-bezier(0.22, 1, 0.36, 1)`) and a chevron that rotates 180° (900ms). The fade gradient adapts to the card's background colour in dark mode.

### Janazah Initiative

The flagship program section, featuring:

- Three pillar cards: *Vision*, *Mission*, *Approach*
- Population statistics (120,000+ Muslims in Finland; only 22,260 registered in 2022)
- Goal grids: short-term and long-term objectives
- "What we aim to provide" card with checklist items and an "In development" badge
- Support CTA buttons that pre-fill the contact form topic dropdown

### Team

Dynamic team member cards in a responsive grid (2-col on `sm:`, 3-col on `lg:`), loaded from the Google Sheet worksheet `people_directory`.

Expected worksheet columns:

| Name | Email | Position | Status | Description | Location |
|---|---|---|---|---|---|

Only rows where `Status` is `active` appear on the website. The section shows three placeholder team cards while `/api/team` fetches the directory, then renders each active member with generated initials, position, and a clickable email link. Description and location stay internal.

### Contact

- **Contact form** with fields: Full Name (required), Email (required), Phone (optional, `inputmode="tel"`), Topic (dropdown), Message (required, textarea), Updates checkbox
- **Contact info sidebar**: email, location (Helsinki, Finland), quick-links to all sections, social links (Instagram, LinkedIn)
- **Privacy policy link** — clickable text in the form disclaimer and footer opens an overlay (see [Privacy Policy](#privacy-policy))
- **Legal disclaimer** about not offering legal services
- See [Contact Form & Backend](#contact-form--backend) for full details.

---

## Navigation System

The navigation is a custom-built scroll-spy system with an animated pill indicator:

### Scroll-Spy

- Monitors `scrollY` against each section's `offsetTop` to determine the active section
- Active button receives `data-active="true"` and `aria-current="page"`
- Header attributes `data-scrolled` and `data-away-home` track scroll state for styling
- Smooth scrolling via `window.scrollTo({ behavior: "smooth" })` with header offset compensation
- Custom `kc:navigate` event dispatched on navigation

### Animated Pill Indicator

A floating background element (`.kc-navpill`) that slides behind the active nav button:

- **Created dynamically** inside the nav scroller as an absolutely positioned `<div>`
- **Transitions between buttons** using the Web Animations API (`element.animate()`) with:
  - **Stretch effect**: the pill widens when crossing distance between buttons
  - **Scale-Y squish**: subtle vertical squash during motion
  - **Blur**: slight blur during transition
  - **Duration**: 650–980ms on mobile, 1,200–1,800ms on desktop
  - **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)`
- **Show/hide animations**: scales from/to 0 on the X axis with blur
- **Continuous alignment**: `ResizeObserver` on the topbar row and nav scroller, `MutationObserver` on header attribute changes, and per-frame positioning loops keep the pill perfectly aligned during scroll, resize, and touch interactions
- **Reduced motion**: all animations disabled when `prefers-reduced-motion: reduce` is active

### Mobile Brand Collapse

On mobile, when the user scrolls past the hero section, the brand text width transitions to 0 (720ms) to reclaim space for navigation buttons. The width is measured at runtime via `getBoundingClientRect()` and stored as a CSS custom property (`--kc-brand-w`).

### Topic Pre-fill

CTA buttons throughout the page (e.g., "Request Janazah Support", "Volunteer for Janazah") carry a `data-topic` attribute. Clicking them scrolls to the contact section and automatically selects the matching topic in the form dropdown.

---

## Hero Aurora Effect

The aurora is a CSS + JS effect combining 6 colour clusters, position-swap animation, mouse parallax, and scroll-driven opacity.

### CSS Layers

1. **6 gradient blobs** — 3 green/teal + 3 pink, rendered as radial gradients on `.kc-hero-bg::before` with `mix-blend-mode: darken` (light) / `screen` (dark). Each blob's position is driven by CSS custom properties (`--kc-blob1-x` through `--kc-blob6-x` / `-y`) set by JS on page load.
   - **Desktop**: Large blobs (1240–1480px) with extended fade edges (80–84%) and heavily overlapping positions so colours mix and blend like real auroras.
   - **Mobile**: Smaller blobs (460–540px) with tighter fade (64%) and a well-spread 2×3 grid to keep both colours evenly visible on narrow screens.
2. **Ambient glow**: Decorative accent divs adding depth and warmth
3. **Frosted glass**: `backdrop-filter: blur(42px) saturate(1.2) contrast(1.04)` with a semi-transparent white overlay, creating a diffused, glassy appearance

### CSS Animations

All aurora layers use independent `@keyframes` animations with matching 0%/100% keyframes for seamless infinite looping (no visible "reset"):

- **Drift** (`kcAuroraDrift`): 26s translate/scale/blur cycle with scroll-reactive `calc()` values
- **Shimmer** (`kcAuroraShimmer`): 19s translate/scale oscillation on the frosted glass overlay

### JS Enhancements

- **Randomised blob placement**: On each page load, 6 positions are generated in a device-aware layout (2×3 grid on mobile, heavily overlapping zones on desktop), shuffled, and applied as CSS custom properties.
- **Position-swap animation**: Every 8–12 seconds, two random blobs smoothly trade places over 4 seconds using `requestAnimationFrame` with cubic ease-in-out interpolation. This creates slow, organic colour migration without jarring movement. Respects `prefers-reduced-motion`.
- **Mouse parallax** (desktop only, `hover: hover + pointer: fine`): each aurora layer responds to mouse movement with independent parallax offsets, smoothed via per-frame lerp (factor 0.06)
- **Scroll parallax**: as the user scrolls, CSS variables update to drive:
  - Content parallax: `--hero-parallax-y` (0 → −44px)
  - Background parallax: `--hero-bg-y` (0 → −110px)
  - Background zoom: `--hero-bg-scale` (1 → 1.06)
  - Aurora opacity: `--aurora-color-opacity` (1 → 0, aurora fades out)
  - Content fade/scale at scroll progress 0.3–0.95

### `hero.html` Prototype

A standalone file containing an isolated version of the aurora effect with its own CSS and JS. This was used during development to iterate on the aurora design independently of the main page. It includes additional wave and curtain keyframe animations (28–34s cycles with 3D transforms) that were simplified for the production version.

---

## Scroll Reveal System

Content sections animate into view using an `IntersectionObserver`-based reveal system:

### How It Works

1. All elements with `data-reveal` start with CSS: `opacity: 0`, `translateY(18px)`, `scale(0.992)`, `blur(6px)`
2. An `IntersectionObserver` watches them with thresholds `[0, 0.02, 0.08, 0.14, 0.22]` and root margin `-8% 0px -10% 0px`
3. When 14%+ of the element is visible, it receives `is-inview` → transitions to full opacity, no translate, no blur
4. When scrolled far out of view, it receives `is-outview` → translates up 18px, scales 0.996, blurs 4px (reverse exit). On mobile, `is-outview` uses only an opacity fade (no transform) to avoid triggering layout shifts during elastic overscroll.
5. Re-entering the viewport replays the in-animation
6. A 280ms cooldown per element prevents flicker from rapid scrolling
7. At the bottom of the page (`scrollY + innerHeight ≥ scrollHeight - 2`), reveal resets are skipped entirely to prevent shaking caused by mobile elastic overscroll (rubber-banding)

### Staggered Delays

Elements can specify `data-delay="90"` (milliseconds) which is applied as `transition-delay`. Hero elements use delays of 0, 90, 180, and 300ms for a cascading entrance.

### Headline Wipe

The main hero heading uses a special CSS `clip-path` reveal:

1. Element gets `.kc-wipe-ready` → `clip-path: inset(0 0 14% 0)` (bottom portion hidden)
2. After a frame, `.kc-wipe-in` is added → `clip-path: inset(0 0 -8% 0)` over 780ms
3. The 8px border-radius in the inset creates a soft edge on the revealing clip

### Reduced Motion

When `prefers-reduced-motion: reduce` is detected, all elements are immediately shown at full opacity with no transitions or animations.

---

## Contact Form & Backend

### Client-Side Form Handling

The form is handled entirely in vanilla JavaScript with no form library:

- **Field validation**: per-field validators for name (required), email (required + regex), phone (optional, format validation), and message (required)
- **Inline errors**: dynamically created `<p>` elements with `role="status"` and `aria-live="polite"` — screen readers announce errors as they appear
- **Validation on blur**: fields validate on `focusout` for immediate feedback
- **Phone normalization**: strips non-numeric characters, converts `00` prefix to `+`, converts leading `0` to `+358` (Finland country code)
- **Email regex**: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

### Sending State

When the form submits, the button enters a "sending" state:

- Button dimensions are locked (`width`/`height`) to prevent layout shift
- Content replaced with "Sending…" text
- A **frosted-glass shimmer sweep** (`::before` pseudo-element) slides across the button using `--kc-ease` — matching the site's aurora aesthetic
- The text gently **pulses opacity** (3.2s breathing cycle)
- All form controls are disabled; `aria-busy="true"` is set on the form

### Backend (Cloudflare Pages Function + Brevo)

The form POSTs JSON to `/api/contact`, a Cloudflare Pages Function:

1. **Honeypot check** → silent fake success if triggered
2. **Timing check** → submission must be between 1.5s and 1 hour old
3. **reCAPTCHA v3 verification** → POSTs token to Google's siteverify API; scores below 0.5 are labeled as potential spam in the notification email
4. **Field validation** → name, email, message required; email regex
5. **Email notification** → sends a plain-text transactional email through Brevo to `contact@karamahcollective.com`, with `replyTo` set to the submitter's email
6. **Opt-in sheet write** → only when the user actively checks "Keep me updated", appends Name, Email, Phone, reCAPTCHA Score, and Date to the `updates_opt_ins` Google Sheet tab. If reCAPTCHA could not be checked, the score records the reason, such as `not checked (missing secret)`.
7. **Phone formatting** → the Apps Script formats the phone cell as plain text (`@`) before value is written, preserving the `+` sign

The team section fetches `/api/team`, a Cloudflare Pages Function that calls the same configured Google Apps Script URL with `worksheet=people_directory`. The function returns only active rows and exposes the public fields used by the cards.

### Secret Management

Sensitive values are stored in **Cloudflare Pages environment variables** - never hardcoded in source.

Cloudflare Pages variables:

- `BREVO_API_KEY`
- `googleSheetUrl` (already configured; `GOOGLE_SHEET_URL` also works)
- `recaptchaSiteKey` (already configured; `RECAPTCHA_SITE_KEY` also works)
- `recaptchaSecret` (must be added; `RECAPTCHA_SECRET` also works)

`recaptchaSiteKey` is the public browser key returned by `/api/config`. `recaptchaSecret` is a different server-only key and must be available to `/api/contact` for Google siteverify to return a score. Without it, update opt-in rows record `not checked (missing secret)`.

---

## Anti-Bot & Security

### Four-Layer Bot Protection (Client → Server)

| Layer | Location | Mechanism |
|---|---|---|
| **1. Dynamic honeypot** | Client | Hidden input with randomized name (`kc_<random>_<timestamp>`), positioned off-screen. Bots that fill it are silently rejected. |
| **2. Timing check** | Client + Server | `kc_started_at` timestamp embedded on page load. Submissions faster than 1.5s (bot) or older than 1 hour (stale) are silently rejected. |
| **3. Rate limiting** | Client | LocalStorage-based 35-second cooldown between submissions (`kc_last_submit_at`). |
| **4. reCAPTCHA v3** | Client + Server | Invisible score-based verification. Token obtained via `grecaptcha.execute()`, verified server-side. Scores below 0.5 are marked `Possible spam` in the internal email. |

All rejections return a fake `{ success: true }` response to prevent bots from detecting they've been caught.

### HTTP Security Headers (`_headers`)

Applied to all routes via Cloudflare Pages:

| Header | Value | Purpose |
|---|---|---|
| `X-Frame-Options` | `DENY` | Prevents clickjacking via iframe embedding |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS protection for older browsers |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Disables device APIs and FLoC |
| `Content-Security-Policy` | `frame-ancestors 'none'` | CSP-level frame embedding prevention |

These are duplicated as `<meta>` tags in `index.html` for environments where Cloudflare headers might not apply.

### AI Crawler Blocking (`robots.txt`)

The following AI training crawlers are explicitly blocked:

- GPTBot, ChatGPT-User (OpenAI)
- Google-Extended (Google AI training)
- CCBot (Common Crawl)
- anthropic-ai, ClaudeBot (Anthropic)
- Bytespider (ByteDance/TikTok)
- FacebookBot (Meta)
- AhrefsBot, SemrushBot, DotBot, MJ12bot, PetalBot (SEO scrapers)

---

## Performance Optimizations

| Technique | Where | Detail |
|---|---|---|
| **`content-visibility: auto`** | CSS (`.kc-section`) | Offscreen sections skip rendering until near the viewport. `contain-intrinsic-size: 800px` provides a size estimate to prevent layout shift. |
| **`will-change`** | CSS | Applied selectively to animated elements (nav pill, reveal elements, hero layers). |
| **`requestAnimationFrame` batching** | JS | Scroll handlers and parallax updates are batched per frame. Delta thresholds (0.0005) skip redundant updates when nothing visually changed. |
| **Lerp smoothing** | JS | Mouse parallax uses per-frame linear interpolation (factor 0.06) instead of raw input, eliminating jitter. |
| **`ResizeObserver`** | JS | Layout-dependent calculations (hero height, card sync, nav pill positioning) use `ResizeObserver` instead of polling or resize event listeners. |
| **Inline Lucide icons** | JS | 12 SVG icons are embedded in a ~2 KB `_LUCIDE_ICONS` map inside `app.js`, eliminating the ~180 KB Lucide CDN script and its network request. |
| **Deferred scripts** | HTML | `app.js` uses `defer` — loading without blocking parsing. reCAPTCHA is loaded dynamically only when the contact form is interacted with. |
| **Tailwind CSS purge** | Build | Tailwind CLI scans HTML/JS for used classes and outputs a minified ~30 KB CSS file, replacing the ~350 KB CDN script that previously generated CSS at runtime. |
| **Preload hero SVG** | HTML | `<link rel="preload">` for the hero logo SVG so the browser fetches it before CSS/JS evaluation. |
| **Mobile aurora throttling** | JS | Aurora RAF loop is throttled to ~30 fps on mobile (`AURORA_FRAME_BUDGET = 33ms`) to reduce GPU load while remaining visually smooth. |
| **Cache-Control headers** | `_headers` | Static assets (`/assets/css/*`, `/assets/js/*`, `/assets/images/*`) are served with `Cache-Control: public, max-age=31536000, immutable` for aggressive browser caching. |
| **WebP images** | Assets | Logo images use WebP format for smaller file sizes with equal quality. |
| **Async image decoding** | HTML | `decoding="async"` on logo images to prevent decode-time blocking. |
| **GPU-friendly animations** | CSS | Reveal system uses `opacity` and `translate3d` (compositor-only properties). Logo panel and brand collapse use `grid-template-rows`/`grid-template-columns` transitions instead of `max-height`/`width` to avoid layout thrashing. Mobile reveals skip `filter: blur()` to reduce GPU compositing cost. |
| **Passive event listeners** | JS | Scroll and resize listeners use `{ passive: true }` where possible. |
| **Manual scroll restoration** | JS | `history.scrollRestoration = "manual"` prevents the browser from restoring mid-page scroll positions on reload. |

---

## Accessibility

| Feature | Implementation |
|---|---|
| **Reduced motion** | Comprehensive `@media (prefers-reduced-motion: reduce)` block disables all transitions, animations, transforms, and filters across the entire site. Reveal elements are shown immediately. |
| **ARIA attributes** | `aria-expanded` on expandable cards and logo panel, `aria-current="page"` on active nav button, `aria-busy` on form during submission, `aria-invalid` and `aria-describedby` on invalid fields, `aria-hidden` on decorative elements. |
| **Live regions** | Snackbar uses `role="status"`, `aria-live="polite"`, `aria-atomic="true"`. Field errors use `role="status"`, `aria-live="polite"`. |
| **Focus management** | `focus-visible` styling (subtle outline), first invalid field auto-focused on validation, all cards receive `tabindex="0"` for keyboard focus. |
| **Keyboard navigation** | Program cards toggle with Enter/Space, Escape closes all. Nav buttons are `<button>` elements. |
| **Semantic HTML** | `<header>`, `<main>`, `<nav>`, `<section>`, `<footer>`, `<blockquote>`, `<figcaption>`, `<h1>`–`<h3>` hierarchy. |
| **Image accessibility** | `alt` text on all meaningful images, `aria-hidden="true"` and `aria-label` on decorative SVGs. |
| **Input accessibility** | `inputmode` attributes (`email`, `tel`), `autocomplete` hints, proper `<label>` associations, mobile-friendly 16px font size to prevent iOS zoom. |

---

## SEO & Social Sharing

- **Canonical URL**: `<link rel="canonical" href="https://karamahcollective.com/">`
- **Meta description**: Descriptive, keyword-rich summary
- **Open Graph**: Full `og:` tag set including `og:image` with dimensions (512×512 WebP)
- **Twitter Card**: `summary` type with title, description, and image
- **Semantic headings**: Proper `<h1>` → `<h2>` → `<h3>` hierarchy
- **Sitemap**: Referenced in `robots.txt` as `https://karamahcollective.com/sitemap.xml`
- **Referrer policy**: `strict-origin-when-cross-origin`

---

## Hosting & Deployment

The site is hosted on **Cloudflare Pages** as a static site:

1. The `deploy/` folder is connected to a Cloudflare Pages project
2. No build command is needed — files are served directly
3. Custom security headers are applied via the `_headers` file (Cloudflare Pages convention)
4. The domain `karamahcollective.com` is managed through Cloudflare DNS
5. Cloudflare provides automatic HTTPS, edge caching, and global CDN distribution

### Deploying Updates

1. If Tailwind classes were added/changed, run `npm run build:css` from the `build/` directory to regenerate `assets/css/tailwind.css`
2. Push changes to the `deploy/` folder
3. Cloudflare Pages automatically rebuilds and deploys

### Updating the Form Backend

1. Open the Google Sheet → Extensions → Apps Script
2. Paste the contents of `google_apps_script.js` into Code.gs
3. Deploy → Manage deployments → New version → Deploy

---

## Assets

| File | Format | Size | Purpose |
|---|---|---|---|
| `assets/images/kc_logo_big.inline.svg` | SVG | Vector | Hero Arabic calligraphy logo, inlined at runtime |
| `assets/images/kc_logo_small.webp` | WebP | 32×32 | Header and footer logo (light mode) |
| `assets/images/kc_logo_small_dark.webp` | WebP | 32×32 | Header and footer logo (dark mode) |
| `assets/images/kc_logo_small_icon.ico` | ICO | — | Browser favicon |
| `assets/images/kc_logo_small_site_preview.webp` | WebP | 512×512 | Open Graph / Twitter social preview image |

---

## Dark Mode

The site includes a full dark mode on all viewports with a floating toggle button:

| Feature | Detail |
|---|---|
| **Scope** | All `html.dark` overrides apply globally (no media-query gating). Dark mode works identically on desktop and mobile. |
| **Toggle** | Floating `position: fixed` button (bottom-right) on all viewports, frosted glass background (`backdrop-filter: blur`), dynamically repositions above scroll-to-top when both are visible |
| **Desktop persistence** | Uses `localStorage` (`kc-theme-desktop`) shared across tabs for same-session persistence. A tab counter (`kc-tab-count` in `localStorage`, `kc-session` sentinel in `sessionStorage`) detects new browser sessions — when all tabs are closed and the browser is reopened, the theme resets to light mode. |
| **Mobile persistence** | `localStorage` key `kc-theme` saves preference permanently; respects `prefers-color-scheme: dark` as the default when no saved preference exists |
| **Cross-tab sync** | A `storage` event listener syncs theme changes across all open desktop tabs in real time with a smooth transition |
| **FOUC prevention** | Inline `<script>` in `<head>` applies the correct theme class before first paint, using the appropriate storage mechanism for each context |
| **Logo swap** | Header/footer logos switch between `kc_logo_small.webp` (light) and `kc_logo_small_dark.webp` (dark) via `data-theme-logo` |
| **Hero logo** | SVG calligraphy shifts to brighter emerald/teal/sky palette with a soft drop-shadow glow for midnight background contrast |
| **Aurora** | Aurora backdrop opacity values are boosted in dark mode to remain prominent against the `#0f172a` background; `mix-blend-mode` switches from `darken` to `screen` |
| **Card hover/tap** | Cards and outline/unfilled buttons have subtle `border-color` hover (desktop) and `:active`/`:focus` (mobile) feedback using `!important` to override Tailwind utility specificity |
| **Floating buttons** | Both the theme toggle and scroll-to-top button use a frosted glass treatment — semi-transparent background with `backdrop-filter: blur(12px)` and a subtle shadow in both light and dark modes |
| **Scrollbar** | Dark mode re-colours the scrollbar track and thumb without changing dimensions, preventing a layout shift when toggling |
| **Resize guard** | Switching between mobile↔desktop applies the appropriate stored preference for that context and updates logos |
| **Stylesheet** | `assets/css/dark-mode.css` (~800 lines) — toggle styling + all `html.dark` overrides (backgrounds, text, borders, cards, card/button hover states, form inputs, checkbox, aurora, program card gradient, privacy overlay, scrollbar) |

---

## Privacy Policy

The privacy policy is displayed as an in-page overlay — users never leave the site:

| Feature | Detail |
|---|---|
| **Content file** | `privacy-policy.html` — standalone HTML fragment, editable independently of `index.html` |
| **Lazy loading** | Content is fetched via `fetch()` on first open and cached; subsequent opens are instant |
| **Triggers** | Clickable "privacy policy" link in the contact form disclaimer + "Privacy Policy" in the footer copyright line |
| **Overlay** | Full-screen backdrop with blur, centered panel (`max-width: 640px`, `max-height: 85vh`), slide-up entrance animation |
| **Accessibility** | Focus trap, Escape key close, `aria-modal`, `aria-hidden` toggled, focus restored on close |
| **Body scroll lock** | `overflow: hidden` on body while overlay is open |
| **Dark mode** | Full midnight styling matching the rest of the dark theme |
| **Sections** | 11 sections covering GDPR compliance: data collection, legal basis, usage, partner sharing, storage/security, retention, rights, children's privacy, changes, contact |

---

## Source Code & Version Control

This codebase is owned by **Karamah Collective** and hosted on GitHub under the **[Karamah-Collective](https://github.com/Karamah-Collective)** organization. The full source code for this website is maintained at **[github.com/Karamah-Collective/website](https://github.com/Karamah-Collective/website)**. All development, version history, and collaboration happen through this repository. Changes are tracked via Git, ensuring a complete audit trail of every update made to the codebase. If you want to review past changes, open issues, or contribute, head over to the GitHub repo.

---

## License

All rights reserved. © Karamah Collective.
