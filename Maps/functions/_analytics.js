const POSTHOG_EVENTS = ["search_performed", "place_opened", "location_requested", "place_saved", "place_shared"];
const MAX_CACHE_AGE = 5 * 60 * 1000;

function daysFrom(input) { const value = Number(input); return [1, 7, 30, 90].includes(value) ? value : 30; }
async function cache(db, key) { const row = await db.prepare("SELECT payload FROM analytics_cache WHERE cache_key=? AND expires_at>? ").bind(key, Date.now()).first(); try { return row ? JSON.parse(row.payload) : null; } catch { return null; } }
async function putCache(db, key, payload) { await db.prepare("INSERT INTO analytics_cache(cache_key,payload,expires_at,updated_at) VALUES(?,?,?,datetime('now')) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at,updated_at=excluded.updated_at").bind(key, JSON.stringify(payload), Date.now() + MAX_CACHE_AGE).run(); }
async function queryPostHog(env, days) {
  if (!env.POSTHOG_API_KEY || !env.POSTHOG_PROJECT_ID) return { ok:false, warning:"PostHog is not configured." };
  const eventList = POSTHOG_EVENTS.map((event) => `'${event}'`).join(",");
  const query = `SELECT toDate(timestamp) AS day, event, count() AS value FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY AND event IN (${eventList}) GROUP BY day, event ORDER BY day ASC`;
  const topPlacesQuery = `SELECT properties.place_id AS place_id, any(properties.place_name) AS name, any(properties.category) AS category, any(properties.place_lat) AS lat, any(properties.place_lng) AS lng, count() AS views FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY AND event = 'place_opened' AND properties.place_id IS NOT NULL GROUP BY place_id ORDER BY views DESC LIMIT 10`;
  const categoriesQuery = `SELECT properties.category AS category, count() AS views FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY AND event = 'place_opened' AND properties.category IS NOT NULL GROUP BY category ORDER BY views DESC LIMIT 6`;
  const modesQuery = `SELECT event, properties.mode AS mode, count() AS value FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY AND event IN ('search_performed','place_opened') AND properties.mode IS NOT NULL GROUP BY event, mode ORDER BY value DESC`;
  const response = await fetch(`${String(env.POSTHOG_API_HOST || "https://eu.posthog.com").replace(/\/$/, "")}/api/projects/${encodeURIComponent(env.POSTHOG_PROJECT_ID)}/query/`, { method:"POST", headers:{Authorization:`Bearer ${env.POSTHOG_API_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({query:{kind:"HogQLQuery",query}}) });
  const responsePlaces = await fetch(`${String(env.POSTHOG_API_HOST || "https://eu.posthog.com").replace(/\/$/, "")}/api/projects/${encodeURIComponent(env.POSTHOG_PROJECT_ID)}/query/`, { method:"POST", headers:{Authorization:`Bearer ${env.POSTHOG_API_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({query:{kind:"HogQLQuery",query:topPlacesQuery}}) });
  const responseCategories = await fetch(`${String(env.POSTHOG_API_HOST || "https://eu.posthog.com").replace(/\/$/, "")}/api/projects/${encodeURIComponent(env.POSTHOG_PROJECT_ID)}/query/`, { method:"POST", headers:{Authorization:`Bearer ${env.POSTHOG_API_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({query:{kind:"HogQLQuery",query:categoriesQuery}}) });
  const responseModes = await fetch(`${String(env.POSTHOG_API_HOST || "https://eu.posthog.com").replace(/\/$/, "")}/api/projects/${encodeURIComponent(env.POSTHOG_PROJECT_ID)}/query/`, { method:"POST", headers:{Authorization:`Bearer ${env.POSTHOG_API_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({query:{kind:"HogQLQuery",query:modesQuery}}) });
  const body = await response.json().catch(() => ({}));
  const placesBody = await responsePlaces.json().catch(() => ({}));
  const categoriesBody = await responseCategories.json().catch(() => ({}));
  const modesBody = await responseModes.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.results)) return { ok:false, warning:response.status === 401 || response.status === 403 ? "PostHog authorization failed." : "PostHog analytics is temporarily unavailable." };
  const events = {}, daily = {};
  for (const row of body.results) {
    const [day, event, value] = row;
    const count = Number(value) || 0;
    events[String(event)] = (events[String(event)] || 0) + count;
    if (!daily[String(day)]) daily[String(day)] = {};
    daily[String(day)][String(event)] = count;
  }
  const topPlaces = Array.isArray(placesBody.results) ? placesBody.results.map(([place_id, name, category, lat, lng, views]) => ({ place_id, name, category, lat:Number(lat) || null, lng:Number(lng) || null, views:Number(views) || 0 })) : [];
  const categories = Array.isArray(categoriesBody.results) ? categoriesBody.results.map(([category, views]) => ({ category: String(category || "Other"), views: Number(views) || 0 })) : [];
  const modes = Array.isArray(modesBody.results) ? modesBody.results.map(([event, mode, value]) => ({ event, mode: String(mode || "unknown"), value: Number(value) || 0 })) : [];
  return { ok:true, events, daily, topPlaces, categories, modes };
}
async function queryCloudflare(env, days) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_ANALYTICS_TOKEN) return { ok:false, warning:"Cloudflare Analytics is not configured." };
  const until = new Date(), since = new Date(until.getTime() - days * 86400000);
  const query = `query($accountTag:string,$filter:filter){viewer{accounts(filter:{accountTag:$accountTag}){groups:rumPageloadEventsAdaptiveGroups(limit:1,filter:$filter){count sum{visits}}}}}`;
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", { method:"POST", headers:{Authorization:`Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`,"Content-Type":"application/json"}, body:JSON.stringify({query,variables:{accountTag:env.CLOUDFLARE_ACCOUNT_ID,filter:{datetime_geq:since.toISOString(),datetime_lt:until.toISOString(),requestHost:env.SITE_HOSTNAME || "maps.karamahcollective.com",bot:0}}}) });
  const body = await response.json().catch(() => ({}));
  const group = body.data?.viewer?.accounts?.[0]?.groups?.[0];
  if (!response.ok || !group) return { ok:false, warning:"Cloudflare Analytics is temporarily unavailable." };
  return { ok:true, visitors:Number(group.sum?.visits) || 0, pageLoads:Number(group.count) || 0 };
}

/** Read privacy-preserving analytics for the authenticated Admin dashboard. */
export async function getAnalyticsDashboard(db, env, inputDays) {
  const days = daysFrom(inputDays), key = `analytics-dashboard:${days}`;
  // A newly deployed function can receive traffic just before the D1 migration
  // is applied. Analytics must degrade, never take down the Admin page.
  const cached = await cache(db, key).catch(() => null); if (cached) return { ...cached, cached:true };
  const [posthog, cloudflare] = await Promise.all([queryPostHog(env, days), queryCloudflare(env, days)]);
  if (posthog.ok && Array.isArray(posthog.topPlaces) && posthog.topPlaces.length) {
    const ids = posthog.topPlaces.map((place) => String(place.place_id || "")).filter(Boolean);
    try {
      const rows = await db.prepare(`SELECT id, name, type, address FROM places WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
      const names = new Map((rows.results || []).map((row) => [String(row.id), row]));
      posthog.topPlaces = posthog.topPlaces.map((place) => ({ ...place, ...names.get(String(place.place_id)) && { name: names.get(String(place.place_id)).name, category: names.get(String(place.place_id)).type, address: names.get(String(place.place_id)).address } }));
    } catch { /* Analytics should still work when the places table is unavailable. */ }
  }
  const payload = { days, cached:false, posthog, cloudflare, generatedAt:new Date().toISOString() };
  const date = new Date().toISOString().slice(0,10);
  const writes = [];
  for (const [snapshotDate, dailyEvents] of Object.entries(posthog.daily || {})) {
    for (const [metric, value] of Object.entries(dailyEvents)) writes.push(db.prepare("INSERT INTO analytics_daily_snapshots(snapshot_date,provider,metric,value) VALUES(?,?,?,?) ON CONFLICT(snapshot_date,provider,metric) DO UPDATE SET value=excluded.value,captured_at=datetime('now')").bind(snapshotDate,"posthog",metric,Number(value)||0));
  }
  if (cloudflare.ok) { writes.push(db.prepare("INSERT INTO analytics_daily_snapshots(snapshot_date,provider,metric,value) VALUES(?,?,?,?) ON CONFLICT(snapshot_date,provider,metric) DO UPDATE SET value=excluded.value,captured_at=datetime('now')").bind(date,"cloudflare","unique_users",cloudflare.visitors)); writes.push(db.prepare("INSERT INTO analytics_daily_snapshots(snapshot_date,provider,metric,value) VALUES(?,?,?,?) ON CONFLICT(snapshot_date,provider,metric) DO UPDATE SET value=excluded.value,captured_at=datetime('now')").bind(date,"cloudflare","page_loads",cloudflare.pageLoads)); }
  await Promise.all(writes.map((statement) => statement.run())).catch(() => {});
  await putCache(db, key, payload).catch(() => {});
  return payload;
}
