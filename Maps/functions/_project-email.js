const MAX_EMAIL_LENGTH = 254;
const INVITATION_SENDER = "projects@karamahcollective.com";
const ROLE_LABELS = {
  viewer: "Viewer",
  member: "Member",
  admin: "Admin",
  owner: "Owner",
  contributor: "Contributor",
  manager: "Manager",
  "project-admin": "Project admin",
};

function clean(value, max = 5000) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value, 1000).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function roleLabel(role) {
  return ROLE_LABELS[role] || clean(role, 80) || "Viewer";
}

function invitationAccessRows({ access, workspaceName, projectName, role }) {
  const overrides = Array.isArray(access?.projectOverrides)
    ? access.projectOverrides.filter((project) => project?.name)
    : [];
  const rows = [];

  if (access?.workspaceRole) {
    rows.push({
      label: "Workspace",
      value: `${workspaceName} - ${roleLabel(access.workspaceRole)}`,
    });
    if (access.inheritedProjectRole) {
      rows.push({
        label: overrides.length ? "Other projects" : "Projects",
        value: `All projects in ${workspaceName} - ${roleLabel(access.inheritedProjectRole)}`,
      });
    }
  } else {
    rows.push({ label: "Workspace", value: "No workspace access" });
  }

  if (projectName && !overrides.length) {
    rows.push({
      label: "Project",
      value: `${projectName} - ${roleLabel(role)}`,
    });
  }

  for (const project of overrides) {
    rows.push({
      label: project.name,
      value: `${roleLabel(project.role)} - project-specific access`,
    });
  }

  return rows.length
    ? rows.map((row) => ({
        ...row,
        value: row.value,
      }))
    : [{ label: "Access", value: "View access" }];
}

function accessText(rows) {
  return rows.map((row) => `- ${row.label}: ${row.value}`).join("\n");
}

function accessHtml(rows) {
  return rows.map((row) => `
    <div style="padding:12px 0;border-bottom:1px solid #ecece8">
      <div style="margin:0 0 3px;font-family:'Geist Mono','SFMono-Regular',Consolas,monospace;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#777772">${escapeHtml(row.label)}</div>
      <div style="font-size:14px;line-height:1.45;color:#20201e">${escapeHtml(row.value)}</div>
    </div>`).join("");
}

export async function sendProjectInvitationEmail(env, {
  email,
  invitationId,
  workspaceName,
  projectName,
  role,
  access,
}) {
  const recipient = clean(email, MAX_EMAIL_LENGTH).toLowerCase();
  const apiKey = clean(env?.BREVO_API_KEY, 300);
  if (!apiKey || /^xsmtpsib-/i.test(apiKey)) {
    return { error: "Project invitations are not configured. Add a Brevo HTTP API key as BREVO_API_KEY." };
  }

  const origin = clean(env?.PROJECTS_ORIGIN || "https://projects.karamahcollective.com", 300).replace(/\/+$/, "");
  const inviteUrl = `${origin}/invitation/accept/${encodeURIComponent(invitationId)}`;
  const safeWorkspaceName = clean(workspaceName, 160) || "Karamah Projects";
  const safeProjectName = clean(projectName, 160);
  const scope = safeProjectName ? `the project "${safeProjectName}"` : `the workspace "${safeWorkspaceName}"`;
  const accessRows = invitationAccessRows({ access, workspaceName: safeWorkspaceName, projectName: safeProjectName, role });
  const subject = `You're invited to ${safeProjectName || safeWorkspaceName}`;
  const textContent = [
    "Hello,",
    "",
    `You have been invited to collaborate in ${scope} on Karamah Projects.`,
    "",
    "Access you'll get:",
    accessText(accessRows),
    "",
    `Accept the invitation: ${inviteUrl}`,
    "",
    "This invitation expires in 7 days and can only be used for the invited email address.",
    "",
    "Karamah Projects",
  ].join("\n");
  const htmlContent = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
    </style>
  </head>
  <body style="margin:0;background:#f5f5f2;padding:32px 16px;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#20201e">
    <div style="max-width:560px;margin:0 auto">
      <div style="padding:0 4px 16px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#20201e">KARAMAH</span>
        <span style="font-family:'Geist Mono','SFMono-Regular',Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:.08em;color:#777772">PROJECTS</span>
      </div>
      <div style="background:#fff;border:1px solid #e3e3de;border-radius:14px;overflow:hidden">
        <div style="height:4px;background:#20201e"></div>
        <div style="padding:32px">
          <p style="margin:0 0 12px;font-family:'Geist Mono','SFMono-Regular',Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#777772">Project invitation</p>
          <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;letter-spacing:-.03em;color:#20201e">You're invited to collaborate</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4d4d48">You have been invited to collaborate in ${escapeHtml(scope)} on Karamah Projects.</p>
          <div style="margin:0 0 24px;padding:4px 16px;border:1px solid #e3e3de;border-radius:10px;background:#fafaf8">
            <p style="margin:8px 0 0;font-family:'Geist Mono','SFMono-Regular',Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#777772">Access you'll get</p>
            ${accessHtml(accessRows)}
            <div style="height:4px"></div>
          </div>
          <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#20201e;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:14px;font-weight:700">Accept invitation</a>
          <p style="margin:24px 0 0;color:#777772;font-size:12px;line-height:1.55">This invitation expires in 7 days and is bound to ${escapeHtml(recipient)}.</p>
        </div>
      </div>
      <p style="margin:16px 4px 0;color:#999992;font-size:11px;line-height:1.5">You received this email because someone invited you to Karamah Projects.</p>
    </div>
  </body>
</html>`;

  let response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { email: INVITATION_SENDER, name: "Karamah Projects" },
        replyTo: { email: INVITATION_SENDER, name: "Karamah Projects" },
        to: [{ email: recipient }],
        subject,
        textContent,
        htmlContent,
        tags: ["projects-invitation"],
      }),
    });
  } catch (error) {
    console.error("Project invitation email request failed", error);
    return { error: "The email service could not be reached. Try again in a moment." };
  }

  let details = "";
  try { details = await response.text(); } catch { /* keep generic */ }
  if (!response.ok) {
    const message = details.toLowerCase();
    console.error("Project invitation email failed", response.status, message);
    if (message.includes("unrecognised ip") || message.includes("authorised_ips") || message.includes("authorized_ips")) {
      return { error: "Brevo blocked this server's IP address. Add the server IP to the API key's authorised IPs in Brevo, or use an API key without IP restrictions." };
    }
    if (message.includes("sender") || message.includes("from email")) {
      return { error: "Brevo rejected projects@karamahcollective.com. Verify the sender or karamahcollective.com domain in Brevo." };
    }
    if (response.status === 401 || response.status === 403 || message.includes("api key") || message.includes("authentication")) {
      return { error: "Brevo rejected the email credentials. Check BREVO_API_KEY on the Projects deployment." };
    }
    return { error: `Brevo could not send the invitation email (HTTP ${response.status}).` };
  }

  let messageId = "";
  try { messageId = JSON.parse(details)?.messageId || ""; } catch { /* Brevo may return an empty body */ }
  console.info("Project invitation email sent", { invitationId, recipientDomain: recipient.split("@")[1] || "", messageId });
  return { success: true, messageId };
}
