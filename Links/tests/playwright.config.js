import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 20_000,
  use: { baseURL: 'http://127.0.0.1:4178', trace: 'retain-on-failure' },
  webServer: { command: 'npx serve dist -l 4178', port: 4178, reuseExistingServer: false },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 13'] } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
