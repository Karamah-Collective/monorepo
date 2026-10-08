# Operations guide

This guide explains how to operate the Karamah Collective platform after it is deployed: what to monitor, where to look first, how health data reaches Admin, which configuration belongs in which project, and how to respond without making a rushed change that expands an incident.

It complements the exact Cloudflare setup instructions in [DEPLOYMENT.md](../DEPLOYMENT.md) and the implementation detail in [Uptime monitoring](UPTIME_MONITORING.md).

## 1. Operational model

Every product is an independent Cloudflare Pages deployment. This gives each app an independent availability signal, function runtime, build, and binding configuration. It also means an outage should be diagnosed at the application boundary first rather than assuming a failure in one project explains another.

| Service | Public domain | Operational owner surface | Primary dependencies |
| --- | --- | --- | --- |
| Manarah | `maps.karamahcollective.com` | Admin → Analytics & Health; Maps Admin API | Maps Pages, shared D1, Maps R2, map/provider integrations |
| Website | `karamahcollective.com` | Admin Website areas; Website API | Website Pages, shared D1, contact/content integrations |
| Links | `links.karamahcollective.com` | Admin Link hub; Links API | Links Pages, shared D1 |
| Forms | `forms.karamahcollective.com` | Admin Forms and Analytics & Health | Forms Pages, Forms D1, Forms R2 |
| Admin | `admin.karamahcollective.com` | Firebase/Auth and owner APIs | Admin Pages, Firebase, Maps/Website/Forms APIs |

## 2. Health checks and UptimeRobot

Manarah and Forms provide health endpoints specifically for monitoring. They are small, unauthenticated, and do not disclose implementation detail.

| Monitor | URL | What it establishes |
| --- | --- | --- |
| Manarah application | `https://maps.karamahcollective.com/api/health` | Maps Pages Function runtime responds. |
| Manarah database | `https://maps.karamahcollective.com/api/health/db` | Runtime responds and the Maps D1 binding can complete a minimal query. |
| Forms application | `https://forms.karamahcollective.com/api/health` | Forms Pages Function runtime responds. |
| Forms database | `https://forms.karamahcollective.com/api/health/db` | Runtime responds and the Forms D1 binding can complete a minimal query. |

Each health endpoint accepts `GET` and `HEAD` only. GET returns concise JSON with a status, service name, and timestamp. HEAD performs the same relevant validation but deliberately returns no body. A healthy check is `200`; a dependency/runtime failure is a generic `5xx`. Unsupported methods remain unsupported.

Health endpoints are not diagnostic APIs. They must never reveal a SQL error, D1 schema, environment variable, secret, stack trace, provider token, account identifier, or internal topology.

### UptimeRobot monitor naming

Maintain the names that the Maps server-side integration expects:

* `Manarah`
* `Manarah API`
* `Manarah D1`
* `Forms`
* `Forms API`
* `Forms D1`

Those names are a contract used to group monitors into the two product cards. If a monitor must be renamed, update the mapping in `Maps/functions/_uptimerobot.js` in the same reviewed release. A missing/mismatched name should appear as unknown/missing monitor data, not silently be attributed to another component.

### How health reaches Admin

```text
Admin browser
  -> authenticated Maps Admin API request
     -> Maps server-side UptimeRobot client
        -> UptimeRobot v3 API
     <- sanitized, cached health payload
<- displays System Health inside Analytics
```

The browser does not call UptimeRobot and never receives its API key. Maps caches the UptimeRobot response server-side for approximately three minutes (D1 cache when available with in-memory fallback), which reduces rate-limit pressure and keeps a provider blip from making every Admin render fail.

The System Health component uses a fixed 24-hour availability window for component bars and response-time display so the visual comparison has stable meaning. The Analytics page range selector is used for the clearly labelled incident-history period; it does not pretend to rewrite the 24-hour availability bars. UptimeRobot may not expose every UI metric or per-check histogram through the API; Admin should show only supplied/safely-derived data.

### Required secret

`UPTIMEROBOT_API_KEY` is configured as a Cloudflare secret in the **Maps Pages project**. It may also be present in ignored `Maps/.dev.vars` for local development. It is not a frontend variable, and configuring it in Admin/Forms is unnecessary for this integration because those projects do not make the UptimeRobot request.

## 3. Monitoring routine

### Daily/regular review

1. Open Admin → Analytics & Health.
2. Confirm Manarah and Forms application status, component states, 24-hour availability, and response time where the provider supplies it.
3. Review the selected-range incident history for recurring or unresolved failures.
4. Check the weekly Manarah report recipient/settings area if scheduled reports are expected.
5. Review relevant queues in Admin: new place submissions, edits, reviews, contacts, wishes, or Forms response workflows.

### When a monitor is down

Use the monitor component to narrow scope:

| Signal | First hypothesis | First safe check |
| --- | --- | --- |
| Web down; API/D1 unknown or down | Pages deployment, route/runtime, domain/DNS, broad edge issue | Load public site and `/api/health`; inspect Cloudflare deployment/status. |
| API down; Web up | Pages Function route/deploy/runtime/config issue | Load public UI then `/api/health`; inspect function changes and bindings. |
| D1 down; Web/API up | D1 binding/query/database issue | Call `/api/health/db`; verify project binding/environment and recent migrations. |
| Admin says provider unavailable | UptimeRobot key, API outage, rate limit, timeout, malformed response | Check Admin notice and provider dashboard; do not expose key or bypass server cache. |
| One app only | App-specific deployment/binding/data | Use that app’s Pages project and owner API logs/configuration. |

Do not infer that an “Operational” web check proves every user feature works; it establishes only the monitored path. Use product smoke tests for critical workflows.

## 4. Incident response sequence

1. **Stabilize understanding.** Record start time, affected product/component, monitor evidence, and customer impact. Avoid changing multiple unrelated variables.
2. **Confirm externally.** Use the public health endpoint or actual user flow from a normal browser. Check Cloudflare Pages deployment state and status information.
3. **Find the owning boundary.** Static asset/domain, Pages Function, Firebase/authorization, D1/R2 binding, third-party provider, or Admin display integration.
4. **Protect data.** Do not run speculative write queries, migrations, or cleanup scripts in production during diagnosis.
5. **Mitigate narrowly.** Roll forward with a reviewed fix, correct a known binding/configuration issue, or use documented provider recovery. Keep source changes on `main`; do not hand-edit `deploy`.
6. **Verify recovery.** Confirm the actual user flow and corresponding health/API signal. Remember UptimeRobot and server caches have check intervals.
7. **Document follow-up.** Capture root cause, fix, monitoring gap, and any needed documentation/test change.

## 5. Deployment and configuration ownership

Cloudflare dashboard configuration is part of the system. Keep this ownership model clear:

| Concern | Owner/location |
| --- | --- |
| Source and reviewed changes | `main` branch |
| Generated production/preview trees | deploy agent → `deploy` / `preview` |
| Pages project root/build/output | Cloudflare project configuration; documented in `DEPLOYMENT.md` |
| Production/Preview D1 and R2 bindings | Cloudflare Pages project bindings |
| Server secrets | Cloudflare Pages secrets for the owning app |
| Public build origins/config | explicit app environment/build configuration |
| Local development binding defaults | app `wrangler.toml` and ignored local vars |

After changing a secret or binding, redeploy the owning Pages project. Configuration does not retroactively change a function bundle already running with an old deployment context.

## 6. Backups and retention

The repository includes `.github/workflows/daily-d1-backup.yml`, intended to export the production shared and Forms databases to the private `karamah-database-backups` R2 bucket. The documented retention policy is daily for seven days, weekly for one month, and monthly for three months. D1 Time Travel is the first recovery option for recent accidental changes; R2 exports are the longer-retention recovery layer.

Do not treat a backup as permission to perform unsafe destructive work. Verify that backups are actually succeeding, access is restricted, and restore steps are rehearsed/documented before relying on them during an incident.

## 7. Operational security

* Rotate a compromised provider key in its owning project, update local developer values only where necessary, redeploy, and revoke the old value.
* Never paste secrets into GitHub issues, commit messages, screenshots, client logs, or browser variables.
* Investigate access issues using server responses and current role data; do not add a temporary frontend bypass.
* Keep Preview and Production isolated. A preview smoke test must not create a real respondent record, email, or production media object.
* Treat Forms submissions and uploads as sensitive. Use authorized Admin workflows, not raw public endpoints, to inspect private data.

## 8. Manual verification checklist

After a normal production release, choose applicable checks:

- [ ] The relevant Cloudflare Pages deployment completed for the intended generated branch.
- [ ] Public application loads at its production domain.
- [ ] A changed public workflow works without browser console/network errors.
- [ ] Admin signs in and reaches the affected authorized area.
- [ ] The owner API rejects an unauthorized request where practical to verify.
- [ ] Health endpoint GET and HEAD return expected status when health changed.
- [ ] Any required migration/binding/secret was applied to the correct environment.
- [ ] UptimeRobot records a subsequent successful check, allowing for interval/cache delay.
- [ ] No secret or private record was exposed during testing.

For exact deploy commands use [Development and release](DEVELOPMENT_AND_RELEASE.md) and [DEPLOYMENT.md](../DEPLOYMENT.md).
