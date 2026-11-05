import { describe, expect, it } from "vitest";
import { getAvatarToneClass } from "./avatar-tone";

describe("getAvatarToneClass", () => {
  it("keeps a person's tone stable", () => {
    expect(getAvatarToneClass("Aram")).toBe(getAvatarToneClass("aram"));
  });

  it("uses the list index to keep people visually distinct", () => {
    expect(getAvatarToneClass(null, 2)).toBe("avatar-tone-sky");
    expect(getAvatarToneClass("Aram", 1)).toBe("avatar-tone-lavender");
  });
});
