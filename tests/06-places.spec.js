/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SUITE 6: Places Sheet & Filtering
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests the places list, type filter chips, tag filters, place card structure,
 * favourites, and place popup interactions.
 */
const { test, expect, setupApp } = require("./helpers");

test.describe("Places Sheet — Open & Close", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("places sheet opens on tab click", async ({ page }) => {
    await page.locator("#places-btn").click();
    await page.waitForTimeout(600);
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
  });

  test("places sheet closes on close button", async ({ page }) => {
    await page.locator("#places-btn").click();
    await page.waitForTimeout(600);
    await page.locator("#places-close").click();
    await page.waitForTimeout(600);
    await expect(page.locator("#places-sheet")).toHaveClass(/shut/);
  });

  test("places sheet toggles on repeated tab clicks", async ({ page }) => {
    await page.locator("#places-btn").click();
    await page.waitForTimeout(600);
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    // Force-click bypasses scrim that covers tab bar when sheet is open
    await page.locator("#places-btn").click({ force: true });
    await page.waitForTimeout(600);
    await expect(page.locator("#places-sheet")).toHaveClass(/shut/);
  });
});

test.describe("Places List — Content", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.locator("#places-btn").click();
    await page.waitForTimeout(600);
  });

  test("places list shows place cards", async ({ page }) => {
    const cards = page.locator("#places-list .pl-card");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("place cards have name, address, and tags summary", async ({ page }) => {
    const first = page.locator("#places-list .pl-card").first();
    await expect(first.locator(".pl-name")).toBeVisible();
    await expect(first.locator(".pl-addr")).toBeVisible();
    await expect(first.locator(".pl-tags-summary")).toBeVisible();
  });

  test("place cards have favourite button", async ({ page }) => {
    const first = page.locator("#places-list .pl-card").first();
    await expect(first.locator(".pl-fav-btn")).toBeVisible();
  });

  test("place cards have coloured dot icon", async ({ page }) => {
    const first = page.locator("#places-list .pl-card").first();
    const dot = first.locator(".pl-dot");
    await expect(dot).toBeVisible();
    await expect(dot.locator("svg")).toBeVisible();
  });

  test("places count text matches visible cards", async ({ page }) => {
    const countText = await page.locator("#places-ct").textContent();
    const match = countText.match(/(\d+)/);
    expect(match).toBeTruthy();
    const expectedCount = parseInt(match[1], 10);
    const cards = await page.locator("#places-list .pl-card").count();
    expect(cards).toBe(expectedCount);
  });
});

test.describe("Places — Type Filtering", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.locator("#places-btn").click();
    await page.waitForTimeout(600);
  });

  test("clicking a type chip filters the list", async ({ page }) => {
    const allCount = await page.locator("#places-list .pl-card").count();
    await page.locator('.pf-chip[data-type="mosque"]').click();
    await page.waitForTimeout(300);
    const mosqueCount = await page.locator("#places-list .pl-card").count();
    expect(mosqueCount).toBeLessThanOrEqual(allCount);
    expect(mosqueCount).toBeGreaterThan(0);
  });

  test("type chip becomes active when clicked", async ({ page }) => {
    await page.locator('.pf-chip[data-type="restaurant"]').click();
    await expect(page.locator('.pf-chip[data-type="restaurant"]')).toHaveClass(/active/);
    await expect(page.locator('.pf-chip[data-type="all"]')).not.toHaveClass(/active/);
  });

  test("filtered list shows correct type in tags summary", async ({ page }) => {
    await page.locator('.pf-chip[data-type="restaurant"]').click();
    await page.waitForTimeout(300);
    const summaries = page.locator("#places-list .pl-tags-summary");
    const count = await summaries.count();
    for (let i = 0; i < count; i++) {
      await expect(summaries.nth(i)).toHaveAttribute("data-type", "Restaurant");
    }
  });

  test("switching back to All shows all places", async ({ page }) => {
    const allCount = await page.locator("#places-list .pl-card").count();
    await page.locator('.pf-chip[data-type="mosque"]').click();
    await page.waitForTimeout(300);
    await page.locator('.pf-chip[data-type="all"]').click();
    await page.waitForTimeout(300);
    const afterAll = await page.locator("#places-list .pl-card").count();
    expect(afterAll).toBe(allCount);
  });

  test("each type filter produces corresponding markers on map", async ({ page }) => {
    await page.locator('.pf-chip[data-type="mosque"]').click();
    await page.waitForTimeout(300);
    const listCount = await page.locator("#places-list .pl-card").count();
    const markerCount = await page.locator(".place-mk-wrap").count();
    expect(markerCount).toBe(listCount);
  });
});

test.describe("Places — Tag Filtering", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.locator("#places-btn").click();
    await page.waitForTimeout(600);
  });

  test("tag filter row appears for typed filter (not All/Saved)", async ({ page }) => {
    await page.locator('.pf-chip[data-type="mosque"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator("#tf-row")).not.toHaveClass(/hide/);
  });

  test("tag filter row is hidden for All filter", async ({ page }) => {
    await expect(page.locator("#tf-row")).toHaveClass(/hide/);
  });

  test("clicking filter toggle reveals tag chips", async ({ page }) => {
    await page.locator('.pf-chip[data-type="mosque"]').click();
    await page.waitForTimeout(300);
    await page.locator("#tf-toggle").click();
    await page.waitForTimeout(200);
    await expect(page.locator("#tag-filter-chips")).not.toHaveClass(/shut/);
    const chips = await page.locator("#tag-filter-chips .tf-chip").count();
    expect(chips).toBeGreaterThan(0);
  });

  test("clicking a tag chip toggles its active state", async ({ page }) => {
    await page.locator('.pf-chip[data-type="mosque"]').click();
    await page.waitForTimeout(300);
    await page.locator("#tf-toggle").click();
    await page.waitForTimeout(200);
    const chip = page.locator("#tag-filter-chips .tf-chip").first();
    await expect(chip).not.toHaveClass(/active/);
    await chip.click();
    await expect(chip).toHaveClass(/active/);
    await chip.click();
    await expect(chip).not.toHaveClass(/active/);
  });

  test("active tag filter count badge updates", async ({ page }) => {
    await page.locator('.pf-chip[data-type="mosque"]').click();
    await page.waitForTimeout(300);
    await page.locator("#tf-toggle").click();
    await page.waitForTimeout(200);
    await expect(page.locator("#tf-count")).toHaveClass(/hide/);
    await page.locator("#tag-filter-chips .tf-chip").first().click();
    await page.waitForTimeout(200);
    await expect(page.locator("#tf-count")).not.toHaveClass(/hide/);
    await expect(page.locator("#tf-count")).toContainText("1");
  });
});

test.describe("Places — Favourites", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    // Clear favourites
    await page.evaluate(() => localStorage.removeItem("hf_favs"));
    await page.locator("#places-btn").click();
    await page.waitForTimeout(600);
  });

  test("favourite button toggles active class", async ({ page }) => {
    const favBtn = page.locator("#places-list .pl-fav-btn").first();
    await expect(favBtn).not.toHaveClass(/active/);
    await favBtn.click();
    await page.waitForTimeout(200);
    await expect(favBtn).toHaveClass(/active/);
    await favBtn.click();
    await page.waitForTimeout(200);
    await expect(favBtn).not.toHaveClass(/active/);
  });

  test("saved tab shows empty state when no favourites", async ({ page }) => {
    await page.locator('.pf-chip[data-type="saved"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator("#places-empty")).not.toHaveClass(/hide/);
    await expect(page.locator("#places-empty")).toContainText(/Nothing saved/);
  });

  test("saved tab shows favourited places", async ({ page }) => {
    // Favourite the first place
    await page.locator("#places-list .pl-fav-btn").first().click();
    await page.waitForTimeout(200);
    // Switch to saved tab
    await page.locator('.pf-chip[data-type="saved"]').click();
    await page.waitForTimeout(300);
    const cards = await page.locator("#places-list .pl-card").count();
    expect(cards).toBeGreaterThanOrEqual(1);
  });

  test("favourites persist in localStorage", async ({ page }) => {
    await page.locator("#places-list .pl-fav-btn").first().click();
    await page.waitForTimeout(200);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("hf_favs") || "[]"));
    expect(stored.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Places — Place Detail Sheet", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("clicking a place marker opens the place sheet", async ({ page }) => {
    // Use dispatchEvent to bypass viewport check (MapLibre markers may be off-screen)
    await page.locator(".place-mk-wrap").first().dispatchEvent('click');
    await page.waitForTimeout(800);
    await expect(page.locator("#place-sheet")).not.toHaveClass(/shut/);
  });

  test("place sheet has title, address, and action buttons", async ({ page }) => {
    await page.locator(".place-mk-wrap").first().dispatchEvent('click');
    await page.waitForTimeout(800);
    const body = page.locator("#place-sheet-body");
    await expect(page.locator("#place-sheet-title")).not.toBeEmpty();
    await expect(body.locator(".pp-addr")).toBeVisible();
    await expect(body.locator(".pp-dir-btn")).toBeVisible();
    await expect(body.locator(".pp-share-btn")).toBeVisible();
    await expect(body.locator(".pp-fav-btn")).toBeVisible();
  });

  test("place sheet has edit button", async ({ page }) => {
    await page.locator(".place-mk-wrap").first().dispatchEvent('click');
    await page.waitForTimeout(800);
    await expect(page.locator("#place-sheet-body .pp-edit-btn")).toBeVisible();
  });

  test("clicking a place card in list opens its sheet", async ({ page }) => {
    await page.locator("#places-btn").click();
    await page.waitForTimeout(600);
    await page.locator("#places-list .pl-card").first().click();
    await page.waitForTimeout(800);
    await expect(page.locator("#place-sheet")).not.toHaveClass(/shut/);
  });

  test("place sheet favourite button toggles state", async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem("hf_favs"));
    await page.locator(".place-mk-wrap").first().dispatchEvent('click');
    await page.waitForTimeout(800);
    const favBtn = page.locator("#place-sheet-body .pp-fav-btn");
    await expect(favBtn).not.toHaveClass(/active/);
    await favBtn.click();
    await page.waitForTimeout(200);
    await expect(favBtn).toHaveClass(/active/);
  });
});
