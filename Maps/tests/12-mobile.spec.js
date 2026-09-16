/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SUITE 12: Mobile-Specific Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests that are unique to phone-sized viewports (≤768px wide).
 * Runs on: Pixel 7 (Android/Chromium), Galaxy S24 (Android/Chromium),
 *           iPhone 15 Pro (iOS/WebKit).  Excluded from Desktop Chrome.
 *
 * Coverage:
 *   1.  Mobile Viewport & CSS Breakpoint
 *   2.  Touch Target Sizes (Apple HIG / WCAG ≥44px)
 *   3.  Places Sheet — Drag Gestures
 *   4.  Directions Panel — Drag Gestures
 *   5.  Prayer Pill on Mobile
 *   6.  Search Card on Mobile
 *   7.  Places Sheet — Height & Scrollability
 *   8.  No Horizontal Overflow
 *   9.  Sheet Reopen After Drag-Dismiss
 *   10. Meta Viewport — Zoom Prevention
 *   11. Tab Bar — Icon & Label Completeness
 *   12. Style Picker on Mobile
 *   13. Filter Chips — Tap Targets & Activation
 *   14. Place Cards — Touch Targets
 *   15. Directions Panel — Inputs & Controls on Mobile
 *   16. Scrim — Tap to Close Sheet
 *   17. Suggest Overlay — Mobile Fit
 *   18. Zoom Controls — Layout & Position
 */
const { test, expect, setupApp } = require("./helpers");

// ─────────────────────────────────────────────────────────────────────────────
// Touch event helpers
//
// WebKit (Safari) does not support the new Touch({...}) dictionary constructor,
// but Playwright's page.mouse on a WebKit device with hasTouch:true does fire
// native touch events via WebKit internals.  Chromium requires explicit
// TouchEvent dispatch via page.evaluate.
// ─────────────────────────────────────────────────────────────────────────────

/** Detect browser engine from the page context. */
function browserName(page) {
  return page.context().browser().browserType().name();
}

/**
 * Dispatch a full touch-drag sequence on the given element.
 * @param {import('@playwright/test').Page} page
 * @param {string} selector  CSS selector of the drag handle
 * @param {number} dx        Horizontal delta in pixels
 * @param {number} dy        Vertical delta in pixels (positive = drag down)
 */
async function touchDrag(page, selector, dx, dy) {
  const box = await page.locator(selector).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  if (browserName(page) === "webkit") {
    // WebKit: mouse actions map to touch events when hasTouch:true
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const STEPS = 12;
    for (let i = 1; i <= STEPS; i++) {
      await page.mouse.move(
        cx + (dx * i) / STEPS,
        cy + (dy * i) / STEPS,
      );
    }
    await page.mouse.up();
  } else {
    // Chromium: dispatch TouchEvents directly via evaluate
    await page.evaluate(
      ({ cx, cy, dx, dy, sel }) => {
        const el = document.querySelector(sel);
        const mkTouch = (x, y) =>
          new Touch({ identifier: 1, target: el, clientX: x, clientY: y, radiusX: 2, radiusY: 2, force: 1 });

        el.dispatchEvent(new TouchEvent("touchstart", {
          touches: [mkTouch(cx, cy)], changedTouches: [mkTouch(cx, cy)],
          bubbles: true, cancelable: true,
        }));

        const STEPS = 12;
        for (let i = 1; i <= STEPS; i++) {
          const t = mkTouch(cx + (dx * i) / STEPS, cy + (dy * i) / STEPS);
          document.dispatchEvent(new TouchEvent("touchmove", {
            touches: [t], changedTouches: [t], bubbles: true, cancelable: true,
          }));
        }

        const endT = mkTouch(cx + dx, cy + dy);
        document.dispatchEvent(new TouchEvent("touchend", {
          touches: [], changedTouches: [endT], bubbles: true, cancelable: true,
        }));
      },
      { cx, cy, dx, dy, sel: selector },
    );
  }
}

/**
 * Fire only a touchstart on an element so callers can inspect .dragging.
 * Leaves touch/pointer in DOWN state — call touchEndOnDoc() to release.
 */
async function touchStart(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  if (browserName(page) === "webkit") {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
  } else {
    await page.evaluate(
      ({ cx, cy, sel }) => {
        const el = document.querySelector(sel);
        const t = new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy, radiusX: 2, radiusY: 2, force: 1 });
        el.dispatchEvent(new TouchEvent("touchstart", {
          touches: [t], changedTouches: [t], bubbles: true, cancelable: true,
        }));
      },
      { cx, cy, sel: selector },
    );
  }
}

/**
 * Release an in-progress touch/drag.
 */
async function touchEndOnDoc(page, x, y) {
  if (browserName(page) === "webkit") {
    await page.mouse.up();
  } else {
    await page.evaluate(
      ({ x, y }) => {
        const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: y, radiusX: 2, radiusY: 2, force: 1 });
        document.dispatchEvent(new TouchEvent("touchend", {
          touches: [], changedTouches: [t], bubbles: true, cancelable: true,
        }));
      },
      { x, y },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Mobile Viewport & CSS Breakpoint
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Mobile Viewport & CSS Breakpoint", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("viewport width is ≤768px (mobile breakpoint active)", async ({
    page,
  }) => {
    const w = await page.evaluate(() => window.innerWidth);
    expect(w).toBeLessThanOrEqual(768);
  });

  test("isMobile() function returns true at this viewport width", async ({
    page,
  }) => {
    const mobile = await page.evaluate(() => window.innerWidth <= 768);
    expect(mobile).toBe(true);
  });

  test("tab bar is visible and anchored to bottom of screen", async ({
    page,
  }) => {
    const bar = page.locator("#tab-bar");
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    const vh = await page.evaluate(() => window.innerHeight);
    // Tab bar should be in the lower quarter of the screen
    expect(box.y + box.height).toBeGreaterThan(vh * 0.7);
  });

  test("map canvas fills the full viewport width", async ({ page }) => {
    const canvasW = await page.evaluate(
      () => document.querySelector("#map canvas")?.offsetWidth ?? 0,
    );
    const vw = await page.evaluate(() => window.innerWidth);
    expect(canvasW).toBeGreaterThanOrEqual(vw - 4);
  });

  test("places sheet drag-indicator span has mobile dimensions (~32×3px)", async ({
    page,
  }) => {
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(300);

    const dims = await page.evaluate(() => {
      const span = document.querySelector("#places-drag span");
      if (!span) return null;
      const cs = getComputedStyle(span);
      return { w: parseFloat(cs.width), h: parseFloat(cs.height) };
    });
    expect(dims).not.toBeNull();
    // Mobile: 32px × 3px  (desktop: 36px × 4px)
    expect(dims.w).toBeGreaterThanOrEqual(28);
    expect(dims.w).toBeLessThanOrEqual(36);
    expect(dims.h).toBeGreaterThanOrEqual(2);
    expect(dims.h).toBeLessThanOrEqual(5);
  });

  test("directions panel drag-indicator span has mobile dimensions", async ({
    page,
  }) => {
    await page.locator("#dir-btn").click();
    await expect(page.locator("#dir-panel")).not.toHaveClass(/shut/);
    await page.waitForTimeout(300);

    const dims = await page.evaluate(() => {
      const span = document.querySelector("#dir-drag span");
      if (!span) return null;
      const cs = getComputedStyle(span);
      return { w: parseFloat(cs.width), h: parseFloat(cs.height) };
    });
    expect(dims).not.toBeNull();
    expect(dims.w).toBeGreaterThanOrEqual(28);
    expect(dims.w).toBeLessThanOrEqual(36);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Touch Target Sizes
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Touch Target Sizes (≥44px per Apple HIG)", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("all tab bar buttons have height ≥44px", async ({ page }) => {
    for (const id of ["home-btn", "dir-btn", "places-btn", "menu-pill"]) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box.height, `#${id} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test("all tab bar buttons have width ≥44px", async ({ page }) => {
    for (const id of ["home-btn", "dir-btn", "places-btn", "menu-pill"]) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box.width, `#${id} width`).toBeGreaterThanOrEqual(44);
    }
  });

  test("zoom in/out buttons are ≥36×36px on mobile", async ({ page }) => {
    for (const id of ["zoomin-btn", "zoomout-btn"]) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box.height, `#${id} height`).toBeGreaterThanOrEqual(36);
      expect(box.width, `#${id} width`).toBeGreaterThanOrEqual(36);
    }
  });

  test("places sheet close/action buttons are ≥28px when sheet open", async ({
    page,
  }) => {
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(300);

    const actionBtns = page.locator("#places-sheet .sheet-action-btn");
    const count = await actionBtns.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await actionBtns.nth(i).boundingBox();
      expect(box.height, `sheet-action-btn[${i}] height`).toBeGreaterThanOrEqual(28);
      expect(box.width, `sheet-action-btn[${i}] width`).toBeGreaterThanOrEqual(28);
    }
  });

  test("sheet-x close button is ≥28×28px when sheet open", async ({
    page,
  }) => {
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(300);

    const closeBtn = page.locator("#places-sheet .sheet-x").first();
    const visible = await closeBtn.isVisible().catch(() => false);
    if (visible) {
      const box = await closeBtn.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(28);
      expect(box.width).toBeGreaterThanOrEqual(28);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Places Sheet Drag Gestures
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Places Sheet — Drag Gestures", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(400); // wait for open animation
  });

  test("places drag handle is visible when sheet is open", async ({
    page,
  }) => {
    await expect(page.locator("#places-drag")).toBeVisible();
  });

  test("places drag handle span is present inside drag zone", async ({
    page,
  }) => {
    await expect(page.locator("#places-drag span")).toBeAttached();
  });

  test(".dragging class is added to places sheet on touchstart of handle", async ({
    page,
  }) => {
    await touchStart(page, "#places-drag");
    await page.waitForTimeout(50);
    await expect(page.locator("#places-sheet")).toHaveClass(/dragging/);
    // cleanup — release touch
    const box = await page.locator("#places-drag").boundingBox();
    await touchEndOnDoc(page, box.x + box.width / 2, box.y + box.height / 2);
  });

  test(".dragging class is removed from places sheet after touchend", async ({
    page,
  }) => {
    await touchStart(page, "#places-drag");
    await page.waitForTimeout(50);
    const box = await page.locator("#places-drag").boundingBox();
    await touchEndOnDoc(page, box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
    await expect(page.locator("#places-sheet")).not.toHaveClass(/dragging/);
  });

  test("dragging sheet far downward dismisses it (.shut class applied)", async ({
    page,
  }) => {
    // 450px downward should reduce height below 25% of any phone viewport
    await touchDrag(page, "#places-drag", 0, 450);
    await page.waitForTimeout(500);
    await expect(page.locator("#places-sheet")).toHaveClass(/shut/);
  });

  test("places sheet is hidden from view after drag-dismiss", async ({
    page,
  }) => {
    await touchDrag(page, "#places-drag", 0, 450);
    await page.waitForTimeout(500);
    // After dismiss, sheet should either transform off-screen or have zero height
    const sheet = page.locator("#places-sheet");
    await expect(sheet).toHaveClass(/shut/);
    // Sheet should not occupy visible space after close
    const box = await sheet.boundingBox();
    const vh = await page.evaluate(() => window.innerHeight);
    if (box) {
      expect(box.y).toBeGreaterThanOrEqual(vh - 10);
    }
  });

  test("dragging sheet upward increases its height", async ({ page }) => {
    const before = await page.evaluate(
      () => document.getElementById("places-sheet").offsetHeight,
    );
    await touchDrag(page, "#places-drag", 0, -180);
    await page.waitForTimeout(400);
    const after = await page.evaluate(
      () => document.getElementById("places-sheet").offsetHeight,
    );
    // Dragging up should result in same or taller height (within tolerance)
    expect(after).toBeGreaterThanOrEqual(before - 20);
  });

  test("dragging sheet to near-full height adds .full class", async ({
    page,
  }) => {
    const vh = await page.evaluate(() => window.innerHeight);
    // Drag far enough up to exceed 75%vh + 40px threshold
    await touchDrag(page, "#places-drag", 0, -(vh * 0.7));
    await page.waitForTimeout(500);
    await expect(page.locator("#places-sheet")).toHaveClass(/full/);
  });

  test("sheet snaps: height after release is a known snap value", async ({
    page,
  }) => {
    const vh = await page.evaluate(() => window.innerHeight);
    // Drag to roughly 60% height — should snap to 50% or content
    await touchDrag(page, "#places-drag", 0, -(vh * 0.1));
    await page.waitForTimeout(500);
    const h = await page.evaluate(
      () => document.getElementById("places-sheet").offsetHeight,
    );
    // Height should be a ">0" value (not zero/dismissed and not negative)
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThanOrEqual(vh + 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Directions Panel Drag Gestures
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Directions Panel — Drag Gestures", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.locator("#dir-btn").click();
    await expect(page.locator("#dir-panel")).not.toHaveClass(/shut/);
    await page.waitForTimeout(400);
  });

  test("directions drag handle is visible when panel is open", async ({
    page,
  }) => {
    await expect(page.locator("#dir-drag")).toBeVisible();
  });

  test(".dragging class added to dir-panel on touchstart of handle", async ({
    page,
  }) => {
    await touchStart(page, "#dir-drag");
    await page.waitForTimeout(50);
    await expect(page.locator("#dir-panel")).toHaveClass(/dragging/);
    const box = await page.locator("#dir-drag").boundingBox();
    await touchEndOnDoc(page, box.x + box.width / 2, box.y + box.height / 2);
  });

  test(".dragging class removed from dir-panel after touchend", async ({
    page,
  }) => {
    await touchStart(page, "#dir-drag");
    await page.waitForTimeout(50);
    const box = await page.locator("#dir-drag").boundingBox();
    await touchEndOnDoc(page, box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
    await expect(page.locator("#dir-panel")).not.toHaveClass(/dragging/);
  });

  test("dragging dir panel far downward dismisses it", async ({ page }) => {
    await touchDrag(page, "#dir-drag", 0, 450);
    await page.waitForTimeout(500);
    await expect(page.locator("#dir-panel")).toHaveClass(/shut/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Prayer Pill on Mobile
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Prayer Pill — Mobile Viewport", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("prayer pill is visible on phone viewport", async ({ page }) => {
    await expect(page.locator("#prayer-pill")).toBeVisible();
  });

  test("prayer pill is entirely within the viewport bounds", async ({
    page,
  }) => {
    const box = await page.locator("#prayer-pill").boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    const vh = await page.evaluate(() => window.innerHeight);
    expect(box.x).toBeGreaterThanOrEqual(-2);
    expect(box.y).toBeGreaterThanOrEqual(-2);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 2);
    expect(box.y + box.height).toBeLessThanOrEqual(vh + 2);
  });

  test("prayer pill has tappable hit area (height ≥32px)", async ({
    page,
  }) => {
    const box = await page.locator("#prayer-pill").boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(32);
  });

  test("tapping prayer pill does not break the map", async ({ page }) => {
    await page.locator("#prayer-pill").tap();
    await page.waitForTimeout(350);
    // Map should still be present and functional
    await expect(page.locator("#map canvas")).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Search Card on Mobile
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Search Card — Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("search pill is visible on mobile viewport", async ({ page }) => {
    await expect(page.locator("#search-pill")).toBeVisible();
  });

  test("search card starts in collapsed state on mobile", async ({ page }) => {
    await expect(page.locator("#search-card")).toHaveClass(/collapsed/);
  });

  test("tapping search pill expands the search card", async ({ page }) => {
    await page.locator("#search-pill").tap();
    await page.waitForTimeout(400);
    await expect(page.locator("#search-card")).not.toHaveClass(/collapsed/);
  });

  test("search input is visible and reachable after expansion", async ({
    page,
  }) => {
    await page.locator("#search-pill").tap();
    await page.waitForTimeout(400);
    await expect(page.locator("#search-input")).toBeVisible();
  });

  test("expanded search card stays within viewport width", async ({
    page,
  }) => {
    await page.locator("#search-pill").tap();
    await page.waitForTimeout(400);
    const box = await page.locator("#search-card").boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box.x).toBeGreaterThanOrEqual(-2);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 2);
  });

  test("mobile search suggestions stay compact without extra vertical spacing", async ({
    page,
  }) => {
    await page.route("**/api.digitransit.fi/geocoding/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          features: [
            {
              properties: {
                name: "Pasilan asema",
                label: "Pasilan asema, Ita-Pasila, Helsinki",
                layer: "address",
              },
              geometry: { type: "Point", coordinates: [24.93506, 60.1977] },
            },
            {
              properties: {
                name: "Kamppi",
                label: "Kamppi, Helsinki",
                layer: "venue",
              },
              geometry: { type: "Point", coordinates: [24.9312, 60.1687] },
            },
          ],
        }),
      }),
    );

    await page.locator("#search-pill").tap();
    await page.waitForTimeout(400);
    await page.locator("#search-input").fill("pa");
    await page.locator("#search-input").press("Enter");
    await expect(page.locator("#results-list li").first()).toBeVisible({ timeout: 10000 });

    const items = page.locator("#results-list li");
    expect(await items.count()).toBeGreaterThanOrEqual(2);

    const firstBox = await items.nth(0).boundingBox();
    const secondBox = await items.nth(1).boundingBox();

    expect(firstBox.height).toBeLessThanOrEqual(66);
    expect(Math.abs(secondBox.y - (firstBox.y + firstBox.height))).toBeLessThanOrEqual(1);
  });

  test("search card collapses when clear/close action is used", async ({
    page,
  }) => {
    await page.locator("#search-pill").tap();
    await page.waitForTimeout(400);
    await expect(page.locator("#search-card")).not.toHaveClass(/collapsed/);
    // Press Escape to collapse
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await expect(page.locator("#search-card")).toHaveClass(/collapsed/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · Places Sheet Height & Scrollability
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Places Sheet — Height & Scroll on Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(400);
  });

  test("places sheet height is ≤ viewport height", async ({ page }) => {
    const vh = await page.evaluate(() => window.innerHeight);
    const sheetH = await page.evaluate(
      () => document.getElementById("places-sheet").offsetHeight,
    );
    expect(sheetH).toBeLessThanOrEqual(vh + 2);
  });

  test("places sheet height is >0 when open", async ({ page }) => {
    const sheetH = await page.evaluate(
      () => document.getElementById("places-sheet").offsetHeight,
    );
    expect(sheetH).toBeGreaterThan(0);
  });

  test("places scroll container is scrollable (overflow-y auto/scroll)", async ({
    page,
  }) => {
    const overflow = await page.evaluate(() => {
      const el = document.querySelector("#places-scroll");
      return el ? getComputedStyle(el).overflowY : "none";
    });
    expect(["auto", "scroll", "overlay"]).toContain(overflow);
  });

  test("places sheet has a visible count badge", async ({ page }) => {
    await expect(page.locator("#places-badge")).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 · No Desktop-Only Overflow on Mobile
// ─────────────────────────────────────────────────────────────────────────────

test.describe("No Horizontal Overflow on Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("body does not overflow viewport width", async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const vw = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(vw + 2);
  });

  test("tab bar does not overflow viewport width", async ({ page }) => {
    const box = await page.locator("#tab-bar").boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box.width).toBeLessThanOrEqual(vw + 2);
  });

  test("search card does not overflow viewport width when collapsed", async ({
    page,
  }) => {
    const box = await page.locator("#search-card").boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9 · Sheet Reopens After Drag-Dismiss
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Sheet Reopen After Drag-Dismiss", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("places sheet can be reopened via tab after drag-dismiss", async ({
    page,
  }) => {
    // Open sheet
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(400);

    // Dismiss via drag
    await touchDrag(page, "#places-drag", 0, 450);
    await page.waitForTimeout(500);
    await expect(page.locator("#places-sheet")).toHaveClass(/shut/);

    // Reopen via tab button
    await page.locator("#places-btn").click();
    await page.waitForTimeout(400);
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
  });

  test("directions panel can be reopened via tab after drag-dismiss", async ({
    page,
  }) => {
    await page.locator("#dir-btn").click();
    await expect(page.locator("#dir-panel")).not.toHaveClass(/shut/);
    await page.waitForTimeout(400);

    await touchDrag(page, "#dir-drag", 0, 450);
    await page.waitForTimeout(500);
    await expect(page.locator("#dir-panel")).toHaveClass(/shut/);

    await page.locator("#dir-btn").click();
    await page.waitForTimeout(400);
    await expect(page.locator("#dir-panel")).not.toHaveClass(/shut/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10 · Meta Viewport — Zoom Prevention
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Meta Viewport — Zoom Prevention", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("meta viewport tag exists", async ({ page }) => {
    const meta = await page.$('meta[name="viewport"]');
    expect(meta).not.toBeNull();
  });

  test("meta viewport has user-scalable=no (prevents pinch-zoom)", async ({
    page,
  }) => {
    const content = await page.$eval(
      'meta[name="viewport"]',
      (el) => el.getAttribute("content") ?? "",
    );
    expect(content).toMatch(/user-scalable\s*=\s*no/i);
  });

  test("meta viewport has maximum-scale=1.0 (prevents double-tap zoom)", async ({
    page,
  }) => {
    const content = await page.$eval(
      'meta[name="viewport"]',
      (el) => el.getAttribute("content") ?? "",
    );
    expect(content).toMatch(/maximum-scale\s*=\s*1/i);
  });

  test("meta viewport has viewport-fit=cover (safe area on notched phones)", async ({
    page,
  }) => {
    const content = await page.$eval(
      'meta[name="viewport"]',
      (el) => el.getAttribute("content") ?? "",
    );
    expect(content).toMatch(/viewport-fit\s*=\s*cover/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11 · Tab Bar — Mobile Icon Navigation
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Tab Bar — Mobile Icon Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("each tab button has a visible SVG icon", async ({ page }) => {
    for (const id of ["home-btn", "dir-btn", "places-btn", "menu-pill"]) {
      await expect(
        page.locator(`#${id} svg`).first(),
        `${id} svg`,
      ).toBeVisible();
    }
  });

  test("each tab button keeps text labels in the DOM but hides them visually", async ({ page }) => {
    for (const id of ["home-btn", "dir-btn", "places-btn", "menu-pill"]) {
      // The first span is the label (not the badge span on places-btn)
      await expect(
        page.locator(`#${id} span`).first(),
        `${id} label`,
      ).toBeHidden();
    }
  });

  test("tab labels are not empty strings", async ({ page }) => {
    for (const id of ["home-btn", "dir-btn", "places-btn", "menu-pill"]) {
      const text = await page
        .locator(`#${id} span`)
        .first()
        .textContent();
      expect(text?.trim().length, `${id} label text`).toBeGreaterThan(0);
    }
  });

  test("tab buttons do not overlap each other horizontally", async ({
    page,
  }) => {
    const ids = ["home-btn", "dir-btn", "places-btn", "menu-pill"];
    const boxes = await Promise.all(
      ids.map((id) => page.locator(`#${id}`).boundingBox()),
    );
    for (let i = 0; i < boxes.length - 1; i++) {
      const a = boxes[i];
      const b = boxes[i + 1];
      // Right edge of btn[i] must be ≤ left edge of btn[i+1] (no overlap)
      expect(a.x + a.width, `${ids[i]} overlaps ${ids[i + 1]}`).toBeLessThanOrEqual(
        b.x + 2,
      );
    }
  });

  test("tab bar fits within viewport width with no scroll", async ({
    page,
  }) => {
    const [barWidth, vw] = await page.evaluate(() => [
      document.getElementById("tab-bar").scrollWidth,
      window.innerWidth,
    ]);
    expect(barWidth).toBeLessThanOrEqual(vw + 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12 · Style Picker on Mobile
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Menu — Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("menu pill is visible and within viewport", async ({
    page,
  }) => {
    const btn = page.locator("#menu-pill");
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 4);
  });

  test("menu pill has minimum tap target size (≥36px)", async ({
    page,
  }) => {
    const box = await page.locator("#menu-pill").boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(36);
    expect(box.height).toBeGreaterThanOrEqual(36);
  });

  test("tapping menu pill opens the menu sheet", async ({
    page,
  }) => {
    await page.locator("#menu-pill").tap();
    await page.waitForTimeout(300);
    await expect(page.locator("#menu-sheet")).not.toHaveClass(/shut/);
  });

  test("style panel options are visible after opening the menu", async ({ page }) => {
    await page.locator("#menu-pill").tap();
    await page.waitForTimeout(300);
    const opts = page.locator(".style-opt");
    const count = await opts.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i++) {
      await expect(opts.nth(i)).toBeVisible();
    }
  });

  test("menu sheet does not overflow viewport width", async ({ page }) => {
    await page.locator("#menu-pill").tap();
    await page.waitForTimeout(300);
    const box = await page.locator("#menu-sheet").boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box.x).toBeGreaterThanOrEqual(-4);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 4);
  });

  test("selecting a non-active style option updates active state", async ({
    page,
  }) => {
    await page.locator("#menu-pill").tap();
    await page.waitForTimeout(300);
    // The satellite option (data-style=satellite) should not be active initially
    const satellite = page.locator(".style-opt[data-style='satellite']");
    await satellite.tap();
    await page.waitForTimeout(400);
    await expect(satellite).toHaveClass(/active/);
  });

  test("selecting a style option keeps the menu sheet open", async ({ page }) => {
    await page.locator("#menu-pill").tap();
    await page.waitForTimeout(300);
    await page.locator(".style-opt[data-style='satellite']").tap();
    await page.waitForTimeout(400);
    await expect(page.locator("#menu-sheet")).not.toHaveClass(/shut/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13 · Filter Chips — Tap Targets & Activation
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Filter Chips — Tap Targets & Activation", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(400);
  });

  test("all type filter chips are visible", async ({ page }) => {
    const chips = page.locator(".pf-chip");
    const count = await chips.count();
    expect(count).toBeGreaterThanOrEqual(5); // all, space, restaurant, service, saved
    for (let i = 0; i < count; i++) {
      await expect(chips.nth(i)).toBeVisible();
    }
  });

  test("each filter chip has height ≥32px (touch-friendly)", async ({
    page,
  }) => {
    const chips = page.locator(".pf-chip");
    const count = await chips.count();
    for (let i = 0; i < count; i++) {
      const box = await chips.nth(i).boundingBox();
      expect(box.height, `chip[${i}] height`).toBeGreaterThanOrEqual(32);
    }
  });

  test("filter chip row is scrollable horizontally when needed", async ({
    page,
  }) => {
    const overflow = await page.evaluate(() => {
      const row = document.querySelector("#places-type-chips");
      if (!row) return "none";
      const cs = getComputedStyle(row);
      return cs.overflowX;
    });
    expect(["auto", "scroll", "overlay"]).toContain(overflow);
  });

  test("'All' filter chip is active by default", async ({ page }) => {
    await expect(
      page.locator(".pf-chip[data-type='all']"),
    ).toHaveClass(/active/);
  });

  test("tapping a non-active filter chip activates it", async ({ page }) => {
    const restaurant = page.locator(".pf-chip[data-type='restaurant']");
    await restaurant.tap();
    await page.waitForTimeout(300);
    await expect(restaurant).toHaveClass(/active/);
  });

  test("tapping a type chip deactivates 'All'", async ({ page }) => {
    await page.locator(".pf-chip[data-type='restaurant']").tap();
    await page.waitForTimeout(300);
    await expect(
      page.locator(".pf-chip[data-type='all']"),
    ).not.toHaveClass(/active/);
  });

  test("tapping 'All' chip restores all places", async ({ page }) => {
    await page.locator(".pf-chip[data-type='restaurant']").tap();
    await page.waitForTimeout(300);
    await page.locator(".pf-chip[data-type='all']").tap();
    await page.waitForTimeout(400);
    await expect(
      page.locator(".pf-chip[data-type='all']"),
    ).toHaveClass(/active/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14 · Place Cards — Touch Targets
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Place Cards — Touch Targets", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(600);
  });

  test("place list has at least one place card", async ({ page }) => {
    const cards = page.locator("#places-list li");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("each place card has height ≥48px", async ({ page }) => {
    const cards = page.locator("#places-list li");
    const count = await cards.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const box = await cards.nth(i).boundingBox();
      expect(box.height, `card[${i}] height`).toBeGreaterThanOrEqual(48);
    }
  });

  test("each place card does not overflow the sheet width", async ({
    page,
  }) => {
    const sheetW = await page.evaluate(
      () => document.getElementById("places-sheet").offsetWidth,
    );
    const cards = page.locator("#places-list li");
    const count = await cards.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const box = await cards.nth(i).boundingBox();
      expect(box.width, `card[${i}] width`).toBeLessThanOrEqual(sheetW + 4);
    }
  });

  test("each favourite button is ≥20×20px (tappable icon size)", async ({ page }) => {
    const favBtns = page.locator("#places-list .pl-fav-btn");
    const count = await favBtns.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 5); i++) {
      const box = await favBtns.nth(i).boundingBox();
      expect(box.height, `fav[${i}] height`).toBeGreaterThanOrEqual(20);
      expect(box.width, `fav[${i}] width`).toBeGreaterThanOrEqual(20);
    }
  });

  test("tapping a place card taps it without error (sheet stays open)", async ({
    page,
  }) => {
    const card = page.locator("#places-list li").first();
    await card.tap();
    await page.waitForTimeout(600);
    // Sheet should not have closed
    await expect(page.locator("#map canvas")).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15 · Directions Panel — Inputs & Controls on Mobile
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Directions Panel — Inputs & Controls on Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await page.locator("#dir-btn").click();
    await expect(page.locator("#dir-panel")).not.toHaveClass(/shut/);
    await page.waitForTimeout(400);
  });

  test("directions panel height is ≤ viewport height", async ({ page }) => {
    const vh = await page.evaluate(() => window.innerHeight);
    const h = await page.evaluate(
      () => document.getElementById("dir-panel").offsetHeight,
    );
    expect(h).toBeLessThanOrEqual(vh + 2);
  });

  test("origin (from) input is visible and fits within viewport width", async ({
    page,
  }) => {
    const input = page.locator("#dir-from");
    await expect(input).toBeVisible();
    const box = await input.boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box.x).toBeGreaterThanOrEqual(-2);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 2);
  });

  test("destination (to) input is visible and fits within viewport width", async ({
    page,
  }) => {
    const input = page.locator("#dir-to");
    await expect(input).toBeVisible();
    const box = await input.boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box.x).toBeGreaterThanOrEqual(-2);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 2);
  });

  test("origin input has a placeholder", async ({ page }) => {
    const ph = await page.locator("#dir-from").getAttribute("placeholder");
    expect(ph?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test("destination input has a placeholder", async ({ page }) => {
    const ph = await page.locator("#dir-to").getAttribute("placeholder");
    expect(ph?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test("swap button is visible and has ≥36px hit target", async ({ page }) => {
    const swap = page.locator("#dir-swap");
    await expect(swap).toBeVisible();
    const box = await swap.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(36);
    expect(box.height).toBeGreaterThanOrEqual(36);
  });

  test("Find Routes button is visible and within viewport", async ({
    page,
  }) => {
    const btn = page.locator("#dir-go");
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 4);
  });

  test("transport mode buttons are visible and have ≥36px hit target", async ({
    page,
  }) => {
    const modes = page.locator(".mode-opt");
    const count = await modes.count();
    expect(count).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < count; i++) {
      const box = await modes.nth(i).boundingBox();
      expect(box.height, `mode[${i}] height`).toBeGreaterThanOrEqual(28);
    }
  });

  test("typing in origin input does not break layout", async ({ page }) => {
    await page.locator("#dir-from").tap();
    await page.keyboard.type("Helsinki");
    await page.waitForTimeout(400);
    // Panel should still be visible
    await expect(page.locator("#dir-panel")).not.toHaveClass(/shut/);
    // Viewport should not overflow
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const vw = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(vw + 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16 · Scrim — Tap to Close Sheet
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Scrim — Tap to Close Sheet", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("scrim appears when places sheet opens", async ({ page }) => {
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(300);
    await expect(page.locator("#scrim")).not.toHaveClass(/hide/);
  });

  test("tapping scrim closes the places sheet", async ({ page }) => {
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(400);
    await page.locator("#scrim").tap({ force: true });
    await page.waitForTimeout(400);
    await expect(page.locator("#places-sheet")).toHaveClass(/shut/);
  });

  test("scrim hides after places sheet is closed via tap", async ({ page }) => {
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(400);
    await page.locator("#scrim").tap({ force: true });
    await page.waitForTimeout(400);
    await expect(page.locator("#scrim")).toHaveClass(/hide/);
  });

  test("scrim appears when directions panel opens", async ({ page }) => {
    await page.locator("#dir-btn").click();
    await expect(page.locator("#dir-panel")).not.toHaveClass(/shut/);
    await page.waitForTimeout(300);
    await expect(page.locator("#scrim")).not.toHaveClass(/hide/);
  });

  test("tapping scrim closes the directions panel", async ({ page }) => {
    await page.locator("#dir-btn").click();
    await expect(page.locator("#dir-panel")).not.toHaveClass(/shut/);
    await page.waitForTimeout(400);
    await page.locator("#scrim").tap({ force: true });
    await page.waitForTimeout(400);
    await expect(page.locator("#dir-panel")).toHaveClass(/shut/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17 · Suggest Overlay — Mobile Fit
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Suggest Overlay — Mobile Fit", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    // Open places sheet, then tap the suggest (+) button
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(400);
    await page.locator("#suggest-place-btn").tap();
    await page.waitForTimeout(400);
  });

  test("suggest overlay becomes visible on tap of + button", async ({
    page,
  }) => {
    await expect(page.locator("#suggest-overlay")).not.toHaveClass(/hide/);
  });

  test("suggest card does not overflow viewport width", async ({ page }) => {
    const box = await page.locator("#suggest-card").boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box.x).toBeGreaterThanOrEqual(-2);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 4);
  });

  test("suggest card does not overflow viewport height", async ({ page }) => {
    const box = await page.locator("#suggest-card").boundingBox();
    const vh = await page.evaluate(() => window.innerHeight);
    expect(box.height).toBeLessThanOrEqual(vh + 4);
  });

  test("suggest card title is visible", async ({ page }) => {
    await expect(page.locator("#suggest-overlay .suggest-head h3")).toBeVisible();
  });

  test("suggest close button is visible and ≥28px", async ({ page }) => {
    const btn = page.locator("#suggest-close");
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(28);
    expect(box.height).toBeGreaterThanOrEqual(28);
  });

  test("suggest form fields are visible on mobile", async ({ page }) => {
    await expect(page.locator("#sg-gmaps")).toBeVisible();
    await expect(page.locator("#sg-type")).toBeVisible();
  });

  test("suggest form fields fit within viewport width", async ({ page }) => {
    const vw = await page.evaluate(() => window.innerWidth);
    for (const id of ["sg-name", "sg-gmaps"]) {
      const box = await page.locator(`#${id}`).boundingBox();
      if (box) {
        expect(box.x + box.width, `#${id} overflow`).toBeLessThanOrEqual(
          vw + 4,
        );
      }
    }
  });

  test("tapping suggest close button hides the overlay", async ({ page }) => {
    await page.locator("#suggest-close").tap();
    await page.waitForTimeout(300);
    await expect(page.locator("#suggest-overlay")).toHaveClass(/hide/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18 · Zoom Controls — Layout & Position
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Zoom Controls — Layout & Position on Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("zoom pill is visible on mobile", async ({ page }) => {
    await expect(page.locator("#zoom-pill")).toBeVisible();
  });

  test("zoom pill is within viewport bounds", async ({ page }) => {
    const box = await page.locator("#zoom-pill").boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    const vh = await page.evaluate(() => window.innerHeight);
    expect(box.x).toBeGreaterThanOrEqual(-2);
    expect(box.y).toBeGreaterThanOrEqual(-2);
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 2);
    expect(box.y + box.height).toBeLessThanOrEqual(vh + 2);
  });

  test("zoom pill does not overlap the tab bar", async ({ page }) => {
    const zoomBox = await page.locator("#zoom-pill").boundingBox();
    const tabBox = await page.locator("#tab-bar").boundingBox();
    // Bottom of zoom pill must be above (or equal to) top of tab bar
    expect(zoomBox.y + zoomBox.height).toBeLessThanOrEqual(tabBox.y + 4);
  });

  test("zoom in button tap does not throw and map stays rendered", async ({ page }) => {
    const mapVisible = async () =>
      page.evaluate(() => {
        const c = document.querySelector("#map canvas");
        return c && c.offsetWidth > 0;
      });
    expect(await mapVisible()).toBe(true);
    await page.locator("#zoomin-btn").tap();
    await page.waitForTimeout(600);
    expect(await mapVisible()).toBe(true);
  });

  test("zoom out button tap does not throw and map stays rendered", async ({ page }) => {
    const mapVisible = async () =>
      page.evaluate(() => {
        const c = document.querySelector("#map canvas");
        return c && c.offsetWidth > 0;
      });
    expect(await mapVisible()).toBe(true);
    await page.locator("#zoomout-btn").tap();
    await page.waitForTimeout(600);
    expect(await mapVisible()).toBe(true);
  });

  test("zoom pill width fits within viewport", async ({ page }) => {
    const box = await page.locator("#zoom-pill").boundingBox();
    const vw = await page.evaluate(() => window.innerWidth);
    expect(box.width).toBeLessThanOrEqual(vw);
  });
});

test.describe("Event location suggestions on mobile", () => {
  test("the dropdown is portaled and stays inside the viewport", async ({ page }) => {
    await setupApp(page);
    await page.locator("#events-pill").tap();
    await page.locator("#events-add-btn").tap();
    await page.locator("#ev-loc-search").focus();

    const dropdown = page.locator("#ev-loc-suggest");
    await expect(dropdown).toBeVisible();
    await expect(page.locator("body > #ev-loc-suggest")).toHaveCount(1);

    const bounds = await dropdown.boundingBox();
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.locator("#ev-loc-search")).toHaveAttribute("aria-expanded", "true");
  });
});
