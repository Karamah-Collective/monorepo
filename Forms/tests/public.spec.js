import { test, expect } from "@playwright/test";

const schema = {
  schemaVersion: 1, title: "Community supper", subtitle: "Reserve your place", description: "A short, accessible registration.", confirmationMessage: "We saved your place.", closedMessage: "Closed.", coverImage: null,
  settings: { requiresAuth: false, collectIdentity: false, progress: "bar", questionNumbers: true, allowAnother: true },
  sections: [
    { id: "section-1", title: "About you", description: "Start with the essentials.", blocks: [
      { id: "q-name", kind: "question", type: "short_text", label: "Your name", required: true, validation: {} },
      { id: "q-attend", kind: "question", type: "single_choice", label: "Will you attend?", required: true, validation: {}, options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] },
    ] },
    { id: "section-2", title: "Guests", description: "A final detail.", blocks: [
      { id: "q-guests", kind: "question", type: "number", label: "Number of guests", required: false, hidden: true, validation: { min: 0, max: 8 } },
    ] },
  ],
  rules: [{ id: "rule-1", when: { all: [{ questionId: "q-attend", operator: "equals", value: "yes" }] }, actions: [{ type: "show", targetId: "q-guests" }, { type: "set_required", targetId: "q-guests", value: true }] }],
};

async function mockRuntime(page, options = {}) {
  const signedInUser = options.signedIn ? `{email:"amina@example.test",displayName:"Amina Hassan"}` : "null";
  await page.route("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js", route => route.fulfill({ contentType: "text/javascript", body: "export const initializeApp = value => value;" }));
  await page.route("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js", route => route.fulfill({ contentType: "text/javascript", body: `const signedInUser=${signedInUser};globalThis.__signOutCalls=0;export const getAuth=()=>({currentUser:signedInUser});export class GoogleAuthProvider{};export class FacebookAuthProvider{addScope(){} static credentialFromError(error){return error?.credential}};export class OAuthProvider{addScope(){}};export const signInWithPopup=async()=>({user:signedInUser});export const signInWithEmailAndPassword=async()=>({user:signedInUser});export const createUserWithEmailAndPassword=async()=>({user:{}});export const sendEmailVerification=async()=>{};export const sendPasswordResetEmail=async()=>{};export const onAuthStateChanged=(_a,cb)=>{cb(signedInUser);return()=>{}};export const signOut=async()=>{globalThis.__signOutCalls++};export const linkWithCredential=async()=>({});` }));
  await page.route("**/api/form?slug=community-supper", async route => {
    if (route.request().method() === "GET") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "form-1", slug: "community-supper", versionId: "version-1", version: 1, status: { state: "open" }, schema }) });
    const request = route.request().postDataJSON();
    expect(request.answers["q-name"]).toBe("Amina"); expect(request.answers["q-guests"]).toBe(2);
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, submissionId: "submission-1", message: "We saved your place.", allowAnother: true }) });
  });
}

test("respondent completes a conditional multi-page form", async ({ page }) => {
  await mockRuntime(page); await page.goto("/forms/community-supper");
  await expect(page.getByRole("heading", { name: "Community supper" })).toBeVisible();
  await page.getByLabel("Your name").fill("Amina");
  await page.getByText("Yes", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Guests", { exact: true })).toBeVisible();
  await page.getByLabel("Number of guests").fill("2");
  await page.getByRole("button", { name: "Submit response" }).click();
  await expect(page.getByRole("heading", { name: "Response received" })).toBeVisible();
  await expect(page.getByText("We saved your place.")).toBeVisible();
});

test("respondent form fits a 360px viewport and reports required errors", async ({ page }) => {
  await mockRuntime(page); await page.setViewportSize({ width: 360, height: 780 }); await page.goto("/forms/community-supper");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("This question is required.").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("admin full preview is clearly marked and can advance without required answers", async ({ page }) => {
  await mockRuntime(page);
  const encoded = Buffer.from(JSON.stringify(schema), "utf8").toString("base64");
  await page.goto(`/?preview=1#schema=${encoded}`);
  await expect(page.getByText("Preview", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Community supper" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Guests", { exact: true })).toBeVisible();
});

test("signed-in account button opens account dialog without signing out", async ({ page }) => {
  await mockRuntime(page, { signedIn: true });
  await page.goto("/forms/community-supper");
  await page.getByRole("button", { name: /Amina Hassan/ }).click();
  await expect(page.getByRole("heading", { name: "Signed in" })).toBeVisible();
  await expect(page.getByText("amina@example.test")).toBeVisible();
  expect(await page.evaluate(() => globalThis.__signOutCalls)).toBe(0);
  await page.getByRole("button", { name: "Stay signed in" }).click();
  await expect(page.getByRole("button", { name: /Amina Hassan/ })).toBeVisible();
});

for (const [name, viewport] of Object.entries({
  phone: { width: 360, height: 780 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 960 },
})) {
  test(`respondent shell is responsive on ${name}`, async ({ page }) => {
    await mockRuntime(page);
    await page.setViewportSize(viewport);
    await page.goto("/forms/community-supper");
    await expect(page.getByRole("heading", { name: "Community supper" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator(".section-card")).toBeVisible();
  });
}
