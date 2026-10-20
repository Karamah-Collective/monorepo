# Form → Google Sheets Integration Setup

This guide walks you through connecting the **Suggest a Place** and **Suggest Edit** forms to your Google Sheet, with reCAPTCHA v3 spam protection, hosted on Cloudflare Pages.

---

## Architecture

```
User fills form
      ↓
reCAPTCHA v3 token generated in browser
      ↓
POST /api/submit  (Cloudflare Pages Function)
      ├─ verifies reCAPTCHA token with Google (server-side, using your SECRET key)
      └─ if score ≥ 0.5 → forwards data to Google Apps Script
                                    ↓
                          appends row to Google Sheet
```

Your **secret key** never leaves the server (Cloudflare) — the browser only ever sees the public site key.

---

## Step 1 – Prepare your Google Sheet

Open your sheet:  
`https://docs.google.com/spreadsheets/d/1rixpqkzB-msw_whxJpPXIb4Y75o3h9_G_AgWoTYT2jA`

### Sheet "New" — add these headers in row 1:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Timestamp | Name | Type | Address | Tags | Google Maps Link | Notes | reCAPTCHA Score |

### Sheet "Edit" — add these headers in row 1:

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Timestamp | **Place ID** | Name | Type | Address | Tags | Google Maps Link | Notes | reCAPTCHA Score |

> **Yes, the Edit sheet needs one extra column — "Place ID"** (column B). This tells you which listing the person is editing. The code already sends it.

**Important:** the sheet tab names must be exactly `New` and `Edit` (capital first letter, nothing else).

---

## Step 2 – Deploy the Google Apps Script

1. In your Google Sheet, click **Extensions → Apps Script**.
2. Delete any existing code in the editor.
3. Open the file `apps-script/Code.gs` from this repository and paste its entire contents into the Apps Script editor.
4. Click **Save** (disk icon or Ctrl+S).
5. Click **Deploy → New deployment**.
6. Click the gear icon next to "Type" and choose **Web app**.
7. Fill in:
   - **Description:** `Halal Finder form receiver` (or anything you like)
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
8. Click **Deploy**.
9. Google will ask you to authorise the script — click **Authorise access**, choose your Google account, and click **Allow**.
10. Copy the **Web app URL** — it looks like:
    ```
    https://script.google.com/macros/s/AKfycb…long-string…/exec
    ```
    You will need this in Step 3.

> **Every time you edit the Apps Script code you must create a new deployment** (Deploy → New deployment) — re-deploying an old version won't pick up changes.

---

## Step 3 – Add Environment Variables in Cloudflare Pages

Go to your Cloudflare Pages project → **Settings → Environment Variables** and add:

| Variable name | Value | Encrypt? |
|---|---|---|
| `RECAPTCHA_SECRET` | `6LchtVwsAAAAAIQalHIXTHzn7SoEj1yxX_glFNkg` | ✅ Yes |
| `GAS_URL` | *(the Web App URL you copied in Step 2)* | ✅ Yes |

Set these for **both** Production and Preview environments.

> The reCAPTCHA **site key** (`6LchtVwsAAAAAJDkdwYAom8tH6ttppAG2SX_bw2v`) is already hardcoded in `src/app.js` — that is correct and safe; site keys are always public.

---

## Step 4 – Deploy to Cloudflare Pages

Push this repository to GitHub, then trigger a new Cloudflare Pages build:

```bash
git add .
git commit -m "Add Google Sheets form integration"
git push
```

Cloudflare will detect the `functions/` directory automatically and deploy `/api/submit` as a Pages Function — no extra configuration needed.

---

## Step 5 – Test it

1. Open your deployed site (not localhost — reCAPTCHA requires a real domain).
2. Open **Suggest a Place**, fill in at least the required fields, and submit.
3. Open your Google Sheet → **New** tab. A new row should appear within a few seconds.
4. Open a place popup, tap the edit button, fill in the form, and submit.
5. Check the **Edit** tab of the sheet.

### Quick API test (curl)

You can test the function directly:

```bash
# Expected: {"error":"Missing reCAPTCHA token"}
curl -X POST https://YOUR-PAGES-DOMAIN.pages.dev/api/submit \
  -H "Content-Type: application/json" \
  -d '{"formType":"new","name":"Test"}'
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Toast: "Submission failed: Server misconfiguration: GAS_URL not set" | Env var missing in CF | Add `GAS_URL` in CF Pages → Settings → Environment variables, then redeploy |
| Toast: "Submission failed: Server misconfiguration: RECAPTCHA_SECRET not set" | Env var missing | Same as above for `RECAPTCHA_SECRET` |
| Toast: "reCAPTCHA failed" | Wrong secret key or domain not in reCAPTCHA console | Check secret key; add domain at https://www.google.com/recaptcha/admin |
| Toast: "Low reCAPTCHA score" | VPN, Tor, or bot-like behaviour | Score threshold is 0.5 in `functions/api/submit.js` — lower `MIN_SCORE` if real users are blocked |
| Sheet not updating | GAS not deployed as "Anyone" | Re-deploy with "Who has access: Anyone" |
| Sheet not updating | Wrong sheet tab name | Tabs must be named exactly `New` and `Edit` |
| "Sheet not found" error in GAS logs | See above | — |
| reCAPTCHA badge missing | reCAPTCHA script blocked by browser extension | Normal — score still works; badge is cosmetic |

---

## Files Changed / Created

| File | What it does |
|---|---|
| `apps-script/Code.gs` | Google Apps Script — paste into the Sheet's Script editor |
| `functions/api/submit.js` | Cloudflare Pages Function — verifies reCAPTCHA, forwards to GAS |
| `index.html` | Added reCAPTCHA v3 library `<script>` tag |
| `src/app.js` | Both form submit handlers now POST to `/api/submit` instead of opening GitHub |
