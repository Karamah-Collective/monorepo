# Manarah analytics

## Architecture

Manarah loads `src/analytics.js` only after a visitor chooses **Allow** in the
Cookies & analytics prompt. The public `POSTHOG_PROJECT_TOKEN` is obtained from
`/api/config`; it is a capture token, not a secret. Events go to the EU
ingestion host (`https://eu.i.posthog.com`). The private `POSTHOG_API_KEY` is
reserved for the authenticated Admin server integration and must never be
included in the browser bundle.

The current visitor choice is stored as `hf-analytics-consent-v1` in browser
storage. Declining has no impact on application functionality. Removing site
storage lets a visitor make a new choice.

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

Authenticated visitors are identified only with Firebase UID. Sign-out resets
PostHog identity. `person_profiles: "identified_only"` prevents anonymous
profile creation.

## Replay and privacy

Session replay is enabled only after consent. All inputs and forms are masked,
as are review/place-detail user-content containers. Do not weaken this masking
without a privacy review. Privacy Policy text in `index.html` documents the
choice, purpose, EU endpoint, and excluded data.

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
