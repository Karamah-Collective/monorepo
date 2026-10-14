import { describe, expect, it } from "vitest";
import { toProjectsColumn, toProjectsTask } from "./projects-client";

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
});
