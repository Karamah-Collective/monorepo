import { useSystemHealth } from "../api/queries.js";
import { Icons } from "../icons.jsx";
import { LoadingState } from "../components/QueryState.jsx";

const LABELS = { frontend: "Web", api: "API", database: "D1" };
function State({ value }) { return <span className={`health-state health-${String(value || "Unknown").toLowerCase()}`}>{value || "Unknown"}</span>; }
function date(value) { return value ? new Date(value).toLocaleString() : "Unavailable"; }
function duration(seconds) { if (!seconds) return "Unavailable"; const minutes = Math.round(seconds / 60); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
function metric(value, suffix = "") { return Number.isFinite(Number(value)) ? `${Number(value).toFixed(suffix === "%" ? 3 : 0)}${suffix}` : "Unavailable"; }

function UptimeMeter({ value, history = [] }) {
  const uptime = Math.max(0, Math.min(100, Number(value)));
  const buckets = history.slice(-30);
  return <div className="health-uptime-value"><i className={`health-uptime-meter${buckets.length ? " health-uptime-history" : ""}`} role="meter" aria-label={`${uptime.toFixed(3)} percent uptime over the last 24 hours`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={uptime}>{buckets.length ? buckets.map((bucket, index) => <b className={bucket >= 100 ? "is-up" : "is-down"} key={index} />) : <b style={{ "--uptime-percent": `${uptime}%` }} />}</i><strong>{metric(uptime, "%")}</strong></div>;
}

function ComponentRow({ id, component }) {
  const hasUptime = component.uptime != null && Number.isFinite(Number(component.uptime));
  const hasResponseTime = id === "frontend" && Number.isFinite(Number(component.responseTime));
  return <article className={`health-component-row${component.lastChecked ? "" : " health-component-row-no-check"}`}>
    <div className="health-component-name"><span>{LABELS[id]}</span><State value={component.status} /></div>
    {component.lastChecked && <div className="health-component-detail"><span>Checked</span><strong>{date(component.lastChecked)}</strong></div>}
    {hasUptime && <div className="health-component-detail health-component-performance"><span>{hasResponseTime ? `24h uptime / ${metric(component.responseTime, " ms")}` : "24h uptime"}</span><UptimeMeter value={component.uptime} history={component.uptimeHistory} /></div>}
  </article>;
}

function LastDaySummary({ services, incidents = [] }) {
  const uptimeValues = services.flatMap((service) => Object.values(service.components).map((component) => component.uptime).filter((value) => value != null && Number.isFinite(Number(value))));
  const overallUptime = uptimeValues.length ? uptimeValues.reduce((total, value) => total + Number(value), 0) / uptimeValues.length : null;
  const startedAfter = Date.now() - 24 * 60 * 60 * 1000;
  const recentIncidents = incidents.filter((incident) => incident.startedAt && new Date(incident.startedAt).getTime() >= startedAfter).length;
  return <aside className="health-last-day" aria-label="Last 24 hours system health"><header><h3>Last 24 hours</h3><span>Live monitor data</span></header><div><strong>{overallUptime == null ? "Unavailable" : metric(overallUptime, "%")}</strong><small>Overall uptime</small></div><div><strong>{uptimeValues.length}</strong><small>Components tracked</small></div><div><strong>{recentIncidents}</strong><small>Incidents</small></div></aside>;
}

function Service({ service }) {
  return <section className="health-service">
    <header className="health-service-header"><div><span className="analytics-kicker">APPLICATION</span><h3>{service.name}</h3></div><State value={service.status} /></header>
    <div className="health-summary"><div><span>Web uptime</span><strong>{metric(service.uptime, "%")}</strong><small>Last 24 hours</small></div><div><span>Response time</span><strong>{metric(service.responseTime, " ms")}</strong><small>Web monitor</small></div></div>
    <div className="health-components" aria-label={`${service.name} component status`}>{Object.entries(service.components).map(([id, component]) => <ComponentRow id={id} component={component} key={id} />)}</div>
  </section>;
}

export function SystemHealthPanel({ days = 30 }) {
  const { data, isLoading, error, refetch, isFetching } = useSystemHealth(days);
  return <section className="system-health-page" id="system-health" aria-labelledby="system-health-title">
    <header className="system-health-heading"><div><span className="analytics-kicker">SYSTEM HEALTH</span><h2 id="system-health-title">Live infrastructure</h2><p>Availability of Manarah and Forms, sourced from UptimeRobot.</p></div><button className="pp-btn health-refresh" onClick={() => refetch()} disabled={isFetching}><Icons.refresh />{isFetching ? "Refreshing" : "Refresh"}</button></header>
    {isLoading && <LoadingState />}
    {error && <div className="query-error" role="alert"><strong>System Health could not be loaded</strong><p>{error.message}</p><button className="pp-btn" onClick={() => refetch()}>Try again</button></div>}
    {data && <>
      {data.warning && <div className="health-notice"><Icons.warning size={19} />{data.warning}</div>}
      <div className="health-overview"><LastDaySummary services={data.services} incidents={data.incidents} /><div className="health-services">{data.services.map((service) => <Service key={service.id} service={service} />)}</div></div>
      <section className="health-incidents" aria-labelledby="incident-history-title"><header><div><span className="analytics-kicker">INCIDENT HISTORY</span><h3 id="incident-history-title">Recent interruptions</h3></div><span className="health-incident-period">Selected range: {days === 1 ? "24h" : `${days}d`}</span></header>{data.incidents?.length ? <div className="health-incident-table"><div className="health-incident-head"><span>Application</span><span>Component</span><span>Incident start</span><span>Recovery time</span><span>Duration</span></div>{data.incidents.map((incident, index) => <div className="health-incident-row" key={`${incident.application}-${incident.startedAt}-${index}`}><span>{incident.application}</span><span>{LABELS[incident.component] || incident.component}</span><span>{date(incident.startedAt)}</span><span>{date(incident.recoveredAt)}</span><span>{duration(incident.durationSeconds)}</span></div>)}</div> : <div className="health-widget-empty">{data.incidentsAvailable === false ? "Incident history is temporarily unavailable." : "No incidents in the selected period."}</div>}</section>
      <p className="health-updated">{data.generatedAt ? `Last refreshed ${date(data.generatedAt)}` : "Refresh time unavailable"}{data.cached ? " / cached server-side" : ""}</p>
    </>}
  </section>;
}

export default function SystemHealthPage() { return <div className="pp-page"><SystemHealthPanel /></div>; }
