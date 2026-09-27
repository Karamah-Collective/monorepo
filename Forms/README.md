# Karamah Collective Forms

Public respondent application for versioned forms authored in Admin. The app is static JavaScript plus Cloudflare Pages Functions, matching the Links and Maps deployment pattern.

## Local development

From the repository root:

```sh
npm run dev:forms
```

The public app runs at `http://127.0.0.1:8791`. Admin development also starts Forms automatically. Apply the shared D1 schema through `node Maps/scripts/local-db.mjs`; this runs `Maps/migrations/0021_forms.sql` without deleting existing data.

## Cloudflare bindings

Configure the Forms Pages project with:

- `DB`: the same D1 database used by Maps and Links;
- `MEDIA`: the same private R2 bucket used by Maps;
- `FIREBASE_PROJECT_ID` only if it differs from `halal-map-karamah`.

The Maps Pages project also needs its existing `DB` and `MEDIA` bindings because authenticated form management and cover-image uploads are served from its admin API.

## Deploy to Cloudflare Pages

1. In **Workers & Pages**, create a Pages project from this repository. Use the
   `Forms` root directory, build command `npm ci --prefix .. && npm run build`,
   and build output directory `dist`. Set `NODE_VERSION=22` and
   `SKIP_DEPENDENCY_INSTALL=true` for both Preview and Production.
2. Create or select the same D1 database already bound to Maps. Add it to the
   Forms project as `DB`. Create or select the same private R2 bucket used by
   Maps and add it as `MEDIA`. Do this independently for Preview and Production
   so preview submissions cannot enter production data.
3. Apply `Maps/migrations/0021_forms.sql` to the matching D1 database before
   the first deploy. The Forms API intentionally fails closed while `DB` or
   `MEDIA` are missing.
4. Add `FIREBASE_PROJECT_ID=halal-map-karamah` only if the default Firebase
   project is not correct for this environment. No Firebase client secret is
   stored in Pages; the public client configuration remains in `auth.js`.
5. Deploy the generated `Forms/dist` build, first verify the `pages.dev` URL,
   then attach `forms.karamahcollective.com`. Set `VITE_FORMS_ORIGIN` in the
   Admin Pages project to that final HTTPS origin and redeploy Admin, so share
   links and live previews use the correct Forms host.
6. Keep `DB` and `MEDIA` bindings on the Maps Pages project. It owns the
   Firebase-protected authoring endpoints at `/api/admin` and `/api/form-asset`.
   Forms owns only public published schemas, submissions, and presentation
   images.

Before announcing the domain, manually publish a test form and check its
public link, conditional path, upload, response ledger, CSV export, and Admin
preview. The `404.html` page should appear for an unknown static address.

## Routes

- `/forms/:slug` — stable public respondent route;
- `GET /api/form?slug=:slug` — published schema and availability;
- `POST /api/form?slug=:slug` — validated, idempotent submission;
- multipart `POST /api/form?slug=:slug&questionId=:id` — respondent file upload;
- `GET /api/media?id=:assetId` — immutable public presentation image.

Respondent uploads are never exposed through the public media route. Only presentation assets in `form_assets` can be read there.

## Build and test

```sh
npm run build:forms
npm run test:forms
npm run test:forms:ui
```

Before deployment, apply `Maps/migrations/0021_forms.sql` to both Preview and Production D1 databases using the same migration process as the other Maps-backed applications.
