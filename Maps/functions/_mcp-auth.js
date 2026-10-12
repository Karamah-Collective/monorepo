import { resolveAccess } from "./api/admin.js";
import {
  MCP_PERMISSION_CATALOG,
  accessibleMcpPermissions,
  allowsPermissions,
  mcpScope,
  normalizeMcpGrants,
} from "../../shared/admin-access.mjs";

const textEncoder = new TextEncoder();
const ADMIN_ORIGIN = "https://admin.karamahcollective.com";
const ACCESS_TOKEN_TTL = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;
const AUTH_REQUEST_TTL = 10 * 60 * 1000;
const CODE_TTL = 60 * 1000;
const OFFLINE_ACCESS_SCOPE = "offline_access";

function base64Url(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(String(value))));
}
export async function hashMcpToken(value) { return base64Url(await digest(value)); }

export function randomMcpToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

function json(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function now() { return Date.now(); }

async function auditMcp(db, action, actor = {}, detail = {}, success = true) {
  try {
    const { buildAuditDetail, logAdminAction } = await import("./api/admin.js");
    await logAdminAction(db, {
      action: `mcp.${action}`,
      actor: { uid: actor.uid || "", email: actor.email || "", name: actor.name || "" },
      targetId: detail.connectionId || detail.clientId || "",
      detail: buildAuditDetail({ source: "mcp", ...detail }),
      success,
    });
  } catch (error) {
    console.error("MCP OAuth audit failed", error);
  }
}

function clientName(value) {
  return String(value || "Unnamed MCP client").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 160) || "Unnamed MCP client";
}

function redirectIsSafe(value) {
  try {
    const url = new URL(value);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function scopePermissions(scopes) {
  return normalizeMcpGrants(scopes);
}

function scopeList(grants) {
  return grants.map(mcpScope);
}

function resourceUrl(env = {}) {
  return String(env.MCP_RESOURCE_URL || `${ADMIN_ORIGIN}/mcp`).replace(/\/$/, "");
}

function authorizationOrigin(env = {}) {
  return String(env.MCP_AUTHORIZATION_SERVER_URL || ADMIN_ORIGIN).replace(/\/$/, "");
}

function requestedResource(value, env = {}) {
  const resource = String(value || "").trim();
  const expected = resourceUrl(env);
  if (resource && resource !== expected) throw new Error("The OAuth resource does not match this MCP server.");
  return expected;
}

export function mcpMetadata(env = {}) {
  const resource = resourceUrl(env);
  const authorization = authorizationOrigin(env);
  return {
    resource,
    authorization_servers: [authorization],
    // ChatGPT requires the OAuth server to advertise refresh-token access.
    // This is a protocol scope, not an Admin permission and is never stored
    // as a connection grant.
    scopes_supported: [OFFLINE_ACCESS_SCOPE, "admin:*", ...MCP_PERMISSION_CATALOG.map(mcpScope)],
    bearer_methods_supported: ["header"],
  };
}

export function oauthMetadata(env = {}) {
  const origin = authorizationOrigin(env);
  return {
    issuer: origin,
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: mcpMetadata(env).scopes_supported,
  };
}

export async function registerMcpClient(db, data) {
  const name = clientName(data.client_name || data.clientName);
  const redirectValue = data.redirect_uris || data.redirectUris || data.redirect_uri;
  const redirectUris = uniqueStrings(Array.isArray(redirectValue) ? redirectValue : [redirectValue]);
  const authMethod = String(data.token_endpoint_auth_method || "none");
  if (authMethod !== "none") throw new Error("Only public PKCE clients using token_endpoint_auth_method=none are supported.");
  if (redirectUris.length < 1 || redirectUris.length > 20 || redirectUris.some((uri) => uri.length > 2048 || !redirectIsSafe(uri))) throw new Error("Register one to twenty HTTPS or loopback redirect URIs.");
  const clientId = `mcp_${randomMcpToken(18)}`;
  await db.prepare("INSERT INTO admin_mcp_clients (client_id,client_name,redirect_uris,metadata,created_at,updated_at) VALUES (?,?,?,?,datetime('now'),datetime('now'))")
    .bind(clientId, name, JSON.stringify(redirectUris), JSON.stringify(data || {})).run();
  await auditMcp(db, "client.register", {}, { clientId, clientName: name, redirectUris });
  return {
    client_id: clientId,
    client_name: name,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(now() / 1000),
  };
}

export async function beginMcpAuthorization(db, params, env = {}) {
  const clientId = String(params.client_id || "").trim();
  const redirectUri = String(params.redirect_uri || "").trim();
  const challenge = String(params.code_challenge || "").trim();
  if (!clientId || clientId.length > 200 || !redirectUri || redirectUri.length > 2048 || !challenge || challenge.length > 200 || String(params.state || "").length > 512 || params.code_challenge_method !== "S256" || (params.response_type && params.response_type !== "code")) throw new Error("OAuth authorization requires response_type=code and PKCE S256.");
  requestedResource(params.resource, env);
  const client = await db.prepare("SELECT client_id,client_name,redirect_uris FROM admin_mcp_clients WHERE client_id=?").bind(clientId).first();
  if (!client) throw new Error("Unknown OAuth client.");
  const redirectUris = json(client.redirect_uris, []);
  if (!redirectUris.includes(redirectUri)) throw new Error("The redirect URI is not registered for this client.");
  const requestedScopes = uniqueStrings(String(params.scope || "").split(/\s+/));
  const requestedAdminScope = requestedScopes.some((scope) => scope === "admin:*" || scope.startsWith("admin:"));
  // Some MCP clients request only offline_access and leave the actual Admin
  // grant selection to the signed-in consent screen. Keep that flow usable by
  // presenting the full role-filtered Admin catalog in that case.
  if (!requestedAdminScope) requestedScopes.push("admin:*", ...MCP_PERMISSION_CATALOG.map(mcpScope));
  if (requestedScopes.length > 100) throw new Error("Too many requested MCP scopes.");
  const requestId = `req_${randomMcpToken(18)}`;
  await db.prepare(`INSERT INTO admin_mcp_authorization_requests
    (id,client_id,redirect_uri,state,code_challenge,code_challenge_method,requested_scopes,client_name,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(requestId, clientId, redirectUri, String(params.state || ""), challenge, "S256", JSON.stringify(requestedScopes), client.client_name || "", now() + AUTH_REQUEST_TTL).run();
  await auditMcp(db, "authorization.started", {}, { clientId, clientName: client.client_name || "", requestId, requestedScopes });
  const origin = authorizationOrigin(env);
  return `${origin}/mcp/authorize?request=${encodeURIComponent(requestId)}`;
}

export async function getMcpConsentRequest(db, requestId, actor, env = {}) {
  const row = await db.prepare("SELECT * FROM admin_mcp_authorization_requests WHERE id=? AND consumed_at IS NULL AND expires_at>? ").bind(String(requestId || ""), now()).first();
  if (!row) throw new Error("This MCP authorization request has expired.");
  const access = await resolveAccess(db, actor);
  if (!access) throw new Error("Your account does not have a workspace role.");
  const requestedScopes = json(row.requested_scopes, []);
  const availablePermissions = accessibleMcpPermissions(access.permissions);
  const availableScopes = availablePermissions.map(mcpScope);
  if (allowsPermissions(access.permissions, "*")) availableScopes.unshift("admin:*");
  return {
    requestId: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    requestedScopes,
    availableScopes: [...new Set(availableScopes)],
    defaultScopes: requestedScopes.filter((scope) => availableScopes.includes(scope)),
    redirectUri: row.redirect_uri,
    state: row.state,
    access: { roleId: access.roleId, roleName: access.roleName, permissions: access.permissions },
    resource: resourceUrl(env),
  };
}

export async function completeMcpConsent(db, data, actor, env = {}) {
  const row = await db.prepare("SELECT * FROM admin_mcp_authorization_requests WHERE id=? AND consumed_at IS NULL AND expires_at>? ").bind(String(data.requestId || ""), now()).first();
  if (!row) throw new Error("This MCP authorization request has expired.");
  const access = await resolveAccess(db, actor);
  if (!access) throw new Error("Your account does not have a workspace role.");
  const requested = new Set(json(row.requested_scopes, []));
  const selected = uniqueStrings(data.selectedScopes || []).filter((scope) => requested.has(scope) || scope === "admin:*");
  const grants = scopePermissions(selected);
  if (!grants.length) throw new Error("Choose at least one MCP capability.");
  if (grants.includes("*") && !allowsPermissions(access.permissions, "*")) throw new Error("Full MCP access is available only to administrators.");
  if (grants.some((permission) => !allowsPermissions(access.permissions, permission))) throw new Error("The selected MCP access exceeds your current Admin role.");
  const code = randomMcpToken(32);
  await db.prepare(`INSERT INTO admin_mcp_authorization_codes
    (code_hash,request_id,client_id,redirect_uri,code_challenge,actor_uid,actor_email,actor_name,grants,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(await hashMcpToken(code), row.id, row.client_id, row.redirect_uri, row.code_challenge, actor.uid, actor.email, actor.name || "", JSON.stringify(grants), now() + CODE_TTL).run();
  await db.prepare("UPDATE admin_mcp_authorization_requests SET consumed_at=?,actor_uid=?,actor_email=? WHERE id=?").bind(now(), actor.uid, actor.email, row.id).run();
  await auditMcp(db, "authorization.completed", actor, { clientId: row.client_id, requestId: row.id, grants: scopeList(grants) });
  const redirect = new URL(row.redirect_uri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("iss", authorizationOrigin(env));
  if (row.state) redirect.searchParams.set("state", row.state);
  return { redirectUri: redirect.toString(), grants: scopeList(grants) };
}

function tokenResponse(accessToken, refreshToken, grants, resource) {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL / 1000),
    refresh_token: refreshToken,
    resource,
    // Every connection receives a rotating refresh token, so expose the
    // corresponding OAuth scope alongside the role-scoped Admin grants.
    scope: [OFFLINE_ACCESS_SCOPE, ...scopeList(grants)].join(" "),
  };
}

async function issueTokens(db, connectionId, grants, resource, rotatedFrom = "") {
  const accessToken = randomMcpToken(32);
  const refreshToken = randomMcpToken(40);
  const issued = now();
  await db.prepare("INSERT INTO admin_mcp_tokens (token_hash,connection_id,token_type,expires_at,rotated_from,created_at) VALUES (?,?, 'access',?,?,?)")
    .bind(await hashMcpToken(accessToken), connectionId, issued + ACCESS_TOKEN_TTL, rotatedFrom || null, issued).run();
  await db.prepare("INSERT INTO admin_mcp_tokens (token_hash,connection_id,token_type,expires_at,created_at) VALUES (?,?, 'refresh',?,?)")
    .bind(await hashMcpToken(refreshToken), connectionId, issued + REFRESH_TOKEN_TTL, issued).run();
  return tokenResponse(accessToken, refreshToken, grants, resource);
}

export async function exchangeMcpToken(db, data, env = {}) {
  requestedResource(data.resource, env);
  const row = await db.prepare("SELECT * FROM admin_mcp_authorization_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>? ").bind(await hashMcpToken(data.code), now()).first();
  if (!row || row.client_id !== String(data.client_id || "") || row.redirect_uri !== String(data.redirect_uri || "")) throw new Error("Invalid authorization code.");
  const expected = base64Url(await digest(String(data.code_verifier || "")));
  if (!data.code_verifier || expected !== row.code_challenge) throw new Error("PKCE verification failed.");
  const consumed = await db.prepare("UPDATE admin_mcp_authorization_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL").bind(now(), row.code_hash).run();
  if (!((consumed.meta?.changes ?? consumed.meta?.rows_written) > 0)) throw new Error("Invalid authorization code.");
  const connectionId = `mcpconn_${randomMcpToken(18)}`;
  const grants = json(row.grants, []);
  await db.prepare(`INSERT INTO admin_mcp_connections
    (id,actor_uid,actor_email,client_id,client_name,grants,created_at,last_used_at)
    SELECT ?,?,?,?,?,?,datetime('now'),datetime('now') FROM admin_mcp_clients WHERE client_id=?`)
    .bind(connectionId, row.actor_uid, row.actor_email, row.client_id, "", JSON.stringify(grants), row.client_id).run();
  const client = await db.prepare("SELECT client_name FROM admin_mcp_clients WHERE client_id=?").bind(row.client_id).first();
  await db.prepare("UPDATE admin_mcp_connections SET client_name=? WHERE id=?").bind(client?.client_name || "MCP client", connectionId).run();
  await auditMcp(db, "connection.created", { uid: row.actor_uid, email: row.actor_email, name: row.actor_name }, { connectionId, clientId: row.client_id, clientName: client?.client_name || "MCP client", grants: scopeList(grants) });
  return issueTokens(db, connectionId, grants, resourceUrl(env));
}

export async function refreshMcpToken(db, data, env = {}) {
  requestedResource(data.resource, env);
  const row = await db.prepare(`SELECT t.*,c.status,c.client_id,c.grants FROM admin_mcp_tokens t
    JOIN admin_mcp_connections c ON c.id=t.connection_id
    WHERE t.token_hash=? AND t.token_type='refresh' AND t.revoked_at IS NULL AND t.expires_at>?`).bind(await hashMcpToken(data.refresh_token), now()).first();
  if (!row || row.status !== "active" || (data.client_id && data.client_id !== row.client_id)) throw new Error("Invalid refresh token.");
  const rotated = await db.prepare("UPDATE admin_mcp_tokens SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL").bind(now(), row.token_hash).run();
  if (!((rotated.meta?.changes ?? rotated.meta?.rows_written) > 0)) throw new Error("Invalid refresh token.");
  await auditMcp(db, "token.rotated", { uid: row.actor_uid, email: row.actor_email }, { connectionId: row.connection_id, clientId: row.client_id });
  return issueTokens(db, row.connection_id, json(row.grants, []), resourceUrl(env), row.token_hash);
}

export async function revokeMcpToken(db, data) {
  const hash = await hashMcpToken(data.token || data.refresh_token || "");
  await db.prepare("UPDATE admin_mcp_tokens SET revoked_at=? WHERE token_hash=?").bind(now(), hash).run();
  return { success: true };
}

export async function authenticateMcpBearer(db, authorization) {
  const token = /^Bearer\s+(.+)$/i.exec(String(authorization || ""))?.[1] || "";
  if (!token) return null;
  const row = await db.prepare(`SELECT t.token_hash,t.expires_at,t.connection_id,c.actor_uid,c.actor_email,c.client_id,c.client_name,c.grants,c.status
    FROM admin_mcp_tokens t JOIN admin_mcp_connections c ON c.id=t.connection_id
    WHERE t.token_hash=? AND t.token_type='access' AND t.revoked_at IS NULL`).bind(await hashMcpToken(token)).first();
  if (!row || row.status !== "active" || row.expires_at <= now()) return null;
  const actor = { uid: row.actor_uid, email: row.actor_email, name: "" };
  const access = await resolveAccess(db, actor);
  if (!access) return null;
  await db.prepare("UPDATE admin_mcp_connections SET last_used_at=datetime('now') WHERE id=?").bind(row.connection_id).run();
  return { connection: row, actor, access, grants: json(row.grants, []) };
}

export async function listMcpConnections(db, actor, includeAll = false) {
  const query = includeAll
    ? "SELECT id,actor_uid,actor_email,client_id,client_name,grants,status,created_at,last_used_at,revoked_at FROM admin_mcp_connections ORDER BY created_at DESC"
    : "SELECT id,actor_uid,actor_email,client_id,client_name,grants,status,created_at,last_used_at,revoked_at FROM admin_mcp_connections WHERE lower(actor_email)=lower(?) ORDER BY created_at DESC";
  const result = includeAll ? await db.prepare(query).all() : await db.prepare(query).bind(actor.email).all();
  return (result.results || []).map((row) => ({ ...row, grants: scopeList(json(row.grants, [])) }));
}

export async function revokeMcpConnection(db, connectionId, actor, includeAll = false) {
  const row = await db.prepare("SELECT actor_email FROM admin_mcp_connections WHERE id=?").bind(String(connectionId || "")).first();
  if (!row || (!includeAll && row.actor_email.toLowerCase() !== actor.email.toLowerCase())) throw new Error("MCP connection not found.");
  await db.prepare("UPDATE admin_mcp_connections SET status='revoked',revoked_at=datetime('now') WHERE id=?").bind(connectionId).run();
  await db.prepare("UPDATE admin_mcp_tokens SET revoked_at=? WHERE connection_id=? AND revoked_at IS NULL").bind(now(), connectionId).run();
  await auditMcp(db, "connection.revoked", actor, { connectionId });
  return { success: true };
}
