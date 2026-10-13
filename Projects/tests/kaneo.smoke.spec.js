import { test, expect } from "@playwright/test";

async function expectNoOverflow(page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

test("Projects authentication surface renders without the legacy custom app", async ({ page }, testInfo) => {
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to Projects" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Failed to fetch instance status")).toHaveCount(0);
  await expectNoOverflow(page);
  await page.screenshot({ path: `test-results/projects-auth-${testInfo.project.name}.png`, fullPage: true });
});

test("Projects auth surface stays within a phone viewport", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to Projects" })).toBeVisible({ timeout: 15_000 });
  await expectNoOverflow(page);
});

