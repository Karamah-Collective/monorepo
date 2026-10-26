const { test, expect, setupApp } = require("./helpers");

async function openPlaces(page) {
  await page.locator("#places-btn").click();
  await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
  await page.waitForTimeout(500);
}

/**
 * Return from the place-detail window to the Places page via its back button.
 * Selecting a place row keeps the Places page in history while the detail
 * window sits above it, so the close action restores the page surface.
 */
async function backToPlaces(page) {
  await page.locator("#place-sheet-close").click();
  await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
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
        await backToPlaces(page);
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
        await page.locator("#place-sheet-close").click();
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

  test("mobile repeated place selection keeps the page surface and map stable", async ({ page, browserName }) => {
    test.skip(browserName === "chromium" && (await page.evaluate(() => window.innerWidth)) > 768, "mobile-only assertion");
    await openPlaces(page);
    await clickDistinctPlaces(page, 6);

    const state = await page.evaluate(() => {
      const sheet = document.querySelector("#places-sheet");
      const detail = document.querySelector("#place-sheet");
      const app = document.querySelector("#app");
      const map = document.querySelector("#map");
      const canvas = document.querySelector("#map canvas");
      const rect = sheet.getBoundingClientRect();
      return {
        shut: sheet.classList.contains("shut"),
        detailOpen: !detail.classList.contains("shut"),
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
    expect(state.detailOpen).toBe(true);
    expect(state.visibility).toBe("hidden");
    expect(state.top).toBe(0);
    expect(state.appW).toBeGreaterThanOrEqual(state.vw - 4);
    expect(state.mapW).toBeGreaterThanOrEqual(state.vw - 4);
    expect(state.canvasW).toBeGreaterThanOrEqual(state.vw - 8);
    expect(state.appH).toBeGreaterThanOrEqual(state.vh - 4);
    expect(state.mapH).toBeGreaterThanOrEqual(state.vh - 4);
    expect(state.canvasH).toBeGreaterThanOrEqual(state.vh - 8);
    expect(state.bufferW).toBeGreaterThanOrEqual(Math.round((state.vw - 8) * state.dpr));
    expect(state.bufferH).toBeGreaterThanOrEqual(Math.round((state.vh - 8) * state.dpr));
  });

  test("place detail sheet opens with content", async ({ page }) => {
    await openPlaces(page);

    await page.locator("#places-list li[data-place-id]").first().click();
    await expect(page.locator("#place-sheet")).not.toHaveClass(/shut/);
    await page.waitForTimeout(500);

    const sheet = await page.evaluate(() => {
      const el = document.querySelector("#place-sheet");
      const inner = document.querySelector("#place-sheet-body .pp-inner");
      const title = document.querySelector("#place-sheet-title");
      const toolbar = document.querySelector("#place-sheet-toolbar");
      return {
        hidden: el ? el.hidden : true,
        hasInner: !!inner,
        hasTitle: !!(title && title.textContent.trim()),
        titleInBody: !!title?.closest("#place-sheet-body"),
        titleRowHasActions: !!title?.closest(".pp-title-row")?.querySelector(".pp-title-actions"),
        toolbarHasType: !!toolbar?.querySelector(".pp-badge"),
        toolbarHasActions: !!toolbar?.querySelector(".pp-icon-row .pp-visit-chip, .pp-icon-row .pp-fav-btn"),
        closeInHeader: !!document.querySelector("#place-sheet .sheet-head #place-sheet-close"),
      };
    });

    expect(sheet.hidden).toBe(false);
    expect(sheet.hasInner).toBe(true);
    expect(sheet.hasTitle).toBe(true);
    expect(sheet.titleInBody).toBe(true);
    expect(sheet.titleRowHasActions).toBe(true);
    expect(sheet.toolbarHasType).toBe(true);
    expect(sheet.toolbarHasActions).toBe(true);
    expect(sheet.closeInHeader).toBe(true);
  });

  test("long place names wrap beside the timeline action", async ({ page }) => {
    await page.evaluate(async () => {
      const { openPlaceSheet } = await import("/src/places.js");
      openPlaceSheet({
        id: "long-title-test",
        name: "A deliberately long place name that should wrap onto a second line",
        type: "restaurant",
        address: "Testikatu 1, Helsinki",
        lat: 60.1699,
        lng: 24.9384,
        tags: {},
        hasImages: false,
      });
    });
    await expect(page.locator("#place-sheet-title")).toBeVisible();
    const title = await page.locator("#place-sheet-title").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        whiteSpace: styles.whiteSpace,
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight,
        height: element.getBoundingClientRect().height,
        lineHeight: parseFloat(styles.lineHeight),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        wrapped: element.closest(".pp-title-row")?.classList.contains("pp-title-row--wrapped"),
        actionAlignSelf: getComputedStyle(element.closest(".pp-title-row")?.querySelector(".pp-title-actions")).alignSelf,
      };
    });

    expect(title.whiteSpace).toBe("normal");
    expect(parseFloat(title.fontSize)).toBeLessThan(20);
    expect(title.fontWeight).toBe("500");
    expect(title.height).toBeGreaterThan(title.lineHeight);
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth + 1);
    expect(title.wrapped).toBe(true);
    expect(title.actionAlignSelf).toBe("flex-start");

    await page.evaluate(async () => {
      const { openPlaceSheet } = await import("/src/places.js");
      openPlaceSheet({
        id: "short-title-test",
        name: "Short place",
        type: "restaurant",
        address: "Testikatu 1, Helsinki",
        lat: 60.1699,
        lng: 24.9384,
        tags: {},
        hasImages: false,
      });
    });
    await expect(page.locator("#place-sheet-title")).toHaveText("Short place");
    const shortTitle = await page.locator("#place-sheet-title").evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
      actionAlignSelf: getComputedStyle(element.closest(".pp-title-row")?.querySelector(".pp-title-actions")).alignSelf,
    }));
    expect(shortTitle.height).toBeLessThanOrEqual(shortTitle.lineHeight + 1);
    expect(shortTitle.actionAlignSelf).toBe("center");
    await expect(page.locator("#place-sheet-body .pp-title-actions")).toBeAttached();
  });

  test("ordinary location updates do not rebuild map place markers", async ({ page }) => {
    if (await page.evaluate(() => window.innerWidth > 768)) return;

    await page.locator("#dir-btn").click();
    await page.waitForSelector(".place-mk-wrap");
    await page.evaluate(() => document.querySelector(".place-mk-wrap")?.setAttribute("data-test-marker", "keep"));

    await page.evaluate(async () => {
      const { setCurrentLocationState } = await import("/src/utils.js");
      setCurrentLocationState({ lat: 60.1699, lng: 24.9384, accuracy: 10 });
    });
    await page.waitForTimeout(100);

    await expect(page.locator('.place-mk-wrap[data-test-marker="keep"]')).toHaveCount(1);
  });

  test("nearby GPS fixes do not rebuild map place markers until movement is material", async ({ page }) => {
    if (await page.evaluate(() => window.innerWidth > 768)) return;

    await page.locator("#dir-btn").click();
    await page.evaluate(async () => {
      const { setCurrentLocationState } = await import("/src/utils.js");
      setCurrentLocationState({ lat: 60.1699, lng: 24.9384, accuracy: 10, source: "sim" });
    });
    const nearby = page.locator("#map-filter-chips [data-map-nearby]");
    await expect(nearby).not.toHaveClass(/is-hidden/);
    await nearby.click();
    await page.waitForSelector(".place-mk-wrap");
    await page.evaluate(() => document.querySelector(".place-mk-wrap")?.setAttribute("data-test-marker", "keep"));

    await page.evaluate(async () => {
      const { setCurrentLocationState } = await import("/src/utils.js");
      for (let i = 0; i < 5; i++) {
        setCurrentLocationState({ lat: 60.1699 + (i % 2) * 0.0002, lng: 24.9384, accuracy: 10, source: "sim" });
      }
      window.dispatchEvent(new CustomEvent("hf:saved-synced"));
    });
    await page.waitForTimeout(150);

    await expect(page.locator('.place-mk-wrap[data-test-marker="keep"]')).toHaveCount(1);
  });

  test("rating summary scrolls to reviews inside the place sheet", async ({ page }) => {
    await page.evaluate(async () => {
      const { hydrateReviews } = await import("/src/reviews.js");
      const { openPlaceSheet } = await import("/src/places.js");
      hydrateReviews({
        "inline-review-test": {
          avg: 5,
          count: 1,
          items: [{ id: "review-1", rating: 5, text: "This review stays in the place sheet.", timestamp: new Date().toISOString(), source: "google" }],
        },
      });
      openPlaceSheet({
        id: "inline-review-test", name: "Inline review test", type: "restaurant",
        address: "Testikatu 1, Helsinki", lat: 60.1699, lng: 24.9384, tags: {}, hasImages: false,
      });
    });

    if (await page.evaluate(() => window.innerWidth > 768)) {
      await page.locator("#place-sheet-body .pp-rating").click();
      await expect(page.locator("#reviews-overlay")).not.toHaveClass(/hide/);
      await expect(page.locator("#reviews-overlay .rv-review-text")).toHaveText("This review stays in the place sheet.");
      return;
    }

    const summary = page.locator("#place-sheet-body .pp-reviews-detail .rv-summary");
    await expect(summary.locator(".rv-summary-overview")).toBeVisible();
    await expect(summary.locator(".rv-summary-facts .rv-avg-stars")).toBeVisible();
    await expect(summary.locator(".rv-review-count")).toHaveText("1");
    await expect(summary.locator(".rv-review-count")).toHaveClass(/pp-media-count/);
    await expect(summary.locator(".rv-dist-segment-bar")).toHaveAttribute("aria-label", "Rating distribution");
    await expect(summary.locator(".rv-dist-segment--5")).toHaveAttribute("title", "1 5-star rating");
    await expect(summary.locator(".rv-dist-legend-item")).toHaveCount(5);

    const review = page.locator("#place-sheet-body .pp-reviews-detail .rv-review-text");
    await expect(review).toHaveText("This review stays in the place sheet.");
    await page.locator("#place-sheet-body .pp-rating").click();
    await expect(page.locator("#reviews-overlay")).toHaveClass(/hide/);
    await expect(page.locator("#place-sheet-body .pp-reviews-detail")).toBeInViewport();
  });

  test("actions use timeline pills and signed-out review returns to the same place after Profile login", async ({ page }) => {
    const place = await page.evaluate(async () => {
      const mod = await import("/src/places.js");
      const place = mod.placesData[0];
      mod.openPlaceSheet(place);
      return { id: String(place.id), name: place.name };
    });

    if (await page.evaluate(() => window.innerWidth > 768)) {
      await expect(page.locator("#place-sheet-body .pp-events .pp-ev-add-btn")).toHaveCount(1);
      await expect(page.locator("#place-sheet-body .pp-events .pp-section-action")).toHaveCount(0);
      await expect(page.locator("#place-sheet-body .pp-reviews-detail")).toHaveCount(0);
      await page.locator("#place-sheet-body .pp-rating").click();
      await expect(page.locator("#reviews-overlay")).not.toHaveClass(/hide/);
      return;
    }

    const eventAction = page.locator("#place-sheet-body .pp-events .pp-section-action");
    const reviewAction = page.locator("#place-sheet-body .pp-reviews-detail .pp-section-action");
    await expect(eventAction).toHaveText("Add event");
    await expect(reviewAction).toHaveText("Add review");
    await expect(eventAction).toHaveClass(/pp-timeline-pill/);
    await expect(reviewAction).toHaveClass(/pp-timeline-pill/);

    const pageScrollTop = await page.evaluate(() => window.scrollY);
    await reviewAction.click();
    await expect(page.locator("#toast-stack .snack-label")).toContainText("Sign in to add a review");
    await expect(page.locator("#phone-profile-auth")).toBeVisible();
    await page.locator("#menu-google-signin").click();
    await expect(page.locator("#place-sheet-body .pp-reviews-detail .rv-form")).toBeVisible();
    await expect(page.locator("#place-sheet-body .pp-reviews-detail .rv-text-input")).toBeFocused();
    await expect(page.locator("#place-sheet-body .pp-reviews-detail .rv-text-input")).toBeInViewport();
    await expect(page.locator("#place-sheet-title")).toHaveText(place.name);
    await expect(page.locator("#reviews-overlay")).toHaveClass(/hide/);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollTop);
  });

  test("place detail sheet close button returns to places list at same scroll position", async ({ page }) => {
    await openPlaces(page);
    const scrollEl = page.locator("#places-scroll");
    await scrollEl.evaluate((el) => { el.scrollTop = 40; });
    const scrollBefore = await scrollEl.evaluate((el) => el.scrollTop);

    await page.locator("#places-list li[data-place-id]").nth(1).click();
    await expect(page.locator("#place-sheet")).not.toHaveClass(/shut/);
    await expect(page.locator("#places-sheet")).toHaveClass(/shut/);

    await page.locator("#place-sheet-close").click();
    await expect(page.locator("#place-sheet")).toHaveClass(/shut/);
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);

    const scrollAfter = await scrollEl.evaluate((el) => el.scrollTop);
    expect(scrollAfter).toBe(scrollBefore);
  });
});

/**
 * Google Place Details enrichment fields (website, phone, business status, price level,
 * accessibility/service chips, editorial summary) aren't present on any real place until
 * the Apps Script backend is redeployed (see docs/ACCOUNTS_AND_REDESIGN_PLAN.md Phase 3),
 * so these tests open the sheet directly with a mocked place object via a dynamic import,
 * exactly the technique used to hand-verify the rendering during development.
 */
test.describe("Place Detail Sheet — Google enrichment fields", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("renders contact links, status banner, info chips, and about text when present", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/src/places.js");
      mod.openPlaceSheet({
        id: "test-full-info", name: "Full Info Test Place", type: "restaurant",
        address: "Testikatu 1, Helsinki", lat: 60.1699, lng: 24.9384,
        tags: {}, notes: "",
        website: "https://example.com", phone: "+358 40 1234567",
        mapsUrl: "https://maps.google.com/?cid=12345",
        businessStatus: "CLOSED_TEMPORARILY", priceLevel: 2,
        wheelchairAccessible: true, dineIn: true, takeout: true, delivery: true,
        reservable: true, curbsidePickup: true, servesVegetarian: true,
        about: "A cozy family restaurant.",
      });
    });
    await expect(page.locator(".pp-status-banner--warn")).toContainText("Temporarily closed");
    await expect(page.locator(".pp-contact-link[href^='tel:']")).toContainText("+358 40 1234567");
    await expect(page.locator(".pp-contact-link[href='https://example.com']")).toContainText("Website");
    await expect(page.locator(".pp-contact-link[href='https://maps.google.com/?cid=12345']")).toContainText("Google Maps");
    const contactLayout = await page.locator("#place-sheet-body .pp-contact").evaluate((contact) => {
      const row = contact.parentElement;
      const reviews = row.querySelector(".pp-reviews");
      const rating = reviews.querySelector(".pp-rating");
      return {
        labels: [...contact.querySelectorAll(".pp-contact-link")].map((link) => link.getAttribute("aria-label")),
        textDisplays: [...contact.querySelectorAll(".pp-contact-link span")].map((span) => getComputedStyle(span).display),
        contactBackground: getComputedStyle(contact).backgroundColor,
        contactBorder: getComputedStyle(contact).borderTopStyle,
        ratingBackground: getComputedStyle(rating).backgroundColor,
        ratingText: rating.querySelector(".pp-rating-empty-text")?.textContent,
        contactWidth: contact.getBoundingClientRect().width,
        reviewsBesideContact: row.classList.contains("pp-meta-row") && row === reviews.parentElement,
        divider: getComputedStyle(row).borderBottomStyle,
        contactLeft: contact.getBoundingClientRect().left,
        rowLeft: row.getBoundingClientRect().left,
        ratingRight: rating.getBoundingClientRect().right,
        rowRight: row.getBoundingClientRect().right,
      };
    });
    expect(contactLayout.labels).toEqual(["Call", "Website", "Google Maps"]);
    expect(contactLayout.textDisplays).toEqual(["none", "none", "none"]);
    expect(contactLayout.contactBackground).toBe("rgba(0, 0, 0, 0)");
    expect(contactLayout.contactBorder).toBe("none");
    expect(contactLayout.ratingBackground).toBe("rgba(0, 0, 0, 0)");
    expect(contactLayout.ratingText).toBe("No reviews yet");
    expect(contactLayout.contactWidth).toBeLessThan(120);
    expect(contactLayout.reviewsBesideContact).toBe(true);
    expect(contactLayout.divider).toBe("solid");
    expect(contactLayout.contactLeft).toBeCloseTo(contactLayout.rowLeft, 0);
    expect(contactLayout.ratingRight).toBeCloseTo(contactLayout.rowRight, 0);
    await expect(page.locator(".pp-info-chip")).toContainText([
      "€€", "Wheelchair accessible", "Dine-in", "Takeout", "Delivery", "Reservations", "Curbside pickup", "Vegetarian options",
    ]);
    await expect(page.locator(".pp-about")).toContainText("A cozy family restaurant.");
  });

  test("permanently closed status uses the danger banner variant", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/src/places.js");
      mod.openPlaceSheet({
        id: "test-perm-closed", name: "Permanently Closed Test", type: "shop",
        address: "Testikatu 2, Helsinki", lat: 60.17, lng: 24.94,
        tags: {}, notes: "", businessStatus: "CLOSED_PERMANENTLY",
      });
    });
    await expect(page.locator(".pp-status-banner--danger")).toContainText("Permanently closed");
  });

  test("places without any enrichment fields show no banner, contact row, info chips, or about section", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/src/places.js");
      mod.openPlaceSheet({
        id: "test-bare", name: "Bare Place No Extras", type: "mosque",
        address: "Testikatu 3, Helsinki", lat: 60.17, lng: 24.94,
        tags: {}, notes: "Just a regular mosque.",
      });
    });
    await expect(page.locator(".pp-status-banner")).toHaveCount(0);
    await expect(page.locator(".pp-contact")).toHaveCount(0);
    await expect(page.locator(".pp-info-chip")).toHaveCount(0);
    await expect(page.locator(".pp-about")).toHaveCount(0);
  });
});

/**
 * Action-row Contact button — sits between Directions and Share. Phone-only for
 * now: the place data model has no email field (only phone/website from Phase 3),
 * so "call vs. email" collapses to a plain Call button. Website deliberately does
 * NOT wire into this button (it already has its own link in the .pp-contact row).
 */
test.describe("Place Detail Sheet — Contact action button", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("phone present — button shows a Call label", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/src/places.js");
      mod.openPlaceSheet({
        id: "test-contact-phone", name: "Phone Only Place", type: "restaurant",
        address: "Testikatu 4, Helsinki", lat: 60.17, lng: 24.94,
        tags: {}, notes: "", phone: "+358 40 1234567",
      });
    });
    const contactBtn = page.locator(".pp-contact-btn");
    await expect(contactBtn).toHaveCount(1);
    await expect(contactBtn).toHaveAttribute("aria-label", "Call");
  });

  test("website only, no phone — no contact button renders (website is not wired into this button)", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/src/places.js");
      mod.openPlaceSheet({
        id: "test-contact-website", name: "Website Only Place", type: "restaurant",
        address: "Testikatu 5, Helsinki", lat: 60.17, lng: 24.94,
        tags: {}, notes: "", website: "https://example.com",
      });
    });
    await expect(page.locator(".pp-contact-btn")).toHaveCount(0);
  });

  test("neither phone nor website — no contact button renders", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/src/places.js");
      mod.openPlaceSheet({
        id: "test-contact-none", name: "No Contact Info Place", type: "mosque",
        address: "Testikatu 7, Helsinki", lat: 60.17, lng: 24.94,
        tags: {}, notes: "",
      });
    });
    await expect(page.locator(".pp-contact-btn")).toHaveCount(0);
  });
});
