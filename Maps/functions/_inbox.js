import { CONTACT_MAILBOX, gmailStatus, gmailThreadIdForMessage, personalGmailStatus, sendGmailMessage, MANARAH_MAILBOX } from "./_gmail.js";

export const INBOX_MAILBOXES = ["contact@karamahcollective.com", "manarah@karamahcollective.com"];
const MAILBOXES = new Set(INBOX_MAILBOXES);
const clean = (value, length = 10000) => String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, length);
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const textFromHtml = (html) => clean(html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&"), 12000);
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
function attachmentsFrom(value, includeContent = false) {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) return [];
  const total = value.reduce((sum, file) => sum + Math.max(0, Number(file?.size) || 0), 0);
  if (total > MAX_ATTACHMENT_BYTES) return [];
  return value.map(file => {
    const name = clean(file?.name, 160);
    const type = clean(file?.type, 120) || "application/octet-stream";
    const size = Math.max(0, Math.min(Number(file?.size) || 0, MAX_ATTACHMENT_BYTES));
    const content = clean(file?.content, Math.ceil(MAX_ATTACHMENT_BYTES * 1.4));
    return includeContent ? { name, type, size, content } : { name, type, size };
  }).filter(file => file.name && file.size && (!includeContent || file.content));
}
function parseAttachments(value, includeContent = false) { try { return attachmentsFrom(JSON.parse(value || "[]"), includeContent); } catch { return []; } }
export function inboxMailbox(value) { const email = clean(value, 120).toLowerCase(); return MAILBOXES.has(email) ? email : "contact@karamahcollective.com"; }
export function inboxMailboxKey(value) { return inboxMailbox(value).split("@")[0]; }
export function canInboxMailbox(access, mailbox, level = "read", personalMailbox = "") {
  if (personalMailbox && String(mailbox || "").toLowerCase() === String(personalMailbox).toLowerCase()) return true;
  const permissions = access?.permissions || [];
  if (permissions.includes("*")) return true;
  const key = inboxMailboxKey(mailbox), exact = `inbox.${key}.${level}`;
  return permissions.includes("inbox.*") || permissions.includes(exact) || (level === "read" && permissions.includes(`inbox.${key}.write`)) || permissions.includes("moderation.contacts.*") || permissions.includes(`moderation.contacts.${level}`) || (level === "read" && permissions.includes("moderation.contacts.write"));
}
export function accessibleInboxMailboxes(access, level = "read", personalMailbox = "") { return [...INBOX_MAILBOXES.filter(mailbox => canInboxMailbox(access, mailbox, level)), ...(personalMailbox && canInboxMailbox(access, personalMailbox, level, personalMailbox) ? [personalMailbox] : [])]; }
export function hasInboxPermission(access, level = "read", personalMailbox = "") { return accessibleInboxMailboxes(access, level, personalMailbox).length > 0; }
export async function configuredInboxMailboxes(db, env, actor) {
  const mailboxes = [];
  for (const mailbox of [MANARAH_MAILBOX, CONTACT_MAILBOX]) {
    try {
      const status = await gmailStatus(db, env, mailbox);
      if (status.connected) mailboxes.push(mailbox);
    } catch {}
  }
  const personal = await personalGmailStatus(db, env, actor);
  if (personal.connected && personal.accountEmail) mailboxes.push(personal.accountEmail);
  return mailboxes;
}
function inboxWhere(access, level = "read", configured = INBOX_MAILBOXES, personalMailbox = "", selectedMailbox = "") {
  const requestedMailbox = clean(selectedMailbox, 160).toLowerCase();
  const mailboxes = accessibleInboxMailboxes(access, level, personalMailbox).filter(mailbox => configured.includes(mailbox) && (!requestedMailbox || mailbox === requestedMailbox));
  return mailboxes.length ? { sql: `t.mailbox IN (${mailboxes.map(() => "?").join(",")})`, values: mailboxes } : { sql: "1=0", values: [] };
}
export async function listInbox(db, access, configured = INBOX_MAILBOXES, personalMailbox = "", folder = "all", selectedMailbox = "") {
  const available = accessibleInboxMailboxes(access, "read", personalMailbox).filter(mailbox => configured.includes(mailbox));
  const filter = inboxWhere(access, "read", configured, personalMailbox, selectedMailbox);
  const selectedFolder = clean(folder, 160) || "all";
  const selectedFolderKey = selectedFolder.toLowerCase();
  const now = new Date().toISOString();
  const queryValues = [...filter.values];
  const visibilitySql = selectedFolderKey === "snoozed" ? "" : " AND (t.snoozed_until='' OR t.snoozed_until <= ?)";
  if (visibilitySql) queryValues.push(now);
  let folderSql = "";
  if (selectedFolderKey === "snoozed") {
    folderSql = " AND t.snoozed_until > ?";
    queryValues.push(now);
  } else if (selectedFolderKey === "starred") {
    folderSql = " AND (t.starred=1 OR EXISTS (SELECT 1 FROM inbox_messages sf JOIN json_each(sf.labels_json) sj ON true WHERE sf.thread_id=t.id AND lower(sj.value)='starred'))";
  } else if (selectedFolderKey !== "all") {
    folderSql = ` AND (EXISTS (SELECT 1 FROM inbox_messages fm JOIN json_each(fm.labels_json) fj ON true WHERE fm.thread_id=t.id AND fj.value=?) OR (?='Inbox' AND NOT EXISTS (SELECT 1 FROM inbox_messages unl WHERE unl.thread_id=t.id AND unl.labels_json <> '[]')) OR (?='Sent' AND EXISTS (SELECT 1 FROM inbox_messages sm WHERE sm.thread_id=t.id AND sm.direction='outbound')))`;
    queryValues.push(selectedFolder, selectedFolder, selectedFolder);
  }
  const { results = [] } = await db.prepare(`SELECT t.*, COALESCE(NULLIF((SELECT m.text_body FROM inbox_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1),''), CASE WHEN EXISTS (SELECT 1 FROM inbox_messages am WHERE am.thread_id=t.id AND am.attachments_json <> '[]') THEN 'Attachment' ELSE '' END) AS last_message_preview, (SELECT COUNT(*) FROM inbox_messages m WHERE m.thread_id=t.id AND m.direction='outbound' AND (m.message_kind IS NULL OR m.message_kind='email')) AS outbound_count, (SELECT m.direction FROM inbox_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_direction, EXISTS (SELECT 1 FROM inbox_messages am WHERE am.thread_id=t.id AND am.attachments_json <> '[]') AS has_attachments FROM inbox_threads t WHERE ${filter.sql}${visibilitySql}${folderSql} ORDER BY t.status,t.last_message_at DESC LIMIT 250`).bind(...queryValues).all();
  const { results: labelRows = [] } = await db.prepare(`SELECT DISTINCT fj.value AS folder FROM inbox_messages fm JOIN inbox_threads t ON t.id=fm.thread_id JOIN json_each(fm.labels_json) fj ON true WHERE ${filter.sql} AND fj.value<>'' ORDER BY fj.value`).bind(...filter.values).all();
  const standardFolders = [{ id:"all", label:"All mail" }, { id:"Inbox", label:"Inbox" }, { id:"Sent", label:"Sent" }, { id:"Junk", label:"Junk" }, { id:"Deleted", label:"Deleted" }, { id:"Starred", label:"Starred" }, { id:"Snoozed", label:"Snoozed" }];
  const standardIds = new Set(standardFolders.map(item => item.id.toLowerCase()));
  const customFolders = labelRows.map(row => clean(row.folder, 160)).filter(value => value && !standardIds.has(value.toLowerCase())).map(value => ({ id:value, label:value }));
  return { mailboxes: available, folders:[...standardFolders, ...customFolders], selectedFolder, threads: results.map(row => ({ id: row.id, subject: row.subject || "(No subject)", participantEmail: row.participant_email, participantName: row.participant_name, mailbox: row.mailbox, source: row.source, hasOutbound: Number(row.outbound_count) > 0, lastMessageDirection: row.last_message_direction || "", hasAttachments: Boolean(row.has_attachments), status: row.status, unreadCount: row.unread_count, starred: Number(row.starred) === 1, snoozedUntil: row.snoozed_until || "", assignedTo: row.assigned_to || "", assignedName: row.assigned_name || "", lastMessageAt: row.last_message_at, preview: clean(row.last_message_preview, 240) })) };
}

async function findInboxThread(db, threadId) {
  const key = clean(threadId, 255);
  const providerKey = key.replace(/^gmail_/i, "");
  return db.prepare("SELECT * FROM inbox_threads WHERE id=? OR provider_thread_id=? OR provider_thread_id=? LIMIT 1").bind(key, key, providerKey).first();
}

async function inboxThreadForWrite(db, threadId, access, personalMailbox = "") {
  const thread = await findInboxThread(db, threadId);
  if (!thread || !canInboxMailbox(access, thread.mailbox, "write", personalMailbox)) return null;
  return thread;
}

export async function setInboxStar(db, data, access, personalMailbox = "") {
  const thread = await inboxThreadForWrite(db, data.threadId, access, personalMailbox);
  if (!thread) return { error: "Conversation not found." };
  const starred = data.starred === true || data.starred === 1 || data.starred === "1";
  await db.prepare("UPDATE inbox_threads SET starred=? WHERE id=?").bind(starred ? 1 : 0, thread.id).run();
  return { success: true, starred };
}

export async function setInboxSnooze(db, data, access, personalMailbox = "") {
  const thread = await inboxThreadForWrite(db, data.threadId, access, personalMailbox);
  if (!thread) return { error: "Conversation not found." };
  const rawUntil = clean(data.until, 60);
  if (!rawUntil) {
    await db.prepare("UPDATE inbox_threads SET snoozed_until='' WHERE id=?").bind(thread.id).run();
    return { success: true, snoozedUntil: "" };
  }
  const until = new Date(rawUntil);
  if (!Number.isFinite(until.getTime()) || until.getTime() <= Date.now() || until.getTime() > Date.now() + 1000 * 60 * 60 * 24 * 90) return { error: "Choose a snooze time within the next 90 days." };
  const snoozedUntil = until.toISOString();
  await db.prepare("UPDATE inbox_threads SET snoozed_until=? WHERE id=?").bind(snoozedUntil, thread.id).run();
  return { success: true, snoozedUntil };
}

export async function assignInboxThread(db, data, actor, access, personalMailbox = "") {
  const thread = await inboxThreadForWrite(db, data.threadId, access, personalMailbox);
  if (!thread) return { error: "Conversation not found." };
  const assignee = clean(data.assignee, 254).toLowerCase();
  if (!assignee) {
    await db.prepare("UPDATE inbox_threads SET assigned_to='', assigned_name='' WHERE id=?").bind(thread.id).run();
    return { success: true, assignedTo: "", assignedName: "" };
  }
  const member = assignee === String(actor?.email || "").toLowerCase()
    ? { email: actor.email, display_name: actor.name || actor.email }
    : await db.prepare("SELECT email,display_name FROM admin_role_members WHERE lower(email)=? LIMIT 1").bind(assignee).first();
  if (!member?.email) return { error: "That team member cannot be assigned this conversation." };
  await db.prepare("UPDATE inbox_threads SET assigned_to=?, assigned_name=? WHERE id=?").bind(String(member.email).toLowerCase(), clean(member.display_name || member.email, 120), thread.id).run();
  return { success: true, assignedTo: String(member.email).toLowerCase(), assignedName: clean(member.display_name || member.email, 120) };
}

export async function bulkUpdateInbox(db, data, actor, access, personalMailbox = "") {
  const ids = [...new Set((Array.isArray(data.threadIds) ? data.threadIds : []).map(value => clean(value, 100)).filter(Boolean))].slice(0, 100);
  const action = clean(data.action, 40);
  if (!ids.length || !["read", "close", "open", "star", "unstar", "assign-self", "unassign"].includes(action)) return { error: "Choose conversations and a valid action." };
  const placeholders = ids.map(() => "?").join(",");
  const { results = [] } = await db.prepare(`SELECT id,mailbox FROM inbox_threads WHERE id IN (${placeholders})`).bind(...ids).all();
  const allowed = results.filter(thread => canInboxMailbox(access, thread.mailbox, "write", personalMailbox)).map(thread => thread.id);
  if (!allowed.length) return { error: "You cannot update those conversations." };
  const values = allowed.map(() => "?").join(",");
  const bind = [...allowed];
  let sql = "";
  if (action === "read") sql = `UPDATE inbox_threads SET unread_count=0 WHERE id IN (${values})`;
  if (action === "close" || action === "open") sql = `UPDATE inbox_threads SET status=? WHERE id IN (${values})`, bind.unshift(action);
  if (action === "star" || action === "unstar") sql = `UPDATE inbox_threads SET starred=? WHERE id IN (${values})`, bind.unshift(action === "star" ? 1 : 0);
  if (action === "assign-self") sql = `UPDATE inbox_threads SET assigned_to=?, assigned_name=? WHERE id IN (${values})`, bind.unshift(String(actor?.email || "").toLowerCase(), clean(actor?.name || actor?.email, 120));
  if (action === "unassign") sql = `UPDATE inbox_threads SET assigned_to='', assigned_name='' WHERE id IN (${values})`;
  await db.prepare(sql).bind(...bind).run();
  return { success: true, updated: allowed.length };
}

export async function listInboxAssignees(db, access) {
  if (!hasInboxPermission(access, "read")) return { members: [] };
  const { results = [] } = await db.prepare("SELECT email,display_name FROM admin_role_members ORDER BY lower(display_name),lower(email)").all();
  return { members: results.map(member => ({ email:String(member.email || "").toLowerCase(), name:clean(member.display_name || member.email, 120) })).filter(member => member.email) };
}
export async function setInboxStatus(db, data, access, personalMailbox = "") {
  const threadId = clean(data.threadId, 80);
  const status = clean(data.status, 20);
  if (!threadId || !["open", "closed"].includes(status)) return { error: "Choose a valid conversation status." };
  const thread = await findInboxThread(db, threadId);
  if (!thread) return { error: "Conversation not found." };
  if (!canInboxMailbox(access, thread.mailbox, "write", personalMailbox)) return { error: "Your role cannot manage this mailbox." };
  await db.prepare("UPDATE inbox_threads SET status=? WHERE id=?").bind(status, thread.id).run();
  return { success: true, status };
}
export async function getInboxThread(db, threadId, access, personalMailbox = "") {
  const thread = await findInboxThread(db, threadId);
  if (!thread) return { error: "Conversation not found." };
  if (!canInboxMailbox(access, thread.mailbox, "read", personalMailbox)) return { error: "Conversation not found." };
  const { results = [] } = await db.prepare("SELECT * FROM inbox_messages WHERE thread_id=? ORDER BY created_at").bind(thread.id).all();
  await db.prepare("UPDATE inbox_threads SET unread_count=0 WHERE id=?").bind(thread.id).run();
  return { thread: { id:thread.id, subject:thread.subject, participantEmail:thread.participant_email, participantName:thread.participant_name, mailbox:thread.mailbox, source:thread.source, status:thread.status, unreadCount:0 }, messages: results.map(message => ({ id:message.id, direction:message.direction, kind:message.message_kind || "email", senderEmail:message.sender_email, senderName:message.sender_name, senderAdminEmail:message.sender_admin_email || "", senderAdminName:message.sender_admin_name || "", recipientEmail:message.recipient_email, htmlBody:message.html_body, textBody:message.text_body, attachments:parseAttachments(message.attachments_json, true), createdAt:message.created_at })) };
}
function safeEmail(value) { const email = clean(value, 254).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; }
function safeEmails(value) {
  const entries = Array.isArray(value) ? value : String(value || "").split(",");
  const emails = [...new Set(entries.map(safeEmail).filter(Boolean))];
  return emails.length <= 20 ? emails : [];
}
function safeHtml(value) { return clean(value, 50000).replace(/<(script|style|iframe|object)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "").replace(/javascript:/gi, ""); }
export async function replyInbox(db, env, data, actor, access, personalMailbox = "") {
  const thread = await findInboxThread(db, data.threadId);
  const branchFromMessageId = clean(data.branchFromMessageId,80);
  const branchMessage = thread && branchFromMessageId ? await db.prepare("SELECT * FROM inbox_messages WHERE id=? AND thread_id=?").bind(branchFromMessageId,thread.id).first() : null;
  const laterEmail = branchMessage && branchMessage.message_kind !== "internal_note" ? await db.prepare("SELECT id FROM inbox_messages WHERE thread_id=? AND created_at>? AND (message_kind IS NULL OR message_kind='email') ORDER BY created_at LIMIT 1").bind(thread.id,branchMessage.created_at).first() : null;
  const shouldBranch = Boolean(branchMessage && laterEmail);
  const branchThreadId = shouldBranch ? id("thread") : "";
  const recipient = safeEmail(thread?.participant_email); const recipients = safeEmails(data.recipientEmails || [recipient]); const cc = safeEmails(data.cc); const bcc = safeEmails(data.bcc); const html = safeHtml(data.htmlBody); const text = textFromHtml(html); const attachments=attachmentsFrom(data.attachments,true);
  if (!thread || !recipient || !recipients.length || !canInboxMailbox(access, thread.mailbox, "read", personalMailbox)) return { error:"Conversation not found." }; if (!text && !attachments.length) return { error:"Add a message or attachment before sending." };
  const sender = clean(thread.mailbox, 120).toLowerCase(); const subject = clean(data.subject || thread.subject || "Karamah Collective", 180);
  if (!canInboxMailbox(access, sender, "write", personalMailbox)) return { error:"Your role cannot send from this mailbox." };
  if (Array.isArray(data.attachments) && data.attachments.length !== attachments.length) return { error:"Attachments must be files totalling 5 MB or less." };
  let sent = {};
  const personal = sender === personalMailbox && sender !== MANARAH_MAILBOX;
  const gmail = personal ? (await personalGmailStatus(db, env, actor)).connected : [MANARAH_MAILBOX, CONTACT_MAILBOX].includes(sender) && (await gmailStatus(db, env, sender)).connected;
  const gmailOptions = personal ? { ownerUid: actor?.uid, mailbox: sender } : { mailbox: sender };
  if (gmail) {
    let providerThreadId = shouldBranch ? "" : clean(thread.provider_thread_id, 255).replace(/^gmail_/i, "");
    let latestProviderMessageId = "";
    let inReplyTo = "";
    if (!shouldBranch) {
      const providerMessage = await db.prepare("SELECT provider_message_id FROM inbox_messages WHERE thread_id=? AND provider_message_id<>'' ORDER BY created_at DESC LIMIT 1").bind(thread.id).first();
      latestProviderMessageId = clean(providerMessage?.provider_message_id, 255);
      if (latestProviderMessageId) {
        const recovered = await gmailThreadIdForMessage(db, env, latestProviderMessageId, gmailOptions);
        if (recovered.error) return recovered;
        providerThreadId = clean(recovered.gmailThreadId, 255).replace(/^gmail_/i, "") || providerThreadId;
        inReplyTo = clean(recovered.messageHeaderId, 500);
        if (!providerThreadId) return { error: "Gmail could not identify the conversation. Sync the inbox once, then try replying again." };
      }
    }
    sent = await sendGmailMessage(db, env, { to: recipients, cc, bcc, subject:subject.startsWith("Re:") ? subject : `Re: ${subject}`, text, html, attachments, inReplyTo, threadId: providerThreadId ? `gmail_${providerThreadId}` : "" }, gmailOptions);
    if (sent.error) return sent;
  } else {
    const apiKey = clean(env.BREVO_API_KEY, 300); if (!apiKey || apiKey.startsWith("xsmtpsib-")) return { error: sender === MANARAH_MAILBOX ? "Connect Manarah Gmail or configure the Brevo HTTP API key before sending." : "A Brevo HTTP API key is required to send inbox replies." };
    const response = await fetch("https://api.brevo.com/v3/smtp/email", { method:"POST", headers:{accept:"application/json","content-type":"application/json","api-key":apiKey}, body:JSON.stringify({ sender:{email:sender,name:"Karamah Collective"}, to:recipients.map(email=>({email,name:email===recipient?thread.participant_name||undefined:undefined})), ...(cc.length?{cc:cc.map(email=>({email}))}:{}), ...(bcc.length?{bcc:bcc.map(email=>({email}))}:{}), replyTo:{email:sender,name:"Karamah Collective"}, subject:subject.startsWith("Re:")?subject:`Re: ${subject}`, htmlContent:html, textContent:text, ...(shouldBranch ? {} : {headers:{"In-Reply-To": thread.id}}), tags:["admin-inbox"], ...(attachments.length ? {attachment:attachments.map(({name,content})=>({name,content}))}: {}) }) });
    if (!response.ok) return { error:"Brevo could not send this reply. Check the verified sender and API key." };
  }
  const stamp = new Date().toISOString();
  if (shouldBranch) {
    const branchProviderThreadId = sent.gmailThreadId || "";
    const branchThread = db.prepare("INSERT INTO inbox_threads (id,subject,participant_email,participant_name,mailbox,source,status,unread_count,last_message_at,created_at,provider_thread_id) VALUES (?,?,?,?,?,'email','open',0,?,?,?)").bind(branchThreadId,thread.subject || subject,thread.participant_email,thread.participant_name,sender,stamp,branchMessage.created_at || stamp,branchProviderThreadId);
    const actorEmail = clean(actor?.email,254).toLowerCase(); const actorName = clean(actor?.name,120) || actorEmail || "Karamah Collective";
    const branchContext = db.prepare("INSERT INTO inbox_messages (id,thread_id,direction,message_kind,sender_email,sender_name,sender_admin_email,sender_admin_name,recipient_email,html_body,text_body,provider_message_id,attachments_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id("msg"),branchThreadId,branchMessage.direction,branchMessage.message_kind || "email",branchMessage.sender_email || "",branchMessage.sender_name || "",branchMessage.sender_admin_email || "",branchMessage.sender_admin_name || "",branchMessage.recipient_email || "",branchMessage.html_body || "",branchMessage.text_body || "", "", branchMessage.attachments_json || "[]", branchMessage.created_at || stamp);
    const branchReply = db.prepare("INSERT INTO inbox_messages (id,thread_id,direction,sender_email,sender_name,sender_admin_email,sender_admin_name,recipient_email,html_body,text_body,provider_message_id,attachments_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id("msg"),branchThreadId,"outbound",sender,actorName,actorEmail,actorName,recipient,html,text,sent.providerMessageId || "",JSON.stringify(attachments),stamp);
    await db.batch([branchThread,branchContext,branchReply]);
    return { success:true, threadId:branchThreadId, branched:true };
  }
  const threadUpdate = sent.gmailThreadId
    ? db.prepare("UPDATE inbox_threads SET mailbox=?,status='open',last_message_at=?,provider_thread_id=? WHERE id=?").bind(sender,stamp,sent.gmailThreadId,thread.id)
    : db.prepare("UPDATE inbox_threads SET mailbox=?,status='open',last_message_at=? WHERE id=?").bind(sender,stamp,thread.id);
  const actorEmail = clean(actor?.email,254).toLowerCase(); const actorName = clean(actor?.name,120) || actorEmail || "Karamah Collective";
  await db.batch([db.prepare("INSERT INTO inbox_messages (id,thread_id,direction,sender_email,sender_name,sender_admin_email,sender_admin_name,recipient_email,html_body,text_body,provider_message_id,attachments_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id("msg"),thread.id,"outbound",sender,actorName,actorEmail,actorName,recipient,html,text,sent.providerMessageId || "",JSON.stringify(attachments),stamp),threadUpdate]);
  return { success:true };
}
export async function composeInbox(db, env, data, actor, access, personalMailbox = "") {
  const recipients = safeEmails(data.recipientEmails || data.recipientEmail), recipient = recipients[0], subject = clean(data.subject, 180), html = safeHtml(data.htmlBody), text = textFromHtml(html), attachments = attachmentsFrom(data.attachments, true);
  if (!recipient) return { error: "Enter a valid recipient email." }; if (!subject) return { error: "Add a subject." }; if (!text && !attachments.length) return { error: "Add a message or attachment before sending." };
  if (Array.isArray(data.attachments) && data.attachments.length !== attachments.length) return { error:"Attachments must be files totalling 5 MB or less." };
  const stamp = new Date().toISOString(), threadId = id("thread"), requestedMailbox = clean(data.mailbox, 120).toLowerCase(), mailbox = requestedMailbox === personalMailbox ? personalMailbox : inboxMailbox(requestedMailbox);
  if (!canInboxMailbox(access, mailbox, "write", personalMailbox)) return { error: "Your role cannot send from this mailbox." };
  const sourceThreadId = clean(data.branchFromThreadId,80), sourceMessageId = clean(data.branchFromMessageId,80);
  const sourceMessage = sourceThreadId && sourceMessageId ? await db.prepare("SELECT m.* FROM inbox_messages m WHERE m.id=? AND m.thread_id=?").bind(sourceMessageId,sourceThreadId).first() : null;
  await db.prepare("INSERT INTO inbox_threads (id,subject,participant_email,participant_name,mailbox,source,status,unread_count,last_message_at,created_at) VALUES (?,?,?,?,?,'outbound','open',0,?,?)").bind(threadId, subject, recipient, clean(data.recipientName,120), mailbox, stamp, stamp).run();
  if (sourceMessage && sourceMessage.message_kind !== "internal_note") await db.prepare("INSERT INTO inbox_messages (id,thread_id,direction,message_kind,sender_email,sender_name,sender_admin_email,sender_admin_name,recipient_email,html_body,text_body,provider_message_id,attachments_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id("msg"),threadId,sourceMessage.direction,sourceMessage.message_kind || "email",sourceMessage.sender_email || "",sourceMessage.sender_name || "",sourceMessage.sender_admin_email || "",sourceMessage.sender_admin_name || "",sourceMessage.recipient_email || "",sourceMessage.html_body || "",sourceMessage.text_body || "", "", sourceMessage.attachments_json || "[]", sourceMessage.created_at || stamp).run();
  const result = await replyInbox(db, env, { threadId, mailbox, subject, htmlBody: html, attachments:data.attachments, recipientEmails:recipients, cc:data.cc, bcc:data.bcc }, actor, access, personalMailbox);
  if (result.error) {
    await db.prepare("DELETE FROM inbox_threads WHERE id=?").bind(threadId).run();
    return result;
  }
  return { ...result, threadId };
}
export async function addInboxNote(db, data, actor, access, personalMailbox = "") {
  const threadId=clean(data.threadId,80), html=safeHtml(data.htmlBody), text=textFromHtml(html);
  if (!threadId || !text) return { error:"Write a note before saving." };
  const thread=await findInboxThread(db, threadId); if (!thread || !canInboxMailbox(access, thread.mailbox, "write", personalMailbox)) return { error:"Conversation not found." };
  const stamp=new Date().toISOString();
  const actorEmail=clean(actor?.email,254).toLowerCase(), actorName=clean(actor?.name,120)||actorEmail||"Admin";
  await db.prepare("INSERT INTO inbox_messages (id,thread_id,direction,message_kind,sender_email,sender_name,sender_admin_email,sender_admin_name,recipient_email,html_body,text_body,attachments_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id("note"),thread.id,"outbound","internal_note",actorEmail,actorName,actorEmail,actorName,"",html,text,"[]",stamp).run();
  return { success:true };
}
export async function ingestInbox(db, data, personalMailbox = "") {
  const direction=data.direction === "outbound" ? "outbound" : "inbound";
  const senderEmail=safeEmail(data.from?.email || data.senderEmail || data.email), recipientEmail=safeEmail(data.to?.email || data.recipientEmail);
  if(!senderEmail) return { error:"A sender email is required." };
  const requestedMailbox=clean(data.mailbox || (direction === "inbound" ? recipientEmail : senderEmail),120).toLowerCase();
  const mailbox=requestedMailbox === String(personalMailbox || "").toLowerCase() ? personalMailbox : inboxMailbox(requestedMailbox);
  const providerId=clean(data.messageId || data.providerMessageId,255), providerThreadId=clean(data.providerThreadId || String(data.threadId || "").replace(/^gmail_/, ""),255);
  const stamp=clean(data.receivedAt,60)||new Date().toISOString(), subject=clean(data.subject,180)||"(No subject)", html=safeHtml(data.htmlBody || data.html || ""), text=clean(data.textBody || data.text || textFromHtml(html),12000), attachments=attachmentsFrom(data.attachments,true), hasLabels=Array.isArray(data.labels), labels=[...new Set((hasLabels ? data.labels : []).map(label => clean(label,160)).filter(Boolean))].slice(0,80), labelsJson=hasLabels ? JSON.stringify(labels) : null, attachmentsJson=attachments.length ? JSON.stringify(attachments) : "[]";
  if(providerId) {
    const duplicate=await db.prepare("SELECT id,thread_id FROM inbox_messages WHERE provider_message_id=?").bind(providerId).first();
    if(duplicate) {
      const linked=providerThreadId ? await db.prepare("SELECT id FROM inbox_threads WHERE provider_thread_id=?").bind(providerThreadId).first() : null;
      if(linked?.id && linked.id !== duplicate.thread_id) {
        await db.batch([
          db.prepare("UPDATE inbox_messages SET thread_id=? WHERE thread_id=?").bind(linked.id,duplicate.thread_id),
          db.prepare("UPDATE inbox_messages SET html_body=?,text_body=?,sender_email=?,recipient_email=?,attachments_json=?,labels_json=COALESCE(?,labels_json) WHERE id=?").bind(html,text,senderEmail,recipientEmail || mailbox,attachmentsJson,labelsJson,duplicate.id),
          db.prepare(`UPDATE inbox_threads SET subject=?,mailbox=?,unread_count=unread_count+${direction === "inbound" ? 1 : 0},last_message_at=? WHERE id=?`).bind(subject,mailbox,stamp,linked.id),
          db.prepare("DELETE FROM inbox_threads WHERE id=?").bind(duplicate.thread_id),
        ]);
      } else {
        await db.prepare("UPDATE inbox_messages SET html_body=?,text_body=?,sender_email=?,recipient_email=?,attachments_json=?,labels_json=COALESCE(?,labels_json) WHERE id=?").bind(html,text,senderEmail,recipientEmail || mailbox,attachmentsJson,labelsJson,duplicate.id).run();
        await db.prepare("UPDATE inbox_threads SET mailbox=? WHERE id=?").bind(mailbox,duplicate.thread_id).run();
        if(providerThreadId) await db.prepare("UPDATE inbox_threads SET provider_thread_id=? WHERE id=? AND (provider_thread_id IS NULL OR provider_thread_id='')").bind(providerThreadId,duplicate.thread_id).run();
      }
      return { success:true,duplicate:true };
    }
  }
  const senderName=clean(data.from?.name || data.senderName || data.name,120), participantEmail=direction === "outbound" ? recipientEmail : senderEmail, participantName=direction === "outbound" ? clean(data.to?.name,120) : senderName;
  let threadId=clean(data.threadId,80)||id("thread");
  if(providerThreadId) {
    const linked=await db.prepare("SELECT id FROM inbox_threads WHERE provider_thread_id=?").bind(providerThreadId).first();
    if(linked?.id) threadId=linked.id;
  }
  const current=await db.prepare("SELECT id FROM inbox_threads WHERE id=?").bind(threadId).first();
  const messageStatement=db.prepare("INSERT INTO inbox_messages (id,thread_id,direction,sender_email,sender_name,recipient_email,html_body,text_body,provider_message_id,attachments_json,labels_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id("msg"),threadId,direction,senderEmail,senderName,recipientEmail || mailbox,html,text,providerId,attachmentsJson,labels.length ? JSON.stringify(labels) : "[]",stamp);
  const threadStatement=current ? db.prepare(`UPDATE inbox_threads SET subject=?,participant_email=?,participant_name=?,mailbox=?,unread_count=unread_count+${direction === "inbound" ? 1 : 0},last_message_at=?,provider_thread_id=? WHERE id=?`).bind(subject,participantEmail,participantName,mailbox,stamp,providerThreadId,threadId) : db.prepare("INSERT INTO inbox_threads (id,subject,participant_email,participant_name,mailbox,source,status,unread_count,last_message_at,created_at,provider_thread_id) VALUES (?,?,?,?,?,'email','open',?, ?,?,?)").bind(threadId,subject,participantEmail,participantName,mailbox,direction === "inbound" ? 1 : 0,stamp,stamp,providerThreadId);
  // New messages reference their thread, so the parent row must be created
  // first when D1 enforces the inbox_messages.thread_id foreign key.
  await db.batch(current ? [messageStatement, threadStatement] : [threadStatement, messageStatement]); return {success:true,threadId};
}
