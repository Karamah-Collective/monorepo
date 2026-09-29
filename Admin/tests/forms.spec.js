import { test, expect } from "@playwright/test";
import { mockAdmin } from "./fixtures.js";

test("forms dashboard opens the versioned builder and autosaves edits", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/forms");
  await expect(page.getByRole("heading", { name: "Forms" })).toBeVisible();
  await expect(page.getByText("Community RSVP", { exact: true })).toBeVisible();
  await page.getByText("Community RSVP", { exact: true }).click();
  await expect(page).toHaveURL(/forms\/form-1/);
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  const title = page.getByLabel("Form title");
  await title.fill("Community gathering RSVP");
  await expect.poll(() => page.evaluate(() => window.__lastMutation?.action)).toBe("forms-save");
  await expect.poll(() => page.evaluate(() => window.__lastMutation?.body?.schema?.title)).toBe("Community gathering RSVP");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__lastMutation?.action)).toBe("forms-publish");
});

test("form builder remains usable on a phone", async ({ page }) => {
  await mockAdmin(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/forms/form-1");
  await expect(page.locator(".builder-canvas")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("form response settings stack without horizontal overflow on a phone", async ({ page }) => {
  await mockAdmin(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/forms/form-1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  const accessGrid = page.locator(".access-settings-grid");
  await expect(accessGrid).toBeVisible();
  await expect(page.getByText("Who can respond", { exact: true })).toBeVisible();
  const columns = await accessGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(columns.split(" ")).toHaveLength(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
