# Testing Bypasses — MUST revert before deploying

> **Check every item below before any production deploy.**
> Each entry lists the file, line reference, current (testing) value,
> and the production value to restore.

---

## 1. Email sending skipped

- **File:** `scripts/apps-script/Code.gs` → `handleSendOTP()`
- **What:** The entire email-sending block (GmailApp.sendEmail) is commented out.
  OTP is still generated and stored in the spreadsheet, but no email is sent.
  The function returns `{ status: 'sent' }` immediately.
- **Restore:** Uncomment the `try { … GmailApp.sendEmail … } catch` block
  and remove the `/* … */` wrapper + the "TESTING BYPASS" comment.

## 2. Rate limits raised

- **File:** `scripts/apps-script/Code.gs` — top-level constants
- **Current (testing):**
  ```js
  var OTP_RATE_PER_EMAIL_HOUR = 50;  // TODO: restore to 3 after testing
  var OTP_RATE_PER_IP_HOUR = 100;    // TODO: restore to 10 after testing
  ```
- **Restore to:**
  ```js
  var OTP_RATE_PER_EMAIL_HOUR = 3;
  var OTP_RATE_PER_IP_HOUR = 10;
  ```

## 3. Debug info in error responses

- **File:** `scripts/apps-script/Code.gs` → `handleSendOTP()` catch block
- **Current:** `{ error: 'email_send_failed', debug: err.message || String(err) }`
- **Restore:** Remove `debug` field → `{ error: 'email_send_failed' }`

## 4. Test helper function present

- **File:** `scripts/apps-script/Code.gs` → `testSendEmail()` (near top of file)
- **What:** Sends a test email to `moontasirsoumik@gmail.com`. Only needed for
  initial OAuth scope authorization.
- **Restore:** Delete the entire `testSendEmail()` function.

## 5. Client-side localhost OTP bypass

- **File:** `src/reviews.js` → `_sendOTP()` and `_verifyOTP()`
- **What:** On `localhost` / `127.0.0.1`, both functions skip the `/api/reviews`
  network call entirely. `_sendOTP` returns instant success (no email sent).
  `_verifyOTP` accepts any 6 digits and stores a fake token (7-day expiry).
- **Restore:** Remove the `if (location.hostname === "localhost" ...)` blocks
  from both functions.

---

*Last updated: 2026-05-15*
