const { test, expect, setupApp } = require("./helpers");

async function openPlaces(page) {
  await page.locator("#places-btn").click();
  await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
  await page.waitForTimeout(500);
}

async function clickDistinctPlaces(page, count) {
  const seen = new Set();
  let clicked = 0;

  while (clicked < count) {
    const items = page.locator("#places-list li[data-place-id]");
    const total = await items.count();
    for (let index = 0; index < total && clicked < count; index++) {
      const item = items.nth(index);
      const id = await item.getAttribute("data-place-id");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      await item.click();
      clicked += 1;
      await page.waitForTimeout(700);
      if (clicked < count) {
        await openPlaces(page);
      }
    }
    if (total === 0) throw new Error("No place rows found in places sheet");
    if (seen.size === total) break;
  }

  expect(clicked).toBe(count);
}

test.describe("Places Popup Regression", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("desktop repeated place selection keeps map full width and sheet fully shut", async ({ page }) => {
    await openPlaces(page);
    await clickDistinctPlaces(page, 3);

    await expect(page.locator("#places-sheet")).toHaveClass(/shut/);

    const dims = await page.evaluate(() => {
      const app = document.querySelector("#app");
      const map = document.querySelector("#map");
      const canvas = document.querySelector("#map canvas");
      return {
        vw: window.innerWidth,
        appW: app ? app.getBoundingClientRect().width : 0,
        mapW: map ? map.getBoundingClientRect().width : 0,
        canvasW: canvas ? canvas.getBoundingClientRect().width : 0,
      };
    });

    expect(dims.appW).toBeGreaterThanOrEqual(dims.vw - 4);
    expect(dims.mapW).toBeGreaterThanOrEqual(dims.vw - 4);
    expect(dims.canvasW).toBeGreaterThanOrEqual(dims.vw - 8);
  });

  test("mobile repeated place selection keeps sheet fully shut", async ({ page, browserName }) => {
    test.skip(browserName === "chromium" && (await page.evaluate(() => window.innerWidth)) > 768, "mobile-only assertion");
    await openPlaces(page);
    await clickDistinctPlaces(page, 3);

    const state = await page.evaluate(() => {
      const sheet = document.querySelector("#places-sheet");
      const rect = sheet.getBoundingClientRect();
      return {
        shut: sheet.classList.contains("shut"),
        top: rect.top,
        height: rect.height,
        vh: window.innerHeight,
        opacity: getComputedStyle(sheet).opacity,
        visibility: getComputedStyle(sheet).visibility,
      };
    });

    expect(state.shut).toBe(true);
    expect(Number(state.opacity)).toBe(0);
    expect(state.visibility).toBe("hidden");
    expect(state.top).toBeGreaterThanOrEqual(state.vh - Math.min(state.height, 4));
  });
});