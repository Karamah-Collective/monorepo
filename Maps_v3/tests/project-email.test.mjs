import test from "node:test";
import assert from "node:assert/strict";
import { sendProjectInvitationEmail } from "../functions/_project-email.js";

const invitation = { email: "person@example.com", invitationId: "invite-1", workspaceName: "Workspace", projectName: "Project", role: "member" };

test("project invitations identify the Maps Brevo secret when it is missing", async () => {
  const result = await sendProjectInvitationEmail({}, invitation);
  assert.match(result.error, /Maps Pages production secrets/);
});

test("project invitations reject an SMTP password as the Brevo secret", async () => {
  const result = await sendProjectInvitationEmail({ BREVO_API_KEY: "xsmtpsib-invalid" }, invitation);
  assert.match(result.error, /SMTP password/);
});

test("project invitations use the branded email layout and requested type system", async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ messageId: "message-1" }), { status: 201 });
  };

  try {
    const result = await sendProjectInvitationEmail({ BREVO_API_KEY: "xkeysib-valid" }, invitation);
    assert.equal(result.success, true);
    assert.match(payload.htmlContent, /kc_logo_big\.inline\.svg/);
    assert.match(payload.htmlContent, /Plus Jakarta Sans/);
    assert.match(payload.htmlContent, /Geist Mono/);
    assert.doesNotMatch(payload.htmlContent, /height:4px;background:#20201e/);
    assert.match(payload.htmlContent, /Access you'll get/);
    assert.match(payload.htmlContent, /Expires in 7 days/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
