# Forms App --- Master Product & Implementation Specification

**Purpose:** This file is the source of truth for implementing a
production-ready Forms application inside the existing monorepo. The
implementation agent should treat the requirements below as an
implementation contract, inspect the existing repository before making
architectural decisions, and reuse existing infrastructure wherever
possible.

------------------------------------------------------------------------

## 1. Product Goal

Add a new **Forms** application to the existing monorepo.

The product should provide a modern form-building and response platform
comparable to Google Forms, while adding stronger conditional logic,
administration, analytics, versioning, and extensibility.

There are two distinct surfaces:

1.  **Admin Panel**
    -   Authenticated management surface.
    -   Create, edit, preview, publish, duplicate, archive, and delete
        forms.
    -   Build questions, pages/sections, branching rules, validation,
        styling, access rules, and submission behavior.
    -   Review individual submissions.
    -   View aggregate analytics.
    -   Export responses.
    -   Manage existing and historical forms.
2.  **Forms App**
    -   Public/respondent-facing application.
    -   Displays only published forms and their respondent experience.
    -   Supports anonymous forms and authenticated forms.
    -   Collects, validates, and submits responses.
    -   Does not expose administration functionality.

The Forms app must feel like another native part of the existing product
ecosystem, not a separate project.

------------------------------------------------------------------------

# 2. Non-Negotiable Repository Rules

Before writing implementation code, inspect the monorepo and document
the existing patterns relevant to this feature.

## 2.1 Reuse existing systems first

Do **not** build duplicate infrastructure if the monorepo already
contains an equivalent.

Reuse where applicable:

-   Existing Firebase authentication.
-   Existing Google sign-in.
-   Existing Microsoft sign-in.
-   Existing email/password authentication.
-   Existing Firebase configuration and authentication helpers.
-   Existing Cloudflare D1 bindings, database access layer, migrations,
    utilities, and conventions.
-   Existing Cloudflare R2 configuration and upload/storage helpers.
-   Existing API/RPC/server-action patterns.
-   Existing monorepo package structure.
-   Existing shared UI components.
-   Existing design tokens.
-   Existing typography.
-   Existing colors and theme behavior.
-   Existing responsive breakpoints.
-   Existing buttons, dialogs, inputs, dropdowns, cards, navigation,
    toast notifications, loaders, empty states, etc.
-   Existing error handling and logging patterns.
-   Existing validation libraries and schemas.
-   Existing deployment configuration.
-   Existing environment-variable conventions.
-   Existing linting, formatting, TypeScript, testing, and build
    configuration.
-   Existing admin-panel authorization/role checks.

Only introduce a new dependency, abstraction, table, utility, or
component when the existing system genuinely cannot satisfy the
requirement.

## 2.2 Preserve current applications

The new feature must not break or unnecessarily refactor the existing:

-   Maps app.
-   Links app.
-   Admin panel.
-   Authentication flows.
-   D1/R2 integrations.
-   Shared packages.
-   Deployment configuration.

Prefer additive, backward-compatible changes.

## 2.3 No parallel authentication system

Firebase remains the identity provider.

Do not create a separate username/password system or duplicate OAuth
implementation.

The Forms app may require authentication for particular forms, but it
must use the same Firebase identities and existing login experience.

## 2.4 Follow existing monorepo conventions

Before implementation, determine:

-   package manager;
-   workspace layout;
-   framework(s);
-   routing convention;
-   server/API convention;
-   database migration system;
-   shared packages;
-   UI system;
-   authentication middleware;
-   deployment targets;
-   testing framework;
-   environment handling.

Implement Forms according to those patterns rather than imposing a new
architecture.

------------------------------------------------------------------------

# 3. Suggested Application Boundary

Use the repository's actual naming conventions, but conceptually the
architecture should contain:

``` text
apps/
  map/
  links/
  admin/
  forms/          # respondent-facing Forms app

packages/
  ...existing shared packages...
  forms-domain/   # only if a shared domain package fits existing repo architecture
```

Do not create a new shared package merely because this specification
names one. Reuse an existing shared/domain package if appropriate.

The Admin app owns authoring and management UI.

The Forms app owns respondent rendering and submission UI.

Shared form schemas, validation, types, rule evaluation, and reusable
rendering components should live in the appropriate existing shared
package so that admin preview and respondent rendering use the same
logic.

------------------------------------------------------------------------

# 4. Core Product Concepts

The implementation should model these concepts explicitly:

-   Form
-   Form version
-   Page/section
-   Content block
-   Question
-   Question option
-   Conditional rule
-   Form access policy
-   Form settings
-   Theme/presentation settings
-   Submission
-   Submission answer
-   File attachment
-   Respondent identity where applicable
-   Analytics/event data where applicable

Use stable IDs for forms, versions, sections, questions, options, rules,
submissions, and attachments.

Never depend on visible question text as an identifier.

------------------------------------------------------------------------

# 5. Form Lifecycle

Each form should support a clear lifecycle:

-   Draft
-   Published
-   Closed
-   Archived

Optional implementation states may be added if useful, but the UI should
remain understandable.

## 5.1 Draft

A draft can be freely edited and previewed.

It must not affect the currently published version until the
administrator publishes changes.

## 5.2 Published

Publishing creates an immutable or effectively immutable **published
version snapshot**.

A stable public URL points to the active published version.

Editing a published form should edit a new draft rather than silently
modifying the schema attached to already-recorded responses.

## 5.3 Version history

Store enough information to know exactly what form schema a respondent
saw when a submission was created.

Requirements:

-   version number or immutable version ID;
-   published timestamp;
-   publisher identity when available;
-   form schema snapshot;
-   ability to inspect prior versions;
-   responses remain associated with the correct version.

A future "restore version" feature should be possible without
redesigning the database.

## 5.4 Closed

A form can be manually closed or automatically closed by schedule/quota.

Closed forms do not accept new submissions and show a configurable
closed message.

## 5.5 Archived

Archived forms remain available in admin history and retain responses
but are removed from the normal active list.

------------------------------------------------------------------------

# 6. Admin --- Forms Dashboard

Add a Forms management area to the existing Admin panel.

The dashboard should support:

-   Create form.
-   Search forms.
-   Filter by status.
-   Sort by updated date, created date, title, response count, and
    status where appropriate.
-   Active/draft/published/closed/archived visibility.
-   Response count.
-   Last response time.
-   Last updated time.
-   Owner/creator where relevant.
-   Open editor.
-   Preview.
-   Copy share link.
-   Open responses.
-   Open analytics.
-   Duplicate form.
-   Close/reopen.
-   Archive/unarchive.
-   Delete with confirmation.
-   Create from an existing form/duplicate.
-   Empty states.
-   Loading states.
-   Error states.

Avoid permanently deleting data with a single accidental click.

------------------------------------------------------------------------

# 7. Form Builder

The Admin panel requires a robust visual form builder.

## 7.1 Form-level content

All should be optional unless otherwise specified:

-   Form title/header.
-   Subtitle/sub-header.
-   Rich description/details.
-   Header/cover image.
-   Introductory content.
-   Footer text.
-   Confirmation message.
-   Closed-form message.

Cover/header images should use the existing R2 infrastructure.

Support:

-   upload;
-   replace;
-   remove;
-   safe file validation;
-   sensible size limits;
-   alt text;
-   responsive rendering.

## 7.2 Builder interactions

Support:

-   Add question.
-   Duplicate question.
-   Delete question.
-   Reorder questions.
-   Add page/section.
-   Duplicate section where sensible.
-   Delete section.
-   Reorder sections.
-   Move questions between sections.
-   Drag-and-drop if compatible with the current UI stack.
-   Keyboard-accessible alternatives to drag-and-drop.
-   Undo/redo if feasible with the existing architecture.
-   Autosave.
-   Visible save status.
-   Preview.
-   Publish.
-   Clear indication of unpublished changes.
-   Navigation outline for long forms.
-   Collapse/expand questions or sections for easier editing.

Destructive changes must be confirmed when they could remove data or
logic dependencies.

## 7.3 Autosave

Builder changes should save automatically using debouncing or an
equivalent efficient mechanism.

The UI should communicate states such as:

-   Saving...
-   Saved
-   Save failed

Do not send a database write for every keystroke.

Protect against accidentally overwriting a newer edit when concurrent
editing or multiple tabs are possible.

------------------------------------------------------------------------

# 8. Supported Content Blocks

Forms should support non-answer content blocks in addition to questions.

At minimum:

-   Heading.
-   Subheading.
-   Paragraph/instructions.
-   Image.
-   Divider.
-   Section/page introduction.

Recommended extensible architecture:

-   Video/embed block where safely supported.
-   Callout/information block.

These blocks should participate in ordering but should not generate
answer records.

------------------------------------------------------------------------

# 9. Question Types

Implement a type-driven question architecture so additional types can be
introduced later without redesigning the entire renderer.

## 9.1 Text

### Short answer

Single-line text.

Configuration may include:

-   required;
-   placeholder;
-   minimum length;
-   maximum length;
-   exact length;
-   regex/pattern validation;
-   email format;
-   URL format;
-   numeric-only;
-   custom validation message.

### Long answer / paragraph

Multi-line text.

Support relevant length and pattern validation.

## 9.2 Choice

### Multiple choice / radio

Exactly one option.

Support:

-   option labels;
-   optional option descriptions;
-   "Other";
-   option reordering;
-   conditional logic by selected option.

### Checkboxes / multi-select

Zero or more options unless required.

Support:

-   minimum selections;
-   maximum selections;
-   exact number of selections;
-   "Other";
-   conditional rules using contains/does-not-contain semantics.

### Dropdown

Single selection presented compactly.

### Multi-select dropdown

Recommended additional type for long option lists.

## 9.3 Numbers

Numeric input with optional:

-   integer/decimal;
-   min/max;
-   greater than/less than;
-   range;
-   step;
-   units/prefix/suffix;
-   custom validation.

## 9.4 Date and time

Support:

-   date;
-   time;
-   date + time;
-   min/max date where configured.

Store normalized values, while rendering according to appropriate locale
behavior.

## 9.5 Rating

Support:

-   configurable scale, e.g. 1--5 or 1--10;
-   optional endpoint labels;
-   star or numeric presentation where appropriate.

## 9.6 Linear scale

Google-Forms-style numeric scale with configurable start/end and
endpoint labels.

## 9.7 Matrix/grid

### Multiple-choice grid

Rows with one selected column per row.

### Checkbox grid

Rows with multiple selectable columns.

Support required-row rules and appropriate validation.

## 9.8 File upload

Use existing R2 infrastructure.

Configurable:

-   allowed file types;
-   maximum file size;
-   maximum number of files;
-   required/optional;
-   upload progress;
-   failed-upload recovery.

Do not trust client MIME type or extension alone. Validate server-side
as far as the current stack supports.

Uploaded objects should use non-guessable keys and access controls
appropriate to the repository's current R2 architecture.

## 9.9 Contact-oriented fields

These can be specialized variants of short answer rather than separate
storage types:

-   Email.
-   Phone.
-   URL.

## 9.10 Recommended extended types

Design for and preferably implement:

-   Yes/No toggle.
-   Consent/acknowledgement checkbox.
-   Ranking/reorder list.
-   Address/grouped fields.
-   Hidden/system field for trusted contextual metadata when created by
    admin configuration, never by arbitrary respondent input.
-   Optional calculated/read-only field if the architecture can support
    it safely.

Do not sacrifice core reliability to implement optional advanced types.

------------------------------------------------------------------------

# 10. Question Configuration

Every question should support relevant configuration:

-   Label/question text.
-   Optional description/help text.
-   Required/optional.
-   Conditional requiredness.
-   Answer type.
-   Placeholder where applicable.
-   Default value only where appropriate.
-   Validation rules.
-   Custom validation message.
-   Question image where useful.
-   Option ordering.
-   "Other" option where supported.
-   Internal admin label/name if useful.
-   Stable question ID.
-   Visibility rules.
-   Branching/navigation rules.

The builder must only expose settings relevant to the selected question
type.

------------------------------------------------------------------------

# 11. Pages / Sections

Forms may be one page or multi-page.

Each section/page can have:

-   title;
-   subtitle/description;
-   image/content blocks;
-   questions;
-   next/back navigation.

Requirements:

-   respondent progress must be preserved when moving between pages;
-   validation occurs before moving forward when necessary;
-   Back should preserve previous answers;
-   conditional logic can skip sections;
-   skipped sections should not block submission;
-   hidden questions should not incorrectly fail required validation.

Support a progress indicator as a configurable form setting:

-   none;
-   page X of Y;
-   progress bar.

When conditional branching makes the exact remaining path unknowable,
the progress UI should degrade gracefully rather than show misleading
precision.

------------------------------------------------------------------------

# 12. Conditional Logic Engine

Conditional logic is a first-class feature and should not be implemented
as scattered UI conditionals.

Create a reusable rule model and evaluator.

## 12.1 Conditions

A condition references a previous or otherwise eligible question and an
operator.

Possible operators by data type:

### Text

-   equals
-   does not equal
-   contains
-   does not contain
-   starts with
-   ends with
-   is empty
-   is not empty
-   matches pattern where safe

### Number

-   equals
-   not equal
-   greater than
-   greater than or equal
-   less than
-   less than or equal
-   between

### Single choice

-   is
-   is not

### Multi-choice

-   contains option
-   does not contain option
-   contains all
-   contains any
-   selection count comparisons

### Date/time

-   before
-   after
-   on
-   between

### Boolean/consent

-   true
-   false

## 12.2 Multiple conditions

Support rule groups:

-   ALL conditions must match (AND).
-   ANY condition may match (OR).

Architect the data model so nested groups could be supported later, even
if the initial UI uses one level.

## 12.3 Actions

Conditional rules should support:

-   Show question.
-   Hide question.
-   Show content block.
-   Hide content block.
-   Make question required.
-   Make question optional.
-   Show section.
-   Skip section.
-   Navigate/go to a specific section after the current section.
-   End form early.
-   Show a particular completion message if appropriate.

Potential future actions should be possible without schema replacement.

## 12.4 Rule safety

The builder must prevent or warn about:

-   references to deleted questions/options;
-   impossible targets;
-   circular navigation;
-   self-referential rules;
-   branches that make submission impossible;
-   required hidden questions;
-   navigation loops;
-   orphaned sections.

Before publishing, run a form integrity validator.

## 12.5 Runtime behavior

Conditional logic should update immediately as respondents change
answers.

If an answer becomes hidden because an earlier answer changed:

-   the UI should remove it from active validation;
-   define and consistently implement whether the hidden value is
    cleared immediately or excluded at submission;
-   preferred behavior: clear answers that become logically unreachable,
    unless preserving them is explicitly needed for a reversible UX;
-   server validation remains authoritative.

------------------------------------------------------------------------

# 13. Dynamic Requiredness

A question may be:

-   always optional;
-   always required;
-   required only when a rule is true;
-   optional when a rule is true.

Examples:

-   If "Attending?" = Yes, "Number of guests" becomes required.
-   If "Other" is selected, explanation becomes required.

Requiredness must be evaluated on both client and server.

------------------------------------------------------------------------

# 14. Form Access and Authentication

Per form, Admin can configure respondent access.

Modes:

## 14.1 Public anonymous

Anyone with the link may submit.

No Firebase login required.

## 14.2 Login required

Respondent must authenticate using the **existing Firebase
authentication system**.

Use existing providers:

-   Google;
-   Microsoft;
-   email/password;

and any additional provider already implemented by the monorepo.

Do not recreate provider integrations.

## 14.3 Optional identity collection

Depending on form configuration:

-   anonymous even if signed in;
-   record authenticated user ID;
-   record verified email/display identity where allowed and
    appropriate.

Clearly communicate identity collection to the respondent.

## 14.4 Submission restrictions

Configurable options:

-   unlimited submissions;
-   one submission per authenticated user;
-   maximum N submissions per authenticated user;
-   one submission per browser/session as a soft anonymous restriction;
-   global response limit;
-   open/close schedule.

Do not claim that browser-based anonymous duplicate prevention is
identity-secure.

------------------------------------------------------------------------

# 15. Form Availability

Admin can configure:

-   publish immediately;
-   opening date/time;
-   closing date/time;
-   manual close;
-   maximum response count.

The respondent app should return an appropriate state for:

-   not yet open;
-   open;
-   closed;
-   response limit reached;
-   form not found;
-   unpublished;
-   archived/unavailable.

Server-side checks must enforce availability; client checks are not
sufficient.

------------------------------------------------------------------------

# 16. Respondent Experience

The respondent-facing Forms app must be polished, fast, accessible, and
mobile-first.

## 16.1 Form route

Use a stable shareable route consistent with existing routing
conventions, conceptually:

``` text
/forms/:slug
```

or a short stable ID.

Human-readable slugs are desirable, but URLs must remain stable if the
form title changes.

## 16.2 Rendering

Display:

-   cover image;
-   title;
-   subtitle;
-   description;
-   pages/sections;
-   content blocks;
-   questions;
-   validation messages;
-   progress UI;
-   Back/Next/Submit controls.

## 16.3 Draft response persistence

For longer forms, preserve in-progress answers.

At minimum, support local persistence in the browser where appropriate.

Recommended:

-   local autosave for anonymous respondents;
-   server-side draft/resume for authenticated respondents if it fits
    the current architecture;
-   configurable "Save and continue later" for forms where this is
    useful.

Never store sensitive file contents in browser local storage.

## 16.4 Submission

On Submit:

1.  Evaluate current published version.
2.  Verify form availability.
3.  Verify authentication requirements.
4.  Re-evaluate conditional logic.
5.  Ignore/reject answers to inaccessible questions according to the
    defined policy.
6.  Validate all visible/applicable required questions.
7.  Validate data types and constraints.
8.  Validate file references.
9.  Enforce submission limits.
10. Store the submission atomically as far as practical.
11. Associate it with the exact form version.
12. Return success only after persistence succeeds.

Prevent accidental double submission from repeated clicks.

Use an idempotency strategy where appropriate.

## 16.5 Completion

After success, show:

-   configurable confirmation message;
-   optional response ID/reference;
-   optional "submit another response" when permitted;
-   optional safe redirect configured by admin.

Do not allow arbitrary unsafe redirect schemes.

------------------------------------------------------------------------

# 17. Response Storage

Store answers in a structure that supports both exact historical
reconstruction and useful querying.

Every submission should include at least:

-   submission ID;
-   form ID;
-   form version ID;
-   submitted timestamp;
-   respondent Firebase UID when configured;
-   respondent identity fields only when configured/allowed;
-   status;
-   answers;
-   relevant metadata required for operation.

Avoid unnecessary collection of personal data.

Do not make IP address collection a default analytics feature. If it is
ever required, it should be intentional, documented, and handled
according to applicable privacy requirements.

## 17.1 Answer representation

Answers should reference stable question IDs.

Choice answers should reference stable option IDs and optionally
preserve labels in the version snapshot.

Support structured values for:

-   text;
-   numbers;
-   booleans;
-   dates/times;
-   single option;
-   multiple options;
-   matrix/grid;
-   file metadata.

------------------------------------------------------------------------

# 18. Recommended D1 Data Model

Adapt names and SQL style to the existing database conventions.

Conceptual entities:

``` text
forms
- id
- slug
- status
- active_version_id
- created_by
- created_at
- updated_at
- archived_at

form_versions
- id
- form_id
- version_number
- schema_json
- created_by
- created_at
- published_at

form_submissions
- id
- form_id
- form_version_id
- respondent_uid nullable
- respondent_email nullable only when configured
- submitted_at
- status
- metadata_json

form_answers
- id
- submission_id
- question_id
- answer_type
- value_json

form_files
- id
- submission_id nullable
- question_id nullable
- r2_key
- original_name
- mime_type
- size_bytes
- created_at
```

Depending on existing D1 patterns and expected scale,
questions/sections/rules may either be normalized into tables or stored
in a versioned schema JSON document.

### Preferred practical approach

Use a versioned `schema_json` as the canonical form definition if this
aligns with the existing stack. It makes published snapshots and
branching definitions much easier to preserve.

Use relational tables for entities that need frequent independent
querying, especially submissions, answer indexing if needed, file
metadata, and form metadata.

Do not over-normalize the builder schema if it makes versioning
unnecessarily complex.

Add indexes based on actual query patterns, e.g.:

-   form ID + status;
-   form ID + submitted timestamp;
-   form version ID;
-   respondent UID + form ID;
-   submission ID;
-   slug uniqueness.

Use migrations rather than ad-hoc production table creation.

------------------------------------------------------------------------

# 19. R2 Storage

Use existing Cloudflare R2 infrastructure.

Potential stored objects:

-   form cover images;
-   question/content images;
-   respondent file uploads.

Requirements:

-   reuse current binding/config;
-   namespaced object keys;
-   non-colliding/non-guessable keys;
-   file size restrictions;
-   file type restrictions;
-   server-authorized upload flow;
-   cleanup when uploads are abandoned/deleted where feasible;
-   avoid exposing private respondent files as permanently public URLs;
-   authorized admin access for response attachments.

If the existing application already has signed/private access
conventions, reuse them.

------------------------------------------------------------------------

# 20. Admin --- Response Management

Each form should have a Responses area.

## 20.1 Overview

Show:

-   total valid submissions;
-   response trend;
-   latest submission;
-   first/last response dates;
-   completion metrics when reliably measurable;
-   summary by question where appropriate.

## 20.2 Individual response view

Admin can:

-   browse submissions;
-   search/filter where useful;
-   inspect a single response;
-   see submitted timestamp;
-   see respondent identity only if collected;
-   see the form version used;
-   view/download authorized uploaded files;
-   delete a response with confirmation;
-   optionally mark/internal-note a response if this fits the admin
    architecture.

## 20.3 Tabular view

Provide a spreadsheet-like responses table.

Features:

-   one row per submission;
-   question columns;
-   horizontal scrolling for large forms;
-   sorting/filtering where practical;
-   pagination/virtualization for scale;
-   link to full response detail.

## 20.4 Export

Support at least:

-   CSV export.

Recommended:

-   JSON export.

Export should use meaningful question headings while retaining stable
IDs where needed to disambiguate duplicate labels.

Exports must respect current admin authorization.

------------------------------------------------------------------------

# 21. Analytics

Analytics should be useful and type-aware rather than simply drawing a
chart for every answer.

## 21.1 Form-level analytics

Where data exists:

-   total responses;
-   responses over time;
-   response rate only when a valid denominator exists;
-   completion rate only if form-start events are intentionally tracked;
-   average completion time only if start/submission timestamps are
    collected appropriately;
-   abandonment by section only if instrumentation supports it.

Do not invent percentages from unavailable denominators.

## 21.2 Question-level analytics

### Single choice / dropdown

-   counts;
-   percentages;
-   bar/pie/donut visualization as appropriate.

### Multi-select

-   selection count per option;
-   percentage of respondents selecting each option.

### Numeric

-   count;
-   min;
-   max;
-   mean;
-   median;
-   distribution/histogram where useful.

### Rating/scale

-   average;
-   median;
-   distribution;
-   count.

### Text

-   response count;
-   searchable response list;
-   no misleading quantitative visualization by default.

### Date

-   distribution/timeline where meaningful.

### Grid

-   row/column distributions.

### File

-   number of submissions/files; no content analytics.

## 21.3 Filters

Recommended analytics filters:

-   date range;
-   form version;
-   answer-based filters for selected supported questions.

Analytics must remain performant with growing response counts.

For large datasets, aggregate server-side rather than downloading all
responses to the browser.

------------------------------------------------------------------------

# 22. Form Settings

Each form should have a settings area.

Possible settings:

### General

-   title;
-   slug/share identifier;
-   language/locale where supported;
-   status.

### Presentation

-   cover image;
-   theme behavior;
-   progress indicator;
-   question numbering;
-   compact/comfortable spacing if useful.

### Responses

-   accept responses;
-   response limit;
-   one response per user;
-   edit-after-submit policy;
-   confirmation message;
-   submit-another behavior;
-   response receipt behavior if future email infrastructure exists.

### Access

-   public;
-   login required;
-   identity collection.

### Schedule

-   opens at;
-   closes at.

### Data

-   retention behavior;
-   export;
-   deletion.

Do not add email delivery infrastructure solely for Forms unless the
repository already contains it or the user explicitly requests it.

------------------------------------------------------------------------

# 23. Editing Submitted Responses

Recommended feature:

Admin may configure whether respondents can edit a submitted response.

If implemented:

-   authenticated users can access their own editable response through
    secure authorization;
-   anonymous editing requires a secure unguessable edit token;
-   edits should preserve audit timestamps;
-   the system should define whether edits continue using the original
    form version or are migrated.

Safer default: edits remain bound to the original version unless
explicitly designed otherwise.

This feature can be deferred if it materially threatens the reliability
of the core release, but the data model should not make it impossible
later.

------------------------------------------------------------------------

# 24. Form Duplication

Admin can duplicate a form.

Duplication should:

-   copy current form structure/settings;
-   create new IDs;
-   create a new slug;
-   not copy responses;
-   not share question/option IDs if that would cause cross-form
    ambiguity;
-   copy referenced builder assets only according to the existing asset
    strategy.

------------------------------------------------------------------------

# 25. Preview Mode

Admin must be able to preview the form before publishing.

Preview should use the same renderer/rule engine as the real Forms app
wherever possible.

Preview should support:

-   desktop/mobile responsive view;
-   conditional behavior;
-   multi-page navigation;
-   validation.

Preview submissions must never appear as real production responses.

------------------------------------------------------------------------

# 26. Form Integrity Validation Before Publish

Publishing must be blocked for fatal configuration errors.

Check at minimum:

-   missing form title if title is required by product policy;
-   invalid question configuration;
-   missing options for choice questions;
-   invalid validation ranges;
-   broken rule references;
-   references to deleted options/questions;
-   invalid branch targets;
-   navigation cycles;
-   unreachable mandatory paths where detectable;
-   contradictory required/visibility logic;
-   unsafe redirect URLs;
-   invalid schedule;
-   invalid file-upload configuration.

Warnings may be allowed for non-fatal concerns.

------------------------------------------------------------------------

# 27. Validation and Security

All important validation must run server-side.

Client-side validation exists for UX, not trust.

Requirements:

-   validate request schemas;
-   validate form ID/version;
-   validate respondent access;
-   validate Firebase auth token using existing server-side mechanism;
-   validate submission limits;
-   validate question types;
-   validate requiredness after conditional evaluation;
-   reject malformed/oversized payloads;
-   validate upload ownership;
-   sanitize/escape user-authored display content;
-   prevent stored XSS;
-   use parameterized D1 queries;
-   enforce admin authorization;
-   rate-limit abuse-prone endpoints using existing infrastructure where
    available;
-   protect submission endpoints from obvious automated abuse;
-   never expose server secrets to client bundles;
-   never trust client-supplied respondent identity;
-   log operational errors without leaking sensitive response content.

If CAPTCHA/bot protection is not already present, structure the
submission pipeline so Cloudflare Turnstile or an equivalent can be
added cleanly. Add it now only if consistent with current project
requirements.

------------------------------------------------------------------------

# 28. Privacy and Data Handling

Forms may collect sensitive user-provided data, so implement
conservative defaults.

Requirements:

-   collect only configured identity fields;
-   provide clear respondent-facing indication when sign-in or identity
    collection is required;
-   admin deletion must actually remove or schedule removal of
    associated response data according to product policy;
-   deleting a submission should also handle its respondent-uploaded
    files;
-   deleting a form must require strong confirmation and define whether
    it is soft-deleted first;
-   avoid placing response content in logs;
-   do not expose response data through public APIs;
-   public form schema must not contain admin-only metadata/secrets.

Support a configurable privacy/consent text block rather than attempting
to generate legal language automatically.

------------------------------------------------------------------------

# 29. Accessibility

Target WCAG-friendly behavior and match existing accessibility
standards.

At minimum:

-   semantic form controls;
-   explicit labels;
-   keyboard navigation;
-   visible focus states;
-   screen-reader-friendly errors;
-   `aria` usage where needed;
-   errors associated with their controls;
-   accessible required indicators;
-   no color-only validation state;
-   accessible drag/reorder alternative in builder;
-   adequate contrast;
-   responsive text;
-   alt text support for meaningful images;
-   focus moves sensibly after page navigation and validation errors.

------------------------------------------------------------------------

# 30. Responsive Design

Both builder and respondent UI must work across:

-   mobile;
-   tablet;
-   desktop.

Respondent forms are especially important on mobile.

Avoid:

-   cropped dropdowns;
-   horizontal overflow except intentionally scrollable data tables;
-   controls hidden behind fixed navigation;
-   tiny tap targets;
-   modals larger than the viewport.

Use the existing responsive system rather than creating a parallel CSS
strategy.

------------------------------------------------------------------------

# 31. Design Requirements

The visual design should be:

-   clean;
-   modern;
-   restrained;
-   consistent with the current monorepo;
-   fast to understand;
-   appropriate for long forms.

Do not clone Google's visual design.

Reuse the product's existing visual language.

Builder UX should prioritize clarity over novelty.

Important states must be designed, not left as raw browser behavior:

-   loading;
-   empty;
-   success;
-   validation;
-   error;
-   offline/network failure where relevant;
-   closed form;
-   unpublished form;
-   authentication required;
-   upload progress;
-   autosave status.

------------------------------------------------------------------------

# 32. Performance

Requirements:

-   avoid loading response datasets unnecessarily;
-   paginate large response lists;
-   lazy-load heavy analytics where useful;
-   debounce autosave;
-   avoid excessive D1 queries;
-   batch operations where appropriate;
-   optimize images;
-   avoid rebuilding the entire form tree on every keystroke;
-   keep public form JS reasonable;
-   cache published form schemas where compatible with correctness;
-   invalidate cache on publish/close/settings changes.

The public form should remain usable on slower mobile connections.

------------------------------------------------------------------------

# 33. Reliability and Concurrency

Handle:

-   duplicate Submit clicks;
-   network retries;
-   stale builder writes;
-   expired authentication;
-   file upload failure;
-   partially uploaded files;
-   deleted/changed forms while respondent is completing them;
-   publication while another admin tab is editing;
-   D1 errors;
-   R2 errors.

Prefer explicit failure states over silent data loss.

A submission should never display success before persistence has
actually succeeded.

------------------------------------------------------------------------

# 34. Error Handling

Provide human-readable user messages and useful developer diagnostics.

Do not expose stack traces, database errors, internal object keys, or
secrets to respondents.

Builder failures should preserve unsaved local state where practical.

------------------------------------------------------------------------

# 35. Observability

Reuse existing logging/analytics infrastructure.

Recommended operational events:

-   form created;
-   form published;
-   form closed;
-   form viewed;
-   form started, only if intentionally instrumented;
-   form submitted;
-   submission failed;
-   file upload failed.

Avoid sending answer contents to generic product analytics.

Operational analytics and form-response data are separate concerns.

------------------------------------------------------------------------

# 36. API / Server Boundary

Follow the monorepo's existing API architecture.

Conceptually, the system needs operations equivalent to:

### Admin

-   list forms;
-   get form draft;
-   create form;
-   update draft;
-   publish;
-   close/reopen;
-   archive;
-   duplicate;
-   delete;
-   list submissions;
-   get submission;
-   delete submission;
-   export responses;
-   fetch analytics.

### Respondent

-   fetch published form;
-   authenticate when required;
-   upload authorized attachment;
-   submit response;
-   optionally save/resume draft;
-   optionally edit own response.

Do not expose admin operations merely because the respondent app and
admin app share types.

------------------------------------------------------------------------

# 37. Type Safety and Schema Validation

Prefer a single canonical schema definition shared between:

-   builder;
-   preview;
-   respondent renderer;
-   server submission validator;
-   analytics parser.

Use the repository's existing validation library if one exists.

Avoid maintaining separate manually synchronized TypeScript types and
runtime validators when the current stack allows deriving one from the
other.

------------------------------------------------------------------------

# 38. Example Form Schema

This is conceptual, not mandatory exact syntax:

``` json
{
  "id": "form_123",
  "version": 4,
  "title": "Event Registration",
  "subtitle": "Please complete the form",
  "description": "...",
  "coverImage": {
    "key": "forms/form_123/cover/abc",
    "alt": "..."
  },
  "settings": {
    "requiresAuth": false,
    "collectIdentity": false,
    "progress": "bar",
    "opensAt": null,
    "closesAt": null
  },
  "sections": [
    {
      "id": "section_1",
      "title": "Attendance",
      "blocks": [
        {
          "id": "q_attending",
          "kind": "question",
          "type": "single_choice",
          "label": "Will you attend?",
          "required": true,
          "options": [
            {"id": "yes", "label": "Yes"},
            {"id": "no", "label": "No"}
          ]
        },
        {
          "id": "q_guests",
          "kind": "question",
          "type": "number",
          "label": "Number of guests",
          "required": false
        }
      ]
    }
  ],
  "rules": [
    {
      "id": "rule_1",
      "when": {
        "all": [
          {
            "questionId": "q_attending",
            "operator": "equals",
            "value": "yes"
          }
        ]
      },
      "actions": [
        {"type": "show", "targetId": "q_guests"},
        {"type": "set_required", "targetId": "q_guests", "value": true}
      ]
    }
  ]
}
```

The final schema should match the repository's actual conventions and
should be validated at runtime.

------------------------------------------------------------------------

# 39. Analytics Data Integrity

Analytics must operate against the schema version used by each
submission.

If a question changes between versions:

-   historical answers must not be silently reinterpreted;
-   option IDs must remain meaningful within their version;
-   aggregate analytics may combine versions only when the question
    identity/semantics are demonstrably compatible;
-   otherwise allow filtering by version or clearly separate results.

Do not assume identical visible labels mean identical questions.

------------------------------------------------------------------------

# 40. Search and Filtering in Responses

For forms with many submissions, support useful server-side querying
where practical.

Potential filters:

-   submitted date range;
-   authenticated respondent;
-   selected option;
-   numeric range;
-   submission/version status.

Do not attempt generic full-text indexing across every response unless
actually needed.

------------------------------------------------------------------------

# 41. Form Templates --- Extensible Requirement

Architect form creation so templates can be introduced later.

Possible future templates:

-   registration;
-   feedback;
-   survey;
-   application;
-   RSVP;
-   contact;
-   quiz.

Templates should ultimately be ordinary form schemas, not a second form
system.

A template gallery is optional for the initial implementation unless it
can be added cheaply.

------------------------------------------------------------------------

# 42. Quiz / Scoring --- Future-Compatible

Google Forms supports quizzes. Even if not included in the first
release, avoid architectural choices that make these impossible:

-   correct answers;
-   point values;
-   automatic scoring;
-   manual grading;
-   answer feedback.

Do not implement a half-working grading system merely to claim feature
parity. Core Forms reliability has priority.

------------------------------------------------------------------------

# 43. Collaboration --- Future-Compatible

Do not build real-time collaborative editing unless the repository
already supports it.

However:

-   store `created_by` and `updated_by` where appropriate;
-   avoid schema choices that make multiple authorized admins
    impossible;
-   use optimistic concurrency/version checks to reduce accidental
    overwrite.

------------------------------------------------------------------------

# 44. Localization --- Future-Compatible

Keep user-facing strings centralized according to existing project
conventions.

Do not hard-code logic around English question text.

Dates, numbers, and validation should be locale-safe.

If the monorepo already supports i18n, Forms must integrate with it.

------------------------------------------------------------------------

# 45. Import / Export of Form Definitions

Recommended admin utility:

-   export a form definition as JSON;
-   import a validated compatible form definition.

If implemented, imported schemas must be validated and assigned safe new
IDs as required.

Never blindly execute or trust imported JSON.

This is lower priority than response CSV export.

------------------------------------------------------------------------

# 46. Keyboard and Power-User Builder UX

Recommended enhancements:

-   Enter/add-next-question behavior where sensible;
-   duplicate shortcut;
-   keyboard reordering;
-   command/add menu;
-   fast option entry;
-   paste newline-separated options into choice questions.

These should improve speed without making the UI obscure.

------------------------------------------------------------------------

# 47. Deletion and Referential Integrity

Define deletion behavior explicitly.

## Question deletion

Warn if referenced by conditional rules.

Remove or require resolution of dependent rules.

## Option deletion

Warn if referenced by logic.

## Section deletion

Warn if it contains questions or is a branch target.

## Form deletion

Prefer soft delete/trash first if compatible with current architecture.

## Response deletion

Remove related answers and handle associated R2 attachments.

Do not leave broken rule references silently.

------------------------------------------------------------------------

# 48. Testing Requirements

Use the repository's existing testing tools.

At minimum test:

## Unit tests

-   rule evaluation;
-   requiredness;
-   validation;
-   schema parsing;
-   branching;
-   answer normalization;
-   analytics calculations.

## Integration tests

-   create/edit/publish flow;
-   anonymous submission;
-   authenticated submission;
-   one-response restriction;
-   conditional requiredness;
-   section branching;
-   file upload authorization;
-   response retrieval;
-   export.

## End-to-end tests where existing infrastructure supports them

-   admin creates a form;
-   publishes it;
-   respondent completes it;
-   admin sees response and analytics.

Test both happy paths and failure paths.

------------------------------------------------------------------------

# 49. Important Edge Cases

Explicitly handle:

-   form with no questions;
-   form with only content;
-   required question hidden by logic;
-   user changes an earlier answer and invalidates later answers;
-   branch skips multiple pages;
-   all remaining sections become hidden;
-   option used by a rule is deleted;
-   branch target is deleted;
-   duplicate option labels;
-   duplicate question labels;
-   very long labels;
-   large option lists;
-   empty "Other" response;
-   zero as a valid number;
-   false as a valid boolean;
-   timezone boundaries;
-   closing time reached while form is open in browser;
-   response limit reached while respondent is filling form;
-   upload completes but submission fails;
-   submission succeeds but client loses connection before receiving
    response;
-   multiple browser tabs editing same draft;
-   admin publishes while another admin has an old draft;
-   respondent opens an old cached schema after a new version is
    published.

------------------------------------------------------------------------

# 50. Implementation Priorities

Implement in this order unless repository constraints strongly justify
another sequence.

## Phase 1 --- Foundation

-   repository inspection;
-   shared schema/types;
-   D1 migrations;
-   R2 integration reuse;
-   form CRUD;
-   versioning;
-   basic builder;
-   published renderer.

## Phase 2 --- Core questions

-   text;
-   choice;
-   number;
-   date/time;
-   rating/scale;
-   validation;
-   required questions;
-   pages/sections.

## Phase 3 --- Logic

-   visibility;
-   conditional requiredness;
-   branching;
-   integrity validation.

## Phase 4 --- Responses

-   anonymous submission;
-   Firebase-authenticated submission;
-   limits;
-   response admin;
-   CSV export.

## Phase 5 --- Files and advanced questions

-   R2 respondent uploads;
-   grids;
-   additional question types.

## Phase 6 --- Analytics

-   overview;
-   question summaries;
-   charts;
-   filters/version handling.

## Phase 7 --- Hardening

-   accessibility;
-   mobile;
-   rate limiting;
-   concurrency;
-   performance;
-   edge cases;
-   test coverage;
-   polish.

This sequencing is not permission to leave the final requested
implementation incomplete. It is an execution order for reducing risk.

------------------------------------------------------------------------

# 51. Definition of Done

The feature is not complete merely because the builder renders.

It is complete when:

-   Forms is integrated into the monorepo.
-   Existing apps still work.
-   Existing Firebase authentication is reused.
-   Existing D1/R2 infrastructure is reused.
-   Admin can create multiple forms.
-   Admin can edit and autosave drafts.
-   Admin can add/reorder/delete pages, content, questions, and options.
-   Required and optional questions work.
-   Conditional visibility works.
-   Conditional requiredness works.
-   Conditional page/section branching works.
-   All supported question types validate correctly.
-   Admin can preview before publishing.
-   Admin can publish safely.
-   Public Forms app renders published forms.
-   Anonymous forms work.
-   Login-required forms use existing Firebase auth.
-   Submissions are server-validated.
-   Historical submissions are tied to form versions.
-   Submission limits/schedules are server-enforced.
-   R2 file/image behavior is secure and functional.
-   Admin can browse individual and tabular responses.
-   Admin can export CSV.
-   Admin can see correct type-aware analytics.
-   Multiple active and historical forms are manageable.
-   Forms can be closed and archived.
-   Responsive behavior is polished.
-   Accessibility fundamentals are implemented.
-   Loading/error/empty states are implemented.
-   No known broken conditional references are publishable.
-   No respondent answer data is exposed publicly.
-   Core flows have automated tests.
-   Build, lint, typecheck, migrations, and tests pass according to repo
    conventions.

------------------------------------------------------------------------

# 52. Instructions to the Implementation AI

Follow these instructions throughout implementation.

1.  **Inspect first, code second.** Read the monorepo structure and
    relevant existing implementations before creating files.
2.  **Reuse before building.** Search for existing Firebase, D1, R2, UI,
    validation, API, auth, and deployment utilities before creating
    equivalents.
3.  **Do not rewrite working unrelated code.**
4.  **Do not introduce a new stack for Forms.**
5.  **Use the same design system and coding conventions as the existing
    applications.**
6.  **Keep admin authoring separate from public/respondent rendering.**
7.  **Use one shared form schema and rule evaluator wherever possible.**
8.  **Treat the server as authoritative for validation, authentication,
    authorization, limits, and conditional requiredness.**
9.  **Version published forms. Never let later edits corrupt the meaning
    of historical submissions.**
10. **Use stable IDs, never labels, for internal references.**
11. **Use migrations for D1 changes.**
12. **Use existing R2 bindings and upload conventions.**
13. **Use existing Firebase login flows instead of implementing OAuth
    again.**
14. **Do not expose admin metadata or secrets in public form payloads.**
15. **Do not log response content unnecessarily.**
16. **Do not declare completion while core flows are placeholders,
    mocked, TODOs, or disconnected UI.**
17. **Do not silently drop requested functionality. If a requirement
    conflicts with the existing architecture, implement the closest
    robust solution and document the exact reason.**
18. **Prefer simple, maintainable code over speculative abstraction.**
19. **Run the repository's formatter, linter, type checker, tests, and
    build after implementation.**
20. **Fix failures introduced by this work.**
21. **Test the complete journey:** Admin creates → configures logic →
    previews → publishes → respondent completes → submission persists →
    Admin sees response → analytics/export reflect it.
22. **Check mobile layouts, especially dropdowns, conditional content,
    grids, file uploads, and admin dialogs.**
23. **Before finishing, search for TODO/FIXME/mock/placeholder code
    introduced by this feature and resolve it unless intentionally
    documented.**
24. **Provide a concise final implementation report** containing:
    -   files/modules added or materially changed;
    -   D1 migrations;
    -   new routes;
    -   reused Firebase/D1/R2/shared components;
    -   implemented question types;
    -   conditional logic behavior;
    -   security/validation behavior;
    -   tests run and their results;
    -   any intentionally deferred optional/future-compatible features.

------------------------------------------------------------------------

# 53. Final Product Principle

The Forms feature should behave as a **native extension of the existing
monorepo**.

The desired result is not a visual Google Forms clone. It is a robust
form platform with:

-   a fast admin builder;
-   flexible question types;
-   strong conditional logic;
-   multi-page workflows;
-   reliable versioned submissions;
-   existing Firebase identity integration;
-   D1 persistence;
-   R2 assets/uploads;
-   useful response management;
-   meaningful analytics;
-   modern responsive UX;
-   strong validation and security;
-   clean compatibility with future features.

When choosing between a clever implementation and a predictable,
maintainable implementation that fits the existing repository, choose
the latter.
