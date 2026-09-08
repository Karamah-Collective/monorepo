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
    // Wait for tutorial to appear (800ms delay + render)
    await page.waitForTimeout(1500);
  });

  test("tutorial overlay appears on first visit", async ({ page }) => {
    await expect(page.locator(".tut-overlay")).toBeVisible();
    await expect(page.locator(".tut-card")).toBeVisible();
  });

  test("first step is the welcome screen", async ({ page }) => {
    await expect(page.locator(".tut-title")).toContainText("Welcome");
  });

  test("first step has Get started button", async ({ page }) => {
    await expect(page.locator("#tut-next")).toContainText("Get started");
  });

  test("first step has no back button", async ({ page }) => {
    await expect(page.locator("#tut-back")).toHaveCount(0);
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
    await expect(page.locator(".tut-title")).toContainText("Welcome");
  });

  test("spotlight appears for steps with a target", async ({ page }) => {
    await page.locator("#tut-next").click();
    await page.waitForTimeout(400);
    const spotlight = page.locator(".tut-spotlight");
    const opacity = await spotlight.evaluate((el) => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(1);
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
    await page.waitForTimeout(1500);

    // Navigate through all steps
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    let safetyCounter = 0;
    while (safetyCounter < 15) {
      const nextBtn = page.locator("#tut-next");
      if (!(await nextBtn.isVisible().catch(() => false))) break;
      const text = await nextBtn.textContent();
      await nextBtn.click();
      await page.waitForTimeout(400);
      if (text.includes("Explore")) break;
      safetyCounter++;
    }
    // Tutorial should be dismissed
    await page.waitForTimeout(500);
    await expect(page.locator(".tut-overlay")).not.toBeVisible();
    // No JS errors during walkthrough
    const real = errors.filter(e => !e.includes("recaptcha") && !e.includes("grecaptcha"));
    expect(real).toEqual([]);
  });
});
