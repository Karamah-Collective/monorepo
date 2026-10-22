/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SUITE 14: Auth & Account (Phases 5-8, docs/ACCOUNTS_AND_REDESIGN_PLAN.md)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Firebase Auth's real backend (Google popup, email magic link) can't be driven
 * end-to-end in a sandboxed browser, so these tests mock the Firebase CDN
 * modules (tests/helpers.js's shared `page` fixture — window.__mockAuth) and
 * the /api/reviews /api/account Cloudflare Functions (which don't exist on the
 * plain static file server these tests run against), following the same
 * "mock what you can't test against a live backend" approach already used for
 * Phase 3's Google-enrichment fields (see 13-places-popup-regression.spec.js).
 */
const { test, expect, setupApp } = require("./helpers");

/** Open the Menu sheet and wait for the (async, lazy-loaded) Account section. */
async function openMenuAndWaitForAccount(page) {
  await page.click("#menu-pill");
  if (await page.evaluate(() => window.innerWidth <= 768)) {
    await expect(page.locator("#phone-profile-auth")).toBeVisible();
    await expect(page.locator("#phone-profile-auth #menu-google-signin")).toBeVisible({ timeout: 15_000 });
    return;
  }
  await expect(page.locator("#menu-sheet")).not.toHaveClass(/shut/);
  await expect(page.locator("#menu-google-signin, #menu-signout")).toBeVisible({ timeout: 15_000 });
}

async function expectSignedIn(page) {
  if (await page.evaluate(() => window.innerWidth <= 768)) {
    if (await page.locator("body").getAttribute("data-phone-page") !== "profile") await page.click("#menu-pill");
    await expect(page.locator("#profile-signout")).toBeVisible({ timeout: 10_000 });
    return;
  }
  await expect(page.locator("#menu-signout")).toBeVisible({ timeout: 10_000 });
}

async function clickSignOut(page) {
  const selector = await page.evaluate(() => window.innerWidth <= 768) ? "#profile-signout" : "#menu-signout";
  await page.click(selector);
}

async function expectSignedOutMenu(page) {
  if (await page.evaluate(() => window.innerWidth <= 768)) {
    await expect(page.locator("#phone-profile-auth")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#phone-profile-auth #menu-google-signin")).toBeVisible({ timeout: 10_000 });
    return;
  }
  await expect(page.locator("#menu-google-signin")).toBeVisible({ timeout: 10_000 });
}

async function expectReviewIdentity(page, body) {
  const isLocalReview = await page.evaluate(() => ["localhost", "127.0.0.1"].includes(location.hostname));
  expect(body.idToken).toBe(isLocalReview ? "" : "mock-id-token-google");
  if (isLocalReview) expect(body.localReview).toBe(true);
  else expect(body.localReview).toBeUndefined();
}

test.describe("Menu Account section — signed out", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("shows icon-only Google, Microsoft, Facebook, and email sign-in options, no OTP UI", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    const isPhone = await page.evaluate(() => window.innerWidth <= 768);
    const visibleOptions = page.locator("#menu-account-signin-row > button:visible");
    await expect(visibleOptions).toHaveCount(isPhone ? 3 : 4);
    const labels = await visibleOptions.evaluateAll((buttons) => buttons.map((btn) => btn.getAttribute("aria-label")));
    expect(labels).toEqual(isPhone
      ? ["Continue with Google", "Continue with Microsoft", "Continue with Facebook"]
      : ["Continue with Google", "Continue with Microsoft", "Continue with Facebook", "Continue with email"]);
    await expect(page.locator("#menu-google-signin")).toHaveText("");
    await expect(page.locator("#menu-microsoft-signin")).toHaveText("");
    await expect(page.locator("#menu-facebook-signin")).toHaveText("");
    await expect(page.locator("#menu-password-signin-toggle")).toHaveText("");
    await expect(page.locator("#menu-apple-signin")).not.toBeVisible();
    await expect(page.locator("#menu-signout")).toHaveCount(0);
    await expect(page.locator("#menu-my-reviews")).toHaveCount(0);
  });

  test("email panel reveals the email/password fields", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    if (await page.evaluate(() => window.innerWidth <= 768)) {
      await expect(page.locator("#menu-password-signin-panel")).not.toHaveClass(/hide/);
      await expect(page.locator("#menu-password-email-input")).toBeVisible();
      await expect(page.locator("#menu-password-input")).toBeVisible();
      await expect(page.locator("#menu-password-submit")).toBeVisible();
      return;
    }
    await expect(page.locator("#menu-password-signin-panel")).toHaveClass(/hide/);
    await page.click("#menu-password-signin-toggle");
    await expect(page.locator("#menu-password-signin-panel")).not.toHaveClass(/hide/);
    await expect(page.locator("#menu-password-email-input")).toBeVisible();
    await expect(page.locator("#menu-password-input")).toBeVisible();
    await expect(page.locator("#menu-password-submit")).toBeVisible();
  });

  test("menu section dividers stay between sections after ordering", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    const dividerCount = await page.locator("#menu-sheet-body > .sort-divider").count();
    const misplaced = await page.locator("#menu-sheet-body > .sort-divider").evaluateAll((dividers) =>
      dividers.some((divider) => !divider.nextElementSibling?.classList.contains("menu-section")),
    );
    expect(dividerCount).toBe(3);
    expect(misplaced).toBe(false);
  });
});

test.describe("Menu Account section — Google sign-in / sign-out", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("Google sign-in flips the Account section to signed-in and caches hf_account", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);
    const accountName = await page.evaluate(() => window.innerWidth <= 768
      ? "#profile-sheet .menu-account-name"
      : ".menu-account-name:visible");
    await expect(page.locator(accountName)).toContainText("Mock User");

    const cached = await page.evaluate(() => JSON.parse(localStorage.getItem("hf_account") || "null"));
    expect(cached?.email).toBe("mockuser@example.com");
  });

  test("Profile is the root account page and Settings is its branch", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    if (await page.evaluate(() => window.innerWidth <= 768)) {
      await page.click("#menu-pill");
      await expect(page.locator("body")).toHaveAttribute("data-phone-page", "profile");
      await expect(page.locator("#profile-sheet-close")).toBeHidden();
      await page.click("#phone-profile-settings-btn");
      await expect(page.locator("body")).toHaveAttribute("data-phone-page", "menu");
      await expect(page.locator("#mp-sheet-title")).toHaveText("Settings");
      await expect(page.locator("#mp-sheet-close")).toHaveAttribute("aria-label", "Back to profile");
      await page.click("#mp-sheet-close");
      await expect(page.locator("body")).toHaveAttribute("data-phone-page", "profile");
      return;
    }
    await expect(page.locator("#menu-profile-link")).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      window.__sheetStates = [];
      for (const id of ["menu-sheet", "profile-sheet"]) {
        const sheet = document.getElementById(id);
        new MutationObserver(() => {
          window.__sheetStates.push(`${id}:${sheet.classList.contains("shut") ? "shut" : "open"}`);
        }).observe(sheet, { attributes: true, attributeFilter: ["class"] });
      }
    });
    await page.click("#menu-profile-link");
    if (await page.evaluate(() => window.innerWidth <= 768)) {
      await expect(page.locator("body")).toHaveAttribute("data-phone-page", "profile");
      await expect(page.locator("#profile-sheet")).not.toHaveClass(/shut/);
      await page.locator("#profile-sheet-close").click();
      await expect(page.locator("body")).toHaveAttribute("data-phone-page", "menu");
      return;
    }
    await expect(page.locator("#menu-sheet")).toHaveClass(/shut/);
    await expect(page.locator("#profile-sheet")).not.toHaveClass(/shut/);
    await expect(page.locator("#profile-sheet-close")).toHaveAttribute("aria-label", "Back to menu");
    await expect(page.locator(".sheet:not(.shut)")).toHaveCount(1);
    const toProfile = await page.evaluate(() => window.__sheetStates);
    expect(toProfile.indexOf("profile-sheet:open")).toBeGreaterThanOrEqual(0);
    expect(toProfile.indexOf("profile-sheet:open")).toBeLessThan(toProfile.indexOf("menu-sheet:shut"));

    await page.evaluate(() => { window.__sheetStates = []; });
    await page.click("#profile-sheet-close");
    await expect(page.locator("#profile-sheet")).toHaveClass(/shut/);
    await expect(page.locator("#menu-sheet")).not.toHaveClass(/shut/);
    await expect(page.locator("#mp-sheet-close")).toHaveAttribute("aria-label", "Close");
    await expect(page.locator(".sheet:not(.shut)")).toHaveCount(1);
    const toMenu = await page.evaluate(() => window.__sheetStates);
    expect(toMenu.indexOf("menu-sheet:open")).toBeGreaterThanOrEqual(0);
    expect(toMenu.indexOf("menu-sheet:open")).toBeLessThan(toMenu.indexOf("profile-sheet:shut"));
  });

  test("a loaded profile photo replaces the profile outline instead of stacking with it", async ({ page }) => {
    await page.evaluate(() => {
      window.__mockOAuthUser = {
        uid: "mock-photo-user",
        email: "photo@example.com",
        displayName: "Photo User",
        photoURL: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
        emailVerified: true,
        providerData: [{ providerId: "google.com" }],
        reload: async () => {},
        getIdToken: async () => "mock-photo-token",
      };
    });
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");

    await expect(page.locator("#profile-tab-avatar")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#profile-tab-icon")).toBeHidden();
    await expect(page.locator("#profile-tab-initial")).toBeHidden();
  });

  test("signing out asks for Yes/No confirmation, cancel leaves the session signed in", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);

    await clickSignOut(page);
    await expect(page.locator(".confirm-title", { hasText: "Sign out?" })).toBeVisible();
    await page.click(".confirm-cancel");
    await expect(page.locator(".confirm-overlay")).toHaveCount(0, { timeout: 5_000 });
    await expectSignedIn(page); // still signed in
  });

  test("signing out and confirming reverts to the signed-out view and clears hf_account", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);

    await clickSignOut(page);
    await expect(page.locator(".confirm-title", { hasText: "Sign out?" })).toBeVisible();
    await page.click(".confirm-ok");
    await expectSignedOutMenu(page);
    const cached = await page.evaluate(() => localStorage.getItem("hf_account"));
    expect(cached).toBeNull();
  });

  // Root-caused from a real user report ("the login works, but didn't do
  // anything") — the Google sign-in button had no visible confirmation at all,
  // so a successful sign-in with nothing else to show (e.g. zero pre-existing
  // reviews/saved places) looked indistinguishable from a silent failure.
  test("Google sign-in shows a welcome confirmation toast", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await Promise.all([
      expect(page.locator(".snack-label", { hasText: "Welcome" })).toBeVisible({ timeout: 10_000 }),
      page.click("#menu-google-signin"),
    ]);
  });
});

test.describe("Menu Account section — Facebook avatar", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("ignores Facebook's tokenless Graph picture URL and caches the fresh signed-in photo", async ({ page }) => {
    await page.route("https://graph.facebook.com/me/picture**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            is_silhouette: false,
            url: "https://example.com/facebook-real-profile.jpg",
          },
        }),
      }),
    );
    await page.evaluate(() => {
      window.__mockOAuthUser = {
        uid: "mock-uid-facebook",
        email: "facebook@example.com",
        displayName: "Facebook User",
        photoURL: "",
        emailVerified: true,
        providerData: [{
          providerId: "facebook.com",
          photoURL: "https://graph.facebook.com/123456789/picture?type=large&height=500&width=500",
        }],
        reload: async () => {},
        getIdToken: async () => "mock-id-token-facebook",
      };
    });

    await openMenuAndWaitForAccount(page);
    await page.click("#menu-facebook-signin");

    await expect.poll(
      () => page.evaluate(() => JSON.parse(localStorage.getItem("hf_account") || "null")?.photoURL || ""),
      { timeout: 10_000 },
    ).toBe("https://example.com/facebook-real-profile.jpg");
  });
});

test.describe("Menu Account section — Your reviews list", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/reviews", (route) => {
      const body = route.request().postDataJSON?.() || {};
      if (body.action === "my-reviews") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            reviews: [
              { placeId: "p1", placeName: "Test Mosque", rating: 5, text: "Lovely and welcoming.", timestamp: new Date().toISOString() },
              { placeId: "p2", placeName: "Test Restaurant", rating: 3, text: "", timestamp: new Date(Date.now() - 86_400_000).toISOString() },
            ],
          }),
        });
      }
      if (body.action === "delete") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      }
      return route.continue();
    });
    await setupApp(page);
  });

  test("renders each review with place name, rating, and edit/delete controls", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);
    await page.click('#profile-my-reviews [data-profile-detail="reviews"]');
    await expect(page.locator("#profile-detail-overlay")).toBeVisible();
    await expect(page.locator(".acc-review-row")).toHaveCount(2, { timeout: 10_000 });
    await expect(page.locator(".acc-review-row").first().locator(".acc-review-place-name")).toContainText("Test Mosque");
    await expect(page.locator(".acc-review-row").first().locator(".rv-review-text")).toContainText("Lovely and welcoming.");
    await expect(page.locator(".acc-review-row").first().locator(".acc-review-edit")).toBeVisible();
    await expect(page.locator(".acc-review-row").first().locator(".acc-review-delete")).toBeVisible();
    await page.click("#profile-detail-body [data-review-sort-toggle]");
    await expect(page.locator("#profile-detail-body [data-review-sort-dir=\"asc\"]")).toBeVisible();
    await page.click("#profile-detail-body [data-review-sort-dir=\"asc\"]");
    await expect(page.locator(".acc-review-row").first().locator(".acc-review-place-name")).toContainText("Test Restaurant");
  });

  test("delete shows a Yes/No confirm dialog; cancelling leaves the row in place", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);
    await page.click('#profile-my-reviews [data-profile-detail="reviews"]');
    await expect(page.locator("#profile-detail-overlay")).toBeVisible();
    await expect(page.locator(".acc-review-row")).toHaveCount(2, { timeout: 10_000 });

    const firstDelete = page.locator(".acc-review-row").first().locator(".acc-review-delete");
    await firstDelete.click();
    await expect(page.locator(".confirm-title")).toContainText("review");
    await page.click(".confirm-cancel");
    await expect(page.locator(".confirm-overlay")).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator(".acc-review-row")).toHaveCount(2); // not removed
  });

  test("delete confirmed via the Yes/No dialog removes the row", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);
    await page.click('#profile-my-reviews [data-profile-detail="reviews"]');
    await expect(page.locator("#profile-detail-overlay")).toBeVisible();
    await expect(page.locator(".acc-review-row")).toHaveCount(2, { timeout: 10_000 });

    const firstDelete = page.locator(".acc-review-row").first().locator(".acc-review-delete");
    await firstDelete.click();
    await expect(page.locator(".confirm-title")).toContainText("review");
    await page.click(".confirm-ok");
    await expect(page.locator(".acc-review-row")).toHaveCount(1, { timeout: 10_000 });
  });

  test("empty state renders when the signed-in user has no reviews", async ({ page }) => {
    await page.unroute("**/api/reviews");
    await page.route("**/api/reviews", (route) => {
      const body = route.request().postDataJSON?.() || {};
      if (body.action === "my-reviews") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, reviews: [] }) });
      }
      return route.continue();
    });
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);
    await expect(page.locator("#profile-my-reviews")).toContainText("haven't written any reviews yet", { timeout: 10_000 });
  });
});

/**
 * The review write-gate (src/reviews.js _showReviewForm) isn't exported, so
 * these drive it through the real overlay open + "Write a review" click path,
 * same technique as Phase 3's mocked openPlaceSheet() tests.
 */
test.describe("Review write-gate — sign-in replaces the OTP flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("signed out: shows icon-only sign-in prompt, never the OTP code UI", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/src/reviews.js");
      mod.openReviewsOverlay("test-place-gate", "Gate Test Place");
    });
    await expect(page.locator("#reviews-overlay")).not.toHaveClass(/hide/);
    await page.click(".rv-write-btn");

    if (await page.evaluate(() => ["localhost", "127.0.0.1"].includes(location.hostname))) {
      await expect(page.locator(".rv-star-input")).toBeVisible();
      return;
    }

    await expect(page.locator(".rv-verify-title")).toHaveText("Sign in to write a review");
    const visibleOptions = page.locator(".rv-verify-form .menu-account-signin-row > button:visible");
    await expect(visibleOptions).toHaveCount(4);
    const labels = await visibleOptions.evaluateAll((buttons) => buttons.map((btn) => btn.getAttribute("aria-label")));
    expect(labels).toEqual(["Continue with Google", "Continue with Microsoft", "Continue with Facebook", "Continue with email"]);
    await expect(visibleOptions).toHaveText(["", "", "", ""]);
    await expect(page.locator(".rv-otp-boxes")).toHaveCount(0);
    // Email field exists but stays visually hidden (.hide) until "use an email link" is toggled.
    await expect(page.locator('.rv-verify-form input[type="email"]')).not.toBeVisible();
  });

  test("signed in: writing a review goes straight to the rating form, no sign-in prompt", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);
    if (!(await page.evaluate(() => window.innerWidth <= 768))) await page.click("#mp-sheet-close");

    await page.evaluate(async () => {
      const mod = await import("/src/reviews.js");
      mod.openReviewsOverlay("test-place-gate-2", "Gate Test Place 2");
    });
    await page.click(".rv-write-btn");

    await expect(page.locator(".rv-star-input")).toBeVisible();
    await expect(page.locator(".rv-verify-title")).toHaveCount(0);
  });
});

test.describe("Review edit form pre-fill (Menu 'Your reviews' → edit)", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("openReviewsOverlayForEdit pre-fills rating and text, and labels the button Update", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/src/reviews.js");
      mod.openReviewsOverlayForEdit("test-place-edit", "Edit Test Place", { rating: 4, text: "Already wrote this once." });
    });
    await expect(page.locator(".rv-star-input .rv-star-btn.active")).toHaveCount(4);
    await expect(page.locator(".rv-text-input")).toHaveValue("Already wrote this once.");
    await expect(page.locator(".rv-submit-btn")).toHaveText("Update review");
  });
});

/**
 * Real network-call assertions (not just DOM state) for the three mechanics a
 * user report of "signed in, but nothing happened" hinges on: writing a
 * review, toggling a favourite, and loading "Your reviews" — each must
 * actually reach the corresponding Cloudflare Function with the signed-in
 * idToken attached, not silently no-op.
 */
test.describe("Signed-in actions actually fire the expected network calls", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  // Drives src/reviews.js's exported submitReview() directly (dynamic import,
  // same technique this suite already uses for fetchMyReviews()/
  // openReviewsOverlayForEdit()) rather than clicking through the 5-star UI —
  // the rating-form's own CSS interaction (a locked-height card that reveals
  // new content within a small scroll area, see _insertReviewPanel's comment
  // in src/reviews.js) is an orthogonal UI-mechanics concern already covered
  // by "signed in: writing a review goes straight to the rating form" above;
  // what this test needs to prove is specifically that the signed-in identity
  // resolution (_resolveReviewIdentity() → idToken, never verifyToken) reaches
  // the real network call, which submitReview() exercises directly.
  test("submitting a review while signed in posts /api/reviews with idToken + placeId", async ({ page }) => {
    let captured = null;
    await page.route("**/api/reviews", (route) => {
      const body = route.request().postDataJSON?.() || {};
      if (route.request().method() === "POST" && body.action === "submit") {
        captured = body;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, status: "yes" }) });
      }
      return route.continue();
    });

    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);

    const result = await page.evaluate(async () => {
      const mod = await import("/src/reviews.js");
      return mod.submitReview("test-place-network-review", 5, "Lovely, welcoming, and clean facilities.");
    });
    expect(result.success).toBe(true);

    await expect.poll(() => captured, { timeout: 10_000 }).not.toBeNull();
    await expectReviewIdentity(page, captured);
    expect(captured.placeId).toBe("test-place-network-review");
    expect(captured.rating).toBe(5);
    expect(captured.verifyToken).toBeUndefined();
  });

  test("toggling a favourite while signed in posts /api/account with the save action + idToken", async ({ page }) => {
    let captured = null;
    await page.route("**/api/account", (route) => {
      const body = route.request().postDataJSON?.() || {};
      if (body.action === "sync-saved") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, saved: [] }) });
      }
      if (body.action === "save" || body.action === "unsave") captured = body;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });

    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);
    if (!(await page.evaluate(() => window.innerWidth <= 768))) await page.click("#mp-sheet-close");

    await page.evaluate(async () => {
      const mod = await import("/src/places.js");
      mod.openPlaceSheet({
        id: "test-place-network-fav", name: "Fav Network Test Place", type: "restaurant",
        address: "Testikatu 4, Helsinki", lat: 60.17, lng: 24.94, tags: {}, notes: "",
      });
    });
    await page.click(".pp-fav-btn");

    await expect.poll(() => captured, { timeout: 10_000 }).not.toBeNull();
    expect(captured.action).toBe("save");
    expect(captured.kind).toBe("favorite");
    expect(captured.placeId).toBe("test-place-network-fav");
    expect(captured.idToken).toBe("mock-id-token-google");
    await expect(page.locator("#toast-stack .snack-label", { hasText: "Place saved" })).toBeVisible();
  });

  test("sign-in triggers a background /api/account sync-saved call (Phase 8 merge)", async ({ page }) => {
    let sawSyncSaved = false;
    await page.route("**/api/account", (route) => {
      const body = route.request().postDataJSON?.() || {};
      if (body.action === "sync-saved") {
        sawSyncSaved = true;
        expect(body.idToken).toBe("mock-id-token-google");
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, saved: [] }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });

    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);

    await expect.poll(() => sawSyncSaved, { timeout: 10_000 }).toBe(true);
  });

  test("fetchMyReviews actually posts /api/reviews action=my-reviews with idToken (populated list)", async ({ page }) => {
    let captured = null;
    await page.route("**/api/reviews", (route) => {
      const body = route.request().postDataJSON?.() || {};
      if (body.action === "my-reviews") {
        captured = body;
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ success: true, reviews: [{ placeId: "p1", placeName: "Test Mosque", rating: 5, text: "", timestamp: new Date().toISOString() }] }),
        });
      }
      return route.continue();
    });

    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);
    await expect(page.locator(".acc-review-row")).toHaveCount(1, { timeout: 10_000 });

    expect(captured).not.toBeNull();
    await expectReviewIdentity(page, captured);
  });

  test("fetchMyReviews actually posts /api/reviews action=my-reviews with idToken (empty state)", async ({ page }) => {
    let captured = null;
    await page.route("**/api/reviews", (route) => {
      const body = route.request().postDataJSON?.() || {};
      if (body.action === "my-reviews") {
        captured = body;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, reviews: [] }) });
      }
      return route.continue();
    });

    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expectSignedIn(page);
    await expect(page.locator("#profile-my-reviews")).toContainText("haven't written any reviews yet", { timeout: 10_000 });

    expect(captured).not.toBeNull();
    await expectReviewIdentity(page, captured);
  });
});

/**
 * The magic-link "complete sign-in on return" path (src/auth.js
 * completeMagicLinkSignIn(), driven by the mocked isSignInWithEmailLink's
 * "mockSignInLink=1" URL check) was previously never exercised by any test —
 * only the interactive Google-popup path was. This drives a same-device
 * completion (email stashed in localStorage by a prior sendMagicLink() call,
 * per Firebase's own documented flow) and confirms both the account actually
 * populates AND the new one-time welcome toast fires — but only for a
 * genuine fresh completion, never for an ordinary page load that simply
 * restores an already-signed-in cached session.
 */
test.describe("Magic-link return-trip completion", () => {
  test("visiting the app on a magic-link return URL completes sign-in and shows a one-time toast", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("hf_tutorial_v1", "done");
      localStorage.setItem("hf_magic_link_email", "linkuser@example.com");
    });
    await page.goto("/?signin=1&mockSignInLink=1");
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#map canvas");
      return canvas && canvas.offsetWidth > 0;
    }, { timeout: 30_000 });

    await expect(page.locator(".snack-label", { hasText: "Welcome" })).toBeVisible({ timeout: 15_000 });
    const cached = await page.evaluate(() => JSON.parse(localStorage.getItem("hf_account") || "null"));
    expect(cached?.email).toBe("linkuser@example.com");
    // The magic-link email stash is consumed on successful completion.
    const stash = await page.evaluate(() => localStorage.getItem("hf_magic_link_email"));
    expect(stash).toBeNull();
    const phoneHistory = await page.evaluate(() => window.innerWidth <= 768 ? history.state?.__hfPhonePage : null);
    if (await page.evaluate(() => window.innerWidth <= 768)) expect(phoneHistory).toBe("home");
  });

  // Regression test for a real race found while investigating this report:
  // account-sync.js's EVT.AUTH_CHANGED listener (registered by
  // initAccountSync(), called from src/menu.js's initMenuAccount()) must be
  // wired up BEFORE auth.js's initAuth() runs, since initAuth() can complete
  // (and dispatch EVT.AUTH_CHANGED for) a pending magic-link sign-in as part
  // of its own execution. If the listener registered even a tick too late,
  // the Phase 8 sign-in merge would silently never fire for a magic-link
  // sign-in specifically (the interactive Google-popup path was unaffected).
  test("a magic-link completion also triggers the Phase 8 background sync (not just the interactive Google path)", async ({ page }) => {
    let sawSyncSaved = false;
    await page.route("**/api/account", (route) => {
      const body = route.request().postDataJSON?.() || {};
      if (body.action === "sync-saved") {
        sawSyncSaved = true;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, saved: [] }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });
    await page.addInitScript(() => {
      localStorage.setItem("hf_tutorial_v1", "done");
      localStorage.setItem("hf_magic_link_email", "linkuser2@example.com");
    });
    await page.goto("/?signin=1&mockSignInLink=1");
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#map canvas");
      return canvas && canvas.offsetWidth > 0;
    }, { timeout: 30_000 });

    await expect.poll(() => sawSyncSaved, { timeout: 15_000 }).toBe(true);
  });

  test("an ordinary page load with an already-signed-in cached session shows no 'Signed in' toast", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("hf_tutorial_v1", "done");
    });
    await page.goto("/");
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#map canvas");
      return canvas && canvas.offsetWidth > 0;
    }, { timeout: 30_000 });
    // No sign-in of any kind happened on this load — confirm silence, i.e. no
    // stray toast fires from initMenuAccount()'s justCompletedMagicLink branch.
    await page.waitForTimeout(2000);
    await expect(page.locator(".snack-label", { hasText: "Signed in" })).toHaveCount(0);
  });
});
