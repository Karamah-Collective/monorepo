import { chromium } from "@playwright/test";
import { mockAdmin } from "./fixtures.js";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
await mkdir("test-results/admin", { recursive: true });
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await mockAdmin(page);
  for (const route of ["/places", "/app-settings", "/type-styles"]) {
    await page.goto(`http://127.0.0.1:5173${route}`);
    await page.waitForTimeout(450);
    if (route === "/type-styles")
      await page.locator(".pp-type-style-summary").first().click();
    await page.screenshot({
      path: `test-results/admin/${route.slice(1)}-${width}.png`,
    });
  }
  await page.close();
  const authPage = await browser.newPage({ viewport: { width, height: 1000 } });
  await mockAdmin(authPage, {}, false);
  await authPage.goto("http://127.0.0.1:5173/login");
  await authPage.waitForTimeout(450);
  await authPage.screenshot({
    path: `test-results/admin/login-${width}.png`,
    fullPage: true,
  });
  await authPage.close();
}
await browser.close();
