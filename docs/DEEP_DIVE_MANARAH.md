# Deep dive: Manarah Maps

Manarah is the public discovery product. It is both a map and a community information system: the map helps a person find a place, while the APIs and moderation workflows keep that place understandable, current, and safe to share.

## Product shape

Manarah serves visitors on phones first, but its information architecture also supports desktop and installable/native surfaces. Basic discovery is public. Optional Firebase sign-in adds account synchronisation, saved places, profile context, and authenticated contribution flows. The product must remain useful when optional providers such as routing, analytics, or prayer data are unavailable.

The frontend is a vanilla ES-module application rather than React. That is a deliberate fit for an imperative map: MapLibre layers, sources, markers, geolocation watchers, route lines, device orientation, bottom sheets, and service-worker state are already event-driven.

## Startup and discovery

`index.html` provides the document shell, metadata, install links, map container, sheets, navigation controls, and security headers. `src/app.js` coordinates startup and lazy feature loading. Map initialisation creates MapLibre, applies the custom style, restores URL/hash state, and makes place/event data available. `sw.js` handles installable/offline behavior; cached assets are never a substitute for D1 truth.

`places.js` renders filters, markers, hours, tags, ratings, sponsor/boycott displays, and quick actions. `search.js` searches the local directory first and then configured geocoders. A geocoder result is a transient location, not automatically a trusted directory record.

## Directions, faith context, and accounts

`directions.js` normalizes Digitransit/Transitous transit and OSRM walking/cycling/driving routes into one itinerary model. `navigation.js` adds turn-by-turn state, speech, location watching, off-route detection, and arrival behavior. `prayer.js`, `qibla.js`, and Eid/event modules add location and faith context; provider or device failures must produce honest unavailable states.

Firebase provides identity; Maps Functions decide permissions. Account sync, profiles, wishlist, reviews, submissions, wishes, and media are separate flows. Community input is always untrusted: functions validate, authenticate, enforce ownership/moderation, and return safe errors.

## Backend and data

`api/places.js`, `place-media.js`, and `geo.js` serve public discovery. `reviews.js` and `review-image.js` manage community reviews/media. `submit.js` and `wishes.js` handle contributions. `account.js` handles private account state. `admin.js` is the staff/shared operational gateway. `app-settings.js`, `config.js`, events/Eid routes, and health routes complete the service surface.

Shared D1 owns mutable place/event/review/access data; `Maps/data` contains reference assets; private R2 stores media. Public responses are projections, not raw rows. Admin never writes D1 from the browser.

## Providers and operation

MapLibre/OpenFreeMap render the map; Nominatim supports geocoding; Digitransit and Transitous provide transit; OSRM provides road routes; Aladhan provides prayer times; Google Maps links support documented enrichment. These are enhancements around core directory data. Each needs bounded requests, safe fallback, and no secret disclosure.

Maps analytics use PostHog for product events and Cloudflare Analytics for traffic aggregates. UptimeRobot is called server-side for Admin health. Analytics failure must never block discovery or writes.

## Tests and release

Maps Playwright coverage includes DOM boot, map dimensions, controls, search, places, directions, prayer, tutorial, submissions, account, mobile, and regressions. Run `npm run build:maps` and focused/full suites. Production verification includes map load, `/api/health`, `/api/health/db`, search, place details, and touched authenticated flows. Capacitor Android/iOS releases are separate from Pages deployment.
