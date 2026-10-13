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
  await expect(page.locator(".count-pill")).toContainText("17");
  await expect(page.locator(".category-list a").first()).toContainText("68");
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
  await page.getByRole("textbox", { name: "Search workspace" }).fill("places");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/places$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator(".pp-app-shell")).not.toHaveClass(
    /nav-is-collapsed/,
  );
});

test("projects overview hands detailed work to the separate app", async ({
  page,
}) => {
  await mockAdmin(page, {
    "project-list": { projects: [{ id: "project-1", name: "Website refresh", key: "WEB", description: "Content work.", visibility: "workspace" }] },
    "project-get": { project: { id: "project-1", name: "Website refresh", key: "WEB", description: "Content work.", visibility: "workspace" }, role: "manager", taskCount: 1 },
  });
  await page.goto("/workspace/projects");
  await expect(page.getByRole("heading", { name: "Projects overview" })).toBeVisible();
  const open = page.getByRole("link", { name: /Open project workspace/ });
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("href", /5184\/workspace\/projects\/project-1/);
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
    "inbox-list": { mailboxes: ["manarah@karamahcollective.com"], threads: [{
      id: "thread-1", subject: "Partnership inquiry", participantName: "Aisha Rahman",
      participantEmail: "aisha@example.org", mailbox: "manarah@karamahcollective.com",
      status: "open", unreadCount: 1, lastMessageAt: "2026-10-09T10:24:00Z",
      preview: "Could we discuss a partnership?",
    }] },
    "inbox-thread": { thread: {
      id: "thread-1", subject: "Partnership inquiry", participantName: "Aisha Rahman",
      participantEmail: "aisha@example.org", mailbox: "manarah@karamahcollective.com", status: "open",
    }, messages: [{
       id: "message-empty", direction: "inbound", senderName: "Aisha Rahman",
       senderEmail: "aisha@example.org", recipientEmail: "manarah@karamahcollective.com",
       htmlBody: "<div><br></div><div><span>&nbsp;</span></div>", textBody: " \n \n", createdAt: "2026-10-09T10:18:00Z",
     }, {
       id: "message-0", direction: "inbound", senderName: "Aisha Rahman",
      senderEmail: "aisha@example.org", recipientEmail: "manarah@karamahcollective.com",
      textBody: "Earlier context from the partnership thread.", createdAt: "2026-10-09T10:20:00Z",
    }, {
      id: "message-1", direction: "inbound", senderName: "Aisha Rahman",
      senderEmail: "aisha@example.org", recipientEmail: "manarah@karamahcollective.com",
      textBody: "Could we discuss a partnership?", createdAt: "2026-10-09T10:24:00Z",
    }, {
      id: "message-2", direction: "outbound", senderName: "Amina Hassan",
      senderEmail: "manarah@karamahcollective.com", recipientEmail: "aisha@example.org",
      textBody: "Thanks, I will follow up shortly.", createdAt: "2026-10-09T10:30:00Z",
    }, {
      id: "message-3", direction: "outbound", senderName: "Home",
      senderEmail: "manarah@karamahcollective.com", recipientEmail: "aisha@example.org",
      textBody: "I will also review this.", createdAt: "2026-10-09T10:31:00Z",
    }] },
  });
  await page.goto("/contacts");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Email", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mail accounts" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Mail folders" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a mail folder" })).toBeVisible();
  await page.getByRole("button", { name: "Choose a mail folder" }).click();
  await expect(page.getByRole("listbox", { name: "Choose a mail folder" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Junk", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Change mail account" }).click();
  await expect(page.getByRole("menu", { name: "Choose mail account" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: /Manarah support/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Sort and filter mail" })).toHaveCount(0);
  await expect(page.locator("body")).toHaveCSS("font-family", /Plus Jakarta Sans/);
  await expect(page.locator(".inbox-account-context")).toContainText("manarah@karamahcollective.com");
  await expect(page.getByRole("button", { name: /Aisha Rahman.*Partnership inquiry/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync Manarah support" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change mail account" })).toBeVisible();
  if (process.env.INBOX_CAPTURE) await page.screenshot({ path: process.env.INBOX_CAPTURE });
  await expect(page.getByRole("button", { name: "Search mail" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sort and filter mail" })).toHaveCount(0);
  await page.getByRole("button", { name: "Search workspace" }).click();
  await page.getByRole("textbox", { name: "Search workspace" }).fill("partnership");
  await expect(page.getByRole("link", { name: /Partnership inquiry/ })).toBeVisible();
  await page.getByRole("link", { name: /Partnership inquiry/ }).click();
  await expect(page).toHaveURL(/\/contacts\?folder=all&search=partnership/);
  await expect(page.getByText("I will also review this.").last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Show earlier messages" })).toBeVisible();
  await expect(page.getByText("Earlier context from the partnership thread.")).toBeHidden();
  await page.getByRole("button", { name: "Show earlier messages" }).click();
  await expect(page.getByText("Earlier context from the partnership thread.")).toBeVisible();
  await page.getByRole("button", { name: "Hide earlier messages" }).click();
  await expect(page.getByText("Earlier context from the partnership thread.")).toBeHidden();
  const emailComposerBounds = await page.locator(".inbox-compose").boundingBox();
  expect(emailComposerBounds).not.toBeNull();
  await page.getByRole("button", { name: "Use chat mode" }).click();
  await expect(page.locator(".inbox-chat-thread")).toBeVisible();
  const chatThreadBounds = await page.locator(".inbox-chat-thread").boundingBox();
  const chatListBounds = await page.locator(".inbox-chat-list").boundingBox();
  const chatPaddingBottom = await page.locator(".inbox-chat-thread").evaluate(element => parseFloat(getComputedStyle(element).paddingBottom) || 0);
  expect(chatThreadBounds).not.toBeNull();
  expect(chatListBounds).not.toBeNull();
  expect(chatListBounds.y + chatListBounds.height).toBeGreaterThanOrEqual(chatThreadBounds.y + chatThreadBounds.height - chatPaddingBottom - 3);
  const chatComposerBounds = await page.locator(".inbox-compose").boundingBox();
  expect(chatComposerBounds).not.toBeNull();
  expect(Math.abs(chatComposerBounds.height - emailComposerBounds.height)).toBeLessThanOrEqual(1);
  expect(await page.locator(".inbox-view-pane").first().evaluate(element => getComputedStyle(element).transitionDuration)).not.toBe("0s");
  await expect(page.locator(".inbox-chat-message.is-inbound")).toHaveCount(2);
  await expect(page.locator(".inbox-chat-message.is-inbound").first()).toBeVisible();
   const inboundWidths = await page.locator(".inbox-chat-message.is-inbound .inbox-chat-bubble").evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().width)));
   expect(new Set(inboundWidths).size).toBeGreaterThan(1);
  await expect(page.locator(".inbox-chat-message.is-own .inbox-chat-meta strong")).toHaveText("You");
  await expect(page.locator(".inbox-chat-message.is-admin .inbox-chat-meta strong")).toHaveText("Home");
  const lightChatColors = await page.evaluate(() => ({
    own: getComputedStyle(document.querySelector(".inbox-chat-message.is-own .inbox-chat-bubble")).backgroundColor,
    admin: getComputedStyle(document.querySelector(".inbox-chat-message.is-admin .inbox-chat-bubble")).backgroundColor,
    inbound: getComputedStyle(document.querySelector(".inbox-chat-message.is-inbound .inbox-chat-bubble")).backgroundColor,
  }));
  expect(lightChatColors.own).not.toBe(lightChatColors.admin);
  expect(lightChatColors.inbound).toBe("rgba(0, 0, 0, 0)");
  await page.evaluate(() => { document.documentElement.dataset.adminTheme = "dark"; });
  const darkChatColors = await page.evaluate(() => ({
    own: getComputedStyle(document.querySelector(".inbox-chat-message.is-own .inbox-chat-bubble")).backgroundColor,
    admin: getComputedStyle(document.querySelector(".inbox-chat-message.is-admin .inbox-chat-bubble")).backgroundColor,
  }));
  expect(darkChatColors.own).not.toBe(lightChatColors.own);
  expect(darkChatColors.admin).not.toBe(lightChatColors.admin);
  expect(darkChatColors.own).not.toBe(darkChatColors.admin);
  await page.evaluate(() => { document.documentElement.dataset.adminTheme = "light"; });
  await page.reload();
  await expect(page.getByRole("button", { name: "Use email view" })).toBeVisible();
  expect(await page.locator(".inbox-chat-message.is-own .inbox-chat-bubble").evaluate(node => ({ fontFamily:getComputedStyle(node).fontFamily, fontSize:getComputedStyle(node).fontSize }))).toMatchObject({ fontFamily: expect.stringMatching(/Plus Jakarta Sans/), fontSize: "14px" });
  await page.getByRole("button", { name: "Use email view" }).click();
  await expect(page.getByRole("combobox", { name: "Message typeface" })).toHaveValue("Plus Jakarta Sans");
  await expect(page.getByRole("combobox", { name: "Message typeface" }).locator("option", { hasText: "Times New Roman" })).toHaveCount(1);
  await page.getByRole("combobox", { name: "Message typeface" }).selectOption("Georgia");
  await expect(page.locator(".inbox-editor")).toHaveCSS("font-family", /Georgia/);
  await page.getByRole("combobox", { name: "Message font size" }).selectOption("18");
  await expect(page.locator(".inbox-editor")).toHaveCSS("font-size", "18px");
  await page.getByRole("textbox", { name: "Email message" }).fill("Thank you for writing.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toContainText("Reply sent");
  expect(await page.evaluate(() => window.__lastMutation)).toEqual({
    action: "inbox-reply",
    body: {
      threadId: "thread-1",
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
      mailbox: "manarah@karamahcollective.com", htmlBody: "A new message.", attachments: [],
    },
  });
});

test("universal sidebar exposes one email entry", async ({ page }) => {
  await mockAdmin(page, {
    "inbox-list": { mailboxes: ["amina@example.test", "contact@karamahcollective.com"], threads: [] },
  });
  await page.goto("/contacts");
  await expect(page.getByRole("link", { name: "Email", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mail accounts" })).toHaveCount(0);
});

test("account switching keeps the active folder", async ({ page }) => {
  await mockAdmin(page, {
    "inbox-list": { mailboxes: ["amina@example.test", "contact@karamahcollective.com"], threads: [] },
  });
  await page.goto("/contacts?folder=Sent");
  await expect(page.locator(".breadcrumbs")).toContainText("Communications");
  await expect(page.locator(".breadcrumbs")).toContainText("Sent");
  await page.getByRole("button", { name: "Change mail account" }).click();
  await page.getByRole("menuitemradio", { name: /Contact support/ }).click();
  await expect(page).toHaveURL(/folder=Sent&mailbox=contact%40karamahcollective\.com/);
  await expect(page.getByRole("button", { name: "Choose a mail folder" })).toContainText("Sent");
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
      const mobileReaderBounds = await reader.boundingBox();
      const mobileThreadBounds = await page.locator(".inbox-thread").boundingBox();
      const mobileComposerBounds = await page.locator(".inbox-compose").boundingBox();
      expect(mobileReaderBounds).not.toBeNull();
      expect(mobileThreadBounds).not.toBeNull();
      expect(mobileComposerBounds).not.toBeNull();
      expect(mobileThreadBounds.y + mobileThreadBounds.height).toBeLessThanOrEqual(mobileComposerBounds.y + 1);
      expect(mobileComposerBounds.y + mobileComposerBounds.height).toBeLessThanOrEqual(mobileReaderBounds.y + mobileReaderBounds.height + 1);
      await expect(page.locator(".inbox-compose")).toHaveClass(/is-compact/);
      await page.locator(".inbox-thread").hover();
      await page.mouse.wheel(0, 500);
      await expect(page.locator(".inbox-compose")).toHaveClass(/is-compact/);
      await page.locator(".inbox-editor").click();
      await expect(page.locator(".inbox-compose")).not.toHaveClass(/is-compact/);
      const expandedComposerBounds = await page.locator(".inbox-compose").boundingBox();
      expect(expandedComposerBounds.height).toBeGreaterThan(mobileComposerBounds.height);
      const beforeCollapseBottomGap = await page.locator(".inbox-thread").evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight);
      await page.waitForTimeout(600);
      await page.locator(".inbox-thread").hover();
      await page.mouse.wheel(0, 500);
      await expect(page.locator(".inbox-compose")).toHaveClass(/is-compact/);
      await page.waitForTimeout(350);
      const afterCollapseBottomGap = await page.locator(".inbox-thread").evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight);
      expect(Math.abs(afterCollapseBottomGap - beforeCollapseBottomGap)).toBeLessThanOrEqual(2);
      await page.locator(".inbox-editor").click();
      await expect(page.locator(".inbox-compose")).not.toHaveClass(/is-compact/);
      const shell = await page.locator(".inbox-shell").boundingBox();
      expect(shell.x).toBe(0);
      expect(shell.width).toBe(width);
      await expect(reader.getByRole("heading", { name: "Partnership inquiry" })).toBeVisible();
      await page.setViewportSize({ width, height: 620 });
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1 && document.body.scrollHeight <= window.innerHeight + 1)).toBe(true);
      await expect(page.locator(".workspace-footer")).toBeHidden();
      await expect(page.getByRole("button", { name: "More formatting" })).toBeVisible();
      await expect(page.locator(".inbox-toolbar-advanced")).toBeHidden();
      await page.getByRole("button", { name: "More formatting" }).click();
      await expect(page.locator(".inbox-toolbar-advanced")).toBeVisible();
      await page.getByRole("button", { name: "Back to conversations" }).click();
      await expect(list).toBeVisible();
      await expect(page.locator('.inbox-row[aria-current="true"]')).toBeFocused();
    } else {
      await expect(reader).toBeVisible();
      const mailboxHeaderBounds = await page.locator(".inbox-list-head").boundingBox();
      expect(mailboxHeaderBounds).not.toBeNull();
      expect(mailboxHeaderBounds.height).toBeGreaterThan(80);
      await expect(page.locator(".inbox-list-head")).toContainText("Folder");
      await expect(page.locator(".inbox-mailbox-tabs")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1 && document.body.scrollHeight <= window.innerHeight + 1)).toBe(true);
    }
    await page.getByRole("button", { name: "New email" }).click();
    await expect(page.getByRole("textbox", { name: "To", exact: true })).toBeVisible();
    await expect(page.locator(".inbox-from-address")).toBeVisible();
    await expect(page.locator(".inbox-from-address")).toHaveText(/^(manarah|contact)@karamahcollective\.com$/);
    await expect(page.getByRole("button", { name: "Attach files" })).toHaveCount(1);
    expect(await page.locator(".inbox-shell").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "Cancel new email" }).click();
    await expect(list).toBeVisible();
  });
}

test("inbox shows a named other-admin typing indicator in real time", async ({ browser }) => {
  const context = await browser.newContext();
  const firstAdmin = await context.newPage();
  const secondAdmin = await context.newPage();
  const overrides = {
    "inbox-list": { mailboxes: ["manarah@karamahcollective.com"], threads: [{
      id: "typing-thread", subject: "Typing presence", participantName: "Aisha Rahman",
      participantEmail: "aisha@example.org", mailbox: "manarah@karamahcollective.com", status: "open", unreadCount: 0,
      lastMessageAt: "2026-10-09T10:24:00Z", preview: "Hello",
    }] },
    "inbox-thread": { thread: {
      id: "typing-thread", subject: "Typing presence", participantName: "Aisha Rahman",
      participantEmail: "aisha@example.org", mailbox: "manarah@karamahcollective.com", status: "open",
    }, messages: [{
      id: "typing-message", direction: "inbound", senderName: "Aisha Rahman", senderEmail: "aisha@example.org",
      recipientEmail: "manarah@karamahcollective.com", textBody: "Hello", createdAt: "2026-10-09T10:24:00Z",
    }] },
  };
  await mockAdmin(firstAdmin, overrides);
  await mockAdmin(secondAdmin, overrides, true, "", { displayName: "Home", email: "home@example.test", emailVerified: true });
  await Promise.all([firstAdmin.goto("/contacts"), secondAdmin.goto("/contacts")]);
  await Promise.all([
    firstAdmin.getByRole("button", { name: "Use chat mode" }).click(),
    secondAdmin.getByRole("button", { name: "Use chat mode" }).click(),
  ]);
  await secondAdmin.getByRole("textbox", { name: "Email message" }).fill("Home is composing");
  await expect(firstAdmin.getByRole("status", { name: "Home is typing" })).toBeVisible();
  await firstAdmin.close();
  await secondAdmin.close();
  await context.close();
});

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
  await page.getByRole("textbox", { name: "Search workspace" }).fill("places");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/app-settings$/);
  await expect(page.getByRole("dialog", { name: "Search workspace" })).toBeVisible();
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
      await expect(page.locator(".pp-page, .forms-page, .link-hub-page, .qr-generator-page").first()).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Search workspace" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Maps", exact: true }).click({ force: true });
  await expect(page.getByRole("button", { name: "Maps", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Places", exact: true })
    .click({ force: true });
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
  await expect(page.getByText("New submissions will appear here when they arrive.")).toBeVisible();
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

test("deferred Operations surfaces stay hidden until rollout", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/workspace/queue");
  await expect(page.getByRole("heading", { name: "That workspace page is not available." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Work queue", exact: true })).toHaveCount(0);
  await page.goto("/workspace/history");
  await expect(page.getByRole("heading", { name: "That workspace page is not available." })).toBeVisible();
  await expect(page.getByRole("link", { name: "History & rollback", exact: true })).toHaveCount(0);
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
