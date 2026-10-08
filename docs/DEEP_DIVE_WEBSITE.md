# Deep dive: Karamah Website

The Website is the public organisational front door. The quality bar is fast delivery, readable hierarchy, semantic markup, accessible interaction, trustworthy publication, and clear contact/update flows.

## Frontend

The site is static HTML/CSS/JavaScript. `index.html` supplies structure and metadata; `assets/js/app.js` owns interaction, theme, scroll/reveal behavior, lazy content and forms; `site-content.js` adapts published content; CSS layers provide base, content, dark mode, and generated styling. This avoids shipping a client framework for a mostly published experience.

Preserve progressive enhancement, reduced-motion support, focus behavior, mobile navigation, semantic heading order, canonical/Open Graph metadata, robots policy, privacy overlay behavior, and performance safeguards such as deferred scripts, image formats, content visibility, and cache headers.

## Publication and backend

Website has separate public and private projections. `content.js` and `team.js` expose only active/published safe records. `admin.js` verifies Firebase identity and authorizes staff operations. `contact.js` validates public contact data and follows configured delivery/storage policy. `config.js` exposes only client-safe values.

Shared D1 stores Website people, content, subscribers, and audit records. `_website-data.js` is the D1 data layer. `_sheets.js` and `reference/google_apps_script.js` remain compatibility paths; they have independent deployments and must not become an accidental second source of truth for new work.

## Services, tests, deployment

Cloudflare Pages/Functions and D1 provide delivery/data; Firebase protects admin; Brevo or documented Apps Script flows may deliver messages. Provider failures must produce safe warnings, not raw errors or empty data.

Run `npm run build:website`, `npm run test:website`, and `npm run test:website:ui`. Manually verify public content/team, contact validation, privacy, theme, mobile navigation, metadata, and Admin editing. Production root is `Website`, output `dist`, and shared D1 bindings are configured through the Pages dashboard.
