import { describe, expect, it } from "vitest";
import { collectionResponse } from "./collection-response";

describe("collectionResponse", () => {
  it("keeps raw arrays unchanged", () => {
    const values = [{ id: "one" }];
    expect(collectionResponse(values)).toBe(values);
  });

  it("unwraps a named backend collection envelope", () => {
    expect(
      collectionResponse<{ id: string }>(
        { fields: [{ id: "field-1" }] },
        ["fields", "data"],
      ),
    ).toEqual([{ id: "field-1" }]);
  });

  it("unwraps one extra data envelope used by older workers", () => {
    expect(
      collectionResponse<{ id: string }>(
        { data: { fields: [{ id: "field-2" }] } },
        ["fields", "data"],
      ),
    ).toEqual([{ id: "field-2" }]);
  });

  it("returns an empty collection for invalid payloads", () => {
    expect(collectionResponse({ fields: { id: "not-a-list" } }, ["fields"])).toEqual([]);
    expect(collectionResponse(null)).toEqual([]);
  });
});
