import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "public.spec.js",
  outputDir: "../../test-results/forms-tests",
  workers: 2,
  timeout: 20_000,
  use: { baseURL: "http://127.0.0.1:8793", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "npx wrangler pages dev dist --port 8793 --ip 127.0.0.1 --persist-to ../Maps/.wrangler/state", cwd: "..", url: "http://127.0.0.1:8793", reuseExistingServer: false, env: { DEV_SKIP_TURNSTILE: "true" } },
});
