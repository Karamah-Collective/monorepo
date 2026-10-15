import { useEffect, useMemo, useState } from "react";
import { Check, ShieldCheck, SignIn } from "@phosphor-icons/react";
import { apiGet, apiPost } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";

const title = scope => String(scope || "").replace(/^admin:/, "").replaceAll(".", " · ");
const GROUPS = { access: "Access control", activity: "Workspace activity", analytics: "Analytics", dashboard: "Workspace", forms: "Forms", inbox: "Inbox", links: "Links", maps: "Maps", moderation: "Moderation", operations: "Projects & operations", reports: "Reports", website: "Website" };
const groupName = scope => scope === "admin:*" ? "Workspace-wide" : GROUPS[String(scope || "").replace(/^admin:/, "").split(".")[0]] || "Other access";

function groupedScopes(scopes) {
  const groups = new Map();
  for (const scope of scopes) {
    const name = groupName(scope);
    groups.set(name, [...(groups.get(name) || []), scope]);
  }
  return [...groups];
}

export default function McpConsentPage() {
  const { user, signInWithGoogle } = useAuth();
  const requestId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("request") || params.get("request_id") || "";
  }, []);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const request = useQueryState(requestId, user);

  useEffect(() => { if (request.data) setSelected(request.data.defaultScopes || []); }, [request.data]);

  if (!user) return <div className="mcp-consent-shell"><section className="pp-panel mcp-consent-card"><div className="mcp-consent-mark"><ShieldCheck size={28} /></div><div className="eyebrow">SECURE MCP CONSENT</div><h1>Sign in to choose Admin access</h1><p>Your Firebase identity is used only to show your current role and issue a separate OAuth connection. It is never given to the MCP client.</p><button className="pp-btn pp-btn-primary" type="button" onClick={() => signInWithGoogle().catch(error => setError(error.message || "Sign-in failed."))}><SignIn size={16} />Continue with Google</button>{error && <p className="pp-error-text">{error}</p>}</section></div>;
  if (request.isLoading) return <div className="mcp-consent-shell"><section className="pp-panel mcp-consent-card"><div className="loading-state">Checking the authorization request…</div></section></div>;
  if (request.error || !request.data) return <div className="mcp-consent-shell"><section className="pp-panel mcp-consent-card"><div className="eyebrow">MCP REQUEST UNAVAILABLE</div><h1>This authorization request cannot continue</h1><p>{request.error?.message || "It may have expired. Start the connection again from your MCP client."}</p></section></div>;

  const available = request.data.availableScopes || [];
  const groups = groupedScopes(available);
  const allSelected = available.length > 0 && available.every(scope => selected.includes(scope));
  const toggle = scope => setSelected(current => current.includes(scope) ? current.filter(item => item !== scope) : [...current, scope]);
  async function approve() {
    setSubmitting(true); setError("");
    try { const result = await apiPost("mcp-consent", { requestId, selectedScopes: selected }); window.location.assign(result.redirectUri); } catch (caught) { setError(caught.message || "Consent could not be completed."); setSubmitting(false); }
  }
  function deny() { const redirect = new URL(request.data.redirectUri); redirect.searchParams.set("error", "access_denied"); if (request.data.state) redirect.searchParams.set("state", request.data.state); window.location.assign(redirect.toString()); }

  return <div className="mcp-consent-shell"><section className="pp-panel mcp-consent-card"><div className="mcp-consent-mark"><ShieldCheck size={28} /></div><div className="eyebrow">MCP CONNECTION / CONSENT</div><h1>Allow {request.data.clientName || "this MCP client"} to use Admin?</h1><p className="mcp-consent-identity">Signed in as <strong>{user.email}</strong> · Current role: <strong>{request.data.access?.roleName || "Workspace member"}</strong></p><div className="mcp-scope-heading"><div><h2>Choose capabilities</h2><p>The client can use only these selected grants, and your role is checked again on every call.</p></div><div className="mcp-scope-heading-actions"><span>{selected.length} selected</span><button className="mcp-scope-select-all" type="button" disabled={!available.length} aria-pressed={allSelected} onClick={() => setSelected(allSelected ? [] : available)}>{allSelected ? "Clear all" : "Select all"}</button></div></div><div className="mcp-scope-list">{groups.map(([group, scopes]) => <section className="mcp-scope-group" key={group}><h3>{group}</h3>{scopes.map(scope => <label key={scope} className={selected.includes(scope) ? "is-selected" : ""}><input type="checkbox" checked={selected.includes(scope)} onChange={() => toggle(scope)} /><span><Check size={15} />{scope === "admin:*" ? "All current and future capabilities" : title(scope)}</span></label>)}</section>)}</div>{error && <p className="pp-error-text">{error}</p>}<div className="mcp-consent-actions"><button className="pp-btn pp-btn-text" type="button" onClick={deny}>Cancel</button><button className="pp-btn pp-btn-primary" type="button" disabled={!selected.length || submitting} onClick={approve}>{submitting ? "Authorizing…" : "Authorize connection"}</button></div></section></div>;
}

function useQueryState(requestId, user) {
  const [state, setState] = useState({ isLoading: Boolean(user && requestId), data: null, error: null });
  useEffect(() => {
    let active = true;
    if (!user || !requestId) { setState({ isLoading: false, data: null, error: new Error("Missing authorization request.") }); return () => { active = false; }; }
    setState({ isLoading: true, data: null, error: null });
    apiGet("mcp-consent-request", { request: requestId }).then(data => active && setState({ isLoading: false, data, error: null })).catch(error => active && setState({ isLoading: false, data: null, error }));
    return () => { active = false; };
  }, [requestId, user?.email]);
  return state;
}
