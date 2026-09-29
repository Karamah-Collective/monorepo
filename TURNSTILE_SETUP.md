# Cloudflare Turnstile setup

The existing managed widget uses public site key `0x4AAAAAAFIwqiUGSK74cVm5`.
Add every production and preview hostname to that widget: `karamahcollective.com`,
`maps.karamahcollective.com`, `forms.karamahcollective.com`, and the Links
hostname. A single widget can have multiple hostnames, so its public site key
and secret key can be shared by these Pages projects.

In each Cloudflare Pages project, add these production environment variables:

| Project | Public variable | Secret |
| --- | --- | --- |
| Website | `TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` |
| Maps | `TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` |
| Forms | `TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` |
| Links | `TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` |

Do not put `TURNSTILE_SECRET_KEY` in source control or in a client-side
configuration endpoint. Retrieve the existing widget secret from Cloudflare's
dashboard and add it as a Pages secret in each project; it must never be pasted
into chat or committed. The public key is already shipped as a safe fallback.
Add the equivalent preview variables before testing Pages preview URLs; their
hostnames must also be allowed by the widget.

For Maps local development only, set `DEV_SKIP_TURNSTILE=true` in the local
Pages environment. Never configure that value in preview or production.

Redeploy all four apps after setting the secret. Test one Website contact form,
one Maps contact/place/event/wish action, one Forms response, and one Links
redirect. Turnstile runs only when the protected action is requested; Cloudflare
may show its accessible managed challenge when it detects risk.
