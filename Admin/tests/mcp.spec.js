import { test, expect } from "@playwright/test";
import { mockAdmin } from "./fixtures.js";

test("MCP access lists a scoped connection and supports revocation", async ({ page }) => {
  await mockAdmin(page, {
    "mcp-connections": { connections: [{ id: "connection-1", client_name: "Claude Desktop", actor_email: "amina@example.test", grants: ["admin:maps.places.read", "admin:website.content.write"], created_at: "2026-10-12T10:00:00Z", last_used_at: "2026-10-12T10:05:00Z", status: "active" }] },
  });
  page.on("dialog", dialog => dialog.accept());
  await page.goto("/workspace/mcp");
  await expect(page.getByRole("heading", { name: "MCP access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Claude Desktop" })).toBeVisible();
  await expect(page.locator(".mcp-grants")).toContainText("maps · places · read");
  await expect(page.getByRole("heading", { name: "Connect an AI client" })).toBeVisible();
  await expect(page.getByText("ChatGPT", { exact: true })).toBeVisible();
  await expect(page.getByText("Claude", { exact: true })).toBeVisible();
  await expect(page.getByText("Gemini", { exact: true })).toBeVisible();
  await expect(page.getByText("LOCAL TESTING", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect.poll(() => page.evaluate(() => window.__lastMutation?.action)).toBe("mcp-revoke-connection");
});
test("MCP consent shows requested scopes for the signed-in Firebase user", async ({ page }) => {
  await mockAdmin(page, {
    "mcp-consent-request": { requestId: "request-1", clientName: "Claude Desktop", requestedScopes: ["admin:maps.places.read", "admin:website.content.write"], availableScopes: ["admin:maps.places.read", "admin:website.content.write"], defaultScopes: ["admin:maps.places.read"], redirectUri: "http://127.0.0.1:4444/callback", access: { roleName: "Administrator" } },
  });
  await page.goto("/mcp/authorize?request=request-1");
  await expect(page.getByRole("heading", { name: /Allow Claude Desktop/ })).toBeVisible();
  await expect(page.getByText("maps · places · read")).toBeVisible();
  await expect(page.getByText("website · content · write")).toBeVisible();
  await expect(page.getByRole("button", { name: "Authorize connection" })).toBeEnabled();
});
