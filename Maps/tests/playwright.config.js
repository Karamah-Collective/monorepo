// @ts-check
const { defineConfig, devices } = require("@playwright/test");

/**
 * Halal Finder – Playwright Test Configuration
 *
 * Serves the app on a local static server, then runs all test suites across
 * four browser projects:
 *
 *   Desktop Chrome   – full test suite (01–11), 1920×1080
 *   Pixel 7          – Android flagship, 412×839, Chromium
 *   Galaxy S24       – Android mid-range, 360×780, Chromium
 *   iPhone 15 Pro    – iOS flagship, 393×659, WebKit/Safari
 *
 * Usage:
 *   npx playwright test            – run all tests headless
 *   npx playwright test --ui       – interactive UI mode
 *   npx playwright test --headed   – see the browser
 *   npm run test:mobile            – Pixel 7 only
 *   npm run test:android           – Galaxy S24 only
 *   npm run test:iphone            – iPhone 15 Pro only
 *   npm run test:phones            – all 3 phone projects
 */
module.exports = defineConfig({
  testDir: "./",
  outputDir: "../test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never", outputFolder: "../playwright-report" }], ["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
  },

  /* Launch a simple static file server before all tests */
  webServer: {
    command: "npx serve . -l 4173 --no-clipboard",
    cwd: require('node:path').resolve(__dirname, '..'),
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  projects: [
    /* ── Desktop ─────────────────────────────────────────────────────── */
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/12-mobile.spec.js"], // mobile-only spec skipped on desktop
    },

    /* ── Android ─────────────────────────────────────────────────────── */
    {
      name: "Pixel 7",
      use: { ...devices["Pixel 7"] }, // 412×839, Chromium
    },
    {
      name: "Galaxy S24",
      use: { ...devices["Galaxy S24"] }, // 360×780, Chromium
    },

    /* ── iOS ─────────────────────────────────────────────────────────── */
    {
      name: "iPhone 15 Pro",
      use: { ...devices["iPhone 15 Pro"] }, // 393×659, WebKit/Safari
      // 09-tutorial full walkthrough and 10-suggest-edit have WebKit-specific
      // browser-close issues under rapid parallel load; covered by Android.
      testIgnore: ["**/09-tutorial.spec.js", "**/10-suggest-edit.spec.js"],
    },
  ],

});
