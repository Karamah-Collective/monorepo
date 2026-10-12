import assert from "node:assert/strict";
import test from "node:test";
import { hashMcpToken } from "../Maps/functions/_mcp-auth.js";
import { onRequest } from "../Maps/functions/api/mcp.js";

function dbFixture() {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("FROM admin_mcp_tokens")) return {
                token_hash: values[0], expires_at: Date.now() + 60_000, connection_id: "connection-test",
                actor_uid: "uid-test", actor_email: "tester@karamahcollective.com", client_id: "client-test",
                client_name: "Protocol test client", grants: JSON.stringify(["*"]), status: "active",
              };
              if (sql.includes("FROM admin_role_members")) return { role_id: "administrator", display_name: "Tester", name: "Administrator", permissions: JSON.stringify(["*"]) };
              return null;
            },
            async run() { return { meta: { changes: 1 } }; },
            async all() { return { results: [] }; },
          };
        },
      };
    },
  };
}

async function call(method, body) {
  return onRequest({
    request: new Request("https://admin.karamahcollective.com/api/mcp", {
      method, headers: { Authorization: "Bearer protocol-access", "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify(body),
    }), env: { DB: dbFixture() },
  });
}

test("MCP Streamable HTTP initializes and filters typed tools", async () => {
  const initialization = await call("POST", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
  assert.equal(initialization.status, 200);
  const initialized = await initialization.json();
  assert.equal(initialized.error, undefined);
  assert.ok(initialized.result?.serverInfo?.name);

  const listing = await call("POST", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const result = await listing.json();
  const names = (result.result?.tools || []).map(tool => tool.name);
  assert.ok(names.includes("maps.places.list"));
  assert.ok(names.includes("website.content.publish"));
  assert.ok(names.includes("forms.update"));
  assert.ok(names.includes("workspace.roles.update"));
  assert.ok(names.includes("links.qr.generate"));
  const formUpdate = result.result?.tools?.find(tool => tool.name === "forms.update");
  assert.ok(formUpdate?.inputSchema?.properties?.id);
  assert.ok(formUpdate?.inputSchema?.properties?.revision);
});
test("access tokens are looked up by hash, never by plaintext", async () => {
  assert.notEqual(await hashMcpToken("protocol-access"), "protocol-access");
});
