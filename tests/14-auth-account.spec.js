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
  await expect(page.locator("#menu-sheet")).not.toHaveClass(/shut/);
  await expect(page.locator("#menu-google-signin, #menu-signout")).toBeVisible({ timeout: 15_000 });
}

test.describe("Menu Account section — signed out", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("shows Google + email sign-in options, no OTP UI", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await expect(page.locator("#menu-google-signin")).toBeVisible();
    await expect(page.locator("#menu-google-signin")).toHaveText("Continue with Google");
    await expect(page.locator("#menu-email-signin-toggle")).toBeVisible();
    await expect(page.locator("#menu-signout")).toHaveCount(0);
    await expect(page.locator("#menu-my-reviews")).toHaveCount(0);
  });

  test("email link panel reveals an email field and send button", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await expect(page.locator("#menu-email-signin-panel")).toHaveClass(/hide/);
    await page.click("#menu-email-signin-toggle");
    await expect(page.locator("#menu-email-signin-panel")).not.toHaveClass(/hide/);
    await expect(page.locator("#menu-email-input")).toBeVisible();
    await expect(page.locator("#menu-email-send")).toBeVisible();
  });

  test("sending a magic link shows a confirmation and calls sendSignInLinkToEmail", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-email-signin-toggle");
    await page.fill("#menu-email-input", "someone@example.com");
    await page.click("#menu-email-send");
    await expect(page.locator("#menu-email-signin-panel")).toContainText("someone@example.com");
    const sent = await page.evaluate(() => window.__mockMagicLinkSent);
    expect(sent?.email).toBe("someone@example.com");
  });
});

test.describe("Menu Account section — Google sign-in / sign-out", () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
  });

  test("Google sign-in flips the Account section to signed-in and caches hf_account", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expect(page.locator("#menu-signout")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".menu-account-name")).toContainText("Mock User");

    const cached = await page.evaluate(() => JSON.parse(localStorage.getItem("hf_account") || "null"));
    expect(cached?.email).toBe("mockuser@example.com");
  });

  test("signing out reverts to the signed-out view and clears hf_account", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expect(page.locator("#menu-signout")).toBeVisible({ timeout: 10_000 });

    await page.click("#menu-signout");
    await expect(page.locator("#menu-google-signin")).toBeVisible({ timeout: 10_000 });
    const cached = await page.evaluate(() => localStorage.getItem("hf_account"));
    expect(cached).toBeNull();
  });

  // Root-caused from a real user report ("the login works, but didn't do
  // anything") — the Google sign-in button had no visible confirmation at all,
  // so a successful sign-in with nothing else to show (e.g. zero pre-existing
  // reviews/saved places) looked indistinguishable from a silent failure.
  test("Google sign-in shows a 'Signed in' confirmation toast", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expect(page.locator(".snack-label", { hasText: "Signed in" })).toBeVisible({ timeout: 10_000 });
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
    await expect(page.locator(".acc-review-row")).toHaveCount(2, { timeout: 10_000 });
    await expect(page.locator(".acc-review-row").first().locator(".acc-review-place-name")).toContainText("Test Mosque");
    await expect(page.locator(".acc-review-row").first().locator(".rv-review-text")).toContainText("Lovely and welcoming.");
    await expect(page.locator(".acc-review-row").first().locator(".acc-review-edit")).toBeVisible();
    await expect(page.locator(".acc-review-row").first().locator(".acc-review-delete")).toBeVisible();
  });

  test("delete requires two clicks (press-to-confirm) before removing the row", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expect(page.locator(".acc-review-row")).toHaveCount(2, { timeout: 10_000 });

    const firstDelete = page.locator(".acc-review-row").first().locator(".acc-review-delete");
    await firstDelete.click();
    await expect(firstDelete).toHaveAttribute("aria-label", "Click again to confirm delete");
    await expect(page.locator(".acc-review-row")).toHaveCount(2); // not yet removed

    await firstDelete.click();
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
    await expect(page.locator("#menu-my-reviews")).toContainText("haven't written any reviews yet", { timeout: 10_000 });
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

  test("signed out: shows a sign-in prompt (Google + email link), never the OTP code UI", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/src/reviews.js");
      mod.openReviewsOverlay("test-place-gate", "Gate Test Place");
    });
    await expect(page.locator("#reviews-overlay")).not.toHaveClass(/hide/);
    await page.click(".rv-write-btn");

    await expect(page.locator(".rv-verify-title")).toHaveText("Sign in to write a review");
    await expect(page.locator(".rv-verify-form .rv-action-btn").first()).toHaveText("Continue with Google");
    await expect(page.locator(".rv-otp-boxes")).toHaveCount(0);
    // Email field exists but stays visually hidden (.hide) until "use an email link" is toggled.
    await expect(page.locator('.rv-verify-form input[type="email"]')).not.toBeVisible();
  });

  test("signed in: writing a review goes straight to the rating form, no sign-in prompt", async ({ page }) => {
    await openMenuAndWaitForAccount(page);
    await page.click("#menu-google-signin");
    await expect(page.locator("#menu-signout")).toBeVisible({ timeout: 10_000 });
    await page.click("#menu-close");

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
    await expect(page.locator("#menu-signout")).toBeVisible({ timeout: 10_000 });

    const result = await page.evaluate(async () => {
      const mod = await import("/src/reviews.js");
      return mod.submitReview("test-place-network-review", 5, "Lovely, welcoming, and clean facilities.");
    });
    expect(result.success).toBe(true);

    await expect.poll(() => captured, { timeout: 10_000 }).not.toBeNull();
    expect(captured.idToken).toBe("mock-id-token-google");
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
    await expect(page.locator("#menu-signout")).toBeVisible({ timeout: 10_000 });
    await page.click("#menu-close");

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
    await expect(page.locator("#menu-signout")).toBeVisible({ timeout: 10_000 });

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
    await expect(page.locator(".acc-review-row")).toHaveCount(1, { timeout: 10_000 });

    expect(captured).not.toBeNull();
    expect(captured.idToken).toBe("mock-id-token-google");
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
    await expect(page.locator("#menu-my-reviews")).toContainText("haven't written any reviews yet", { timeout: 10_000 });

    expect(captured).not.toBeNull();
    expect(captured.idToken).toBe("mock-id-token-google");
  });
});

/**
 * The magic-link "complete sign-in on return" path (src/auth.js
 * completeMagicLinkSignIn(), driven by the mocked isSignInWithEmailLink's
 * "mockSignInLink=1" URL check) was previously never exercised by any test —
 * only the interactive Google-popup path was. This drives a same-device
 * completion (email stashed in localStorage by a prior sendMagicLink() call,
 * per Firebase's own documented flow) and confirms both the account actually
 * populates AND the new one-time "Signed in" toast fires — but only for a
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

    await expect(page.locator(".snack-label", { hasText: "Signed in" })).toBeVisible({ timeout: 15_000 });
    const cached = await page.evaluate(() => JSON.parse(localStorage.getItem("hf_account") || "null"));
    expect(cached?.email).toBe("linkuser@example.com");
    // The magic-link email stash is consumed on successful completion.
    const stash = await page.evaluate(() => localStorage.getItem("hf_magic_link_email"));
    expect(stash).toBeNull();
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
