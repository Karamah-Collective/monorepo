import { test, expect } from "@playwright/test";
import { mockAdmin, stats } from "./fixtures.js";

test("overview uses API totals and links to the review queue", async ({
  page,
}) => {
  await mockAdmin(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back, Amina." }),
  ).toBeVisible();
  await expect(page.locator(".overview-metric").nth(1)).toContainText("17");
  await expect(page.locator(".category-row").first()).toContainText("68");
  await expect(page.locator(".activity-list")).toContainText("Amina Hassan");
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await expect(page).toHaveURL(/submissions\/new/);
  await page.getByRole("button", { name: "Manage", exact: true }).first().click();
  await expect(
    page.getByRole("menuitem", { name: "Approve", exact: true }),
  ).toBeVisible();
});

test("sidebar collapse persists and search supports the keyboard", async ({
  page,
}) => {
  await mockAdmin(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".pp-app-shell")).toHaveClass(/nav-is-collapsed/);
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Find a page" }).fill("places");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/places$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator(".pp-app-shell")).not.toHaveClass(
    /nav-is-collapsed/,
  );
});

test("collection search, column filtering, keyboard sorting, density and pagination", async ({
  page,
}) => {
  await mockAdmin(page);
  await page.goto("/places");
  await page
    .getByRole("searchbox", { name: "Search this collection" })
    .fill("Hakaniemi");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("searchbox").fill("no-such-record");
  await expect(page.getByText("No matching records")).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Filter Location", exact: true })
    .fill("Espoo");
  await expect(page.locator(".pp-table-count")).toHaveText("15 / 31 records");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Name", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("columnheader").first()).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(page.locator(".pp-table-card")).toHaveClass(/table-is-compact/);
  await page.getByRole("button", { name: "Compact rows" }).click();
  await expect(page.locator(".pp-table-card")).not.toHaveClass(/table-is-compact/);
  await page
    .getByRole("combobox", { name: "Rows per page" })
    .selectOption("10");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.locator(".pagination-controls")).toContainText("2 / 4");
});

test("moderation still calls the existing actions and shows feedback", async ({
  page,
}) => {
  await mockAdmin(page);
  await page.goto("/submissions/new");
  await page.getByRole("button", { name: "Manage", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Approved");
  expect(await page.evaluate(() => window.__lastMutation)).toEqual({
    action: "approve-new",
    body: { rowId: "1" },
  });
  await page.getByRole("button", { name: "Manage", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Reject", exact: true }).click();
  await page.getByPlaceholder("Reason (optional)").fill("Duplicate place");
  await page.getByRole("button", { name: "Confirm reject" }).click();
  expect(await page.evaluate(() => window.__lastMutation)).toEqual({
    action: "reject-new",
    body: { rowId: "1", reason: "Duplicate place" },
  });
});

test("inbox uses API threads and sends supported actions", async ({ page }) => {
  await mockAdmin(page, {
    "inbox-list": { threads: [{
      id: "thread-1", subject: "Partnership inquiry", participantName: "Aisha Rahman",
      participantEmail: "aisha@example.org", mailbox: "contact@karamahcollective.com",
      status: "open", unreadCount: 1, lastMessageAt: "2026-10-09T10:24:00Z",
      preview: "Could we discuss a partnership?",
    }] },
    "inbox-thread": { thread: {
      id: "thread-1", subject: "Partnership inquiry", participantName: "Aisha Rahman",
      participantEmail: "aisha@example.org", mailbox: "contact@karamahcollective.com", status: "open",
    }, messages: [{
      id: "message-1", direction: "inbound", senderName: "Aisha Rahman",
      senderEmail: "aisha@example.org", recipientEmail: "contact@karamahcollective.com",
      textBody: "Could we discuss a partnership?", createdAt: "2026-10-09T10:24:00Z",
    }] },
  });
  await page.goto("/contacts");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Aisha Rahman.*Partnership inquiry/ })).toBeVisible();
  if (process.env.INBOX_CAPTURE) await page.screenshot({ path: process.env.INBOX_CAPTURE });
  await page.getByRole("textbox", { name: "Search conversations" }).fill("no match");
  await expect(page.getByText("No matching conversations.")).toBeVisible();
  await page.getByRole("textbox", { name: "Search conversations" }).fill("");
  await expect(page.getByText("Could we discuss a partnership?").last()).toBeVisible();
  await page.getByRole("textbox", { name: "Email message" }).fill("Thank you for writing.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toContainText("Reply sent");
  expect(await page.evaluate(() => window.__lastMutation)).toEqual({
    action: "inbox-reply",
    body: {
      threadId: "thread-1", mailbox: "contact@karamahcollective.com",
      subject: "Partnership inquiry", htmlBody: "Thank you for writing.", attachments: [],
    },
  });
  await page.getByRole("button", { name: "Internal note" }).click();
  await page.getByRole("textbox", { name: "Email message" }).fill("The team will follow up on Tuesday.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("status")).toContainText("Internal note saved");
  expect(await page.evaluate(() => window.__lastMutation)).toEqual({
    action: "inbox-note",
    body: { threadId: "thread-1", htmlBody: "The team will follow up on Tuesday." },
  });
  await page.locator(".inbox-status select").selectOption("closed");
  expect(await page.evaluate(() => window.__lastMutation)).toEqual({
    action: "inbox-status", body: { threadId: "thread-1", status: "closed" },
  });
  await page.getByRole("button", { name: "New email" }).click();
  await page.getByRole("textbox", { name: "To" }).fill("new@example.org");
  await page.getByRole("textbox", { name: "Subject" }).fill("Hello");
  await expect(page.getByRole("textbox", { name: "CC", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Cc / Bcc" }).click();
  await page.getByRole("textbox", { name: "CC", exact: true }).fill("team@example.org");
  await page.getByRole("textbox", { name: "BCC", exact: true }).fill("archive@example.org");
  await page.getByRole("textbox", { name: "Email message" }).fill("A new message.");
  await page.getByRole("button", { name: "Send" }).click();
  expect(await page.evaluate(() => window.__lastMutation)).toEqual({
    action: "inbox-compose",
    body: {
      recipientEmails: ["new@example.org"], subject: "Hello",
      cc: "team@example.org", bcc: "archive@example.org",
      mailbox: "contact@karamahcollective.com", htmlBody: "A new message.", attachments: [],
    },
  });
});

for (const width of [360, 834, 1440]) {
  test(`inbox panes remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAdmin(page);
    await page.goto("/contacts");
    const list = page.getByRole("complementary", { name: "Conversations" });
    const reader = page.getByRole("region", { name: "Conversation", exact: true });
    await expect(page.locator(".inbox-row").first()).toBeVisible();
    const bounds = await list.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(260);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    if (width < 768) {
      await expect(reader).toBeHidden();
      await page.locator(".inbox-row").first().click();
      await expect(reader).toBeVisible();
      await expect(list).toBeHidden();
      await expect(reader.getByRole("heading", { name: "Partnership inquiry" })).toBeFocused();
      await page.getByRole("button", { name: "Back to conversations" }).click();
      await expect(list).toBeVisible();
      await expect(page.locator('.inbox-row[aria-current="true"]')).toBeFocused();
    } else {
      await expect(reader).toBeVisible();
      const headerDelta = await page.evaluate(() => Math.abs(
        document.querySelector(".inbox-titlebar").getBoundingClientRect().bottom -
        document.querySelector(".inbox-list-head").getBoundingClientRect().bottom,
      ));
      expect(headerDelta).toBeLessThanOrEqual(1);
    }
    await page.getByRole("button", { name: "New email" }).click();
    await expect(page.getByRole("textbox", { name: "To", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Send from email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Attach files" })).toHaveCount(1);
    expect(await page.locator(".inbox-shell").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "Cancel new email" }).click();
    await expect(list).toBeVisible();
  });
}

test("settings section switching preserves drafts and saves the full settings", async ({
  page,
}) => {
  await mockAdmin(page);
  await page.goto("/app-settings");
  await page.getByRole("tab", { name: "Startup", exact: true }).click();
  const checkbox = page.locator("#setting-welcomeEnabled");
  await checkbox.uncheck();
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.getByRole("tab", { name: "Startup", exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  expect(
    (await page.evaluate(() => window.__lastMutation)).body.settings
      .welcomeEnabled,
  ).toBe(false);
});

test("review deletion requires confirmation and uses the audited admin action", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/reviews");
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page.getByRole("button", { name: "Delete review", exact: true }).click();
  await page.getByRole("button", { name: "Confirm permanent deletion", exact: true }).click();
  expect(await page.evaluate(() => window.__lastMutation)).toEqual({
    action: "delete-review",
    body: { rowIndex: "42", reason: "" },
  });
});

test("custom event locations are visible during approval", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/events");
  const row = page.locator("tbody tr").filter({ hasText: "Community Dinner" });
  await expect(row).toContainText("Harbour Hall");
  await expect(row).toContainText("1 Seaside Way, Helsinki");
  await expect(row.getByRole("link", { name: "Harbour Hall" })).toHaveAttribute(
    "href",
    "https://maps.google.com/?q=60.166,24.952",
  );
});

test("events can be permanently deleted from the admin table", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/events");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Manage", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  expect(await page.evaluate(() => window.__lastMutation)).toEqual({
    action: "delete-event",
    body: { eventId: "event-custom-1" },
  });
  await expect(page.getByRole("status")).toContainText("Event deleted");
});

test("page search honors the unsaved settings guard", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/app-settings");
  await page.getByRole("tab", { name: "Startup", exact: true }).click();
  await page.locator("#setting-welcomeEnabled").uncheck();
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Find a page" }).fill("places");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/app-settings$/);
  await expect(page.getByRole("dialog", { name: "Find a page" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#setting-welcomeEnabled")).not.toBeChecked();
});

for (const width of [360, 390, 834, 1440])
  test(`all routes fit ${width}px and render without runtime errors`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mockAdmin(page);
    for (const route of [
      "/",
      "/places",
      "/submissions/new",
      "/submissions/edits",
      "/events",
      "/events/edits",
      "/eid",
      "/reviews",
      "/wishes",
      "/contacts",
      "/social-videos",
      "/type-styles",
      "/app-settings",
      "/workspace/weekly-report",
      "/log",
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator(".loading-state")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route,
      ).toBe(true);
      expect(
        await page
          .locator(".pp-main")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
        route,
      ).toBe(true);
    }
    expect(errors).toEqual([]);
  });

test("mobile drawer traps focus, closes on Escape and route selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdmin(page);
  await page.goto("/");
  await expect(page.locator(".pp-nav")).toHaveAttribute("inert", "");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("button", { name: "Find a page" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Places", exact: true })
    .click();
  await expect(page).toHaveURL(/\/places$/);
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("empty dashboard remains useful and reduced motion is respected", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAdmin(page, {
    "admin-stats": Object.fromEntries(
      Object.keys(stats).map((key) => [key, key === "byType" ? {} : 0]),
    ),
    "admin-log": { entries: [] },
  });
  await page.goto("/");
  await expect(page.getByText("You’re all caught up.")).toBeVisible();
  await expect(page.getByText("A fresh start")).toBeVisible();
  expect(
    await page
      .locator(".route-content")
      .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration)),
  ).toBeLessThan(0.01);
});

test("dashboard failure presents an actionable retry", async ({ page }) => {
  await mockAdmin(page, {}, true, "Service unavailable");
  await page.goto("/");
  await expect(page.getByText("Overview could not be loaded")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
});

for (const width of [390, 1440])
  test(`authentication renders at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAdmin(page, {}, false);
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Welcome back to the Collective." }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Email", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Sign up", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Create your Collective account." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
