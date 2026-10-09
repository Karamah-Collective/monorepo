# Admin inbox email setup

The admin inbox sends email through Brevo from two verified addresses:

- `contact@karamahcollective.com` for the website, Forms, Links, and general enquiries.
- `maps@karamahcollective.com` for Manarah Maps enquiries.

## Outbound sending, available now

1. In Brevo, open **Senders, Domains & Dedicated IPs**.
2. Verify `karamahcollective.com`, or verify both addresses individually.
3. Ensure the Maps Cloudflare Pages project has a valid `BREVO_API_KEY` secret. It must be a Brevo HTTP API key, not an SMTP password.
4. Deploy the Admin and Maps projects. Open **Communications → Inbox**, create a new email, choose either mailbox, and send a test to yourself.

## Receiving ordinary email, required later

Brevo's transactional API sends email but does not host an inbound mailbox. Keep Brevo for sending, then use an inbound mail provider or Cloudflare Email Worker to receive mail for the domain and post it to the inbox webhook.

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

Use `maps@karamahcollective.com` in `mailbox` for Map email. Incoming mail received at either address will then appear in the shared inbox, with the correct reply-from address selected automatically.
