import { beforeEach, describe, expect, it, vi } from "vitest";

const { customFieldsGet } = vi.hoisted(() => ({
  customFieldsGet: vi.fn(),
}));

vi.mock("@karamah/projects-libs", () => ({
  client: {
    "custom-field": {
      project: {
        ":projectId": { $get: customFieldsGet },
      },
    },
  },
}));

import getCustomFieldsByProject from "./get-custom-fields-by-project";

describe("getCustomFieldsByProject", () => {
  beforeEach(() => customFieldsGet.mockReset());

  it.each([
    [{ id: "field-1", name: "Customer" }],
    { fields: [{ id: "field-1", name: "Customer" }] },
    { data: [{ id: "field-1", name: "Customer" }] },
  ])("always returns an array for %j", async (payload) => {
    customFieldsGet.mockResolvedValue(Response.json(payload));

    await expect(
      getCustomFieldsByProject({ projectId: "project-1" }),
    ).resolves.toEqual([{ id: "field-1", name: "Customer" }]);
  });

  it("does not pass an object through to callers when the payload is malformed", async () => {
    customFieldsGet.mockResolvedValue(
      Response.json({ fields: { id: "not-a-list" } }),
    );

    await expect(
      getCustomFieldsByProject({ projectId: "project-1" }),
    ).resolves.toEqual([]);
  });
});
