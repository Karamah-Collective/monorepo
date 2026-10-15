import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet } from "../Admin/functions/.well-known/openid-configuration.js";

test("OIDC discovery aliases the MCP authorization-server metadata", async () => {
  const originalFetch = globalThis.fetch;
  let target;
  globalThis.fetch = async input => {
    target = String(input);
    return Response.json({ issuer: "https://admin.karamahcollective.com" });
  };
  try {
    const response = await onRequestGet({
      request: new Request("https://admin.karamahcollective.com/.well-known/openid-configuration"),
      env: { MAPS_ORIGIN: "https://maps.karamahcollective.com" },
    });
    assert.equal(response.status, 200);
    assert.equal(target, "https://maps.karamahcollective.com/api/mcp-auth?operation=authorization-server");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
