# Manarah verified visit timeline

## 1. Purpose

Manarah already allows users to manually mark a place as visited. That behavior must remain unchanged.

The new feature adds a separate GPS-confirmed timeline. A user can add a visit only after the device confirms that the user is physically near the selected place.

The timeline belongs to the authenticated user’s Profile and records:

- The place visited
- The date of the confirmed visit
- The time of the confirmed visit
- A clear indication that the event was GPS-confirmed
- Repeated visits as separate timeline events

The feature is private by default. No public profile sharing is included in the first implementation.

This document is the implementation handoff. It describes the product behavior, data boundary, API contract, frontend architecture, migration work, tests, release checks, and known limitations. An implementation agent should use it as the source of truth and should preserve the existing Maps behavior unless this document explicitly says otherwise.

## 2. Existing functionality that must remain unchanged

The current manual visited-place system already supports:

- A “Mark as visited” control in the place sheet
- A “Visited” state after the mark is added
- Local storage for signed-out users
- Cloud synchronization for signed-in users
- A “Visited” section in Saved Places
- Existing profile statistics
- Existing Explorer badge behavior

The manual mark is an unverified personal signal. It does not contain a trusted date or time.

The new timeline must not:

- Replace the manual visited control
- Remove existing manually visited places
- Convert old manual marks into GPS-confirmed visits
- Backfill old marks with fabricated dates
- Change the current meaning of the Explorer badge
- Require GPS for the existing manual mark

The place sheet should present the two concepts separately:

- “Mark as visited”: existing manual mark
- “Add to timeline”: new GPS-confirmed event

The UI copy must make the distinction understandable without requiring technical knowledge. The manual control should remain usable even when the user denies location permission, has no GPS signal, is signed out, or is offline according to the existing manual-mark behavior.

Do not merge timeline events into the existing manual visited ID set. They are different data types with different trust meanings.

## 3. Locked product decisions

### 3.1 Visit creation

The first version uses manual, one-time verification.

The app does not continuously track the user and does not create visits automatically in the background.

The user must explicitly tap “Add to timeline”. One successful tap creates one event.

The app must not start a location watcher for this feature. It should request one high-accuracy location fix and then stop.

### 3.2 GPS radius

The default verification radius is 150 metres.

A visit is eligible only when:

- The GPS position contains valid finite latitude and longitude values
- The reported GPS accuracy is a valid finite number no worse than 150 metres
- The measured distance between the device and the selected place is no more than 150 metres

The radius is fixed in v1. There is no settings control for changing it.

The distance calculation must reuse the existing `haversineDistance()` helper in `Maps/src/utils.js`. Do not add a second distance implementation.

Use these shared constants in the timeline module:

```js
const TIMELINE_RADIUS_METRES = 150;
const TIMELINE_MAX_ACCURACY_METRES = 150;
```

Keep the two values together and do not duplicate the literal `150` across place-sheet code, profile code, tests, and API code.

### 3.3 GPS privacy

The raw device GPS coordinates stay on the device.

The browser or native client must not send the user’s current latitude, longitude, or GPS accuracy to the server.

After the local check succeeds, the client sends only the selected canonical place ID and the authenticated user token as part of the account request.

The database stores the resulting visit event, not the raw GPS fix.

The server response may return the canonical latitude and longitude of the selected place for the Profile mini-map. Those are dataset coordinates for a public place, not the user’s device coordinates.

### 3.4 Authentication

The timeline is available only to signed-in users.

If a signed-out user taps “Add to timeline”:

1. Do not request GPS first.
2. Explain that signing in is required.
3. Open or direct the user to the existing sign-in flow.
4. Do not create a local timeline event while signed out.

This avoids collecting location for an action that cannot be saved to the user’s account.

### 3.5 Repeat visits

Every successful GPS confirmation creates a separate event.

If the user returns to the same place on another day, the timeline contains another event.

If the user intentionally taps the action twice, two separate events may be created. The button must be disabled while the current request is pending to prevent accidental duplicate submissions from double-clicks.

There is no cooldown between legitimate visits in v1. After a successful request finishes, the user may intentionally add another event. The UI may change the action label to “Add another visit” to make that behavior clear.

### 3.6 Timeline visual

The Profile contains a compact launcher for a separate private timeline window. The timeline window contains three representations of the same event data:

1. A chronological vertical timeline
2. A calendar-style activity view
3. An embedded mini-map showing visited places

The vertical timeline is the primary representation. The calendar and map are supporting visualizations.

The launcher keeps the merged Profile sheet compact. Opening the timeline window is the only point at which the calendar, event list, and mini-map are rendered.

Do not add a charting dependency. The calendar should be implemented with semantic HTML and existing CSS/layout patterns.

### 3.7 Map behavior

The Profile uses an embedded mini-map.

The mini-map is created lazily when timeline data is first rendered and the Profile pane is visible. It reuses the already-installed MapLibre dependency and the existing Manarah map style.

The map displays canonical coordinates belonging to places in the Manarah dataset. It never displays the user’s exact GPS coordinate.

Repeated visits to one place produce one map marker, while the timeline still shows every event.

### 3.8 Sharing

The timeline is private in v1.

The database structure should not expose a public endpoint or public profile route.

Optional sharing can be added later without changing the meaning of the private event records. Do not add public visibility flags, social metadata, or share links now.

## 4. Important trust limitation

Because GPS coordinates never leave the device, the server cannot independently prove that the browser or native client actually received a genuine GPS fix.

The first version is therefore a client-side, best-effort GPS trust signal. A technically determined user could bypass the browser logic and call the authenticated endpoint directly.

The implementation must not claim cryptographic or anti-spoof proof. Document this limitation in developer notes and use honest product language.

Use wording such as:

- “GPS-confirmed visit”
- “Confirmed from your device location”
- “Added after a location check”

Avoid wording such as:

- “Verified beyond doubt”
- “Tamper-proof”
- “Impossible to fake”

Stronger anti-spoofing would require a later native-device attestation design and is outside this feature.

## 5. User experience

### 5.1 Place sheet

Add a new action to the existing place sheet.

The existing manual visited chip remains where it is and keeps its current behavior.

Add a visually distinct but related action labelled:

- Default: “Add to timeline”
- Pending: “Checking location…”
- Success/repeat-event state: “Add another visit”

The action must be a quiet secondary control, not a large explanatory card. Do not display a “GPS-confirmed timeline” heading or a visible “Requires GPS…” helper in the place sheet. The button’s accessible name remains simply “Add to timeline”.

When the browser already reports granted location permission, the place sheet may perform a silent one-shot proximity check. If that check confirms that the place is outside the 150-metre radius, remove the timeline action from the sheet entirely. Do not request permission merely because a place was opened.

When location is unavailable, denied, or still awaiting permission, keep the compact action available. If the user taps it while GPS is not active, show a short toast such as “GPS is not activated”. The action must remain retryable.

The existing manual action should continue to use its current labels:

- “Mark as visited”
- “Visited”

The two controls must not look like the same operation. The manual mark can remain a compact visited chip, while the timeline action is a quiet text/pill action with no large surrounding card.

The place sheet must not display the timeline action as already complete merely because the place is manually marked visited. Manual state and timeline event state are independent.

### 5.2 Successful flow

When the user taps “Add to timeline”:

1. Confirm that the user is signed in.
2. If no authenticated session is available, show the sign-in prompt and stop before requesting GPS.
3. Disable the action and make the pending state clear to assistive technology.
4. Request one high-accuracy location fix through the existing location helper.
5. Show a concise loading state.
6. Check the GPS accuracy locally.
7. Calculate distance to the selected place locally.
8. If eligible, call the account endpoint with the place ID only.
9. On success, show the confirmed state and a success toast.
10. Dispatch a timeline-updated event.
11. Re-enable the action so the user can intentionally add another visit later.

The user’s latitude, longitude, and GPS accuracy must never appear in the request payload, query string, analytics payload, or database write.

### 5.3 Outside-radius state

If the GPS fix is valid but outside the radius:

- Do not call the account API.
- Keep the timeline unchanged.
- Tell the user approximately how far away they are when that is safe and useful.
- Explain that they need to be within 150 metres.
- Re-enable the action.

Example:

> You’re about 420 m away. Move closer and try again.

The distance shown to the user is calculated locally and is not sent to the server.

Use a rounded, human-readable distance rather than exposing unnecessary precision. The exact display rounding can follow existing location UI conventions.

### 5.4 Low-accuracy state

If the device reports accuracy worse than 150 metres:

- Do not call the account API.
- Explain that the current fix is not precise enough.
- Suggest trying again outdoors or with location enabled.
- Re-enable the action.

Example:

> Your location is not precise enough yet. Try again in a moment.

If a browser returns missing or non-finite accuracy, treat the fix as invalid rather than assuming it is accurate.

### 5.5 Location denied state

If the user denies location permission:

- Do not call the account API.
- Explain that location permission is required for this action.
- Use the existing browser/native permission messaging conventions.
- Give the correct settings guidance for web and Capacitor environments.

Examples:

- Browser: “Location permission is off. Enable it in browser settings.”
- Native app: “Location permission is off. Enable it in phone settings.”

Do not repeatedly trigger permission prompts in a loop. Return the control to a retryable state.

### 5.6 GPS unavailable or timeout

If the device cannot obtain a fix:

- Do not call the account API.
- Keep the existing place state unchanged.
- Show a retryable error.
- Do not leave the button permanently disabled.

Example:

> Couldn’t get your location. Try again in a moment.

Handle browser geolocation unsupported, position unavailable, timeout, and native permission/location failures through the same user-visible retry path where the existing conventions allow it.

### 5.7 Authentication failure

If the account token is missing or expired:

- Do not create the event.
- Show the existing sign-in or session-expired behavior.
- Do not expose raw server errors.
- Re-enable the button.

An account request that returns an authentication failure must not be interpreted as a successful timeline event.

### 5.8 Server failure

If the account request fails after the local GPS check:

- Do not show the visit as saved.
- Show an error toast or inline error according to existing Maps patterns.
- Keep the button available for retry.
- Do not silently create a local-only event.

Example:

> Couldn’t add this visit. Please try again.

The client should avoid logging GPS values while diagnosing errors. It may log a safe error category in development if that follows existing project conventions.

## 6. Profile experience

Add a new Profile section titled:

> Your timeline

The section should appear near the top of the Profile, after the existing activity summary and before the longer contribution lists.

The Profile remains inside the existing merged Menu/Profile sheet. Its timeline section is a compact preview/launcher. The full timeline opens in a separate private overlay window so the Profile does not become a long dashboard.

Timeline data should be fetched only when Profile is opened or when the timeline section otherwise becomes visible. Do not add full timeline data to sign-in restoration or the regular saved-place sync request.

### 6.1 Summary values

Show compact summary values derived from the same timeline data:

- Total verified visits
- Unique places
- Active months

These values must not be confused with the existing manual “Visited” count.

Use clear labels such as:

- “GPS visits”
- “Places”
- “Active months”

Do not reuse the existing manual visited count without distinguishing it. Keep existing manual stats and Explorer badge calculations unchanged in v1.

Definitions:

- Total verified visits: number of event rows returned for the account.
- Unique places: number of distinct canonical `placeId` values in the returned events.
- Active months: number of distinct calendar months represented by `visitedAt`, interpreted in the user’s local display timezone.

### 6.2 Empty state

When the user has no GPS-confirmed visits, show an intentional empty state inside the timeline window.

Recommended copy:

> Start your visit story.

Supporting copy:

> Places you confirm will collect here as a private record of the days you were there.

Include a clear next action that returns the user to the map or closes the Profile.

Do not show a blank chart or an empty map with no explanation.

The empty state should still reserve an appropriate, compact section height and should not create a misleading “0” chart with no context.

### 6.3 Loading state

The section needs a layout-preserving loading state.

Use skeleton rows or stable placeholders inside the timeline window for:

- Summary values
- Calendar
- Timeline list
- Mini-map area

Avoid a single generic “Loading…” line that causes the Profile sheet height to jump significantly. Loading indicators must not imply that the user has events before the API response arrives.

### 6.4 Error state

If timeline loading fails:

- Keep the Profile usable.
- Show an inline error within the timeline section.
- Provide a retry action.
- Leave unrelated profile sections rendered.

Example:

> Your timeline couldn’t be loaded.

Action:

> Try again

The retry should use the current account identity and must not render a previous account’s response if the account changes before the request completes.

### 6.5 Vertical timeline

The main timeline is chronological, newest first.

Group events by calendar month. Month grouping should be derived from the localized display date while the event ordering remains based on the server ISO timestamp.

Each event displays:

- Place name
- Localized date
- Localized time
- GPS-confirmed status
- Optional place category or address when available

Recommended event structure:

- Month heading
- Vertical line or compact timeline rail
- Event marker using the existing accent color
- Event content aligned consistently
- Quiet secondary metadata

Avoid heavy cards around every event. Prefer a structured list with a timeline rail, clear spacing, and dividers.

A timeline item should be keyboard accessible if it opens the related place.

Clicking an event can open the corresponding place sheet after closing or transitioning away from Profile. If the place is no longer available, the event should remain readable and the action should fail gracefully without deleting the historical event.

Dates and times should use the browser/device locale and timezone for display. The database and API should use server-generated ISO timestamps in a consistent format.

### 6.6 Calendar activity view

Add a compact GitHub-style activity visualization beginning on 1 October 2026, the launch date of the feature, and ending on today. The week columns are laid out horizontally inside a bounded scroll container, which opens scrolled to the newest day. Horizontal scrolling is intentional for the activity grid on narrow phones; it must never create page-level horizontal overflow.

Each day with one or more verified visits receives an intensity level based on the number of events on that day.

The calendar must include:

- Month labels
- Accessible text alternatives
- A legend explaining visit intensity
- A non-color distinction for visited days, such as a count label or accessible title
- A stable layout on narrow phones with an obvious local horizontal scroll region

The calendar must not rely on color alone. Each day should have an accessible name containing the date and visit count, for example “17 October 2026, 2 GPS visits”.

The calendar should be generated without a new charting dependency. If the user has no events in the visible range, the empty visual should still explain the date range.

The activity grid may be wider than 360 px and scroll horizontally within its own container. Keep the cell size readable, use abbreviated weekday labels, and preserve readable focus states. The Profile window itself must not horizontally overflow.

### 6.7 Embedded mini-map

Add a mini-map panel below or beside the calendar depending on viewport width.

The mini-map should:

- Use the existing MapLibre dependency
- Use the existing Manarah style, including `HSL_STYLE` where that is the current style export
- Render only after the Profile pane is visible
- Call `resize()` after the sheet layout settles
- Fit bounds to the user’s unique visited places
- Display one marker per unique place
- Avoid storing or rendering raw user GPS coordinates
- Support dark mode consistently with the existing map
- Remain usable at 360 px wide

If only one place exists, use a sensible zoom level instead of attempting to fit a zero-area bounds object.

If a timeline row has no current place coordinates, keep the event in the list and omit it from the mini-map.

Destroy or safely reset the mini-map on sign-out to prevent cross-account data leakage. Remove markers and clear the map instance or source according to existing MapLibre lifecycle patterns.

The mini-map must have an accessible label such as:

> Map of places in your verified visit timeline.

The map is supplementary. A user must be able to understand the timeline from the list and calendar without operating the map.

## 7. Data model

Add a new table to the Manarah D1 schema.

Recommended table:

```sql
CREATE TABLE verified_visits (
  id          TEXT PRIMARY KEY,
  email_hash  TEXT NOT NULL,
  place_id    TEXT NOT NULL,
  place_name  TEXT NOT NULL DEFAULT '',
  visited_at  TEXT NOT NULL
);

CREATE INDEX idx_verified_visits_account_time
  ON verified_visits(email_hash, visited_at DESC);
```

Do not add a foreign key unless the existing D1 schema and migration conventions support it consistently. The account endpoint must still validate the place ID against the canonical `places` table before insertion.

### 7.1 Field meanings

`id`

- Opaque event identifier
- Generated server-side
- Never expose sequential database IDs
- Must be unique enough for concurrent requests

`email_hash`

- Same privacy-preserving account identifier already used by `saved_places`, `reviews`, and `account_meta`
- Never store the user’s plaintext email
- Always derived from the verified Firebase token on the server

`place_id`

- Canonical Manarah place ID
- Validated against the `places` table before inserting
- Received from the client only as a selection reference, never as an account owner identifier

`place_name`

- Snapshot of the place name at the time of the event
- Allows historical events to remain readable if the live place name changes or the place is later unavailable
- Must come from the server’s canonical place row, not from a client-supplied place name

`visited_at`

- Server-generated ISO timestamp
- Represents the time the API accepted the verified event
- Do not accept a user-supplied date or time for the event record

The table must not contain:

- User latitude
- User longitude
- GPS accuracy
- Raw device location
- Browser user agent
- IP address
- Public visibility flags in v1
- Social sharing metadata in v1

Canonical place coordinates may be returned by the API through a join with `places` for the Profile mini-map. They are public place coordinates, not user GPS coordinates.

## 8. API contract

Continue using the existing `/api/account` endpoint.

All new actions require a valid Firebase ID token. Follow the existing account endpoint’s request parsing, token verification, error shape, CORS, and D1 handling conventions.

### 8.1 Add visit

Request:

```json
{
  "action": "add-verified-visit",
  "idToken": "firebase-id-token",
  "placeId": "place-id"
}
```

The request must not contain:

- `lat`
- `lng`
- `latitude`
- `longitude`
- `accuracy`
- `visitedAt`
- Any client-provided account identifier

Server behavior:

1. Validate the request body size using the existing account endpoint limits.
2. Parse and validate the action.
3. Validate the Firebase token.
4. Derive the account email hash using the existing helper.
5. Validate the place ID format.
6. Load the place from D1.
7. Reject missing, disabled, or invalid places using the project’s existing place validity conventions.
8. Generate an opaque event ID server-side.
9. Generate the current server timestamp.
10. Snapshot the canonical place name.
11. Insert the event for the derived account hash.
12. Return the inserted event with canonical place coordinates when available.

Response:

```json
{
  "success": true,
  "visit": {
    "id": "opaque-event-id",
    "placeId": "place-id",
    "placeName": "Example Place",
    "visitedAt": "2026-10-17T12:34:56.000Z",
    "placeLat": 60.1699,
    "placeLng": 24.9384
  }
}
```

The response may include canonical place coordinates for the Profile map, but never the user’s GPS coordinates or GPS accuracy.

The server should not attempt to infer a timeline event from the existing manual visited state. A verified event is created only by the explicit new action.

### 8.2 Get timeline

Request:

```json
{
  "action": "get-visit-timeline",
  "idToken": "firebase-id-token"
}
```

Response:

```json
{
  "success": true,
  "visits": [
    {
      "id": "opaque-event-id",
      "placeId": "place-id",
      "placeName": "Example Place",
      "visitedAt": "2026-10-17T12:34:56.000Z",
      "placeLat": 60.1699,
      "placeLng": 24.9384
    }
  ]
}
```

Sort by `visited_at DESC`.

The first implementation may return the full timeline. Add pagination only if real usage demonstrates that timelines become large enough to affect performance. If pagination is later added, preserve the same account scoping and ordering guarantees.

Do not combine the full timeline into `sync-saved`, because that request runs during sign-in and session restoration. Timeline data should load only when Profile needs it.

If a current place lookup has no usable canonical coordinates, return the event with its stored name and null/omitted map coordinates according to the project’s established JSON convention. The frontend must retain that event in the list.

### 8.3 Erase data

Extend the existing `erase-data` action to delete rows from `verified_visits`.

The delete must remain part of the existing atomic account erase batch. Do not create a separate non-atomic cleanup request for timeline events.

The deletion must be scoped to the verified account hash. Existing saved places, reviews, submissions, and other account-owned data must continue to be handled exactly as before.

### 8.4 Export data

Extend the existing Profile export payload with:

```json
{
  "verifiedVisits": []
}
```

Use the same already-fetched timeline snapshot used to render Profile. Do not make a second request solely for export if the existing export flow can reuse the current Profile state.

The export should include event IDs, place IDs, place names, and server timestamps. It should not include raw device GPS coordinates because they are never stored.

## 9. Frontend architecture

### 9.1 New module

Add:

`Maps/src/timeline.js`

Responsibilities:

- Timeline constants
- Radius and accuracy thresholds
- GPS eligibility calculation
- Authenticated add request
- Timeline fetch request
- Timeline event dispatch
- Date grouping and summary helpers
- Calendar aggregation helpers
- Timeline data normalization

The module should remain small and focused. Do not turn it into a general location service or a second account store.

Do not put all timeline rendering into `places.js`.

Do not put GPS logic into `profile.js`.

The module should expose pure helpers for the branches that are easiest to regress, especially GPS eligibility, event normalization, summary calculation, month grouping, and calendar aggregation.

### 9.2 Existing modules to update

`Maps/src/places.js`

- Add the “Add to timeline” control
- Pass the current canonical place into the timeline action
- Render pending, success, and retry states
- Keep existing manual visited behavior untouched
- Do not request GPS for the manual visited control
- Do not let the timeline action mutate the manual visited ID set

`Maps/src/profile.js`

- Fetch timeline data when Profile opens
- Guard responses by the active authenticated account identity
- Render summary values
- Render the vertical timeline
- Render the calendar activity view
- Initialize and update the embedded mini-map
- Refresh timeline data after a successful event
- Include visits in export
- Reset timeline state when account changes

`Maps/src/events.js`

Add a named event:

`TIMELINE_UPDATED`

Recommended detail:

```js
{
  visit: {
    id,
    placeId,
    placeName,
    visitedAt,
    placeLat,
    placeLng
  }
}
```

The existing `VISITED_TOGGLED` event remains the manual visited event and must not be repurposed.

`Maps/src/utils.js`

Reuse existing helpers where possible:

- `requestLocation()`
- `haversineDistance()`
- `esc()`
- `escA()`
- `showToast()`
- `isReduceMotionActive()`

Do not create duplicate geolocation or distance utilities.

`Maps/src/account-sync.js`

No timeline data should be merged into the existing saved-place cloud state.

Only update this module if the timeline event needs account-change cleanup or a shared refresh event. Preserve the current sign-in restoration behavior and avoid loading the full timeline during session restoration.

`Maps/index.html`

- Add the Profile timeline markup
- Add the mini-map container
- Add accessible labels and live-region hooks needed by the timeline action and status states
- Update privacy copy to explain the device-only location check and server-stored event data accurately
- Preserve the existing Profile structure and accessibility behavior

`Maps/src/styles/design-tokens.css`

Add only genuinely new reusable visual tokens or component templates. Prefer existing surface, border, accent, spacing, type, and focus tokens.

`Maps/src/styles/styles.css`

Add timeline-specific layout and responsive rules. Include dark mode, reduced-motion, narrow phone, tablet, and desktop behavior without introducing a separate visual language.

`Maps/sw.js`

Update the service-worker version according to the existing Maps deployment convention.

Update matching asset query strings in `Maps/index.html` if required by the current release process.

## 10. GPS eligibility algorithm

The client should use the existing `requestLocation()` helper.

Recommended logic:

1. Confirm authentication before doing any location work.
2. Request a one-shot high-accuracy fix.
3. Read `latitude`, `longitude`, and `accuracy` from the returned position.
4. Validate that all values are finite numbers.
5. Reject when accuracy is greater than 150 metres.
6. Calculate distance from the device to the selected place using `haversineDistance()`.
7. Accept only when distance is less than or equal to 150 metres.
8. Never send the coordinate or accuracy to the server.
9. Send only the canonical place ID after the local eligibility check succeeds.

Keep the threshold constants together:

```js
const TIMELINE_RADIUS_METRES = 150;
const TIMELINE_MAX_ACCURACY_METRES = 150;
```

The radius must not be duplicated in several modules.

The result of the pure eligibility helper should distinguish:

- `eligible`
- `too-far`
- `accuracy-too-low`
- `invalid-location`

The exact internal shape can follow existing project conventions, but it must carry enough local information for the UI to explain the failure without making another network request. For an outside-radius result, a local distance may be included for display. That local distance must never be sent to the account endpoint.

This separation makes the UI messages testable and prevents the place-sheet event handler from becoming a large conditional block.

### 10.1 Local GPS simulation

The existing development GPS simulator must exercise the same location state as the timeline check so the feature can be tested without physically moving.

- `Shift+G` or `?sim` activates the simulator.
- Shift-clicking the map sets the simulated position; ordinary clicks remain available for opening places.
- Existing route playback also updates the simulated position as it moves.
- Simulated fixes are tagged internally as `source: "sim"` so timeline verification can use them without mistaking a stale real-device location for test data.
- Local development exposes `window.__manarahGpsSim.setLocation(lat, lng, accuracy)` for deterministic checks while a place sheet is open.
- `window.__manarahGpsSim.getLocation()` reads the current simulated fix, and `.deactivate()` clears it.

The simulator remains development-only. It must never change the production API contract or cause raw coordinates to be sent to the server.

## 11. Privacy and security

### 11.1 Stored data

The database stores:

- Account hash
- Canonical place ID
- Canonical place-name snapshot
- Server timestamp

The database does not store:

- User GPS coordinates
- GPS accuracy
- Location history traces
- Continuous tracking data
- Exact device position at the time of verification

### 11.2 Network data

The timeline add request sends:

- Firebase ID token
- Place ID
- Action name

It must not send raw location values. Automated tests should inspect the outgoing request body and assert that latitude, longitude, accuracy, and user-supplied timestamp fields are absent.

The client should also avoid putting location values into query parameters, custom headers, analytics events, error reports, or debug logs.

### 11.3 Account isolation

Every read and write must be scoped to the email hash derived from the verified Firebase token.

The client must never provide the account hash.

The server must not accept an account ID, email, UID, or hash from the request body as the data owner.

### 11.4 Cross-account protection

When the Firebase account changes:

- Clear the in-memory timeline cache
- Clear the mini-map markers
- Do not render the previous account’s events
- Do not allow an in-flight request for the previous account to update the new Profile

Follow the existing account-sync generation and identity-scoping patterns. A request that started under Account A must be ignored if Account B is active when it resolves.

### 11.5 Erasure

The existing “Erase my data” action must remove:

- Verified timeline events
- Existing saved places
- Reviews
- Submissions
- Other existing account-owned records

The erase operation must remain atomic using the existing D1 batch behavior.

## 12. Visual and accessibility requirements

Follow the existing Maps design system.

The timeline UI must use:

- Existing Plus Jakarta Sans typography
- Existing accent and semantic status tokens
- Existing surface, border, radius, and spacing tokens
- Existing Profile sheet structure
- Existing button and focus styles
- Existing dark-mode overrides

Avoid:

- Heavy dashboard cards
- Decorative gradients
- Glass effects
- Bright unstructured color
- A new charting library
- A separate visual language inside Profile
- Page-level horizontal overflow (the activity grid’s bounded local scroller is intentional)
- Hover-only interactions

Every interactive control needs:

- A visible focus state
- Keyboard operation
- A touch target of approximately 40–44 px
- A disabled state
- A pending state where applicable
- An accessible name

The calendar must not rely on color alone. It needs accessible names, text alternatives, or count indicators that communicate the number of visits.

The mini-map must have an accessible label such as:

> Map of places in your verified visit timeline.

The timeline should remain readable at:

- 360 px phone width
- 390 px phone width
- Tablet width
- Desktop width
- Dark mode
- Reduced-motion mode

If the existing Profile sheet has motion transitions, respect `isReduceMotionActive()` and avoid introducing new motion that ignores reduced-motion preferences.

## 13. Database and migration work

Update the fresh-install schema:

`Maps/schema.sql`

Add the `verified_visits` table and index using the data model in Section 7.

Add a forward migration:

`Maps/migrations/0054_verified_visit_timeline.sql`

The migration must be safe for existing installations and must not modify or delete existing saved-place data.

The migration should create:

- `verified_visits`
- `idx_verified_visits_account_time`

Confirm that the production deployment process applies the new migration to the correct Manarah D1 database.

Do not place the table in:

- `project-migrations`
- Admin database migrations
- Forms database migrations

The timeline is part of the Manarah Maps account data boundary.

Before release, check both fresh-install and upgrade behavior. A fresh schema must contain the table, while an existing installation must receive it through the forward migration without touching existing account rows.

## 14. Testing plan

Add a focused test file:

`Maps/tests/15-verified-visit-timeline.spec.js`

Reuse the existing Maps test helpers and Firebase mock setup. Tests should assert behavior through stable accessible labels and API payload inspection rather than fragile implementation details.

### 14.1 Existing behavior regression

- Existing manual “Mark as visited” control is still visible.
- Existing manual control still toggles independently.
- Existing visited places still appear in Saved Places.
- Existing signed-out local visited behavior remains unchanged.
- Existing signed-in visited synchronization remains unchanged.
- Existing Explorer badge behavior remains unchanged.
- Manual marking does not create a timeline event.
- Timeline failure does not undo a manual visited mark.

### 14.2 Authentication

- Signed-out user cannot create a timeline event.
- Signed-out user is prompted to sign in.
- No GPS request occurs before authentication is available.
- Signed-in user receives an authenticated account request.
- Expired or missing token produces a safe failure state.
- The sign-in flow does not accidentally create a timeline event after returning unless the user explicitly taps the action again.

### 14.3 GPS success

Mock the browser geolocation API and the account request.

Test:

- Fix inside 150 m
- Accuracy under 150 m
- Account endpoint called once
- Request includes only action, token, and place ID
- Request contains no latitude
- Request contains no longitude
- Request contains no accuracy
- Request contains no client timestamp
- Timeline success state appears
- Success toast appears
- Profile timeline refresh event is dispatched
- Active local GPS simulation can satisfy the same successful timeline path without calling browser geolocation
- The button returns to an intentional “Add another visit” state

### 14.4 GPS rejection

Test:

- Fix outside 150 m
- Fix exactly at 150 m
- Accuracy exactly at 150 m
- Accuracy above 150 m
- Invalid coordinate values
- Missing accuracy
- Permission denied
- Position unavailable
- Timeout
- Browser without geolocation
- Native permission failure path where testable

For each rejection case:

- Account endpoint is not called
- No timeline item is added
- Button returns to an actionable state
- User receives a meaningful message
- A simulated position outside the radius is rejected without an account request
- User GPS values do not appear in any account payload

The exact-threshold tests prevent accidental use of `<` instead of `<=` and prevent a valid edge case from being rejected unexpectedly.

### 14.5 Repeat visits

Mock two successful confirmations for the same place.

Assert:

- Two timeline events are returned
- Both remain visible
- They have separate event IDs
- They have separate server timestamps
- The map contains one unique place marker
- The timeline does not collapse the repeated events into one row

### 14.6 Profile rendering

Mock timeline API data containing:

- Several months
- Multiple visits to one place
- Multiple unique places
- A place without current coordinates
- Same-day visits
- Visits with different times
- Events that occur near a local month boundary

Assert:

- Summary totals are correct
- Unique-place count is correct
- Active-month count is correct
- Timeline is grouped by month
- Events are sorted newest first
- Same-day counts are represented in the calendar
- Calendar day labels contain accessible dates and counts
- Mini-map renders unique places only
- Events without coordinates remain in the timeline
- Manual visited counts and badges are unchanged

### 14.7 Loading and failure states

Test:

- Timeline skeleton appears before data resolves
- Empty state appears for zero events
- Inline retry appears after a failed fetch
- Retry succeeds after a later successful response
- Profile remains usable if timeline loading fails
- Mini-map is not initialized before Profile is visible
- Mini-map resizes after the Profile sheet settles

### 14.8 Account isolation

Test:

- Account A timeline is rendered
- Account A signs out
- Account A timeline rows and markers are removed
- Account B signs in
- Account A events are not visible in the active Profile
- Account B events are loaded independently
- An old in-flight request cannot overwrite Account B’s Profile
- Timeline cache is cleared during account change

### 14.9 Export and erase

Test:

- Profile export includes `verifiedVisits`
- Export contains event metadata but no raw device coordinates
- Erase request includes the existing account erase action
- Timeline data disappears after erase/sign-out
- No stale timeline remains in the mini-map
- Existing saved-place and other erase behavior remains intact

### 14.10 Build and responsive checks

Run:

- Maps production build
- Focused desktop Playwright test
- Focused mobile Playwright test
- Existing Places tests
- Existing auth/account tests
- Existing Profile-related tests
- Full Maps test suite if the focused tests pass

Inspect:

- 360 px viewport
- 390 px viewport
- Desktop Profile
- Dark mode
- Reduced motion
- Keyboard navigation
- Mini-map resize after opening the Profile pane
- Permission-denied and retry behavior in a real browser

## 15. Implementation order

Implement in this order so each layer has a stable contract before the next layer depends on it.

### Phase 1: Database

- Add `verified_visits` to `Maps/schema.sql`.
- Add migration `0054_verified_visit_timeline.sql`.
- Confirm migration numbering and target database.
- Check fresh local database initialization.
- Check existing database migration behavior.
- Confirm no existing saved-place rows are altered.

### Phase 2: API

- Add action validation to `Maps/functions/api/account.js`.
- Add authenticated visit insertion.
- Add authenticated timeline read.
- Validate canonical place ID.
- Generate server-side event ID.
- Generate server-side timestamp.
- Snapshot the server-side place name.
- Add timeline deletion to `erase-data`.
- Add timeline data to export response handling where the existing export is assembled.
- Confirm no coordinate fields are accepted, stored, or returned as user coordinates.

### Phase 3: Client timeline module

- Add `Maps/src/timeline.js`.
- Add radius and accuracy constants.
- Add pure GPS eligibility helper.
- Add authenticated API calls.
- Add timeline normalization.
- Add summary and grouping helpers.
- Add calendar aggregation helpers.
- Add `TIMELINE_UPDATED` event dispatch.
- Add safe account-identity request guards where needed.

### Phase 4: Place interaction

- Add “Add to timeline” to `places.js`.
- Connect the action to timeline verification.
- Add pending, success, failure, and retry states.
- Preserve manual visited behavior.
- Ensure no GPS request happens before authentication.
- Ensure the request body contains only the selected place ID and token/action fields.

### Phase 5: Profile timeline

- Add Profile markup in `index.html`.
- Fetch timeline only when Profile opens.
- Add loading and empty states.
- Add inline error and retry state.
- Render summary values.
- Render vertical timeline.
- Render calendar activity view.

### Phase 6: Mini-map

- Add the mini-map container.
- Create the MapLibre instance lazily.
- Reuse `HSL_STYLE` and existing MapLibre setup conventions.
- Render unique place markers.
- Fit bounds safely.
- Use a sensible zoom for a single place.
- Resize after Profile visibility changes.
- Clear markers on account changes and sign-out.

### Phase 7: Styling and accessibility

- Add reusable tokens only when necessary.
- Add timeline layout rules.
- Add calendar responsive rules.
- Add mini-map responsive rules.
- Add dark-mode styling.
- Add reduced-motion behavior.
- Add focus and semantic labels.
- Add live/pending/error announcements where needed.
- Verify no horizontal overflow.

### Phase 8: Privacy and export

- Update privacy notice.
- Update export payload.
- Update erase confirmation copy if needed.
- Confirm wording accurately describes device-only GPS checking.
- Confirm the UI does not claim anti-spoof protection.

### Phase 9: Testing

- Add focused timeline tests.
- Update existing regression tests where selectors or Profile height change.
- Run focused tests.
- Run production build.
- Run full Maps suite.
- Inspect outgoing request bodies for forbidden location fields.

### Phase 10: Release verification

- Apply the D1 migration in the correct environment.
- Test with a real signed-in account.
- Test real browser permission flows.
- Test a real mobile device.
- Test Capacitor Android if it is part of the release target.
- Confirm no GPS coordinates appear in network payloads.
- Confirm the privacy copy matches the actual implementation.
- Bump service-worker asset version.
- Review the final diff for unrelated changes.

## 16. Acceptance checklist

### Product behavior

- [ ] Manual “Visited” marks still work exactly as before.
- [ ] Manual marks do not automatically appear in the GPS timeline.
- [ ] “Add to timeline” is a separate place action.
- [ ] Timeline creation requires authentication.
- [ ] Timeline creation requires an explicit user action.
- [ ] No background location tracking is introduced.
- [ ] Radius is fixed at 150 metres.
- [ ] GPS accuracy must be no worse than 150 metres.
- [ ] Every successful confirmation creates a separate event.
- [ ] Repeated visits remain visible as separate timeline items.
- [ ] Existing Explorer badge behavior is unchanged.
- [ ] The timeline is private by default.
- [ ] No public timeline route or public endpoint is introduced.

### GPS and privacy

- [ ] GPS coordinates remain on the device.
- [ ] GPS coordinates are not included in the account request.
- [ ] GPS accuracy is not included in the account request.
- [ ] Local distance is not included in the account request.
- [ ] User-supplied timestamps are not accepted.
- [ ] Server timestamps are generated by the API.
- [ ] The server validates the authenticated account.
- [ ] The server validates that the place exists and is eligible.
- [ ] The API stores no raw GPS data.
- [ ] The privacy notice describes the device-only check accurately.
- [ ] The UI does not claim anti-spoof protection.
- [ ] Tests assert that forbidden coordinate fields are absent from the request.

### Backend

- [ ] `verified_visits` is included in `Maps/schema.sql`.
- [ ] A forward migration exists.
- [ ] The migration is numbered `0054_verified_visit_timeline.sql` unless repository migration state requires a documented adjustment.
- [ ] The migration targets the Manarah database.
- [ ] The account API accepts `add-verified-visit`.
- [ ] The account API accepts `get-visit-timeline`.
- [ ] Timeline reads are account-scoped.
- [ ] Timeline writes are account-scoped.
- [ ] Event IDs are server-generated.
- [ ] Event timestamps are server-generated.
- [ ] Place names are snapshotted from canonical server data.
- [ ] Place IDs are validated against the canonical places table.
- [ ] Timeline rows are deleted by account erase.
- [ ] Existing saved-place rows are not modified.
- [ ] Timeline data is not loaded through `sync-saved`.
- [ ] Export includes timeline data without raw GPS data.

### Frontend

- [ ] `Maps/src/timeline.js` contains GPS and timeline logic.
- [ ] Existing geolocation helpers are reused.
- [ ] Existing distance helpers are reused.
- [ ] The place sheet has pending and failure states.
- [ ] The place sheet has clear manual-versus-GPS copy.
- [ ] The Profile has loading, empty, success, and error states.
- [ ] The Profile displays total verified visits.
- [ ] The Profile displays unique places.
- [ ] The Profile displays active months.
- [ ] The Profile displays a vertical timeline.
- [ ] The Profile displays a calendar activity view.
- [ ] The Profile displays an embedded mini-map.
- [ ] The mini-map uses canonical place coordinates only.
- [ ] Repeated visits do not create duplicate map markers.
- [ ] Events without current coordinates remain visible in the timeline.
- [ ] Account changes clear old timeline data.
- [ ] Stale asynchronous responses cannot overwrite the active account.
- [ ] Export includes timeline data.
- [ ] Sign-out clears timeline markers and in-memory event data.

### Accessibility and responsive behavior

- [ ] All controls have accessible names.
- [ ] Keyboard users can trigger the timeline action.
- [ ] Focus states are visible.
- [ ] Pending controls are announced or clearly represented.
- [ ] Permission and server errors are understandable without raw error codes.
- [ ] Calendar meaning does not depend on color alone.
- [ ] Calendar cells expose date and visit count.
- [ ] Mini-map has an accessible label.
- [ ] Timeline is usable at 360 px width.
- [ ] Timeline is usable at 390 px width.
- [ ] No page-level horizontal overflow exists; the activity grid scrolls only inside its bounded region.
- [ ] Dark mode is readable.
- [ ] Reduced motion is respected.
- [ ] Touch targets remain practical on mobile.
- [ ] The map is supplementary and the list remains usable without it.

### Testing

- [ ] Manual visited regression test passes.
- [ ] Signed-out test passes.
- [ ] In-range GPS test passes.
- [ ] Exact-radius GPS test passes.
- [ ] Outside-radius test passes.
- [ ] Exact-accuracy-threshold test passes.
- [ ] Low-accuracy test passes.
- [ ] Invalid-location test passes.
- [ ] Permission-denied test passes.
- [ ] GPS-unavailable test passes.
- [ ] Timeout test passes.
- [ ] Repeat-visit test passes.
- [ ] Timeline sorting test passes.
- [ ] Timeline grouping test passes.
- [ ] Summary aggregation test passes.
- [ ] Calendar aggregation test passes.
- [ ] Mini-map uniqueness test passes.
- [ ] Profile empty-state test passes.
- [ ] Profile loading-state test passes.
- [ ] Profile error/retry test passes.
- [ ] Account isolation test passes.
- [ ] Stale-request protection test passes.
- [ ] Export test passes.
- [ ] Erase-data test passes.
- [ ] Desktop tests pass.
- [ ] Mobile tests pass.
- [ ] Production build passes.
- [ ] Full Maps suite passes.

## 17. Explicit non-goals

Do not include these in the first implementation:

- Automatic background visit detection
- Continuous location tracking
- Offline timeline queues
- User-configurable radius
- Public timeline profiles
- Social sharing
- Friend activity
- Server-side raw GPS validation
- Native anti-spoof attestation
- Route history or movement trails
- Photos attached to timeline events
- Notes attached to visits
- New charting dependencies
- New authentication providers
- Changes to manual visited marks
- Changes to Explorer badge thresholds or semantics
- Timeline data in the normal saved-place sync payload
- Location history or any breadcrumb trail

If a future request asks for one of these, treat it as a separate product and privacy decision rather than silently expanding this implementation.

## 18. Final risk register

### Client-side spoofing

Risk: A user can bypass the browser check and call the authenticated endpoint directly.

Mitigation in v1:

- Do not accept client timestamps.
- Do not accept client account identifiers.
- Validate the place ID server-side.
- Keep the UI wording honest.
- Document that this is a best-effort GPS confirmation.

Future mitigation:

- Native platform attestation
- Server-mediated location checks
- Platform-specific integrity signals

### GPS drift

Risk: A genuine user may be rejected near the edge of the radius.

Mitigation:

- Use high-accuracy location requests.
- Allow 150 metres.
- Reject only fixes with accuracy worse than 150 metres.
- Give a retryable explanation.
- Do not permanently block the action.

### Stale place data

Risk: A place can be renamed, disabled, or removed after an event is created.

Mitigation:

- Store a place-name snapshot.
- Use current canonical coordinates only when available.
- Keep timeline events visible even when the current place lookup has no coordinates.

### Profile performance

Risk: A large event history or second MapLibre instance can slow Profile.

Mitigation:

- Load timeline data only when Profile opens.
- Create the mini-map lazily.
- Render unique map markers.
- Reuse existing MapLibre assets.
- Add pagination later only if real data requires it.

### Account leakage

Risk: Previous-account timeline data could remain in memory after sign-out or account switching.

Mitigation:

- Clear timeline caches on auth changes.
- Remove mini-map markers.
- Guard asynchronous responses by account identity.
- Do not render stale requests into the active Profile.

### Privacy mismatch

Risk: Documentation might imply that no location data is transmitted while another future change sends it.

Mitigation:

- Test outgoing request bodies.
- Keep the request contract explicitly coordinate-free.
- Update the privacy notice in the same change.
- Review the final network behavior before release.

### Migration targeting

Risk: The migration could be applied to the wrong D1 database because the repository contains multiple migration families.

Mitigation:

- Keep the migration under `Maps/migrations`.
- Confirm the deployment command and database binding before applying it.
- Verify both fresh schema and upgrade migration behavior.
- Do not place this table in project, admin, or forms database migrations.

## 19. Implementation handoff summary

The smallest complete v1 is a private, authenticated, manually triggered timeline. The client requests one high-accuracy location fix, checks the 150-metre radius and 150-metre accuracy threshold locally, and sends only the canonical place ID to the authenticated account endpoint. The server stores an account-scoped event with a server-generated timestamp and a canonical place-name snapshot. Profile loads the events on demand and opens a separate timeline window containing a vertical timeline, a horizontally scrollable 12-month activity grid, and a lazy embedded mini-map using canonical place coordinates.

The existing manual visited system remains independent. It continues to work for signed-out users through local storage, continues to synchronize for signed-in users, and continues to drive existing visited-place and Explorer behavior. No automatic tracking, offline event queue, public sharing, configurable radius, raw GPS storage, or anti-spoof guarantee belongs in this release.

Ponytail note: this plan intentionally excludes automatic tracking, offline queues, sharing, configurable radii, new chart dependencies, and anti-spoof infrastructure. The main known risk is that device-only GPS verification cannot be made tamper-proof.

## 20. Refinement amendments implemented after the original plan

- The place-sheet action is a compact text pill labelled `Add to timeline`; the manual visited and bookmark actions remain icon controls.
- The Profile launcher is plain section content without a clock icon or an extra card wrapper. The full timeline remains a separate window.
- The activity grid starts at 1 October 2026, hides the leading pre-launch month label, and opens scrolled to the newest day. Tapping a day highlights every matching event in the vertical list.
- Timeline events use the existing date and place context without a repeated GPS-confirmed pill. Each event has an accessible remove action and a confirmation step.
- The server applies a one-hour same-place cooldown with an atomic conditional insert. The client also remembers the active cooldown immediately after a successful add. A later visit can create a new event after the hour has elapsed.
- The same-place cooldown is now one hour. After a successful add, the place action remains a green, clickable `Added to timeline` pill for that hour; tapping it shows a short informational toast instead of submitting another event.
- Place-sheet action order is `Add to timeline`, manual `Visited`, then `Save`/bookmark.
