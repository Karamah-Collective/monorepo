/**
 * Shared test helpers for Halal Finder test suite.
 *
 * Provides a pre-configured `test` fixture that:
 *   1. Navigates to the app
 *   2. Waits for the map to fully load (tiles + data)
 *   3. Dismisses the tutorial overlay if visible
 *   4. Exposes convenience selectors
 */
const base = require("@playwright/test");

exports.test = base.test.extend({
  page: async ({ page }, use) => {
    // Strip the Firebase CDN <script>'s SRI `integrity` attribute from the
    // served HTML document only. The mocked firebase-app.js/firebase-auth.js
    // bodies below legitimately won't match the real file's SRI hash, and the
    // browser correctly (and silently, with only a console error) blocks any
    // <script integrity=...> whose fetched body doesn't match — this rewrite
    // is what makes the mocks actually load instead of leaving auth.js unable
    // to import from a blocked module. Registered before the more specific
    // routes below so Playwright's LIFO route order tries those first for
    // any URL they actually match (this one only ever matches the document
    // navigation request, which none of the others do).
    await page.route("**/*", async (route) => {
      if (route.request().resourceType() !== "document") return route.continue();
      const response = await route.fetch();
      const original = await response.text();
      const stripped = original.replace(
        /(<script type="module" src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]*")\s+integrity="sha384-[^"]*"\s+crossorigin="anonymous"(><\/script>)/g,
        "$1$2",
      );
      await route.fulfill({ response, body: stripped });
    });

    // Block external API calls that are slow / flaky in tests
    await page.route("**/api.aladhan.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            timings: {
              Fajr: "04:30", Sunrise: "06:00", Dhuhr: "12:30",
              Asr: "15:45", Maghrib: "18:30", Isha: "20:00",
            },
            date: { hijri: { month: { number: 1 } } },
          },
        }),
      }),
    );
    await page.route("**/ipwho.is/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ country_code: "FI" }),
      }),
    );
    await page.route("**/ipapi.co/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ country_code: "FI" }),
      }),
    );
    await page.route("**/api/geo", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ country: "FI" }),
      }),
    );
    // Block reCAPTCHA to avoid loading third-party scripts
    await page.route("**/google.com/recaptcha/**", (route) => route.abort());
    await page.route("**/gstatic.com/recaptcha/**", (route) => route.abort());

    // Mock the Firebase Auth CDN modules (index.html loads these eagerly on
    // every page load — see src/auth.js) so every test runs deterministically
    // offline instead of depending on live gstatic.com/Firebase reachability.
    // Exposes window.__mockAuth for tests to drive sign-in/out directly.
    await page.route("**/firebase-app.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "export function initializeApp(config) { return { config }; }",
      }),
    );
    await page.route("**/firebase-auth.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          let _currentUser = null;
          const _listeners = new Set();
          function _notify() { for (const cb of _listeners) cb(_currentUser); }
          window.__mockAuth = {
            get user() { return _currentUser; },
            setUser(u) { _currentUser = u; _notify(); },
          };
          export function getAuth(app) { return { app, get currentUser() { return _currentUser; } }; }
          export class GoogleAuthProvider {}
          export async function signInWithPopup() {
            _currentUser = window.__mockGoogleUser || {
              uid: "mock-uid-google", email: "mockuser@example.com", displayName: "Mock User",
              getIdToken: async () => "mock-id-token-google",
            };
            _notify();
            return { user: _currentUser };
          }
          export async function sendSignInLinkToEmail(auth, email, actionCodeSettings) {
            window.__mockMagicLinkSent = { email, actionCodeSettings };
          }
          export function isSignInWithEmailLink(auth, url) {
            return url.includes("mockSignInLink=1");
          }
          export async function signInWithEmailLink(auth, email) {
            _currentUser = { uid: "mock-uid-email", email, displayName: "", getIdToken: async () => "mock-id-token-email" };
            _notify();
            return { user: _currentUser };
          }
          export function onAuthStateChanged(auth, cb) {
            _listeners.add(cb);
            cb(_currentUser);
            return () => _listeners.delete(cb);
          }
          export async function signOut() { _currentUser = null; _notify(); }
        `,
      }),
    );

    await use(page);
  },
});

exports.expect = base.expect;

/**
 * Navigate to the app and wait for the map + places data to be ready.
 */
exports.loadApp = async function loadApp(page) {
  await page.goto("/");
  // Wait for MapLibre to fire its "load" event (places data starts loading there)
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#map canvas");
    return canvas && canvas.offsetWidth > 0;
  }, { timeout: 30_000 });
  // Wait for places to render (badge appears)
  await page.waitForSelector("#places-badge:not(.hide)", { timeout: 15_000 }).catch(() => {});
  // Small settle time for animations
  await page.waitForTimeout(600);
};

/**
 * Dismiss the first-run tutorial if it's showing.
 */
exports.dismissTutorial = async function dismissTutorial(page) {
  const tutClose = page.locator(".tut-close");
  if (await tutClose.isVisible({ timeout: 2000 }).catch(() => false)) {
    await tutClose.click();
    await page.waitForTimeout(400);
  }
};

/**
 * Open the app AND dismiss tutorial in one call.
 */
exports.setupApp = async function setupApp(page) {
  // Set tutorial as already seen so it doesn't appear
  await page.addInitScript(() => {
    localStorage.setItem("hf_tutorial_v1", "done");
  });
  await exports.loadApp(page);
};
