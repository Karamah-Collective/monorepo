import { describe, expect, it, vi } from "vitest";

const requestAdmin = vi.hoisted(() => vi.fn());

vi.mock("./karamah-admin", () => ({ requestAdmin }));

import { client } from "./projects-client";

describe("task reorder proxy", () => {
  it("sends each task move without the outer board payload", async () => {
    requestAdmin.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const response = await client.task.reorder.$post({
      json: {
        projectId: "project-1",
        expectedTasks: [{ id: "task-1", position: 0, status: "inbox" }],
        tasks: [{
          id: "task-1",
          position: 1,
          status: "in_progress",
          columnId: "column-progress",
          expectedRevision: 3,
        }],
      },
    });

    expect(response.ok).toBe(true);
    expect(requestAdmin).toHaveBeenCalledOnce();
    expect(requestAdmin.mock.calls[0][0]).toMatchObject({
      action: "project-task-update",
      method: "POST",
      body: {
        id: "task-1",
        position: 1,
        statusCategory: "in_progress",
        columnId: "column-progress",
        expectedRevision: 3,
      },
    });
    expect(requestAdmin.mock.calls[0][0].body).not.toHaveProperty("tasks");
    expect(requestAdmin.mock.calls[0][0].body).not.toHaveProperty("expectedTasks");
    expect(requestAdmin.mock.calls[0][0].body).not.toHaveProperty("projectId");
  });

  it("returns a failed task update as an HTTP error", async () => {
    requestAdmin.mockResolvedValue(
      new Response(JSON.stringify({ error: "You cannot edit this task." }), { status: 403 }),
    );

    const response = await client.task.reorder.$post({
      json: {
        projectId: "project-1",
        tasks: [{ id: "task-1", position: 1, status: "in_progress", expectedRevision: 3 }],
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      success: false,
      results: [{ id: "task-1", success: false, error: "You cannot edit this task." }],
    });
  });

  it("preserves an Admin error status even when the compatibility endpoint returns 200", async () => {
    requestAdmin.mockResolvedValue(
      new Response(JSON.stringify({ error: "You do not have write access to this task.", status: 403 }), { status: 200 }),
    );

    const response = await client.task.reorder.$post({
      json: {
        projectId: "project-1",
        tasks: [{ id: "task-1", position: 1, status: "in_progress", expectedRevision: 3 }],
      },
    });

    expect(response.status).toBe(403);
  });
});
