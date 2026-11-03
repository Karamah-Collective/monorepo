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
    await expect(page.locator("#nav-hud .nav-hud-bar")).toBeHidden();
    await expect(page.locator("#nav-right-rail")).toBeVisible();
    await expect(page.locator("#nav-speed-value")).toHaveText("36");
    await expect.poll(async () => page.evaluate(async () => (await import("/src/map-init.js")).map.getBearing())).toBeGreaterThan(85);
    await expect.poll(async () => page.evaluate(async () => (await import("/src/map-init.js")).map.getBearing())).toBeLessThan(95);
    const followZoom = await page.evaluate(async () => {
      const { map } = await import("/src/map-init.js");
      return map.getZoom();
    });
    await page.evaluate(async () => {
      const { setCurrentLocationState } = await import("/src/utils.js");
      setCurrentLocationState({ lat: 60.1699, lng: 24.9411, accuracy: 5, speed: 10, heading: 90, timestamp: Date.now() });
      setCurrentLocationState({ lat: 60.1699, lng: 24.9414, accuracy: 5, speed: 10, heading: 90, timestamp: Date.now() + 200 });
    });
    await expect.poll(async () => page.evaluate(async () => (await import("/src/map-init.js")).map.getZoom())).toBeCloseTo(followZoom, 1);
    const anchor = await page.evaluate(async () => {
      const [{ map }, { getCurrentLocationState }] = await Promise.all([
        import("/src/map-init.js"),
        import("/src/utils.js"),
      ]);
      const location = getCurrentLocationState();
      const point = map.project([location.lng, location.lat]);
      return { y: point.y / map.getContainer().clientHeight };
    });
    expect(anchor.y).toBeCloseTo(0.70, 1);

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
    test.skip(await page.evaluate(() => window.innerWidth <= 768), "Phone routes open in the map page instead of the desktop directions sheet");
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
        }, {
          duration: 1020,
          distance: 16800,
          geometry: { type: "LineString", coordinates: [[24.9384, 60.1699], [24.9390, 60.1705], [24.9410, 60.1705], [24.9420, 60.1699]] },
          legs: [{ steps: [] }],
        }, {
          duration: 1080,
          distance: 17000,
          geometry: { type: "LineString", coordinates: [[24.9384, 60.1699], [24.9390, 60.1688], [24.9410, 60.1688], [24.9420, 60.1699]] },
          legs: [{ steps: [] }],
        }],
      },
    }));
    await page.evaluate(async () => {
      const { dir, findRoutesDirect } = await import("/src/directions.js");
      dir.origin = { lat: 60.1699, lng: 24.9384, name: "Start" };
      dir.dest = { lat: 60.1699, lng: 24.9420, name: "Destination" };
      await findRoutesDirect("drive");
    });
    await expect(page.locator("#route-snackbar")).toBeVisible();
    await expect(page.locator(".route-map-option")).toHaveCount(3);
    await page.locator(".route-map-option").nth(1).click();
    await expect(page.locator(".route-map-option.active")).toHaveAttribute("data-direct-idx", "1");
    await expect(page.locator(".direct-card.active")).toHaveAttribute("data-direct-idx", "1");
    await expect(page.locator("body")).toHaveClass(/route-preview-active/);
    await expect(page.locator("#dir-panel")).toHaveClass(/shut/);
    await page.locator(".snack-body").click();
    await expect(page.locator("#dir-panel")).not.toHaveClass(/shut/);
    await expect(page.locator("#dir-panel")).toHaveClass(/route-overview/);
    await expect(page.locator(".direct-card.active .itin-navigate span")).toHaveText("Start route");
    await expect(page.locator(".direct-card")).toHaveCount(3);
    await page.locator(".direct-card.active .direct-expand").click();
    await expect(page.locator("#dir-panel")).toHaveClass(/route-focused/);
    await expect(page.locator("#dir-focused-close")).toBeVisible();
    await page.locator("#dir-focused-close").click();
    await expect(page.locator("#dir-panel")).toHaveClass(/route-overview/);
    await page.locator("#dir-close").click();
    await expect(page.locator("#route-snackbar")).toBeVisible();
    await page.locator("#snackbar-nav").click();
    await expect(page.locator("body")).toHaveClass(/nav-mode/);
    await expect(page.locator("#nav-right-rail")).toBeVisible();
    await expect(page.locator("#tab-bar")).toBeHidden();
    await expect.poll(() => page.evaluate(async () => {
      const { dir } = await import("/src/directions.js");
      return dir.routeLayers.filter((id) => id.startsWith("dir-alt-")).length;
    })).toBe(0);
    await page.locator("#nav-stop").click();
    await expect(page.locator("body")).not.toHaveClass(/nav-mode/);
    await expect(page.locator("#route-snackbar")).toBeHidden();
  });

  test("phone route preview uses the bottom snackbar and route overview sheet", async ({ page }) => {
    await setupApp(page);
    test.skip(await page.evaluate(() => window.innerWidth > 768), "Phone-only route preview regression");
    await page.locator("#dir-btn").click();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "map");
    await page.route("**/api.digitransit.fi/**", (route) => route.fulfill({ status: 500, body: "disabled" }));
    await page.route("**/routing.openstreetmap.de/**", (route) => route.fulfill({
      json: {
        code: "Ok",
        routes: [{
          duration: 900,
          distance: 16000,
          geometry: { type: "LineString", coordinates: [[24.9384, 60.1699], [24.9400, 60.1699], [24.9420, 60.1699]] },
          legs: [{ steps: [] }],
        }],
      },
    }));
    await page.evaluate(async () => {
      const { dir, findRoutesDirect } = await import("/src/directions.js");
      dir.origin = { lat: 60.1699, lng: 24.9384, name: "Start" };
      dir.dest = { lat: 60.1699, lng: 24.9420, name: "Destination" };
      await findRoutesDirect("drive");
    });
    await expect(page.locator("#route-snackbar")).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/route-preview-active/);
    await expect(page.locator("#map-filter-carousel")).toHaveCSS("opacity", "0");
    await expect(page.locator("#tab-bar")).toHaveCSS("opacity", "0");
    await expect(page.locator("#locate-pill-wrap")).toHaveCSS("opacity", "0");
    const snackbarBottom = await page.locator("#route-snackbar").evaluate((el) => parseFloat(getComputedStyle(el).bottom));
    const tabHeight = await page.locator("#tab-bar").evaluate((el) => el.getBoundingClientRect().height);
    expect(snackbarBottom).toBeGreaterThanOrEqual(tabHeight);
    await page.locator(".snack-body").click();
    await expect(page.locator("#dir-panel")).toHaveClass(/route-overview/);
    await expect(page.locator(".direct-card.active .itin-navigate span")).toHaveText("Start route");
  });

  test("a new directions request removes the previous route state", async ({ page }) => {
    await setupApp(page);
    await page.evaluate(async () => {
      const { dir, resetDirectionsForNewRequest } = await import("/src/directions.js");
      dir.origin = { lat: 60.1699, lng: 24.9384, name: "Old origin" };
      dir.dest = { lat: 60.1710, lng: 24.9500, name: "Old destination" };
      dir._directAlts = [{ duration: 900, distance: 1000, coords: [[24.9384, 60.1699], [24.9500, 60.1710]] }];
      dir.directInfo = { mode: "drive", durMin: 15, distKm: "1.0" };
      document.getElementById("dir-from").value = "Old origin";
      document.getElementById("dir-to").value = "Old destination";
      document.body.classList.add("route-preview-active");
      resetDirectionsForNewRequest();
      return {
        origin: dir.origin,
        dest: dir.dest,
        alternatives: dir._directAlts,
        directInfo: dir.directInfo,
        from: document.getElementById("dir-from").value,
        to: document.getElementById("dir-to").value,
        preview: document.body.classList.contains("route-preview-active"),
      };
    }).then((state) => {
      expect(state.origin).toBeNull();
      expect(state.dest).toBeNull();
      expect(state.alternatives).toBeNull();
      expect(state.directInfo).toBeNull();
      expect(state.from).toBe("");
      expect(state.to).toBe("");
      expect(state.preview).toBe(false);
    });
  });

  test("course-up follows the road when the compass heading is noisy", async ({ page }) => {
    await setupApp(page);
    await page.evaluate(async () => {
      const [{ dir }, { startNavigation, stopNavigation }, { setCurrentLocationState }, { map }] = await Promise.all([
        import("/src/directions.js"),
        import("/src/navigation.js"),
        import("/src/utils.js"),
        import("/src/map-init.js"),
      ]);
      const base = { lat: 60.1699, lng: 24.9400 };
      dir._directAlts = [{
        coords: [[base.lng, base.lat], [base.lng + 0.01, base.lat]],
        steps: [{ maneuver: { type: "depart", bearing_after: 90 }, name: "Test road" }],
      }];
      dir.activeIdx = 0;
      dir._directMode = "drive";
      dir.origin = { ...base, name: "Current location" };
      dir.dest = { lat: base.lat, lng: base.lng + 0.01, name: "Destination" };
      setCurrentLocationState({ ...base, accuracy: 5, speed: 50, heading: 150, source: "sim", timestamp: Date.now() });
      startNavigation();
      window.__roadBearingMap = map;
      window.__stopRoadBearingNavigation = stopNavigation;
    });
    await expect.poll(() => page.evaluate(() => window.__roadBearingMap?.getBearing())).toBeGreaterThan(85);
    await expect.poll(() => page.evaluate(() => window.__roadBearingMap?.getBearing())).toBeLessThan(100);
    await page.evaluate(() => window.__stopRoadBearingNavigation());
  });

  test("rerouting does not take control of the navigation camera", async ({ page }) => {
    await setupApp(page);
    let osrmCalls = 0;
    await page.route("**/api.digitransit.fi/**", (route) => route.fulfill({ status: 500, body: "disabled" }));
    await page.route("**/routing.openstreetmap.de/**", (route) => {
      osrmCalls += 1;
      return route.fulfill({
      json: {
        code: "Ok",
        routes: [{
          duration: 900,
          distance: 16000,
          geometry: { type: "LineString", coordinates: [[24.9450, 60.1715], [24.9465, 60.1715], [24.9480, 60.1715]] },
          legs: [{ steps: [
            { distance: 8000, duration: 450, name: "Recalculated Street", geometry: { type: "LineString", coordinates: [[24.9450, 60.1715], [24.9465, 60.1715]] }, maneuver: { type: "depart", bearing_after: 90 } },
            { distance: 8000, duration: 450, name: "Destination Road", geometry: { type: "LineString", coordinates: [[24.9465, 60.1715], [24.9480, 60.1715]] }, maneuver: { type: "arrive", modifier: "right" } },
          ] }],
        }],
      },
      });
    });
    await page.evaluate(async () => {
      const [{ dir }, { startNavigation }, { setCurrentLocationState }, { map }] = await Promise.all([
        import("/src/directions.js"),
        import("/src/navigation.js"),
        import("/src/utils.js"),
        import("/src/map-init.js"),
      ]);
      dir._directAlts = [{
        coords: [[24.9384, 60.1699], [24.9400, 60.1699], [24.9420, 60.1699]],
        steps: [{ maneuver: { type: "depart", bearing_after: 90 }, name: "Start" }],
      }];
      dir.activeIdx = 0;
      dir._directMode = "drive";
      dir.origin = { lat: 60.1699, lng: 24.9384, name: "Start" };
      dir.dest = { lat: 60.1715, lng: 24.9480, name: "Destination" };
      window.__rerouteTrace = { fitBounds: 0, zoomStarts: 0, zoomEnds: 0 };
      const fitBounds = map.fitBounds.bind(map);
      map.fitBounds = (...args) => { window.__rerouteTrace.fitBounds += 1; return fitBounds(...args); };
      map.on("zoomstart", () => { window.__rerouteTrace.zoomStarts += 1; });
      map.on("zoomend", () => { window.__rerouteTrace.zoomEnds += 1; });
      setCurrentLocationState({ lat: 60.1699, lng: 24.9400, accuracy: 5, speed: 25, heading: 90, source: "sim", timestamp: Date.now() });
      startNavigation();
      window.__rerouteTrace = { fitBounds: 0, zoomStarts: 0, zoomEnds: 0 };
      setCurrentLocationState({ lat: 60.1715, lng: 24.9440, accuracy: 5, speed: 25, heading: 90, source: "sim", timestamp: Date.now() + 1000 });
      setCurrentLocationState({ lat: 60.1715, lng: 24.9440, accuracy: 5, speed: 25, heading: 90, source: "sim", timestamp: Date.now() + 2000 });
    });
    await expect.poll(() => osrmCalls).toBe(1);
    await expect.poll(() => page.locator("#nav-status").textContent()).toBe("Following route");
    const trace = await page.evaluate(() => window.__rerouteTrace);
    expect(trace.fitBounds).toBe(0);
    expect(trace.zoomStarts).toBe(0);
    expect(trace.zoomEnds).toBe(0);
  });

  test("Shift+G toggles the local GPS simulator and exposes deterministic position control", async ({ page }) => {
    await setupApp(page);
    await page.keyboard.press("Shift+G");
    await expect(page.locator("#gps-sim-badge")).not.toHaveClass(/hide/);
    await expect(page.locator("#gps-sim-move")).toBeVisible();
    await page.locator("#gps-sim-speed").selectOption("90");
    await page.locator("#gps-sim-move").click();
    await expect.poll(() => page.evaluate(() => window.__manarahGpsSim.isMoving())).toBe(true);
    await page.locator("#gps-sim-move").click();
    await expect.poll(() => page.evaluate(() => window.__manarahGpsSim.isMoving())).toBe(false);
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
    await page.evaluate(() => window.__manarahGpsSim.stopMovement());
    await page.keyboard.press("Shift+G");
    await expect(page.locator("#gps-sim-badge")).toHaveClass(/hide/);
  });

  test("GPS movement simulator advances along a route at the selected speed", async ({ page }) => {
    await setupApp(page);
    await page.keyboard.press("Shift+G");
    const start = await page.evaluate(async () => {
      const { getCurrentLocationState } = await import("/src/utils.js");
      return getCurrentLocationState();
    });
    await page.evaluate(({ lat, lng }) => window.__manarahGpsSim.startMovement({
      speed: 90,
      path: [[lng, lat], [lng + 0.002, lat]],
      loop: true,
    }), start);
    await page.waitForTimeout(700);
    const state = await page.evaluate(async () => {
      const [{ getCurrentLocationState }, sim] = await Promise.all([
        import("/src/utils.js"),
        Promise.resolve(window.__manarahGpsSim),
      ]);
      return { location: getCurrentLocationState(), moving: sim.isMoving() };
    });
    expect(state.moving).toBe(true);
    expect(state.location.lng).toBeGreaterThan(start.lng);
    expect(state.location.speed).toBeGreaterThan(15);
    await page.evaluate(() => window.__manarahGpsSim.stop());
  });

  test("navigation keeps the simulated puck at the OsmAnd bottom anchor", async ({ page }) => {
    await setupApp(page);
    await page.keyboard.press("Shift+G");
    await page.evaluate(async () => {
      const [{ dir }, { startNavigation }, { getCurrentLocationState, setCurrentLocationState }, { map }] = await Promise.all([
        import("/src/directions.js"),
        import("/src/navigation.js"),
        import("/src/utils.js"),
        import("/src/map-init.js"),
      ]);
      const current = getCurrentLocationState();
      const route = [
        [current.lng, current.lat],
        [current.lng + 0.01, current.lat],
      ];
      dir._directAlts = [{
        coords: route,
        steps: [{ maneuver: { type: "depart", bearing_after: 90 }, name: "Test road" }],
      }];
      dir.activeIdx = 0;
      dir._directMode = "drive";
      dir.origin = { lat: current.lat, lng: current.lng, name: "Current location" };
      dir.dest = { lat: current.lat, lng: current.lng + 0.01, name: "Destination" };
      setCurrentLocationState({ ...current, speed: 25, heading: 90, source: "sim", timestamp: Date.now() });
      startNavigation();
      window.__navigationPuckMap = map;
      window.__manarahGpsSim.startMovement({ speed: 90, path: route, loop: true });
    });
    await page.waitForTimeout(900);
    const anchor = await page.evaluate(() => {
      const map = window.__navigationPuckMap;
      const mapRect = map.getContainer().getBoundingClientRect();
      const puckRect = document.querySelector(".gps-sim-marker")?.getBoundingClientRect();
      return {
        x: puckRect ? (puckRect.left + puckRect.width / 2 - mapRect.left) / mapRect.width : -1,
        y: puckRect ? (puckRect.top + puckRect.height / 2 - mapRect.top) / mapRect.height : -1,
      };
    });
    expect(anchor.x).toBeCloseTo(0.5, 1);
    expect(anchor.y).toBeCloseTo(0.70, 1);
    await page.evaluate(() => window.__manarahGpsSim.stop());
  });

  test("course-up falls back to the direction of GPS movement", async ({ page }) => {
    await setupApp(page);
    await page.evaluate(async () => {
      const [{ dir }, { startNavigation, stopNavigation }, { setCurrentLocationState }, { map }] = await Promise.all([
        import("/src/directions.js"),
        import("/src/navigation.js"),
        import("/src/utils.js"),
        import("/src/map-init.js"),
      ]);
      const base = { lat: 60.1699, lng: 24.9400 };
      dir._directAlts = [{
        coords: [[base.lng, base.lat], [base.lng + 0.01, base.lat]],
        steps: [{ maneuver: { type: "depart", bearing_after: 90 }, name: "Test road" }],
      }];
      dir.activeIdx = 0;
      dir._directMode = "drive";
      dir.origin = { ...base, name: "Current location" };
      dir.dest = { lat: base.lat, lng: base.lng + 0.01, name: "Destination" };
      const offRoute = { ...base, lat: base.lat + 0.002 };
      setCurrentLocationState({ ...offRoute, accuracy: 5, speed: null, heading: null, source: "sim", timestamp: Date.now() });
      startNavigation();
      dir.dest = null;
      await new Promise((resolve) => setTimeout(resolve, 300));
      setCurrentLocationState({ ...offRoute, lng: offRoute.lng + 0.00012, accuracy: 5, speed: null, heading: null, source: "sim", timestamp: Date.now() });
      await new Promise((resolve) => setTimeout(resolve, 300));
      setCurrentLocationState({ ...offRoute, lng: offRoute.lng + 0.00024, accuracy: 5, speed: null, heading: null, source: "sim", timestamp: Date.now() });
      window.__movementFallbackMap = map;
      window.__stopMovementFallbackNavigation = stopNavigation;
    });
    await expect.poll(() => page.evaluate(() => window.__movementFallbackMap?.getBearing())).toBeGreaterThan(80);
    await expect.poll(() => page.evaluate(() => window.__movementFallbackMap?.getBearing())).toBeLessThan(100);
    await page.evaluate(() => window.__stopMovementFallbackNavigation());
  });
});
