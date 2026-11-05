const MAX_EMAIL_LENGTH = 254;
const INVITATION_SENDER = "projects@karamahcollective.com";
const BRAND_LOGO_URL = "https://maps.karamahcollective.com/kc_logo_big.inline.svg";
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
  return rows.map((row, index) => `
    <div style="padding:14px 0${index ? ";border-top:1px solid #e6e5df" : ""}">
      <div style="margin:0 0 5px;font-family:'Geist Mono','SFMono-Regular',Consolas,monospace;font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#777772">${escapeHtml(row.label)}</div>
      <div style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:14px;line-height:1.5;color:#252522">${escapeHtml(row.value)}</div>
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
  if (!apiKey) return { error: "Project invitations are not configured. Add BREVO_API_KEY to the Maps Pages production secrets." };
  if (/^xsmtpsib-/i.test(apiKey)) return { error: "BREVO_API_KEY on the Maps deployment is an SMTP password. Replace it with a Brevo HTTP API key." };

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
  <body style="margin:0;background:#f5f5f2;padding:32px 16px;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#252522">
    <div style="max-width:600px;margin:0 auto">
      <div style="padding:0 4px 20px;display:flex;justify-content:space-between;align-items:center">
        <img src="${BRAND_LOGO_URL}" alt="Karamah Collective" width="118" height="48" style="display:block;width:118px;height:48px;object-fit:contain;object-position:left center">
        <span style="font-family:'Geist Mono','SFMono-Regular',Consolas,monospace;font-size:10px;font-weight:600;letter-spacing:.12em;color:#777772">PROJECTS / INVITATION</span>
      </div>
      <div style="background:#fffdfa;border:1px solid #e0dfd8;border-radius:16px;overflow:hidden">
        <div style="padding:36px 34px 34px">
          <p style="margin:0 0 12px;font-family:'Geist Mono','SFMono-Regular',Consolas,monospace;font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#777772">A place to work together</p>
          <h1 style="margin:0 0 14px;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:28px;line-height:1.18;letter-spacing:-.035em;color:#252522">You're invited to collaborate</h1>
          <p style="margin:0 0 30px;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:15px;line-height:1.65;color:#55554f">You have been invited to collaborate in ${escapeHtml(scope)} on Karamah Projects.</p>
          <div style="margin:0 0 30px;padding:0 18px;border-top:1px solid #deddd6;border-bottom:1px solid #deddd6">
            <p style="margin:17px 0 0;font-family:'Geist Mono','SFMono-Regular',Consolas,monospace;font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#777772">Access you'll get</p>
            ${accessHtml(accessRows)}
          </div>
          <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#08705b;color:#fffefa;padding:13px 19px;border-radius:9px;text-decoration:none;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:14px;font-weight:700">Accept invitation</a>
          <p style="margin:24px 0 0;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#777772;font-size:12px;line-height:1.6">This invitation is for ${escapeHtml(recipient)}.</p>
          <p style="margin:8px 0 0;font-family:'Geist Mono','SFMono-Regular',Consolas,monospace;color:#777772;font-size:10px;line-height:1.5;letter-spacing:.08em;text-transform:uppercase">Expires in 7 days</p>
        </div>
      </div>
      <p style="margin:16px 4px 0;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#999992;font-size:11px;line-height:1.5">You received this email because someone invited you to Karamah Projects.</p>
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
      return { error: "Brevo rejected the email credentials. Check BREVO_API_KEY on the Maps deployment." };
    }
    return { error: `Brevo could not send the invitation email (HTTP ${response.status}).` };
  }

  let messageId = "";
  try { messageId = JSON.parse(details)?.messageId || ""; } catch { /* Brevo may return an empty body */ }
  console.info("Project invitation email sent", { invitationId, recipientDomain: recipient.split("@")[1] || "", messageId });
  return { success: true, messageId };
}
