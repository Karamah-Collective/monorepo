import { useState } from "react";
import { useMapAnalytics } from "../api/queries.js";
import { LoadingState } from "../components/QueryState.jsx";
import { SystemHealthPanel } from "./SystemHealthPage.jsx";

const PERIODS = [{ value: 1, label: "24h" }, { value: 7, label: "7d" }, { value: 30, label: "30d" }, { value: 90, label: "90d" }];
const LABELS = { search_performed:"Searches", place_opened:"Place views", location_requested:"Location requests", place_saved:"Saved places", place_shared:"Shares" };
const number = (value) => Number(value || 0).toLocaleString();
const shortDate = (date) => new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric", timeZone:"UTC" }).format(new Date(`${date}T00:00:00Z`));
const titleCase = (value) => String(value || "Other").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function dailySeries(daily, days) {
  const series = [], now = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset)).toISOString().slice(0, 10);
    const values = daily?.[day] || {};
    series.push({ day, value:Object.values(values).reduce((total, value) => total + Number(value || 0), 0) });
  }
  return series;
}

function ActivityChart({ daily, days }) {
  const series = dailySeries(daily, days), max = Math.max(...series.map(({ value }) => value), 1);
  const points = series.map(({ value }, index) => `${(index / Math.max(series.length - 1, 1)) * 100},${100 - (value / max) * 86 - 7}`).join(" ");
  const total = series.reduce((sum, point) => sum + point.value, 0);
  return <section className="analytics-panel analytics-chart" aria-labelledby="activity-heading">
    <header className="analytics-panel-header analytics-panel-header-compact"><div><span className="analytics-kicker">ACTIVITY</span><h2 id="activity-heading">Product activity</h2></div><span className="analytics-chart-total">{number(total)} actions</span></header>
    <div className="analytics-plot" role="img" aria-label={`${number(total)} tracked product actions across the last ${days} days`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className="analytics-chart-grid" d="M0 20H100M0 50H100M0 80H100"/><polyline className="analytics-chart-line" points={points}/>{series.map(({ day, value }, index) => <circle key={day} className="analytics-chart-point" cx={(index / Math.max(series.length - 1, 1)) * 100} cy={100 - (value / max) * 86 - 7} r="1.25"><title>{`${shortDate(day)}: ${number(value)} actions`}</title></circle>)}</svg>
    </div>
    <div className="analytics-chart-axis"><span>{shortDate(series[0].day)}</span><span>Peak {number(max)}</span><span>{shortDate(series.at(-1).day)}</span></div>
  </section>;
}

function MostViewedPlaces({ places, days }) {
  if (!places?.length) return <section className="analytics-top-places analytics-top-places-empty"><div><span className="analytics-kicker">PLACE INTEREST</span><h2>Most viewed places</h2></div><p>Place views will appear here as people explore the map.</p></section>;
  return <section className="analytics-top-places" aria-labelledby="top-places-heading">
    <header><div><span className="analytics-kicker">PLACE INTEREST</span><h2 id="top-places-heading">Most viewed places</h2></div><span>Last {days} days</span></header>
    <ol>{places.map((place, index) => <li key={place.place_id}><span className="analytics-place-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{place.name || place.place_id}</strong><small>{place.address || place.category || "Place"}</small></div><b>{number(place.views)}<small> views</small></b></li>)}</ol>
  </section>;
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const query = useMapAnalytics(days);
  const events = query.data?.posthog?.events || {};
  const warnings = [query.data?.posthog?.warning, query.data?.cloudflare?.warning].filter(Boolean);
  const rankedEvents = Object.entries(LABELS).map(([key, name]) => ({ key, name, value:Number(events[key] || 0) })).sort((left, right) => right.value - left.value);
  const activityMax = Math.max(...rankedEvents.map(({ value }) => value), 1);
  const categories = query.data?.posthog?.categories || [];
  const modes = query.data?.posthog?.modes || [];
  const searchViews = modes.filter(({ event, mode }) => event === "place_opened" && ["search", "search_result"].includes(mode)).reduce((sum, item) => sum + item.value, 0);
  const conversion = events.search_performed ? Math.round((searchViews / events.search_performed) * 100) : 0;
  return <div className="pp-page analytics-page">
    <header className="analytics-heading">
      <div><div className="analytics-kicker">WORKSPACE / INSIGHTS</div><h1 className="pp-page-title">Analytics &amp; Health</h1><p className="pp-page-lead">One workspace for product signals, service reliability, and the operational context behind both.</p></div>
      <div className="analytics-period pp-type-style-tabs" aria-label="Analytics period">{PERIODS.map(({ value, label }) => <button key={value} className={days === value ? "active" : ""} aria-pressed={days === value} onClick={() => setDays(value)}>{label}</button>)}</div>
    </header>
    <section className="analytics-section" aria-labelledby="analytics-section-title"><header className="analytics-section-heading"><div><span className="analytics-kicker">ANALYTICS</span><h2 id="analytics-section-title">Product analytics</h2><p>How people discover and use the map.</p></div></header>
    {query.isLoading ? <LoadingState /> : query.error ? <section className="query-error"><strong>Analytics could not be loaded</strong><p>{query.error.message}</p><button className="pp-btn" onClick={() => query.refetch()}>Try again</button></section> : <>
      {warnings.length > 0 && <p className="analytics-notice">{warnings.join(" ")}</p>}
      <section className="analytics-kpis" aria-label="Key analytics"><Metric label="Unique users" value={query.data?.cloudflare?.visitors}/><Metric label="Page loads" value={query.data?.cloudflare?.pageLoads}/><Metric label="Searches" value={events.search_performed}/><Metric label="Place views" value={events.place_opened}/><Metric label="Location requests" value={events.location_requested}/></section>
      <div className="analytics-content"><ActivityChart daily={query.data?.posthog?.daily} days={days}/><section className="analytics-panel analytics-discovery"><header className="analytics-panel-header analytics-panel-header-compact"><div><span className="analytics-kicker">DISCOVERY</span><h2>What people use</h2></div><button className="pp-btn" onClick={() => query.refetch()} disabled={query.isFetching}>{query.isFetching ? "Refreshing" : "Refresh"}</button></header>{query.data?.posthog?.ok ? <ol className="analytics-list">{rankedEvents.map(({ key, name, value }) => <li key={key}><span>{name}</span><i aria-hidden="true"><b style={{ "--activity-share": `${(value / activityMax) * 100}%` }}/></i><strong>{number(value)}</strong></li>)}</ol> : <div className="inline-empty">Product activity will appear here once PostHog is available.</div>}</section></div>
      <section className="analytics-insights" aria-label="Discovery insights"><Insight title="Search → place view" value={`${conversion}%`} copy="Place views attributed to search, divided by searches."/><Insight title="Top category" value={categories[0] ? titleCase(categories[0].category) : "—"} copy={categories[0] ? `${number(categories[0].views)} place views` : "Waiting for category data."}/><Insight title="Search-led views" value={number(searchViews)} copy="Place views opened from a search result."/></section>
      <section className="analytics-panel analytics-breakdowns"><header className="analytics-panel-header analytics-panel-header-compact"><div><span className="analytics-kicker">DISCOVERY SIGNALS</span><h2>What deserves attention</h2></div></header><div className="analytics-breakdown-grid"><Breakdown title="Categories" items={categories.map(({ category, views }) => ({ label: titleCase(category), value: views }))}/><Breakdown title="Entry mode" items={modes.filter(({ event }) => event === "place_opened").map(({ mode, value }) => ({ label: titleCase(mode), value }))}/></div></section>
      <MostViewedPlaces places={query.data?.posthog?.topPlaces} days={days} />
      <p className="analytics-footnote">Results refresh every five minutes. Daily snapshots are retained in Manarah’s D1 database for longer-term reporting.</p>
    </>}
    </section>
    <SystemHealthPanel days={days} />
  </div>;
}

function Metric({ label, value }) { return <div className="analytics-kpi"><span>{label}</span><strong>{number(value)}</strong></div>; }
function Insight({ title, value, copy }) { return <article className="analytics-insight"><span>{title}</span><strong>{value}</strong><p>{copy}</p></article>; }
function Breakdown({ title, items }) { const max = Math.max(...items.map((item) => item.value), 1); return <div className="analytics-breakdown"><h3>{title}</h3>{items.length ? items.map((item) => <div className="analytics-breakdown-row" key={item.label}><span>{item.label}</span><i><b style={{ "--activity-share": `${(item.value / max) * 100}%` }}/></i><strong>{number(item.value)}</strong></div>) : <p className="inline-empty">No data yet.</p>}</div>; }
