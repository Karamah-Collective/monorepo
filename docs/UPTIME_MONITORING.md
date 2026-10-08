# UptimeRobot monitoring in Karamah Admin

The Admin **System Health** page and dashboard widget read UptimeRobot through
the existing authenticated Admin route:

```text
Admin browser -> Website /api/admin proxy -> Maps /api/admin -> UptimeRobot v3
```

Firebase ID-token verification and the existing `dashboard.view` permission are
required before the Maps Pages Function calls UptimeRobot. The API token is
never included in an Admin response, client bundle, or browser request.

## Configuration

Add this as a **secret** (not a plaintext variable) to the **Maps Cloudflare
Pages project**, in both Production and Preview if both environments should
show monitoring:

```text
UPTIMEROBOT_API_KEY=<UptimeRobot v3 read-only API token>
```

Use a read-only token from UptimeRobot Integrations -> API. The v3 API expects
it in the server-only `Authorization: Bearer` request header.

For local Admin testing, place the same value in `Maps/.dev.vars`, then run
`npm run dev:admin`, sign in at `http://127.0.0.1:5173`, and open Analytics.
The Forms Pages project does not call UptimeRobot for this feature, so its copy
of the secret is harmless but not used by the Admin integration.

The panel matches monitors by these exact friendly names:

| Application | Component | UptimeRobot monitor name |
| --- | --- | --- |
| Manarah | Frontend | `Manarah` |
| Manarah | API | `Manarah API` |
| Manarah | D1 | `Manarah D1` |
| Forms | Frontend | `Forms` |
| Forms | API | `Forms API` |
| Forms | D1 | `Forms D1` |

Rename the monitors or update the mapping in `Maps/functions/_uptimerobot.js`
if the names differ.

## Data and rate limits

The backend uses UptimeRobot v3 monitor and incident endpoints, plus a fixed
last-24-hour uptime statistic for every monitored component, a compact
incident-aware 24-hour timeline for every monitor, and a last-24-hour
response-time statistic for the two frontend monitors. The timeline compresses
the window into 48 half-hour buckets: a bucket is red when an UptimeRobot
incident overlaps it and green otherwise. The percentage remains the aggregate
uptime value; the timeline shows *when* the known outage occurred. System Health is
always fixed to the same last-24-hour UptimeRobot window; the Analytics page's
product date selector does not change it or trigger another provider request.

Responses are cached server-side for three minutes, in D1 when available with
an in-memory fallback. A cold refresh performs ten API requests: monitor list,
incident list, six component uptime-statistic requests, and two frontend
response-time-statistic requests. This stays within UptimeRobot's documented
10 requests/minute Free-plan limit.

Incident fields appear only when UptimeRobot returns them. Empty history,
malformed data, timeouts, API outages, 401/403 authorization failures, and 429
rate limits degrade to a safe Admin message; they do not break the dashboard.
