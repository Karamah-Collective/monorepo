import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticateMcpBearer,
  beginMcpAuthorization,
  completeMcpConsent,
  exchangeMcpToken,
  mcpMetadata,
  oauthMetadata,
  refreshMcpToken,
  registerMcpClient,
  revokeMcpToken,
} from "../Maps/functions/_mcp-auth.js";

function fixture() {
  const tables = { clients: new Map(), requests: new Map(), codes: new Map(), connections: new Map(), tokens: new Map() };
  const db = {
    tables,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("FROM admin_mcp_clients")) {
                const row = tables.clients.get(values[0]);
                if (sql.includes("SELECT client_name")) return row && { client_name: row.client_name };
                return row || null;
              }
              if (sql.includes("FROM admin_mcp_authorization_requests")) {
                const row = tables.requests.get(values[0]);
                return row && !row.consumed_at && row.expires_at > Date.now() ? row : null;
              }
              if (sql.includes("FROM admin_mcp_authorization_codes")) {
                const row = tables.codes.get(values[0]);
                return row && !row.used_at && row.expires_at > Date.now() ? row : null;
              }
              if (sql.includes("FROM admin_mcp_tokens")) {
                const row = tables.tokens.get(values[0]);
                if (!row || row.revoked_at || row.expires_at <= Date.now()) return null;
                const connection = tables.connections.get(row.connection_id);
                if (!connection || connection.status !== "active") return null;
                if (sql.includes("token_type='refresh'")) return { ...row, ...connection };
                return { ...row, ...connection };
              }
              if (sql.includes("FROM admin_mcp_connections")) return tables.connections.get(values[0]) || null;
              if (sql.includes("FROM admin_role_members")) return { role_id: "administrator", display_name: "Test", name: "Administrator", permissions: JSON.stringify(["*"]) };
              return null;
            },
            async all() { return { results: [...tables.connections.values()] }; },
            async run() {
              if (sql.includes("INSERT INTO admin_mcp_clients")) tables.clients.set(values[0], { client_id: values[0], client_name: values[1], redirect_uris: values[2], metadata: values[3] });
              if (sql.includes("INSERT INTO admin_mcp_authorization_requests")) tables.requests.set(values[0], { id: values[0], client_id: values[1], redirect_uri: values[2], state: values[3], code_challenge: values[4], code_challenge_method: values[5], requested_scopes: values[6], client_name: values[7], expires_at: values[8] });
              if (sql.includes("INSERT INTO admin_mcp_authorization_codes")) tables.codes.set(values[0], { code_hash: values[0], request_id: values[1], client_id: values[2], redirect_uri: values[3], code_challenge: values[4], actor_uid: values[5], actor_email: values[6], actor_name: values[7], grants: values[8], expires_at: values[9] });
              if (sql.includes("INSERT INTO admin_mcp_connections")) tables.connections.set(values[0], { id: values[0], actor_uid: values[1], actor_email: values[2], client_id: values[3], client_name: values[4], grants: values[5], status: "active" });
              if (sql.includes("INSERT INTO admin_mcp_tokens")) {
                const tokenType = sql.includes("'access'") ? "access" : "refresh";
                tables.tokens.set(values[0], { token_hash: values[0], connection_id: values[1], token_type: tokenType, expires_at: values[2], rotated_from: tokenType === "access" ? values[3] : null });
              }
              if (sql.includes("UPDATE admin_mcp_authorization_requests")) { const row = tables.requests.get(values[3]); row.consumed_at = values[0]; }
              if (sql.includes("UPDATE admin_mcp_authorization_codes")) { const row = tables.codes.get(values[1]); row.used_at = values[0]; }
              if (sql.includes("UPDATE admin_mcp_connections SET client_name")) tables.connections.get(values[1]).client_name = values[0];
              if (sql.includes("UPDATE admin_mcp_tokens SET revoked_at") && sql.includes("token_hash=?")) { const row = tables.tokens.get(values[1]); if (row) row.revoked_at = values[0]; }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return db;
}

async function challenge(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

test("OAuth discovery advertises persistent refresh access", () => {
  const metadata = oauthMetadata({ MCP_AUTHORIZATION_SERVER_URL: "https://admin.karamahcollective.com" });
  const protectedResource = mcpMetadata({ MCP_RESOURCE_URL: "https://admin.karamahcollective.com/mcp" });
  assert.ok(metadata.scopes_supported.includes("offline_access"));
  assert.ok(protectedResource.scopes_supported.includes("offline_access"));
  assert.ok(metadata.grant_types_supported.includes("refresh_token"));
  assert.equal(metadata.authorization_response_iss_parameter_supported, true);
});

test("offline-only OAuth requests still open Admin capability consent", async () => {
  const db = fixture();
  const client = await registerMcpClient(db, { client_name: "Offline scope test", redirect_uris: ["http://127.0.0.1:4444/callback"] });
  const requestUrl = await beginMcpAuthorization(db, {
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    code_challenge: await challenge("offline-verifier"),
    code_challenge_method: "S256",
    scope: "offline_access",
  });
  const requestId = new URL(requestUrl).searchParams.get("request");
  const requested = JSON.parse(db.tables.requests.get(requestId).requested_scopes);
  assert.ok(requested.includes("offline_access"));
  assert.ok(requested.includes("admin:*"));
});

test("OAuth resource indicators are restricted to the MCP resource", async () => {
  const db = fixture();
  const client = await registerMcpClient(db, { client_name: "Resource test", redirect_uris: ["http://127.0.0.1:4444/callback"] });
  await assert.rejects(() => beginMcpAuthorization(db, {
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    code_challenge: "challenge",
    code_challenge_method: "S256",
    resource: "https://other.example/mcp",
  }), /resource does not match/);
});

test("OAuth authorization validates redirect URI and PKCE, then rotates refresh tokens", async () => {
  const db = fixture();
  const client = await registerMcpClient(db, { client_name: "Lifecycle test", redirect_uris: ["http://127.0.0.1:4444/callback"] });
  const verifier = "correct-verifier-value";
  const requestUrl = await beginMcpAuthorization(db, { client_id: client.client_id, redirect_uri: client.redirect_uris[0], state: "state-1", code_challenge: await challenge(verifier), code_challenge_method: "S256", scope: "admin:maps.places.read" }, { MCP_AUTHORIZATION_SERVER_URL: "https://admin.karamahcollective.com" });
  const requestId = new URL(requestUrl).searchParams.get("request");
  const consent = await completeMcpConsent(db, { requestId, selectedScopes: ["admin:maps.places.read"] }, { uid: "uid-1", email: "tester@karamahcollective.com", name: "Test" });
  const redirect = new URL(consent.redirectUri);
  assert.equal(redirect.searchParams.get("state"), "state-1");
  assert.equal(redirect.searchParams.get("iss"), "https://admin.karamahcollective.com");
  const code = redirect.searchParams.get("code");
  const tokens = await exchangeMcpToken(db, { code, client_id: client.client_id, redirect_uri: client.redirect_uris[0], code_verifier: verifier });
  assert.equal(tokens.token_type, "Bearer");
  assert.match(tokens.scope, /(^| )offline_access( |$)/);
  await assert.rejects(() => exchangeMcpToken(db, { code, client_id: client.client_id, redirect_uri: client.redirect_uris[0], code_verifier: verifier }), /Invalid authorization code/);
  const rotated = await refreshMcpToken(db, { refresh_token: tokens.refresh_token, client_id: client.client_id });
  assert.notEqual(rotated.refresh_token, tokens.refresh_token);
  await assert.rejects(() => refreshMcpToken(db, { refresh_token: tokens.refresh_token, client_id: client.client_id }), /Invalid refresh token/);
  await revokeMcpToken(db, { token: rotated.access_token });
  assert.equal(await authenticateMcpBearer(db, `Bearer ${rotated.access_token}`), null);
});
test("OAuth rejects an unregistered redirect URI", async () => {
  const db = fixture();
  const client = await registerMcpClient(db, { client_name: "Redirect test", redirect_uris: ["https://client.example/callback"] });
  await assert.rejects(() => beginMcpAuthorization(db, { client_id: client.client_id, redirect_uri: "https://evil.example/callback", code_challenge: "challenge", code_challenge_method: "S256" }), /redirect URI/);
});

test("DCR requires at least one redirect URI", async () => {
  const db = fixture();
  await assert.rejects(() => registerMcpClient(db, { client_name: "Missing redirect test", redirect_uris: [] }), /one to twenty/);
});
