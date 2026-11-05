import { describe, expect, it } from "vitest";
import { displayNameFromEmail } from "./display-name";

describe("displayNameFromEmail", () => {
  it("humanizes the email local part when no profile name exists", () => {
    expect(displayNameFromEmail("moontasir@karamahcollective.com")).toBe("Moontasir");
    expect(displayNameFromEmail("moontasir.soumik@karamahcollective.com")).toBe("Moontasir Soumik");
  });
});
