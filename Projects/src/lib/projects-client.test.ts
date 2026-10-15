import { describe, expect, it } from "vitest";
import {
  toProjectsColumn,
  toProjectsProject,
  toProjectsTask,
  withTaskConflictRetry,
} from "./projects-client";

describe("toProjectsProject", () => {
  it("preserves the creator role returned beside a created project", () => {
    expect(
      toProjectsProject({ project: { id: "project-1", name: "Launch" }, role: "project-admin" }),
    ).toMatchObject({ id: "project-1", role: "project-admin" });
  });
});

describe("toProjectsColumn", () => {
  it("uses the Admin status category as the board move slug", () => {
    expect(
      toProjectsColumn({
        id: "column-in-progress",
        name: "In progress",
        statusCategory: "in_progress",
      }),
    ).toMatchObject({
      id: "column-in-progress",
      slug: "in_progress",
    });
  });

  it("keeps explicit legacy slugs when present", () => {
    expect(
      toProjectsColumn({
        id: "column-in-progress",
        slug: "doing",
        statusCategory: "in_progress",
      }),
    ).toMatchObject({ slug: "doing" });
  });
});

describe("toProjectsTask", () => {
  it("preserves Admin assignee identities for project and workspace views", () => {
    expect(
      toProjectsTask({
        id: "task-1",
        title: "Prepare the launch",
        assigneeUid: "uid-1",
        assigneeEmail: "person@karamahcollective.com",
      }),
    ).toMatchObject({
      userId: "uid-1",
      assigneeId: "uid-1",
      assigneeUid: "uid-1",
      assigneeEmail: "person@karamahcollective.com",
    });
  });

  it("falls back to an assignee object from older task responses", () => {
    expect(
      toProjectsTask({
        id: "task-2",
        assignee: {
          uid: "uid-2",
          email: "another@karamahcollective.com",
          name: "Another person",
        },
      }),
    ).toMatchObject({
      userId: "uid-2",
      assigneeId: "uid-2",
      assigneeEmail: "another@karamahcollective.com",
      assigneeName: "Another person",
    });
  });

  it("keeps the task identifier source fields available for workspace views", () => {
    expect(
      toProjectsTask({
        id: "task-3",
        projectId: "project-1",
        taskNumber: 3,
      }),
    ).toMatchObject({
      projectId: "project-1",
      number: 3,
    });
  });
});

describe("withTaskConflictRetry", () => {
  it("replays a field update against the returned task revision", async () => {
    const calls: Record<string, unknown>[] = [];
    const result = await withTaskConflictRetry(async (payload) => {
      calls.push(payload);
      return calls.length === 1
        ? {
            error: "Task changed.",
            __httpStatus: 409,
            conflict: { id: "task-1", revision: 8, priority: "medium" },
          }
        : { task: { id: "task-1", revision: 9, statusCategory: "completed" } };
    }, { id: "task-1", statusCategory: "completed", expectedRevision: 7 });

    expect(result).toMatchObject({ task: { revision: 9 } });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      id: "task-1",
      statusCategory: "completed",
      expectedRevision: 8,
    });
    expect(calls[1]).not.toHaveProperty("priority");
  });
});
