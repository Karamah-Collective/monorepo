/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SUITE 2: Data Integrity & Content
 * ═══════════════════════════════════════════════════════════════════════════════
 * Validates that places.json and tags.json load correctly, every place has
 * required fields, tags are consistent, and the badge count matches.
 */
const { test, expect, setupApp } = require("./helpers");

test.describe("Places Data Integrity", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("places.json loads and is a non-empty array", async ({ page }) => {
    const data = await page.evaluate(() => fetch("data/places.json").then((r) => r.json()));
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test("every place has required fields (id, name, type, address, lat, lng)", async ({ page }) => {
    const data = await page.evaluate(() => fetch("data/places.json").then((r) => r.json()));
    for (const place of data) {
      expect(place).toHaveProperty("id");
      expect(place).toHaveProperty("name");
      expect(place).toHaveProperty("type");
      expect(place).toHaveProperty("address");
      expect(place).toHaveProperty("lat");
      expect(place).toHaveProperty("lng");
      expect(typeof place.name).toBe("string");
      expect(place.name.length).toBeGreaterThan(0);
      expect(typeof place.lat).toBe("number");
      expect(typeof place.lng).toBe("number");
    }
  });

  test("all place ids are unique", async ({ page }) => {
    const data = await page.evaluate(() => fetch("data/places.json").then((r) => r.json()));
    const ids = data.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("all place types are valid", async ({ page }) => {
    const data = await page.evaluate(() => fetch("data/places.json").then((r) => r.json()));
    const validTypes = ["mosque", "prayer_room", "restaurant", "shop", "cemetery"];
    for (const place of data) {
      expect(validTypes).toContain(place.type);
    }
  });

  test("all coordinates are within Finland bounds", async ({ page }) => {
    const data = await page.evaluate(() => fetch("data/places.json").then((r) => r.json()));
    for (const place of data) {
      expect(place.lat).toBeGreaterThan(59.0);
      expect(place.lat).toBeLessThan(71.0);
      expect(place.lng).toBeGreaterThan(19.0);
      expect(place.lng).toBeLessThan(32.0);
    }
  });

  test("no duplicate place names within the same type", async ({ page }) => {
    const data = await page.evaluate(() => fetch("data/places.json").then((r) => r.json()));
    const seen = new Set();
    for (const place of data) {
      const key = `${place.type}:${place.name}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test("place addresses are non-empty strings", async ({ page }) => {
    const data = await page.evaluate(() => fetch("data/places.json").then((r) => r.json()));
    for (const place of data) {
      expect(typeof place.address).toBe("string");
      expect(place.address.trim().length).toBeGreaterThan(0);
    }
  });
});

test.describe("Tags Data Integrity", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("tags.json loads and has all place types", async ({ page }) => {
    const data = await page.evaluate(() => fetch("data/tags.json").then((r) => r.json()));
    expect(data).toHaveProperty("mosque");
    expect(data).toHaveProperty("prayer_room");
    expect(data).toHaveProperty("restaurant");
    expect(data).toHaveProperty("shop");
  });

  test("each tag has id and label", async ({ page }) => {
    const data = await page.evaluate(() => fetch("data/tags.json").then((r) => r.json()));
    for (const type of Object.keys(data)) {
      expect(Array.isArray(data[type])).toBe(true);
      for (const tag of data[type]) {
        expect(tag).toHaveProperty("id");
        expect(tag).toHaveProperty("label");
        expect(typeof tag.id).toBe("string");
        expect(typeof tag.label).toBe("string");
      }
    }
  });

  test("all tag ids are unique within their type", async ({ page }) => {
    const data = await page.evaluate(() => fetch("data/tags.json").then((r) => r.json()));
    for (const type of Object.keys(data)) {
      const ids = data[type].map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test("place tag keys match defined tags for their type", async ({ page }) => {
    const [places, tags] = await page.evaluate(() =>
      Promise.all([
        fetch("data/places.json").then((r) => r.json()),
        fetch("data/tags.json").then((r) => r.json()),
      ]),
    );
    for (const place of places) {
      if (!place.tags) continue;
      const validTagIds = (tags[place.type] || []).map((t) => t.id);
      for (const key of Object.keys(place.tags)) {
        expect(validTagIds).toContain(key);
      }
    }
  });

  test("place tag values are booleans", async ({ page }) => {
    const data = await page.evaluate(() => fetch("data/places.json").then((r) => r.json()));
    for (const place of data) {
      if (!place.tags) continue;
      for (const [key, val] of Object.entries(place.tags)) {
        expect(typeof val).toBe("boolean");
      }
    }
  });
});

test.describe("Badge & Counter Integrity", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("places badge shows correct count", async ({ page }) => {
    const count = await page.evaluate(() => fetch("data/places.json").then((r) => r.json()).then((d) => d.length));
    const badge = page.locator("#places-badge");
    await expect(badge).not.toHaveClass(/hide/);
    const text = await badge.textContent();
    expect(parseInt(text, 10)).toBe(count);
  });

  test("map has place markers matching data count", async ({ page }) => {
    const expectedCount = await page.evaluate(() => fetch("data/places.json").then((r) => r.json()).then((d) => d.length));
    const markerCount = await page.locator(".place-mk-wrap").count();
    expect(markerCount).toBe(expectedCount);
  });
});
