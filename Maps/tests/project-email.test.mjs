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
