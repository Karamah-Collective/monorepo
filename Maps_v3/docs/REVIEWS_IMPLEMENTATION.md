# In-App Rating & Review System — Implementation Plan

## Overview

A community-driven rating/review system (1–5 stars + optional text) that replaces Google ratings entirely. Stored in a dedicated "Reviews" worksheet in Google Sheets. Ratings display immediately; text reviews require admin moderation. Anti-abuse uses a **triple-identity system** (browser fingerprint + device ID + IP hash) — the strongest feasible approach without user accounts.

---

## Decisions

| Question | Answer |
|----------|--------|
| Moderation | Hybrid: star rating instant, text review moderated |
| Fields | Star rating (1–5) + text review (anonymous, no display name) |
| Display | Popup summary + full overlay on tap |
| Aggregate | Replaces Google rating entirely |
| Update policy | Users can update their star rating (replaces previous). Cannot edit/delete text reviews. |
| Minimum text | 20 chars if text is provided |
| Sorting | Newest-first |
| Anti-abuse | Most aggressive layered system (see below) |

---

## Anti-Abuse Architecture

Reviews directly affect businesses, so we use every available mechanism:

| # | Layer | Mechanism | What it stops |
|---|-------|-----------|---------------|
| 1 | Device ID | Existing `hf_device_id` localStorage UUID | Casual re-submission |
| 2 | Browser Fingerprint | SHA-256 hash of canvas + WebGL + hardware + screen + timezone + language + platform | localStorage clear, incognito (partially) |
| 3 | IP Hash | SHA-256 of `CF-Connecting-IP` (computed server-side, raw IP never stored) | All client-side evasion |
| 4 | reCAPTCHA v3 | Elevated threshold (0.7 vs 0.5 elsewhere) | Bots / automated attacks |
| 5 | Server-side triple-dedup | Reject if **ANY** of (fingerprint, deviceId, ipHash) already reviewed that place | Partial identity evasion |
| 6 | Global rate limit | Max 5 reviews per fingerprint per rolling 24h | Flood/spam attacks |
| 7 | Text moderation | Admin approval required before text is publicly visible | Offensive/fake content |

**To bypass all layers**: attacker needs a different physical device + different network + cleared storage. This is the highest bar achievable without accounts.

### Fingerprint Components (computed client-side)

```
Canvas toDataURL (render specific text + geometric shapes)
WebGL: UNMASKED_RENDERER_WEBGL + UNMASKED_VENDOR_WEBGL
screen.width × screen.height × colorDepth × devicePixelRatio
navigator.hardwareConcurrency
navigator.deviceMemory (if available)
Intl.DateTimeFormat().resolvedOptions().timeZone
navigator.languages.join(',')
navigator.platform
```

Hashed via `crypto.subtle.digest('SHA-256')` → 64-char hex string. Computed lazily on first review attempt. Cached in module memory only (never localStorage — prevents tampering).

### Update vs. Block Logic

When a user submits a review and their identity (any of the 3 identifiers) matches an existing review for that place:
- **Star-only rating**: Replace the existing row's rating + timestamp (update, not block)
- **Rating + text**: Replace rating, append new text as pending (old text stays if approved)

---

## Data Model — "Reviews" Worksheet

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | placeId | string(6) | Links to Places sheet |
| B | rating | integer | 1–5 |
| C | text | string | Review text (empty if rating-only), max 500 chars |
| D | deviceId | string(64) | localStorage UUID |
| E | fingerprint | string(64) | SHA-256 hex |
| F | ipHash | string(64) | SHA-256 hex |
| G | timestamp | string | ISO 8601 |
| H | status | string | `live` / `pending` / `rejected` |

**Status logic:**
- No text → status = `live` (rating counts toward aggregate immediately)
- Has text → status = `pending` (rating counts, text hidden until approved)
- Admin rejects → status = `rejected` (entire review + rating removed from aggregate)

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/reviews.js` | Client module: fingerprinting, submission, overlay UI, star component |
| `functions/api/reviews.js` | Cloudflare Function: submit + fetch reviews (proxy to GAS) |

### Modified Files

| File | Change |
|------|--------|
| `scripts/apps-script/Code.gs` | Add Reviews sheet handlers (submit, fetch, check, admin approve/reject) |
| `src/places.js` | Replace Google rating with community rating in popup + cards |
| `src/app.js` | Lazy-import reviews module |
| `index.html` | Add reviews overlay container |
| `src/styles/design-tokens.css` | Star rating tokens |
| `src/styles/styles.css` | Reviews overlay + star input layout |
| `sw.js` | Add `/api/reviews` to cache strategy |
| `src/utils.js` | Extract `getDeviceId()` as shared export |

---

## API Endpoints

### `GET /api/reviews`

Proxies to Apps Script `?action=reviews`. Returns aggregated review data.

**Response shape:**
```json
{
  "reviews": {
    "<placeId>": {
      "avg": 4.2,
      "count": 12,
      "items": [
        { "rating": 5, "text": "Great food!", "timestamp": "2026-05-14T10:00:00Z" },
        { "rating": 3, "text": "", "timestamp": "2026-05-13T08:30:00Z" }
      ]
    }
  }
}
```

Edge-cached: `s-maxage=300, stale-while-revalidate=60`.

Only `live` reviews included. Text shown only if status is `live` AND text was approved.

### `POST /api/reviews`

**Submit a review:**
```json
{
  "action": "submit",
  "token": "<reCAPTCHA token>",
  "placeId": "8k2rzi",
  "rating": 4,
  "text": "Excellent halal options",
  "deviceId": "uuid-...",
  "fingerprint": "sha256hex..."
}
```

CF Function adds `ipHash` (SHA-256 of CF-Connecting-IP) before forwarding to GAS.

**Responses:**
- `{ success: true, status: "live" }` — rating-only, published immediately
- `{ success: true, status: "pending" }` — has text, awaiting moderation
- `{ success: true, status: "updated" }` — existing review rating replaced
- `{ error: "rate_limited" }` — too many reviews in 24h
- `{ error: "invalid_place" }` — placeId not found
- `{ error: "invalid_rating" }` — rating not 1–5
- `{ error: "text_too_short" }` — text provided but < 20 chars

**Check existing review:**
```json
{
  "action": "check",
  "token": "<reCAPTCHA token>",
  "placeId": "8k2rzi",
  "deviceId": "uuid-...",
  "fingerprint": "sha256hex..."
}
```

Response: `{ reviewed: true, rating: 4 }` or `{ reviewed: false }`

---

## UI Design

### Place Popup — Rating Summary

Replaces Google rating. Inserted after the address, before tags:

```
★ 4.2  (12 reviews)          [tap to open overlay]
```

If user has already reviewed: shows filled stars for their rating below.

### Place Cards — Rating Chip

Replaces Google rating chip in sidebar list:

```
★ 4.2 (12)
```

If no reviews: chip hidden (not "No reviews yet" — too noisy for cards).

### Reviews Overlay (full-screen)

Opened by tapping the rating in popup or a dedicated "Reviews" action button.

**Structure:**
1. Header: place name + close button
2. Average section: large star display + numeric average + review count
3. Star distribution bars (5→1 stars, horizontal bars showing count per level)
4. "Write a review" CTA button (`.btn-primary`)
5. Divider
6. Reviews list: individual review cards (newest-first)
   - Star display (filled/empty)
   - Text (if approved and present)
   - Relative timestamp ("2 days ago", "3 weeks ago")

**Review form** (shown after tapping "Write a review"):
1. Star selector: 5 tappable stars (required)
2. Text area: optional, placeholder "Share your experience (optional)", max 500 chars, char counter
3. Submit button (`.btn-primary`, disabled until rating selected)
4. Note: "Ratings appear instantly. Text reviews are moderated."

### Star Input Component

- 5 inline SVG stars in a row
- Tap to set rating (1–5)
- Filled: `var(--gold)`, empty: `var(--surface-3)`
- Each star ≥ 42px touch target
- Hover preview on desktop (fill on hover)

---

## Implementation Order

1. **Backend first**: Apps Script + Cloudflare Function
2. **Client module**: Fingerprinting, data loading, submission logic
3. **UI**: Overlay markup, CSS, star component, popup/card integration
4. **Integration**: app.js lazy-load, SW cache, places.js hookup

---

## Google Sheet Setup Required

1. Create a new worksheet tab named **"Reviews"**
2. Add headers in row 1: `placeId | rating | text | deviceId | fingerprint | ipHash | timestamp | status`
3. No special formatting needed — Apps Script handles all read/write
