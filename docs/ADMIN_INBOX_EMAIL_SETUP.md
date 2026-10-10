# Admin inbox email setup

## Gmail connection for Manarah

The Manarah mailbox can connect directly to Gmail. This is the preferred path
for receiving and sending from `manarah@karamahcollective.com`; it does not
require Google Workspace administrator access because the mailbox owner grants
the OAuth consent.

Apply `Maps/migrations/0036_gmail_connections.sql` and
`Maps/migrations/0039_personal_gmail_connections.sql` to both the production
and Preview Maps D1 databases. Add these values to the Maps Pages project:

| Name | Type | Value |
| --- | --- | --- |
| `GMAIL_CLIENT_ID` | variable | The Google OAuth web-client ID |
| `GMAIL_CLIENT_SECRET` | secret | The Google OAuth web-client secret |
| `GMAIL_OAUTH_REDIRECT_URI` | variable or secret | `https://maps.karamahcollective.com/api/gmail/oauth/callback` |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | secret | A 32-byte key encoded as hex or base64 |

The OAuth client must contain the exact redirect URI above. For local testing,
also add `http://127.0.0.1:8788/api/gmail/oauth/callback` and use that local
URI for `GMAIL_OAUTH_REDIRECT_URI` in local variables. Keep the client secret,
refresh token, and encryption key out of the Admin build and browser code.

After deployment, only `moontasir@karamahcollective.com` can open the OAuth
connection from **Workspace → Admin preferences**. That account selects
**Connect Gmail**, signs in as `manarah@karamahcollective.com`, and approves
the Gmail read/send scopes. The callback stores only an encrypted refresh token
in D1. Other authorized Admin members cannot start or disconnect OAuth, but can
use the mailbox through the Admin inbox according to their roles. **Sync now**
imports the mailbox; outbound messages from Manarah use Gmail after connection.

The current implementation refreshes Gmail when an authorized member opens the
Inbox, at most once every two minutes, and also exposes **Sync now** for an
Administrator. It does not replace the mailbox's normal Gmail delivery.

The admin inbox sends email through Brevo from two verified Google Workspace addresses:

- `contact@karamahcollective.com` for the website, Forms, Links, and general enquiries.
- `manarah@karamahcollective.com` for Manarah enquiries.

## Outbound sending, available now

1. In Brevo, open **Senders, Domains & Dedicated IPs**.
2. Verify `karamahcollective.com`, or verify both addresses individually. This authenticates Brevo as a sender; it does not replace Google Workspace MX records.
3. Ensure the Maps Cloudflare Pages project has a valid `BREVO_API_KEY` secret. It must be a Brevo HTTP API key, not an SMTP password.
4. Deploy the Admin and Maps projects. Open **Communications → Inbox**, create a new email, choose either mailbox, and send a test to yourself.

## Receiving ordinary email, required later

Brevo's transactional API sends email but does not host an inbound mailbox. Keep Google Workspace as the real mailbox provider and use an inbound parser/relay to copy messages into the admin panel.

1. Create a strong random value for `INBOX_INGEST_SECRET`.
2. Add it as a secret in the Maps Cloudflare Pages project.
3. Add the same secret to the Website Pages project. This allows the website contact form to mirror to the admin inbox.
4. Configure the inbound provider/worker to POST each parsed incoming message to:

   `https://maps.karamahcollective.com/api/inbox-webhook`

5. Set the request header:

   `X-Inbox-Secret: <the INBOX_INGEST_SECRET value>`

6. Map the parsed email into this JSON shape:

   ```json
   {
     "from": { "name": "Sender name", "email": "sender@example.com" },
     "mailbox": "contact@karamahcollective.com",
     "subject": "Message subject",
     "textBody": "Plain text message",
     "htmlBody": "<p>Optional safe HTML</p>",
     "messageId": "provider-message-id",
     "receivedAt": "2026-10-09T12:00:00.000Z"
   }
   ```

Use `manarah@karamahcollective.com` in `mailbox` for Manarah email. Incoming mail received at either address will then appear in the shared inbox, with the reply-from address restricted by the member's mailbox permissions.

## Google Workspace receiving flow

1. Keep Google Workspace's MX records in DNS so Gmail remains the real mailbox.
2. Create an inbound parser destination with your chosen provider. It must accept mail for both addresses and POST the JSON above to `/api/inbox-webhook` with the `X-Inbox-Secret` header.
3. In Google Admin Console, create a Gmail routing rule for `contact@karamahcollective.com` and `manarah@karamahcollective.com` that keeps the original delivery and also routes a copy to the parser destination. If the panel should be the only destination, choose routing instead of dual delivery—but that removes the message from Gmail.
4. Set the same random value as `INBOX_INGEST_SECRET` on the Maps Pages project and in the parser webhook configuration.

The parser must preserve the destination mailbox in `mailbox` or `to.email`; otherwise the panel cannot apply the correct role boundary.

## Mailbox-scoped roles

Apply `Maps/migrations/0040_hafsa_contact_access.sql` to the production and
Preview Maps D1 databases. This seeds Hafsa's Contact mailbox role:
`hafsa@karamahcollective.com` receives read and manage access to
`contact@karamahcollective.com`, while Manarah remains separate.

Create custom roles in Admin → Roles & access with these grants:

- `Contact inbox — Read` = `inbox.contact.read`
- `Contact inbox — Manage` = `inbox.contact.write`
- `Manarah inbox — Read` = `inbox.manarah.read`
- `Manarah inbox — Manage` = `inbox.manarah.write`

Manage includes read, reply/send, status changes, and internal notes. A member with only the Manarah grants cannot list, open, manage, or send from the Contact inbox. The restriction is enforced by the API as well as the interface.
