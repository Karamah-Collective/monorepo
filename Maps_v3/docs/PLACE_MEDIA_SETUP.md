# Place media setup

The feature has two independent paths:

- Community review photos are stored permanently in Cloudflare R2, with ownership and file metadata in D1.
- Google place photos are requested only after a visitor opens a place and only when the Admin toggle is enabled. They are not written to R2 or D1; D1 stores only the stable Google place ID.

Community delivery is also demand-driven. The edge-cached places payload derives
only a `hasImages` boolean from approved D1 rows. Review-image descriptors are
not included in the global places/reviews payload; `/api/place-media` reads them
for one place only after that place or its review window opens. The browser then
lazy-loads each protected `/api/review-image` R2 response as it enters view.

## 1. Create the R2 bucket

1. Open Cloudflare Dashboard.
2. Go to **R2 Object Storage** and choose **Create bucket**.
3. Name the production bucket `manarah-media`.
4. Do not enable public access or create a custom domain. Images are served through `/api/review-image`, which checks that the parent review is public.
5. For Preview, create a separate bucket such as `manarah-media-preview` so test uploads never enter production storage.

## 2. Bind R2 to the Maps Pages project

1. Open **Workers & Pages → Maps → Settings → Bindings**.
2. Under **R2 bucket bindings**, add a binding named exactly `MEDIA`.
3. Select `manarah-media` for Production.
4. Select the separate preview bucket for Preview.
5. Redeploy Maps after saving the binding.

`wrangler.toml` contains the matching local-development binding. The Pages dashboard remains authoritative for deployed bindings.

## 3. Apply the D1 migration

Apply `migrations/0016_place_media.sql` and then
`migrations/0018_review_moderation.sql` to Preview first, then Production. The
second migration adds reversible image visibility, moderation notes, and the
hashed reviewer-ban table used by Admin. In the Cloudflare D1 console:

1. Open the database used by the target environment.
2. Open **Console**.
3. Paste the complete migration and choose **Execute**.
4. Confirm that `review_images`, `place_google_ids`, and `reviewer_bans` appear
   under **Tables**, and that `reviews`/`review_images` contain their moderation
   columns.

If using Wrangler from the repository root, the equivalent production command is:

```sh
npx wrangler d1 execute halal-finder-db --remote --file Maps/migrations/0016_place_media.sql
npx wrangler d1 execute halal-finder-db --remote --file Maps/migrations/0018_review_moderation.sql
```

Use the preview database name instead for Preview. Never point a preview command at the production database.

## 4. Google Places configuration

No action is needed while Google photos are disabled.

The public non-EEA Places terms currently restrict Places content used with a
non-Google map and do not grant a general 30-day photo-storage exception. This
app uses OpenFreeMap, so keep the toggle off unless Google confirms your account
or written agreement permits this presentation. Buying additional quota by
itself may not change those content terms.

When ready:

1. In Google Cloud Console, enable **Places API (New)** for the project behind `MAPS_API_KEY`.
2. Keep `MAPS_API_KEY` as a Cloudflare secret; never add it to client JavaScript.
3. Restrict the key to the Places API services used by this project and set a budget alert in Google Cloud Billing.
4. In Admin, open **Map settings → Search & discovery**.
5. Turn on **Google place photos** and save.

Turning the setting off stops new Google photo requests immediately. Community review photos remain available because they do not use Google.

## Limits and lifecycle

- Three images per review.
- Five MB per image.
- Accepted formats: JPEG, PNG, WebP.
- Admin-hidden reviews and images retain their R2 objects so moderation can be
  reversed. User-deleted reviews still remove their R2 objects.
- Deleting a place removes its review-media objects.
- Community image responses are not browser/CDN cached, so review moderation or deletion takes effect on the next request.
