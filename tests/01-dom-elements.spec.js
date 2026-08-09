/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SUITE 1: DOM Elements & Structure
 * ═══════════════════════════════════════════════════════════════════════════════
 * Verifies every critical DOM element exists, is correctly structured,
 * and has proper attributes (ARIA labels, ids, classes).
 */
const { test, expect, setupApp } = require("./helpers");

test.describe("Core DOM Structure", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  // ─── App Shell ──────────────────────────────────────────────────────────────
  test("app container and map canvas exist", async ({ page }) => {
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("#map")).toBeVisible();
    await expect(page.locator("#map canvas")).toBeVisible();
  });

  test("map canvas has non-zero dimensions", async ({ page }) => {
    const box = await page.locator("#map canvas").boundingBox();
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(100);
  });

  // ─── Tab Bar ────────────────────────────────────────────────────────────────
  test("tab bar exists with all navigation buttons", async ({ page }) => {
    await expect(page.locator("#tab-bar")).toBeVisible();
    for (const id of ["home-btn", "dir-btn", "places-btn", "menu-pill"]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });

  test("each tab has an aria-label", async ({ page }) => {
    for (const id of ["home-btn", "dir-btn", "places-btn", "menu-pill"]) {
      const label = await page.locator(`#${id}`).getAttribute("aria-label");
      expect(label).toBeTruthy();
    }
  });

  test("each tab contains an SVG icon and label text", async ({ page }) => {
    for (const id of ["home-btn", "dir-btn", "places-btn", "menu-pill"]) {
      await expect(page.locator(`#${id} svg`)).toBeVisible();
      await expect(page.locator(`#${id} span`).first()).toBeVisible();
    }
  });

  // ─── Search Card ────────────────────────────────────────────────────────────
  test("search card elements exist", async ({ page }) => {
    await expect(page.locator("#search-card")).toBeVisible();
    await expect(page.locator("#search-pill")).toBeVisible();
    await expect(page.locator("#search-input")).toBeAttached();
    await expect(page.locator("#clear-input")).toBeAttached();
    await expect(page.locator("#search-drop")).toBeAttached();
    await expect(page.locator("#results-list")).toBeAttached();
  });

  test("search card starts collapsed", async ({ page }) => {
    await expect(page.locator("#search-card")).toHaveClass(/collapsed/);
  });

  test("search input has correct attributes", async ({ page }) => {
    const inp = page.locator("#search-input");
    await expect(inp).toHaveAttribute("placeholder", /Search places/);
    await expect(inp).toHaveAttribute("autocomplete", "off");
    await expect(inp).toHaveAttribute("spellcheck", "false");
  });

  // ─── Zoom Controls ─────────────────────────────────────────────────────────
  test("zoom pill with buttons exists", async ({ page }) => {
    await expect(page.locator("#zoom-pill")).toBeVisible();
    await expect(page.locator("#zoomin-btn")).toBeVisible();
    await expect(page.locator("#zoomout-btn")).toBeVisible();
  });

  test("zoom buttons have aria-labels", async ({ page }) => {
    await expect(page.locator("#zoomin-btn")).toHaveAttribute("aria-label", "Zoom in");
    await expect(page.locator("#zoomout-btn")).toHaveAttribute("aria-label", "Zoom out");
  });

  // ─── Menu / Map Style ──────────────────────────────────────────────────────
  // Map View is grouped into two labeled sub-sections in the same row: Theme
  // (Light/Dark/Auto, 3 options) and Overlay (Satellite/Heatmap, 2 options).
  test("menu pill exists with a map style panel inside, grouped into Theme + Overlay", async ({ page }) => {
    await expect(page.locator("#menu-pill")).toBeVisible();
    await expect(page.locator("#style-panel")).toBeAttached();
    const opts = page.locator(".style-opt");
    await expect(opts).toHaveCount(5);
    const groups = page.locator(".style-group");
    await expect(groups).toHaveCount(2);
    await expect(page.locator(".style-group-label")).toHaveText(["Theme", "Overlay"]);
  });

  test("default style option is active", async ({ page }) => {
    await expect(page.locator('.style-opt[data-style="light"]')).toHaveClass(/active/);
    await expect(page.locator('.style-opt[data-style="satellite"]')).not.toHaveClass(/active/);
    await expect(page.locator('.style-opt[data-style="auto"]')).not.toHaveClass(/active/);
  });

  // ─── Menu / Preferences ────────────────────────────────────────────────────
  test("Preferences section has prayer method/madhab selects and a reduce-motion switch", async ({ page }) => {
    await expect(page.locator("#pref-prayer-method")).toBeAttached();
    await expect(page.locator("#pref-prayer-school")).toBeAttached();
    await expect(page.locator("#pref-reduce-motion-toggle")).toBeAttached();
    await expect(page.locator("#pref-reduce-motion-toggle")).toHaveAttribute("role", "switch");
    // The two Asr madhab options are static HTML (Standard / Hanafi)
    await expect(page.locator("#pref-prayer-school option")).toHaveCount(2);
  });

  test("prayer method select is populated with Aladhan methods after map load", async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll("#pref-prayer-method option").length > 1);
    const count = await page.locator("#pref-prayer-method option").count();
    expect(count).toBeGreaterThan(15);
    // Default selection matches the previous hardcoded behavior (method 3 = Muslim World League)
    await expect(page.locator("#pref-prayer-method")).toHaveValue("3");
    await expect(page.locator("#pref-prayer-school")).toHaveValue("0");
  });

  // ─── Directions Panel ──────────────────────────────────────────────────────
  test("directions panel elements exist but are hidden", async ({ page }) => {
    await expect(page.locator("#dir-panel")).toBeAttached();
    await expect(page.locator("#dir-panel")).toHaveClass(/shut/);
    await expect(page.locator("#dir-from")).toBeAttached();
    await expect(page.locator("#dir-to")).toBeAttached();
    await expect(page.locator("#dir-go")).toBeAttached();
    await expect(page.locator("#dir-mode-toggle")).toBeAttached();
  });

  test("transport mode buttons exist", async ({ page }) => {
    for (const mode of ["drive", "transit", "cycle", "walk"]) {
      await expect(page.locator(`.mode-opt[data-mode="${mode}"]`)).toBeAttached();
    }
  });

  test("drive mode is selected by default", async ({ page }) => {
    await expect(page.locator('.mode-opt[data-mode="drive"]')).toHaveClass(/active/);
  });

  test("Find Routes button starts disabled", async ({ page }) => {
    await expect(page.locator("#dir-go")).toBeDisabled();
  });

  // ─── Places Sheet ──────────────────────────────────────────────────────────
  test("places sheet elements exist but are hidden", async ({ page }) => {
    await expect(page.locator("#places-sheet")).toBeAttached();
    await expect(page.locator("#places-sheet")).toHaveClass(/shut/);
    await expect(page.locator("#places-list")).toBeAttached();
    await expect(page.locator("#places-type-chips")).toBeAttached();
  });

  test("place filter chips exist for all types", async ({ page }) => {
    for (const type of ["all", "mosque", "prayer_room", "restaurant", "shop", "saved"]) {
      await expect(page.locator(`.pf-chip[data-type="${type}"]`)).toBeAttached();
    }
  });

  test("'All' filter chip is active by default", async ({ page }) => {
    await expect(page.locator('.pf-chip[data-type="all"]')).toHaveClass(/active/);
  });

  // ─── Suggest Overlays ──────────────────────────────────────────────────────
  test("suggest place overlay exists and is hidden", async ({ page }) => {
    await expect(page.locator("#suggest-overlay")).toBeAttached();
    await expect(page.locator("#suggest-overlay")).toHaveClass(/hide/);
    await expect(page.locator("#suggest-form")).toBeAttached();
  });

  test("edit overlay exists and is hidden", async ({ page }) => {
    await expect(page.locator("#edit-overlay")).toBeAttached();
    await expect(page.locator("#edit-overlay")).toHaveClass(/hide/);
    await expect(page.locator("#edit-form")).toBeAttached();
  });

  // ─── Prayer Times ──────────────────────────────────────────────────────────
  test("prayer snack elements exist", async ({ page }) => {
    await expect(page.locator("#prayer-snack")).toBeAttached();
    await expect(page.locator("#prayer-pill")).toBeAttached();
    await expect(page.locator("#prayer-snack-title")).toBeAttached();
    await expect(page.locator("#prayer-chevron")).toBeAttached();
  });

  test("prayer snack is visible after load", async ({ page }) => {
    await expect(page.locator("#prayer-snack")).toHaveClass(/pill-expand/);
    await expect(page.locator("#prayer-snack")).not.toHaveClass(/hide/);
  });

  // ─── Route Snackbar ────────────────────────────────────────────────────────
  test("route snackbar exists and is hidden", async ({ page }) => {
    await expect(page.locator("#route-snackbar")).toBeAttached();
    await expect(page.locator("#route-snackbar")).toHaveClass(/hide/);
  });

  // ─── Scrim ─────────────────────────────────────────────────────────────────
  test("scrim overlay exists and is hidden", async ({ page }) => {
    await expect(page.locator("#scrim")).toBeAttached();
    await expect(page.locator("#scrim")).toHaveClass(/hide/);
  });

  // ─── MapLibre Scale Control ────────────────────────────────────────────────
  test("scale control is rendered", async ({ page }) => {
    await expect(page.locator(".maplibregl-ctrl-scale")).toBeVisible();
  });
});

test.describe("Suggest Form Structure", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("suggest form has all required fields", async ({ page }) => {
    await expect(page.locator("#sg-name")).toBeAttached();
    await expect(page.locator("#sg-gmaps")).toBeAttached();
    await expect(page.locator("#sg-type")).toBeAttached();
    await expect(page.locator("#sg-tags")).toBeAttached();
    await expect(page.locator("#sg-address")).toBeAttached();
    await expect(page.locator("#sg-website")).toBeAttached();
    await expect(page.locator("#sg-phone")).toBeAttached();
    await expect(page.locator("#sg-notes")).toBeAttached();
    await expect(page.locator("#sg-submit")).toBeAttached();
    await expect(page.locator("#sg-lat")).toBeAttached();
    await expect(page.locator("#sg-lng")).toBeAttached();
    await expect(page.locator("#sg-pin-badge")).toBeAttached();
  });

  test("sg-gmaps field is optional (pin or link required)", async ({ page }) => {
    const gmaps = page.locator("#sg-gmaps");
    const hasRequired = await gmaps.evaluate(el => el.hasAttribute("required"));
    expect(hasRequired).toBe(false);
  });

  test("sg-type dropdown has all place types", async ({ page }) => {
    const options = page.locator("#sg-type option");
    const texts = await options.allTextContents();
    expect(texts).toContain("Mosque");
    expect(texts).toContain("Prayer Room");
    expect(texts).toContain("Restaurant");
    expect(texts).toContain("Shop");
  });

  test("edit form has all required fields", async ({ page }) => {
    await expect(page.locator("#ed-name")).toBeAttached();
    await expect(page.locator("#ed-type")).toBeAttached();
    await expect(page.locator("#ed-tags")).toBeAttached();
    await expect(page.locator("#ed-address")).toBeAttached();
    await expect(page.locator("#ed-gmaps")).toBeAttached();
    await expect(page.locator("#ed-website")).toBeAttached();
    await expect(page.locator("#ed-phone")).toBeAttached();
    await expect(page.locator("#ed-notes")).toBeAttached();
    await expect(page.locator("#ed-submit")).toBeAttached();
  });
});

test.describe("Direction Input Structure", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("direction inputs have correct placeholders", async ({ page }) => {
    await expect(page.locator("#dir-from")).toHaveAttribute("placeholder", /Origin/);
    await expect(page.locator("#dir-to")).toHaveAttribute("placeholder", /Destination/);
  });

  test("swap button exists", async ({ page }) => {
    await expect(page.locator("#dir-swap")).toBeAttached();
  });

  test("time controls exist", async ({ page }) => {
    await expect(page.locator("#dir-time-bar")).toBeAttached();
    await expect(page.locator("#dir-time-now")).toBeAttached();
    await expect(page.locator("#datetime-trigger")).toBeAttached();
    await expect(page.locator("#dir-datetime-label")).toBeAttached();
  });

  test("depart/arrive toggle exists", async ({ page }) => {
    await expect(page.locator('.time-opt[data-mode="depart"]')).toBeAttached();
    await expect(page.locator('.time-opt[data-mode="arrive"]')).toBeAttached();
  });
});
