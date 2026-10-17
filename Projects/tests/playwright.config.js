import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  // The authenticated probes share one local D1 database and one Vite dev
  // server. Parallel workers race fixture cleanup and can leave a cold route
  // with an empty document. Opt in to parallelism only with isolated services.
  fullyParallel: false,
  workers: Number(process.env.PROJECTS_TEST_WORKERS || 1),
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: { baseURL: "http://127.0.0.1:5184", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "npx vite --host 127.0.0.1 --strictPort",
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: "http://127.0.0.1:5184",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } } },
  ],
});
