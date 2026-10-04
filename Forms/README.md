# Karamah Collective Forms

Public respondent application for versioned forms authored in Admin. The app is static JavaScript plus Cloudflare Pages Functions, matching the Links and Maps deployment pattern.

## Local development

From the repository root:

```sh
npm run dev:forms
```

The public app runs at `http://127.0.0.1:8791`. Admin development also starts Forms automatically. Apply the shared D1 schema through `node Maps/scripts/local-db.mjs`; new installations need `Maps/migrations/0021_forms.sql` through `0024_form_share_code_aliases.sql`, followed by `0030_form_collaborators.sql`.

## Cloudflare bindings

Configure the Forms Pages project with its dedicated data stores:

- `DB`: `forms-db` (`3237f544-7c01-41cb-802b-20e1d1c1ad0a`);
- `MEDIA`: the private `forms-media` bucket;
- `FIREBASE_PROJECT_ID` only if it differs from `halal-map-karamah`.

## Deploy to Cloudflare Pages

1. In **Workers & Pages**, create a Pages project from this repository. Use the
   `Forms` root directory, build command `npm ci --prefix .. && npm run build`,
   and build output directory `dist`. Set `NODE_VERSION=22` and
   `SKIP_DEPENDENCY_INSTALL=true` for both Preview and Production.
2. Bind `forms-db` as `DB` and `forms-media` as `MEDIA` for Production. Use
   separate preview-only stores for Preview so test submissions cannot enter
   production data.
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

Before announcing the domain, manually publish a test form and check its
public link, conditional path, upload, response ledger, CSV export, and Admin
preview. The `404.html` page should appear for an unknown static address.

## Routes

- `/f/:shareCode` — long, opaque canonical respondent route; three-character short links redirect here;
- `/forms/:slug` — legacy respondent route retained for previously shared links;
- `GET /api/form?code=:shareCode` — published schema and availability;
- `POST /api/form?code=:shareCode` — validated, idempotent submission;
- multipart `POST /api/form?code=:shareCode&questionId=:id` — respondent file upload;
- `GET /api/media?id=:assetId` — immutable public presentation image.

Respondent uploads are never exposed through the public media route. Only presentation assets in `form_assets` can be read there.

## Build and test

```sh
npm run build:forms
npm run test:forms
npm run test:forms:ui
```

Before deployment, apply `Maps/migrations/0021_forms.sql` through `Maps/migrations/0024_form_share_code_aliases.sql`, then `Maps/migrations/0030_form_collaborators.sql`, to the matching Forms D1 database. Run `npm run migrate:form-links -- --remote` after applying `0024` to create three-character short links that redirect to the long canonical URLs.
