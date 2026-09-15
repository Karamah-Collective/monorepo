/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SUITE 11: Pin Markers & Popups
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests search markers, custom dropped pins, pin popups, save/unsave pins,
 * directions from pin, share, and remove interactions.
 */
const { test, expect, setupApp } = require("./helpers");

test.describe("Search Marker", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    // Mock geocoding
    await page.route("**/api.digitransit.fi/geocoding/v1/search**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          features: [{
            properties: { name: "Test Place", label: "Test Place, Helsinki", layer: "venue" },
            geometry: { type: "Point", coordinates: [24.94, 60.17] },
          }],
        }),
      }),
    );
    await page.route("**/nominatim.openstreetmap.org/reverse**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          display_name: "Test Street, Helsinki",
          address: { road: "Test Street" },
        }),
      }),
    );
    await page.route("**/api.digitransit.fi/geocoding/v1/reverse**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          features: [{
            properties: { label: "Test Street, Helsinki" },
            geometry: { coordinates: [24.94, 60.17] },
          }],
        }),
      }),
    );
  });

  test("selecting a search result creates a search marker", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("Test");
    await page.waitForTimeout(800);
    await page.locator("#results-list li").first().click();
    await page.waitForTimeout(600);
    await expect(page.locator(".search-mk")).toBeVisible();
  });

  test("clicking search marker opens pin popup", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("Test");
    await page.waitForTimeout(800);
    await page.locator("#results-list li").first().click();
    await page.waitForTimeout(600);
    await page.locator(".search-mk").click();
    await page.waitForTimeout(600);
    await expect(page.locator(".maplibregl-popup")).toBeVisible();
    await expect(page.locator(".pp--pin")).toBeVisible();
  });

  test("search pin popup has correct title", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("Test");
    await page.waitForTimeout(800);
    await page.locator("#results-list li").first().click();
    await page.waitForTimeout(600);
    await page.locator(".search-mk").click();
    await page.waitForTimeout(600);
    await expect(page.locator(".pp--pin .pp-title")).toContainText("Searched Location");
  });
});

test.describe("Dropped Pin (Double-Click)", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    // Mock reverse geocoding
    await page.route("**/nominatim.openstreetmap.org/reverse**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          display_name: "Custom Street, Helsinki",
          address: { road: "Custom Street" },
        }),
      }),
    );
    await page.route("**/api.digitransit.fi/geocoding/v1/reverse**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          features: [{
            properties: { label: "Custom Street, Helsinki" },
            geometry: { coordinates: [24.94, 60.17] },
          }],
        }),
      }),
    );
  });

  // All double-click coordinates below are offset from dead-center: the default
  // Helsinki view has a real place marker sitting almost exactly at the map's
  // screen center, and double-clicking directly on an existing marker opens/closes
  // its detail sheet on each of the two clicks instead of reaching the map's own
  // dblclick-to-drop-a-pin handler — which is arguably correct (you don't want a
  // duplicate custom pin stacked on an existing place), not a bug to work around.
  test("double-clicking map creates a custom pin marker", async ({ page }) => {
    const mapBox = await page.locator("#map").boundingBox();
    await page.mouse.dblclick(mapBox.x + mapBox.width / 2 + 160, mapBox.y + mapBox.height / 2 - 160);
    await page.waitForTimeout(800);
    const customCount = await page.locator(".custom-mk").count();
    expect(customCount).toBeGreaterThanOrEqual(1);
  });

  test("custom pin popup has Dropped Pin title", async ({ page }) => {
    const mapBox = await page.locator("#map").boundingBox();
    await page.mouse.dblclick(mapBox.x + mapBox.width / 2 + 160, mapBox.y + mapBox.height / 2 - 160);
    await page.waitForTimeout(800);
    // Close any place popups that may cover the pin marker
    await page.evaluate(() => document.querySelectorAll('.maplibregl-popup').forEach(p => p.remove()));
    await page.locator(".custom-mk").first().click();
    await page.waitForTimeout(600);
    await expect(page.locator(".pp--pin .pp-title")).toContainText("Dropped Pin");
  });

  test("pin popup has directions, add place, share, and remove buttons", async ({ page }) => {
    const mapBox = await page.locator("#map").boundingBox();
    await page.mouse.dblclick(mapBox.x + mapBox.width / 2 + 160, mapBox.y + mapBox.height / 2 - 160);
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll('.maplibregl-popup').forEach(p => p.remove()));
    await page.locator(".custom-mk").first().click();
    await page.waitForTimeout(600);
    await expect(page.locator(".pp--pin .pp-dir-btn")).toBeVisible();
    await expect(page.locator(".pp--pin .pp-add-place-btn")).toBeVisible();
    await expect(page.locator(".pp--pin .pp-share-btn")).toBeVisible();
    await expect(page.locator(".pp--pin .pp-rm-btn")).toBeVisible();
  });

  test("pin popup has save button", async ({ page }) => {
    const mapBox = await page.locator("#map").boundingBox();
    await page.mouse.dblclick(mapBox.x + mapBox.width / 2 + 160, mapBox.y + mapBox.height / 2 - 160);
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll('.maplibregl-popup').forEach(p => p.remove()));
    await page.locator(".custom-mk").first().click();
    await page.waitForTimeout(600);
    await expect(page.locator(".pp--pin .pp-fav-btn")).toBeVisible();
  });

  test("remove button removes the pin and popup", async ({ page }) => {
    const mapBox = await page.locator("#map").boundingBox();
    await page.mouse.dblclick(mapBox.x + mapBox.width / 2 + 160, mapBox.y + mapBox.height / 2 - 160);
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll('.maplibregl-popup').forEach(p => p.remove()));
    await page.locator(".custom-mk").first().click();
    await page.waitForTimeout(600);
    await page.locator(".pp--pin .pp-rm-btn").click();
    await page.waitForTimeout(500);
    await expect(page.locator(".maplibregl-popup")).toHaveCount(0);
  });
});

test.describe("Pin Save / Unsave", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.evaluate(() => localStorage.removeItem("hf_saved_pins"));
    await page.route("**/nominatim.openstreetmap.org/reverse**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ display_name: "Test", address: { road: "Test" } }),
      }),
    );
    await page.route("**/api.digitransit.fi/geocoding/v1/reverse**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          features: [{ properties: { label: "Test" }, geometry: { coordinates: [24.94, 60.17] } }],
        }),
      }),
    );
  });

  test("saving a pin stores it in localStorage", async ({ page }) => {
    const mapBox = await page.locator("#map").boundingBox();
    await page.mouse.dblclick(mapBox.x + mapBox.width / 2 + 160, mapBox.y + mapBox.height / 2 - 160);
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll('.maplibregl-popup').forEach(p => p.remove()));
    await page.locator(".custom-mk").first().click();
    await page.waitForTimeout(600);
    // Click the save/favourite button
    await page.locator(".pp--pin .pp-fav-btn").click();
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hf_saved_pins") || "[]"));
    expect(saved.length).toBe(1);
  });
});
