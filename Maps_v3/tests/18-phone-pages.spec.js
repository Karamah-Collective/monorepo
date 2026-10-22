const { test, expect, setupApp } = require("./helpers");

test.describe("Phone app pages", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    test.skip((await page.evaluate(() => window.innerWidth)) > 768, "phone-only navigation");
  });

  test("fresh phone launch opens Home with persistent navigation", async ({ page }) => {
    await expect(page.locator("#phone-home-page")).toBeVisible();
    await expect(page.locator("#phone-home-greeting")).toHaveText("Assalamu'Alaikum");
    await expect(page.locator("#phone-home-title")).toBeHidden();
    await expect(page.locator("#phone-prayer-state")).toBeVisible();
    await expect(page.locator("#tab-bar")).toBeVisible();
    await expect(page.locator("#events-overlay")).toBeHidden();
    await expect(page.locator("#timeline-overlay")).toBeHidden();
    await expect(page.locator("#home-btn")).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#dir-btn")).toHaveAttribute("aria-label", "Maps");
    await expect(page.locator("#dir-tab-map-icon")).toBeVisible();
    await expect(page.locator("#dir-tab-route-icon")).toBeHidden();
    await expect(page.locator(".phone-primary-action svg")).toHaveCount(2);
    await expect(page.locator(".phone-action-grid button svg")).toHaveCount(4);
    await expect(page.locator("#phone-home-greeting")).toHaveCSS("font-family", /Roboto Mono|monospace/);
    await expect(page.locator("#phone-home-greeting")).toHaveCSS("direction", "ltr");
  });

  test("Home switches to nearby places and renders event dates", async ({ page }) => {
    await page.route("**/api.digitransit.fi/geocoding/v1/reverse**", (route) =>
      route.fulfill({ json: { features: [{ properties: { locality: "Helsinki" } }] } }));
    await page.evaluate(async () => {
      const utils = await import("/src/utils.js");
      const data = window.HFPhoneData;
      window.HFPhoneData = {
        getPlaces: data.getPlaces,
        getEvents: () => [{ id: "dated-event", title: "Dated event", date: "2099-10-21", time: "18:30" }],
        status: "ready",
      };
      window.dispatchEvent(new Event("hf:places-data-ready"));
      utils.setCurrentLocationState({ lat: 60.17, lng: 24.94, accuracy: 10 });
    });
    await expect(page.locator("#phone-suggested-title")).toHaveText("Nearby");
    const nearbyCard = page.locator("#phone-suggested-places .phone-home-place--nearby").first();
    await expect(nearbyCard).toBeVisible();
    const footerAlignment = await nearbyCard.evaluate((card) => {
      const city = card.querySelector(".phone-home-place-meta").getBoundingClientRect();
      const arrow = card.querySelector(".phone-home-place-arrow").getBoundingClientRect();
      return Math.abs((city.top + city.height / 2) - (arrow.top + arrow.height / 2));
    });
    expect(footerAlignment).toBeLessThanOrEqual(1);
    await expect(page.locator("#phone-week-events .phone-home-event-date")).toHaveText("21 Oct");
    await page.evaluate(async () => (await import("/src/utils.js")).clearCurrentLocationState());
    await expect(page.locator("#phone-suggested-title")).toHaveText("Suggested");
  });

  test("navbar active pill moves with the selected destination", async ({ page }) => {
    const pill = page.locator("#tab-active-pill");
    await expect(pill).toBeVisible();
    const navStyle = await page.locator("#tab-bar").evaluate((element) => {
      const style = getComputedStyle(element);
      return { height: parseFloat(style.height), radius: parseFloat(style.borderTopLeftRadius) };
    });
    const pillStyle = await pill.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: parseFloat(style.width), height: parseFloat(style.height), after: getComputedStyle(element, "::after").content };
    });
    expect(navStyle.height).toBeGreaterThan(40);
    expect(navStyle.radius).toBeGreaterThan(18);
    expect(pillStyle.width).toBeGreaterThan(pillStyle.height);
    expect(pillStyle.after).toMatch(/none|normal/);
    const homeTransform = await pill.evaluate((element) => getComputedStyle(element).transform);
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-btn")).toHaveAttribute("aria-current", "page");
    await expect.poll(() => pill.evaluate((element) => getComputedStyle(element).transform)).not.toBe(homeTransform);
    await expect(page.locator("#places-btn .tab-icon-core")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.waitForTimeout(450);
    const scaledAlignment = await page.evaluate(() => {
      const zone = document.querySelector("#phone-chrome-bottom-zone");
      zone.style.setProperty("transform", "translateX(-50%) scale(.84)", "important");
      window.dispatchEvent(new Event("resize"));
      const tab = document.querySelector("#places-btn").getBoundingClientRect();
      const activePill = document.querySelector("#tab-active-pill").getBoundingClientRect();
      return Math.abs((activePill.left + activePill.width / 2) - (tab.left + tab.width / 2));
    });
    expect(scaledAlignment).toBeLessThan(2);
  });

  test("map search starts with directory places and opts into the wider map", async ({ page }) => {
    await page.locator("#dir-btn").click();
    await page.route("https://nominatim.openstreetmap.org/**", async (route) => {
      await route.fulfill({ json: [{ lat: "60.17", lon: "24.94", display_name: "Helsinki, Finland", type: "city", class: "place" }] });
    });
    await page.locator("#search-pill").click();
    await expect(page.locator("#search-drop")).not.toHaveClass(/hide/);
    await expect(page.locator("#results-list .r-local")).toHaveCount(4);
    await expect(page.locator("#results-list [data-search-scope='external']")).toContainText("Search the wider map");
    await page.locator("#results-list [data-search-scope='external']").click();
    await page.locator("#search-input").fill("Helsinki");
    await page.waitForTimeout(450);
    await expect(page.locator("#results-list li[data-search-scope='directory']")).toContainText("Search directory places");
    await expect(page.locator("#results-list .r-local")).toHaveCount(0);
  });

  test("all five destinations become full pages with one active nav item", async ({ page }) => {
    for (const [id, pageName] of [
      ["home-btn", "home"],
      ["dir-btn", "map"],
      ["places-btn", "places"],
      ["events-nav-btn", "events"],
      ["menu-pill", "profile"],
    ]) {
      await page.locator(`#${id}`).click();
      await expect(page.locator("body")).toHaveAttribute("data-phone-page", pageName);
      await expect(page.locator(`#${id}`)).toHaveAttribute("aria-current", "page");
      await expect(page.locator("#tab-bar .tab[aria-current='page']")).toHaveCount(1);
    }
  });

  test("page surfaces do not use bottom-enter transitions and can scroll", async ({ page }) => {
    for (const id of ["places-btn", "events-nav-btn", "menu-pill"]) {
      await page.locator(`#${id}`).click();
      const surface = id === "places-btn" ? "#places-sheet" : id === "events-nav-btn" ? "#events-overlay" : "#profile-sheet";
      await expect(page.locator(surface)).toBeVisible();
      const state = await page.locator(surface).evaluate((element) => {
        const style = getComputedStyle(element);
        return { transition: style.transition, overflowX: style.overflowX };
      });
      expect(state.transition).toBe("none");
      expect(state.overflowX).toBe("hidden");
      await page.locator("#home-btn").click();
    }
    await page.locator("#events-nav-btn").click();
    const eventScroll = await page.evaluate(() => ({
      surface: getComputedStyle(document.querySelector("#events-overlay")).overflowY,
      content: getComputedStyle(document.querySelector("#events-list")).overflowY,
    }));
    expect(eventScroll.surface).toBe("hidden");
    expect(eventScroll.content).toBe("auto");
    const overflow = await page.evaluate(() => ({
      body: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.body).toBeLessThanOrEqual(overflow.viewport);
  });

  test("Home suggestions use a horizontal carousel and page scrolling resizes the nav", async ({ page }) => {
    const carousel = await page.locator("#phone-suggested-places").evaluate((element) => {
      const style = getComputedStyle(element);
      return { display: style.display, overflowX: style.overflowX, snap: style.scrollSnapType };
    });
    expect(carousel).toEqual({ display: "flex", overflowX: "auto", snap: "x mandatory" });

    await page.locator("#places-btn").click();
    const places = page.locator("#places-scroll");
    const initialActionBarClearance = await page.locator("#places-scroll").evaluate((element) =>
      parseFloat(element.style.getPropertyValue("--phone-places-actionbar-clearance")),
    );
    expect(initialActionBarClearance).toBeGreaterThan(0);
    const topGeometry = await page.evaluate(() => {
      const actionBar = document.querySelector("#places-filters").getBoundingClientRect();
      const city = document.querySelector("#places-list .pl-city-hdr")?.getBoundingClientRect();
      return { actionBarBottom: actionBar.bottom, cityTop: city?.top ?? 0 };
    });
    expect(topGeometry.cityTop).toBeGreaterThanOrEqual(topGeometry.actionBarBottom - 1);
    const placesLayoutBefore = await page.evaluate(() => ({
      scrollTop: document.querySelector("#places-scroll").getBoundingClientRect().top,
    }));
    await places.evaluate((element) => {
      element.scrollTop = 240;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(220);
    const compactScale = await page.locator("#phone-chrome-bottom-zone").evaluate((element) => parseFloat(element.style.getPropertyValue("--phone-page-nav-scale")));
    expect(compactScale).toBeGreaterThanOrEqual(0.84);
    expect(compactScale).toBeLessThan(1);
    await expect.poll(() => page.locator("#places-filters").evaluate((element) => getComputedStyle(element).transition), { timeout: 1000 }).toContain("transform");
    const actionBarState = await page.evaluate(() => {
      const bar = document.querySelector("#places-filters");
      const scroll = document.querySelector("#places-scroll");
      const city = document.querySelector("#places-list .phone-places-city-active");
      const nonActiveCityPositions = [...document.querySelectorAll("#places-list > .pl-city-hdr:not(.phone-places-city-active)")]
        .map((element) => getComputedStyle(element).position);
      const style = getComputedStyle(bar);
      return {
        progress: parseFloat(bar.style.getPropertyValue("--phone-places-actionbar-progress")),
        clearance: parseFloat(scroll.style.getPropertyValue("--phone-places-actionbar-clearance")),
        cityTransform: city ? getComputedStyle(city).transform : "none",
        cityPosition: city ? getComputedStyle(city).position : "none",
        nonActiveCityPositions,
        opacity: parseFloat(style.opacity),
        transition: style.transition,
        scrollTop: scroll.getBoundingClientRect().top,
      };
    });
    expect(actionBarState.progress).toBeGreaterThan(0);
    expect(actionBarState.clearance).toBeLessThan(initialActionBarClearance);
    expect(actionBarState.cityTransform).not.toBe("none");
    expect(actionBarState.cityPosition).toBe("sticky");
    expect(actionBarState.nonActiveCityPositions.every((position) => position === "static")).toBe(true);
    expect(actionBarState.opacity).toBe(1);
    expect(actionBarState.transition).toContain("transform");
    expect(actionBarState.scrollTop).toBeCloseTo(placesLayoutBefore.scrollTop, 1);
    await places.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(220);
    expect(await page.locator("#phone-chrome-bottom-zone").evaluate((element) => parseFloat(element.style.getPropertyValue("--phone-page-nav-scale")))).toBe(1);
    expect(await page.locator("#places-filters").evaluate((element) => parseFloat(element.style.getPropertyValue("--phone-places-actionbar-progress")))).toBe(0);
  });

  test("Home and Events use scroll-linked page chrome", async ({ page }) => {
    const home = page.locator("#phone-home-page");
    await home.evaluate((element) => {
      element.scrollTop = 48;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(80);
    const homeMotion = await home.evaluate((element) => ({
      shift: parseFloat(element.style.getPropertyValue("--phone-home-header-shift")),
      opacity: parseFloat(element.style.getPropertyValue("--phone-home-header-opacity")),
    }));
    expect(homeMotion.shift).toBeLessThan(0);
    expect(homeMotion.opacity).toBeLessThan(1);

    await page.locator("#events-nav-btn").click();
    const events = page.locator("#events-list");
    await events.evaluate((element) => {
      element.style.flex = "0 0 240px";
      element.style.height = "240px";
      element.querySelector("#ev-filtered-list").style.minHeight = "480px";
    });
    await events.evaluate((element) => {
      element.scrollTop = 240;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(500);
    const eventsMotion = await events.evaluate((element) => ({
      progress: parseFloat(element.querySelector("#ev-filter-bar").style.getPropertyValue("--phone-places-actionbar-progress")),
      transform: getComputedStyle(element.querySelector("#ev-filter-bar")).transform,
      transition: getComputedStyle(element.querySelector("#ev-filter-bar")).transition,
    }));
    expect(eventsMotion.progress).toBe(1);
    expect(eventsMotion.transform).not.toBe("none");
    expect(eventsMotion.transition).toContain("transform");
    await events.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(500);
    expect(await page.locator("#ev-filter-bar").evaluate((element) =>
      parseFloat(element.style.getPropertyValue("--phone-places-actionbar-progress")),
    )).toBe(0);
  });

  test("Map, Home, and Events carousels use edge-to-edge scrolling rails", async ({ page }) => {
    const viewportWidth = await page.evaluate(() => innerWidth);
    const expectEdgeRail = async (locator) => {
      await expect.poll(async () => (await locator.boundingBox())?.x ?? -1).toBeLessThan(1);
      await expect.poll(async () => {
        const box = await locator.boundingBox();
        return box ? box.x + box.width : 0;
      }).toBeGreaterThan(viewportWidth - 1);
    };
    const homeRail = await page.locator("#phone-suggested-places").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { left: rect.left, right: rect.right, paddingLeft: parseFloat(style.paddingLeft) };
    });
    expect(homeRail.left).toBe(0);
    expect(homeRail.right).toBeCloseTo(viewportWidth, 0);
    expect(homeRail.paddingLeft).toBeGreaterThan(0);

    await page.locator("#events-nav-btn").click();
    const eventRailLocator = page.locator("#ev-filter-bar .phone-edge-carousel");
    await expectEdgeRail(eventRailLocator);
    const eventRail = await eventRailLocator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, paddingLeft: parseFloat(getComputedStyle(element).paddingLeft) };
    });
    expect(eventRail.left).toBe(0);
    expect(eventRail.right).toBeCloseTo(viewportWidth, 0);
    expect(eventRail.paddingLeft).toBeGreaterThan(0);

    await page.locator("#dir-btn").click();
    const mapRailLocator = page.locator("#map-filter-chips");
    await expectEdgeRail(mapRailLocator);
    const mapRail = await mapRailLocator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { left: rect.left, right: rect.right, paddingLeft: parseFloat(style.paddingLeft), background: style.backgroundColor, border: style.borderTopWidth };
    });
    expect(mapRail.left).toBe(0);
    expect(mapRail.right).toBeCloseTo(viewportWidth, 0);
    expect(mapRail.paddingLeft).toBeGreaterThan(0);
    expect(mapRail.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(mapRail.border).toBe("0px");
  });

  test("Places action bar snaps without changing list geometry", async ({ page }) => {
    await page.locator("#places-btn").click();
    const places = page.locator("#places-scroll");
    const initialPadding = await page.locator("#places-list").evaluate((element) => getComputedStyle(element).paddingTop);

    await places.evaluate((element) => {
      element.scrollTop = 12;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(260);
    expect(await page.locator("#places-filters").evaluate((element) => parseFloat(element.style.getPropertyValue("--phone-places-actionbar-progress")))).toBe(0);
    expect(await page.locator("#places-list").evaluate((element) => getComputedStyle(element).paddingTop)).toBe(initialPadding);

    await places.evaluate((element) => {
      element.scrollTop = 240;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(500);
    const collapsedState = await page.evaluate(() => ({
      padding: getComputedStyle(document.querySelector("#places-list")).paddingTop,
      progress: parseFloat(document.querySelector("#places-filters").style.getPropertyValue("--phone-places-actionbar-progress")),
      transition: getComputedStyle(document.querySelector("#places-filters")).transition,
    }));
    expect(collapsedState.padding).toBe(initialPadding);
    expect(collapsedState.progress).toBe(1);
    expect(collapsedState.transition).toContain("transform");

    await places.evaluate((element) => {
      element.scrollTop = 228;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(260);
    expect(await page.locator("#places-filters").evaluate((element) => parseFloat(element.style.getPropertyValue("--phone-places-actionbar-progress")))).toBe(1);
    expect(await page.locator("#places-list").evaluate((element) => getComputedStyle(element).paddingTop)).toBe(initialPadding);

    await places.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(500);
    expect(await page.locator("#places-filters").evaluate((element) => parseFloat(element.style.getPropertyValue("--phone-places-actionbar-progress")))).toBe(0);
    expect(await page.locator("#places-list").evaluate((element) => getComputedStyle(element).paddingTop)).toBe(initialPadding);
  });

  test("phone page sections reveal on entry without a scroll repaint loop", async ({ page }) => {
    const firstReveal = page.locator("#phone-home-page .phone-scroll-reveal").first();
    await expect(firstReveal).toHaveClass(/is-visible/);
    const state = await firstReveal.evaluate((element) => ({
      transition: getComputedStyle(element).transition,
      willChange: getComputedStyle(element).willChange,
    }));
    expect(state.transition).toContain("opacity");
    expect(state.willChange).not.toContain("box-shadow");
  });

  test("Places and Profile use page-first phone chrome", async ({ page }) => {
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-close")).toBeHidden();
    await expect(page.locator("#places-list-focus")).toBeHidden();
    const firstPlace = page.locator("#places-list li[data-place-id]").first();
    await expect(firstPlace).toBeVisible({ timeout: 15_000 });
    await expect(firstPlace.locator(".pl-dir-btn")).toBeHidden();
    await expect(firstPlace.locator(".pl-open-arrow")).toBeVisible();
    await expect(firstPlace.locator(".pl-card-status")).toBeHidden();
    expect(await firstPlace.locator(".pl-meta .pl-tags-summary, .pl-meta .pl-dist, .pl-meta .pl-rating-chip").count()).toBeGreaterThan(0);
    expect(await firstPlace.locator(".pl-meta .pl-open-chip, .pl-meta .pl-closed-chip").count()).toBe(1);
    expect(await firstPlace.evaluate((element) => getComputedStyle(element).gridTemplateRows.trim().split(/\s+/).length)).toBe(3);
    const placesStack = await page.evaluate(() => ({
      actionBar: Number.parseInt(getComputedStyle(document.querySelector("#places-filters")).zIndex, 10),
      city: Number.parseInt(getComputedStyle(document.querySelector("#places-list .pl-city-hdr")).zIndex, 10),
      sort: Number.parseInt(getComputedStyle(document.querySelector("#sort-dropdown")).zIndex, 10),
    }));
    expect(placesStack.actionBar).toBeGreaterThan(placesStack.city);
    expect(placesStack.sort).toBeGreaterThan(placesStack.actionBar);
    await page.locator("#menu-pill").click();
    await expect(page.locator("#phone-profile-auth")).toBeVisible();
    await expect(page.locator("#phone-profile-auth #menu-google-signin")).toBeVisible({ timeout: 15_000 });
  });

  test("Places search and filters remain interactive inside the page", async ({ page }) => {
    await page.locator("#places-btn").click();
    const firstName = await page.locator("#places-list .pl-card .pl-name").first().textContent();
    await page.locator("#pl-search-icn-btn").click();
    await expect(page.locator("#pl-search-input")).toBeVisible();
    await page.locator("#pl-search-input").fill(firstName.trim().slice(0, 6));
    await expect(page.locator("#places-list .pl-card").first()).toBeVisible();
    const filterMotion = await page.evaluate(() => {
      document.querySelector('.pf-chip[data-type="space"]').click();
      const scroll = document.querySelector("#places-scroll");
      const list = document.querySelector("#places-list");
      return {
        className: scroll.className,
        direction: scroll.dataset.phoneFilterDirection,
        animationName: getComputedStyle(list).animationName,
      };
    });
    await expect(page.locator('.pf-chip[data-type="space"]')).toHaveClass(/active/);
    expect(filterMotion.direction).toMatch(/forward|back/);
    expect(filterMotion.className).toMatch(/places-filter-slide-forward|places-filter-slide-back/);
    expect(filterMotion.animationName).toContain("phone-places-list-slide");
  });

  test("Places keeps refinement controls and anchors empty results below them", async ({ page }) => {
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-list .pl-card").first()).toBeVisible({ timeout: 15_000 });
    await page.locator("#pl-search-icn-btn").click();
    await page.locator("#pl-search-input").fill("zzzz-no-match");
    await expect(page.locator("#places-empty")).not.toHaveClass(/hide/);
    await expect(page.locator("#tf-row")).not.toHaveClass(/hide/);
    await expect(page.locator("#tf-toggle")).not.toHaveClass(/hide/);
    const geometry = await page.evaluate(() => {
      const filters = document.querySelector("#places-filters").getBoundingClientRect();
      const empty = document.querySelector("#places-empty").getBoundingClientRect();
      return {
        gap: empty.top - filters.bottom,
        listPaddingTop: getComputedStyle(document.querySelector("#places-list")).paddingTop,
      };
    });
    expect(geometry.gap).toBeGreaterThanOrEqual(0);
    expect(geometry.gap).toBeLessThan(32);
    expect(geometry.listPaddingTop).toBe("0px");
  });

  test("Saved places use one aligned card section", async ({ page }) => {
    await page.locator("#places-btn").click();
    await expect(page.locator("#places-list .pl-card").first()).toBeVisible({ timeout: 15_000 });
    const firstBookmark = page.locator("#places-list .pl-fav-btn").first();
    await firstBookmark.evaluate((element) => element.click());
    await page.locator('.pf-chip[data-type="saved"]').click();
    await expect(page.locator("#places-list .pl-saved-section-hdr")).toHaveCount(1);
    expect(await page.locator("#places-list .pl-saved-section-hdr").evaluate((element) => getComputedStyle(element).position)).toBe("static");
    await expect(page.locator("#places-list .pl-saved-section-hdr + .pl-city-group-body .pl-city-hdr")).toHaveCount(0);
    await expect(page.locator("#places-list .pl-saved-section-hdr + .pl-city-group-body .pl-card").first()).toBeVisible();
  });

  test("Saved sections stay independent when Bookmarks collapses", async ({ page }) => {
    await page.locator("#places-btn").click();
    const firstPlace = page.locator("#places-list .pl-card").first();
    await expect(firstPlace).toBeVisible({ timeout: 15_000 });
    const placeId = await firstPlace.getAttribute("data-place-id");
    await page.evaluate((id) => {
      localStorage.setItem("hf_favs", JSON.stringify([id]));
      localStorage.setItem("hf_visited", JSON.stringify([id]));
    }, placeId);
    await page.reload();
    await page.locator("#places-btn").click();
    await page.locator('.pf-chip[data-type="saved"]').click();
    await expect(page.locator('[data-city-group="__saved_bookmarked__"]')).toBeVisible();
    await expect(page.locator('[data-city-group="__saved_visited__"]')).toBeVisible();
    await page.locator('[data-city-group="__saved_bookmarked__"] .pl-city-toggle').click();
    await expect(page.locator('[data-city-group-body="__saved_bookmarked__"]')).toHaveClass(/shut/);
    await expect(page.locator('[data-city-group-body="__saved_visited__"]')).not.toHaveClass(/shut/);
    await expect(page.locator('[data-city-group-body="__saved_visited__"] .pl-card').first()).toBeVisible();
  });

  test("root pages have no close affordance and page changes use one clean motion", async ({ page }) => {
    await page.locator("#places-btn").click();
    await expect(page.locator("body")).toHaveAttribute("data-phone-transition-direction", "forward");
    await expect(page.locator("#places-close")).toBeHidden();
    await page.locator("#events-nav-btn").click();
    await expect(page.locator("#events-close")).toBeHidden();
    await page.locator("#dir-btn").click();
    await expect(page.locator("body")).toHaveAttribute("data-phone-transition-direction", "back");
    await page.locator("#menu-pill").click();
    await expect(page.locator("#profile-sheet-close")).toBeHidden();
  });

  test("new right-side topbar controls enter from the right", async ({ page }) => {
    await page.locator("#places-btn").click();
    const entry = await page.evaluate(async () => {
      const header = document.querySelector("#places-sheet > .sheet-head");
      const control = document.createElement("button");
      control.type = "button";
      control.hidden = true;
      control.textContent = "+";
      header.append(control);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      control.hidden = false;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const animation = control.getAnimations().find((candidate) =>
        candidate.effect?.getKeyframes().some((frame) => String(frame.transform || "").includes("18px")),
      );
      const keyframes = animation?.effect?.getKeyframes() || [];
      control.remove();
      return keyframes[0]?.transform || "";
    });
    expect(entry).toContain("18px");
  });

  test("event result-count updates do not animate the Events topbar", async ({ page }) => {
    await page.locator("#events-nav-btn").click();
    await page.waitForTimeout(500);
    const topbarAnimations = await page.evaluate(async () => {
      const count = document.querySelector("#phone-events-count");
      count.textContent = "1 event";
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return [...document.querySelector("#events-card .suggest-head").children]
        .some((element) => element._phoneTopbarLayoutAnimation?.playState === "running");
    });
    expect(topbarAnimations).toBe(false);
  });

  test("Profile → Settings and browser back preserve native page history", async ({ page }) => {
    await page.locator("#menu-pill").click();
    await expect(page.locator("#phone-profile-auth")).toBeVisible();
    await expect(page.locator("#phone-profile-auth #menu-account-signin-row > button:visible")).toHaveCount(3);
    await expect(page.locator("#phone-profile-auth #menu-password-email-input")).toBeVisible();
    await expect(page.locator("#phone-profile-auth #menu-password-input")).toBeVisible();
    await expect(page.locator("#profile-sheet-close")).toBeHidden();
    await expect(page.locator("#phone-profile-settings-btn")).toBeVisible();
    await expect(page.locator("#phone-profile-settings-btn")).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.locator("#phone-profile-settings-btn").click();
    await expect(page.locator("#mp-sheet-title")).toHaveText("Settings");
    await expect(page.locator("#mp-sheet-close")).toHaveAttribute("aria-label", "Back to profile");
    await expect(page.locator("#menu-header-divider")).toBeHidden();
    await page.locator("#mp-sheet-close").click();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "profile");
    await expect(page.locator("#phone-profile-auth #menu-password-signin-panel")).not.toHaveClass(/hide/);
    await page.locator("#phone-profile-auth [data-password-mode='signup']").click();
    await expect(page.locator("#phone-profile-auth #menu-password-name-field")).toBeVisible();
    await expect(page.locator("#phone-profile-auth #menu-password-submit")).toHaveText("Create account");
    await expect(page.locator("#phone-profile-auth #menu-password-signin-panel")).toHaveAttribute("data-mode-direction", "forward");
    await expect(page.locator("#phone-profile-auth .menu-password-form-content")).toHaveCSS("animation-name", "phone-auth-mode-forward");
    await page.locator("#phone-profile-auth [data-password-mode='signin']").click();
    await expect(page.locator("#phone-profile-auth #menu-password-name-field")).toBeHidden();
    await expect(page.locator("#phone-profile-auth #menu-password-submit")).toHaveText("Sign in");
    await expect(page.locator("#phone-profile-auth #menu-password-signin-panel")).toHaveAttribute("data-mode-direction", "back");
    await expect(page.locator("#phone-profile-auth .menu-password-form-content")).toHaveCSS("animation-name", "phone-auth-mode-back");
    const collapsedNameMotion = await page.locator("#phone-profile-auth #menu-password-name-field").evaluate((element) => {
      const style = getComputedStyle(element);
      return { maxHeight: style.maxHeight, visibility: style.visibility, transition: style.transition };
    });
    expect(collapsedNameMotion.maxHeight).toBe("0px");
    expect(collapsedNameMotion.visibility).toBe("hidden");
    expect(collapsedNameMotion.transition).toContain("opacity");
    await page.goBack();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "home");
  });

  test("Home prayer content responds to a live prayer snapshot", async ({ page }) => {
    await expect(page.locator("#phone-next-prayer-name")).not.toHaveText("Prayer times");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("hf:prayer-ready", {
      detail: { name: "Asr", time: "15:45", countdown: "in 12 min" },
    })));
    await expect(page.locator("#phone-next-prayer-name")).toHaveText("Asr");
    await expect(page.locator("#phone-next-prayer-time")).toHaveText("15:45");
    await expect(page.locator("#phone-next-prayer-countdown")).toHaveText("in 12 min");
  });

  test("Home greeting uses the signed-in first name", async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("hf:auth-changed", {
      detail: { account: { displayName: "Amina Rahman", email: "amina@example.com" } },
    })));
    await expect(page.locator("#phone-home-title")).toContainText("Amina");
  });

  test("Home renders empty and failure states for unavailable community data", async ({ page }) => {
    await page.evaluate(() => {
      window.HFPhoneData = { getPlaces: () => [], getEvents: () => [], status: "ready" };
      window.dispatchEvent(new Event("hf:places-data-ready"));
    });
    await expect(page.locator("#phone-places-state")).toHaveText("No places are available yet.");
    await expect(page.locator("#phone-events-state")).toHaveText("No upcoming events yet.");
    await page.evaluate(() => {
      window.HFPhoneData.status = "error";
      window.dispatchEvent(new Event("hf:places-data-ready"));
    });
    await expect(page.locator("#phone-places-state")).toHaveText(/could not be loaded/);
  });

  test("Home action buttons route to Map and Events", async ({ page }) => {
    await page.locator(".phone-primary-action").click();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "map");
    await page.locator("#home-btn").click();
    await page.locator(".phone-action-grid button[data-phone-page='events']").click();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "events");
    await expect(page.locator("#events-overlay")).toBeVisible();
  });

  test("Events filters, place selection, add form, and external links work", async ({ page }) => {
    const places = [{
      id: "phone-event-place",
      name: "Phone Event Mosque",
      type: "mosque",
      address: "Test Street 1",
      lat: 60.17,
      lng: 24.94,
      tags: {},
    }, {
      id: "phone-no-event-place",
      name: "Phone Place Without Events",
      type: "mosque",
      address: "Test Street 2",
      lat: 60.18,
      lng: 24.95,
      tags: {},
    }];
    const events = [
      { id: "phone-event-place-card", title: "Place card event", date: "2099-10-21", time: "18:30", placeId: "phone-event-place" },
      { id: "phone-event-external", title: "External event", date: "2099-10-22", time: "19:00", placeId: "phone-event-place", url: "https://example.com/events/phone-test" },
      { id: "phone-event-past", title: "Past event", date: "2020-01-01", time: "12:00", placeId: "phone-event-place" },
    ];
    await page.route("**/api/places*", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("action") !== "all") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ places, tags: {}, events }),
      });
    });
    await page.reload();
    await page.waitForFunction(() => window.HFPhoneData?.getPlaces?.().some((place) => place.id === "phone-no-event-place")
      && window.HFPhoneData?.getEvents?.().some((event) => event.id === "phone-event-external"));
    await page.locator("#dir-btn").click();
    await expect(page.locator("#map-filter-chips [data-map-events]")).toBeVisible();
    await expect(page.locator(".place-mk-wrap[data-place-id]")).toHaveCount(2);
    await page.locator("#map-filter-chips [data-map-events]").click();
    await expect(page.locator("#map-filter-chips [data-map-events]")).toHaveClass(/active/);
    await expect(page.locator(".place-mk-wrap[data-place-id]")).toHaveCount(1);
    await expect(page.locator(".place-mk-wrap[data-place-id='phone-event-place']")).toHaveCount(1);
    await page.locator("#map-filter-chips [data-map-type='all']").click();
    await expect(page.locator("#map-filter-chips [data-map-events]")).not.toHaveClass(/active/);
    await expect(page.locator(".place-mk-wrap[data-place-id]")).toHaveCount(2);
    await page.locator("#events-nav-btn").click();
    await expect(page.locator("#ev-filter-bar [data-filter='all']")).toHaveClass(/active/);
    await expect(page.locator("#ev-filter-bar .ev-filter-chip").last()).toHaveAttribute("data-filter", "past");
    await expect(page.locator("#events-clear-filters")).toBeHidden();
    await expect(page.locator("#phone-events-count")).toHaveText("2 events");
    await expect(page.locator("#ev-filter-toggle")).toContainText("Filter");
    await page.locator("#ev-filter-bar [data-filter='past']").click();
    await expect(page.locator("#phone-events-count")).toHaveText("1 event");
    await expect(page.locator(".ev-overlay-card[data-ev-id='phone-event-past']")).toBeVisible();
    await page.locator("#ev-filter-bar [data-filter='all']").click();
    await expect(page.locator("#phone-events-count")).toHaveText("2 events");
    const eventControlGeometry = await page.evaluate(() => {
      const styles = (selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return { gap: style.gap, padding: style.padding, borderRadius: style.borderRadius };
      };
      return {
        filter: [styles("#tf-toggle"), styles("#ev-filter-toggle")],
        sort: [styles("#sort-toggle"), styles("#ev-sort-toggle")],
      };
    });
    expect(eventControlGeometry.filter[1]).toEqual(eventControlGeometry.filter[0]);
    expect(eventControlGeometry.sort[1]).toEqual(eventControlGeometry.sort[0]);
    await page.locator("#ev-filter-toggle").click();
    await expect(page.locator("#ev-location-options [data-event-location]")).toHaveCount(2);
    await expect(page.locator("#ev-group-city-option")).toHaveClass(/active/);
    await page.locator("#ev-filter-toggle").click();
    await expect(page.locator(".ev-city-group")).toHaveCount(1);
    await expect(page.locator(".ev-city-hdr.pl-city-hdr")).toHaveCount(1);
    await expect(page.locator(".ev-city-group-list.pl-city-group-list")).toHaveCount(1);
    await page.locator(".ev-city-toggle").click();
    await expect(page.locator(".ev-city-group-body")).toHaveClass(/shut/);
    await expect.poll(() => page.locator(".ev-city-group-body .pl-city-group-inner").evaluate((element) => getComputedStyle(element).transition)).toContain("grid-template-rows");
    await page.locator(".ev-city-toggle").click();
    const stacking = await page.evaluate(() => ({
      filterBar: Number.parseInt(getComputedStyle(document.querySelector("#ev-filter-bar")).zIndex, 10),
      cityHeader: Number.parseInt(getComputedStyle(document.querySelector(".ev-city-hdr")).zIndex, 10),
    }));
    expect(stacking.filterBar).toBeGreaterThan(stacking.cityHeader);
    await page.locator("#ev-search-icn-btn").click();
    await expect(page.locator("#ev-refine-row")).toHaveClass(/pl-searching/);
    await expect(page.locator("#ev-refine-row")).not.toHaveClass(/ev-searching/);
    await page.locator("#ev-search-input").fill("external");
    await expect(page.locator("#ev-filtered-list .ev-overlay-card")).toHaveCount(1);
    await page.locator("#ev-search-icn-btn").click();
    await expect(page.locator("#ev-refine-row")).not.toHaveClass(/pl-searching/);
    await expect(page.locator("#ev-filtered-list .ev-overlay-card")).toHaveCount(2);
    await page.locator("#ev-sort-toggle").click();
    await page.locator("#ev-sort-dropdown [data-sort-field='name']").click();
    await expect(page.locator("#ev-sort-label")).toContainText("Name");
    await expect(page.locator("#events-clear-filters")).toBeVisible();
    const filterGap = await page.evaluate(() => {
      const filter = document.querySelector("#ev-filter-bar").getBoundingClientRect();
      const card = document.querySelector("#ev-filtered-list .ev-overlay-card").getBoundingClientRect();
      return card.top - filter.bottom;
    });
    expect(filterGap).toBeGreaterThanOrEqual(12);

    await page.locator("#ev-filter-bar [data-filter='all']").click();
    await expect(page.locator("#phone-events-count")).toHaveText("2 events");
    await page.locator("#ev-filter-toggle").click();
    await page.locator("#ev-location-options [data-event-location='phone-event-place']").click();
    await expect(page.locator("#ev-filtered-list .ev-overlay-card")).toHaveCount(2);
    await page.locator("#events-clear-filters").click();
    await expect(page.locator("#events-clear-filters")).toBeHidden();
    await expect(page.locator("#ev-sort-label")).toHaveText("Date");
    await expect(page.locator("#ev-group-city-option")).toHaveClass(/active/);

    await expect(page.locator(".ev-overlay-edit-btn")).toHaveCount(0);
    await page.locator(".ev-overlay-card[data-ev-id='phone-event-place-card'] .ev-overlay-save-btn").click();
    await expect(page.locator(".ev-overlay-card[data-ev-id='phone-event-place-card'] .ev-overlay-save-btn")).toHaveClass(/active/);
    await expect(page.locator("#toast-stack .snack-label", { hasText: "Event saved" })).toBeVisible();
    await expect(page.locator(".ev-card-saved-pill")).toHaveCount(0);
    await page.locator(".ev-overlay-card[data-ev-id='phone-event-place-card']").click();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "map");
    await expect(page.locator("#event-detail-sheet")).not.toHaveClass(/shut/);
    await expect(page.locator("#event-detail-title")).toHaveText("Place card event");
    await expect(page.locator("#event-detail-body .ev-detail-hdr")).toBeVisible();
    await expect(page.locator("#event-detail-body .ev-detail-venue")).toContainText("Phone Event Mosque");
    await expect(page.locator("#event-detail-body .ev-detail-schedule")).toBeVisible();
    await expect(page.locator(".ev-detail-save-btn")).toBeVisible();
    await expect(page.locator("#event-detail-actions .ev-detail-edit")).toBeVisible();
    await expect(page.locator("#event-detail-actions .ev-detail-share")).toBeVisible();
    await expect(page.locator("#event-detail-close")).toHaveAttribute("aria-label", "Back to events");
    await expect(page.locator(".place-mk-wrap[data-place-id='phone-event-place']")).toHaveClass(/mk-selected/);
    await page.locator("#event-detail-close").click();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "events");
    await expect(page.locator(".ev-recent-group")).toBeVisible();
    await expect(page.locator(".ev-section-hdr--main")).toHaveText("All events");

    await page.locator(".ev-overlay-card[data-ev-id='phone-event-external']").click();
    await expect(page.locator("#event-detail-close")).toHaveAttribute("aria-label", "Back to events");
    await page.locator("#scrim").click();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "events");
    await expect(page.locator("#event-detail-sheet")).toHaveClass(/shut/);

    await page.locator("#ev-filter-bar [data-filter='past']").click();
    await page.locator(".ev-overlay-card[data-ev-id='phone-event-past']").click();
    await expect(page.locator(".ev-detail-attend-btn")).toBeVisible();
    await page.locator(".ev-detail-attend-btn").click();
    await expect(page.locator("#toast-stack .snack-label", { hasText: "Event marked as attended" })).toBeVisible();
    await page.locator("#event-detail-close").click();
    await page.locator("#ev-filter-bar [data-filter='saved']").click();
    await expect(page.locator("#ev-filtered-list .ev-saved-section")).toHaveCount(2);
    await expect(page.locator("#ev-filtered-list .ev-saved-section").nth(0).locator(".ev-city-name")).toHaveText("Bookmarks");
    await expect(page.locator("#ev-filtered-list .ev-saved-section").nth(1).locator(".ev-city-name")).toHaveText("Attended");
    await page.locator("#events-clear-filters").click();

    const popup = page.waitForEvent("popup");
    await page.locator("#ev-filter-bar [data-filter='all']").click();
    await page.locator(".ev-overlay-card[data-ev-id='phone-event-external'] .ev-overlay-link-btn").first().click();
    await expect((await popup).url()).toBe("https://example.com/events/phone-test");

    await page.locator("#events-add-btn").click();
    await expect(page.locator("#event-overlay")).toBeVisible();
    await expect(page.locator("#event-overlay #ev-heading")).toHaveText("Add Event");
    await expect(page.locator("#event-form .form-scroll-body")).toBeVisible();
    await expect(page.locator("#event-form .form-submit-footer #ev-submit")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#event-overlay")).toHaveClass(/hide/);
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "events");
  });

  test("Map page restores the MapLibre canvas after leaving Home", async ({ page }) => {
    const before = await page.evaluate(async () => {
      const { map } = await import("/src/map-init.js");
      const center = map.getCenter();
      return { lng: center.lng, lat: center.lat };
    });
    await page.locator("#dir-btn").click();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "map");
    await expect(page.locator("#map canvas")).toBeVisible();
    const state = await page.evaluate(async (initial) => {
      const { map } = await import("/src/map-init.js");
      const center = map.getCenter();
      const rect = document.querySelector("#map canvas").getBoundingClientRect();
      return { lng: center.lng, lat: center.lat, width: rect.width, height: rect.height, initial };
    }, before);
    expect(state.width).toBeGreaterThanOrEqual(356);
    expect(state.height).toBeGreaterThan(0);
    expect(Math.abs(state.lng - before.lng)).toBeLessThan(0.01);
    expect(Math.abs(state.lat - before.lat)).toBeLessThan(0.01);
  });

  test("Map page hides the prayer bar and keeps map controls clear of the nav", async ({ page }) => {
    await page.locator("#dir-btn").click();
    await expect(page.locator("#map-filter-carousel")).toBeVisible();
    await expect(page.locator("#prayer-snack")).toBeHidden();
    await expect(page.locator("#map-filter-chips .map-filter-pill[data-map-type]")).toHaveCount(5);
    await expect(page.locator("#map-filter-chips .map-filter-pill").filter({ hasText: "Spaces" })).toBeVisible();
    await expect(page.locator("#map-filter-chips .map-filter-pill").filter({ hasText: "Food" })).toBeVisible();
    await expect(page.locator("#map-filter-chips .map-filter-pill").filter({ hasText: "Services" })).toBeVisible();
    await expect(page.locator("#map-filter-chips [data-map-events]")).toContainText("Events");
    const pillOrder = await page.locator("#map-filter-chips .map-filter-pill").evaluateAll((pills) => pills
      .filter((pill) => !pill.classList.contains("is-hidden"))
      .map((pill) => pill.dataset.mapEvents ? "events" : pill.dataset.mapType));
    expect(pillOrder.indexOf("events")).toBe(pillOrder.indexOf("saved") - 1);
    const selectedPill = await page.locator('#map-filter-chips [data-map-type="all"]').evaluate((pill) => ({
      background: getComputedStyle(pill).backgroundColor,
      color: getComputedStyle(pill).color,
    }));
    expect(selectedPill.background).not.toBe(selectedPill.color);
    await expect(page.locator("#map-filter-chips [data-map-nearby]")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#fullscreen-btn")).toHaveCount(0);
    await expect(page.locator("#layers-btn")).toBeVisible();
    await page.locator("#layers-btn").click();
    await expect(page.locator("#phone-map-layers-popover")).toBeVisible();
    const layersGeometry = await page.evaluate(() => {
      const button = document.querySelector("#layers-btn").getBoundingClientRect();
      const dialog = document.querySelector("#phone-map-layers-popover").getBoundingClientRect();
      const thumb = document.querySelector(".phone-map-layer-thumb").getBoundingClientRect();
      return {
        buttonCenterY: button.top + button.height / 2,
        dialogCenterY: dialog.top + dialog.height / 2,
        thumbWidth: thumb.width,
        thumbHeight: thumb.height,
      };
    });
    expect(Math.abs(layersGeometry.buttonCenterY - layersGeometry.dialogCenterY)).toBeLessThan(8);
    expect(Math.abs(layersGeometry.thumbWidth - layersGeometry.thumbHeight)).toBeLessThan(1);
    await expect(page.locator(".phone-map-layer-opt[data-style='general']")).toHaveAttribute("aria-pressed", "true");
    await page.locator(".phone-map-layer-opt[data-style='satellite']").click();
    await expect(page.locator(".phone-map-layer-opt[data-style='satellite']")).toHaveAttribute("aria-pressed", "true");
    await page.locator(".phone-map-layer-opt[data-style='hybrid']").click();
    await expect(page.locator(".phone-map-layer-opt[data-style='hybrid']")).toHaveAttribute("aria-pressed", "true");
    await page.locator(".phone-map-layer-opt[data-style='heatmap']").click();
    await expect(page.locator(".phone-map-layer-opt[data-style='heatmap']")).toHaveAttribute("aria-pressed", "true");
    await page.locator(".phone-map-layer-opt[data-style='heatmap']").click();
    await expect(page.locator(".phone-map-layer-opt[data-style='heatmap']")).toHaveAttribute("aria-pressed", "false");
    await page.locator(".phone-map-layer-opt[data-style='general']").click();
    await expect(page.locator(".phone-map-layer-opt[data-style='general']")).toHaveAttribute("aria-pressed", "true");

    const geometry = () => page.evaluate(() => {
      const nav = document.querySelector("#phone-chrome-bottom-zone").getBoundingClientRect();
      const scale = document.querySelector(".maplibregl-ctrl-top-right").getBoundingClientRect();
      const credit = document.querySelector("#map-attribution-btn").getBoundingClientRect();
      return { navTop: nav.top, navBottom: nav.bottom, navLeft: nav.left, scaleLeft: scale.left, creditLeft: credit.left, creditRight: credit.right, scaleBottom: scale.bottom, creditBottom: credit.bottom, viewportHeight: window.innerHeight };
    });
    await expect.poll(async () => (await geometry()).scaleLeft).toBeLessThan(120);
    await expect.poll(async () => (await geometry()).creditLeft).toBeLessThan(120);
    await expect.poll(async () => {
      const current = await geometry();
      return Math.abs(current.scaleLeft - current.creditLeft);
    }).toBeLessThan(2);
    await expect.poll(async () => {
      const current = await geometry();
      return current.scaleBottom < current.navTop;
    }).toBe(true);
    await expect.poll(async () => {
      const current = await geometry();
      return current.creditBottom >= current.navBottom && current.creditRight < current.navLeft;
    }).toBe(true);
    await expect(page.locator("#map-attribution-btn")).toBeVisible();
    await page.locator("#map-attribution-btn").click();
    await expect(page.locator("#map-attribution-popover")).toBeVisible();
    await expect(page.locator("#map-attribution-popover")).toContainText("OpenStreetMap contributors");
    await expect(page.locator("#map-attribution-popover")).toContainText("OpenFreeMap");
    await page.locator("#map-attribution-close").click();
    await expect(page.locator("#map-attribution-popover")).toBeHidden();
    await page.locator("#map-attribution-btn").click();
    await expect(page.locator("#map-attribution-popover")).toBeVisible();
    const mapBox = await page.locator("#map canvas").boundingBox();
    await page.mouse.click(mapBox.x + 8, mapBox.y + Math.min(220, mapBox.height - 8));
    await expect(page.locator("#map-attribution-popover")).toBeHidden();
  });

  test("Map filter pills update the shared marker filter", async ({ page }) => {
    await page.locator("#dir-btn").click();
    await page.locator("#map-filter-chips [data-map-type='restaurant']").click();
    await expect(page.locator("#map-filter-chips [data-map-type='restaurant']")).toHaveClass(/active/);
    expect(await page.evaluate(async () => (await import("/src/places.js")).activeTypeFilter)).toBe("restaurant");
  });

  test("Map Nearby pill follows the live GPS state", async ({ page }) => {
    await page.locator("#dir-btn").click();
    await page.evaluate(async () => {
      const { setCurrentLocationState } = await import("/src/utils.js");
      setCurrentLocationState({ lat: 60.17, lng: 24.94, accuracy: 12 });
    });
    await expect(page.locator("#map-filter-chips [data-map-nearby]")).toHaveAttribute("aria-hidden", "false");
    await page.locator("#map-filter-chips [data-map-nearby]").click();
    await expect(page.locator("#map-filter-chips [data-map-nearby]")).toHaveClass(/active/);
    await page.evaluate(async () => (await import("/src/utils.js")).clearCurrentLocationState());
    await expect(page.locator("#map-filter-chips [data-map-nearby]")).toHaveAttribute("aria-hidden", "true");
  });

  test("Places map action opens Maps with the selected category", async ({ page }) => {
    await page.locator("#places-btn").click();
    await page.locator("#places-type-chips [data-type='service']").click();
    await expect(page.locator("#places-map-view")).toBeVisible();
    await page.locator("#places-map-view").click();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "map");
    await expect(page.locator("#map-filter-chips [data-map-type='service']")).toHaveClass(/active/);
    expect(await page.evaluate(async () => (await import("/src/places.js")).activeTypeFilter)).toBe("service");
  });

  test("place details stay windows and browser back returns to the Places page", async ({ page }) => {
    await page.locator("#places-btn").click();
    const firstPlace = page.locator("#places-list li[data-place-id]").first();
    await expect(firstPlace).toBeVisible({ timeout: 15_000 });
    await firstPlace.click();
    await expect(page.locator("#place-sheet")).not.toHaveClass(/shut/);
    await expect(page.locator("body")).toHaveClass(/phone-window-open/);
    await expect(page.locator(".phone-window-morph")).toHaveCount(0);
    await page.evaluate(async () => {
      const { showToast } = await import("/src/utils.js");
      showToast("Toast layering check", "info");
    });
    const toastLayers = await page.evaluate(() => ({
      toast: Number.parseInt(getComputedStyle(document.querySelector("#toast-stack")).zIndex, 10),
      window: Number.parseInt(getComputedStyle(document.querySelector("#place-sheet")).zIndex, 10),
    }));
    expect(toastLayers.toast).toBeGreaterThan(toastLayers.window);
    await page.waitForTimeout(400);
    const layers = await page.evaluate(() => ({
      window: Number.parseInt(getComputedStyle(document.querySelector("#place-sheet")).zIndex, 10),
      nav: Number.parseInt(getComputedStyle(document.querySelector("#phone-chrome-bottom-zone")).zIndex, 10),
      hitStack: (() => {
        const nav = document.querySelector("#phone-chrome-bottom-zone").getBoundingClientRect();
        return document.elementsFromPoint(nav.left + nav.width / 2, nav.top + nav.height / 2)
          .map((element) => element.closest("#place-sheet, #phone-chrome-bottom-zone")?.id)
          .filter(Boolean);
      })(),
    }));
    expect(layers.window).toBeGreaterThan(layers.nav);
    expect(layers.hitStack[0]).toBe("place-sheet");
    await page.goBack();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "places");
    await expect(page.locator("body")).not.toHaveClass(/phone-window-open/);
    await expect(page.locator("#place-sheet")).toHaveClass(/shut/);
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
  });

  test("direct place dismissal restores the Places surface", async ({ page }) => {
    await page.locator("#places-btn").click();
    const firstPlace = page.locator("#places-list li[data-place-id]").first();
    await expect(firstPlace).toBeVisible({ timeout: 15_000 });
    await firstPlace.click();
    await expect(page.locator("#place-sheet")).not.toHaveClass(/shut/);

    await page.evaluate(async () => (await import("/src/places.js")).closePlaceSheet());

    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "places");
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
  });

  test("scrim dismissal restores the Places surface", async ({ page }) => {
    await page.locator("#places-btn").click();
    const firstPlace = page.locator("#places-list li[data-place-id]").first();
    await expect(firstPlace).toBeVisible({ timeout: 15_000 });
    await firstPlace.click();
    await expect(page.locator("#place-sheet")).not.toHaveClass(/shut/);

    await page.locator("#scrim").tap({ force: true });

    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "places");
    await expect(page.locator("#places-sheet")).not.toHaveClass(/shut/);
  });

  test("shared hash place links start on Map instead of Home", async ({ page }) => {
    await page.goto("/#map&p=invalid");
    await page.waitForFunction(() => document.body.dataset.phonePage);
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "map");
  });

  test("active navigation keeps the phone shell on Map", async ({ page }) => {
    await page.locator("#places-btn").click();
    await page.evaluate(() => document.body.classList.add("nav-mode"));
    await page.locator("#home-btn").dispatchEvent("click");
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "map");
    await page.evaluate(() => document.body.classList.remove("nav-mode"));
  });

  test("legacy event visibility changes cannot reveal Events over another page", async ({ page }) => {
    await page.locator("#events-nav-btn").click();
    await page.locator("#home-btn").click();
    await page.evaluate(() => document.querySelector("#events-overlay").classList.remove("hide"));
    await expect(page.locator("#events-overlay")).toBeHidden();
    await expect(page.locator("body")).toHaveAttribute("data-phone-page", "home");
  });

  test("legacy tab updates cannot clear the active phone page", async ({ page }) => {
    await page.evaluate(async () => {
      const { setActiveTab } = await import("/src/map-controls.js");
      setActiveTab(null);
    });
    await expect(page.locator("#home-btn")).toHaveAttribute("aria-current", "page");
    await page.locator("#places-btn").click();
    await page.evaluate(async () => {
      const { setActiveTab } = await import("/src/map-controls.js");
      setActiveTab(null);
    });
    await expect(page.locator("#places-btn")).toHaveAttribute("aria-current", "page");
  });
});
