import { chromium } from "@playwright/test";
import { mockAdmin } from "./fixtures.js";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
await mkdir("test-results/admin", { recursive: true });
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["tablet", 834, 1112],
  ["mobile", 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await mockAdmin(page);
  await page.goto("http://127.0.0.1:5173");
  await page.waitForTimeout(800);
  await page.screenshot({
    path: `test-results/admin/${process.argv[2] || "before"}-${name}.png`,
    fullPage: true,
  });
  console.log(
    name,
    await page
      .locator("body")
      .evaluate((el) => ({
        width: el.scrollWidth,
        viewport: innerWidth,
        text: el.innerText.slice(0, 150),
      })),
  );
  await page.close();
}
await browser.close();
