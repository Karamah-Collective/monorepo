# Deep dive: Forms

Forms is a public respondent runtime backed by a staff authoring system. Its central invariant is versioned interpretation: a response remains understandable after an author edits and republishes a draft.

## Lifecycle

Admin creates a draft; shared domain code normalizes and validates it; Admin previews logic; publishing creates an immutable version; a respondent opens `/f/:code` or a legacy route; Forms returns only the public projection; the browser guides answers; the API validates again; submissions/answers/files are stored; staff inspect through authenticated Admin.

`shared/forms-domain.mjs` handles schema versions, question/content types, normalization, schema validation, answer validation, safe redirects, and public projection. `shared/forms-logic.mjs` handles operators, actions, condition matching, and rule validation. Browser feedback is convenience; server validation is authority.

## Routes, storage, security

`api/form.js` serves public schemas, validates/idempotently stores submissions, and handles multipart upload. `api/media.js` serves only public presentation assets. `api/admin.js`, `api/forms.js`, and `api/form-asset.js` serve authenticated authoring/assets. Health routes support monitoring. Forms D1 separates forms, immutable versions, submissions, answers, files, assets, aliases, and collaborators; private `forms-media` stores objects.

Public respondents do not receive staff data. Staff need Firebase identity plus role/collaborator/resource checks. Presentation assets and respondent uploads are different exposure classes.

## Testing and deployment

A new question type usually touches shared domain/logic, Admin editor/preview, respondent renderer, API validation, and tests. Run `npm run build:forms`, domain/API tests, and Forms UI tests. Test invalid/unpublished codes, logic branches, duplicate submissions, uploads, retries, legacy routes, and private media. Production requires isolated Forms D1/R2 bindings and a final Forms origin in Admin.
