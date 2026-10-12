import { test, expect } from "@playwright/test";
import { mockAdmin } from "./fixtures.js";

function captureFormsMutations(page) {
  const mutations = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/admin") && request.method() === "POST") {
      mutations.push(request.postDataJSON());
    }
  });
  return mutations;
}

test("forms dashboard opens the versioned builder and autosaves edits", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/forms");
  await expect(page.locator(".forms-page")).toBeVisible();
  await expect(page.getByText("Community RSVP", { exact: true })).toBeVisible();
  await page.getByText("Community RSVP", { exact: true }).click();
  await expect(page).toHaveURL(/forms\/form-1/);
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  const title = page.getByLabel("Form title");
  await title.fill("Community gathering RSVP");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
});

test("forms dashboard actions close predictably and confirm changes", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/forms");

  const menu = page.getByRole("menu", { name: "Manage Community RSVP actions" });
  await page.getByRole("button", { name: "Manage Community RSVP" }).click();
  await expect(menu).toBeVisible();

  await page.locator(".forms-page").click({ position: { x: 8, y: 8 } });
  await expect(menu).toBeHidden();

  await page.getByRole("button", { name: "Manage Community RSVP" }).click();
  await page.getByRole("menuitem", { name: /Archive/ }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Form archived");
});

test("form sharing opens the shared QR generator with the form link", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/forms/form-1");

  await page.getByText("Share", { exact: true }).click();
  await page.getByRole("link", { name: "Create QR" }).click();

  await expect(page).toHaveURL(/\/links\/qr/);
  await expect(page.locator(".qr-generator-page")).toBeVisible();
  await expect(page.getByLabel("Destination URL")).toHaveValue("http://127.0.0.1:8791/f/0123456789abcdef0123456789abcdef");
  await expect(page.getByText("Loaded from Forms sharing")).toBeVisible();
});

test("forms dashboard opens published forms in the shared QR generator", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/forms");

  await page.getByRole("button", { name: "Manage Community RSVP" }).click();
  await page.getByRole("menuitem", { name: /Create QR/ }).click();

  await expect(page).toHaveURL(/\/links\/qr/);
  await expect(page.locator(".qr-generator-page")).toBeVisible();
  await expect(page.getByLabel("Destination URL")).toHaveValue("http://127.0.0.1:8791/f/0123456789abcdef0123456789abcdef");
  await expect(page.getByText("Loaded from Forms sharing")).toBeVisible();
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

test("form description editor keeps focus in the writing surface", async ({ page }) => {
  await mockAdmin(page);
  const mutations = captureFormsMutations(page);
  await page.goto("/forms/form-1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  const editor = page.getByRole("textbox", { name: "Description", exact: true });
  await editor.click();
  await editor.pressSequentially("Welcome to our community form.");

  await expect(editor).toBeFocused();
  await expect(page.getByRole("button", { name: "Bold" })).not.toBeFocused();
  await expect.poll(() => mutations.at(-1)?.schema?.description).toBe("Welcome to our community form.");
});
