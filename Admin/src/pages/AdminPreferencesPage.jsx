import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { useDisconnectContactGmail, useDisconnectGmail, useDisconnectPersonalGmail, useContactGmailStatus, useGmailStatus, usePersonalGmailStatus, useStartContactGmailOAuth, useStartGmailOAuth, useStartPersonalGmailOAuth, useSyncContactGmail, useSyncGmail, useSyncPersonalGmail } from "../api/queries.js";
import { canInbox } from "../auth/permissions.js";
import { useToast } from "../components/Toast.jsx";

const CONTACT_MAILBOX = "contact@karamahcollective.com";

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
  const canManageContactGmail = canInbox(access, "write", "contact");
  const gmail = useGmailStatus({ enabled: isAdministrator });
  const contactGmail = useContactGmailStatus({ enabled: canManageContactGmail });
  const personalGmail = usePersonalGmailStatus({ enabled: Boolean(user) });
  const connect = useStartGmailOAuth();
  const connectContact = useStartContactGmailOAuth();
  const connectPersonal = useStartPersonalGmailOAuth();
  const sync = useSyncGmail();
  const syncContact = useSyncContactGmail();
  const syncPersonal = useSyncPersonalGmail();
  const disconnect = useDisconnectGmail();
  const disconnectContact = useDisconnectContactGmail();
  const disconnectPersonal = useDisconnectPersonalGmail();
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
    const contactResult = params.get("contactGmail");
    const personalResult = params.get("personalGmail");
    if (result === "connected") toast("Manarah Gmail connected");
    if (result === "error") toast(params.get("gmailError") || "Gmail could not be connected");
    if (contactResult === "connected") toast("Contact Gmail connected");
    if (contactResult === "error") toast(params.get("contactGmailError") || "Contact Gmail could not be connected");
    if (personalResult === "connected") toast("Your personal Gmail connected");
    if (personalResult === "error") toast(params.get("personalGmailError") || "Your personal Gmail could not be connected");
    if (result || contactResult || personalResult) navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate, toast]);

  function connectGmail() {
    connect.mutate({ returnTo: `${window.location.origin}${location.pathname}` }, {
      onSuccess: (result) => {
        if (result.authorizationUrl) window.location.assign(result.authorizationUrl);
      },
    });
  }

  function syncGmail() {
    sync.mutate(undefined, {
      onSuccess: (result) => toast(`Manarah Gmail synced · ${result.imported || 0} new message${result.imported === 1 ? "" : "s"}`),
    });
  }

  function connectContactGmail() {
    connectContact.mutate({ returnTo: `${window.location.origin}${location.pathname}`, mailbox: CONTACT_MAILBOX }, {
      onSuccess: (result) => {
        if (result.authorizationUrl) window.location.assign(result.authorizationUrl);
      },
    });
  }

  function syncContactGmail() {
    syncContact.mutate({ mailbox: CONTACT_MAILBOX }, {
      onSuccess: (result) => toast(`Contact Gmail synced Â· ${result.imported || 0} new message${result.imported === 1 ? "" : "s"}`),
    });
  }

  function connectPersonalGmail() {
    connectPersonal.mutate({ returnTo: `${window.location.origin}${location.pathname}` }, {
      onSuccess: (result) => {
        if (result.authorizationUrl) window.location.assign(result.authorizationUrl);
      },
    });
  }

  function syncPersonalGmail() {
    syncPersonal.mutate(undefined, {
      onSuccess: (result) => toast(`Personal Gmail synced · ${result.imported || 0} new message${result.imported === 1 ? "" : "s"}`),
    });
  }

  return <div className="pp-page admin-preferences-page">
    <h1 className="pp-page-title">Admin preferences</h1>
    {(isAdministrator || canManageContactGmail) && <p className="pp-page-lead gmail-connection-help">Your Admin sign-in and Gmail access are separate. Connect each mailbox once; Google handles the mailbox login and permission screen. The app’s OAuth setup stays on the server.</p>}
    {isAdministrator && <section className="admin-preferences-panel gmail-connection-panel" aria-label="Gmail connection">
      <div className="admin-preference-row">
        <div className="gmail-connection-copy"><h2>Manarah Gmail</h2><span className={`gmail-connection-state${gmail.data?.connected ? " is-connected" : ""}`}>{gmail.isLoading ? "Checking connection" : gmail.data?.connected ? gmail.data.accountEmail : !isGmailOwner ? "Primary admin setup pending" : gmail.data?.configured ? "Not connected" : "Gmail service not configured"}</span></div>
        <div className="gmail-connection-actions">
          {gmail.data?.connected && <button className="pp-btn" type="button" disabled={sync.isPending} onClick={syncGmail}>{sync.isPending ? "Syncing…" : "Sync now"}</button>}
          {isGmailOwner && gmail.data?.connected && <button className="pp-btn pp-btn-text" type="button" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>{disconnect.isPending ? "Disconnecting…" : "Disconnect"}</button>}
          {isGmailOwner && !gmail.data?.connected && <button className="pp-btn pp-btn-primary" type="button" disabled={connect.isPending} onClick={connectGmail}>{connect.isPending ? "Opening Google…" : "Connect Gmail"}</button>}
        </div>
      </div>
      {(connect.error || sync.error || disconnect.error || gmail.error) && <p className="pp-error-text gmail-connection-error">{(connect.error || sync.error || disconnect.error || gmail.error).message}</p>}
    </section>}
    {canManageContactGmail && <section className="admin-preferences-panel gmail-connection-panel contact-gmail-panel" data-can-disconnect={isGmailOwner ? "true" : "false"} aria-label="Contact Gmail connection">
      <div className="admin-preference-row">
        <div className="gmail-connection-copy"><h2>Contact Gmail</h2><p>Connect {CONTACT_MAILBOX} as the shared mailbox. Everyone with Contact inbox access will use this same connection.</p><span className={`gmail-connection-state${contactGmail.data?.connected ? " is-connected" : ""}`}>{contactGmail.isLoading ? "Checking connection" : contactGmail.data?.connected ? contactGmail.data.accountEmail : contactGmail.data?.configured ? "Not connected" : "Gmail service not configured"}</span></div>
        <div className="gmail-connection-actions">
          {contactGmail.data?.connected && <button className="pp-btn" type="button" disabled={syncContact.isPending} onClick={syncContactGmail}>{syncContact.isPending ? "Syncingâ€¦" : "Sync now"}</button>}
          {contactGmail.data?.connected && <button className="pp-btn pp-btn-text" type="button" disabled={disconnectContact.isPending} onClick={() => disconnectContact.mutate({ mailbox: CONTACT_MAILBOX })}>{disconnectContact.isPending ? "Disconnectingâ€¦" : "Disconnect"}</button>}
          {!contactGmail.data?.connected && <button className="pp-btn pp-btn-primary" type="button" disabled={connectContact.isPending} onClick={connectContactGmail}>{connectContact.isPending ? "Opening Googleâ€¦" : "Connect Contact Gmail"}</button>}
        </div>
      </div>
      {(connectContact.error || syncContact.error || disconnectContact.error || contactGmail.error) && <p className="pp-error-text gmail-connection-error">{(connectContact.error || syncContact.error || disconnectContact.error || contactGmail.error).message}</p>}
    </section>}
    <section className="admin-preferences-panel gmail-connection-panel" aria-label="Personal Gmail connection">
      <div className="admin-preference-row">
        <div className="gmail-connection-copy"><h2>Your Gmail</h2><p>Connect your Karamah email to read and send personal messages here. Only you can access this mailbox.</p><span className={`gmail-connection-state${personalGmail.data?.connected ? " is-connected" : ""}`}>{personalGmail.isLoading ? "Checking connection" : personalGmail.data?.connected ? personalGmail.data.accountEmail : personalGmail.data?.configured ? "Not connected" : "Gmail service not configured"}</span></div>
        <div className="gmail-connection-actions">
          {personalGmail.data?.connected && <button className="pp-btn" type="button" disabled={syncPersonal.isPending} onClick={syncPersonalGmail}>{syncPersonal.isPending ? "Syncing…" : "Sync"}</button>}
          {personalGmail.data?.connected && <button className="pp-btn pp-btn-text" type="button" disabled={disconnectPersonal.isPending} onClick={() => disconnectPersonal.mutate()}>{disconnectPersonal.isPending ? "Disconnecting…" : "Disconnect"}</button>}
          {!personalGmail.data?.connected && <button className="pp-btn pp-btn-primary" type="button" disabled={connectPersonal.isPending} onClick={connectPersonalGmail}>{connectPersonal.isPending ? "Opening Google…" : "Connect your Gmail"}</button>}
        </div>
      </div>
      {(connectPersonal.error || syncPersonal.error || disconnectPersonal.error || personalGmail.error) && <p className="pp-error-text gmail-connection-error">{(connectPersonal.error || syncPersonal.error || disconnectPersonal.error || personalGmail.error).message}</p>}
    </section>
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
