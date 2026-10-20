const { test, expect, setupApp } = require("./helpers");

const TEST_UID = "install-session-test";
const COOLDOWN_KEY = `hf_install_session_cooldown:${TEST_UID}`;
const SESSION_KEY = `hf_install_session_seen:${TEST_UID}`;

async function triggerSignedInSession(page) {
  await page.evaluate(({ uid, sessionKey }) => {
    sessionStorage.removeItem(sessionKey);
    window.dispatchEvent(new CustomEvent("hf:auth-changed", {
      detail: { account: { uid, email: "install@example.com", displayName: "Install Test" } },
    }));
  }, { uid: TEST_UID, sessionKey: SESSION_KEY });
}

test.describe("Install reminder cadence", () => {
  test.beforeEach(async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) > 768, "Phone-only install experience");
    await page.addInitScript(({ cooldownKey, sessionKey }) => {
      localStorage.setItem("hf_tutorial_v1", "done");
      localStorage.removeItem("hf_install_confirmed");
      localStorage.removeItem(cooldownKey);
      sessionStorage.removeItem(sessionKey);
    }, { cooldownKey: COOLDOWN_KEY, sessionKey: SESSION_KEY });
    await setupApp(page);
  });

  test("automatic expiry leaves the next session eligible", async ({ page }) => {
    await triggerSignedInSession(page);
    const toast = page.locator(".share-toast-action-shell", { hasText: "Install Manarah" });
    await expect(toast).toBeVisible({ timeout: 6_000 });
    await expect(toast).toBeHidden({ timeout: 12_000 });
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), COOLDOWN_KEY)).toBeNull();
  });

  test("Close suppresses five sessions, then restores the reminder", async ({ page }) => {
    await triggerSignedInSession(page);
    const toast = page.locator(".share-toast-action-shell", { hasText: "Install Manarah" });
    await expect(toast).toBeVisible({ timeout: 6_000 });
    await toast.getByRole("button", { name: "Close install reminder" }).click();
    await expect(toast).toBeHidden();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), COOLDOWN_KEY)).toBe("5");

    for (let session = 0; session < 5; session += 1) {
      await triggerSignedInSession(page);
      await page.waitForTimeout(100);
      await expect(page.locator(".share-toast-action-shell", { hasText: "Install Manarah" })).toHaveCount(0);
    }

    await triggerSignedInSession(page);
    await expect(page.locator(".share-toast-action-shell", { hasText: "Install Manarah" })).toBeVisible({ timeout: 6_000 });
  });
});
