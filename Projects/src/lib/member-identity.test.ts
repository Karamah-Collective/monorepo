import { describe, expect, it } from "vitest";
import { isCurrentMember } from "./member-identity";

describe("isCurrentMember", () => {
  const current = { userId: "uid-1", user: { email: "Moontasir@karamahcollective.com" } };

  it("matches the stable user id", () => {
    expect(isCurrentMember({ id: "uid-1" }, current)).toBe(true);
  });

  it("matches legacy members by email when the uid is missing", () => {
    expect(isCurrentMember({ id: "moontasir@karamahcollective.com", email: "moontasir@karamahcollective.com" }, current)).toBe(true);
  });

  it("does not match another member", () => {
    expect(isCurrentMember({ id: "uid-2", email: "other@karamahcollective.com" }, current)).toBe(false);
  });
});
