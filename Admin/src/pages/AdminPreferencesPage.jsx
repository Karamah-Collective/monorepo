import { useEffect, useState } from "react";
import { useToast } from "../components/Toast.jsx";

function stored(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function Choice({ title, description, value, onChange, options }) {
  return <section className="admin-preference-row">
    <div><h2>{title}</h2><p>{description}</p></div>
    <div className="admin-choice-group" role="radiogroup" aria-label={title}>
      {options.map((option) => <button type="button" key={option.value} role="radio" aria-checked={value === option.value} className={value === option.value ? "is-selected" : ""} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  </section>;
}

export default function AdminPreferencesPage() {
  const toast = useToast();
  const [sidebar, setSidebar] = useState(() => stored("admin-sidebar", "expanded"));
  const [density, setDensity] = useState(() => stored("admin-table-density", "compact"));
  const [pageSize, setPageSize] = useState(() => stored("admin-table-page-size", "25"));
  const [readingScale, setReadingScale] = useState(() => stored("admin-reading-scale", "standard"));
  const [motion, setMotion] = useState(() => stored("admin-motion", "standard"));
  const [contrast, setContrast] = useState(() => stored("admin-contrast", "standard"));
  useEffect(() => {
    try {
      localStorage.setItem("admin-sidebar", sidebar);
      localStorage.setItem("admin-table-density", density);
      localStorage.setItem("admin-table-page-size", pageSize);
      localStorage.setItem("admin-reading-scale", readingScale);
      localStorage.setItem("admin-motion", motion);
      localStorage.setItem("admin-contrast", contrast);
      document.documentElement.dataset.adminMotion = motion;
      document.documentElement.dataset.adminReadingScale = readingScale;
      document.documentElement.dataset.adminContrast = contrast;
      window.dispatchEvent(new Event("admin-preferences"));
    } catch {}
  }, [sidebar, density, pageSize, readingScale, motion, contrast]);

  return <div className="pp-page admin-preferences-page">
    <h1 className="pp-page-title">Admin preferences</h1>
    <p className="pp-page-lead">Personal workspace choices stored in this browser. They never affect public Maps, Website, or Links.</p>
    <div className="admin-preferences-panel">
      <Choice title="Sidebar" description="Choose whether your navigation begins expanded or compact on desktop." value={sidebar} onChange={setSidebar} options={[{ value: "expanded", label: "Expanded" }, { value: "collapsed", label: "Compact" }]} />
      <Choice title="Table density" description="Use comfortable rows by default, or choose compact rows when reviewing large collections." value={density} onChange={setDensity} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
      <Choice title="Rows per page" description="Set the default review batch size for every table you open." value={pageSize} onChange={setPageSize} options={[{ value: "10", label: "10 rows" }, { value: "25", label: "25 rows" }, { value: "50", label: "50 rows" }]} />
      <Choice title="Reading size" description="Choose the default text scale for this admin workspace." value={readingScale} onChange={setReadingScale} options={[{ value: "standard", label: "Standard" }, { value: "large", label: "Larger" }]} />
      <Choice title="Interface motion" description="Keep subtle transitions, or reduce movement beyond your system preference." value={motion} onChange={setMotion} options={[{ value: "standard", label: "Standard" }, { value: "quiet", label: "Reduced" }]} />
      <Choice title="Surface contrast" description="Use the standard soft workspace, or make panels and controls more defined." value={contrast} onChange={setContrast} options={[{ value: "standard", label: "Soft" }, { value: "defined", label: "Defined" }]} />
    </div>
    <button className="pp-btn pp-btn-primary" type="button" onClick={() => toast("Admin preferences are saved in this browser")}>Preferences saved locally</button>
  </div>;
}
