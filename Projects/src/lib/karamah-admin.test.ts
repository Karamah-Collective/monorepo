import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUser = vi.hoisted(() => ({
  getIdToken: vi.fn().mockResolvedValue("firebase-token"),
}));

vi.mock("../firebase.js", () => ({
  ADMIN_ORIGIN: "https://admin.karamahcollective.com",
  auth: { currentUser },
}));

import { requestAdmin } from "./karamah-admin";

describe("requestAdmin", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));
  });

  it("uses same-origin credentials so hosted bearer-token requests pass CORS", async () => {
    await requestAdmin({ action: "project-list" });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.objectContaining({
          Authorization: "Bearer firebase-token",
        }),
      }),
    );
  });

  it("keeps the same CORS-safe credential policy for writes", async () => {
    await requestAdmin({
      action: "project-create",
      method: "POST",
      body: { name: "Launch" },
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    );
  });
});
