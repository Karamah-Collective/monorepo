const API = "https://api.uptimerobot.com/v3";
const CACHE_MS = 3 * 60 * 1000;
let memoryCache = new Map();

const COMPONENTS = [
  ["manarah", "frontend", "Manarah"], ["manarah", "api", "Manarah API"], ["manarah", "database", "Manarah D1"],
  ["forms", "frontend", "Forms"], ["forms", "api", "Forms API"], ["forms", "database", "Forms D1"],
];

function daysFrom(input) { const value = Number(input); return [1, 7, 30, 90].includes(value) ? value : 30; }
function cacheKey(days) { return `uptimerobot-health:${days}`; }
function asArray(value) { return Array.isArray(value) ? value : []; }
function monitorList(body) { return asArray(body?.data || body?.monitors || body?.results); }
function incidentList(body) { return asArray(body?.data || body?.incidents || body?.results); }
function monitorName(monitor) { return String(monitor?.friendlyName || monitor?.friendly_name || monitor?.name || "").trim(); }
function matchMonitor(monitors, expected) { return monitors.find((monitor) => monitorName(monitor).toLowerCase() === expected.toLowerCase()) || null; }
function statusOf(monitor) {
  if (!monitor) return "Unknown";
  const status = String(monitor.status || monitor.state || "").toUpperCase();
  if (["PAUSED", "9"].includes(status)) return "Paused";
  if (["UP", "OPERATIONAL", "2"].includes(status)) return "Operational";
  if (["DOWN", "MAJOR", "9_DOWN", "1"].includes(status)) return "Down";
  if (["DEGRADED", "MINOR", "SLOW_RESPONSE"].includes(status)) return "Degraded";
  return "Unknown";
}
function dateOf(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function idOf(monitor) { return monitor?.id == null ? "" : String(monitor.id); }

async function apiGet(path, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, code: response.status };
    if (!body || typeof body !== "object") return { ok: false, code: "malformed" };
    return { ok: true, body };
  } catch (error) { return { ok: false, code: error?.name === "AbortError" ? "timeout" : "unavailable" }; }
  finally { clearTimeout(timer); }
}
function issue(code) {
  if (code === 401 || code === 403) return "UptimeRobot authorization failed.";
  if (code === 429) return "UptimeRobot rate limit reached; showing the last available data when possible.";
  if (code === "timeout") return "UptimeRobot did not respond in time.";
  if (code === "malformed") return "UptimeRobot returned an unexpected response.";
  return "UptimeRobot is temporarily unavailable.";
}
function uptimeOf(body) { const value = body?.uptime ?? body?.data?.uptime ?? body?.summary?.uptime; return Number.isFinite(Number(value)) ? Number(value) : null; }
function responseTimeOf(body) {
  const summary = body?.summary || body?.data?.summary || body?.data?.all?.summary || body?.all?.summary;
  const value = summary?.avg ?? summary?.average ?? body?.average ?? body?.data?.average;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
function incidentFor(incidents, monitorId) {
  const incident = incidents.find((item) => String(item.monitorId ?? item.monitor_id ?? item.monitor?.id ?? "") === monitorId);
  if (!incident) return null;
  const startedAt = dateOf(incident.startedAt || incident.startDateTime || incident.start_datetime || incident.datetime || incident.createdAt);
  const recoveredAt = dateOf(incident.recoveredAt || incident.resolvedAt || incident.endDateTime || incident.end_datetime);
  return { startedAt, recoveredAt, durationSeconds: Number(incident.durationSeconds ?? incident.duration ?? incident.duration_seconds) || null };
}
function appStatus(components) {
  const web = components.frontend.status;
  if (web === "Down") return "Down";
  if (web === "Paused" && components.api.status === "Paused" && components.database.status === "Paused") return "Paused";
  if (web === "Operational" && [components.api.status, components.database.status].some((value) => value === "Down" || value === "Degraded")) return "Degraded";
  if (Object.values(components).some((item) => item.status === "Degraded")) return "Degraded";
  if (web === "Operational") return "Operational";
  return "Unknown";
}

async function getCached(db, key) {
  const memory = memoryCache.get(key); if (memory && memory.expiresAt > Date.now()) return memory.payload;
  try { const row = await db?.prepare("SELECT payload FROM analytics_cache WHERE cache_key=? AND expires_at>?").bind(key, Date.now()).first(); if (row?.payload) return JSON.parse(row.payload); } catch {}
  return null;
}
async function putCached(db, key, payload) {
  memoryCache.set(key, { payload, expiresAt: Date.now() + CACHE_MS });
  try { await db?.prepare("INSERT INTO analytics_cache(cache_key,payload,expires_at,updated_at) VALUES(?,?,?,datetime('now')) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at,updated_at=excluded.updated_at").bind(key, JSON.stringify(payload), Date.now() + CACHE_MS).run(); } catch {}
}

/** Fetches the small, read-only operational view used by authenticated Admin. */
export async function getSystemHealth(db, env, inputDays) {
  const days = daysFrom(inputDays), key = cacheKey(days), cached = await getCached(db, key);
  if (cached) return { ...cached, cached: true };
  const token = String(env.UPTIMEROBOT_API_KEY || "").trim();
  if (!token) return { days, services: [], incidents: [], generatedAt: new Date().toISOString(), warning: "UptimeRobot monitoring is not configured." };

  const [monitorsResult, incidentsResult] = await Promise.all([apiGet("/monitors?limit=100", token), apiGet("/incidents?limit=50", token)]);
  if (!monitorsResult.ok) return { days, services: [], incidents: [], generatedAt: new Date().toISOString(), warning: issue(monitorsResult.code) };
  const monitors = monitorList(monitorsResult.body);
  const incidents = incidentsResult.ok ? incidentList(incidentsResult.body) : [];
  const from = new Date(Date.now() - days * 86400000).toISOString(), to = new Date().toISOString();
  const located = Object.fromEntries(COMPONENTS.map(([service, component, name]) => [`${service}:${component}`, matchMonitor(monitors, name)]));
  // The stats endpoints are requested for the two frontend monitors only. This gives each
  // application a clearly sourced availability/performance metric while keeping a refresh
  // to six requests (including monitor list and incidents), below the free-plan limit.
  const frontends = [located["manarah:frontend"], located["forms:frontend"]].filter(Boolean);
  const stats = await Promise.all(frontends.flatMap((monitor) => [
    apiGet(`/monitors/${encodeURIComponent(idOf(monitor))}/stats/uptime?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token),
    apiGet(`/monitors/${encodeURIComponent(idOf(monitor))}/stats/response-time?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token),
  ]));
  const statById = new Map();
  frontends.forEach((monitor, index) => statById.set(idOf(monitor), { uptime: stats[index * 2], responseTime: stats[index * 2 + 1] }));
  const services = ["manarah", "forms"].map((id) => {
    const components = Object.fromEntries(["frontend", "api", "database"].map((component) => {
      const monitor = located[`${id}:${component}`], monitorId = idOf(monitor), stat = statById.get(monitorId);
      return [component, { status: statusOf(monitor), monitorFound: !!monitor, lastChecked: dateOf(monitor?.lastCheckedAt || monitor?.lastCheck || monitor?.last_check), incident: incidentFor(incidents, monitorId), uptime: component === "frontend" && stat?.uptime?.ok ? uptimeOf(stat.uptime.body) : null, responseTime: component === "frontend" && stat?.responseTime?.ok ? responseTimeOf(stat.responseTime.body) : null }];
    }));
    return { id, name: id === "manarah" ? "Manarah" : "Forms", status: appStatus(components), components, uptime: components.frontend.uptime, responseTime: components.frontend.responseTime };
  });
  const publicIncidents = incidents.map((incident) => {
    const monitorId = String(incident.monitorId ?? incident.monitor_id ?? incident.monitor?.id ?? "");
    const found = COMPONENTS.find(([service, component]) => idOf(located[`${service}:${component}`]) === monitorId);
    if (!found) return null;
    return { application: found[0] === "manarah" ? "Manarah" : "Forms", component: found[1], startedAt: dateOf(incident.startedAt || incident.startDateTime || incident.start_datetime || incident.datetime || incident.createdAt), recoveredAt: dateOf(incident.recoveredAt || incident.resolvedAt || incident.endDateTime || incident.end_datetime), durationSeconds: Number(incident.durationSeconds ?? incident.duration ?? incident.duration_seconds) || null };
  }).filter(Boolean).slice(0, 50);
  const payload = { days, services, incidents: publicIncidents, generatedAt: new Date().toISOString(), ...(incidentsResult.ok ? {} : { warning: issue(incidentsResult.code) }) };
  await putCached(db, key, payload);
  return payload;
}
