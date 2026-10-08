import { Link } from "react-router-dom";
import { useSystemHealth } from "../api/queries.js";
import { Icons } from "../icons.jsx";

const LABELS = { frontend: "Web", api: "API", database: "Database" };
function State({ value }) { return <span className={`health-state health-${String(value || "Unknown").toLowerCase()}`}>{value || "Unknown"}</span>; }

export default function SystemHealthWidget() {
  const { data, isLoading } = useSystemHealth(30);
  return <section className="dashboard-panel system-health-widget">
    <div className="panel-heading"><div><span className="eyebrow">SYSTEM HEALTH</span><h2>Service monitoring</h2></div><Icons.pulse size={21} /></div>
    {isLoading ? <div className="health-widget-empty">Loading monitor status…</div> : data?.services?.length ? <div className="health-widget-services">{data.services.map(service => <div className="health-widget-service" key={service.id}><div><strong>{service.name}</strong><State value={service.status} /></div>{["frontend", "api", "database"].map(component => <div className="health-widget-component" key={component}><span>{LABELS[component]}</span><State value={service.components[component]?.status} /></div>)}</div>)}</div> : <div className="health-widget-empty">{data?.warning || "Monitoring data is unavailable."}</div>}
    <Link className="coverage-link" to="/analytics#system-health">Open System Health <Icons.arrowUpRight size={17} /></Link>
  </section>;
}
