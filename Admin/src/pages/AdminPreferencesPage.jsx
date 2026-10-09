import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { useDisconnectGmail, useGmailStatus, useStartGmailOAuth, useSyncGmail } from "../api/queries.js";
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
  const location = useLocation();
  const navigate = useNavigate();
  const { user, access } = useAuth();
  const isAdministrator = access?.permissions?.includes("*");
  const isGmailOwner = user?.email?.toLowerCase() === "moontasir@karamahcollective.com";
  const gmail = useGmailStatus({ enabled: isAdministrator });
  const connect = useStartGmailOAuth();
  const sync = useSyncGmail();
  const disconnect = useDisconnectGmail();
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get("gmail");
    if (result === "connected") toast("Manarah Gmail connected");
    if (result === "error") toast(params.get("gmailError") || "Gmail could not be connected");
    if (result) navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate, toast]);

  function connectGmail() {
    connect.mutate({ returnTo: `${window.location.origin}${location.pathname}` }, {
      onSuccess: (result) => {
        if (result.authorizationUrl) window.location.assign(result.authorizationUrl);
      },
    });
  }

  return <div className="pp-page admin-preferences-page">
    <h1 className="pp-page-title">Admin preferences</h1>
    {isAdministrator && <section className="admin-preferences-panel gmail-connection-panel" aria-label="Gmail connection">
      <div className="admin-preference-row">
        <div className="gmail-connection-copy"><h2>Manarah Gmail</h2><span className={`gmail-connection-state${gmail.data?.connected ? " is-connected" : ""}`}>{gmail.isLoading ? "Checking connection" : gmail.data?.connected ? gmail.data.accountEmail : !isGmailOwner ? "Primary admin setup pending" : gmail.data?.configured ? "Not connected" : "Server setup needed"}</span></div>
        <div className="gmail-connection-actions">
          {gmail.data?.connected && <button className="pp-btn" type="button" disabled={sync.isPending} onClick={() => sync.mutate()}>{sync.isPending ? "Syncing…" : "Sync now"}</button>}
          {isGmailOwner && gmail.data?.connected && <button className="pp-btn pp-btn-text" type="button" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>{disconnect.isPending ? "Disconnecting…" : "Disconnect"}</button>}
          {isGmailOwner && !gmail.data?.connected && <button className="pp-btn pp-btn-primary" type="button" disabled={!gmail.data?.configured || connect.isPending} onClick={connectGmail}>{connect.isPending ? "Opening Google…" : "Connect Gmail"}</button>}
        </div>
      </div>
      {(connect.error || sync.error || disconnect.error || gmail.error) && <p className="pp-error-text gmail-connection-error">{(connect.error || sync.error || disconnect.error || gmail.error).message}</p>}
    </section>}
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
