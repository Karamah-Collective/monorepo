import { useState } from "react";
import { useMapAnalytics } from "../api/queries.js";
import { Icons } from "../icons.jsx";
import { LoadingState } from "../components/QueryState.jsx";

const PERIODS = [{ value: 1, label: "24h" }, { value: 7, label: "7d" }, { value: 30, label: "30d" }, { value: 90, label: "90d" }];
const label = { search_performed:"Searches", place_opened:"Place views", directions_clicked:"Directions", place_submission_completed:"Submissions", place_reported:"Reports", place_saved:"Saved", place_shared:"Shared", location_requested:"Location", satellite_enabled:"Satellite", hybrid_enabled:"Hybrid" };
const number = (value) => Number(value || 0).toLocaleString();

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const query = useMapAnalytics(days);
  const events = query.data?.posthog?.events || {};
  const posthogWarning = query.data?.posthog?.warning;
  const cloudflareWarning = query.data?.cloudflare?.warning;
  return <div className="pp-page analytics-page">
    <header className="analytics-heading">
      <div><div className="eyebrow">MAPS / ANALYTICS</div><h1 className="pp-page-title">Manarah analytics</h1><p>Consent-based product usage alongside privacy-first traffic totals.</p></div>
      <div className="analytics-period pp-type-style-tabs" aria-label="Analytics period">{PERIODS.map(({ value, label }) => <button key={value} className={days === value ? "active" : ""} aria-pressed={days === value} onClick={() => setDays(value)}>{label}</button>)}</div>
    </header>
    {query.isLoading ? <LoadingState /> : query.error ? <section className="query-error"><strong>Analytics could not be loaded</strong><p>{query.error.message}</p><button className="pp-btn" onClick={() => query.refetch()}>Try again</button></section> : <>
      <section className="analytics-source-strip" aria-label="Analytics source status"><div><Icons.dashboard size={18}/><span><strong>PostHog</strong>{posthogWarning || "Consent-based product events"}</span></div><div><Icons.globe size={18}/><span><strong>Cloudflare</strong>{cloudflareWarning || "Aggregate traffic totals"}</span></div></section>
      <section className="analytics-kpis" aria-label="Key analytics"><Metric label="Unique users" value={query.data?.cloudflare?.visitors} note="Cloudflare"/><Metric label="Page loads" value={query.data?.cloudflare?.pageLoads} note="Cloudflare"/><Metric label="Searches" value={events.search_performed} note="PostHog"/><Metric label="Place views" value={events.place_opened} note="PostHog"/><Metric label="Directions" value={events.directions_clicked} note="PostHog"/><Metric label="Submissions" value={events.place_submission_completed} note="PostHog"/><Metric label="Reports" value={events.place_reported} note="PostHog"/></section>
      <section className="analytics-panel"><header><div><span className="eyebrow">PRODUCT USE</span><h2>Feature activity</h2></div><button className="pp-btn" onClick={() => query.refetch()} disabled={query.isFetching}>{query.isFetching ? "Refreshing" : "Refresh"}</button></header>{query.data?.posthog?.ok ? <div className="analytics-list">{Object.entries(label).map(([key, name]) => <div key={key}><span>{name}</span><strong>{number(events[key])}</strong></div>)}</div> : <div className="inline-empty">PostHog events will appear here after its server API key and project ID are configured.</div>}</section>
      <p className="analytics-footnote">Live results are cached for five minutes. Aggregate daily snapshots are retained in Manarah’s D1 database for future time-series reporting.</p>
    </>}
  </div>;
}
function Metric({ label, value, note }) { return <div className="analytics-kpi"><span>{label}</span><strong>{number(value)}</strong><small>{note}</small></div>; }
