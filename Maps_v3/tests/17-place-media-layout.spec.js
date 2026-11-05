/**
 * Place media layout coverage.
 *
 * A missing media manifest must not mount a visible gallery placeholder, but
 * the Photos section remains available so signed-in users can contribute.
 */
const { test, expect, setupApp } = require("./helpers");

test.describe("place media layout", () => {
  test("keeps the Photos section and upload action when the manifest has no photos", async ({ page }) => {
    await setupApp(page);
    await page.route("**/api/place-media**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ communityPhotos: [], googlePhotos: [] }),
    }));
    await page.route(/\/api\/places\?action=previews/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ previews: {} }),
    }));

    const result = await page.evaluate(async () => {
      const host = document.createElement("div");
      host.id = "media-layout-test-host";
      document.body.appendChild(host);
      const { mountPlaceMedia } = await import("/src/place-media.js");
      let addPhotosClicks = 0;
      mountPlaceMedia(host, { id: "no-image-place", name: "No Image Place", mapsUrl: "https://maps.google.com/?cid=1" }, { onAddPhotos: () => { addPhotosClicks++; } });
      await new Promise((resolve) => setTimeout(resolve, 50));
      host.querySelector(".pp-section-action")?.click();
      return {
        hostHeight: host.getBoundingClientRect().height,
        galleryCount: host.querySelectorAll(".pp-media").length,
        sectionHeader: host.querySelector(".pp-media-header")?.classList.contains("pp-section-hdr") || false,
        countBadge: host.querySelector(".pp-media-count")?.classList.contains("count-badge") || false,
        addPhotosText: host.querySelector(".pp-media .pp-section-action")?.textContent || "",
        addPhotosClicks,
        inlineUploadHostCount: host.querySelectorAll(".pp-media-upload").length,
        skeletonCount: host.querySelectorAll(".pp-media-skeleton").length,
      };
    });

    expect(result.galleryCount).toBe(1);
    expect(result.sectionHeader).toBe(true);
    expect(result.countBadge).toBe(true);
    expect(result.addPhotosText).toBe("Add photos");
    expect(result.addPhotosClicks).toBe(1);
    expect(result.inlineUploadHostCount).toBe(1);
    expect(result.skeletonCount).toBe(0);
  });
});
