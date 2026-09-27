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

async function mockRuntime(page) {
  await page.route("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js", route => route.fulfill({ contentType: "text/javascript", body: "export const initializeApp = value => value;" }));
  await page.route("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js", route => route.fulfill({ contentType: "text/javascript", body: `export const getAuth=()=>({currentUser:null});export class GoogleAuthProvider{};export class OAuthProvider{addScope(){}};export const signInWithPopup=async()=>({});export const signInWithEmailAndPassword=async()=>({});export const createUserWithEmailAndPassword=async()=>({user:{}});export const sendEmailVerification=async()=>{};export const onAuthStateChanged=(_a,cb)=>{cb(null);return()=>{}};export const signOut=async()=>{};` }));
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
