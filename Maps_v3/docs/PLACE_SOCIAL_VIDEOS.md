# Place social videos (Discover feed)

Metadata-only clips attached to businesses. Tapping a thumbnail opens TikTok / Instagram / YouTube — video files are **not** stored in D1.

## Table

Applied via `migrations/0004_place_social_videos.sql` on `halal-finder-db` (+ preview).

| Column | Purpose |
|--------|---------|
| `id` | Stable video id |
| `place_id` | Links to `places.id` |
| `platform` | `TikTok` \| `Instagram` \| `YouTube` |
| `url` | Public post / watch URL |
| `thumbnail_url` | Image shown in Discover (YouTube can be auto-filled) |
| `title` / `creator` | Card copy |
| `sort_order` | Lower = earlier |

## Public app API

`GET https://maps.karamahcollective.com/api/app/place-videos?ids=abc123,def456`

```json
{ "videos": { "abc123": [{ "id", "placeId", "platform", "url", "thumbnailUrl", "title", "creator" }] } }
```

## Admin API (Firebase `@karamahcollective.com`)

**UI:** [admin.karamahcollective.com](https://admin.karamahcollective.com) -> **Social Videos**
(built from `halal-finder/admin`, not the legacy `halal_finder_admin` repo).

List:

`GET /api/admin?action=admin-social-videos`

Upsert:

```http
POST /api/admin
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{
  "action": "upsert-social-video",
  "video": {
    "placeId": "9m5ck3",
    "platform": "YouTube",
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "title": "Halal bites nearby",
    "creator": "@halalbites",
    "thumbnailUrl": ""
  }
}
```

Delete:

```json
{ "action": "delete-social-video", "videoId": "sv_…" }
```

## SQL insert (wrangler)

```bash
npx wrangler d1 execute halal-finder-db --remote --command="
INSERT INTO place_social_videos (id, place_id, platform, url, thumbnail_url, title, creator)
VALUES (
  'sv_demo_1',
  'PLACE_ID',
  'YouTube',
  'https://www.youtube.com/watch?v=VIDEO_ID',
  '',
  'Demo clip',
  '@community'
);
"
```

Empty `thumbnail_url` is fine for YouTube — the app fills `img.youtube.com/vi/.../hqdefault.jpg`.

## Deploy note

After changing `functions/`, promote/deploy the **maps** Cloudflare Pages project so `/api/app/place-videos` goes live.
