/**
 * Verified visit timeline coverage.
 *
 * The account endpoint and Firebase are mocked like the existing account
 * tests. Browser geolocation is mocked only for the client-side trust
 * boundary test; no test sends coordinates to the account API.
 */
const { test, expect, setupApp } = require("./helpers");

async function openProfile(page) {
  await page.click("#menu-pill");
  const phone = await page.evaluate(() => window.innerWidth <= 768);
  await expect(page.locator("#menu-google-signin")).toBeVisible({ timeout: 15_000 });
  await page.click("#menu-google-signin");
  if (phone) {
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "profile");
  } else {
    await expect(page.locator("#menu-profile-link")).toBeVisible({ timeout: 10_000 });
    await page.click("#menu-profile-link");
  }
  await expect(page.locator("#profile-timeline-open")).toBeVisible({ timeout: 15_000 });
  await page.click("#profile-timeline-open");
  await expect(page.locator("#profile-timeline-summary")).toBeVisible({ timeout: 15_000 });
  if (phone) {
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "timeline");
    return;
  }
  await expect(page.locator("#profile-sheet")).toHaveClass(/shut/);
  await expect(page.locator("#menu-sheet")).toHaveClass(/shut/);
}

async function signInFromMenu(page) {
  await page.click("#menu-pill");
  const phone = await page.evaluate(() => window.innerWidth <= 768);
  await expect(page.locator("#menu-google-signin")).toBeVisible({ timeout: 15_000 });
  await page.click("#menu-google-signin");
  if (phone) {
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "profile");
  } else {
    await expect(page.locator("#menu-profile-link")).toBeVisible({ timeout: 10_000 });
  }
}

function mockAccountApi(page, visits) {
  const requests = [];
  let currentVisits = [...visits];
  page.route("**/api/account", async (route) => {
    const body = route.request().postDataJSON?.() || {};
    requests.push(body);
    if (body.action === "get-visit-timeline") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, visits: currentVisits }) });
    }
    if (body.action === "add-verified-visit") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          visit: {
            id: "server-event-1",
            placeId: body.placeId,
            placeName: "Test Mosque",
            visitedAt: new Date().toISOString(),
            placeLat: 60.1699,
            placeLng: 24.9384,
          },
        }),
      });
    }
    if (body.action === "add-verified-event") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          visit: {
            id: "server-event-timeline-1",
            kind: "event",
            eventId: body.eventId,
            eventTitle: "Test Event",
            occurrenceAt: body.occurrenceAt,
            placeId: "",
            placeName: "Test Event",
            visitedAt: new Date().toISOString(),
            eventLat: 60.1699,
            eventLng: 24.9384,
            eventLocationName: "Test venue",
          },
        }),
      });
    }
    if (body.action === "delete-verified-visit") {
      currentVisits = currentVisits.filter((visit) => visit.id !== body.visitId);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, deleted: true }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, saved: [] }) });
  });
  return requests;
}

test("local demo profile renders contribution history and an elaborate timeline", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("hf_tutorial_v1", "done"));
  await page.goto("/?demo=profile");
  await page.waitForFunction(() => document.querySelector("#map canvas")?.offsetWidth > 0, { timeout: 30_000 });
  await expect.poll(() => page.locator(".event-mk-wrap").count(), { timeout: 15_000 }).toBeGreaterThan(0);
  const phone = await page.evaluate(() => window.innerWidth <= 768);
  if (!phone) {
    await page.click("#menu-pill");
    await expect(page.locator("#menu-profile-link")).toBeVisible({ timeout: 15_000 });
    await page.click("#menu-profile-link");
  } else {
    await page.click("#menu-pill");
    await expect(page.locator("#profile-timeline-open")).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.locator("#profile-card-body")).toContainText("Amina Rahman");
  await expect(page.locator("#profile-timeline-preview-title")).toHaveText("16 visits");
  await expect(page.locator("#profile-timeline-preview")).toContainText("10 places");
  await expect(page.locator("#profile-timeline-preview")).toContainText("6 events");
  await expect(page.locator("#profile-timeline-preview")).toContainText("5 months active");
  await expect(page.locator("#profile-my-reviews .pf-profile-section-preview")).toContainText("4 reviews");
  await expect(page.locator("#profile-my-reviews .pf-profile-section-preview")).toContainText("4.5 avg");
  await expect(page.locator("#profile-submitted-places .pf-profile-section-preview")).toContainText("4 submissions");
  await expect(page.locator("#profile-submitted-places .pf-profile-section-preview")).toContainText("2 approved");
  await expect(page.locator("#profile-submitted-places .pf-profile-section-preview")).not.toContainText("Latest:");
  await expect(page.locator("#profile-submitted-edits .pf-profile-section-preview")).toContainText("4 edits");
  await expect(page.locator("#profile-submitted-edits .pf-profile-section-preview")).toContainText("1 rejected");
  await expect(page.locator("#profile-submitted-edits .pf-profile-section-preview")).not.toContainText("Latest:");
  await page.click("#profile-my-reviews .pf-summary-chips");
  await expect(page.locator("#profile-detail-body .pf-review-toolbar")).toBeVisible();
  await expect(page.locator("#profile-detail-body .pf-detail-group-heading")).toHaveCount(0);
  await expect(page.locator("#profile-detail-body .pf-detail-intro")).toHaveCount(0);
  await page.click("#profile-detail-body [data-review-search-toggle]");
  await expect(page.locator("#profile-detail-body .pf-review-search-input")).toBeVisible();
  await page.fill("#profile-detail-body .pf-review-search-input", "Bangladesh");
  await expect(page.locator("#profile-detail-body .acc-review-row")).toHaveCount(1);
  await page.click("#profile-detail-body [data-review-sort-toggle]");
  await expect(page.locator("#profile-detail-body [data-review-sort-dropdown]:not(.shut)")).toBeVisible();
  await page.click('#profile-detail-body [data-review-sort="rating"]');
  await page.click("#profile-detail-close");
  await page.click("#profile-submitted-edits .pf-summary-chips");
  await expect(page.locator("#profile-detail-body .pf-submission-toolbar")).toBeVisible();
  await expect(page.locator("#profile-detail-body .pf-detail-group-heading")).toHaveCount(0);
  await expect(page.locator("#profile-detail-body .pf-detail-intro")).toHaveCount(0);
  await expect(page.locator("#profile-detail-body .pf-submission-item")).toHaveCount(4);
  await expect(page.locator("#profile-detail-body .status-pill")).toHaveCount(4);
  await page.click("#profile-detail-body [data-edit-filter-toggle]");
  await expect(page.locator("#profile-detail-body [data-edit-filter-dropdown]:not(.shut)")).toBeVisible();
  await page.click('#profile-detail-body [data-edit-status="pending"]');
  await expect(page.locator("#profile-detail-body .pf-submission-item")).toHaveCount(1);
  await page.click("#profile-detail-body [data-edit-filter-toggle]");
  await page.click('#profile-detail-body [data-edit-status="all"]');
  await page.click("#profile-detail-body [data-edit-sort-toggle]");
  await expect(page.locator("#profile-detail-body [data-edit-sort-dropdown]:not(.shut)")).toBeVisible();
  await page.click('#profile-detail-body [data-edit-sort-dir="asc"]');
  await page.click("#profile-detail-body [data-edit-search-toggle]");
  await page.fill("#profile-detail-body .pf-submission-search-input", "opening hours");
  await expect(page.locator("#profile-detail-body .pf-submission-item")).toHaveCount(1);
  await expect(page.locator("#profile-detail-body .pf-submission-changes")).toContainText("Opening hours");
  await page.click("#profile-detail-close");
  await page.click("#profile-submitted-places .pf-summary-chips");
  await expect(page.locator("#profile-detail-overlay")).toBeVisible();
  await expect(page.locator("#profile-detail-body .pf-submission-toolbar")).toBeVisible();
  await expect(page.locator("#profile-detail-body .pf-detail-group-heading")).toHaveCount(0);
  await expect(page.locator("#profile-detail-body .pf-detail-intro")).toHaveCount(0);
  await expect(page.locator("#profile-detail-body .pf-submission-item")).toHaveCount(4);
  await expect(page.locator("#profile-detail-body .status-pill")).toHaveCount(4);
  await expect(page.locator("#profile-detail-body .pf-submission-community-edit")).toHaveCount(1);
  await expect(page.locator("#profile-detail-body .pf-submission-community-edit")).toContainText("Opening hours");
  await page.click("#profile-detail-body [data-edit-search-toggle]");
  await page.fill("#profile-detail-body .pf-submission-search-input", "Sisters");
  await expect(page.locator("#profile-detail-body .pf-submission-item")).toHaveCount(1);
  if (phone) {
    const layers = await page.evaluate(() => ({
      detail: Number.parseInt(getComputedStyle(document.querySelector("#profile-detail-overlay")).zIndex, 10),
      page: Number.parseInt(getComputedStyle(document.querySelector("#profile-sheet")).zIndex, 10),
      nav: Number.parseInt(getComputedStyle(document.querySelector("#phone-chrome-bottom-zone")).zIndex, 10),
    }));
    expect(layers.detail).toBeGreaterThan(layers.nav);
    expect(layers.page).toBeLessThan(layers.nav);
  }
  await page.click("#profile-detail-close");
  await page.click("#profile-timeline-preview .pf-timeline-preview-copy");
  await expect(page.locator(".pf-timeline-event")).toHaveCount(16);
});

test("phone profile detail window resizes to discrete content-aware snaps", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("hf_tutorial_v1", "done"));
  await page.goto("/?demo=profile");
  await page.waitForFunction(() => document.querySelector("#map canvas")?.offsetWidth > 0, { timeout: 30_000 });
  test.skip(await page.evaluate(() => window.innerWidth > 768), "Profile detail resizing is phone-only");

  await page.click("#menu-pill");
  await expect(page.locator("#profile-timeline-open")).toBeVisible({ timeout: 15_000 });
  await page.click("#profile-my-reviews .pf-summary-chips");
  await expect(page.locator("#profile-detail-body .pf-review-toolbar")).toBeVisible();

  const initial = await page.locator("#profile-detail-card").evaluate((card) => ({
    height: card.getBoundingClientRect().height,
    viewport: window.innerHeight,
  }));
  expect(initial.height).toBeLessThanOrEqual(initial.viewport * 0.75 + 2);

  const handle = page.locator("#profile-detail-card .overlay-drag");
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 180, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(450);

  const snapped = await page.locator("#profile-detail-card").evaluate((card) => ({
    height: card.getBoundingClientRect().height,
    viewport: window.innerHeight,
  }));
  const snapRatio = Math.round((snapped.height / snapped.viewport) * 4) / 4;
  expect([0.25, 0.5, 0.75, 1]).toContain(snapRatio);
  expect(snapped.height).toBeLessThan(initial.height - 20);

  const contentShell = await page.locator("#profile-detail-card").evaluate((card) => {
    const body = card.querySelector("#profile-detail-body");
    const handle = card.querySelector(".overlay-drag");
    const header = card.querySelector(".suggest-head");
    const bodyStyle = getComputedStyle(body);
    return {
      viewport: window.innerHeight,
      shell: handle.offsetHeight + header.offsetHeight
        + Number.parseFloat(bodyStyle.paddingTop)
        + Number.parseFloat(bodyStyle.paddingBottom),
    };
  });
  await page.addStyleTag({
    content: `#profile-detail-body > .pf-detail-review-content { box-sizing: border-box; height: ${contentShell.viewport * 0.78 - contentShell.shell}px !important; overflow: hidden !important; }`,
  });
  await page.click("#profile-detail-close");
  await expect(page.locator("#profile-detail-overlay")).toHaveClass(/hide/);
  await page.click("#profile-my-reviews .pf-summary-chips");
  await expect(page.locator("#profile-detail-body .pf-review-toolbar")).toBeVisible();
  const cappedInitial = await page.locator("#profile-detail-card").evaluate((card) => ({
    height: card.getBoundingClientRect().height,
    viewport: window.innerHeight,
  }));
  expect(cappedInitial.height / cappedInitial.viewport).toBeCloseTo(0.75, 1);

  const cappedHandleBox = await handle.boundingBox();
  await page.mouse.move(cappedHandleBox.x + cappedHandleBox.width / 2, cappedHandleBox.y + cappedHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cappedHandleBox.x + cappedHandleBox.width / 2, cappedHandleBox.y - 40, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(450);
  const cappedSnap = await page.locator("#profile-detail-card").evaluate((card) => card.getBoundingClientRect().height / window.innerHeight);
  expect(cappedSnap).toBeCloseTo(0.78, 2);
});

test.describe("verified visit timeline", () => {
  test("keeps manual Visited separate and requires sign-in before GPS", async ({ page }) => {
    await setupApp(page);
    await page.evaluate(async () => {
      const { placesData, openPlaceSheet } = await import("/src/places.js");
      openPlaceSheet(placesData[0]);
    });
    await expect(page.locator("#place-sheet-toolbar .pp-visit-chip")).toBeVisible();
    await expect(page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn")).toHaveText("Add to timeline");
    await expect(page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn svg")).toHaveCount(0);
    await expect(page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn")).toHaveAttribute("aria-label", "Add to timeline");
    const locationCalls = await page.evaluate(() => {
      let calls = 0;
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition: () => { calls += 1; } },
      });
      window.__timelineLocationCalls = () => calls;
      return 0;
    });
    expect(locationCalls).toBe(0);
    await page.click("#place-sheet-body .pp-title-actions .pp-timeline-btn");
    await expect(page.locator("#menu-google-signin")).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => window.__timelineLocationCalls())).toBe(0);
  });

  test("pure GPS eligibility distinguishes accepted, inaccurate, and distant fixes", async ({ page }) => {
    await setupApp(page);
    const results = await page.evaluate(async () => {
      const { evaluateTimelineLocation } = await import("/src/timeline.js");
      const place = { lat: 60.1699, lng: 24.9384 };
      return {
        eligible: evaluateTimelineLocation({ coords: { latitude: 60.1699, longitude: 24.9384, accuracy: 20 } }, place).status,
        inaccurate: evaluateTimelineLocation({ coords: { latitude: 60.1699, longitude: 24.9384, accuracy: 151 } }, place).status,
        distant: evaluateTimelineLocation({ coords: { latitude: 60.1800, longitude: 24.9384, accuracy: 20 } }, place).status,
      };
    });
    expect(results).toEqual({ eligible: "eligible", inaccurate: "accuracy-too-low", distant: "too-far" });
  });

  test("local GPS simulator supplies the timeline location without browser geolocation", async ({ page }) => {
    const requests = mockAccountApi(page, []);
    await setupApp(page);
    await signInFromMenu(page);
    const result = await page.evaluate(async () => {
      window.__manarahGpsSim.setLocation(60.1699, 24.9384, 5);
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition: () => { throw new Error("browser geolocation should not be called"); } },
      });
      const { addVerifiedVisit } = await import("/src/timeline.js");
      const visit = await addVerifiedVisit({ id: "p1", lat: 60.1699, lng: 24.9384 });
      window.__manarahGpsSim.deactivate();
      return visit;
    });

    expect(result.success).toBe(true);
    expect(requests.filter((body) => body.action === "add-verified-visit")).toHaveLength(1);
  });

  test("keeps the timeline action available while live GPS is off", async ({ page }) => {
    await setupApp(page);
    await signInFromMenu(page);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "granted" }) } });
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition: (resolve) => resolve({ coords: { latitude: 60.1800, longitude: 24.9384, accuracy: 20 } }) },
      });
    });
    await page.evaluate(async () => {
      const { placesData, openPlaceSheet } = await import("/src/places.js");
      openPlaceSheet({ ...placesData[0], lat: 60.1699, lng: 24.9384 });
    });
    await expect(page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn")).toHaveAttribute("aria-label", "Add to timeline");
  });

  test("GPS-off timeline action offers a toast action to turn location on", async ({ page }) => {
    mockAccountApi(page, []);
    await setupApp(page);
    await signInFromMenu(page);
    await page.click("#mp-sheet-close");
    await expect(page.locator("#menu-sheet")).toHaveClass(/shut/);
    await page.evaluate(async () => {
      const { clearCurrentLocationState } = await import("/src/utils.js");
      clearCurrentLocationState();
      Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "prompt" }) } });
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          watchPosition: (onPosition) => {
            window.__timelineWatchCalls = (window.__timelineWatchCalls || 0) + 1;
            setTimeout(() => onPosition({ coords: { latitude: 60.1699, longitude: 24.9384, accuracy: 5 } }), 0);
            return 1;
          },
          clearWatch: () => {},
        },
      });
    });
    await page.evaluate(async () => {
      const { placesData, openPlaceSheet } = await import("/src/places.js");
      openPlaceSheet({ ...placesData[0], lat: 60.1699, lng: 24.9384 });
    });
    await expect(page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn")).toHaveText("Add to timeline");
    await page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn").click();
    await expect(page.locator(".share-toast-action")).toContainText("Location is off");
    await expect(page.locator(".share-toast-action")).toContainText("Tap to turn on GPS");
    await page.locator(".share-toast-action").click();
    await expect.poll(() => page.evaluate(() => window.__timelineWatchCalls || 0)).toBe(1);
    await expect(page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn")).toHaveText("Added to timeline", { timeout: 5000 });
  });

  test("startup location notice is persistent and dismissible", async ({ page }) => {
    await setupApp(page);
    await page.evaluate(async () => {
      const { clearCurrentLocationState } = await import("/src/utils.js");
      clearCurrentLocationState();
      Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied" }) } });
      const { primeLocationAtStartup } = await import("/src/map-controls.js");
      await primeLocationAtStartup();
    });
    const notice = page.locator(".share-toast-action-shell").filter({ hasText: "Enable GPS for nearby places" });
    await expect(notice).toBeVisible();
    await page.waitForTimeout(8500);
    await expect(notice).toBeVisible();
    await notice.locator(".share-toast-close").click();
    await expect(notice).toBeHidden();
  });

  test("removes the timeline action after the resumed GPS check finds a distant place", async ({ page }) => {
    mockAccountApi(page, []);
    await setupApp(page);
    await signInFromMenu(page);
    await page.click("#mp-sheet-close");
    await expect(page.locator("#menu-sheet")).toHaveClass(/shut/);
    await page.evaluate(async () => {
      const { clearCurrentLocationState } = await import("/src/utils.js");
      clearCurrentLocationState();
      Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "prompt" }) } });
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          watchPosition: (onPosition) => {
            setTimeout(() => onPosition({ coords: { latitude: 60.1800, longitude: 24.9384, accuracy: 5 } }), 0);
            return 1;
          },
          clearWatch: () => {},
        },
      });
    });
    await page.evaluate(async () => {
      const { placesData, openPlaceSheet } = await import("/src/places.js");
      openPlaceSheet({ ...placesData[0], lat: 60.1699, lng: 24.9384 });
    });
    await page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn").click();
    await page.locator(".share-toast-action").click();
    await expect(page.locator("#toast-stack .share-toast").filter({ hasText: "You’re about" })).toBeVisible();
    await expect(page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn")).toHaveCount(0, { timeout: 1000 });
    expect(await page.evaluate(() => document.querySelectorAll('body > #toast-stack [data-state="idle"]').length)).toBe(0);
  });

  test("GPS simulator moves only on Shift-click, not on a normal map click", async ({ page }) => {
    await setupApp(page);
    await expect(page.locator("#welcome-screen")).toBeHidden({ timeout: 15_000 });
    if (await page.evaluate(() => window.innerWidth <= 768)) await page.click("#dir-btn");
    // Use an unobstructed map area so the first click cannot open a place sheet
    // and cover the second click that is testing the simulator gesture.
    await page.evaluate(() => window.__manarahGpsSim.activate());
    expect(await page.evaluate(() => window.__manarahGpsSim.getLocation().active)).toBe(false);
    await page.locator("#map canvas").click({ position: { x: 150, y: 180 } });
    expect(await page.evaluate(() => window.__manarahGpsSim.getLocation().active)).toBe(false);
    await page.locator("#map canvas").click({ position: { x: 180, y: 200 }, modifiers: ["Shift"] });
    const location = await page.evaluate(() => window.__manarahGpsSim.getLocation());
    expect(location).toMatchObject({ active: true, source: "sim", accuracy: 5 });
    await page.locator(".place-mk-wrap").first().dispatchEvent("click");
    await expect(page.locator("#place-sheet")).not.toHaveClass(/shut/);
    await page.evaluate(() => window.__manarahGpsSim.deactivate());
  });

  test("rejects distant and low-accuracy fixes without calling the account API", async ({ page }) => {
    const requests = mockAccountApi(page, []);
    await setupApp(page);
    await signInFromMenu(page);
    const results = await page.evaluate(async () => {
      const { addVerifiedVisit } = await import("/src/timeline.js");
      const place = { id: "p1", lat: 60.1699, lng: 24.9384 };
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (resolve) => resolve({ coords: { latitude: 60.1800, longitude: 24.9384, accuracy: 20 } }) } });
      const distant = await addVerifiedVisit(place);
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (resolve) => resolve({ coords: { latitude: 60.1699, longitude: 24.9384, accuracy: 151 } }) } });
      const inaccurate = await addVerifiedVisit(place);
      return { distant: distant.status, inaccurate: inaccurate.status };
    });
    expect(results).toEqual({ distant: "too-far", inaccurate: "accuracy-too-low" });
    expect(requests.filter((body) => body.action === "add-verified-visit")).toHaveLength(0);
  });

  test("hides the compact timeline action when active GPS is out of range", async ({ page }) => {
    await setupApp(page);
    await signInFromMenu(page);
    await page.click("#mp-sheet-close");
    await expect(page.locator("#menu-sheet")).toHaveClass(/shut/);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "granted" }) } });
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition: (resolve) => resolve({ coords: { latitude: 60.1800, longitude: 24.9384, accuracy: 20 } }) },
      });
    });
    await page.evaluate(async () => {
      const { setCurrentLocationState } = await import("/src/utils.js");
      setCurrentLocationState({ lat: 60.1800, lng: 24.9384, accuracy: 20, active: true });
    });
    const initialTimelineActionCount = await page.evaluate(async () => {
      const { placesData, openPlaceSheet } = await import("/src/places.js");
      openPlaceSheet({ ...placesData[0], lat: 60.1699, lng: 24.9384 });
      return document.querySelectorAll("#place-sheet-body .pp-title-actions .pp-timeline-btn").length;
    });
    expect(initialTimelineActionCount).toBe(0);
    await expect(page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn")).toHaveCount(0, { timeout: 10_000 });
  });

  test("Profile renders summary, month groups, repeated visits, and the empty-coordinate event", async ({ page }) => {
    mockAccountApi(page, [
      { id: "visit-2", placeId: "p1", placeName: "Test Mosque", visitedAt: "2026-10-17T12:34:56.000Z", placeLat: 60.1699, placeLng: 24.9384 },
      { id: "visit-3", placeId: "removed-place", placeName: "Historical Place", visitedAt: "2026-10-17T08:15:00.000Z", placeLat: null, placeLng: null },
      { id: "visit-1", placeId: "p1", placeName: "Test Mosque", visitedAt: "2026-09-01T08:15:00.000Z", placeLat: 60.1699, placeLng: 24.9384 },
      { id: "visit-0", placeId: "removed-place", placeName: "Historical Place", visitedAt: "2026-08-02T10:00:00.000Z", placeLat: null, placeLng: null },
    ]);
    await setupApp(page);
    await openProfile(page);

    await expect(page.locator(".pf-timeline-summary-value").nth(0)).toHaveText("4");
    await expect(page.locator(".pf-timeline-summary-value").nth(1)).toHaveText("2");
    await expect(page.locator(".pf-timeline-summary-value").nth(2)).toHaveText("3");
    await expect(page.locator(".pf-timeline-month-events")).toHaveCount(3);
    await expect(page.locator(".pf-timeline-event")).toHaveCount(4);
    await expect(page.locator(".pf-timeline-event").nth(3)).toContainText("Historical Place");
    const monthToggles = page.locator(".pf-timeline-month-toggle");
    await expect(monthToggles).toHaveCount(3);
    await monthToggles.first().click();
    await expect(monthToggles.first()).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".pf-timeline-events").first()).toHaveClass(/pf-timeline-events--collapsed/);
    await page.locator('.pf-timeline-calendar-day[data-has-visits][data-day-key="2026-10-17"]').click();
    await expect(monthToggles.first()).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".pf-timeline-events").first()).not.toHaveClass(/pf-timeline-events--collapsed/);
    const visitedCalendarDays = await page.locator(".pf-timeline-calendar-day[title*='verified visit']").count();
    expect(visitedCalendarDays).toBeGreaterThan(0);
    await expect(page.locator(".pf-timeline-activity-heading")).toContainText("Since");
    await expect(page.locator(".pf-timeline-activity-heading")).toContainText("2026");
    await expect(page.locator(".pf-timeline-activity-months")).toContainText("Aug");
    await page.locator('.pf-timeline-calendar-day[data-has-visits][data-day-key="2026-10-17"]').click();
    await expect(page.locator(".pf-timeline-event--day-target")).toHaveCount(2);
  });

  test("add request contains only account action, token, and place ID", async ({ page }) => {
    const requests = mockAccountApi(page, []);
    await setupApp(page);
    await signInFromMenu(page);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition: (resolve) => resolve({ coords: { latitude: 60.1699, longitude: 24.9384, accuracy: 20 } }) },
      });
    });
    const result = await page.evaluate(async () => {
      const { addVerifiedVisit } = await import("/src/timeline.js");
      return addVerifiedVisit({ id: "p1", lat: 60.1699, lng: 24.9384, name: "Test Mosque" });
    });
    expect(result.success).toBe(true);
    const request = requests.find((body) => body.action === "add-verified-visit");
    expect(request).toMatchObject({ action: "add-verified-visit", idToken: "mock-id-token-google", placeId: "p1" });
    expect(request).not.toHaveProperty("lat");
    expect(request).not.toHaveProperty("lng");
    expect(request).not.toHaveProperty("latitude");
    expect(request).not.toHaveProperty("longitude");
    expect(request).not.toHaveProperty("accuracy");
    expect(request).not.toHaveProperty("visitedAt");
  });

  test("empty Profile state is intentional and provides a map route", async ({ page }) => {
    mockAccountApi(page, []);
    await setupApp(page);
    await openProfile(page);
    await expect(page.locator("#profile-timeline-preview-title")).toHaveText("Verified visits");
    await expect(page.locator("#profile-timeline-preview-summary")).toHaveText("No verified visits yet");
    await expect(page.locator("#profile-submitted-places .pf-profile-empty")).toHaveText("No places added yet");
    await expect(page.locator("#profile-submitted-edits .pf-profile-empty")).toHaveText("No edits yet");
    await expect(page.locator("#profile-my-reviews .pf-profile-empty")).toHaveText("No reviews yet");
    await expect(page.locator(".pf-timeline-empty")).toContainText("No visits yet");
    await expect(page.locator("#profile-timeline-calendar").locator("..")).toBeHidden();
    const browse = page.locator("[data-profile-timeline-browse]");
    await expect(browse).toHaveText("Explore Manarah");
    await browse.click();
    await expect(page.locator("#timeline-overlay")).toHaveClass(/hide/);
    await expect(page.locator("#menu-sheet")).toHaveClass(/shut/);
  });

  test("Timeline is a child window: Back restores Profile and outside closes the thread", async ({ page }) => {
    await setupApp(page);
    await openProfile(page);
    if (await page.evaluate(() => window.innerWidth <= 768)) {
      await expect(page.locator("body")).toHaveAttribute("data-phone-page", "timeline");
      await page.click("#timeline-close");
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const backState = await page.evaluate(() => ({
        mode: document.body.dataset.phoneTransitionMode,
        incoming: document.querySelector("#profile-sheet").classList.contains("phone-page-transition-stationary"),
        outgoing: document.querySelector("#timeline-overlay").classList.contains("phone-page-transition-leaving"),
        outgoingDisplay: getComputedStyle(document.querySelector("#timeline-overlay")).display,
        outgoingAnimation: getComputedStyle(document.querySelector("#timeline-overlay")).animationName,
        outgoingTransform: getComputedStyle(document.querySelector("#timeline-overlay")).transform,
      }));
      expect(backState).toMatchObject({
        mode: "overlay",
        incoming: true,
        outgoing: true,
        outgoingDisplay: "flex",
        outgoingAnimation: "phone-page-overlay-out",
      });
      expect(backState.outgoingTransform).not.toBe("none");
      await expect(page.locator("body")).toHaveAttribute("data-phone-page", "profile");
      return;
    }
    await expect(page.locator("#timeline-close")).toHaveAttribute("aria-label", "Back to profile");

    await page.click("#timeline-close");
    expect(await page.locator("#profile-sheet").evaluate((el) => Number(getComputedStyle(el).zIndex))).toBeGreaterThan(100);
    await expect(page.locator("#timeline-overlay")).toHaveClass(/hide/);
    await expect(page.locator("#profile-sheet")).not.toHaveClass(/shut/);
    await expect(page.locator("#profile-sheet-close")).toHaveAttribute("aria-label", "Back to menu");

    await page.click("#profile-timeline-open");
    await expect(page.locator("#timeline-overlay")).not.toHaveClass(/hide/);
    await page.locator("#timeline-overlay").dispatchEvent("click");
    await expect(page.locator("#timeline-overlay")).toHaveClass(/hide/);
    await expect(page.locator("#profile-sheet")).toHaveClass(/shut/);
    await expect(page.locator("#menu-sheet")).toHaveClass(/shut/);
  });

  test("phone drag-dismiss closes the whole Timeline thread", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("Pixel"), "drag coverage runs on the phone project");
    await setupApp(page);
    await openProfile(page);
    test.skip(true, "Timeline is a full phone page; browser back covers its dismissal in the page-navigation suite");
    await page.evaluate(() => {
      const handle = document.querySelector("#timeline-card .overlay-drag");
      const touch = (type, y) => {
        const point = new Touch({ identifier: 1, target: handle, clientX: 12, clientY: y });
        handle.dispatchEvent(new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === "touchend" ? [] : [point],
          changedTouches: [point],
        }));
      };
      touch("touchstart", 120);
      document.dispatchEvent(new TouchEvent("touchmove", {
        bubbles: true,
        touches: [new Touch({ identifier: 1, target: handle, clientX: 12, clientY: 560 })],
      }));
      document.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [] }));
    });
    await expect(page.locator("#timeline-overlay")).toHaveClass(/hide/);
    await expect(page.locator("#profile-sheet")).toHaveClass(/shut/);
    await expect(page.locator("#menu-sheet")).toHaveClass(/shut/);
  });

  test("same-place cooldown blocks an accidental second add", async ({ page }) => {
    const requests = mockAccountApi(page, []);
    await setupApp(page);
    await signInFromMenu(page);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition: (resolve) => resolve({ coords: { latitude: 60.1699, longitude: 24.9384, accuracy: 20 } }) },
      });
    });
    const result = await page.evaluate(async () => {
      const { addVerifiedVisit, TIMELINE_COOLDOWN_MS } = await import("/src/timeline.js");
      const place = { id: "p1", lat: 60.1699, lng: 24.9384 };
      return { first: await addVerifiedVisit(place), second: await addVerifiedVisit(place), cooldownMs: TIMELINE_COOLDOWN_MS };
    });
    expect(result.first.success).toBe(true);
    expect(result.second.status).toBe("cooldown");
    expect(result.cooldownMs).toBe(60 * 60 * 1000);
    expect(requests.filter((body) => body.action === "add-verified-visit")).toHaveLength(1);
  });

  test("timeline pill comes first, turns green for an hour, and explains repeat taps", async ({ page }) => {
    mockAccountApi(page, []);
    await setupApp(page);
    await signInFromMenu(page);
    await page.click("#mp-sheet-close");
    await expect(page.locator("#menu-sheet")).toHaveClass(/shut/);
    await page.evaluate(async () => {
      window.__manarahGpsSim.setLocation(60.1699, 24.9384, 5);
      const { placesData, openPlaceSheet } = await import("/src/places.js");
      openPlaceSheet({ ...placesData[0], id: "p1", lat: 60.1699, lng: 24.9384 });
    });
    const timelineButton = page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn");
    await expect(timelineButton).toHaveText("Add to timeline");
    await expect(timelineButton).toHaveAttribute("aria-label", "Add to timeline");
    expect(await timelineButton.evaluate((button) => getComputedStyle(button).transitionProperty.split(",").map((property) => property.trim()))).toContain("width");
    const titleActionLayout = await page.evaluate(() => {
      const title = document.querySelector("#place-sheet-title").getBoundingClientRect();
      const button = document.querySelector("#place-sheet-body .pp-title-actions .pp-timeline-btn").getBoundingClientRect();
      return {
        titleRight: title.right,
        buttonLeft: button.left,
        buttonCenterY: button.top + button.height / 2,
        titleCenterY: title.top + title.height / 2,
      };
    });
    expect(titleActionLayout.buttonLeft).toBeGreaterThanOrEqual(titleActionLayout.titleRight);
    expect(Math.abs(titleActionLayout.buttonCenterY - titleActionLayout.titleCenterY)).toBeLessThanOrEqual(3);
    expect(await timelineButton.evaluate((button) => button.scrollWidth <= button.clientWidth + 1)).toBe(true);
    await page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn").click();
    await expect(page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn")).toHaveText("Added to timeline");
    await expect(page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn")).toHaveAttribute("data-state", "cooldown");
    await expect(page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn")).not.toBeDisabled();
    await page.locator("#place-sheet-body .pp-title-actions .pp-timeline-btn").click();
    await expect(page.locator(".snack-label", { hasText: "Already added to timeline" })).toBeVisible({ timeout: 3_000 });
    await page.evaluate(() => window.__manarahGpsSim.deactivate());
  });

  test("recurring events use their start date and create one timeline entry per occurrence", async ({ page }) => {
    await setupApp(page);
    const result = await page.evaluate(async () => {
      const { eventHasOccurred, getEventOccurrenceWindow, normalizeTimelineVisit } = await import("/src/timeline.js");
      const event = { id: "weekly-test", date: "2026-11-01", time: "22:00", endTime: "23:00", recurring: true, recurrence: "weekly:0", lat: 60.1699, lng: 24.9384 };
      const now = new Date(2026, 10, 8, 22, 30);
      return {
        occurred: eventHasOccurred(event, now),
        occurrence: getEventOccurrenceWindow(event, now)?.occurrenceAt || "",
        normalized: normalizeTimelineVisit({ id: "event-visit", kind: "event", eventId: event.id, eventTitle: "Weekly test", occurrenceAt: "2026-11-08", visitedAt: now.toISOString(), eventLat: 60.1699, eventLng: 24.9384 }),
      };
    });
    expect(result.occurred).toBe(true);
    expect(result.occurrence).toBe("2026-11-08");
    expect(result.normalized.kind).toBe("event");
    expect(result.normalized.eventId).toBe("weekly-test");
  });

  test("event attendance uses the one-hour pre-start timeline window", async ({ page }) => {
    await setupApp(page);
    const result = await page.evaluate(async () => {
      const { eventHasOccurred, getEventOccurrenceWindow } = await import("/src/timeline.js");
      const event = { date: "2026-10-22", time: "22:00", endTime: "23:00" };
      const now = new Date("2026-10-22T21:00:00");
      return {
        timelineEligible: Boolean(getEventOccurrenceWindow(event, now)),
        attendanceEligible: eventHasOccurred(event, now),
      };
    });
    expect(result.timelineEligible).toBe(true);
    expect(result.attendanceEligible).toBe(true);
  });

  test("event detail exposes attended and GPS timeline actions for an active event", async ({ page }) => {
    const requests = mockAccountApi(page, []);
    await setupApp(page);
    await signInFromMenu(page);
    const event = await page.evaluate(() => {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const hour = String(Math.max(0, now.getHours() - 1)).padStart(2, "0");
      return { date, time: `${hour}:${String(now.getMinutes()).padStart(2, "0")}` };
    });
    await page.evaluate(async ({ date, time }) => {
      window.__manarahGpsSim.setLocation(60.1699, 24.9384, 5);
      const { openEventDetail } = await import("/src/places.js");
      openEventDetail({ id: "active-event", title: "Active event", date, time, endTime: "23:59", recurring: false, placeId: "", lat: 60.1699, lng: 24.9384, locationName: "Test venue" });
    }, event);
    await expect(page.locator("#event-detail-toolbar .ev-detail-attend-btn")).toBeVisible();
    await page.locator("#event-detail-toolbar .ev-detail-attend-btn").click();
    await expect(page.locator("#event-detail-toolbar .ev-detail-attend-btn")).toHaveAttribute("aria-label", "Attended");
    await expect(page.locator("#event-detail-body .ev-detail-timeline-btn")).toBeVisible();
    await page.locator("#event-detail-body .ev-detail-timeline-btn").click();
    await expect(page.locator("#event-detail-body .ev-detail-timeline-btn")).toHaveText("Added to timeline");
    const eventRequest = requests.find((body) => body.action === "add-verified-event");
    expect(eventRequest).toMatchObject({ eventId: "active-event" });
    expect(eventRequest).not.toHaveProperty("lat");
    expect(eventRequest).not.toHaveProperty("accuracy");
    await page.evaluate(() => window.__manarahGpsSim.deactivate());
  });

  test("removes one timeline event and refreshes the list", async ({ page }) => {
    const requests = mockAccountApi(page, [
      { id: "visit-remove", placeId: "p1", placeName: "Test Mosque", visitedAt: "2026-10-17T12:34:56.000Z", placeLat: 60.1699, placeLng: 24.9384 },
    ]);
    await setupApp(page);
    await openProfile(page);
    await expect(page.locator(".pf-timeline-event-remove")).toHaveCount(1);
    await expect(page.locator(".pf-timeline-event-remove")).toHaveClass(/btn-roundel-danger/);
    if (await page.evaluate(() => window.innerWidth <= 768)) {
      const centerOffset = await page.evaluate(() => {
        const event = document.querySelector(".pf-timeline-event").getBoundingClientRect();
        const button = document.querySelector(".pf-timeline-event-remove").getBoundingClientRect();
        return Math.abs((button.top + button.height / 2) - (event.top + event.height / 2));
      });
      expect(centerOffset).toBeLessThanOrEqual(1);
    }
    await page.locator(".pf-timeline-event-remove").click();
    await page.locator(".confirm-ok").click();
    await expect(page.locator(".pf-timeline-empty")).toBeVisible({ timeout: 10_000 });
    expect(requests.find((body) => body.action === "delete-verified-visit")).toMatchObject({ visitId: "visit-remove" });
  });
});
