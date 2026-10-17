import { test, expect } from "@playwright/test";

const PUBLIC_AUTH_ROUTES = [
  ["/auth/sign-in", /sign in/i],
  ["/auth/sign-up", /sign up|create account/i],
  ["/auth/forgot-password", /forgot|reset/i],
  ["/auth/reset-password", /password|reset/i],
  ["/auth/verify-otp?email=qa%40example.com", /code|verification/i],
  ["/device", /device|code/i],
  ["/device/approve?code=invalid", /device|code|sign in/i],
  ["/mcp/authorize", /authorize|sign in|expired|connect/i],
];

test("public auth and device routes render safe validation surfaces", async ({ page }) => {
  test.setTimeout(120_000);
  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`);
  });

  for (const [route, expectedText] of PUBLIC_AUTH_ROUTES) {
    console.log(`checking public route ${route}`);
    const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 10_000 });
    expect(response?.status(), `${route} returned a transport error`).toBeLessThan(500);
    await expect(page.locator("body")).not.toContainText(/Application error|Cannot read properties|Unexpected Application Error/i);
    // The first route can be the coldest request in a fresh dev server. Wait
    // for the app shell rather than treating a transient empty document as a
    // product failure; the route status and page-error assertions above still
    // fail hard for an actual render error.
    await expect.poll(() => page.evaluate(() => document.body.innerText.length), { timeout: 15_000 }).toBeGreaterThan(30);
    await expect(page.locator("body"), `${route} lost its primary auth/device surface`).toContainText(expectedText);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${route} overflows horizontally`).toBe(true);
  }

  await page.goto("/auth/sign-in", { waitUntil: "domcontentloaded" });
  const signInEmail = page.locator('input[type="email"]').first();
  const signInPassword = page.locator('input[type="password"]').first();
  await expect(signInEmail).toBeVisible({ timeout: 15_000 });
  await expect(signInPassword).toBeVisible({ timeout: 15_000 });
  await signInEmail.fill("not-an-email");
  await signInPassword.fill("x");
  await page.locator('button[type="submit"]').first().click();
  expect(await signInEmail.evaluate((input) => input.validity.valid)).toBe(false);
  expect(page.url()).toMatch(/\/auth\/sign-in/);

  // Exercise the provider-failure surface without depending on an external
  // Firebase retry/backoff window in the local browser environment.
  await page.route("**/*googleapis.com/**", (route) => route.abort());
  await signInEmail.fill("qa-nonexistent-2026@example.com");
  await signInPassword.fill("definitely-wrong-password");
  await page.locator('button[type="submit"]').first().click({ noWaitAfter: true });
  await page.waitForTimeout(1_000);
  await expect(page.locator("body")).not.toContainText(/Application error|Cannot read properties/i);
  await expect(page).toHaveURL(/\/auth\/sign-in/);

  await page.goto("/auth/forgot-password", { waitUntil: "domcontentloaded" });
  const forgotEmail = page.locator('input[type="email"]').first();
  await expect.poll(async () => {
    if (await forgotEmail.isVisible().catch(() => false)) return true;
    return /unavailable|configuration/i.test(await page.locator("body").innerText().catch(() => ""));
  }, { timeout: 15_000 }).toBe(true);
  if (await forgotEmail.isVisible().catch(() => false)) {
    await forgotEmail.fill("not-an-email");
    await page.locator('button[type="submit"]').first().click();
    expect(await forgotEmail.evaluate((input) => input.validity.valid)).toBe(false);
  } else {
    await expect(page.locator("body")).toContainText(/unavailable|configuration|reset/i);
  }

  await page.goto("/auth/sign-up", { waitUntil: "domcontentloaded" });
  const signUpEmail = page.locator('input[type="email"]').first();
  await expect(signUpEmail).toBeVisible();
  await signUpEmail.fill("not-an-email");
  await page.locator('button[type="submit"]').first().click();
  expect(await signUpEmail.evaluate((input) => input.validity.valid)).toBe(false);

  expect(failures, failures.join("\n")).toEqual([]);
});

test("public auth surfaces remain usable at mobile width and keyboard focus is visible", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/auth/sign-in", { waitUntil: "domcontentloaded" });
  const email = page.locator('input[type="email"]').first();
  const password = page.locator('input[type="password"]').first();
  const submit = page.locator('button[type="submit"]').first();
  await expect(email).toBeVisible({ timeout: 15_000 });
  await email.focus();
  await expect(email).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await submit.focus();
  await expect(submit).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.goto("/auth/verify-otp?email=qa%40example.com", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).not.toContainText(/Application error|Cannot read properties/i);
  await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    offenders: [...document.querySelectorAll("*")]
      .map((element) => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right, left: element.getBoundingClientRect().left }))
      .filter((item) => item.right > window.innerWidth + 1 || item.left < -1)
      .slice(0, 10),
  }));
  console.log(`verify-otp overflow metrics ${JSON.stringify(overflow)}`);
  expect(overflow.documentWidth <= overflow.viewport + 1).toBe(true);
});
