/**
 * Shared test helpers for Halal Finder test suite.
 *
 * Provides a pre-configured `test` fixture that:
 *   1. Navigates to the app
 *   2. Waits for the map to fully load (tiles + data)
 *   3. Dismisses the tutorial overlay if visible
 *   4. Exposes convenience selectors
 */
const base = require("@playwright/test");

exports.test = base.test.extend({
  page: async ({ page }, use) => {
    // Block external API calls that are slow / flaky in tests
    await page.route("**/api.aladhan.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            timings: {
              Fajr: "04:30", Sunrise: "06:00", Dhuhr: "12:30",
              Asr: "15:45", Maghrib: "18:30", Isha: "20:00",
            },
            date: { hijri: { month: { number: 1 } } },
          },
        }),
      }),
    );
    await page.route("**/ipwho.is/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ country_code: "FI" }),
      }),
    );
    await page.route("**/ipapi.co/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ country_code: "FI" }),
      }),
    );
    await page.route("**/api/geo", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ country: "FI" }),
      }),
    );
    // Block reCAPTCHA to avoid loading third-party scripts
    await page.route("**/google.com/recaptcha/**", (route) => route.abort());
    await page.route("**/gstatic.com/recaptcha/**", (route) => route.abort());

    await use(page);
  },
});

exports.expect = base.expect;

/**
 * Navigate to the app and wait for the map + places data to be ready.
 */
exports.loadApp = async function loadApp(page) {
  await page.goto("/");
  // Wait for MapLibre to fire its "load" event (places data starts loading there)
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#map canvas");
    return canvas && canvas.offsetWidth > 0;
  }, { timeout: 30_000 });
  // Wait for places to render (badge appears)
  await page.waitForSelector("#places-badge:not(.hide)", { timeout: 15_000 }).catch(() => {});
  // Small settle time for animations
  await page.waitForTimeout(600);
};

/**
 * Dismiss the first-run tutorial if it's showing.
 */
exports.dismissTutorial = async function dismissTutorial(page) {
  const tutClose = page.locator(".tut-close");
  if (await tutClose.isVisible({ timeout: 2000 }).catch(() => false)) {
    await tutClose.click();
    await page.waitForTimeout(400);
  }
};

/**
 * Open the app AND dismiss tutorial in one call.
 */
exports.setupApp = async function setupApp(page) {
  // Set tutorial as already seen so it doesn't appear
  await page.addInitScript(() => {
    localStorage.setItem("hf_tutorial_v1", "done");
  });
  await exports.loadApp(page);
};
