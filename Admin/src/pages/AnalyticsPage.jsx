import { useState } from "react";
import { useMapAnalytics } from "../api/queries.js";
import { LoadingState } from "../components/QueryState.jsx";

const PERIODS = [{ value: 1, label: "24h" }, { value: 7, label: "7d" }, { value: 30, label: "30d" }, { value: 90, label: "90d" }];
const LABELS = { search_performed:"Searches", place_opened:"Place views", directions_clicked:"Directions", place_submission_completed:"Submissions", place_reported:"Reports", place_saved:"Saved", place_shared:"Shared", location_requested:"Location", satellite_enabled:"Satellite", hybrid_enabled:"Hybrid" };
const number = (value) => Number(value || 0).toLocaleString();
const shortDate = (date) => new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric", timeZone:"UTC" }).format(new Date(`${date}T00:00:00Z`));

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
  return <section className="analytics-chart" aria-labelledby="activity-heading">
    <header><div><span className="eyebrow">MAP ACTIVITY</span><h2 id="activity-heading">Product activity</h2></div><span className="analytics-chart-total">{number(total)} actions</span></header>
    <div className="analytics-plot" role="img" aria-label={`${number(total)} tracked product actions across the last ${days} days`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className="analytics-chart-grid" d="M0 20H100M0 50H100M0 80H100"/><polyline className="analytics-chart-line" points={points}/>{series.map(({ day, value }, index) => <circle key={day} className="analytics-chart-point" cx={(index / Math.max(series.length - 1, 1)) * 100} cy={100 - (value / max) * 86 - 7} r="1.25"><title>{`${shortDate(day)}: ${number(value)} actions`}</title></circle>)}</svg>
    </div>
    <div className="analytics-chart-axis"><span>{shortDate(series[0].day)}</span><span>Peak {number(max)}</span><span>{shortDate(series.at(-1).day)}</span></div>
  </section>;
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const query = useMapAnalytics(days);
  const events = query.data?.posthog?.events || {};
  const warnings = [query.data?.posthog?.warning, query.data?.cloudflare?.warning].filter(Boolean);
  const rankedEvents = Object.entries(LABELS).map(([key, name]) => ({ key, name, value:Number(events[key] || 0) })).sort((left, right) => right.value - left.value);
  const activityMax = Math.max(...rankedEvents.map(({ value }) => value), 1);
  return <div className="pp-page analytics-page">
    <header className="analytics-heading">
      <div><div className="eyebrow">WORKSPACE / ANALYTICS</div><h1 className="pp-page-title">Manarah analytics</h1><p>Cookieless activity and aggregate traffic.</p></div>
      <div className="analytics-period pp-type-style-tabs" aria-label="Analytics period">{PERIODS.map(({ value, label }) => <button key={value} className={days === value ? "active" : ""} aria-pressed={days === value} onClick={() => setDays(value)}>{label}</button>)}</div>
    </header>
    {query.isLoading ? <LoadingState /> : query.error ? <section className="query-error"><strong>Analytics could not be loaded</strong><p>{query.error.message}</p><button className="pp-btn" onClick={() => query.refetch()}>Try again</button></section> : <>
      {warnings.length > 0 && <p className="analytics-notice">{warnings.join(" ")}</p>}
      <section className="analytics-kpis" aria-label="Key analytics"><Metric label="Unique users" value={query.data?.cloudflare?.visitors}/><Metric label="Page loads" value={query.data?.cloudflare?.pageLoads}/><Metric label="Searches" value={events.search_performed}/><Metric label="Place views" value={events.place_opened}/><Metric label="Directions" value={events.directions_clicked}/><Metric label="Submissions" value={events.place_submission_completed}/><Metric label="Reports" value={events.place_reported}/></section>
      <div className="analytics-content"><ActivityChart daily={query.data?.posthog?.daily} days={days}/><section className="analytics-panel"><header><div><span className="eyebrow">FEATURE USE</span><h2>What people use</h2></div><button className="pp-btn" onClick={() => query.refetch()} disabled={query.isFetching}>{query.isFetching ? "Refreshing" : "Refresh"}</button></header>{query.data?.posthog?.ok ? <ol className="analytics-list">{rankedEvents.map(({ key, name, value }) => <li key={key}><span>{name}</span><i aria-hidden="true"><b style={{ "--activity-share": `${(value / activityMax) * 100}%` }}/></i><strong>{number(value)}</strong></li>)}</ol> : <div className="inline-empty">Product activity will appear here once PostHog is available.</div>}</section></div>
      <p className="analytics-footnote">Results refresh every five minutes. Daily snapshots are retained in Manarah’s D1 database for longer-term reporting.</p>
    </>}
  </div>;
}

function Metric({ label, value }) { return <div className="analytics-kpi"><span>{label}</span><strong>{number(value)}</strong></div>; }
