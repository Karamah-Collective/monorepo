import { describe, expect, it } from "vitest";
import { isWorkspaceOwnerRole } from "./is-workspace-owner-role";

describe("isWorkspaceOwnerRole", () => {
  it.each([
    ["owner", true],
    ["member,owner", true],
    ["admin", false],
    ["owners", false],
    ["", false],
  ])("treats %j as owner: %s", (role, expected) => {
    expect(isWorkspaceOwnerRole(role)).toBe(expected);
  });
});
