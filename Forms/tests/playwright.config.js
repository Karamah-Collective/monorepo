import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "public.spec.js",
  outputDir: "../../test-results/forms-tests",
  workers: 2,
  timeout: 20_000,
  use: { baseURL: "http://127.0.0.1:8791", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "npx serve -s dist -l 8791", cwd: "..", url: "http://127.0.0.1:8791", reuseExistingServer: !process.env.CI },
});
