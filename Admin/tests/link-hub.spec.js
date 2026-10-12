import { expect, test } from "@playwright/test";
import { mockAdmin } from "./fixtures.js";

const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

async function mockQrApi(page, decoded = "https://karamahcollective.com/join") {
  await page.route("https://api.qrserver.com/v1/create-qr-code/**", route =>
    route.fulfill({
      body: png1x1,
      contentType: "image/png",
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.route("https://api.qrserver.com/v1/read-qr-code/**", route =>
    route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify([{ type: "qrcode", symbol: [{ seq: 0, data: decoded, error: null }] }]),
    }),
  );
}

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
    await expect(page.locator(".link-hub-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Links and social profiles" })).toBeVisible();
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
  await page.getByRole("button", { name: "Add item", exact: true }).first().click();
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
  await page.getByRole("tab", { name: /Page content/ }).click();
  await expect(page.getByLabel("Eyebrow (optional)").first()).toHaveValue("");
  await page.getByLabel("Profile description (optional)").fill("A Helsinki-based collective.");
  await page.getByRole("button", { name: "Publish changes" }).click();
  const mutation = await page.evaluate(() => window.__lastMutation);
  expect(mutation.action).toBe("save-link-hub-settings");
  expect(mutation.body.settings.page_kicker).toBe("");
  expect(mutation.body.settings.profile_bio).toBe("A Helsinki-based collective.");
});

test("standalone QR generator validates before enabling download", async ({ page }) => {
  const url = "https://karamahcollective.com/join";
  await mockQrApi(page, url);
  await page.goto(`/links/qr?url=${encodeURIComponent(url)}`);

  await expect(page.locator(".qr-generator-page")).toBeVisible();
  await expect(page.getByLabel("Destination URL")).toHaveValue(url);
  await expect(page.getByRole("button", { name: "Download PNG" })).toBeDisabled();

  await expect(page.locator(".qr-status")).toContainText("Scanner read the QR correctly");
  await expect(page.getByRole("button", { name: "Download PNG" })).toBeEnabled();
});

test("standalone QR generator blocks output when scanner check fails", async ({ page }) => {
  await mockQrApi(page, "https://wrong.example.test");
  await page.goto("/links/qr?url=https%3A%2F%2Fkaramahcollective.com%2Fjoin");

  await expect(page.locator(".qr-status")).toContainText("scanner read a different value");
  await expect(page.getByRole("button", { name: "Download PNG" })).toBeDisabled();
});

test("animated QR keeps its modules fixed and scan-tests every GIF frame", async ({ page }) => {
  const url = "https://karamahcollective.com/join";
  let scanRequests = 0;
  page.on("request", request => {
    if (request.url().startsWith("https://api.qrserver.com/v1/read-qr-code/")) scanRequests += 1;
  });
  await mockQrApi(page, url);
  await page.goto(`/links/qr?url=${encodeURIComponent(url)}`);
  await expect(page.locator(".qr-status")).toContainText("Scanner read the QR correctly");
  const scansBeforeAnimation = scanRequests;

  await page.getByLabel("Ripple").check();

  await expect(page.locator(".qr-status")).toContainText("All 8 animation frames passed the scanner check", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Download GIF" })).toBeEnabled();
  await expect(page.getByAltText("Animated QR preview")).toBeVisible();
  expect(scanRequests - scansBeforeAnimation).toBe(8);

  const signature = await page.getByAltText("Animated QR preview").evaluate(async image => {
    const bytes = new Uint8Array(await (await fetch(image.src)).arrayBuffer());
    return String.fromCharCode(...bytes.slice(0, 6));
  });
  expect(signature).toBe("GIF89a");
});

test("phone QR editor uses a compact live preview and collapsed customization groups", async ({ page }) => {
  const url = "https://karamahcollective.com/join";
  await page.setViewportSize({ width: 390, height: 844 });
  await mockQrApi(page, url);
  await page.goto(`/links/qr?url=${encodeURIComponent(url)}`);

  const preview = page.locator(".qr-preview-panel");
  const controls = page.locator(".qr-controls");
  const previewBox = await preview.boundingBox();
  const controlsBox = await controls.boundingBox();
  expect(previewBox.y).toBeLessThan(controlsBox.y);
  await expect(page.getByRole("button", { name: "Expand Size & logo" })).toBeVisible();
  await expect(page.getByLabel("QR size")).toBeHidden();

  await page.getByRole("button", { name: "Expand Size & logo" }).click();
  await expect(page.getByLabel("QR size")).toBeVisible();

  await page.getByRole("button", { name: "Enlarge" }).click();
  await expect(page.getByRole("button", { name: "Minimize" })).toBeVisible();
  expect((await page.locator(".qr-preview-frame").boundingBox()).width).toBeGreaterThan(250);
});
