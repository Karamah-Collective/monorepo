/**
 * Cloudflare Pages Function - /api/weekly-report
 *
 * Protected weekly analytics email. GitHub Actions calls this endpoint on a
 * schedule; the function reads Cloudflare Analytics + D1 and sends via the
 * same Brevo HTTP API used by the contact form.
 *
 * Required environment variables:
 *   DB
 *   BREVO_API_KEY
 *   REPORT_SECRET
 *   CLOUDFLARE_ANALYTICS_TOKEN
 *   CLOUDFLARE_ZONE_ID
 *
 * Optional environment variables:
 *   SITE_HOSTNAME                defaults to maps.karamahcollective.com
 *   REPORT_FROM                  defaults to analytics@karamahcollective.com
 *   REPORT_FROM_NAME             defaults to Karamah Analytics
 *   REPORT_TO                    defaults to home@karamahcollective.com
 */
import { json } from "../_shared.js";

const BREVO_SEND_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";
const CLOUDFLARE_GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const BREVO_SMTP_PASSWORD_PREFIX = ["x", "smtpsib-"].join("");
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HOSTNAME = "maps.karamahcollective.com";
const DEFAULT_FROM = "analytics@karamahcollective.com";
const DEFAULT_FROM_NAME = "Halal Finder Analytics";
const DEFAULT_TO = "home@karamahcollective.com";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function clean(value) {
  return (value || "").toString().trim();
}

function number(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtNumber(value) {
  return new Intl.NumberFormat("en-US").format(number(value));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function shortDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function escapeHtml(value) {
  return clean(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function makeReportingWindow(now = new Date()) {
  const until = now;
  const since = new Date(until.getTime() - 7 * DAY_MS);
  return { since, until, sinceIso: since.toISOString(), untilIso: until.toISOString() };
}

function makeComparisonWindows(now = new Date()) {
  const current = makeReportingWindow(now);
  const previous = {
    since: new Date(current.since.getTime() - 7 * DAY_MS),
    until: current.since,
  };
  previous.sinceIso = previous.since.toISOString();
  previous.untilIso = previous.until.toISOString();

  const baseline = {
    since: new Date(current.since.getTime() - 28 * DAY_MS),
    until: current.since,
    weeks: 4,
  };
  baseline.sinceIso = baseline.since.toISOString();
  baseline.untilIso = baseline.until.toISOString();

  return { current, previous, baseline };
}

function parseTimestamp(value) {
  const raw = clean(value);
  if (!raw) return null;

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed);

  // helsinkiTimestamp() writes en-FI local strings like "16.8.2026 21.05.13".
  // Comparing local wall-clock dates is enough for weekly trend counts.
  const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,)?\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?/);
  if (!match) return null;
  const [, d, m, y, hh, mm, ss = "0"] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
}

function inWindow(timestamp, since, until) {
  const parsed = parseTimestamp(timestamp);
  if (!parsed) return false;
  return parsed >= since && parsed < until;
}

async function countRowsInWindow(db, sql, since, until) {
  const { results } = await db.prepare(sql).all();
  return (results || []).filter((row) => inWindow(row.timestamp, since, until)).length;
}

async function countFirstSeenAccounts(db, since, until) {
  const { results } = await db.prepare("SELECT first_seen_at AS timestamp FROM account_meta WHERE first_seen_at != ''").all();
  return (results || []).filter((row) => inWindow(row.timestamp, since, until)).length;
}

async function countAuditActions(db, actions, since, until) {
  const placeholders = actions.map(() => "?").join(",");
  const { results } = await db.prepare(
    `SELECT action, COUNT(*) AS n
       FROM audit_log
      WHERE success = 1
        AND created_at_epoch >= ?
        AND created_at_epoch < ?
        AND action IN (${placeholders})
      GROUP BY action`
  ).bind(since.getTime(), until.getTime(), ...actions).all();

  const out = Object.fromEntries(actions.map((action) => [action, 0]));
  for (const row of results || []) out[row.action] = number(row.n);
  return out;
}

async function getPendingSnapshot(db) {
  const [pendingNew, pendingEdits, pendingReviews, totalPlaces] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM new_places WHERE status = 'pending'").first(),
    db.prepare("SELECT COUNT(*) AS n FROM edits WHERE status = 'pending'").first(),
    db.prepare("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'").first(),
    db.prepare("SELECT COUNT(*) AS n FROM places").first(),
  ]);
  return {
    pendingNewPlaces: number(pendingNew?.n),
    pendingPlaceEdits: number(pendingEdits?.n),
    pendingReviews: number(pendingReviews?.n),
    totalLivePlaces: number(totalPlaces?.n),
  };
}

async function getCommunityMetrics(db, window) {
  const { since, until } = window;
  const [users, submittedPlaces, submittedEdits, reviews, events, eventEdits, eidSubmissions, audit, snapshot] = await Promise.all([
    countFirstSeenAccounts(db, since, until),
    countRowsInWindow(db, "SELECT timestamp FROM new_places", since, until),
    countRowsInWindow(db, "SELECT timestamp FROM edits", since, until),
    countRowsInWindow(db, "SELECT timestamp FROM reviews WHERE email_hash != '' AND status != 'no'", since, until),
    countRowsInWindow(db, "SELECT created_at AS timestamp FROM events", since, until),
    countRowsInWindow(db, "SELECT timestamp FROM event_edits", since, until),
    countRowsInWindow(db, "SELECT timestamp FROM eid_new", since, until),
    countAuditActions(db, ["approve-new", "approve-edit", "reject-new", "reject-edit"], since, until),
    getPendingSnapshot(db),
  ]);

  return {
    newUsers: users,
    submittedPlaces,
    submittedEdits,
    reviews,
    events,
    eventEdits,
    eidSubmissions,
    approvedPlaces: audit["approve-new"],
    approvedEdits: audit["approve-edit"],
    rejectedPlaces: audit["reject-new"],
    rejectedEdits: audit["reject-edit"],
    ...snapshot,
  };
}

function averageCommunityMetrics(metrics, divisor) {
  const out = {};
  for (const [key, value] of Object.entries(metrics)) {
    out[key] = number(value) / divisor;
  }
  return out;
}

/** Cloudflare httpRequestsAdaptiveGroups allows at most 24h per query. */
function splitWindowIntoDays(window) {
  const chunks = [];
  let cursor = new Date(window.since);
  const end = new Date(window.until);
  while (cursor < end) {
    const next = new Date(Math.min(cursor.getTime() + DAY_MS, end.getTime()));
    chunks.push({
      since: new Date(cursor),
      until: next,
      sinceIso: cursor.toISOString(),
      untilIso: next.toISOString(),
    });
    cursor = next;
  }
  return chunks;
}

function mergeCloudflareAnalyticsResults(results) {
  const okResults = results.filter((result) => result.ok);
  if (!okResults.length) {
    return results.find((result) => !result.ok) || { ok: false, warning: "Cloudflare analytics query returned no data." };
  }

  const countryMap = new Map();
  let visits = 0;
  let requests = 0;
  let bytes = 0;

  for (const result of okResults) {
    visits += result.visits;
    requests += result.requests;
    bytes += result.bytes;
    for (const country of result.topCountries) {
      const existing = countryMap.get(country.name) || { name: country.name, visits: 0, requests: 0 };
      existing.visits += country.visits;
      existing.requests += country.requests;
      countryMap.set(country.name, existing);
    }
  }

  const failed = results.length - okResults.length;
  const topCountries = [...countryMap.values()]
    .sort((a, b) => b.visits - a.visits || b.requests - a.requests)
    .slice(0, 8);

  return {
    ok: true,
    hostname: okResults[0].hostname,
    visits,
    requests,
    bytes,
    topCountries,
    ...(failed ? { partial: true, warning: `Cloudflare analytics is partial: ${failed} of ${results.length} daily queries failed.` } : {}),
  };
}

async function runCloudflareQueryChunk(env, window) {
  const zoneTag = clean(env.CLOUDFLARE_ZONE_ID);
  const token = clean(env.CLOUDFLARE_ANALYTICS_TOKEN);
  const hostname = clean(env.SITE_HOSTNAME) || DEFAULT_HOSTNAME;
  if (LOCAL_HOSTNAMES.has(hostname.toLowerCase())) {
    return { ok: false, warning: "Cloudflare analytics skipped because SITE_HOSTNAME is local development." };
  }

  if (!zoneTag || !token) {
    return { ok: false, warning: "Cloudflare analytics is not configured: missing CLOUDFLARE_ZONE_ID or CLOUDFLARE_ANALYTICS_TOKEN." };
  }

  const query = `
    query WeeklyMapsAnalytics($zoneTag: string, $filter: filter) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          totals: httpRequestsAdaptiveGroups(limit: 1, filter: $filter) {
            count
            sum {
              visits
              edgeResponseBytes
            }
          }
          countries: httpRequestsAdaptiveGroups(limit: 8, filter: $filter, orderBy: [count_DESC]) {
            count
            sum {
              visits
            }
            dimensions {
              clientCountryName
            }
          }
        }
      }
    }
  `;

  const res = await fetch(CLOUDFLARE_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        zoneTag,
        filter: {
          datetime_geq: window.sinceIso,
          datetime_lt: window.untilIso,
          clientRequestHTTPHost: hostname,
          requestSource: "eyeball",
        },
      },
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.errors?.length) {
    const message = payload.errors?.map((err) => err.message).join("; ") || `Cloudflare returned HTTP ${res.status}`;
    return { ok: false, warning: `Cloudflare analytics query failed: ${message}` };
  }

  const zone = payload.data?.viewer?.zones?.[0];
  if (!zone) return { ok: false, warning: "Cloudflare analytics query returned no zone data." };

  const totals = zone.totals?.[0] || {};
  return {
    ok: true,
    hostname,
    requests: number(totals.count),
    visits: number(totals.sum?.visits),
    bytes: number(totals.sum?.edgeResponseBytes),
    topCountries: (zone.countries || []).map((row) => ({
      name: row.dimensions?.clientCountryName || "Unknown",
      requests: number(row.count),
      visits: number(row.sum?.visits),
    })),
  };
}

async function runCloudflareQuery(env, window) {
  const chunks = splitWindowIntoDays(window);
  const results = await Promise.all(chunks.map((chunk) => runCloudflareQueryChunk(env, chunk)));
  return mergeCloudflareAnalyticsResults(results);
}

function linesForItems(items, labelKey) {
  if (!items?.length) return ["- No data"];
  return items.map((item) => `- ${item[labelKey]}: ${fmtNumber(item.visits)} visits, ${fmtNumber(item.requests)} requests`);
}

function htmlMetricRows(rows) {
  return rows.map(([label, value]) => `
    <tr>
      <td style="padding:4px 0;color:#4d5968;font-size:12px;">${escapeHtml(label)}</td>
      <td style="padding:4px 0;text-align:right;font-weight:700;color:#15201a;font-size:13px;">${escapeHtml(value)}</td>
    </tr>
  `).join("");
}

function pctChange(current, comparison) {
  const c = number(current);
  const base = number(comparison);
  if (!base && !c) return 0;
  if (!base) return 100;
  return ((c - base) / base) * 100;
}

function signedPct(current, comparison) {
  const pct = pctChange(current, comparison);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

function trendColor(current, comparison, inverse = false) {
  const pct = pctChange(current, comparison);
  const good = inverse ? pct <= 0 : pct >= 0;
  if (Math.abs(pct) < 1) return "#667085";
  return good ? "#22764d" : "#b54708";
}

function trendColorOnDark(current, comparison, inverse = false) {
  const pct = pctChange(current, comparison);
  const good = inverse ? pct <= 0 : pct >= 0;
  if (Math.abs(pct) < 1) return "#dbe9dc";
  return good ? "#6ee7a8" : "#f6c177";
}

function formatDecimal(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "0.0";
}

function htmlBars(items, labelKey, valueKey = "visits") {
  if (!items?.length) {
    return `<p style="margin:4px 0 0;color:#64748b;font-size:12px;">No data</p>`;
  }

  const max = Math.max(...items.map((item) => number(item[valueKey])), 1);
  return `
    <table style="width:100%;border-collapse:collapse;">
      ${items.slice(0, 5).map((item) => {
        const value = number(item[valueKey]);
        const width = Math.max(4, Math.round((value / max) * 100));
        return `
          <tr>
            <td style="width:34%;padding:3px 8px 3px 0;color:#344054;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item[labelKey])}</td>
            <td style="padding:3px 8px 3px 0;">
              <div style="height:7px;background:#e7eee8;border-radius:999px;overflow:hidden;">
                <div style="height:7px;width:${width}%;background:#2f7d55;border-radius:999px;"></div>
              </div>
            </td>
            <td style="width:76px;padding:3px 0;text-align:right;color:#15201a;font-size:12px;font-weight:700;">${fmtNumber(value)}</td>
          </tr>
        `;
      }).join("")}
    </table>
  `;
}

function htmlInlineBars(items, labelKey, valueKey = "visits") {
  if (!items?.length) return `<span style="color:#7a8695;font-size:12px;">No data</span>`;
  const max = Math.max(...items.map((item) => number(item[valueKey])), 1);
  return items.slice(0, 4).map((item) => {
    const value = number(item[valueKey]);
    const width = Math.max(5, Math.round((value / max) * 100));
    return `
      <tr>
        <td style="width:128px;padding:3px 10px 3px 0;color:#344054;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item[labelKey])}</td>
        <td style="padding:3px 10px 3px 0;">
          <div style="height:7px;background:#e7eee8;border-radius:999px;overflow:hidden;">
            <div style="height:7px;width:${width}%;background:#2f7d55;border-radius:999px;"></div>
          </div>
        </td>
        <td style="width:56px;padding:3px 0;text-align:right;color:#172119;font-size:12px;font-weight:850;">${fmtNumber(value)}</td>
      </tr>
    `;
  }).join("");
}

function insightBand(title, rowsHtml) {
  return `
    <div style="background:#fbfbf6;border:1px solid #dfe7da;border-radius:16px;padding:12px;margin-bottom:8px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:140px;vertical-align:top;padding:3px 16px 0 0;">
            <h2 style="font-size:13px;line-height:1.25;margin:0;color:#172119;font-weight:850;">${escapeHtml(title)}</h2>
          </td>
          <td style="vertical-align:top;">
            <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function communityActions(community) {
  return number(community.submittedPlaces)
    + number(community.submittedEdits)
    + number(community.reviews)
    + number(community.events)
    + number(community.eventEdits)
    + number(community.eidSubmissions);
}

function approvedActions(community) {
  return number(community.approvedPlaces) + number(community.approvedEdits);
}

function pendingActions(community) {
  return number(community.pendingNewPlaces) + number(community.pendingPlaceEdits) + number(community.pendingReviews);
}

function contributionBreakdown(community) {
  return [
    { label: "Reviews", count: community.reviews },
    { label: "Place edits", count: community.submittedEdits },
    { label: "New places", count: community.submittedPlaces },
    { label: "Events", count: community.events + community.eventEdits },
    { label: "Eid locations", count: community.eidSubmissions },
  ];
}

function htmlActivityBars(community) {
  return htmlBars([
    { label: "Reviews", count: community.reviews },
    { label: "Place edits", count: community.submittedEdits },
    { label: "New places", count: community.submittedPlaces },
    { label: "Events", count: community.events + community.eventEdits },
    { label: "Eid locations", count: community.eidSubmissions },
  ], "label", "count");
}

function metricBlock(label, value, change, color, bg, border) {
  return `
    <td style="width:25%;padding:0 5px 10px 0;">
      <div style="background:${bg};border:1px solid ${border};padding:9px 10px;">
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#667085;font-weight:700;white-space:nowrap;">${escapeHtml(label)}</div>
        <div style="font-size:21px;line-height:1.1;font-weight:850;color:#132018;margin-top:3px;">${escapeHtml(value)}</div>
        <div style="font-size:11px;line-height:1.2;color:${color};font-weight:800;margin-top:4px;">${escapeHtml(change)}</div>
      </div>
    </td>
  `;
}

function heroMetric(label, value, change, color, bg) {
  return `
    <td style="width:25%;padding:0 3px;">
      <div style="background:${bg};border-radius:14px;padding:10px 10px;border:1px solid #dfe7da;">
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6b756b;font-weight:800;white-space:nowrap;">${escapeHtml(label)}</div>
        <div style="font-size:22px;line-height:1.05;font-weight:850;color:#172119;margin-top:5px;">${escapeHtml(value)}</div>
        <div style="font-size:11px;line-height:1.2;color:${color};font-weight:800;margin-top:4px;">${escapeHtml(change)}</div>
      </div>
    </td>
  `;
}

function pendingSection(community, approved, pending) {
  if (pending <= 0) {
    return `
      <div style="margin-top:10px;border-radius:14px;background:#f4f8f1;border:1px solid #dce8d8;padding:11px 12px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td>
              <div style="font-size:13px;font-weight:850;color:#172119;">Review queue clear</div>
              <div style="font-size:11px;color:#637063;margin-top:2px;">No pending places, edits, or reviews at send time.</div>
            </td>
            <td style="text-align:right;font-size:18px;font-weight:850;color:#1d704b;">0</td>
          </tr>
        </table>
      </div>
    `;
  }

  return `
    <div style="margin-top:10px;border-radius:14px;background:#fbf7ee;border:1px solid #eadfc9;padding:11px 12px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td>
            <div style="font-size:13px;font-weight:850;color:#2f2518;">Pending review</div>
            <div style="font-size:11px;color:#6f604c;margin-top:2px;">${fmtNumber(approved)} approvals completed this week. ${fmtNumber(pending)} items remain in the queue.</div>
          </td>
          <td style="text-align:right;font-size:18px;font-weight:850;color:#9a4b0c;">${fmtNumber(pending)}</td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <tr>
          <td style="width:33.33%;padding-right:6px;"><div style="border-radius:10px;background:#fffdf7;padding:7px 9px;"><span style="font-size:11px;color:#806845;font-weight:800;">Places</span><span style="float:right;font-size:14px;color:#2f2518;font-weight:850;">${fmtNumber(community.pendingNewPlaces)}</span></div></td>
          <td style="width:33.33%;padding-right:6px;"><div style="border-radius:10px;background:#fffdf7;padding:7px 9px;"><span style="font-size:11px;color:#806845;font-weight:800;">Edits</span><span style="float:right;font-size:14px;color:#2f2518;font-weight:850;">${fmtNumber(community.pendingPlaceEdits)}</span></div></td>
          <td style="width:33.33%;"><div style="border-radius:10px;background:#fffdf7;padding:7px 9px;"><span style="font-size:11px;color:#806845;font-weight:800;">Reviews</span><span style="float:right;font-size:14px;color:#2f2518;font-weight:850;">${fmtNumber(community.pendingReviews)}</span></div></td>
        </tr>
      </table>
    </div>
  `;
}

function buildEmail(report) {
  const { windows, analytics, community } = report;
  const { current, previous, baselineAvg } = community;
  const period = `${shortDate(windows.current.since)}-${shortDate(windows.current.until)}, ${windows.current.until.getUTCFullYear()}`;
  const precisePeriod = `${isoDate(windows.current.since)} to ${isoDate(windows.current.until)}`;
  const subject = `Halal Finder weekly report: ${period}`;
  const currentAnalytics = analytics.current;
  const previousAnalytics = analytics.previous;
  const baselineAnalytics = analytics.baseline;
  const baselineVisits = baselineAnalytics.ok ? baselineAnalytics.visits / 4 : 0;
  const visits = currentAnalytics.ok ? currentAnalytics.visits : 0;
  const previousVisits = previousAnalytics.ok ? previousAnalytics.visits : 0;
  const actions = communityActions(current);
  const previousActions = communityActions(previous);
  const averageActions = communityActions(baselineAvg);
  const approved = approvedActions(current);
  const previousApproved = approvedActions(previous);
  const averageApproved = approvedActions(baselineAvg);
  const pending = pendingActions(current);
  const contributionRate = currentAnalytics.ok && visits > 0 ? `${formatDecimal((actions / visits) * 100)}%` : "n/a";
  const baselineContributionRate = currentAnalytics.ok && baselineVisits > 0 ? `${formatDecimal((averageActions / baselineVisits) * 100)}%` : "n/a";

  const analyticsLines = currentAnalytics.ok
    ? [
      `- Hostname: ${currentAnalytics.hostname}`,
      `- Visits: ${fmtNumber(visits)} (${signedPct(visits, previousVisits)} vs last week, ${signedPct(visits, baselineVisits)} vs 4-week avg)`,
      ...(currentAnalytics.warning ? [`- Note: ${currentAnalytics.warning}`] : []),
      "",
      "Top countries",
      ...linesForItems(currentAnalytics.topCountries, "name"),
      "",
      `Contribution rate: ${contributionRate}`,
    ]
    : [`- ${currentAnalytics.warning}`];

  const communityLines = [
    `- New user accounts: ${fmtNumber(current.newUsers)} (${signedPct(current.newUsers, previous.newUsers)} vs last week)`,
    `- Contributions: ${fmtNumber(actions)} (${signedPct(actions, previousActions)} vs last week, ${signedPct(actions, averageActions)} vs 4-week avg)`,
    `- Places submitted: ${fmtNumber(current.submittedPlaces)}`,
    `- Place edits submitted: ${fmtNumber(current.submittedEdits)}`,
    `- Reviews added/updated: ${fmtNumber(current.reviews)}`,
    `- Events/Eid submissions: ${fmtNumber(current.events + current.eventEdits + current.eidSubmissions)}`,
    `- Approvals completed: ${fmtNumber(approved)} (${signedPct(approved, previousApproved)} vs last week)`,
    "",
    "Queue now",
    `- Pending new places: ${fmtNumber(current.pendingNewPlaces)}`,
    `- Pending place edits: ${fmtNumber(current.pendingPlaceEdits)}`,
    `- Pending reviews: ${fmtNumber(current.pendingReviews)}`,
    `- Total live places: ${fmtNumber(current.totalLivePlaces)}`,
  ];

  const textContent = [
    "Halal Finder - Weekly Analytics",
    precisePeriod,
    "",
    "Website",
    ...analyticsLines,
    "",
    "Community activity",
    ...communityLines,
  ].join("\n");

  const htmlContent = `
    <div style="font-family:'Plus Jakarta Sans','Aptos','Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;padding:12px;background:#eef3eb;color:#172119;">
      <div style="background:#fbfbf6;border-radius:22px;padding:8px;border:1px solid #dfe8da;">
        <div style="background:#102419;border-radius:17px;padding:17px 18px 16px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td>
                <div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#a9c8b5;font-weight:850;">Weekly brief</div>
                <h1 style="font-size:30px;line-height:1;margin:8px 0 0;color:#fbfff6;font-weight:850;">Halal Finder</h1>
              </td>
              <td style="text-align:right;vertical-align:top;color:#cfe3d4;font-size:12px;white-space:nowrap;">
                <div style="font-weight:800;color:#fbfff6;">${escapeHtml(period)}</div>
                <div style="margin-top:4px;color:#9ab8a6;">maps.karamahcollective.com</div>
              </td>
            </tr>
          </table>
          <p style="margin:13px 0 0;color:#dbe9dc;font-size:13px;line-height:1.45;max-width:500px;">Visits are <strong style="color:${trendColorOnDark(visits, baselineVisits)};">${signedPct(visits, baselineVisits)}</strong> vs the 4-week average. Contributions are <strong style="color:${trendColorOnDark(actions, averageActions)};">${signedPct(actions, averageActions)}</strong>. ${pending > 0 ? `<strong style="color:#f6c177;">${fmtNumber(pending)} items</strong> need review.` : `<strong style="color:#6ee7a8;">The review queue is clear.</strong>`}</p>
        </div>

        <div style="padding:10px 7px 5px;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
            <tr>
              ${heroMetric("Visits", currentAnalytics.ok ? fmtNumber(visits) : "n/a", `${signedPct(visits, previousVisits)} vs last`, trendColor(visits, previousVisits), "#f5f8f2")}
              ${heroMetric("Users", fmtNumber(current.newUsers), `${signedPct(current.newUsers, previous.newUsers)} vs last`, trendColor(current.newUsers, previous.newUsers), "#f5f8f2")}
              ${heroMetric("Contrib.", fmtNumber(actions), `${signedPct(actions, previousActions)} vs last`, trendColor(actions, previousActions), "#f5f8f2")}
              ${heroMetric("Pending", fmtNumber(pending), pending > 0 ? "open queue" : "all clear", pending > 0 ? "#9a4b0c" : "#1d704b", "#f5f8f2")}
            </tr>
          </table>

          <table style="width:100%;border-collapse:collapse;margin-bottom:10px;background:#f5f8f2;border:1px solid #dfe7da;border-radius:14px;">
            <tr>
              <td style="padding:9px 10px;font-size:11px;color:#6b756b;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">4-week avg</td>
              <td style="padding:9px 8px;text-align:center;font-size:12px;color:#172119;">Visits <strong style="color:${trendColor(visits, baselineVisits)};">${signedPct(visits, baselineVisits)}</strong></td>
              <td style="padding:9px 8px;text-align:center;font-size:12px;color:#172119;">Contrib. <strong style="color:${trendColor(actions, averageActions)};">${signedPct(actions, averageActions)}</strong></td>
              <td style="padding:9px 10px;text-align:right;font-size:12px;color:#172119;">Approvals <strong style="color:${trendColor(approved, averageApproved)};">${signedPct(approved, averageApproved)}</strong></td>
            </tr>
          </table>

          ${currentAnalytics.ok ? `
            ${insightBand("Country pulse", htmlInlineBars(currentAnalytics.topCountries, "name"))}
            ${insightBand("Contribution breakdown", htmlInlineBars(contributionBreakdown(current), "label", "count"))}
            <div style="border-radius:12px;background:#f1f5ee;padding:8px 10px;color:#536170;font-size:11px;line-height:1.35;margin-bottom:8px;">Contribution rate: <strong style="color:#172119;">${escapeHtml(contributionRate)}</strong> this week, ${escapeHtml(baselineContributionRate)} baseline.</div>
            ${currentAnalytics.warning ? `<div style="border-radius:12px;padding:10px 12px;background:#fff8df;color:#5f4b12;font-size:12px;margin-bottom:8px;">${escapeHtml(currentAnalytics.warning)}</div>` : ""}
          ` : `
            <div style="border-radius:20px;padding:12px 14px;background:#fff8df;color:#5f4b12;font-size:12px;margin-bottom:12px;">${escapeHtml(currentAnalytics.warning)}</div>
          `}

          ${pendingSection(current, approved, pending)}

          <p style="margin:10px 4px 2px;color:#7a8695;font-size:11px;line-height:1.4;">Localhost traffic is excluded by querying only ${escapeHtml(currentAnalytics.hostname || DEFAULT_HOSTNAME)}. The 4-week average uses the four weeks before this report window.</p>
        </div>
      </div>
    </div>
  `;

  return { subject, textContent, htmlContent };
}

async function sendBrevoEmail(env, email) {
  const apiKey = clean(env.BREVO_API_KEY);
  if (!apiKey) throw new Error("Missing BREVO_API_KEY");
  if (apiKey.startsWith(BREVO_SMTP_PASSWORD_PREFIX)) {
    throw new Error("BREVO_API_KEY must be an HTTP API key, not an SMTP password");
  }

  const from = clean(env.REPORT_FROM) || DEFAULT_FROM;
  const fromName = clean(env.REPORT_FROM_NAME) || DEFAULT_FROM_NAME;
  const recipients = (clean(env.REPORT_TO) || DEFAULT_TO)
    .split(",")
    .map((emailAddress) => clean(emailAddress))
    .filter(Boolean)
    .map((emailAddress) => ({ email: emailAddress }));

  if (!recipients.length) throw new Error("Missing REPORT_TO");

  const res = await fetch(BREVO_SEND_EMAIL_URL, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName, email: from },
      to: recipients,
      subject: email.subject,
      textContent: email.textContent,
      htmlContent: email.htmlContent,
    }),
  });

  if (res.ok) return;
  let message = `Brevo returned HTTP ${res.status}`;
  try {
    const details = await res.json();
    if (details?.message) message = details.message;
  } catch { /* keep generic */ }
  throw new Error(message);
}

function isAuthorized(request, env) {
  const expected = clean(env.REPORT_SECRET);
  if (!expected) return false;
  const header = request.headers.get("Authorization") || "";
  return header === `Bearer ${expected}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { "Content-Type": "application/json" };

  if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, 401, headers);
  if (!env.DB) return json({ error: "Missing DB binding" }, 500, headers);

  let body = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "Invalid JSON body" }, 400, headers);
  }

  try {
    const windows = makeComparisonWindows();
    const [currentCommunity, previousCommunity, baselineCommunity, currentAnalytics, previousAnalytics, baselineAnalytics] = await Promise.all([
      getCommunityMetrics(env.DB, windows.current),
      getCommunityMetrics(env.DB, windows.previous),
      getCommunityMetrics(env.DB, windows.baseline),
      runCloudflareQuery(env, windows.current),
      runCloudflareQuery(env, windows.previous),
      runCloudflareQuery(env, windows.baseline),
    ]);
    const report = {
      windows,
      community: {
        current: currentCommunity,
        previous: previousCommunity,
        baselineAvg: averageCommunityMetrics(baselineCommunity, windows.baseline.weeks),
      },
      analytics: {
        current: currentAnalytics,
        previous: previousAnalytics,
        baseline: baselineAnalytics,
      },
    };
    const email = buildEmail(report);

    if (!body.dryRun) await sendBrevoEmail(env, email);

    return json({
      success: true,
      sent: !body.dryRun,
      period: { since: windows.current.sinceIso, until: windows.current.untilIso },
      analytics: report.analytics,
      community: report.community,
    }, 200, headers);
  } catch (err) {
    console.error("Weekly report failed:", err?.message || err);
    return json({ success: false, error: err?.message || "Weekly report failed" }, 500, headers);
  }
}
