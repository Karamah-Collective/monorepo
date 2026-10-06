/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SUITE 9: Tutorial System
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests the first-run tutorial flow: appearance, step navigation, spotlight
 * positioning, dismiss, and localStorage persistence.
 */
const { test, expect, loadApp } = require("./helpers");

test.describe("Tutorial — First Run", () => {
  test.beforeEach(async ({ page }) => {
    // Do NOT set tutorial_v1 in localStorage — let it show
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
    await page.route("**/api/geo", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"country":"FI"}' }),
    );
    await page.route("**/google.com/recaptcha/**", (route) => route.abort());
    await page.route("**/gstatic.com/recaptcha/**", (route) => route.abort());
    // Clear tutorial localStorage
    await page.addInitScript(() => localStorage.removeItem("hf_tutorial_v1"));
    await loadApp(page);
    // The tutorial starts after app initialization; wait on the UI rather than
    // assuming startup completes within a fixed interval on every device.
    await expect(page.locator(".tut-card")).toBeVisible({ timeout: 10_000 });
  });

  test("tutorial overlay appears on first visit", async ({ page }) => {
    await expect(page.locator(".tut-overlay")).toBeVisible();
    await expect(page.locator(".tut-card")).toBeVisible();
  });

  test("first step is the welcome screen", async ({ page }) => {
    await expect(page.locator(".tut-title")).toContainText("Assalamu Alaikum");
  });

  test("first step has Get started button", async ({ page }) => {
    await expect(page.locator("#tut-next")).toContainText("Get started");
  });

  test("first step has no back button", async ({ page }) => {
    await expect(page.locator("#tut-back")).toHaveCount(0);
  });

  test("Explore dismisses the welcome step without an error", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.locator("#tut-explore").click();
    await expect(page.locator(".tut-overlay")).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("hf_tutorial_v1"))).toBeTruthy();
    expect(errors).not.toContain(expect.stringContaining("_restoreEventsPill"));
  });

  test("clicking Get started advances to step 2", async ({ page }) => {
    await page.locator("#tut-next").click();
    await page.waitForTimeout(400);
    await expect(page.locator(".tut-title")).toContainText("Home");
    await expect(page.locator("#tut-back")).toBeVisible();
  });

  test("step dots are rendered correctly", async ({ page }) => {
    await page.locator("#tut-next").click();
    await page.waitForTimeout(300);
    const dots = await page.locator(".step-dot").count();
    expect(dots).toBeGreaterThan(5); // There are 10 steps
  });

  test("back button goes to previous step", async ({ page }) => {
    await page.locator("#tut-next").click();
    await page.waitForTimeout(300);
    await page.locator("#tut-back").click();
    await page.waitForTimeout(300);
    await expect(page.locator(".tut-title")).toContainText("Assalamu Alaikum");
  });

  test("spotlight appears for steps with a target", async ({ page }) => {
    await page.locator("#tut-next").click();
    await page.waitForTimeout(400);
    const spotlight = page.locator(".tut-spotlight");
    const opacity = await spotlight.evaluate((el) => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(1);
  });

  test("walkthrough follows the same main-navigation order on every viewport", async ({ page }) => {
    const titles = [];
    let safetyCounter = 0;
    while (safetyCounter < 20 && await page.locator("#tut-next").isVisible().catch(() => false)) {
      titles.push((await page.locator(".tut-title").textContent()) || "");
      const label = (await page.locator("#tut-next").textContent()) || "";
      await page.locator("#tut-next").click();
      await page.waitForTimeout(350);
      if (label.includes("Explore")) break;
      safetyCounter += 1;
    }
    expect(titles).toEqual([
      "Assalamu Alaikum!",
      "Home",
      "Routes",
      "Places",
      "Events",
      "Profile",
      "Prayer Times",
      "You’re all set!",
    ]);
  });

  test("close button dismisses tutorial", async ({ page }) => {
    // Advance past welcome step where close button is hidden (CSS: .tut-card--center .tut-close { display: none })
    await page.locator("#tut-next").click();
    await page.waitForTimeout(400);
    await page.locator(".tut-close").click();
    await page.waitForTimeout(400);
    await expect(page.locator(".tut-overlay")).not.toBeVisible();
  });

  test("dismissing tutorial sets localStorage key", async ({ page }) => {
    // Advance past welcome step where close button is hidden
    await page.locator("#tut-next").click();
    await page.waitForTimeout(400);
    await page.locator(".tut-close").click();
    await page.waitForTimeout(200);
    const val = await page.evaluate(() => localStorage.getItem("hf_tutorial_v1"));
    expect(val).toBeTruthy();
  });

  test("tutorial does not appear on second visit", async ({ page }) => {
    // Advance past welcome step where close button is hidden
    await page.locator("#tut-next").click();
    await page.waitForTimeout(400);
    await page.locator(".tut-close").click();
    await page.waitForTimeout(200);
    // Override the beforeEach initScript that clears the tutorial key
    await page.addInitScript(() => localStorage.setItem("hf_tutorial_v1", "done"));
    // Reload the page
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#map canvas")?.offsetWidth > 0, { timeout: 30_000 });
    await page.waitForTimeout(2000);
    await expect(page.locator(".tut-overlay")).not.toBeVisible();
  });
});

test.describe("Tutorial — Full Walkthrough", () => {
  test("can navigate through all tutorial steps to completion", async ({ page }) => {
    await page.route("**/api.aladhan.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            timings: { Fajr: "04:30", Sunrise: "06:00", Dhuhr: "12:30", Asr: "15:45", Maghrib: "18:30", Isha: "20:00" },
            date: { hijri: { month: { number: 1 } } },
          },
        }),
      }),
    );
    await page.route("**/api/geo", r => r.fulfill({ status: 200, contentType: "application/json", body: '{"country":"FI"}' }));
    await page.route("**/google.com/recaptcha/**", r => r.abort());
    await page.route("**/gstatic.com/recaptcha/**", r => r.abort());
    await page.addInitScript(() => localStorage.removeItem("hf_tutorial_v1"));
    await loadApp(page);
    await expect(page.locator(".tut-title")).toHaveText("Assalamu Alaikum!", { timeout: 10_000 });

    // Navigate through all steps
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    const remainingTitles = [
      "Home",
      "Routes",
      "Places",
      "Events",
      "Profile",
      "Prayer Times",
      "You’re all set!",
    ];
    for (const title of remainingTitles) {
      await page.locator("#tut-next").click();
      await expect(page.locator(".tut-title")).toHaveText(title);
    }

    await expect(page.locator("#tut-next")).toHaveText("Explore");
    await page.locator("#tut-next").click();

    // Tutorial should be dismissed
    await expect(page.locator(".tut-overlay")).not.toBeVisible();
    // No JS errors during walkthrough
    const real = errors.filter(e => !e.includes("recaptcha") && !e.includes("grecaptcha"));
    expect(real).toEqual([]);
  });
});
