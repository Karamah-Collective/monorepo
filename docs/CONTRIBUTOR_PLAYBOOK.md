# Contributor playbook: tracing real changes

This chapter is the practical bridge between the platform story and day-to-day engineering. It explains how to trace a request through the actual Karamah codebase, how to decide which layers a feature touches, and which mistakes most often create subtle regressions.

Use it after reading the root README and [Application guide](APPLICATION_GUIDE.md). It deliberately uses common change types rather than abstract architecture alone.

## The four questions before editing

Every ticket should be reduced to four answers before a file is changed:

1. Which user sees the outcome: public visitor, signed-in community member, respondent, or staff?
2. Which application owns the experience and which application owns the data?
3. Is the data public, published, private-to-user, collaborator-scoped, or staff-only?
4. Which Pages Function is the final authorization and validation boundary?

If the answer to number two is “Admin,” pause. Admin normally owns the staff experience, not the record. A Website content record is owned by Website; public Links configuration is owned by Links/shared data; form submission data is owned by Forms; shared staff permissions are owned by the existing access system. Admin is a client of those owners.

## Example 1: add a public Manarah place attribute

Suppose a place needs a new public capability label. First determine whether it is immutable/reference information or mutable staff/community-managed data. Search existing `places` data, taxonomy migrations, app-setting schema, and Maps Admin actions for the closest pattern.

A safe implementation commonly has this shape:

1. Define storage and migration only if a D1 field/table is genuinely required. Never add a browser-only field that masquerades as persisted data.
2. Update the Maps owner function/public projection so a public request returns only the allowed attribute.
3. Update Maps place rendering/filter/search behavior if the label changes discovery semantics.
4. Update Admin authoring/moderation UI and server-side validation if staff must edit it.
5. Update test fixtures and focused Maps/API tests.
6. Check mobile place cards and map marker/filter states, not only desktop.

Do not place administration logic in the public app merely because it is convenient to render a toggle there. Do not trust a client-provided “isAdmin” flag. If the field changes filtering, consider cache invalidation and compatibility for existing records that have no value.

## Example 2: add a Website content block

Website is intentionally static-first. Begin with the publication model: which records are drafts/private, which are published, and what minimal public shape does the page need? Read Website’s public content route and `site-content` rendering before changing HTML.

The normal path is owner data layer/function first, then Admin editing contract, then public renderer. A public content block should retain semantic HTML and accessible heading order, work without fragile client timing, have a safe default when old content lacks the new field, and be represented in metadata/SEO decisions when it changes the public page meaning.

Test both public and private projections. It is easy to make an Admin editor work while accidentally returning draft content to anonymous users.

## Example 3: add a Form question type

Forms changes must preserve a stronger invariant: an answer submitted today must remain understandable even after a form is edited tomorrow. A new question type therefore crosses more layers than its UI suggests.

Trace it through:

* `shared/forms-domain.mjs`: type registration, default creation, normalization, schema validation, answer validation, public-schema projection.
* `shared/forms-logic.mjs`: valid condition operators and logic semantics, if the question can participate in conditions.
* `Forms/app.js`: respondent rendering, input collection, required/error behavior, accessibility, mobile behavior.
* Admin form editor/components: authoring controls, preview, validation messaging, persistence.
* Forms API: server repeats validation and must not accept a malformed client answer.
* Tests: shared-domain tests, Forms API tests, public browser flow, and Admin editor coverage.

Publishing creates or selects an immutable version. Never mutate old version JSON to retrofit a feature. Give old versions a predictable rendering/validation path or prevent an incompatible edit before publication.

## Example 4: add a staff-only operational action

Start at the owner API, not the Admin button. Define the action name, input schema, permission, resource ownership rule, successful response, audit/side effect expectation, and error behavior. Implement server verification and authorization first.

Then add the Admin API client function, React Query mutation/query invalidation, page control, disabled/pending state, accessible confirmation where the action is material, and an explanatory error state. Navigation permissions are useful for discovery but not security. A caller can invoke a request without visiting the page.

For cross-product actions, make the server-to-server call explicit and narrow. Forms’ consultation of shared access is a good pattern: it reuses the authority rather than copying roles into Forms.

## Example 5: add an upload

An upload is a data-lifecycle feature, not a file input. Decide before coding:

* Which bucket stores it and which D1 record owns its metadata?
* Who may upload, view, replace, delete, or share it?
* Is it a public presentation asset or private user-submitted content?
* Which file types/sizes are allowed, and what is validated server-side?
* How is its object key generated and what happens to orphaned objects?
* What retention/deletion behavior is required?

Forms has the clearest split: presentation assets may be exposed intentionally through the public media path; respondent uploads must remain private. Never solve preview friction by making an R2 bucket public.

## Debugging by layer

| Symptom | Start with | Common cause |
| --- | --- | --- |
| Public page loads but data is empty | Browser Network → public endpoint | Published filter, wrong DB binding, stale client assumptions |
| Admin page is denied | Owner API response and verified role | Missing permission, wrong Firebase origin/provider, server rule—not a React route problem |
| Works locally but not production | Pages deployment/build configuration/bindings | Wrong root/output/branch, missing secret, Preview/Production binding difference |
| Form renders but submit fails | Forms API response and shared validation | Schema/answer mismatch, Turnstile, upload policy, stale published version assumption |
| Map route/search enhancement fails | Provider request/fallback UI | Provider rate limit/configuration/network, not core map data |
| Analytics/health is empty | Server-side provider notice/cache | Secret, rate limit, provider outage, malformed upstream—not a reason to block Admin |

## Design and accessibility are implementation work

Do not defer responsive design, loading states, or accessibility until “after the backend works.” Every public/application change should specify:

* The desktop, tablet, and mobile layout.
* Loading, empty, error, and disabled/mutation-pending states.
* Keyboard, focus, label, and live-region behavior for interactive controls.
* Light/dark mode treatment where the application supports it.
* The smallest amount of new visual vocabulary necessary; reuse app tokens and components.

Admin is a dense operational tool. Compactness must not erase hierarchy, label meaning, or touch targets. Maps is mobile-first; test actual narrow viewport behavior. Website/Links emphasize semantic content and delivery performance. Forms prioritizes respondent clarity and completion confidence.

## What a good pull request/release note answers

A future maintainer should be able to reconstruct a change from its commit and linked documentation. State the user outcome, owner app/API, data/migration impact, permission model, configuration/secrets required, tests run, deployment target, and any manual verification. If the change alters an external service, health signal, or operator workflow, update the service/operations docs in the same commit.

## Escalation rule

When ownership, retention, authorization, or migration scope is unclear, do not guess. Write down the ambiguity, inspect the nearest existing pattern and the relevant platform guide, and ask for a product/security decision before adding a second source of truth. Careful boundaries are what make this monorepo maintainable.
