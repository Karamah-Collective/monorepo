const MAILBOXES = new Set(["contact@karamahcollective.com", "maps@karamahcollective.com"]);
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
function parseAttachments(value) { try { return attachmentsFrom(JSON.parse(value || "[]")); } catch { return []; } }
export function inboxMailbox(value) { const email = clean(value, 120).toLowerCase(); return MAILBOXES.has(email) ? email : "contact@karamahcollective.com"; }
export async function listInbox(db) {
  const { results = [] } = await db.prepare("SELECT t.*, (SELECT m.text_body FROM inbox_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview FROM inbox_threads t ORDER BY t.status,t.last_message_at DESC LIMIT 250").all();
  return { threads: results.map(row => ({ id: row.id, subject: row.subject || "(No subject)", participantEmail: row.participant_email, participantName: row.participant_name, mailbox: row.mailbox, source: row.source, status: row.status, unreadCount: row.unread_count, lastMessageAt: row.last_message_at, preview: clean(row.last_message_preview, 240) })) };
}
export async function setInboxStatus(db, data) {
  const threadId = clean(data.threadId, 80);
  const status = clean(data.status, 20);
  if (!threadId || !["open", "closed"].includes(status)) return { error: "Choose a valid conversation status." };
  const thread = await db.prepare("SELECT id FROM inbox_threads WHERE id=?").bind(threadId).first();
  if (!thread) return { error: "Conversation not found." };
  await db.prepare("UPDATE inbox_threads SET status=? WHERE id=?").bind(status, threadId).run();
  return { success: true, status };
}
export async function getInboxThread(db, threadId) {
  const thread = await db.prepare("SELECT * FROM inbox_threads WHERE id=?").bind(clean(threadId, 80)).first();
  if (!thread) return { error: "Conversation not found." };
  const { results = [] } = await db.prepare("SELECT * FROM inbox_messages WHERE thread_id=? ORDER BY created_at").bind(thread.id).all();
  await db.prepare("UPDATE inbox_threads SET unread_count=0 WHERE id=?").bind(thread.id).run();
  return { thread: { id:thread.id, subject:thread.subject, participantEmail:thread.participant_email, participantName:thread.participant_name, mailbox:thread.mailbox, source:thread.source, status:thread.status }, messages: results.map(message => ({ id:message.id, direction:message.direction, kind:message.message_kind || "email", senderEmail:message.sender_email, senderName:message.sender_name, recipientEmail:message.recipient_email, htmlBody:message.html_body, textBody:message.text_body, attachments:parseAttachments(message.attachments_json), createdAt:message.created_at })) };
}
function safeEmail(value) { const email = clean(value, 254).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; }
function safeEmails(value) {
  const entries = Array.isArray(value) ? value : String(value || "").split(",");
  const emails = [...new Set(entries.map(safeEmail).filter(Boolean))];
  return emails.length <= 20 ? emails : [];
}
function safeHtml(value) { return clean(value, 50000).replace(/<(script|style|iframe|object)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "").replace(/javascript:/gi, ""); }
export async function replyInbox(db, env, data, actor) {
  const thread = await db.prepare("SELECT * FROM inbox_threads WHERE id=?").bind(clean(data.threadId,80)).first();
  const recipient = safeEmail(thread?.participant_email); const recipients = safeEmails(data.recipientEmails || [recipient]); const cc = safeEmails(data.cc); const bcc = safeEmails(data.bcc); const html = safeHtml(data.htmlBody); const text = textFromHtml(html);
  if (!thread || !recipient || !recipients.length) return { error:"Conversation not found." }; if (!text) return { error:"Write a reply before sending." };
  const apiKey = clean(env.BREVO_API_KEY, 300); if (!apiKey || apiKey.startsWith("xsmtpsib-")) return { error:"A Brevo HTTP API key is required to send inbox replies." };
  const sender = inboxMailbox(data.mailbox || thread.mailbox); const subject = clean(data.subject || thread.subject || "Karamah Collective", 180); const attachments=attachmentsFrom(data.attachments,true);
  if (Array.isArray(data.attachments) && !attachments.length) return { error:"Attachments must be files totalling 5 MB or less." };
  const response = await fetch("https://api.brevo.com/v3/smtp/email", { method:"POST", headers:{accept:"application/json","content-type":"application/json","api-key":apiKey}, body:JSON.stringify({ sender:{email:sender,name:"Karamah Collective"}, to:recipients.map(email=>({email,name:email===recipient?thread.participant_name||undefined:undefined})), ...(cc.length?{cc:cc.map(email=>({email}))}:{}), ...(bcc.length?{bcc:bcc.map(email=>({email}))}:{}), replyTo:{email:sender,name:"Karamah Collective"}, subject:subject.startsWith("Re:")?subject:`Re: ${subject}`, htmlContent:html, textContent:text, headers:{"In-Reply-To": thread.id}, tags:["admin-inbox"], ...(attachments.length ? {attachment:attachments.map(({name,content})=>({name,content}))}: {}) }) });
  if (!response.ok) return { error:"Brevo could not send this reply. Check the verified sender and API key." };
  const stamp = new Date().toISOString(); await db.batch([db.prepare("INSERT INTO inbox_messages (id,thread_id,direction,sender_email,sender_name,recipient_email,html_body,text_body,attachments_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id("msg"),thread.id,"outbound",sender,actor?.name||"Karamah Collective",recipient,html,text,JSON.stringify(attachmentsFrom(data.attachments)),stamp),db.prepare("UPDATE inbox_threads SET mailbox=?,status='open',last_message_at=? WHERE id=?").bind(sender,stamp,thread.id)]);
  return { success:true };
}
export async function composeInbox(db, env, data, actor) {
  const recipients = safeEmails(data.recipientEmails || data.recipientEmail), recipient = recipients[0], subject = clean(data.subject, 180), html = safeHtml(data.htmlBody), text = textFromHtml(html);
  if (!recipient) return { error: "Enter a valid recipient email." }; if (!subject) return { error: "Add a subject." }; if (!text) return { error: "Write a message before sending." };
  const apiKey = clean(env.BREVO_API_KEY, 300); if (!apiKey || apiKey.startsWith("xsmtpsib-")) return { error: "A Brevo HTTP API key is required to send inbox replies." };
  const stamp = new Date().toISOString(), threadId = id("thread"), mailbox = inboxMailbox(data.mailbox);
  await db.prepare("INSERT INTO inbox_threads (id,subject,participant_email,participant_name,mailbox,source,status,unread_count,last_message_at,created_at) VALUES (?,?,?,?,?,'outbound','open',0,?,?)").bind(threadId, subject, recipient, clean(data.recipientName,120), mailbox, stamp, stamp).run();
  const result = await replyInbox(db, env, { threadId, mailbox, subject, htmlBody: html, attachments:data.attachments, recipientEmails:recipients, cc:data.cc, bcc:data.bcc }, actor);
  if (result.error) {
    await db.prepare("DELETE FROM inbox_threads WHERE id=?").bind(threadId).run();
    return result;
  }
  return { ...result, threadId };
}
export async function addInboxNote(db, data, actor) {
  const threadId=clean(data.threadId,80), html=safeHtml(data.htmlBody), text=textFromHtml(html);
  if (!threadId || !text) return { error:"Write a note before saving." };
  const thread=await db.prepare("SELECT id FROM inbox_threads WHERE id=?").bind(threadId).first(); if (!thread) return { error:"Conversation not found." };
  const stamp=new Date().toISOString();
  await db.prepare("INSERT INTO inbox_messages (id,thread_id,direction,message_kind,sender_email,sender_name,recipient_email,html_body,text_body,attachments_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id("note"),threadId,"outbound","internal_note",clean(actor?.email,254),clean(actor?.name,120)||"Admin","",html,text,"[]",stamp).run();
  return { success:true };
}
export async function ingestInbox(db, data) {
  const email=safeEmail(data.from?.email || data.senderEmail || data.email); if(!email) return { error:"A sender email is required." };
  const mailbox=inboxMailbox(data.to?.email || data.mailbox || data.recipientEmail); const providerId=clean(data.messageId || data.providerMessageId,255); if(providerId && await db.prepare("SELECT id FROM inbox_messages WHERE provider_message_id=?").bind(providerId).first()) return { success:true,duplicate:true };
  const stamp=clean(data.receivedAt,60)||new Date().toISOString(), subject=clean(data.subject,180)||"(No subject)", name=clean(data.from?.name || data.senderName || data.name,120), html=safeHtml(data.htmlBody || data.html || ""), text=clean(data.textBody || data.text || textFromHtml(html),12000), threadId=clean(data.threadId,80)||id("thread");
  const current=await db.prepare("SELECT id FROM inbox_threads WHERE id=?").bind(threadId).first();
  const statements=[db.prepare("INSERT INTO inbox_messages (id,thread_id,direction,sender_email,sender_name,recipient_email,html_body,text_body,provider_message_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id("msg"),threadId,"inbound",email,name,mailbox,html,text,providerId,stamp)];
  statements.push(current ? db.prepare("UPDATE inbox_threads SET subject=?,participant_email=?,participant_name=?,mailbox=?,unread_count=unread_count+1,last_message_at=? WHERE id=?").bind(subject,email,name,mailbox,stamp,threadId) : db.prepare("INSERT INTO inbox_threads (id,subject,participant_email,participant_name,mailbox,source,status,unread_count,last_message_at,created_at) VALUES (?,?,?,?,?,'email','open',1,?,?)").bind(threadId,subject,email,name,mailbox,stamp,stamp)); await db.batch(statements); return {success:true,threadId};
}
