import { Link } from "react-router-dom";
import { useAdminLog, useAdminStats, useMapAnalytics, useSystemHealth } from "../api/queries.js";
import { useForms } from "../api/forms.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { Icons } from "../icons.jsx";
import { LoadingState } from "../components/QueryState.jsx";

const number = (value) => Number(value || 0).toLocaleString();
const QUEUES = [
  ["pendingNew", "New places", "Community submissions ready for a first look", "plusCircle", "/submissions/new"],
  ["pendingEdits", "Place edits", "Updates to existing places on the map", "pencil", "/submissions/edits"],
  ["pendingEvents", "Events", "Upcoming gatherings awaiting approval", "calendar", "/events"],
  ["pendingEventEdits", "Event edits", "Changes to dates, times, and event details", "calendar", "/events/edits"],
  ["pendingWishes", "Community wishes", "Ideas and requests from the community", "heart", "/wishes"],
];
const CATEGORIES = [["restaurant", "Food & restaurants", "utensils"], ["space", "Community spaces", "building"], ["service", "Shops & services", "bag"]];

function PanelHeader({ eyebrow, title, icon, to, action }) { const Icon = Icons[icon]; return <header className="overview-panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{to ? <Link to={to}>{action} <Icons.arrowUpRight size={15} /></Link> : <Icon size={21} />}</header>; }
function HealthPanel() {
  const health = useSystemHealth(); const services = health.data?.services || [];
  const operational = services.length && services.every((service) => String(service.status || "").toLowerCase() === "operational");
  return <section className="overview-panel health-panel"><PanelHeader eyebrow="SYSTEM HEALTH" title="Service monitoring" icon="pulse" />
    {health.isLoading ? <p className="overview-empty">Checking service status…</p> : services.length ? <><div className={`health-overall${operational ? " is-operational" : ""}`}><span><Icons.check size={18} /></span><div><strong>{operational ? "All systems operational" : "Service attention needed"}</strong><small>{operational ? "Every monitored service is responding normally." : "Check the service cards for the current state."}</small></div></div><div className="health-services">{services.map((service) => <article key={service.id}><header><strong>{service.name}</strong><b className={`health-${String(service.status || "unknown").toLowerCase()}`}>{service.status || "Unknown"}</b></header><div className="health-components">{["frontend", "api", "database"].filter((part) => service.components?.[part]).map((part) => <span key={part}>{part === "frontend" ? "Web" : part === "api" ? "API" : "Database"}<i className={`health-${String(service.components[part]?.status || "unknown").toLowerCase()}`} /></span>)}</div></article>)}</div></> : <p className="overview-empty">Monitoring data is unavailable.</p>}
    <Link className="overview-panel-footer" to="/analytics#system-health">Open System Health <Icons.arrowUpRight size={16} /></Link>
  </section>;
}
function FormsPanel({ forms, error }) {
  const list = forms || []; const published = list.filter((form) => form.status === "published").length; const responses = list.reduce((total, form) => total + Number(form.responseCount || 0), 0);
  return <section className="overview-panel forms-panel"><PanelHeader eyebrow="FORMS" title="Response analytics" icon="forms" to="/forms" action="Open forms" />
    {error ? <p className="overview-empty">Forms are temporarily unavailable.</p> : <><div className="forms-metrics"><div><strong>{number(list.length)}</strong><span>forms</span></div><div><strong>{number(published)}</strong><span>published</span></div><div><strong>{number(responses)}</strong><span>responses</span></div></div>{list.length ? <Link className="latest-form" to={`/forms/${list[0].id}`}><span>Latest form</span><strong>{list[0].title || "Untitled form"}</strong><small>{number(list[0].responseCount)} responses <Icons.right size={14} /></small></Link> : <p className="forms-empty">No forms yet. This panel will show publishing and response trends as soon as you start collecting.</p>}</>}
  </section>;
}
function Activity({ entries }) { return <section className="overview-panel activity-panel"><PanelHeader eyebrow="TEAM WORKSPACE" title="Recent activity" icon="clock" to="/log" action="View log" /><div className="activity-list">{entries.length ? entries.map((entry) => { const person = entry.actorName || entry.actorEmail || "Workspace member"; return <div className="activity-row" key={entry.id}><span>{person.slice(0, 2).toUpperCase()}</span><div><strong>{person}</strong><small>{String(entry.action || "Updated").replace(/[-_]/g, " ")}</small></div>{entry.success ? <Icons.check size={15} /> : <Icons.warning size={15} />}</div> }) : <p className="overview-empty">New activity will appear here.</p>}</div></section>; }

export default function DashboardPage() {
  const stats = useAdminStats(); const forms = useForms({ sort: "updated_at" }); const log = useAdminLog(); const analytics = useMapAnalytics(30); const systemHealth = useSystemHealth(); const { user } = useAuth(); const data = stats.data;
  const pending = QUEUES.reduce((total, [key]) => total + Number(data?.[key] || 0), 0); const total = Number(data?.totalPlaces || 0);
  const knownCategories = CATEGORIES.reduce((sum, [key]) => sum + Number(data?.byType?.[key] || 0), 0); const categories = total > knownCategories ? [...CATEGORIES, ["other", "Other places", "pin"]] : CATEGORIES;
  const date = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const analyticsReady = !analytics.isLoading && !analytics.error && analytics.data;
  const events = analytics.data?.posthog?.events || {};
  const analyticsNumber = (value) => analyticsReady ? number(value) : "—";
  const uptimeValues = (systemHealth.data?.services || []).flatMap((service) => Object.values(service.components || {}).map((component) => Number(component.uptime)).filter(Number.isFinite));
  const averageAvailability = uptimeValues.length ? `${(uptimeValues.reduce((sum, uptime) => sum + uptime, 0) / uptimeValues.length).toFixed(2)}%` : "—";
  return <main className="pp-page legacy-overview"><header className="legacy-heading"><div><span className="eyebrow">WORKSPACE OVERVIEW</span><h1 className="pp-page-title">Welcome back, {user?.displayName?.split(" ")[0] || "there"}<i>.</i></h1><p>Your community, at a glance.</p></div><div><span><Icons.calendar size={15} />{date}</span><button className="pp-btn" disabled={stats.isFetching} onClick={() => stats.refetch()}><Icons.refresh size={16} />{stats.isFetching ? "Refreshing" : "Refresh"}</button></div></header>
    {stats.isLoading && !data && <LoadingState />}{stats.error && <div className="query-error" role="alert"><strong>Overview could not be loaded</strong><p>{stats.error.message}</p><button className="pp-btn" onClick={() => stats.refetch()}>Try again</button></div>}
    {data && <><section className="legacy-metrics">{[["Places in your directory", number(total), "Across all place categories", "pin", "/places"], ["Unique visitors", analyticsNumber(analytics.data?.cloudflare?.visitors), "Last 30 days", "globe", "/analytics"], ["Average availability", averageAvailability, "Across monitors, last 24h", "pulse", "/analytics#system-health"], ["Place views", analyticsNumber(events.place_opened), "Last 30 days", "rows", "/analytics"]].map(([label, value, note, icon, to]) => { const Icon = Icons[icon]; return <Link to={to} key={label}><div><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{note}</small></Link>; })}</section>
      <div className="legacy-grid"><div className="overview-column"><section className="overview-panel review-panel"><PanelHeader eyebrow="MAKE AN IMPACT" title={<>Your review queue <b className="count-pill">{number(pending)}</b></>} icon="shield" /><div className="queue-intro"><Icons.shield size={21} /><div><strong>{pending ? "A little attention. A better map." : "You’re all caught up."}</strong><small>{pending ? "Help keep community information useful and reliable." : "New submissions will appear here when they arrive."}</small></div><Link className="pp-btn pp-btn-primary" to={pending ? QUEUES.find(([key]) => data[key])?.[4] : "/submissions/new"}>Review <Icons.arrowRight size={15} /></Link></div><div className="queue-list">{QUEUES.map(([key, title, text, icon, to]) => { const Icon = Icons[icon]; return <Link to={to} key={key}><span><Icon size={17} /></span><div><strong>{title}</strong><small>{text}</small></div><b>{number(data[key])}</b><Icons.right size={14} /></Link>; })}</div><footer><Icons.check size={14} />Every decision is recorded in your activity log.</footer></section><HealthPanel /></div>
        <div className="overview-column"><section className="overview-panel category-panel"><PanelHeader eyebrow="THE BIGGER PICTURE" title="Places by category" icon="globe" /><div className="category-total"><strong>{number(total)}</strong><span>places in the directory<small>Built by your community</small></span></div><div className="category-stack">{categories.map(([key]) => <i key={key} style={{ flex: key === "other" ? total - knownCategories : Number(data.byType?.[key] || 0) }} />)}</div><div className="category-list">{categories.map(([key, label, icon]) => { const Icon = Icons[icon]; const value = key === "other" ? total - knownCategories : Number(data.byType?.[key] || 0); return <Link to="/places" key={key}><span><Icon size={16} /></span><strong>{label}</strong><b>{number(value)}</b><small>{total ? Math.round(value / total * 100) : 0}%</small></Link>; })}</div><Link className="overview-panel-footer" to="/places">Explore your directory <Icons.arrowUpRight size={16} /></Link></section>
        <div className="side-stack"><FormsPanel forms={forms.data?.forms} error={forms.error} /><Activity entries={log.data?.entries?.slice(0, 5) || []} /></div></div></div></>}
  </main>;
}
