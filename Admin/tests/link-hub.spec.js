import { expect, test } from "@playwright/test";
import { mockAdmin } from "./fixtures.js";

test.beforeEach(async ({ page }) => {
  await mockAdmin(page);
});

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1000 },
  { name: "desktop", width: 1440, height: 1000 },
]) {
  test(`link hub is usable on ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/links");
    await expect(page.getByRole("heading", { name: "Link hub" })).toBeVisible();
    await expect(page.locator(".hub-admin-link")).toHaveCount(2);
    await expect(page.locator(".hub-mini-profile")).not.toContainText("Karamah, collected");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    if (process.env.UI_AUDIT_SCREENSHOTS) {
      await page.screenshot({ path: testInfo.outputPath(`link-hub-${viewport.name}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}

test("link editor keeps its actions visible while its content scrolls", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/links");
  await page.getByRole("button", { name: "Add link", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a new link" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save link" })).toBeVisible();
  await expect(dialog.getByLabel("Destination URL")).toBeVisible();
  const fieldset = dialog.locator("fieldset");
  expect(await fieldset.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  if (process.env.UI_AUDIT_SCREENSHOTS) {
    await page.screenshot({ path: testInfo.outputPath("link-editor-phone.png"), fullPage: true });
  }
});

test("blank optional content remains blank when settings are published", async ({ page }) => {
  await page.goto("/links");
  await page.getByRole("button", { name: /Page content/ }).click();
  await expect(page.getByLabel("Eyebrow (optional)").first()).toHaveValue("");
  await page.getByLabel("Profile description (optional)").fill("A Helsinki-based collective.");
  await page.getByRole("button", { name: "Publish changes" }).click();
  const mutation = await page.evaluate(() => window.__lastMutation);
  expect(mutation.action).toBe("save-link-hub-settings");
  expect(mutation.body.settings.page_kicker).toBe("");
  expect(mutation.body.settings.profile_bio).toBe("A Helsinki-based collective.");
});
