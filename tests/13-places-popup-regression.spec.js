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

/** Rapid-fire variant: minimal delay between place selections to stress-test race conditions. */
async function clickDistinctPlacesFast(page, count) {
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
      // Minimal delay — just enough for the sheet close to take effect
      await page.waitForTimeout(50);
      if (clicked < count) {
        await page.locator("#places-btn").click();
        await page.waitForTimeout(100);
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
    await clickDistinctPlaces(page, 6);

    await expect(page.locator("#places-sheet")).toHaveClass(/shut/);

    const dims = await page.evaluate(() => {
      const app = document.querySelector("#app");
      const map = document.querySelector("#map");
      const canvas = document.querySelector("#map canvas");
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        appW: app ? app.getBoundingClientRect().width : 0,
        appH: app ? app.getBoundingClientRect().height : 0,
        mapW: map ? map.getBoundingClientRect().width : 0,
        mapH: map ? map.getBoundingClientRect().height : 0,
        canvasW: canvas ? canvas.getBoundingClientRect().width : 0,
        canvasH: canvas ? canvas.getBoundingClientRect().height : 0,
        bufferW: canvas ? canvas.width : 0,
        bufferH: canvas ? canvas.height : 0,
      };
    });

    expect(dims.appW).toBeGreaterThanOrEqual(dims.vw - 4);
    expect(dims.appH).toBeGreaterThanOrEqual(dims.vh - 4);
    expect(dims.mapW).toBeGreaterThanOrEqual(dims.vw - 4);
    expect(dims.mapH).toBeGreaterThanOrEqual(dims.vh - 4);
    expect(dims.canvasW).toBeGreaterThanOrEqual(dims.vw - 8);
    expect(dims.canvasH).toBeGreaterThanOrEqual(dims.vh - 8);
    expect(dims.bufferW).toBeGreaterThanOrEqual(Math.round((dims.vw - 8) * dims.dpr));
    expect(dims.bufferH).toBeGreaterThanOrEqual(Math.round((dims.vh - 8) * dims.dpr));
  });

  test("rapid-fire place selection keeps map full width (stress test)", async ({ page }) => {
    await openPlaces(page);
    await clickDistinctPlacesFast(page, 8);

    // Wait for any pending resize callbacks to settle
    await page.waitForTimeout(500);

    await expect(page.locator("#places-sheet")).toHaveClass(/shut/);

    const dims = await page.evaluate(() => {
      const app = document.querySelector("#app");
      const map = document.querySelector("#map");
      const canvas = document.querySelector("#map canvas");
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        appW: app ? app.getBoundingClientRect().width : 0,
        appH: app ? app.getBoundingClientRect().height : 0,
        mapW: map ? map.getBoundingClientRect().width : 0,
        mapH: map ? map.getBoundingClientRect().height : 0,
        canvasW: canvas ? canvas.getBoundingClientRect().width : 0,
        canvasH: canvas ? canvas.getBoundingClientRect().height : 0,
        bufferW: canvas ? canvas.width : 0,
        bufferH: canvas ? canvas.height : 0,
      };
    });

    expect(dims.appW).toBeGreaterThanOrEqual(dims.vw - 4);
    expect(dims.appH).toBeGreaterThanOrEqual(dims.vh - 4);
    expect(dims.mapW).toBeGreaterThanOrEqual(dims.vw - 4);
    expect(dims.mapH).toBeGreaterThanOrEqual(dims.vh - 4);
    expect(dims.canvasW).toBeGreaterThanOrEqual(dims.vw - 8);
    expect(dims.canvasH).toBeGreaterThanOrEqual(dims.vh - 8);
    expect(dims.bufferW).toBeGreaterThanOrEqual(Math.round((dims.vw - 8) * dims.dpr));
    expect(dims.bufferH).toBeGreaterThanOrEqual(Math.round((dims.vh - 8) * dims.dpr));
  });

  test("mobile repeated place selection keeps sheet fully shut", async ({ page, browserName }) => {
    test.skip(browserName === "chromium" && (await page.evaluate(() => window.innerWidth)) > 768, "mobile-only assertion");
    await openPlaces(page);
    await clickDistinctPlaces(page, 6);

    const state = await page.evaluate(() => {
      const sheet = document.querySelector("#places-sheet");
      const app = document.querySelector("#app");
      const map = document.querySelector("#map");
      const canvas = document.querySelector("#map canvas");
      const rect = sheet.getBoundingClientRect();
      return {
        shut: sheet.classList.contains("shut"),
        top: rect.top,
        height: rect.height,
        vh: window.innerHeight,
        vw: window.innerWidth,
        dpr: window.devicePixelRatio || 1,
        opacity: getComputedStyle(sheet).opacity,
        visibility: getComputedStyle(sheet).visibility,
        appW: app ? app.getBoundingClientRect().width : 0,
        mapW: map ? map.getBoundingClientRect().width : 0,
        canvasW: canvas ? canvas.getBoundingClientRect().width : 0,
        appH: app ? app.getBoundingClientRect().height : 0,
        mapH: map ? map.getBoundingClientRect().height : 0,
        canvasH: canvas ? canvas.getBoundingClientRect().height : 0,
        bufferW: canvas ? canvas.width : 0,
        bufferH: canvas ? canvas.height : 0,
      };
    });

    expect(state.shut).toBe(true);
    expect(state.visibility).toBe("hidden");
    expect(state.top).toBeGreaterThanOrEqual(state.vh - Math.min(state.height, 4));
    expect(state.appW).toBeGreaterThanOrEqual(state.vw - 4);
    expect(state.mapW).toBeGreaterThanOrEqual(state.vw - 4);
    expect(state.canvasW).toBeGreaterThanOrEqual(state.vw - 8);
    expect(state.appH).toBeGreaterThanOrEqual(state.vh - 4);
    expect(state.mapH).toBeGreaterThanOrEqual(state.vh - 4);
    expect(state.canvasH).toBeGreaterThanOrEqual(state.vh - 8);
    expect(state.bufferW).toBeGreaterThanOrEqual(Math.round((state.vw - 8) * state.dpr));
    expect(state.bufferH).toBeGreaterThanOrEqual(Math.round((state.vh - 8) * state.dpr));
  });

  test("place popup card opens centered inside viewport", async ({ page }) => {
    await openPlaces(page);
    await page.locator("#places-list li[data-place-id]").first().click();
    await page.waitForSelector(".place-popup-wrap:not(.popup-positioning)", { timeout: 10_000 });
    await page.waitForTimeout(500);

    const popup = await page.evaluate(() => {
      const content = document.querySelector(".place-popup-wrap .maplibregl-popup-content");
      const inner = document.querySelector(".place-popup-wrap .pp-inner");
      if (!content || !inner) return null;
      const rect = content.getBoundingClientRect();
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    });

    expect(popup).not.toBeNull();
    expect(Math.abs(popup.centerX - popup.vw / 2)).toBeLessThanOrEqual(16);
    expect(Math.abs(popup.centerY - popup.vh / 2)).toBeLessThanOrEqual(16);
    expect(popup.left).toBeGreaterThanOrEqual(0);
    expect(popup.right).toBeLessThanOrEqual(popup.vw);
    expect(popup.top).toBeGreaterThanOrEqual(0);
    expect(popup.bottom).toBeLessThanOrEqual(popup.vh);
  });
});
