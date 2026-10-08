# Deep dive: Links

Links is a small public link hub: a fast, shareable page with managed destinations, brand presentation, ordering/visibility, and tracked redirects.

## Request and data flow

`index.html`, `app.js`, and `styles.css` render the page. `functions/api/hub.js` reads published settings/links from shared D1. `functions/go/[id].js` performs redirect behavior and `api/click.js` records click activity. Public responses contain only fields needed to render active links; drafts, audit data, and access configuration stay private.

Admin is the editing surface. The owner API validates URLs, ordering, visibility, metadata, style, revisions, and public defaults before writing. Migrations `0011` through `0015` evolve the schema. Local example seeding must never run against Production.

Redirect tracking must not block navigation, and destination policy must prevent unsafe open redirects. Run `npm run build:links` and `npm run test:links`; verify public mobile layout, ordering, inactive/featured states, redirect, click path, and Admin editing after deployment.
