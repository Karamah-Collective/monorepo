# Admin inbox design audit

Reviewed and corrected on 9 October 2026. Scope: `/contacts`, its conversation
list, reader, reply/note composer, and new-email form. Direction follows
`Admin/DESIGN.md`: compact Geist typography, existing Admin theme tokens, quiet
boundaries, and clear operational actions.

## Findings and fixes

| Severity | Finding | Correction |
| --- | --- | --- |
| Critical | Route flex direction placed the page eyebrow beside the inbox. The pane was only 9 px wide in the 390 px phone capture. | Stack route content vertically; give the inbox the full available width. |
| High | Broad message-header styles turned the actions into a vertical grid. | Explicit sender and action classes; grid for metadata and flex for actions. |
| High | Sender identity was hidden in a narrow, transparent select attached to Send. | A labeled, visible From selector separate from the Send action. |
| High | Phone layout stacked a full mailbox above a second full reader. | List-to-reader navigation with a back button and keyboard focus restoration. Long conversations scroll to the reply area. |
| Medium | Pane headers, message bodies, and composers used unrelated edges and spacing. | Aligned 80 px desktop headers, shared reader edges, and a 4/8/12/16/24 px spacing rhythm. |
| Medium | Duplicate link/attachment buttons, date/smiley shortcuts, and nonfunctional star/more controls added noise. | One formatting toolbar, one attachment control, clear draft, and Send. Remove nonfunctional controls. |
| Medium | Attachment tiles consumed space with decorative thumbnails. | Compact filename/size rows with a neutral file icon. |
| Medium | Cc/Bcc fields were always shown, and New email appeared twice. | Optional Cc/Bcc disclosure and a single compose heading. |
| Medium | Development samples mixed with real conversations, producing duplicate entries. | Samples appear only for an empty, successful development inbox; never mix with API threads. |
| Medium | Failed requests looked like empty inboxes; status controls lacked accessible names. | Explicit retry states, named status selector, pressed filter/reply states, and textual unread indication. |

## Verification

- Admin production build.
- Existing API interaction test: reply, internal note, close conversation, new
  email; corrected its stale single-recipient expectation to match the existing
  backend's recipient array and verified Cc/Bcc payloads.
- Inbox layout checks at 360, 834, and 1440 px: usable pane bounds, aligned desktop
  headers, mobile list/reader visibility and focus, visible sender identity, one
  attachment action, compose cancellation, and no shell overflow.
- Existing route checks at 360, 390, 834, and 1440 px passed without runtime errors.
- Local browser captures of light/dark modes, conversation, attachments, and
  composition at desktop, tablet, and phone sizes in `test-results/`.

Browser checks use local fixtures. Production authentication, email delivery,
and attachment downloads were not exercised. Attachment entries remain metadata
because the existing reader has no download action or file URL.
