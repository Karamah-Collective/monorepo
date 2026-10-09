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
 *   CLOUDFLARE_ACCOUNT_ID
 *
 * Optional environment variables:
 *   REPORT_FROM                  defaults to manarah@karamahcollective.com
 *   REPORT_FROM_NAME             defaults to Manarah Maps
 *   REPORT_TO                    defaults to home@karamahcollective.com
 */
import { json } from "../_shared.js";

const BREVO_SEND_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";
const CLOUDFLARE_GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const BREVO_SMTP_PASSWORD_PREFIX = ["x", "smtpsib-"].join("");
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HOSTNAME = "maps.karamahcollective.com";
const DEFAULT_FROM = "manarah@karamahcollective.com";
const DEFAULT_FROM_NAME = "Manarah Maps";
const DEFAULT_TO = "home@karamahcollective.com";

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

function mapsOriginFromRequest(request, env) {
  return clean(env.MAPS_ORIGIN || env.REPORT_ORIGIN) || new URL(request.url).origin;
}

function fallbackRecipients(env) {
  return (clean(env.REPORT_TO) || DEFAULT_TO)
    .split(",")
    .map((emailAddress) => clean(emailAddress).toLowerCase())
    .filter(Boolean)
    .map((emailAddress) => ({ email: emailAddress, displayName: "", unsubscribeToken: "" }));
}

async function reportRecipients(env) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT email, display_name, unsubscribe_token FROM weekly_report_subscribers WHERE status='subscribed' ORDER BY lower(email)"
    ).all();
    return results.map((row) => ({
      email: clean(row.email).toLowerCase(),
      displayName: clean(row.display_name),
      unsubscribeToken: clean(row.unsubscribe_token),
    })).filter((row) => row.email);
  } catch {
    return fallbackRecipients(env);
  }
}

function unsubscribeUrl(origin, recipient) {
  if (!recipient.unsubscribeToken) return "";
  const url = new URL("/api/weekly-report", origin);
  url.searchParams.set("unsubscribe", recipient.unsubscribeToken);
  return url.toString();
}

const DEFAULT_REPORT_SETTINGS = {
  enabled: true,
  reportMode: "enabled",
  frequency: "weekly",
  dayOfWeek: 6,
  dayOfMonth: 1,
  sendTime: "09:00",
  timezone: "Europe/Helsinki",
  subjectPrefix: "Manarah weekly report",
  visualDensity: "standard",
  accentColor: "#08705b",
  includeAnalytics: true,
  includeCommunity: true,
  includeQueues: true,
  includeCountries: true,
  includeContributions: true,
  lastSentAt: "",
};

function boolSetting(value, fallback = true) {
  return value === undefined || value === null ? fallback : !!value;
}

function normalizeReportSettings(row = {}) {
  const rawMode = row.report_mode || row.reportMode;
  const legacyMode = boolSetting(row.enabled, true) ? "enabled" : "disabled";
  const reportMode = ["enabled", "disabled", "test"].includes(rawMode) ? rawMode : legacyMode;
  return {
    enabled: reportMode === "enabled",
    reportMode,
    frequency: ["weekly", "biweekly", "monthly"].includes(row.frequency) ? row.frequency : "weekly",
    dayOfWeek: Math.max(0, Math.min(6, Number(row.day_of_week ?? row.dayOfWeek ?? 6))),
    dayOfMonth: Math.max(1, Math.min(31, Number(row.day_of_month ?? row.dayOfMonth ?? 1))),
    sendTime: /^\d{2}:\d{2}$/.test(row.send_time || row.sendTime || "") ? (row.send_time || row.sendTime) : "09:00",
    timezone: ["Europe/Helsinki", "UTC"].includes(row.timezone) ? row.timezone : "Europe/Helsinki",
    subjectPrefix: clean(row.subject_prefix || row.subjectPrefix) || "Manarah weekly report",
    visualDensity: ["standard", "compact"].includes(row.visual_density || row.visualDensity) ? (row.visual_density || row.visualDensity) : "standard",
    accentColor: /^#[0-9a-f]{6}$/i.test(row.accent_color || row.accentColor || "") ? (row.accent_color || row.accentColor) : "#08705b",
    includeAnalytics: boolSetting(row.include_analytics ?? row.includeAnalytics, true),
    includeCommunity: boolSetting(row.include_community ?? row.includeCommunity, true),
    includeQueues: boolSetting(row.include_queues ?? row.includeQueues, true),
    includeCountries: boolSetting(row.include_countries ?? row.includeCountries, true),
    includeContributions: boolSetting(row.include_contributions ?? row.includeContributions, true),
    lastSentAt: clean(row.last_sent_at || row.lastSentAt),
  };
}

async function reportSettings(env) {
  try {
    const row = await env.DB.prepare("SELECT * FROM weekly_report_settings WHERE id=1").first();
    return normalizeReportSettings(row || {});
  } catch {
    return { ...DEFAULT_REPORT_SETTINGS };
  }
}

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday] ?? 0;
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: parts.hour, minute: parts.minute, weekday, dateKey: `${parts.year}-${parts.month}-${parts.day}`, timeKey: `${parts.hour}:${parts.minute}` };
}

function daysInMonth(parts) {
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
}

function weeksSinceEpoch(parts) {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / (7 * DAY_MS));
}

function dueStatus(settings, now = new Date()) {
  if (settings.reportMode === "disabled") return { due: false, reason: "Report disabled" };
  if (settings.reportMode === "test") return { due: false, reason: "Test mode waits for a manual workflow run" };
  if (!settings.enabled) return { due: false, reason: "Report disabled" };
  const parts = localParts(now, settings.timezone);
  let dayMatches = settings.frequency === "monthly"
    ? parts.day === Math.min(settings.dayOfMonth, daysInMonth(parts))
    : parts.weekday === settings.dayOfWeek;
  if (settings.frequency === "biweekly") dayMatches = dayMatches && weeksSinceEpoch(parts) % 2 === 0;
  if (!dayMatches) return { due: false, reason: "Not the scheduled day", local: parts };
  if (parts.timeKey < settings.sendTime) return { due: false, reason: "Before scheduled time", local: parts };
  if (settings.lastSentAt) {
    const last = localParts(new Date(`${settings.lastSentAt.replace(" ", "T")}Z`), settings.timezone);
    if (last.dateKey === parts.dateKey) return { due: false, reason: "Already sent for this scheduled day", local: parts, lastSentAt: settings.lastSentAt };
  }
  return { due: true, reason: "Due", local: parts };
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

function splitWindowIntoWeeks(window) {
  const chunks = [];
  for (let index = 0; index < window.weeks; index += 1) {
    const since = new Date(window.since.getTime() + index * 7 * DAY_MS);
    const until = new Date(Math.min(since.getTime() + 7 * DAY_MS, window.until.getTime()));
    chunks.push({
      since,
      until,
      sinceIso: since.toISOString(),
      untilIso: until.toISOString(),
    });
  }
  return chunks;
}

function averageCloudflareAnalyticsResults(results) {
  const okResults = results.filter((result) => result.ok);
  if (!okResults.length) {
    return results.find((result) => !result.ok) || { ok: false, warning: "Cloudflare analytics query returned no data." };
  }

  const failed = results.length - okResults.length;
  if (failed) {
    return {
      ok: false,
      warning: `Cloudflare analytics baseline is unavailable: ${failed} of ${results.length} weekly visitor queries failed.`,
    };
  }

  const divisor = okResults.length;
  return {
    ok: true,
    hostname: okResults[0].hostname,
    visits: okResults.reduce((total, result) => total + result.visits, 0) / divisor,
    requests: okResults.reduce((total, result) => total + result.requests, 0) / divisor,
    bytes: okResults.reduce((total, result) => total + result.bytes, 0) / divisor,
    topCountries: [],
  };
}

async function runCloudflareQueryWindow(env, window) {
  const accountTag = clean(env.CLOUDFLARE_ACCOUNT_ID);
  const token = clean(env.CLOUDFLARE_ANALYTICS_TOKEN);
  const hostname = DEFAULT_HOSTNAME;

  if (!accountTag || !token) {
    return { ok: false, warning: "Cloudflare analytics is not configured: missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_ANALYTICS_TOKEN." };
  }

  const query = `
    query WeeklyMapsAnalytics($accountTag: string, $filter: filter) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          totals: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $filter) {
            count
            sum {
              visits
            }
          }
          countries: rumPageloadEventsAdaptiveGroups(limit: 100, orderBy: [sum_visits_DESC], filter: $filter) {
            count
            sum {
              visits
            }
            dimensions {
              countryName
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
        accountTag,
        filter: {
          datetime_geq: window.sinceIso,
          datetime_lt: window.untilIso,
          requestHost: hostname,
          bot: 0,
        },
      },
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.errors?.length) {
    const message = payload.errors?.map((err) => err.message).join("; ") || `Cloudflare returned HTTP ${res.status}`;
    return { ok: false, warning: `Cloudflare analytics query failed: ${message}` };
  }

  const account = payload.data?.viewer?.accounts?.[0];
  if (!account) return { ok: false, warning: "Cloudflare analytics query returned no account data." };

  const totals = account.totals?.[0] || {};
  const uniqueVisitors = number(totals.sum?.visits);
  if (!uniqueVisitors && number(totals.count)) {
    return {
      ok: false,
      warning: "Cloudflare returned page-load events but no human visitor value for this window; the report was withheld rather than falling back to event counts.",
    };
  }

  return {
    ok: true,
    hostname,
    requests: number(totals.count),
    visits: uniqueVisitors,
    uniqueVisitors,
    bytes: 0,
    topCountries: (account.countries || []).map((row) => ({
      name: row.dimensions?.countryName || "Unknown",
      requests: number(row.count),
      visits: number(row.sum?.visits),
    })).sort((a, b) => b.visits - a.visits || b.requests - a.requests).slice(0, 8),
  };
}

async function runCloudflareQuery(env, window) {
  if (window.weeks) {
    const weeklyWindows = splitWindowIntoWeeks(window);
    const results = await Promise.all(weeklyWindows.map((week) => runCloudflareQueryWindow(env, week)));
    return averageCloudflareAnalyticsResults(results);
  }
  return runCloudflareQueryWindow(env, window);
}

function assertAnalyticsReady(analytics) {
  const failed = Object.entries(analytics)
    .filter(([, result]) => !result?.ok)
    .map(([period, result]) => `${period}: ${result?.warning || "no data"}`);
  if (failed.length) {
    throw new Error(`Weekly report not sent because Cloudflare analytics failed: ${failed.join(" | ")}`);
  }
}

function linesForItems(items, labelKey) {
  if (!items?.length) return ["- No data"];
  return items.map((item) => `- ${item[labelKey]}: ${fmtNumber(item.visits)} unique visitors, ${fmtNumber(item.requests)} requests`);
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

function formatDecimal(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "0.0";
}

function htmlInlineBars(items, labelKey, valueKey = "visits", limit = 5) {
  if (!items?.length) return `<span style="color:#7a8695;font-size:12px;">No data</span>`;
  const max = Math.max(...items.map((item) => number(item[valueKey])), 1);
  return items.slice(0, limit).map((item) => {
    const value = number(item[valueKey]);
    const width = Math.max(5, Math.round((value / max) * 100));
    return `
      <tr>
        <td style="width:38%;padding:3px 8px 3px 0;color:#53605a;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item[labelKey])}</td>
        <td style="padding:3px 8px 3px 0;">
          <div style="height:5px;background:#e4e9e6;border-radius:999px;overflow:hidden;">
            <div style="height:5px;width:${width}%;background:#08705b;border-radius:999px;"></div>
          </div>
        </td>
        <td style="width:48px;padding:3px 0;text-align:right;color:#101714;font-size:10px;font-weight:700;">${fmtNumber(value)}</td>
      </tr>
    `;
  }).join("");
}

function audienceShareBar(items, total) {
  const safeTotal = Math.max(number(total), 1);
  const colors = ["#08705b", "#54a996", "#9bcfc2", "#d6ddd9"];
  const topItems = (items || []).slice(0, 3);
  const topTotal = topItems.reduce((sum, item) => sum + number(item.visits), 0);
  const values = [...topItems.map((item) => number(item.visits)), Math.max(safeTotal - topTotal, 0)];
  return values.map((value, index) => {
    const width = Math.max(value ? 2 : 0, Math.min(100, (value / safeTotal) * 100));
    return `<td width="${width}%" style="height:7px;background:${colors[index]};font-size:0;line-height:0;">&nbsp;</td>`;
  }).join("");
}

function topItemsShare(items, total) {
  const safeTotal = number(total);
  if (!safeTotal) return "n/a";
  const topTotal = (items || []).slice(0, 3).reduce((sum, item) => sum + number(item.visits), 0);
  return `${formatDecimal((topTotal / safeTotal) * 100)}%`;
}

function comparisonRows(rows) {
  return rows.map(([label, current, average]) => {
    const hasCurrent = current !== null && current !== undefined;
    const hasAverage = average !== null && average !== undefined;
    const currentValue = number(current);
    const averageValue = number(average);
    const max = Math.max(currentValue, averageValue, 1);
    const currentWidth = hasCurrent ? Math.max(currentValue ? 4 : 0, Math.min(100, (currentValue / max) * 100)) : 0;
    const averagePosition = hasAverage ? Math.max(0, Math.min(100, (averageValue / max) * 100)) : 0;
    const markerStart = Math.max(0, averagePosition - 0.3);
    const markerEnd = Math.min(100, averagePosition + 0.3);
    return `
      <tr>
        <td style="width:92px;padding:6px 8px 6px 0;color:#53605a;font-size:10px;font-weight:600;">${escapeHtml(label)}</td>
        <td style="padding:6px 10px 6px 0;">
          <div style="height:12px;border-radius:999px;background:linear-gradient(90deg, transparent 0%, transparent ${markerStart}%, #89928d ${markerStart}%, #89928d ${markerEnd}%, transparent ${markerEnd}%, transparent 100%),linear-gradient(90deg, #08705b 0%, #08705b ${currentWidth}%, #e4e9e6 ${currentWidth}%, #e4e9e6 100%);">
          </div>
        </td>
        <td style="width:60px;padding:6px 8px 6px 0;text-align:right;color:#101714;font-size:10px;font-weight:700;">${hasCurrent ? fmtNumber(currentValue) : "n/a"}</td>
        <td style="width:60px;padding:6px 0;text-align:right;color:#89928d;font-size:10px;">${hasAverage ? fmtNumber(averageValue) : "n/a"}</td>
      </tr>
    `;
  }).join("");
}

function insightBand(title, subtitle, total, totalLabel, rowsHtml, footerLabel, footerValue, barHtml = "") {
  return `
    <div style="height:170px;background:#ffffff;border:1px solid #e4e9e6;border-radius:14px;padding:11px;margin-bottom:8px;box-sizing:border-box;">
      <table style="width:100%;height:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;padding:1px 10px 7px 0;">
            <div style="font-size:12px;line-height:1.25;color:#101714;font-weight:700;">${escapeHtml(title)}</div>
            <div style="margin-top:2px;font-size:9px;color:#89928d;">${escapeHtml(subtitle)}</div>
          </td>
          <td style="width:84px;vertical-align:top;padding:1px 0 7px;text-align:right;">
            <div style="font-size:12px;color:#101714;font-weight:700;">${escapeHtml(total)}</div>
            <div style="margin-top:2px;font-size:8px;color:#89928d;">${escapeHtml(totalLabel)}</div>
          </td>
        </tr>
        ${barHtml ? `<tr><td colspan="2" style="padding:0 0 5px;"><table role="presentation" style="width:100%;height:7px;border-collapse:collapse;background:#e4e9e6;border-radius:999px;overflow:hidden;"><tr>${barHtml}</tr></table></td></tr>` : ""}
        <tr><td colspan="2" style="padding:0;vertical-align:top;"><table style="width:100%;border-collapse:collapse;">${rowsHtml}</table></td></tr>
        <tr><td colspan="2" style="height:100%;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td colspan="2" style="padding:6px 0 0;border-top:1px solid #e4e9e6;vertical-align:bottom;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="color:#89928d;font-size:9px;">${escapeHtml(footerLabel)}</td>
              <td style="text-align:right;color:#08705b;font-size:9px;font-weight:700;">${escapeHtml(footerValue)}</td>
            </tr>
          </table>
        </td></tr>
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
  const rows = [
    { baseLabel: "Reviews", count: community.reviews },
    { baseLabel: "Place edits", count: community.submittedEdits },
    { baseLabel: "New places", count: community.submittedPlaces },
    { baseLabel: "Events", count: community.events + community.eventEdits },
  ];
  const total = rows.reduce((sum, row) => sum + number(row.count), 0);
  return rows.map((row) => ({
    ...row,
    label: total ? `${row.baseLabel} - ${formatDecimal((number(row.count) / total) * 100)}%` : row.baseLabel,
  }));
}

function heroMetric(label, value, change, color, bg) {
  return `
    <td style="width:25%;padding:0;border-right:1px solid #e4e9e6;background:${bg};vertical-align:top;">
      <div style="padding:10px 11px;">
        <div style="font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#89928d;font-weight:700;white-space:nowrap;">${escapeHtml(label)}</div>
        <div style="font-size:22px;line-height:1.05;font-weight:700;color:#101714;margin-top:5px;">${escapeHtml(value)}</div>
        <div style="font-size:9px;line-height:1.2;color:${color};font-weight:700;margin-top:5px;">${escapeHtml(change)}</div>
      </div>
    </td>
  `;
}

function pendingSection(community, approved, pending) {
  return `
    <div style="margin-top:8px;background:#fff5e5;border:1px solid #efd9bb;border-radius:14px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:28%;padding:10px 11px;border-right:1px solid #ead3b1;">
            <div style="font-size:9px;color:#8a6738;font-weight:600;">Review queue</div>
            <div style="margin-top:2px;font-size:12px;font-weight:700;color:#4a3217;">${fmtNumber(pending)} pending items</div>
          </td>
          <td style="width:18%;padding:10px 11px;border-right:1px solid #ead3b1;">
            <div style="font-size:9px;color:#8a6738;font-weight:600;">Place edits</div>
            <div style="margin-top:2px;font-size:18px;font-weight:700;color:#4a3217;">${fmtNumber(community.pendingPlaceEdits)}</div>
          </td>
          <td style="width:18%;padding:10px 11px;border-right:1px solid #ead3b1;">
            <div style="font-size:9px;color:#8a6738;font-weight:600;">New places</div>
            <div style="margin-top:2px;font-size:18px;font-weight:700;color:#4a3217;">${fmtNumber(community.pendingNewPlaces)}</div>
          </td>
          <td style="width:18%;padding:10px 11px;border-right:1px solid #ead3b1;">
            <div style="font-size:9px;color:#8a6738;font-weight:600;">Reviews</div>
            <div style="margin-top:2px;font-size:18px;font-weight:700;color:#4a3217;">${fmtNumber(community.pendingReviews)}</div>
          </td>
          <td style="width:18%;padding:10px 11px;">
            <div style="font-size:9px;color:#8a6738;font-weight:600;">Processed this week</div>
            <div style="margin-top:2px;font-size:11px;font-weight:700;color:#4a3217;white-space:nowrap;">${fmtNumber(approved)} approvals</div>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function buildEmail(report, recipient = {}, origin = DEFAULT_HOSTNAME, settings = DEFAULT_REPORT_SETTINGS) {
  const { windows, analytics, community } = report;
  const { current, previous, baselineAvg } = community;
  const period = `${shortDate(windows.current.since)}-${shortDate(windows.current.until)}, ${windows.current.until.getUTCFullYear()}`;
  const precisePeriod = `${isoDate(windows.current.since)} to ${isoDate(windows.current.until)}`;
  const subject = `${settings.subjectPrefix || "Manarah weekly report"}: ${period}`;
  const currentAnalytics = analytics.current;
  const previousAnalytics = analytics.previous;
  const baselineAnalytics = analytics.baseline;
  const baselineVisits = baselineAnalytics.ok ? baselineAnalytics.visits : 0;
  const visits = currentAnalytics.ok ? currentAnalytics.visits : 0;
  const previousVisits = previousAnalytics.ok ? previousAnalytics.visits : 0;
  const actions = communityActions(current);
  const previousActions = communityActions(previous);
  const averageActions = communityActions(baselineAvg);
  const contributionItems = contributionBreakdown(current);
  const contributionPanelActions = contributionItems.reduce((sum, row) => sum + number(row.count), 0);
  const baselineContributionPanelActions = contributionBreakdown(baselineAvg).reduce((sum, row) => sum + number(row.count), 0);
  const approved = approvedActions(current);
  const previousApproved = approvedActions(previous);
  const averageApproved = approvedActions(baselineAvg);
  const pending = pendingActions(current);
  const contributionRateValue = currentAnalytics.ok && visits > 0 ? (contributionPanelActions / visits) * 100 : null;
  const baselineContributionRateValue = currentAnalytics.ok && baselineVisits > 0 ? (baselineContributionPanelActions / baselineVisits) * 100 : null;
  const contributionRate = contributionRateValue !== null ? `${formatDecimal(contributionRateValue)}%` : "n/a";
  const baselineContributionRate = baselineContributionRateValue !== null ? `${formatDecimal(baselineContributionRateValue)}%` : "n/a";
  const contributionDelta = contributionRateValue !== null && baselineContributionRateValue !== null
    ? `${contributionRateValue - baselineContributionRateValue >= 0 ? "+" : ""}${formatDecimal(contributionRateValue - baselineContributionRateValue)}pp`
    : "n/a";

  const analyticsLines = currentAnalytics.ok
    ? [
      `- Hostname: ${currentAnalytics.hostname}`,
      `- Unique visitors: ${fmtNumber(visits)} (${signedPct(visits, previousVisits)} vs last week, ${signedPct(visits, baselineVisits)} vs 4-week avg)`,
      ...(currentAnalytics.warning ? [`- Note: ${currentAnalytics.warning}`] : []),
      "",
      ...(settings.includeCountries ? ["Top countries", ...linesForItems(currentAnalytics.topCountries, "name"), ""] : []),
      `Contribution rate: ${contributionRate}`,
    ]
    : [`- ${currentAnalytics.warning}`];

  const communityLines = [
    `- New user accounts: ${fmtNumber(current.newUsers)} (${signedPct(current.newUsers, previous.newUsers)} vs last week)`,
    ...(settings.includeContributions ? [`- Contributions: ${fmtNumber(actions)} (${signedPct(actions, previousActions)} vs last week, ${signedPct(actions, averageActions)} vs 4-week avg)`] : []),
    `- Places submitted: ${fmtNumber(current.submittedPlaces)}`,
    `- Place edits submitted: ${fmtNumber(current.submittedEdits)}`,
    `- Reviews added/updated: ${fmtNumber(current.reviews)}`,
    `- Events/Eid submissions: ${fmtNumber(current.events + current.eventEdits + current.eidSubmissions)}`,
    `- Approvals completed: ${fmtNumber(approved)} (${signedPct(approved, previousApproved)} vs last week)`,
    ...(settings.includeQueues ? ["", "Queue now", `- Pending new places: ${fmtNumber(current.pendingNewPlaces)}`, `- Pending place edits: ${fmtNumber(current.pendingPlaceEdits)}`, `- Pending reviews: ${fmtNumber(current.pendingReviews)}`] : []),
    `- Total live places: ${fmtNumber(current.totalLivePlaces)}`,
  ];

  const unsubscribeLink = unsubscribeUrl(origin, recipient);
  const textContent = [
    "Manarah - Weekly Analytics",
    precisePeriod,
    "",
    ...(settings.includeAnalytics ? ["Website", ...analyticsLines, ""] : []),
    ...(settings.includeCommunity ? ["Community activity", ...communityLines] : []),
    ...(unsubscribeLink ? ["", `Unsubscribe from this report: ${unsubscribeLink}`] : []),
  ].join("\n");

  const comparisonHtml = comparisonRows([
    ["Visitors", currentAnalytics.ok ? visits : null, baselineAnalytics.ok ? baselineVisits : null],
    ["Contributions", actions, averageActions],
    ["Approvals", approved, averageApproved],
  ]);
  const audiencePanel = currentAnalytics.ok && settings.includeCountries
    ? insightBand(
      "Audience geography",
      "Top countries by unique visitors",
      fmtNumber(visits),
      "unique visitors",
      htmlInlineBars(currentAnalytics.topCountries, "name", "visits", 3),
      "Top 3 share",
      topItemsShare(currentAnalytics.topCountries, visits),
      audienceShareBar(currentAnalytics.topCountries, visits),
    )
    : `<div style="background:#ffffff;border:1px solid #e4e9e6;border-radius:14px;padding:11px;margin-bottom:8px;color:#53605a;font-size:10px;">${escapeHtml(currentAnalytics.warning)}</div>`;
  const contributionPanel = settings.includeContributions ? insightBand(
    "Contribution mix",
    `${fmtNumber(contributionPanelActions)} community actions`,
    escapeHtml(contributionRate),
    "visitor -> action",
    htmlInlineBars(contributionItems, "label", "count", 4),
    `Baseline conversion ${baselineContributionRate}`,
    contributionDelta,
  ) : "";
  const accent = escapeHtml(settings.accentColor || "#08705b");
  const maxWidth = settings.visualDensity === "compact" ? 620 : 680;

  const htmlContent = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    </style>
    <div style="font-family:'Plus Jakarta Sans','Aptos','Segoe UI',Arial,sans-serif;max-width:${maxWidth}px;margin:0 auto;padding:0;background:transparent;color:#101714;">
      <div style="background:#ffffff;border:1px solid #d6ddd9;border-radius:20px;overflow:hidden;">
        <div style="padding:16px 18px;border-bottom:1px solid #e4e9e6;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <table style="border-collapse:collapse;"><tr>
                  <td style="width:32px;height:32px;text-align:center;vertical-align:middle;background:${accent};color:#ffffff;font-size:15px;font-weight:700;border-radius:10px;">H</td>
                  <td style="padding-left:9px;">
                    <div style="font-size:15px;line-height:1.15;color:#101714;font-weight:700;">Manarah</div>
                    <div style="margin-top:2px;font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:#89928d;font-weight:700;">Weekly analytics</div>
                  </td>
                </tr></table>
              </td>
              <td style="text-align:right;vertical-align:middle;color:#89928d;font-size:10px;white-space:nowrap;">
                <div style="font-weight:700;color:#101714;">${escapeHtml(period)}</div>
                <div style="margin-top:3px;">maps.karamahcollective.com</div>
              </td>
            </tr>
          </table>
        </div>

        <div style="padding:18px;border-bottom:1px solid #e4e9e6;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:bottom;padding-right:16px;">
                <div style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:${accent};font-weight:700;">Weekly analytics</div>
                <div style="margin-top:4px;font-size:24px;line-height:1.08;color:#101714;font-weight:700;letter-spacing:-.03em;">Weekly performance</div>
                <div style="margin-top:8px;color:#53605a;font-size:10px;line-height:1.45;">Current week compared with last week and the four-week average.</div>
              </td>
              <td style="width:142px;vertical-align:bottom;padding-left:14px;border-left:1px solid #e4e9e6;">
                <div style="font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:#89928d;font-weight:700;">Unique visitors</div>
                <div style="margin-top:3px;font-size:30px;line-height:1;color:#101714;font-weight:700;">${currentAnalytics.ok ? fmtNumber(visits) : "n/a"}</div>
                <div style="margin-top:5px;color:#53605a;font-size:9px;">Four-week average ${baselineAnalytics.ok ? fmtNumber(baselineVisits) : "n/a"}</div>
              </td>
            </tr>
          </table>
        </div>

        <div style="padding:18px 18px 6px;">
          <div style="border:1px solid #e4e9e6;border-radius:14px;overflow:hidden;background:#f7f9f8;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                ${heroMetric("New users", fmtNumber(current.newUsers), `${signedPct(current.newUsers, previous.newUsers)} vs last`, trendColor(current.newUsers, previous.newUsers), "#f7f9f8")}
                ${heroMetric("Contributions", fmtNumber(actions), `${signedPct(actions, previousActions)} vs last`, trendColor(actions, previousActions), "#f7f9f8")}
                ${heroMetric("Approvals", fmtNumber(approved), `${signedPct(approved, previousApproved)} vs last`, trendColor(approved, previousApproved), "#f7f9f8")}
                ${heroMetric("Pending review", fmtNumber(pending), "Current total", "#a86616", "#f7f9f8")}
              </tr>
            </table>
          </div>

          <div style="margin-top:14px;padding:8px 10px;border-top:1px solid #d6ddd9;border-bottom:2px solid ${accent};background:#f7f9f8;">
            <span style="font-size:11px;color:#101714;font-weight:800;">Performance against the four-week average</span>
            <span style="float:right;font-size:9px;color:#89928d;">Marker shows baseline</span>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">${comparisonHtml}</table>

          <table style="width:100%;border-collapse:separate;border-spacing:0;margin:0 -4px;">
            <tr>
              <td style="width:50%;padding:0 4px;vertical-align:top;">${settings.includeAnalytics ? audiencePanel : ""}</td>
              <td style="width:50%;padding:0 4px;vertical-align:top;">${settings.includeCommunity ? contributionPanel : ""}</td>
            </tr>
          </table>

          ${settings.includeQueues ? pendingSection(current, approved, pending) : ""}

          ${currentAnalytics.warning ? `<div style="margin-top:8px;padding:9px 10px;background:#fff8df;color:#5f4b12;font-size:10px;line-height:1.35;">${escapeHtml(currentAnalytics.warning)}</div>` : ""}

          <table style="width:100%;border-collapse:collapse;margin:10px 2px 2px;">
            <tr>
              <td style="color:#89928d;font-size:9px;line-height:1.4;">Localhost traffic is excluded. The baseline uses the four complete weeks before this reporting window.</td>
              <td style="width:150px;text-align:right;color:#101714;font-size:9px;font-weight:700;white-space:nowrap;">Manarah Analytics</td>
            </tr>
          </table>
          ${unsubscribeLink ? `<div style="margin:8px 2px 0;padding-top:8px;border-top:1px solid #e4e9e6;color:#89928d;font-size:9px;line-height:1.4;">You are receiving this because you are on the Manarah weekly report list. <a href="${escapeHtml(unsubscribeLink)}" style="color:#08705b;text-decoration:underline;">Unsubscribe</a></div>` : ""}
        </div>
      </div>
    </div>
  `;

  return { subject, textContent, htmlContent };
}

async function sendBrevoEmail(env, email, recipient) {
  const apiKey = clean(env.BREVO_API_KEY);
  if (!apiKey) throw new Error("Missing BREVO_API_KEY");
  if (apiKey.startsWith(BREVO_SMTP_PASSWORD_PREFIX)) {
    throw new Error("BREVO_API_KEY must be an HTTP API key, not an SMTP password");
  }

  const from = clean(env.REPORT_FROM) || DEFAULT_FROM;
  const fromName = clean(env.REPORT_FROM_NAME) || DEFAULT_FROM_NAME;
  const to = [{ email: recipient.email, name: recipient.displayName || undefined }];
  if (!recipient.email) throw new Error("Missing report recipient");

  const res = await fetch(BREVO_SEND_EMAIL_URL, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName, email: from },
      to,
      subject: email.subject,
      textContent: email.textContent,
      htmlContent: email.htmlContent,
      headers: {
        ...(recipient.unsubscribeToken ? { "List-Unsubscribe": `<${unsubscribeUrl(clean(env.MAPS_ORIGIN || env.REPORT_ORIGIN) || `https://${DEFAULT_HOSTNAME}`, recipient)}>` } : {}),
      },
      tags: ["weekly-report"],
    }),
  });

  if (res.ok) {
    try {
      const details = await res.json();
      return { email: recipient.email, messageId: details?.messageId || "" };
    } catch {
      return { email: recipient.email, messageId: "" };
    }
  }
  let message = `Brevo returned HTTP ${res.status}`;
  try {
    const details = await res.json();
    if (details?.message) message = details.message;
  } catch { /* keep generic */ }
  throw new Error(message);
}

async function unsubscribeByToken(env, token) {
  if (!env.DB) return { status: 503, title: "Report unavailable", message: "The report service is temporarily unavailable." };
  const cleanToken = clean(token);
  if (!cleanToken) return { status: 400, title: "Missing unsubscribe link", message: "This unsubscribe link is incomplete." };
  const row = await env.DB.prepare("SELECT email FROM weekly_report_subscribers WHERE unsubscribe_token=?").bind(cleanToken).first();
  if (!row) return { status: 404, title: "Link not found", message: "This unsubscribe link is no longer active." };
  await env.DB.prepare("UPDATE weekly_report_subscribers SET status='unsubscribed',unsubscribed_at=datetime('now'),updated_at=datetime('now') WHERE unsubscribe_token=?").bind(cleanToken).run();
  return { status: 200, title: "Unsubscribed", message: `${row.email} will no longer receive the Manarah weekly report.` };
}

function unsubscribePage(result) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(result.title)}</title><style>body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:#f7f9f8;color:#101714;display:grid;min-height:100vh;place-items:center}.panel{max-width:520px;margin:24px;padding:28px;background:white;border:1px solid #dfe6e2;border-radius:14px}h1{margin:0 0 10px;font-size:28px}p{margin:0;color:#52605a}a{color:#08705b}</style></head><body><main class="panel"><h1>${escapeHtml(result.title)}</h1><p>${escapeHtml(result.message)}</p><p style="margin-top:18px"><a href="https://maps.karamahcollective.com">Open Manarah</a></p></main></body></html>`, { status: result.status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.has("unsubscribe")) return unsubscribePage(await unsubscribeByToken(context.env, url.searchParams.get("unsubscribe")));
  return json({ error: "Not found" }, 404, { "Content-Type": "application/json" });
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
    const settings = await reportSettings(env);
    const manual = !!body.manual;
    const testMode = !!body.testMode || (settings.reportMode === "test" && manual);
    const force = !!body.force || testMode;
    const due = dueStatus(settings);
    if (settings.reportMode === "disabled" && !body.dryRun) {
      return json({
        success: true,
        sent: false,
        skipped: "Report disabled",
        schedule: { settings, due },
      }, 200, headers);
    }
    if (settings.reportMode === "test" && !testMode && !body.dryRun) {
      return json({
        success: true,
        sent: false,
        skipped: "Test mode waits for a manual workflow run",
        schedule: { settings, due },
      }, 200, headers);
    }
    if (!force && !body.dryRun && !due.due) {
      return json({
        success: true,
        sent: false,
        skipped: due.reason,
        schedule: { settings, due },
      }, 200, headers);
    }
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
    assertAnalyticsReady(report.analytics);
    const recipients = await reportRecipients(env);
    if (!recipients.length) {
      return json({
        success: true,
        sent: false,
        skipped: "No weekly report recipients configured",
        recipients: [],
        deliveries: [],
        period: { since: windows.current.sinceIso, until: windows.current.untilIso },
        analytics: report.analytics,
        community: report.community,
      schedule: { settings, due },
      }, 200, headers);
    }
    const origin = mapsOriginFromRequest(request, env);
    const deliveries = [];

    if (!body.dryRun) {
      for (const recipient of recipients) {
        deliveries.push(await sendBrevoEmail(env, buildEmail(report, recipient, origin, settings), recipient));
      }
      try {
        await env.DB.prepare("UPDATE weekly_report_settings SET last_sent_at=datetime('now'),updated_at=datetime('now') WHERE id=1").run();
      } catch {
        /* Older deployments can still send through the fallback recipient before this table exists. */
      }
    }

    return json({
      success: true,
      sent: !body.dryRun,
      forced: force,
      manual,
      testMode,
      schedule: { settings, due },
      recipients: recipients.map((recipient) => recipient.email),
      deliveries,
      period: { since: windows.current.sinceIso, until: windows.current.untilIso },
      analytics: report.analytics,
      community: report.community,
    }, 200, headers);
  } catch (err) {
    console.error("Weekly report failed:", err?.message || err);
    return json({ success: false, error: err?.message || "Weekly report failed" }, 500, headers);
  }
}
