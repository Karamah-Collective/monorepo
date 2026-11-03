const { test, expect, setupApp } = require("./helpers");

test.describe("Live navigation", () => {
  test("keeps the puck-follow HUD and manual recenter state separate", async ({ page }) => {
    await setupApp(page);
    await page.evaluate(async () => {
      Object.defineProperty(navigator, "permissions", {
        configurable: true,
        value: { query: async () => ({ state: "granted" }) },
      });
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          watchPosition: (onPosition) => {
            setTimeout(() => onPosition({
              coords: { latitude: 60.1699, longitude: 24.9408, accuracy: 5, speed: 10, heading: 90 },
              timestamp: Date.now(),
            }), 0);
            return 7;
          },
          clearWatch: () => {},
        },
      });
      const [{ dir }, { startNavigation, stopNavigation }, utils] = await Promise.all([
        import("/src/directions.js"),
        import("/src/navigation.js"),
        import("/src/utils.js"),
      ]);
      dir._directAlts = [{
        coords: [[24.9384, 60.1699], [24.9400, 60.1699], [24.9420, 60.1699]],
        steps: [
          { maneuver: { type: "depart", bearing_after: 90 }, name: "Start" },
          { maneuver: { type: "turn", modifier: "right" }, name: "Main Street" },
        ],
        stepGeometries: [
          { coordinates: [[24.9384, 60.1699], [24.9400, 60.1699]] },
          { coordinates: [[24.9400, 60.1699], [24.9420, 60.1699]] },
        ],
      }];
      dir.activeIdx = 0;
      dir._directMode = "drive";
      dir.dest = { lat: 60.1699, lng: 24.9420, name: "Destination" };
      utils.setCurrentLocationState({ lat: 60.1699, lng: 24.9408, accuracy: 5, speed: 10, heading: 90, timestamp: Date.now() });
      window.__navigationStarted = startNavigation();
      window.__stopNavigation = stopNavigation;
    });
    await expect.poll(() => page.evaluate(() => window.__navigationStarted)).toBe(true);
    await expect(page.locator("body")).toHaveClass(/nav-mode/);
    await expect(page.locator("#nav-hud")).not.toHaveClass(/hide/);
    await expect(page.locator("#nav-speed")).not.toHaveClass(/hide/);
    await expect(page.locator("#nav-speed-value")).toHaveText("36");

    await page.evaluate(async () => {
      const { map } = await import("/src/map-init.js");
      map.fire("dragstart", { originalEvent: {} });
    });
    await expect(page.locator("#nav-recenter")).toHaveAttribute("aria-pressed", "false");
    await page.locator("#nav-recenter").click();
    await expect(page.locator("#nav-recenter")).toHaveAttribute("aria-pressed", "true");

    await page.evaluate(() => window.__stopNavigation());
    await expect(page.locator("body")).not.toHaveClass(/nav-mode/);
    await expect(page.locator("#nav-hud")).toHaveClass(/hide/);
  });

  test("route cards expose a direct start-navigation action", async ({ page }) => {
    await setupApp(page);
    await page.locator("#dir-btn").click();
    await expect(page.locator("#dir-panel")).not.toHaveClass(/shut/);
    await page.route("**/api.digitransit.fi/**", (route) => route.fulfill({ status: 500, body: "disabled" }));
    await page.route("**/routing.openstreetmap.de/**", (route) => route.fulfill({
      json: {
        code: "Ok",
        routes: [{
          duration: 900,
          distance: 16000,
          geometry: { type: "LineString", coordinates: [[24.9384, 60.1699], [24.9400, 60.1699], [24.9420, 60.1699]] },
          legs: [{ steps: [
            { distance: 8000, duration: 450, name: "Start Street", geometry: { type: "LineString", coordinates: [[24.9384, 60.1699], [24.9400, 60.1699]] }, maneuver: { type: "depart", bearing_after: 90 } },
            { distance: 8000, duration: 450, name: "Destination Road", geometry: { type: "LineString", coordinates: [[24.9400, 60.1699], [24.9420, 60.1699]] }, maneuver: { type: "arrive", modifier: "right" } },
          ] }],
        }],
      },
    }));
    await page.evaluate(async () => {
      const { dir, findRoutesDirect } = await import("/src/directions.js");
      dir.origin = { lat: 60.1699, lng: 24.9384, name: "Start" };
      dir.dest = { lat: 60.1699, lng: 24.9420, name: "Destination" };
      await findRoutesDirect("drive");
    });
    await expect(page.locator(".direct-card.active .itin-navigate")).toBeVisible();
    await page.locator(".direct-card.active .itin-navigate").click();
    await expect(page.locator("body")).toHaveClass(/nav-mode/);
  });

  test("Shift+G toggles the local GPS simulator and exposes deterministic position control", async ({ page }) => {
    await setupApp(page);
    await page.keyboard.press("Shift+G");
    await expect(page.locator("#gps-sim-badge")).not.toHaveClass(/hide/);
    await page.evaluate(() => window.__manarahGpsSim.setLocation(60.1705, 24.9415, 4));
    const state = await page.evaluate(async () => {
      const [{ getCurrentLocationState }, sim] = await Promise.all([
        import("/src/utils.js"),
        Promise.resolve(window.__manarahGpsSim),
      ]);
      return { location: getCurrentLocationState(), active: sim.isActive() };
    });
    expect(state.active).toBe(true);
    expect(state.location).toMatchObject({ lat: 60.1705, lng: 24.9415, accuracy: 4, source: "sim" });
    await page.keyboard.press("Shift+G");
    await expect(page.locator("#gps-sim-badge")).toHaveClass(/hide/);
  });
});
