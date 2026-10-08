# Manarah analytics

## Architecture

Manarah initializes `src/analytics.js` in PostHog’s cookieless always-on mode.
The public `POSTHOG_PROJECT_TOKEN` is obtained from `/api/config`; it is a
capture token, not a secret. Events go to the EU ingestion host
(`https://eu.i.posthog.com`). The private `POSTHOG_API_KEY` is reserved for
the authenticated Admin server integration and must never be included in the
browser bundle.

Cookieless server hash mode must be enabled in PostHog Project settings before
deployment. The SDK uses `cookieless_mode: "always"`, `person_profiles:
"never"`, no autocapture, no pageview capture, and session recording is
explicitly disabled. It must never write analytics cookies or browser storage,
call `identify()`, or call `reset()`.

## Environment

Set these in Cloudflare Pages and, for local Pages development, `Maps/.dev.vars`:

```
POSTHOG_PROJECT_TOKEN=phc_...
POSTHOG_PROJECT_ID=...
POSTHOG_INGEST_HOST=https://eu.i.posthog.com
POSTHOG_API_HOST=https://eu.posthog.com
POSTHOG_API_KEY=...
```

`POSTHOG_API_KEY` is server-only. Configure it as a Pages secret in production.

## Events and properties

Events are intentionally limited to map opening, location permission outcome,
search metadata, search-result opens, place views, directions, website/phone
clicks, saves, shares, submission lifecycle, reports, and satellite/hybrid
selection. Event properties are allowlisted to `place_id`, `category`, `source`,
`query_length`, `result_count`, `filter_category`, and `kind`.

Never add exact coordinates, raw search text, names, email addresses, phone
numbers, form/review contents, Firebase details, or authentication tokens.

Do not identify authenticated visitors. Cookieless analytics intentionally
does not create user profiles or link a person across browsing days.

## Privacy

Session replay is disabled. Privacy Policy text in `index.html` documents the
cookieless processing, EU endpoint, purpose, and excluded data.

## Future Admin reporting

Admin reporting must query PostHog only from the Maps Pages Function using
`POSTHOG_API_KEY`, through the existing authenticated `/api/admin` proxy. Do
not call PostHog's private API from the Admin browser. Cache query responses for
about five minutes and persist only daily aggregates in D1 for long-term trend
charts. Store aggregate measures and dimensions, never distinct IDs or event
payloads.

When adding an event, call `track()` from `src/analytics.js`, add only
allowlisted properties, update this file and the Privacy Policy, then add the
corresponding Admin metric only if it answers an operational question.
