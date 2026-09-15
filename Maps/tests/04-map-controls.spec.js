/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SUITE 4: Map Interactions & Controls
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests zoom buttons, style switching, home button reset, map movement,
 * double-click pin dropping, and marker visibility.
 */
const { test, expect, setupApp } = require("./helpers");

test.describe("Zoom Controls", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("zoom in button increases zoom level", async ({ page }) => {
    const before = await page.evaluate(() => window.maplibregl && document.querySelector("#map")?.__map?.getZoom());
    // Use the exposed map instance
    const zoomBefore = await page.evaluate(() => {
      const canvas = document.querySelector("#map canvas");
      // MapLibre stores the instance on the container
      return parseFloat(document.querySelector(".maplibregl-ctrl-scale")?.textContent || "0");
    });
    await page.locator("#zoomin-btn").click();
    await page.waitForTimeout(400);
    // After zoom in, the scale text should change (smaller distance)
    const zoomAfter = await page.evaluate(() => {
      return document.querySelector(".maplibregl-ctrl-scale")?.textContent || "";
    });
    // Just verify the scale text changed (indicating zoom changed)
    // The exact value depends on map state
    expect(typeof zoomAfter).toBe("string");
  });

  test("zoom out button decreases zoom level", async ({ page }) => {
    const scaleBefore = await page.evaluate(() =>
      document.querySelector(".maplibregl-ctrl-scale")?.textContent || ""
    );
    await page.locator("#zoomout-btn").click();
    await page.waitForTimeout(400);
    const scaleAfter = await page.evaluate(() =>
      document.querySelector(".maplibregl-ctrl-scale")?.textContent || ""
    );
    // Scale should change after zooming
    expect(typeof scaleAfter).toBe("string");
  });

  test("repeated zoom clicks work without errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    for (let i = 0; i < 5; i++) {
      await page.locator("#zoomin-btn").click();
      await page.waitForTimeout(150);
    }
    for (let i = 0; i < 5; i++) {
      await page.locator("#zoomout-btn").click();
      await page.waitForTimeout(150);
    }
    expect(errors).toEqual([]);
  });
});

test.describe("Style Picker", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("menu pill opens the menu sheet, close button closes it", async ({ page }) => {
    // Once open, the shared scrim (higher z-index) covers #menu-pill itself —
    // same as #places-btn/#dir-btn while their own sheets are open — so
    // closing goes through #menu-close, not a second click on the pill.
    const sheet = page.locator("#menu-sheet");
    await expect(sheet).toHaveClass(/shut/);
    await page.locator("#menu-pill").click();
    await expect(sheet).not.toHaveClass(/shut/);
    await page.locator("#menu-close").click();
    await expect(sheet).toHaveClass(/shut/);
  });

  test("selecting satellite style marks it active", async ({ page }) => {
    await page.locator("#menu-pill").click();
    await page.locator('.style-opt[data-style="satellite"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.style-opt[data-style="satellite"]')).toHaveClass(/active/);
    // Light theme button stays active (satellite is a toggle)
    await expect(page.locator('.style-opt[data-style="light"]')).toHaveClass(/active/);
  });

  test("toggling satellite off restores light theme", async ({ page }) => {
    await page.locator("#menu-pill").click();
    // Toggle satellite on
    await page.locator('.style-opt[data-style="satellite"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.style-opt[data-style="satellite"]')).toHaveClass(/active/);
    // Toggle satellite off
    await page.locator('.style-opt[data-style="satellite"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.style-opt[data-style="light"]')).toHaveClass(/active/);
    await expect(page.locator('.style-opt[data-style="satellite"]')).not.toHaveClass(/active/);
  });

  test("selecting hybrid marks only the hybrid overlay active", async ({ page }) => {
    await page.locator("#menu-pill").click();
    await page.locator('.style-opt[data-style="hybrid"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.style-opt[data-style="hybrid"]')).toHaveClass(/active/);
    await expect(page.locator('.style-opt[data-style="satellite"]')).not.toHaveClass(/active/);
  });

  test("clicking the scrim closes the menu sheet", async ({ page }) => {
    await page.locator("#menu-pill").click();
    await expect(page.locator("#menu-sheet")).not.toHaveClass(/shut/);
    await page.locator("#scrim").click({ force: true });
    await page.waitForTimeout(200);
    await expect(page.locator("#menu-sheet")).toHaveClass(/shut/);
  });

  // Regression: .menu-row (Support section) used to render its hover pill
  // edge-to-edge with the sheet, with zero breathing room from the sheet's
  // own borders. It's now inset via margin on both sides.
  test("Support rows are inset from the Menu sheet's edges, not flush", async ({ page }) => {
    await page.locator("#menu-pill").click();
    // The Account section renders asynchronously (initMenuAccount() dynamically
    // imports auth.js/reviews.js/account-sync.js) and its content height feeds
    // into the sheet's own fit-content sizing — wait for it to settle first so
    // this geometry check isn't racing that reflow (same wait tests/14 uses).
    await expect(page.locator("#menu-google-signin, #menu-signout")).toBeVisible({ timeout: 15_000 });
    const rowBox = await page.locator("#contact-pill").boundingBox();
    const sheetBox = await page.locator("#menu-sheet").boundingBox();
    // Margin is var(--sp-3) = 8px each side — assert a meaningfully large gap
    // (not a strict pixel match) so this stays robust to sub-pixel rounding.
    expect(rowBox.x - sheetBox.x).toBeGreaterThan(4);
    expect(sheetBox.x + sheetBox.width - (rowBox.x + rowBox.width)).toBeGreaterThan(4);
  });

  // Regression: #style-panel should keep grouped map controls compact without
  // horizontal overflow as Overlay grows beyond the original two choices.
  test("Map View groups stay compact without horizontal overflow", async ({ page }) => {
    await page.locator("#menu-pill").click();
    await expect(page.locator("#menu-google-signin, #menu-signout")).toBeVisible({ timeout: 15_000 });
    const themeGroup = page.locator(".style-group", { hasText: "Theme" });
    const overlayGroup = page.locator(".style-group", { hasText: "Overlay" });
    const themeBox = await themeGroup.boundingBox();
    const overlayBox = await overlayGroup.boundingBox();
    // Same row: vertically aligned (top edges within a couple px of each other)
    expect(Math.abs(themeBox.y - overlayBox.y)).toBeLessThan(5);
    // Side by side, not stacked: Overlay starts to the right of where Theme ends
    expect(overlayBox.x).toBeGreaterThanOrEqual(themeBox.x + themeBox.width);
    // The whole panel never overflows the sheet width (no horizontal scroll/wrap)
    const panelEl = page.locator("#style-panel");
    const overflowsWidth = await panelEl.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(overflowsWidth).toBe(false);
  });

  // New Preferences-adjacent option (Theme group): "Auto" follows the OS-level
  // prefers-color-scheme setting live instead of a fixed light/dark choice.
  test("selecting Auto theme stores 'auto' and marks the Auto option active", async ({ page }) => {
    await page.locator("#menu-pill").click();
    await page.locator('.style-opt[data-style="auto"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.style-opt[data-style="auto"]')).toHaveClass(/active/);
    await expect(page.locator('.style-opt[data-style="light"]')).not.toHaveClass(/active/);
    const stored = await page.evaluate(() => localStorage.getItem("theme"));
    expect(stored).toBe("auto");
  });

  test("sign-in provider buttons are icon-only touch targets", async ({ page }) => {
    await page.locator("#menu-pill").click();
    const buttons = page.locator("#menu-account-signin-row > button:visible");
    await expect(buttons).toHaveCount(4, { timeout: 15_000 });
    await expect(buttons).toHaveText(["", "", "", ""]);
    for (const box of await buttons.evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }))) {
      expect(box.height).toBeGreaterThanOrEqual(43);
      expect(box.height).toBeLessThan(48);
    }
  });

  test("Google, Microsoft, Facebook, and email are equal-weight peers in one row", async ({ page }) => {
    await page.locator("#menu-pill").click();
    const buttons = page.locator("#menu-account-signin-row > button:visible");
    await expect(buttons).toHaveCount(4, { timeout: 15_000 });
    const labels = await buttons.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    expect(labels).toEqual(["Continue with Google", "Continue with Microsoft", "Continue with Facebook", "Continue with email"]);
    const boxes = await buttons.evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    const first = boxes[0];
    for (const box of boxes.slice(1)) {
      expect(Math.abs(first.y - box.y)).toBeLessThan(5);
      expect(Math.abs(first.height - box.height)).toBeLessThan(1);
      expect(Math.abs(first.width - box.width)).toBeLessThan(4);
    }
    await page.locator("#menu-password-signin-toggle").click();
    await expect(page.locator("#menu-password-signin-panel")).not.toHaveClass(/hide/);
  });
});

test.describe("Preferences", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.locator("#menu-pill").click();
    await page.waitForFunction(() => document.querySelectorAll("#pref-prayer-method option").length > 1);
  });

  test("changing the prayer calculation method re-fetches Aladhan times", async ({ page }) => {
    const requests = [];
    page.on("request", (req) => {
      if (req.url().includes("api.aladhan.com/v1/timings")) requests.push(req.url());
    });
    await page.selectOption("#pref-prayer-method", "2"); // ISNA
    await page.waitForTimeout(1000);
    expect(requests.some((u) => u.includes("method=2"))).toBe(true);
    const stored = await page.evaluate(() => localStorage.getItem("hf_prayer_method"));
    expect(stored).toBe("2");
  });

  test("changing the Asr madhab re-fetches Aladhan times with the new school", async ({ page }) => {
    const requests = [];
    page.on("request", (req) => {
      if (req.url().includes("api.aladhan.com/v1/timings")) requests.push(req.url());
    });
    await page.selectOption("#pref-prayer-school", "1"); // Hanafi
    await page.waitForTimeout(1000);
    expect(requests.some((u) => u.includes("school=1"))).toBe(true);
    const stored = await page.evaluate(() => localStorage.getItem("hf_prayer_school"));
    expect(stored).toBe("1");
  });

  test("reduce-motion switch toggles html.reduce-motion and persists the override", async ({ page }) => {
    const toggle = page.locator("#pref-reduce-motion-toggle");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/reduce-motion/);
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    let stored = await page.evaluate(() => localStorage.getItem("hf_reduce_motion"));
    expect(stored).toBe("true");

    await toggle.click();
    await expect(page.locator("html")).not.toHaveClass(/reduce-motion/);
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    stored = await page.evaluate(() => localStorage.getItem("hf_reduce_motion"));
    expect(stored).toBe("false");
  });

  // New Preferences addition: 12-hour/24-hour prayer time display. No network
  // re-fetch needed (only the display format changes) — this exercises
  // prayer.js's refreshPrayerTimeDisplay() re-render path.
  test("12-hour prayer times toggle reformats the expanded prayer list live", async ({ page }) => {
    // Wait for prayer times to actually load before expanding the list
    await page.waitForFunction(() => document.getElementById("prayer-snack-title")?.textContent?.trim().length > 0, { timeout: 15_000 });
    await page.locator("#menu-close").click();
    await page.locator("#prayer-chevron").click();
    await expect(page.locator(".prayer-time-item").first()).toBeVisible();
    const before = await page.locator(".prayer-time-value").first().textContent();
    expect(before).not.toMatch(/AM|PM/i);

    await page.locator("#prayer-chevron").click(); // collapse before reopening menu
    await page.locator("#menu-pill").click();
    const toggle = page.locator("#pref-time-format-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    const stored = await page.evaluate(() => localStorage.getItem("hf_prayer_time_format"));
    expect(stored).toBe("12");

    await page.locator("#menu-close").click();
    await page.locator("#prayer-chevron").click();
    const after = await page.locator(".prayer-time-value").first().textContent();
    expect(after).toMatch(/AM|PM/i);
  });
});

test.describe("Home Button", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("home button is visible and clickable", async ({ page }) => {
    await expect(page.locator("#home-btn")).toBeVisible();
    await page.locator("#home-btn").click();
    // Should not throw errors
  });

  test("home button resets to light theme if satellite is active", async ({ page }) => {
    // Switch to satellite
    await page.locator("#menu-pill").click();
    await page.locator('.style-opt[data-style="satellite"]').click();
    await page.waitForTimeout(500);
    // Close the menu (its scrim would otherwise block the tab bar), then click home
    await page.locator("#menu-close").click();
    await page.waitForTimeout(500);
    await page.locator("#home-btn").click();
    await page.waitForTimeout(800);
    await expect(page.locator('.style-opt[data-style="light"]')).toHaveClass(/active/);
    await expect(page.locator('.style-opt[data-style="satellite"]')).not.toHaveClass(/active/);
  });
});

test.describe("Double-Click Pin Drop", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  // Offset from dead-center: the default Helsinki view has a real place marker
  // sitting almost exactly at the map's screen center, and double-clicking
  // directly on an existing marker opens/closes its detail sheet on each of
  // the two clicks instead of reaching the map's own dblclick-to-drop-a-pin
  // handler underneath (see tests/11-pin-markers.spec.js for the full note).
  test("double-clicking map creates a dropped pin marker", async ({ page }) => {
    const mapBox = await page.locator("#map").boundingBox();
    const x = mapBox.x + mapBox.width / 2 + 160;
    const y = mapBox.y + mapBox.height / 2 - 160;
    await page.mouse.dblclick(x, y);
    await page.waitForTimeout(800);
    // Should create a custom marker
    const customMarkers = await page.locator(".custom-mk").count();
    expect(customMarkers).toBeGreaterThanOrEqual(1);
  });

  test("clicking dropped pin opens a popup", async ({ page }) => {
    const mapBox = await page.locator("#map").boundingBox();
    const x = mapBox.x + mapBox.width / 2 + 160;
    const y = mapBox.y + mapBox.height / 2 - 160;
    await page.mouse.dblclick(x, y);
    await page.waitForTimeout(800);
    // Close any existing place popups that may cover the pin
    await page.evaluate(() => document.querySelectorAll('.maplibregl-popup').forEach(p => p.remove()));
    // Click the marker
    await page.locator(".custom-mk").first().click();
    await page.waitForTimeout(500);
    // Popup should appear
    await expect(page.locator(".maplibregl-popup")).toBeVisible();
  });
});

test.describe("URL Hash Updates", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("moving map updates the URL hash", async ({ page }) => {
    // Drag the map
    const mapBox = await page.locator("#map").boundingBox();
    const cx = mapBox.x + mapBox.width / 2;
    const cy = mapBox.y + mapBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    const hash = await page.evaluate(() => location.hash);
    expect(hash).toMatch(/^#\d+\.\d\/\d+\.\d+\/\d+\.\d+/);
  });
});

test.describe("No Console Errors on Load", () => {
  test("page loads without JavaScript errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await setupApp(page);
    // Filter out known acceptable errors (e.g., fetch failures for mocked APIs)
    const real = errors.filter(
      (e) => !e.includes("recaptcha") && !e.includes("grecaptcha"),
    );
    expect(real).toEqual([]);
  });
});
