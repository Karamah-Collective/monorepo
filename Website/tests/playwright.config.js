import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'website.spec.js', workers: 2,
  outputDir: '../../test-results/website-tests',
  use: { baseURL: 'http://127.0.0.1:4175', viewport: { width: 1280, height: 900 }, screenshot: 'only-on-failure' },
  webServer: { command: 'npx serve . -l 4175 --no-clipboard', cwd: '..', url: 'http://127.0.0.1:4175', reuseExistingServer: !process.env.CI },
});
