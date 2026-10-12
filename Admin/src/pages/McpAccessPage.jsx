import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowSquareOut, CheckCircle, Copy, Key, LinkSimple, LockKey, ShieldCheck, Trash, WarningCircle } from "@phosphor-icons/react";
import { apiGet, apiPost } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { can } from "../auth/permissions.js";
import { useToast } from "../components/Toast.jsx";

const label = scope => String(scope || "").replace(/^admin:/, "").replaceAll(".", " \u00b7 ");

const clientGuides = [
  {
    name: "ChatGPT",
    mark: "C",
    description: "Custom MCP app or connector",
    steps: [
      "Open a workspace where custom MCP apps or Developer mode are enabled.",
      "Create a custom app, enter the server URL, and choose OAuth.",
      "Complete sign-in, select the grants for this connection, and enable the app in a chat.",
    ],
    href: "https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt",
    link: "ChatGPT setup details",
  },
  {
    name: "Claude",
    mark: "A",
    description: "Claude or Claude Desktop custom connector",
    steps: [
      "Open Settings, then Connectors, then Add custom connector.",
      "Paste the server URL and choose Connect.",
      "Finish sign-in and scope selection, then enable the connector from the chat tools menu.",
    ],
    href: "https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp",
    link: "Claude setup details",
  },
  {
    name: "Gemini",
    mark: "G",
    description: "Gemini API or compatible MCP client",
    steps: [
      "Register a remote MCP server named karamah_admin.",
      "Use the server URL with Streamable HTTP.",
      "Complete OAuth discovery when supported, or use an OAuth-capable bridge.",
    ],
    href: "https://ai.google.dev/gemini-api/docs/function-calling",
    link: "Gemini setup details",
  },
  {
    name: "Any MCP client",
    mark: "M",
    description: "Inspectors, IDEs, agents, and custom clients",
    steps: [
      "Enter the server URL and let the client discover the OAuth metadata.",
      "Use dynamic registration, exact redirect URI matching, and S256 PKCE.",
      "Start with read access. Add writes only when you are ready to approve confirmations.",
    ],
    href: "https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization",
    link: "MCP authorization details",
  },
];

function copy(value, toast) {
  const result = navigator.clipboard?.writeText(value);
  if (!result) return toast("Clipboard unavailable");
  result.then(() => toast("Copied to clipboard")).catch(() => toast("Copy failed"));
}

function GuideLink({ href, children }) {
  return <a className="mcp-guide-link" href={href} target="_blank" rel="noreferrer">{children} <ArrowSquareOut size={13} /></a>;
}

function GrantPills({ grants = [] }) {
  return <div className="mcp-grants">{grants.map(grant => <span className={grant === "admin:*" ? "mcp-grant mcp-grant-wide" : "mcp-grant"} key={grant}>{grant === "admin:*" ? "All current + future access" : label(grant)}</span>)}</div>;
}

function ClientGuide({ endpoint }) {
  return <section className="mcp-section mcp-client-guide">
    <header className="mcp-section-header"><div><span className="mcp-kicker">PRODUCTION SETUP</span><h2>Connect an AI client</h2><p>Use the server URL, complete OAuth, then approve only the access this connection needs.</p></div><LinkSimple size={21} /></header>
    <div className="mcp-connect-steps">
      <div className="mcp-connect-step"><span>01</span><div><strong>Enter the server</strong><p>Paste the Streamable HTTP URL into your client's remote MCP or custom connector settings.</p><code>{endpoint}</code></div></div>
      <div className="mcp-connect-step"><span>02</span><div><strong>Authorize the connection</strong><p>The client opens Firebase sign-in and this Admin consent page. PKCE protects the authorization code.</p></div></div>
      <div className="mcp-connect-step"><span>03</span><div><strong>Choose the boundary</strong><p>Selected grants are intersected with your live Admin role on every request.</p></div></div>
    </div>
    <div className="mcp-client-notes"><div className="mcp-client-notes-label">Client notes</div>{clientGuides.map(client => <details className="mcp-client-note" key={client.name}><summary><span className="mcp-client-mark">{client.mark}</span><span><strong>{client.name}</strong><small>{client.description}</small></span></summary><div className="mcp-client-note-body"><ol>{client.steps.map(step => <li key={step}>{step}</li>)}</ol><GuideLink href={client.href}>{client.link}</GuideLink></div></details>)}</div>
  </section>;
}

export default function McpAccessPage() {
  const { access } = useAuth();
  const toast = useToast();
  const client = useQueryClient();
  const connections = useQuery({ queryKey: ["mcp-connections"], queryFn: () => apiGet("mcp-connections") });
  const revoke = useMutation({ mutationFn: connectionId => apiPost("mcp-revoke-connection", { connectionId }), onSuccess: () => { client.invalidateQueries({ queryKey: ["mcp-connections"] }); toast("MCP connection revoked"); } });
  const isAdmin = can(access, "*");
  const endpoint = `${window.location.origin}/mcp`;
  const connectionRows = connections.data?.connections || [];
  const activeConnections = connectionRows.filter(connection => connection.status !== "revoked").length;
  const accessSummary = useMemo(() => isAdmin ? "Administrator role, full role ceiling" : "Role-scoped access only", [isAdmin]);

  return <div className="pp-page mcp-page">
    <header className="mcp-page-header"><div><div className="eyebrow">WORKSPACE / ACCESS CONTROL</div><h1 className="pp-page-title">MCP access</h1><p>Connect AI tools to the Admin panel without creating a second permission system.</p></div><div className="mcp-page-status"><span><i />Policy live</span><small>OAuth 2.1 <b>·</b> PKCE</small></div></header>

    <section className="mcp-hero"><div className="mcp-hero-copy"><div className="mcp-hero-eyebrow"><ShieldCheck size={16} /> ROLE-SCOPED BY DEFAULT</div><h2>Powerful when approved.<br />Bounded when it matters.</h2><p>Every MCP request is evaluated against your current Admin role, this connection's grants, and resource ownership. Revocations and role changes apply immediately.</p><div className="mcp-policy-list"><div><CheckCircle size={17} /><span><strong>Live permission intersection</strong><small>Available tools change with your role.</small></span></div><div><LockKey size={17} /><span><strong>Protected write actions</strong><small>Publishing, sending, and access changes require confirmation.</small></span></div><div><Trash size={17} /><span><strong>Independent revocation</strong><small>Revoke one client without touching the others.</small></span></div></div></div><div className="mcp-server-card"><div className="mcp-server-card-top"><span>REMOTE SERVER</span><b><i />Available</b></div><code>{endpoint}</code><button className="mcp-copy-button" type="button" onClick={() => copy(endpoint, toast)}><Copy size={15} />Copy server URL</button><div className="mcp-server-meta"><span>Streamable HTTP</span><span>Bearer OAuth</span><span>Live policy</span></div></div></section>

    <section className="mcp-facts" aria-label="MCP access summary"><div><span>Current role</span><strong>{access?.roleName || "Loading role"}</strong><small>{accessSummary}</small></div><div><span>Role grants</span><strong>{access?.permissions?.includes("*") ? "Full administrator" : `${access?.permissions?.length || 0} permissions`}</strong><small>Connection grants cannot exceed this set</small></div><div><span>Active connections</span><strong>{connections.isLoading ? "—" : activeConnections}</strong><small>Named clients with separate revoke controls</small></div></section>

    <section className="mcp-section mcp-connections"><header className="mcp-section-header"><div><span className="mcp-kicker">AUTHORIZED CLIENTS</span><h2>Your connections</h2><p>Each client has its own grant set, token chain, and audit trail.</p></div><div className="mcp-connection-count"><Key size={15} /> {activeConnections} active</div></header>
      {connections.isLoading ? <div className="mcp-loading"><span className="mcp-loading-bar" /><span className="mcp-loading-bar" /><span className="mcp-loading-bar" /></div> : connectionRows.length ? <div className="mcp-connection-list">{connectionRows.map(connection => <article className={`mcp-connection ${connection.status === "revoked" ? "is-revoked" : ""}`} key={connection.id}><div className="mcp-connection-identity"><div className="mcp-connection-mark"><CheckCircle size={17} /></div><div><h3>{connection.client_name || "Unnamed MCP client"}</h3><p>{connection.actor_email} <b>·</b> Added {connection.created_at ? new Date(connection.created_at).toLocaleDateString() : "recently"}</p><GrantPills grants={connection.grants} /></div></div><div className="mcp-connection-activity"><div><span>{connection.status === "revoked" ? "Revoked" : "Last used"}</span><strong>{connection.status === "revoked" ? (connection.revoked_at ? new Date(connection.revoked_at).toLocaleDateString() : "Previously active") : connection.last_used_at ? new Date(connection.last_used_at).toLocaleString() : "Not used yet"}</strong></div>{connection.status !== "revoked" && <button className="mcp-revoke-button" type="button" disabled={revoke.isPending} onClick={() => { if (window.confirm(`Revoke ${connection.client_name || "this connection"}?`)) revoke.mutate(connection.id); }}><Trash size={15} />Revoke</button>}</div></article>)}</div> : <div className="mcp-empty"><div className="mcp-empty-mark"><Key size={20} /></div><div><h3>No connections yet</h3><p>Connect an AI client using the server URL above. Its OAuth consent will appear here once approved.</p></div></div>}
    </section>

    <ClientGuide endpoint={endpoint} />

    <footer className="mcp-page-footer"><div><WarningCircle size={16} /><span><strong>Keep the first connection narrow.</strong> Read access is a good starting point. Add write access only when the client and workflow are trusted.</span></div><span className="mcp-page-footer-role">{isAdmin ? "Administrator controls available" : "Role limits apply"}</span></footer>
  </div>;
}
