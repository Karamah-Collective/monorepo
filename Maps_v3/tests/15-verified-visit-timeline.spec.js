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
    if (body.action === "delete-verified-visit") {
      currentVisits = currentVisits.filter((visit) => visit.id !== body.visitId);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, deleted: true }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, saved: [] }) });
  });
  return requests;
}

test.describe("verified visit timeline", () => {
  test("keeps manual Visited separate and requires sign-in before GPS", async ({ page }) => {
    await setupApp(page);
    await page.evaluate(async () => {
      const { placesData, openPlaceSheet } = await import("/src/places.js");
      openPlaceSheet(placesData[0]);
    });
    await expect(page.locator("#place-sheet-body .pp-visit-chip")).toBeVisible();
    await expect(page.locator("#place-sheet-body .pp-timeline-btn")).toHaveText("Add to timeline");
    await expect(page.locator("#place-sheet-body .pp-timeline-btn svg")).toHaveCount(0);
    await expect(page.locator("#place-sheet-body .pp-timeline-btn")).toHaveAttribute("aria-label", "Add to timeline");
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
    await page.click("#place-sheet-body .pp-timeline-btn");
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
    await expect(page.locator("#place-sheet-body .pp-timeline-btn")).toHaveAttribute("aria-label", "Add to timeline");
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
    await expect(page.locator("#place-sheet-body .pp-timeline-btn")).toHaveText("Add to timeline");
    await page.locator("#place-sheet-body .pp-timeline-btn").click();
    await expect(page.locator(".share-toast-action")).toContainText("Location is off");
    await expect(page.locator(".share-toast-action")).toContainText("Tap to turn on GPS");
    await page.locator(".share-toast-action").click();
    await expect.poll(() => page.evaluate(() => window.__timelineWatchCalls || 0)).toBe(1);
    await expect(page.locator("#place-sheet-body .pp-timeline-btn")).toHaveText("Added to timeline", { timeout: 5000 });
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
    await page.locator("#place-sheet-body .pp-timeline-btn").click();
    await page.locator(".share-toast-action").click();
    await expect(page.locator("#toast-stack .share-toast").filter({ hasText: "You’re about" })).toBeVisible();
    await expect(page.locator("#place-sheet-body .pp-timeline-btn")).toHaveCount(0, { timeout: 1000 });
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
      return document.querySelectorAll("#place-sheet-body .pp-timeline-btn").length;
    });
    expect(initialTimelineActionCount).toBe(0);
    await expect(page.locator("#place-sheet-body .pp-timeline-btn")).toHaveCount(0, { timeout: 10_000 });
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
    const actionButtons = page.locator("#place-sheet-body .pp-icon-row > button");
    await expect(page.locator("#place-sheet-body .pp-timeline-btn")).toHaveText("Add to timeline");
    await expect(actionButtons.nth(0)).toHaveAttribute("aria-label", "Add to timeline");
    expect(await actionButtons.nth(0).evaluate((button) => getComputedStyle(button).transitionProperty.split(",").map((property) => property.trim()))).toContain("width");
    const actionLayout = await actionButtons.evaluateAll((buttons) => buttons.slice(0, 3).map((button) => {
      const box = button.getBoundingClientRect();
      return { left: box.left, right: box.right, centerY: box.top + box.height / 2 };
    }));
    expect(actionLayout[1].left).toBeGreaterThanOrEqual(actionLayout[0].right);
    expect(actionLayout[2].left).toBeGreaterThanOrEqual(actionLayout[1].right);
    expect(Math.abs(actionLayout[1].centerY - actionLayout[0].centerY)).toBeLessThanOrEqual(1);
    expect(Math.abs(actionLayout[2].centerY - actionLayout[0].centerY)).toBeLessThanOrEqual(1);
    const categoryCenterY = await page.locator("#place-sheet-body .pp-badge").evaluate((badge) => {
      const box = badge.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    expect(Math.abs(actionLayout[0].centerY - categoryCenterY)).toBeLessThanOrEqual(3);
    expect(await actionButtons.nth(0).evaluate((button) => button.scrollWidth <= button.clientWidth + 1)).toBe(true);
    await page.locator("#place-sheet-body .pp-timeline-btn").click();
    await expect(page.locator("#place-sheet-body .pp-timeline-btn")).toHaveText("Added to timeline");
    await expect(page.locator("#place-sheet-body .pp-timeline-btn")).toHaveAttribute("data-state", "cooldown");
    await expect(page.locator("#place-sheet-body .pp-timeline-btn")).not.toBeDisabled();
    await page.locator("#place-sheet-body .pp-timeline-btn").click();
    await expect(page.locator(".snack-label", { hasText: "Already added to timeline" })).toBeVisible({ timeout: 3_000 });
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
    await page.locator(".pf-timeline-event-remove").click();
    await page.locator(".confirm-ok").click();
    await expect(page.locator(".pf-timeline-empty")).toBeVisible({ timeout: 10_000 });
    expect(requests.find((body) => body.action === "delete-verified-visit")).toMatchObject({ visitId: "visit-remove" });
  });
});
