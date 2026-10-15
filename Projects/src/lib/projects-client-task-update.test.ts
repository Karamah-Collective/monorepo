import { describe, expect, it, vi } from "vitest";

const requestAdmin = vi.hoisted(() => vi.fn());

vi.mock("./karamah-admin", () => ({ requestAdmin }));

import { client } from "./projects-client";

describe("task update proxy", () => {
  it("retries a stale multi-field update with the returned revision", async () => {
    requestAdmin
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "Task changed.",
        status: 409,
        conflict: { id: "task-1", revision: 8 },
      }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        task: { id: "task-1", title: "Updated", revision: 9 },
      }), { status: 200 }));

    const response = await client.task[":id"].$put({
      param: { id: "task-1" },
      json: { title: "Updated", priority: "medium", expectedRevision: 7 },
    });

    expect(response.ok).toBe(true);
    expect(requestAdmin).toHaveBeenCalledTimes(2);
    expect(requestAdmin.mock.calls[1][0].body).toMatchObject({
      id: "task-1",
      title: "Updated",
      priority: "medium",
      expectedRevision: 8,
    });
  });
});
