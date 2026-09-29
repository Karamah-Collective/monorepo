# Cloudflare Turnstile setup

Create one managed Turnstile widget in Cloudflare and add every production and
preview hostname that uses it: `karamahcollective.com`, `maps.karamahcollective.com`,
`forms.karamahcollective.com`, and the Links hostname. A single widget can have
multiple hostnames, so its public site key and secret key can be shared by
these Pages projects.

In each Cloudflare Pages project, add these production environment variables:

| Project | Public variable | Secret |
| --- | --- | --- |
| Website | `TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` |
| Maps | `TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` |
| Forms | `TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` |
| Links | `TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` |

Do not put `TURNSTILE_SECRET_KEY` in source control or in a client-side
configuration endpoint. The public key is expected to be visible in the
browser. Add the equivalent preview variables before testing Pages preview
URLs; their hostnames must also be allowed by the widget.

For Maps local development only, set `DEV_SKIP_TURNSTILE=true` in the local
Pages environment. Never configure that value in preview or production.

Redeploy all four apps after setting the variables. Test one contact form,
one Maps submission, one Forms response, and one Links redirect. Turnstile is
configured as invisible and runs only when the protected action is requested;
Cloudflare may show its own accessible challenge when it detects risk.
