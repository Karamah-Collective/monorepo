import { test, expect } from "@playwright/test";

const liveFixtureEnabled = process.env.PROJECTS_LIVE_AUTH === "1";
test.skip(!liveFixtureEnabled, "Set PROJECTS_LIVE_AUTH=1 when local Maps and Projects services are running.");
test.use({ storageState: process.env.PROJECTS_AUTH_STATE || "Projects/tests/.auth/user.json" });

const projectRoot = "/dashboard/workspace/workspace-default/project/project-admin-operations";
const boardRoute = `${projectRoot}/board`;

async function installFailureCapture(page) {
  const failures = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`);
  });
  return failures;
}

async function expectHealthyPage(page, route) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 20_000 });
  expect(response?.status(), `${route} returned a transport error`).toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/auth\/sign-in/);
  await expect.poll(() => page.evaluate(() => document.body.innerText.length)).toBeGreaterThan(60);
  await expect(page.locator("body")).not.toContainText(/Application error|Cannot read properties|Unexpected Application Error|Failed to fetch instance status/i);
  if (page.viewportSize()?.width <= 500) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${route} overflows horizontally`).toBe(true);
  }
}

test("project board filters and display controls are interactive", async ({ page }) => {
  test.setTimeout(90_000);
  const failures = await installFailureCapture(page);
  await expectHealthyPage(page, boardRoute);

  const filterButton = page.getByRole("button", { name: /^filter$/i });
  await expect(filterButton).toBeVisible();
  await filterButton.click();
  await expect(page.getByPlaceholder(/add filter/i)).toBeVisible();
  for (const label of ["Status", "Assignee", "Priority", "Labels", "Due date"]) {
    await expect(page.getByRole("option", { name: new RegExp(label, "i") })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder(/add filter/i)).toHaveCount(0);

  const displayButton = page.getByRole("button", { name: /^display$/i });
  await expect(displayButton).toBeVisible();
  await displayButton.click();
  await expect(page.getByRole("group", { name: /layout/i })).toBeVisible();
  for (const label of ["Board", "List", "Calendar", "Gantt"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${label}$`, "i") })).toBeVisible();
  }
  await expect(page.getByText(/sort by/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^reset$/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: /layout/i })).toHaveCount(0);

  expect(failures, failures.join("\n")).toEqual([]);
});

test("project views and task detail render their primary surfaces", async ({ page }) => {
  test.setTimeout(120_000);
  const failures = await installFailureCapture(page);
  const routes = [
    [boardRoute, /tasks|board|add task/i],
    [`${projectRoot}/backlog`, /backlog|planned|tasks/i],
    [`${projectRoot}/calendar`, /calendar|scheduled|nothing scheduled/i],
    [`${projectRoot}/gantt`, /gantt|timeline|scheduled/i],
    ["/dashboard/workspace/workspace-default/timeline", /timeline|activity|tasks/i],
  ];
  for (const [route, expected] of routes) {
    await expectHealthyPage(page, route);
    await expect(page.locator("body")).toContainText(expected);
  }

  await expectHealthyPage(page, `${boardRoute}?taskId=local-operations-orientation`);
  await expect(page.locator("body")).toContainText(/local operations orientation|properties|activity|description/i);
  for (const label of ["Activity", "Relations", "Sub-tasks", "Resources"]) {
    await expect(page.getByText(new RegExp(`^${label}$`, "i"))).toBeVisible();
  }
  if (page.viewportSize()?.width <= 500) {
    for (const value of ["Inbox", "No priority", "Unassigned", "Add labels"]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${value}$`, "i") })).toBeVisible();
    }
  } else {
    await expect(page.getByText(/^Status$/i)).toBeVisible();
    await expect(page.getByText(/^Priority$/i)).toBeVisible();
  }

  expect(failures, failures.join("\n")).toEqual([]);
});

test("account, workspace, and project settings expose their controls", async ({ page }) => {
  test.setTimeout(120_000);
  const failures = await installFailureCapture(page);
  const routes = [
    ["/dashboard/settings/account/information", /account|information|profile/i],
    ["/dashboard/settings/account/preferences", /preferences|language|theme/i],
    ["/dashboard/settings/account/notifications", /notifications|email/i],
    ["/dashboard/settings/workspace/general", /workspace|general/i],
    ["/dashboard/settings/workspace/labels", /labels|label/i],
    ["/dashboard/settings/workspace/roles", /roles|permissions/i],
    ["/dashboard/settings/projects/project-admin-operations/general", /project|general/i],
    ["/dashboard/settings/projects/project-admin-operations/workflow", /workflow|status|column/i],
    ["/dashboard/settings/projects/project-admin-operations/custom-fields", /custom field|field/i],
    ["/dashboard/settings/projects/project-admin-operations/visibility", /visibility|member|share/i],
    ["/dashboard/settings/projects/project-admin-operations/calendar", /calendar|feed/i],
  ];
  for (const [route, expected] of routes) {
    await expectHealthyPage(page, route);
    await expect(page.locator("body")).toContainText(expected);
    expect(await page.locator("button, input, textarea, select, [role=combobox]").count(), `${route} exposed no interactive controls`).toBeGreaterThan(0);
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("project toolbar is keyboard reachable and remains usable on mobile", async ({ page }) => {
  test.setTimeout(90_000);
  const failures = await installFailureCapture(page);
  await expectHealthyPage(page, boardRoute);
  const searchButton = page.getByRole("button", { name: /^search tasks$/i });
  await expect(searchButton).toBeVisible();
  await searchButton.click();
  const search = page.getByRole("searchbox", { name: /search tasks/i });
  await expect(search).toBeVisible();
  await search.focus();
  await expect(search).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /^filter$/i })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByPlaceholder(/add filter/i)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder(/add filter/i)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(failures, failures.join("\n")).toEqual([]);
});
