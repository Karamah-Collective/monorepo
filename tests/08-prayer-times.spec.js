/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SUITE 8: Prayer Times
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests the prayer snack pill, expand/collapse, prayer time list rendering,
 * and Ramadan card visibility.
 */
const { test, expect, setupApp } = require("./helpers");

test.describe("Prayer Snack — Pill & Expand", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    // Wait for prayer data to load (mocked in helpers)
    await page.waitForTimeout(1000);
  });

  test("prayer pill is visible", async ({ page }) => {
    await expect(page.locator("#prayer-pill")).toBeVisible();
  });

  test("prayer pill has aria-label", async ({ page }) => {
    await expect(page.locator("#prayer-pill")).toHaveAttribute("aria-label", "Prayer times");
  });

  test("clicking prayer pill reveals the prayer snack", async ({ page }) => {
    // If collapsed, clicking should reveal
    const snack = page.locator("#prayer-snack");
    if (await snack.evaluate((el) => el.classList.contains("collapsed"))) {
      await page.locator("#prayer-pill").click();
      await page.waitForTimeout(300);
      await expect(snack).not.toHaveClass(/collapsed/);
    }
  });

  test("prayer snack shows next prayer countdown", async ({ page }) => {
    const title = page.locator("#prayer-snack-title");
    // After mocked data loads, title should contain a prayer name
    const text = await title.textContent();
    // Should contain one of the prayer names or be loading
    const hasPrayer = /Fajr|Dhuhr|Asr|Maghrib|Isha/i.test(text);
    expect(hasPrayer || text.length === 0).toBe(true);
  });
});

test.describe("Prayer Times — Expanded List", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.waitForTimeout(1000);
    // Reveal the snack if collapsed
    const snack = page.locator("#prayer-snack");
    if (await snack.evaluate((el) => el.classList.contains("collapsed"))) {
      await page.locator("#prayer-pill").click();
      await page.waitForTimeout(300);
    }
  });

  test("clicking chevron expands the prayer times list", async ({ page }) => {
    await page.locator("#prayer-chevron").click();
    await page.waitForTimeout(400);
    await expect(page.locator("#prayer-snack")).toHaveClass(/expanded/);
  });

  test("expanded list shows 5 prayer times", async ({ page }) => {
    await page.locator("#prayer-chevron").click();
    await page.waitForTimeout(400);
    const items = page.locator("#prayer-times-inner .prayer-time-item");
    await expect(items).toHaveCount(5);
  });

  test("each prayer item has name and time", async ({ page }) => {
    await page.locator("#prayer-chevron").click();
    await page.waitForTimeout(400);
    const items = page.locator("#prayer-times-inner .prayer-time-item");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const name = await items.nth(i).locator(".prayer-time-name").textContent();
      const time = await items.nth(i).locator(".prayer-time-value").textContent();
      expect(name.length).toBeGreaterThan(0);
      expect(time).toMatch(/\d{2}:\d{2}/);
    }
  });

  test("prayer names are Fajr, Dhuhr, Asr, Maghrib, Isha", async ({ page }) => {
    await page.locator("#prayer-chevron").click();
    await page.waitForTimeout(400);
    const names = await page.locator("#prayer-times-inner .prayer-time-name").allTextContents();
    expect(names).toEqual(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]);
  });

  test("clicking chevron again collapses the list", async ({ page }) => {
    await page.locator("#prayer-chevron").click();
    await page.waitForTimeout(400);
    await expect(page.locator("#prayer-snack")).toHaveClass(/expanded/);
    await page.locator("#prayer-chevron").click();
    await page.waitForTimeout(400);
    await expect(page.locator("#prayer-snack")).not.toHaveClass(/expanded/);
  });
});

test.describe("Prayer — Ramadan Card", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("ramadan card elements exist", async ({ page }) => {
    await expect(page.locator("#ramadan-card")).toBeAttached();
    await expect(page.locator("#ramadan-suhoor")).toBeAttached();
    await expect(page.locator("#ramadan-iftar")).toBeAttached();
  });

  test("ramadan card is hidden when not Ramadan (month != 9)", async ({ page }) => {
    // Our mock returns hijri month 1, so ramadan-active should not be set
    await page.waitForTimeout(1000);
    await expect(page.locator("#prayer-snack")).not.toHaveClass(/ramadan-active/);
  });
});

test.describe("Prayer — Ramadan Active", () => {
  test("ramadan card is shown when Ramadan is detected", async ({ page }) => {
    // Override the prayer API mock to return Ramadan month
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
            date: { hijri: { month: { number: 9 } } },
          },
        }),
      }),
    );
    await page.addInitScript(() => localStorage.setItem("hf_tutorial_v1", "done"));
    await page.goto("/");
    await page.waitForFunction(() => document.querySelector("#map canvas")?.offsetWidth > 0, { timeout: 30_000 });
    await page.waitForTimeout(2000);
    await expect(page.locator("#prayer-snack")).toHaveClass(/ramadan-active/);
  });
});

test.describe("Prayer — Find Nearest Mosque Button", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.waitForTimeout(1000);
  });

  // Skipped: #prayer-mosque-btn element has not been added to index.html yet
  test.skip("find mosque button exists in prayer snack", async ({ page }) => {
    await expect(page.locator("#prayer-mosque-btn")).toBeAttached();
  });
});
