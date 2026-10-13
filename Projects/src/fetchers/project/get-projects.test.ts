import { beforeEach, describe, expect, it, vi } from "vitest";

const { projectGet } = vi.hoisted(() => ({
  projectGet: vi.fn(),
}));

vi.mock("@karamah/projects-libs", () => ({
  client: {
    project: {
      $get: projectGet,
    },
  },
}));

import getProjects from "./get-projects";

describe("getProjects", () => {
  beforeEach(() => {
    projectGet.mockReset();
  });

  it("normalizes the Admin projects envelope to the Kaneo array contract", async () => {
    projectGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          projects: [{ id: "project-1", name: "Operations" }],
        }),
        { status: 200 },
      ),
    );

    await expect(getProjects({ workspaceId: "workspace-1" })).resolves.toEqual([
      { id: "project-1", name: "Operations" },
    ]);
  });

  it("returns an empty array while the workspace context is unresolved", async () => {
    await expect(getProjects({})).resolves.toEqual([]);
    expect(projectGet).not.toHaveBeenCalled();
  });
});
