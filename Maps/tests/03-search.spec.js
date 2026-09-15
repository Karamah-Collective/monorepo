/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SUITE 3: Search Functionality
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests the search pill expand/collapse, input handling, result rendering,
 * clear button behaviour, and keyboard navigation.
 */
const { test, expect, setupApp } = require("./helpers");

test.describe("Search — Expand & Collapse", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("clicking search pill expands the search card", async ({ page }) => {
    await expect(page.locator("#search-card")).toHaveClass(/collapsed/);
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await expect(page.locator("#search-card")).not.toHaveClass(/collapsed/);
  });

  test("search input gets focus after expanding", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await expect(page.locator("#search-input")).toBeFocused();
  });

  test("clicking search pill again collapses it", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await expect(page.locator("#search-card")).toHaveClass(/collapsed/);
  });

  test("clicking outside search card collapses it", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#map").click({ position: { x: 300, y: 300 } });
    await page.waitForTimeout(300);
    await expect(page.locator("#search-card")).toHaveClass(/collapsed/);
  });

  test("Escape key collapses search", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(page.locator("#search-card")).toHaveClass(/collapsed/);
  });
});

test.describe("Search — Input & Clear", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("clear button appears when text is entered", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    const clearBtn = page.locator("#clear-input");
    await expect(clearBtn).toHaveClass(/hide/);
    await page.locator("#search-input").fill("Helsinki");
    await expect(clearBtn).not.toHaveClass(/hide/);
  });

  test("clear button clears input and hides itself", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("test");
    await page.locator("#clear-input").click();
    await expect(page.locator("#search-input")).toHaveValue("");
    await expect(page.locator("#clear-input")).toHaveClass(/hide/);
  });

  test("clear button hides search dropdown", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("kamppi");
    // Wait for debounce and possible results
    await page.waitForTimeout(800);
    await page.locator("#clear-input").click();
    // Wait for the dropdown to get the hide class (hideDrop is called on clear)
    await expect(page.locator("#search-drop")).toHaveClass(/hide/, { timeout: 5000 });
  });

  test("input retains focus after clear", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("test");
    await page.locator("#clear-input").click();
    await expect(page.locator("#search-input")).toBeFocused();
  });
});

test.describe("Search — Dropdown Rendering", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    // Mock Digitransit geocoding API with sample results
    await page.route("**/api.digitransit.fi/geocoding/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          features: [
            {
              properties: { name: "Kamppi Center", label: "Kamppi Center, Helsinki", layer: "venue" },
              geometry: { type: "Point", coordinates: [24.9312, 60.1687] },
            },
            {
              properties: { name: "Kampintori", label: "Kampintori, Helsinki", layer: "address" },
              geometry: { type: "Point", coordinates: [24.932, 60.169] },
            },
          ],
        }),
      }),
    );
  });

  test("typing a query shows search results", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("Kamppi");
    // Wait for debounce (350ms) + network
    await page.waitForTimeout(800);
    const drop = page.locator("#search-drop");
    const isHidden = await drop.evaluate((el) => el.classList.contains("hide"));
    expect(isHidden).toBe(false);
    const items = page.locator("#results-list li");
    await expect(items).toHaveCount(2);
  });

  test("result items have name and address", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("Kamppi");
    await page.waitForTimeout(800);
    const first = page.locator("#results-list li").first();
    await expect(first.locator(".r-name")).toContainText("Kamppi");
    await expect(first.locator(".r-icon")).toBeVisible();
  });

  test("result items have icons", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("Kamppi");
    await page.waitForTimeout(800);
    const icons = page.locator("#results-list li .r-icon svg");
    const count = await icons.count();
    expect(count).toBeGreaterThan(0);
  });

  test("clicking a result collapses search", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("Kamppi");
    await page.waitForTimeout(800);
    await page.locator("#results-list li").first().click();
    await page.waitForTimeout(500);
    await expect(page.locator("#search-card")).toHaveClass(/collapsed/);
  });

  test("clicking a result places a search marker", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("Kamppi");
    await page.waitForTimeout(800);
    await page.locator("#results-list li").first().click();
    await page.waitForTimeout(500);
    await expect(page.locator(".search-mk")).toBeVisible();
  });
});

test.describe("Search — No Results", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    // Mock both geocoding APIs to return empty results
    await page.route("**/api.digitransit.fi/geocoding/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ features: [] }),
      }),
    );
    await page.route("**/nominatim.openstreetmap.org/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      }),
    );
  });

  test("shows 'No results found' message for empty results", async ({ page }) => {
    await page.locator("#search-pill").click();
    await page.waitForTimeout(200);
    await page.locator("#search-input").fill("zzzzzzzzxyz");
    await page.waitForTimeout(1000);
    await expect(page.locator("#results-list")).toContainText("No results");
  });
});
