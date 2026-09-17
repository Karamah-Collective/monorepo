import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: ["admin.spec.js", "website.spec.js", "link-hub.spec.js"],
  outputDir: "../../test-results/admin-tests",
  fullyParallel: true,
  workers: 3,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:ui -- --host 127.0.0.1",
    cwd: "..",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
