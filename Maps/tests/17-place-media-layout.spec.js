/**
 * Place media layout coverage.
 *
 * A missing media manifest must not mount a visible gallery placeholder. The
 * common no-image path should keep the place sheet's height stable.
 */
const { test, expect, setupApp } = require("./helpers");

test.describe("place media layout", () => {
  test("does not mount a gallery or skeleton when the manifest has no photos", async ({ page }) => {
    await setupApp(page);
    await page.route("**/api/place-media**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ communityPhotos: [], googlePhotos: [] }),
    }));

    const result = await page.evaluate(async () => {
      const host = document.createElement("div");
      host.id = "media-layout-test-host";
      document.body.appendChild(host);
      const { mountPlaceMedia } = await import("/src/place-media.js");
      mountPlaceMedia(host, { id: "no-image-place", name: "No Image Place" });
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        hostHeight: host.getBoundingClientRect().height,
        galleryCount: host.querySelectorAll(".pp-media").length,
        skeletonCount: host.querySelectorAll(".pp-media-skeleton").length,
      };
    });

    expect(result).toEqual({ hostHeight: 0, galleryCount: 0, skeletonCount: 0 });
  });
});
