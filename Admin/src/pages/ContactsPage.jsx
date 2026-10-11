import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowBendUpLeft, ArrowBendUpRight, ArrowsOut, CaretDown, ChatCircleDots, DotsThreeOutline, LinkSimple, ListBullets, ListNumbers, MagnifyingGlassMinus, MagnifyingGlassPlus, Paperclip, Plus, SidebarSimple, TextB, TextItalic, TextUnderline, Trash, X } from "@phosphor-icons/react";
import { useAddInboxNote, useComposeInbox, useInbox, useInboxThread, useInboxTyping, useSendInboxReply, useSetInboxStatus, useSetInboxTyping } from "../api/queries.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { canInbox } from "../auth/permissions.js";
import { auth } from "../firebase.js";
import { useToast } from "../components/Toast.jsx";
import PageHeaderActions from "../components/PageHeaderActions.jsx";
import karamahIconUrl from "../../../Website/assets/images/kc_logo_small_icon.ico";
import manarahIconUrl from "../../../Maps/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png";

const MAILBOXES = ["contact@karamahcollective.com", "manarah@karamahcollective.com"];
const MANARAH_MAILBOX = "manarah@karamahcollective.com";
const mailboxKey = email => email.split("@")[0];
function mailboxContext(email, personalMailbox = "") {
  const normalized = String(email || "").toLowerCase();
  if (normalized && normalized === String(personalMailbox || "").toLowerCase()) return { kind:"personal", label:"Personal", title:"Your private mailbox", description:"Only you can access this inbox." };
  if (normalized.startsWith("contact@")) return { kind:"support", label:"Contact support", title:"Karamah support", description:"Shared with the contact team." };
  if (normalized.startsWith("manarah@")) return { kind:"support", label:"Manarah support", title:"Karamah support", description:"Shared with authorized admins." };
  return { kind:"support", label:"Support inbox", title:"Karamah support", description:"Shared workspace mailbox." };
}
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEV_THREADS = [
  {
    id:"sample-partnership", isSample:true, subject:"Partnership inquiry", participantName:"Aisha Rahman", participantEmail:"aisha.rahman@riversideyouth.org", mailbox:MAILBOXES[0], status:"open", unreadCount:1, lastMessageAt:"2026-10-09T10:24:00Z", preview:"We’re exploring a potential partnership with Karamah Collective.",
    messages:[
      { id:"sample-1", direction:"inbound", kind:"email", senderName:"Aisha Rahman", senderEmail:"aisha.rahman@riversideyouth.org", recipientEmail:MAILBOXES[0], createdAt:"2026-10-09T10:24:00Z", textBody:"Hi there,\n\nI’m reaching out on behalf of our youth organization, Riverside Youth Initiative. We’re exploring a potential partnership with Karamah Collective around a community mapping project focused on green spaces and safe routes for young people.\n\nWe’ve seen the amazing work you’re doing and think there’s a lot of overlap with our goals. Would you be open to a quick call in the coming weeks to discuss possibilities?\n\nWarmly,\nAisha Rahman\n\nProgram Coordinator\nRiverside Youth Initiative", attachments:[{name:"proposed-site.jpg",type:"image/jpeg",size:2202009},{name:"partnership-outline.pdf",type:"application/pdf",size:428032}] },
      { id:"sample-note", direction:"outbound", kind:"internal_note", senderName:"Amina Hassan", senderEmail:"amina@karamahcollective.com", recipientEmail:"", createdAt:"2026-10-09T10:42:00Z", textBody:"This looks promising. Check availability for a first call next week." },
    ],
  },
  { id:"sample-workshop", isSample:true, subject:"Mapping workshop", participantName:"Jordan Lee", participantEmail:"jordan@example.org", mailbox:MAILBOXES[0], status:"open", unreadCount:0, lastMessageAt:"2026-10-09T09:17:00Z", preview:"Do you have any upcoming dates for a community workshop?", messages:[{id:"sample-2",direction:"inbound",kind:"email",senderName:"Jordan Lee",senderEmail:"jordan@example.org",recipientEmail:MAILBOXES[0],createdAt:"2026-10-09T09:17:00Z",textBody:"Do you have any upcoming dates for a community mapping workshop?"}] },
  { id:"sample-volunteer", isSample:true, subject:"Volunteer opportunities", participantName:"Priya Desai", participantEmail:"priya@example.org", mailbox:MAILBOXES[0], status:"open", unreadCount:0, lastMessageAt:"2026-10-08T15:18:00Z", preview:"I’m interested in getting involved with Karamah Collective.", messages:[{id:"sample-3",direction:"inbound",kind:"email",senderName:"Priya Desai",senderEmail:"priya@example.org",recipientEmail:MAILBOXES[0],createdAt:"2026-10-08T15:18:00Z",textBody:"I’m a graduate student interested in getting involved. Could you share volunteer opportunities?"}] },
];
const initials = value => (value || "?").trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
const timeLabel = value => new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const chatTimeLabel = value => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const listTimeLabel = value => new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
const avatarUrlForEmail = value => String(value || "").toLowerCase() === MANARAH_MAILBOX ? `https://www.google.com/s2/photos/profile/${encodeURIComponent(MANARAH_MAILBOX)}?sz=64` : "";
function storedValue(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function escapeHtml(value) { return String(value || "").replace(/[&<>\"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[character])); }
function forwardDraft(message, conversation) {
  const sender = message.senderName ? `${message.senderName} <${message.senderEmail}>` : message.senderEmail;
  const header = `<div><br></div><div>---------- Forwarded message ----------<br>From: ${escapeHtml(sender)}<br>Date: ${escapeHtml(timeLabel(message.createdAt))}<br>Subject: ${escapeHtml(conversation.subject)}<br>To: ${escapeHtml(message.recipientEmail || conversation.mailbox)}</div><br>`;
  const htmlBody = compactHtmlBody(message.htmlBody);
  return { subject:`Fwd: ${conversation.subject}`, body:`\n\n---------- Forwarded message ----------\nFrom: ${sender}\nDate: ${timeLabel(message.createdAt)}\nSubject: ${conversation.subject}\nTo: ${message.recipientEmail || conversation.mailbox}\n\n${compactTextBody(message.textBody)}`, htmlBody: htmlBody ? header + htmlBody : "", branchFromThreadId:conversation.id, branchFromMessageId:message.id, branchFromMessage:message };
}
function IconButton({ Icon, label, ...props }) { return <button type="button" className="inbox-editor-icon" aria-label={label} title={label} {...props}><Icon size={18} /></button>; }
function Avatar({ name, email, unread = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = avatarUrlForEmail(email);
  return <span className="inbox-avatar" aria-hidden="true">{imageUrl && !imageFailed ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} /> : initials(name || email)}{unread && <i />}</span>;
}
function readFiles(files) { return Promise.all([...files].map(file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name:file.name, type:file.type, size:file.size, content:String(reader.result).split(",")[1] }); reader.onerror = reject; reader.readAsDataURL(file); }))); }
const attachmentLabel = size => size < 1024 * 1024 ? Math.ceil(size / 1024) + " KB" : (size / 1024 / 1024).toFixed(1) + " MB";
function MailboxWorkspace({ mailboxes, personalMailbox, personalName, selected, onSelect, syncButton = null, collapseButton = null, isLoading = false }) {
  if (isLoading) return <div className="inbox-mailbox-workspace is-loading" aria-label="Loading mailboxes" aria-busy="true">
    <div className="inbox-mailbox-workspace-head">
      <div className="inbox-mailbox-tabs pp-section-tabs inbox-mailbox-tabs-skeleton" aria-hidden="true"><span /><span /></div>
      <div className="inbox-mailbox-actions"><span className="inbox-skeleton inbox-skeleton-sync" aria-hidden="true" /><span className="inbox-skeleton inbox-skeleton-sync" aria-hidden="true" /></div>
    </div>
    <div className="inbox-mailbox-panel-stack" aria-hidden="true"><div className="inbox-mailbox-panel inbox-mailbox-panel-skeleton is-active"><div className="inbox-mailbox-row"><span className="inbox-workspace-mark inbox-skeleton" /><span className="inbox-workspace-copy"><i className="inbox-skeleton inbox-skeleton-line inbox-skeleton-line-name" /><i className="inbox-skeleton inbox-skeleton-line inbox-skeleton-line-address" /></span></div></div></div>
  </div>;
  const personal = mailboxes.find(email => email.toLowerCase() === personalMailbox.toLowerCase());
  const shared = mailboxes.filter(email => email.toLowerCase() !== personalMailbox.toLowerCase());
  const activeGroup = personal && selected === personal ? "personal" : "shared";
  return <div className="inbox-mailbox-workspace" aria-label="Mailbox workspace">
    <div className="inbox-mailbox-workspace-head">
      <div className="inbox-mailbox-tabs pp-section-tabs" role="tablist" aria-label="Mailbox type">
        {personal && <button type="button" role="tab" aria-selected={activeGroup === "personal"} className={activeGroup === "personal" ? "is-active" : ""} onClick={() => onSelect(personal)}><span>Personal</span></button>}
        {!!shared.length && <button type="button" role="tab" aria-selected={activeGroup === "shared"} className={activeGroup === "shared" ? "is-active" : ""} onClick={() => onSelect(shared.includes(selected) ? selected : shared[0])}><span>Shared</span></button>}
      </div>
      <div className="inbox-mailbox-actions">{syncButton}{collapseButton}</div>
    </div>
    <div className="inbox-mailbox-panel-stack" style={{ "--inbox-mailbox-row-count": activeGroup === "shared" ? Math.max(1, shared.length) : 1 }}>
      {personal && <div className={`inbox-mailbox-panel inbox-mailbox-panel-personal${activeGroup === "personal" ? " is-active" : ""}`} role="tabpanel" aria-hidden={activeGroup !== "personal"}><button type="button" className="inbox-mailbox-row is-selected" aria-pressed="true" onClick={() => onSelect(personal)}><span className="inbox-workspace-mark">P</span><span className="inbox-workspace-copy"><strong>{personalName || "Your mailbox"}</strong><small>{personal}</small></span></button></div>}
      {!!shared.length && <div className={`inbox-mailbox-panel inbox-mailbox-panel-shared${activeGroup === "shared" ? " is-active" : ""}`} role="tabpanel" aria-hidden={activeGroup !== "shared"}>{shared.map(email => { const context = mailboxContext(email, personalMailbox); const iconUrl = email.toLowerCase().startsWith("manarah@") ? manarahIconUrl : karamahIconUrl; return <button type="button" key={email} className={`inbox-mailbox-row${selected === email ? " is-selected" : ""}`} aria-pressed={selected === email} onClick={() => onSelect(email)}><span className="inbox-workspace-mark inbox-workspace-mark-logo" aria-hidden="true"><img src={iconUrl} alt="" /></span><span className="inbox-workspace-copy"><strong>{context.label}</strong><small>{email}</small></span></button>; })}</div>}
    </div>
  </div>;
}

function MailFilterDialog({ value, onChange, onClose, onReset }) {
  const update = (key, next) => onChange({ ...value, [key]:next });
  const active = value.sortOrder !== "newest" || value.read !== "all" || value.direction !== "all" || value.sender || value.subject;
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return undefined;
    if (!node.open) node.showModal();
    const cancel = event => { event.preventDefault(); onClose(); };
    node.addEventListener("cancel", cancel);
    return () => { node.removeEventListener("cancel", cancel); if (node.open) node.close(); };
  }, []);
  return <dialog ref={dialog} className="inbox-filter-dialog" onClick={event => { if (event.target === dialog.current) onClose(); }} aria-label="Sort and filter mail">
    <div className="inbox-filter-dialog-head"><h2>Sort and filter</h2><button type="button" className="inbox-editor-icon" aria-label="Close sort and filter" onClick={onClose}><X size={18} /></button></div>
    <div className="inbox-filter-fields">
      <label><span>Sort</span><select aria-label="Sort mail" value={value.sortOrder} onChange={event => update("sortOrder", event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      <label><span>From or email</span><input aria-label="Filter by sender or email" value={value.sender} onChange={event => update("sender", event.target.value)} placeholder="Name or address" /></label>
      <label><span>Subject</span><input aria-label="Filter by subject" value={value.subject} onChange={event => update("subject", event.target.value)} placeholder="Subject contains" /></label>
      <label><span>Read state</span><select value={value.read} onChange={event => update("read", event.target.value)}><option value="all">All messages</option><option value="unread">Unread only</option><option value="read">Read only</option></select></label>
      <label><span>Direction</span><select value={value.direction} onChange={event => update("direction", event.target.value)}><option value="all">Received and sent</option><option value="received">Received</option><option value="sent">Sent</option></select></label>
    </div>
    {active && <button type="button" className="inbox-filter-reset" onClick={onReset}>Reset filters</button>}
  </dialog>;
}

function Composer({ thread, mailbox, mailboxes, personalMailbox = "", canWrite, onSent, onSampleSend, onTyping, initialDraft, branchFromMessage, branchFromThreadId, isCompact = false, onComposerInteract }) {
  const editor = useRef(null), fileInput = useRef(null), toast = useToast();
  const reply = useSendInboxReply(), compose = useComposeInbox(), note = useAddInboxNote();
  const [from, setFrom] = useState(mailbox), [to, setTo] = useState(""), [cc, setCc] = useState(""), [bcc, setBcc] = useState(""), [subject, setSubject] = useState(""), [mode, setMode] = useState("reply"), [attachments, setAttachments] = useState([]), [error, setError] = useState("");
  const [showCopies, setShowCopies] = useState(false), [showMobileTools, setShowMobileTools] = useState(false), [fontFamily, setFontFamily] = useState("Plus Jakarta Sans"), [fontSize, setFontSize] = useState("14");
  useEffect(() => { setFrom(thread?.mailbox || mailbox); setTo(initialDraft?.to || ""); setCc(""); setBcc(""); setSubject(initialDraft?.subject || ""); setMode("reply"); setShowCopies(false); setShowMobileTools(false); setFontFamily("Plus Jakarta Sans"); setFontSize("14"); setAttachments([]); setError(""); if (editor.current) { if (initialDraft?.htmlBody) editor.current.innerHTML = initialDraft.htmlBody; else editor.current.innerText = initialDraft?.body || ""; editor.current.style.fontFamily = 'inherit'; editor.current.style.fontSize = "14px"; } }, [thread?.id, thread?.mailbox, mailbox, initialDraft]);
  useEffect(() => { if (isCompact) setShowMobileTools(false); }, [isCompact]);
  const mutation = mode === "note" ? note : thread ? reply : compose;
  useEffect(() => {
    const node = editor.current;
    if (!node || !onTyping) return undefined;
    const handleInput = () => onTyping(mode === "reply" && Boolean(node.innerText.trim()));
    node.addEventListener("input", handleInput);
    return () => node.removeEventListener("input", handleInput);
  }, [mode, onTyping]);
  const run = (command, value) => { editor.current?.focus(); document.execCommand(command, false, value); };
  const changeFont = value => { setFontFamily(value); editor.current?.focus(); document.execCommand("fontName", false, value); if (editor.current) editor.current.style.fontFamily = `"${value}", sans-serif`; };
  const changeFontSize = value => { setFontSize(value); editor.current?.focus(); document.execCommand("fontSize", false, "7"); editor.current?.querySelectorAll('font[size="7"]').forEach(node => { node.removeAttribute("size"); node.style.fontSize = `${value}px`; }); if (editor.current) editor.current.style.fontSize = `${value}px`; };
  async function chooseFiles(event) {
    try { const next = [...attachments, ...await readFiles(event.target.files)]; if (next.length > 5 || next.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_BYTES) throw new Error("Add up to five files totalling 5 MB or less."); setAttachments(next); } catch (failure) { setError(failure.message); } event.target.value = "";
  }
  async function send(event) {
    event.preventDefault(); const htmlBody = editor.current?.innerHTML?.trim() || "", text = editor.current?.innerText?.trim() || "";
    if (!text && (mode === "note" || !attachments.length)) { setError(mode === "note" ? "Write a note before saving." : "Add a message or attachment before sending."); return; }
    const recipients = to.split(",").map(email => email.trim()).filter(Boolean);
    if (!thread && mode === "reply" && (!recipients.length || recipients.some(email => !emailPattern.test(email)))) { setError("Enter one or more valid recipient emails."); return; }
    if (!thread && mode === "reply" && !subject.trim()) { setError("Add a subject."); return; }
    setError("");
    const lockedMailbox = String(thread?.mailbox || mailbox || from || "").toLowerCase();
    const payload = mode === "note" ? { threadId:thread.id, htmlBody } : thread ? { threadId:thread.id, subject:thread.subject, htmlBody, attachments, ...(branchFromMessage?.id ? { branchFromMessageId:branchFromMessage.id } : {}) } : { recipientEmails:recipients, subject:subject.trim(), mailbox:lockedMailbox, htmlBody, attachments, cc, bcc, ...(branchFromThreadId && branchFromMessage?.id ? { branchFromThreadId, branchFromMessageId:branchFromMessage.id } : {}) };
    if (thread?.isSample) { onSampleSend?.({ mode, htmlBody, text, attachments, from, branchFromMessage }); editor.current.innerHTML = ""; setAttachments([]); return; }
    try { const result = await mutation.mutateAsync(payload); editor.current.innerHTML = ""; setAttachments([]); onTyping?.(false); toast(mode === "note" ? "Internal note saved" : thread ? "Reply sent" : "Email sent"); await onSent?.(result?.threadId, from); } catch (failure) { setError(failure.message); }
  }
  const context = mailboxContext(thread?.mailbox || mailbox, personalMailbox);
  return <form className={"inbox-compose inbox-compose-" + context.kind + (isCompact ? " is-compact" : "")} data-mailbox={thread?.mailbox || mailbox} onPointerDown={onComposerInteract} onFocusCapture={onComposerInteract} onSubmit={send} aria-label={thread ? "Conversation composer" : "Compose email"}>
    {thread && <div className="inbox-compose-head"><div className="inbox-compose-tabs pp-section-tabs" role="group" aria-label="Reply type"><button type="button" aria-pressed={mode === "reply"} className={mode === "reply" ? "is-active" : ""} onClick={() => setMode("reply")}>Reply</button><button type="button" aria-pressed={mode === "note"} className={mode === "note" ? "is-active" : ""} onClick={() => setMode("note")}>Internal note</button></div><p className={`inbox-reply-to${mode === "note" ? " is-note" : ""}`}>{mode === "note" ? "Visible to admins only" : "To " + (thread.participantName || thread.participantEmail) + " <" + thread.participantEmail + ">"}</p></div>}
    {!thread && <div className="inbox-fields inbox-new-fields"><div className="inbox-recipient-row"><label>To<input value={to} onChange={event => setTo(event.target.value)} placeholder="name@example.com" required /></label><button type="button" className="inbox-copy-toggle" aria-expanded={showCopies} aria-controls="inbox-copy-fields" onClick={() => setShowCopies(value => !value)}>Cc / Bcc</button></div><div id="inbox-copy-fields" className="inbox-cc-bcc" hidden={!showCopies}><label>CC<input value={cc} onChange={event => setCc(event.target.value)} placeholder="Optional recipients" /></label><label>BCC<input value={bcc} onChange={event => setBcc(event.target.value)} placeholder="Private recipients" /></label></div><label>Subject<input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Subject" required maxLength={180} /></label></div>}
    <div className="inbox-editor-box"><div className="inbox-rich-toolbar" role="group" aria-label="Message formatting"><div className="inbox-toolbar-basic"><IconButton Icon={TextB} label="Bold" onClick={() => run("bold")} /><IconButton Icon={TextItalic} label="Italic" onClick={() => run("italic")} /><IconButton Icon={TextUnderline} label="Underline" onClick={() => run("underline")} /></div><div className="inbox-mobile-compose-actions">{mode === "reply" && <IconButton Icon={Paperclip} label="Attach files" onClick={() => fileInput.current?.click()} disabled={!canWrite} />}<IconButton Icon={Trash} label="Clear draft" onClick={() => { if (editor.current) editor.current.innerHTML = ""; setAttachments([]); }} /></div><button type="button" className="inbox-mobile-format-toggle" aria-label="More formatting" aria-controls="inbox-mobile-format-tools" aria-expanded={showMobileTools} title="More formatting" onClick={() => setShowMobileTools(value => !value)}><DotsThreeOutline size={18} weight="bold" /></button><div id="inbox-mobile-format-tools" className={"inbox-toolbar-advanced" + (showMobileTools ? " is-mobile-open" : "")}><i /><select className="inbox-font-picker" aria-label="Message typeface" value={fontFamily} onChange={event => changeFont(event.target.value)}><option value="Plus Jakarta Sans">Default</option><option value="Geist">Geist</option><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option><option value="Georgia">Georgia</option><option value="Garamond">Garamond</option><option value="Palatino">Palatino</option><option value="Verdana">Verdana</option><option value="Courier New">Courier New</option></select><select className="inbox-font-size-picker" aria-label="Message font size" value={fontSize} onChange={event => changeFontSize(event.target.value)}><option value="12">12</option><option value="13">13</option><option value="14">14</option><option value="16">16</option><option value="18">18</option><option value="20">20</option><option value="24">24</option></select><i /><IconButton Icon={ListBullets} label="Bulleted list" onClick={() => run("insertUnorderedList")} /><IconButton Icon={ListNumbers} label="Numbered list" onClick={() => run("insertOrderedList")} /><IconButton Icon={LinkSimple} label="Insert link" onClick={() => { const url = prompt("Link URL"); if (url) run("createLink", url); }} /></div></div>
      <div ref={editor} className="inbox-editor" contentEditable role="textbox" aria-multiline="true" aria-label="Email message" data-placeholder={mode === "note" ? "Write an internal note…" : "Write your message…"} />
      {!!attachments.length && <div className="inbox-draft-attachments">{attachments.map((file, index) => <span key={file.name + index}>{file.name} <small>{attachmentLabel(file.size)}</small><button type="button" onClick={() => setAttachments(current => current.filter((_, item) => item !== index))} aria-label={"Remove " + file.name}>×</button></span>)}</div>}
      <div className="inbox-editor-footer">{mode === "reply" && <div className="inbox-from" aria-label={`Sending from ${from}`}><span>From</span><span className="inbox-from-address" title={from}>{from}</span></div>}<div className="inbox-send-actions">{mode === "reply" && <IconButton Icon={Paperclip} label="Attach files" onClick={() => fileInput.current?.click()} disabled={!canWrite} />}<IconButton Icon={Trash} label="Clear draft" onClick={() => { if (editor.current) editor.current.innerHTML = ""; setAttachments([]); }} /><button type="submit" className={`pp-btn pp-btn-primary inbox-send-submit is-${mode}`} disabled={!canWrite || mutation.isPending}><span key={`${mode}-${mutation.isPending ? "pending" : "ready"}`} className="inbox-send-submit-label">{mutation.isPending ? mode === "note" ? "Saving…" : "Sending…" : mode === "note" ? "Save note" : "Send"}</span></button></div><input ref={fileInput} type="file" multiple hidden onChange={chooseFiles} /></div></div>
    {error && <p className="pp-error-text" role="alert">{error}</p>}
  </form>;
}
const blockedAttachmentPattern = /\.(?:ade|adp|app|apk|bat|cab|cmd|com|cpl|dll|dmg|exe|hta|img|iso|jar|js|jse|lnk|mht|msi|ocx|ps1|scr|sh|svg|url|vbe|vbs|wsc|wsf|xll|xlsm|xltm|docm|dotm|pptm|potm)$/i;
function attachmentBlob(file) {
  if (!file?.content) return null;
  const encoded = String(file.content).replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const binary = atob(encoded + "=".repeat((4 - encoded.length % 4) % 4));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new Blob([bytes], { type:file.type || "application/octet-stream" });
}
function openAttachment(file) {
  if (!file.content || blockedAttachmentPattern.test(file.name || "")) return;
  try {
    const url = URL.createObjectURL(attachmentBlob(file));
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {}
}
function ChatAttachmentFile({ file }) {
  const blocked = blockedAttachmentPattern.test(file.name || "");
  const unavailable = !file.content;
  return <article className="inbox-chat-file"><span className="inbox-chat-file-icon"><Paperclip size={18} /></span><div className="inbox-chat-file-copy"><strong title={file.name}>{file.name}</strong><small>{blocked ? "Blocked for safety" : unavailable ? "Unavailable" : attachmentLabel(file.size)}</small></div><button type="button" className="inbox-chat-file-open" onClick={() => openAttachment(file)} disabled={blocked || unavailable} aria-label={blocked ? `${file.name} is blocked for safety` : unavailable ? `${file.name} is unavailable` : `Open ${file.name}`}>{blocked ? "Blocked" : unavailable ? "Unavailable" : "Open"}</button></article>;
}
function ChatAttachment({ file }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const video = useRef(null);
  const kind = String(file.type || "").toLowerCase();
  const isImage = kind.startsWith("image/") && !blockedAttachmentPattern.test(file.name || "");
  const isVideo = kind.startsWith("video/") && !blockedAttachmentPattern.test(file.name || "");
  useEffect(() => {
    if ((!isImage && !isVideo) || !file.content) { setUrl(""); return undefined; }
    let nextUrl = "";
    try { nextUrl = URL.createObjectURL(attachmentBlob(file)); setUrl(nextUrl); setFailed(false); } catch { setUrl(""); setFailed(true); }
    return () => { if (nextUrl) URL.revokeObjectURL(nextUrl); };
  }, [file.content, file.name, file.type, isImage, isVideo]);
  if (!url || failed) return <ChatAttachmentFile file={file} />;
  if (isImage) return <figure className="inbox-chat-media inbox-chat-image"><a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.name}`}><img src={url} alt={file.name} loading="lazy" onError={() => setFailed(true)} /></a><figcaption>{file.name}</figcaption></figure>;
  return <figure className="inbox-chat-media inbox-chat-video"><div className="inbox-chat-video-frame"><video ref={video} src={url} controls preload="metadata" onError={() => setFailed(true)} aria-label={file.name} /><button type="button" className="inbox-chat-video-expand" onClick={() => { const player = video.current; if (player?.requestFullscreen) player.requestFullscreen().catch(() => {}); else player?.webkitEnterFullscreen?.(); }} aria-label={`Maximize ${file.name}`} title="Maximize video"><ArrowsOut size={15} weight="bold" /></button></div><figcaption>{file.name}</figcaption></figure>;
}
function ChatAttachments({ files }) {
  return <div className="inbox-chat-attachments" aria-label={`${files.length} attachment${files.length === 1 ? "" : "s"}`}>{files.map((file, index) => <ChatAttachment key={`${file.name}-${index}`} file={file} />)}</div>;
}
function MessageAttachments({ files = [] }) {
  return files.length ? <div className="inbox-message-attachments" aria-label={`${files.length} attachment${files.length === 1 ? "" : "s"}`}>{files.map((file, index) => <ChatAttachment key={`${file.name}-${index}`} file={file} />)}</div> : null;
}
function ChatMessage({ message, currentUser }) {
  const [expanded, setExpanded] = useState(false);
  const isNote = message.kind === "internal_note";
  const isOutbound = !isNote && message.direction === "outbound";
  const ownName = currentUser?.displayName || currentUser?.email || "Admin";
  const isOwn = isOutbound && (
    !currentUser?.email ||
    String(message.senderAdminEmail || "").toLowerCase() === String(currentUser.email).toLowerCase() ||
    String(message.senderEmail || "").toLowerCase() === String(currentUser.email).toLowerCase() ||
    String(message.senderName || "").trim().toLowerCase() === String(ownName).trim().toLowerCase()
  );
  const sender = isNote ? (message.senderAdminName || message.senderName || "Internal note") : isOutbound ? isOwn ? "You" : (message.senderAdminName || message.senderName || message.senderEmail || "Admin") : (message.senderName || message.senderEmail);
  const rawHtmlBody = compactHtmlBody(message.htmlBody);
  const rawTextBody = compactTextBody(message.textBody);
  const attachmentOnly = attachmentHasOnlyQuotedBody(message, rawHtmlBody, rawTextBody);
  const htmlBody = attachmentOnly ? "" : rawHtmlBody;
  const textBody = attachmentOnly ? "" : rawTextBody;
  const isLongBody = Boolean(htmlBody && (htmlBody.length > 3200 || /<(table|img|pre|blockquote)\b/i.test(htmlBody))) || textBody.length > 2400;
  const tone = isNote ? "is-note" : isOutbound ? isOwn ? "is-outbound is-own" : "is-outbound is-admin" : "is-inbound";
  return <article className={"inbox-chat-message " + tone}>
    {!isOutbound && <Avatar name={message.senderName} email={message.senderEmail} />}
    <div className="inbox-chat-stack">
      <div className="inbox-chat-meta"><strong>{sender}</strong><time dateTime={message.createdAt} title={timeLabel(message.createdAt)}>{chatTimeLabel(message.createdAt)}</time></div>
      <div className="inbox-chat-bubble">{htmlBody ? <div className={`inbox-chat-html-viewport${isLongBody && !expanded ? " is-clipped" : ""}`}><div className="inbox-message-html" dangerouslySetInnerHTML={{ __html: htmlBody }} /></div> : textBody ? <div className={isLongBody && !expanded ? "inbox-chat-text is-clipped" : "inbox-chat-text"}>{textBody}</div> : null}{isLongBody && <button type="button" className="inbox-chat-content-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : "Show full email"}</button>}{message.attachments?.length > 0 && <ChatAttachments files={message.attachments} />}</div>
    </div>
  </article>;
}
function ChatTypingIndicator({ participant }) {
  if (!participant) return null;
  return <div className="inbox-chat-typing" role="status" aria-label={`${participant.name} is typing`}><span className="inbox-chat-typing-bubble"><i /><i /><i /></span><span>{participant.name} is typing</span></div>;
}
function ChatThread({ messages, currentUser, typingParticipant, onScroll }) {
  const thread = useRef(null);
  useEffect(() => {
    const node = thread.current;
    if (node) requestAnimationFrame(() => { node.scrollTop = node.scrollHeight; });
  }, [messages.length, messages.at(-1)?.id, typingParticipant]);
  const visibleMessages = messages.filter(messageHasContent);
  let previousDay = "";
  return <div ref={thread} className="inbox-chat-thread" onScroll={onScroll}><div className="inbox-chat-list">{visibleMessages.length ? visibleMessages.map(message => {
    const day = new Date(message.createdAt).toLocaleDateString([], { year:"numeric", month:"long", day:"numeric" });
    const showDay = day !== previousDay;
    previousDay = day;
    return <Fragment key={message.id}>{showDay && <div className="inbox-chat-day"><span>{day}</span></div>}<ChatMessage message={message} currentUser={currentUser} /></Fragment>;
  }) : <p className="inbox-chat-empty">No messages in this conversation yet.</p>}{typingParticipant && <ChatTypingIndicator participant={typingParticipant} />}</div></div>;
}
function messagePreview(message) {
  const body = String(message.textBody || message.htmlBody || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (body) return body.slice(0, 220);
  const count = message.attachments?.length || 0;
  return count ? `${count} attachment${count === 1 ? "" : "s"}` : "No message text available.";
}
function plainEmailBody(value) {
  return String(value || "No message text available.").replace(/(?:[_-]\s*){4,}/g, "\n⋯\n");
}
function compactHtmlBody(value) {
  const source = String(value || "").trim();
  if (!source || typeof DOMParser === "undefined") return source.replace(/<(p|div)\b[^>]*>(?:\s|&nbsp;|\u00a0|<br\s*\/?>)*<\/\1>/gi, "").replace(/(?:<br\s*\/?>\s*)+$/i, "").trim();
  const root = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html").body.firstElementChild;
  if (!root) return "";
  root.querySelectorAll("script,style,iframe,object,embed,form,meta,link,base").forEach(node => node.remove());
  root.querySelectorAll("*").forEach(node => {
    [...node.attributes].forEach(attribute => {
      if (/^on/i.test(attribute.name) || (/^(href|src|action)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value))) node.removeAttribute(attribute.name);
    });
  });
  const visibleText = node => String(node.textContent || "").replace(/\u00a0/g, " ").trim();
  const hasMedia = node => /^(IMG|SVG|VIDEO|AUDIO|TABLE)$/.test(node.tagName) || Boolean(node.querySelector?.("img,svg,video,audio,table"));
  [...root.querySelectorAll("*")].reverse().forEach(node => {
    if (node.tagName !== "BR" && !visibleText(node) && !hasMedia(node)) node.remove();
  });
  const trimTrailing = node => {
    while (node.lastChild) {
      const child = node.lastChild;
      const blankText = child.nodeType === Node.TEXT_NODE && !String(child.textContent || "").trim();
      const blankElement = child.nodeType === Node.ELEMENT_NODE && (child.tagName === "BR" || (!visibleText(child) && !hasMedia(child)));
      if (!blankText && !blankElement) break;
      child.remove();
    }
  };
  [...root.querySelectorAll("*")].reverse().forEach(trimTrailing);
  trimTrailing(root);
  return root.innerHTML.trim();
}
function InboxSidebarToggle({ collapsed, onClick }) {
  return <button type="button" className="inbox-sidebar-toggle pp-btn" onClick={onClick} aria-pressed={collapsed} aria-label={collapsed ? "Show conversation list" : "Expand reading pane"} title={collapsed ? "Show conversation list" : "Expand reading pane"}><SidebarSimple size={18} weight="regular" /></button>;
}
function compactTextBody(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function chatBodyWithoutQuotedMail(value) {
  const source = compactTextBody(value);
  if (!source) return "";
  const marker = source.search(/(?:^|\n)\s*(?:[-_=]{5,}\s*)?From:\s*[\s\S]{0,260}?\b(?:Sent|Date):/i);
  if (marker < 0) return source;
  return source.slice(0, marker).replace(/[-_=\s]+$/g, "").trim();
}
function attachmentHasOnlyQuotedBody(message, htmlBody, textBody) {
  if (!message.attachments?.length) return false;
  const body = chatBodyWithoutQuotedMail(textBody || htmlBody.replace(/<[^>]+>/g, " "));
  return !body;
}
function messageHasContent(message) {
  return Boolean(compactHtmlBody(message.htmlBody) || compactTextBody(message.textBody) || message.attachments?.length);
}
function MessageCard({ message, conversation, currentUser, onReply, onForward, isEarlier = false, bodyZoom = 1 }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isNote = message.kind === "internal_note";
  const adminName = message.senderAdminName || message.senderName || message.senderEmail;
  const adminEmail = String(message.senderAdminEmail || "").toLowerCase();
  const ownEmail = String(currentUser?.email || "").toLowerCase();
  const isOwn = !isNote && message.direction === "outbound" && ((adminEmail && ownEmail && adminEmail === ownEmail) || (!adminEmail && ownEmail && String(message.senderEmail || "").toLowerCase() === ownEmail));
  const senderLabel = isNote ? `${adminName || "Admin"} · Internal note` : isOwn ? "You" : adminName || "Unknown sender";
  return <article className={"inbox-message" + (isNote ? " is-note" : "") + (isEarlier ? " is-earlier" : "")}>
    <div className="inbox-message-head">
      <Avatar name={message.senderName} email={message.senderEmail} />
      <div className="inbox-message-sender"><strong className={isOwn ? "is-own" : message.direction === "outbound" && !isNote ? "is-admin" : ""}>{senderLabel}</strong><small title={message.senderAdminEmail || message.senderEmail}>{isNote ? "Visible to admins only" : message.senderAdminEmail ? `${message.senderAdminEmail} · Admin` : message.senderEmail}</small></div>
      <div className="inbox-message-meta">{!isNote && <div className="inbox-message-actions"><IconButton Icon={ArrowBendUpLeft} label="Reply to message" onClick={onReply} /><IconButton Icon={ArrowBendUpRight} label="Forward" onClick={onForward} /></div>}<time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time></div>
    </div>
    <div className="inbox-message-content">
      <button type="button" className="inbox-message-details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}>{detailsOpen ? "Hide details" : "Show details"}</button>
      <div className={"inbox-message-details-wrap" + (detailsOpen ? " is-open" : "")} aria-hidden={!detailsOpen}><dl className="inbox-message-details"><div><dt>From</dt><dd>{message.senderAdminEmail ? `${message.senderAdminName || message.senderName || "Admin"} <${message.senderAdminEmail}>` : message.senderName ? `${message.senderName} <${message.senderEmail}>` : message.senderEmail}</dd></div><div><dt>Sent</dt><dd>{timeLabel(message.createdAt)}</dd></div><div><dt>To</dt><dd>{message.recipientEmail || conversation.mailbox}</dd></div><div><dt>Subject</dt><dd>{conversation.subject}</dd></div></dl></div>
      <div className="inbox-message-body-viewport"><div className="inbox-message-body-canvas" style={{ "--email-body-zoom": bodyZoom }}>{message.htmlBody ? <div className="inbox-message-body inbox-message-html" dangerouslySetInnerHTML={{ __html: compactHtmlBody(message.htmlBody) }} /> : <div className="inbox-message-body">{plainEmailBody(message.textBody)}</div>}</div></div>
      <MessageAttachments files={message.attachments} />
    </div>
  </article>;
}
function EmailBodyToolbar({ zoom, onZoomChange }) {
  const percent = Math.round(zoom * 100);
  return <div className="inbox-email-body-toolbar" role="toolbar" aria-label="Email body view controls">
    <span>Message body</span>
    <div className="inbox-email-body-zoom"><IconButton Icon={MagnifyingGlassMinus} label="Zoom email body out" onClick={() => onZoomChange(Math.max(.8, Number((zoom - .1).toFixed(2))))} /><span aria-live="polite">{percent}%</span><IconButton Icon={MagnifyingGlassPlus} label="Zoom email body in" onClick={() => onZoomChange(Math.min(1.8, Number((zoom + .1).toFixed(2))))} /></div>
  </div>;
}
export default function ContactsPage() {
  const toast = useToast(), queryClient = useQueryClient(), { access, user, loading: authLoading } = useAuth();
  const chatUser = useMemo(() => user ? { ...user, displayName: access?.displayName || user.displayName || user.email } : user, [access?.displayName, user]);
  const [searchParams, setSearchParams] = useSearchParams();
  const routeFolder = searchParams.get("folder") || "Inbox";
  const routeSearch = searchParams.get("search") || "";
  const [folder, setFolder] = useState(routeFolder);
  const inbox = useInbox(folder), statusMutation = useSetInboxStatus(), publishTyping = useSetInboxTyping();
  const mailboxLoading = authLoading || inbox.isLoading || !inbox.data;
  const configuredMailboxes = useMemo(() => {
    if (mailboxLoading) return [];
    const fromInbox = Array.isArray(inbox.data?.mailboxes) ? inbox.data.mailboxes : [];
    const permittedSharedMailboxes = MAILBOXES.filter(email => canInbox(access, "read", mailboxKey(email)));
    return [...new Set([...fromInbox, ...permittedSharedMailboxes].map(email => String(email || "").toLowerCase()).filter(Boolean))];
  }, [access, inbox.data?.mailboxes, mailboxLoading]);
  const folders = Array.isArray(inbox.data?.folders) && inbox.data.folders.length ? inbox.data.folders : [{ id:"all", label:"All mail" }, { id:"Inbox", label:"Inbox" }, { id:"Sent", label:"Sent" }, { id:"Junk", label:"Junk" }, { id:"Deleted", label:"Deleted" }, { id:"Starred", label:"Starred" }];
  const personalMailbox = String(user?.email || "").toLowerCase();
  const readableMailboxes = useMemo(() => configuredMailboxes.filter(email => email.toLowerCase() === personalMailbox || canInbox(access, "read", mailboxKey(email))), [access, configuredMailboxes, personalMailbox]);
  const writableMailboxes = useMemo(() => configuredMailboxes.filter(email => email.toLowerCase() === personalMailbox || canInbox(access, "write", mailboxKey(email))), [access, configuredMailboxes, personalMailbox]);
  const canWrite = writableMailboxes.length > 0;
  const storageScope = (user?.email || "workspace").toLowerCase();
  const mailboxStorageKey = `admin-inbox-mailbox:${storageScope}`;
  const tabStorageKey = `admin-inbox-tab:${storageScope}`;
  const [selected, setSelected] = useState(""), [mailbox, setMailbox] = useState(""), [tab, setTab] = useState("all"), [search, setSearch] = useState(routeSearch), [filters, setFilters] = useState({ sortOrder:"newest", read:"all", direction:"all", sender:"", subject:"" }), [sampleMessages, setSampleMessages] = useState({}), [sampleStatuses, setSampleStatuses] = useState({}), [sampleUnread, setSampleUnread] = useState({}), [sampleBranches, setSampleBranches] = useState([]), [newDraft, setNewDraft] = useState(null), [sidebarCollapsed, setSidebarCollapsed] = useState(() => storedValue("admin-inbox-sidebar", "expanded") === "collapsed");
  const activeMailboxContext = mailboxContext(mailbox, personalMailbox);
  const [readerOpen, setReaderOpen] = useState(false), [historyOpen, setHistoryOpen] = useState(false), [chatMode, setChatMode] = useState(false), [chatViewMounted, setChatViewMounted] = useState(false), [replyContext, setReplyContext] = useState(null), [typingParticipant, setTypingParticipant] = useState(null), [composeExpanded, setComposeExpanded] = useState(true), [emailZoom, setEmailZoom] = useState(1), [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const typingChannel = useRef(null), typingStopTimer = useRef(null), typingExpiryTimer = useRef(null), composeInteractionUntil = useRef(0), typingClientId = useRef(`typing-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    if (authLoading || !user?.uid) return undefined;
    let socket;
    let retryTimer;
    let heartbeat;
    let stopped = false;
    let retryDelay = 1000;
    const connect = async () => {
      if (stopped || !auth.currentUser) return;
      try {
        const token = await auth.currentUser.getIdToken();
        const endpoint = new URL("/api/inbox-events", window.location.origin);
        endpoint.searchParams.set("token", token);
        endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(endpoint.toString());
        socket.onopen = () => {
          retryDelay = 1000;
          heartbeat = window.setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send("ping"); }, 45_000);
        };
        socket.onmessage = event => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === "inbox.updated") queryClient.invalidateQueries({ queryKey: ["inbox"] });
          } catch {}
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => {
          if (heartbeat) window.clearInterval(heartbeat);
          heartbeat = undefined;
          if (!stopped) { retryTimer = window.setTimeout(connect, retryDelay); retryDelay = Math.min(retryDelay * 2, 30_000); }
        };
      } catch {
        if (!stopped) { retryTimer = window.setTimeout(connect, retryDelay); retryDelay = Math.min(retryDelay * 2, 30_000); }
      }
    };
    connect();
    return () => {
      stopped = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (heartbeat) window.clearInterval(heartbeat);
      socket?.close();
    };
  }, [authLoading, queryClient, user?.uid]);
  const threads = useMemo(() => {
    const samples = [...DEV_THREADS, ...sampleBranches].filter(thread => readableMailboxes.includes(thread.mailbox)).map(thread => ({ ...thread, status:sampleStatuses[thread.id] || thread.status, unreadCount: sampleUnread[thread.id] ?? thread.unreadCount }));
    const liveThreads = inbox.data?.threads || [];
    return import.meta.env.DEV && !inbox.isLoading && !inbox.isError && !liveThreads.length ? samples : liveThreads;
  }, [inbox.data, inbox.isLoading, inbox.isError, readableMailboxes, sampleStatuses, sampleUnread, sampleBranches]);
  useEffect(() => {
    if (!readableMailboxes.length) { setMailbox(""); return; }
    const saved = storedValue(mailboxStorageKey, "");
    if (!readableMailboxes.includes(mailbox)) setMailbox(readableMailboxes.includes(saved) ? saved : readableMailboxes[0]);
  }, [mailboxStorageKey, readableMailboxes, mailbox]);
  const selectFolder = nextFolder => { setFolder(nextFolder); setSearchParams(previous => { const next = new URLSearchParams(previous); next.set("folder", nextFolder); return next; }, { replace:true }); };
  useEffect(() => { if (routeFolder !== folder) setFolder(routeFolder); }, [routeFolder, folder]);
  useEffect(() => { if (routeSearch !== search) setSearch(routeSearch); }, [routeSearch, search]);
  useEffect(() => { if (!folders.some(item => item.id === folder)) selectFolder("Inbox"); }, [folder, folders]);
  useEffect(() => { const saved = storedValue(tabStorageKey, "all"); if (["all", "open", "closed"].includes(saved)) setTab(saved); }, [tabStorageKey]);
  useEffect(() => { if (mailbox) { try { localStorage.setItem(mailboxStorageKey, mailbox); } catch {} } }, [mailbox, mailboxStorageKey]);
  useEffect(() => { try { localStorage.setItem(tabStorageKey, tab); } catch {} }, [tab, tabStorageKey]);
  useEffect(() => { try { localStorage.setItem("admin-inbox-sidebar", sidebarCollapsed ? "collapsed" : "expanded"); } catch {} }, [sidebarCollapsed]);
  const visible = useMemo(() => threads.filter(thread => {
    const senderHaystack = (thread.participantName + " " + thread.participantEmail).toLowerCase();
    const subjectHaystack = String(thread.subject || "").toLowerCase();
    const haystack = (senderHaystack + " " + subjectHaystack + " " + thread.preview).toLowerCase();
    const matchesRead = filters.read === "all" || (filters.read === "unread" ? thread.unreadCount > 0 : thread.unreadCount <= 0);
    const matchesDirection = filters.direction === "all" || (filters.direction === "sent" ? (thread.hasOutbound ?? thread.source === "outbound") : !(thread.hasOutbound ?? thread.source === "outbound"));
    const matchesSender = !filters.sender.trim() || senderHaystack.includes(filters.sender.trim().toLowerCase());
    const matchesSubject = !filters.subject.trim() || subjectHaystack.includes(filters.subject.trim().toLowerCase());
    return thread.mailbox === mailbox && (tab === "all" || thread.status === tab) && matchesRead && matchesDirection && matchesSender && matchesSubject && haystack.includes(search.trim().toLowerCase());
  }).sort((a, b) => filters.sortOrder === "oldest" ? new Date(a.lastMessageAt) - new Date(b.lastMessageAt) : new Date(b.lastMessageAt) - new Date(a.lastMessageAt)), [threads, mailbox, tab, search, filters]);
  const hasMailQuery = Boolean(search.trim() || filters.sender.trim() || filters.subject.trim() || filters.read !== "all" || filters.direction !== "all");
  useEffect(() => {
    if (!inbox.data?.syncPending) return undefined;
    const timer = window.setTimeout(() => inbox.refetch(), 1200);
    return () => window.clearTimeout(timer);
  }, [inbox.data?.syncPending, inbox.refetch]);
  useEffect(() => { if (selected !== "new" && !visible.some(thread => thread.id === selected)) setSelected(visible[0]?.id || ""); }, [visible, selected]);
  const detail = useInboxThread(selected && selected !== "new" && !selected.startsWith("sample-") ? selected : "");
  const sample = [...DEV_THREADS, ...sampleBranches].find(thread => thread.id === selected);
  const conversation = sample ? { ...sample, status:sampleStatuses[sample.id] || sample.status, messages:sampleMessages[sample.id] || sample.messages } : detail.data?.thread ? { ...detail.data.thread, messages:detail.data.messages || [] } : null;
  const messages = conversation?.messages || [];
  const viewModeStorageKey = conversation?.id && selected !== "new" ? `admin-inbox-view-mode:${storageScope}:${conversation.id}` : "";
  const typingPresence = useInboxTyping(conversation?.isSample ? "" : conversation?.id);
  const latestMessage = messages[messages.length - 1];
  const olderMessages = messages.slice(0, -1).reverse();
  const threadHistoryOpen = historyOpen && conversation?.id === selected;
  const selectedSummary = useMemo(() => threads.find(thread => thread.id === selected), [threads, selected]);
  useEffect(() => {
    setHistoryOpen(false); setReplyContext(null); setTypingParticipant(null); setComposeExpanded(true);
    setEmailZoom(1);
    if (typingExpiryTimer.current) window.clearTimeout(typingExpiryTimer.current);
    if (typingStopTimer.current) window.clearTimeout(typingStopTimer.current);
  }, [conversation?.id]);
  useEffect(() => {
    const saved = viewModeStorageKey ? storedValue(viewModeStorageKey, "email") : "email";
    setChatMode(saved === "chat");
  }, [viewModeStorageKey]);
  useEffect(() => {
    const participant = typingPresence.data?.participants?.find(item => String(item.email || "").toLowerCase() !== String(user?.email || "").toLowerCase());
    if (participant) setTypingParticipant({ name: participant.name || participant.email || "Another admin" });
    else if (!typingPresence.isFetching) setTypingParticipant(null);
  }, [typingPresence.data, typingPresence.isFetching, user?.email]);
  useEffect(() => {
    if (typingChannel.current) { typingChannel.current.close(); typingChannel.current = null; }
    if (!conversation?.id) return undefined;
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("manarah-inbox-typing");
    typingChannel.current = channel;
    const receiveTyping = payload => {
      if (!payload || payload.threadId !== conversation.id || payload.clientId === typingClientId.current || String(payload.email || "").toLowerCase() === String(user?.email || "").toLowerCase()) return;
      if (!payload.active) { setTypingParticipant(null); if (typingExpiryTimer.current) window.clearTimeout(typingExpiryTimer.current); return; }
      const name = payload.name || payload.email || "Another admin";
      setTypingParticipant({ name });
      if (typingExpiryTimer.current) window.clearTimeout(typingExpiryTimer.current);
      typingExpiryTimer.current = window.setTimeout(() => setTypingParticipant(null), 2400);
    };
    if (channel) channel.onmessage = event => receiveTyping(event.data || {});
    const onStorage = event => {
      if (event.key !== "manarah-inbox-typing" || !event.newValue) return;
      try { receiveTyping(JSON.parse(event.newValue)); } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => { channel?.close(); window.removeEventListener("storage", onStorage); if (typingChannel.current === channel) typingChannel.current = null; if (typingExpiryTimer.current) window.clearTimeout(typingExpiryTimer.current); };
  }, [conversation?.id, user?.email]);
  useEffect(() => { if (selectedSummary?.lastMessageAt && selected && selected !== "new" && !selected.startsWith("sample-")) detail.refetch(); }, [selected, selectedSummary?.lastMessageAt]);
  useEffect(() => {
    if (chatMode) { setChatViewMounted(true); return undefined; }
    const timer = window.setTimeout(() => setChatViewMounted(false), 320);
    return () => window.clearTimeout(timer);
  }, [chatMode]);
  useEffect(() => {
    if (readerOpen && window.matchMedia("(max-width:767px)").matches) {
      document.querySelector(".inbox-titlebar h2")?.focus({ preventScroll:true });
    }
  }, [readerOpen, selected, conversation?.id]);
  function announceTyping(active) {
    if (!conversation?.id || !user?.email) return;
    if (typingStopTimer.current) window.clearTimeout(typingStopTimer.current);
    const payload = { threadId:conversation.id, email:user.email, name:chatUser?.displayName || user.email, clientId:typingClientId.current, active, sentAt:Date.now() };
    typingChannel.current?.postMessage(payload);
    try { localStorage.setItem("manarah-inbox-typing", JSON.stringify(payload)); } catch {}
    if (!conversation.isSample) publishTyping.mutate({ threadId:conversation.id, active, name:chatUser?.displayName || user.email });
    if (active) typingStopTimer.current = window.setTimeout(() => announceTyping(false), 2200);
  }
  function collapseComposeOnScroll(event) {
    if (event?.isTrusted === false || Date.now() < composeInteractionUntil.current || !window.matchMedia("(max-width:767px)").matches) return;
    setComposeExpanded(false);
  }
  function expandComposeOnInteract() {
    if (window.matchMedia("(max-width:767px)").matches && !composeExpanded && Date.now() >= composeInteractionUntil.current) {
      composeInteractionUntil.current = Date.now() + 560;
      const selector = chatMode ? ".inbox-chat-thread" : ".inbox-thread";
      const node = document.querySelector(selector);
      const bottomGap = node ? Math.max(0, node.scrollHeight - node.scrollTop - node.clientHeight) : 0;
      setComposeExpanded(true);
      const animationEnd = performance.now() + 360;
      const preserveReaderPosition = timestamp => {
        const current = document.querySelector(selector);
        if (current) current.scrollTop = Math.max(0, current.scrollHeight - current.clientHeight - bottomGap);
        if (timestamp < animationEnd) requestAnimationFrame(preserveReaderPosition);
      };
      requestAnimationFrame(preserveReaderPosition);
    }
  }
  function toggleChatMode() {
    setChatMode(current => {
      const next = !current;
      if (viewModeStorageKey) { try { localStorage.setItem(viewModeStorageKey, next ? "chat" : "email"); } catch {} }
      return next;
    });
  }
  async function changeStatus(status) { if (conversation?.isSample) { setSampleStatuses(current => ({ ...current, [conversation.id]:status })); setTab(status); toast(status === "closed" ? "Conversation closed" : "Conversation reopened"); return; } try { await statusMutation.mutateAsync({ threadId:conversation.id, status }); queryClient.setQueryData(["inbox"], current => current ? { ...current, threads:current.threads.map(thread => thread.id === conversation.id ? { ...thread, status } : thread) } : current); queryClient.setQueryData(["inbox", conversation.id], current => current?.thread ? { ...current, thread:{ ...current.thread, status } } : current); setTab(status); toast(status === "closed" ? "Conversation closed" : "Conversation reopened"); } catch (failure) { toast(failure.message, "error"); } }
  async function onSent(threadId, from) { await inbox.refetch(); if (threadId) { setMailbox(from); setTab("all"); setSelected(threadId); queryClient.invalidateQueries({ queryKey:["inbox", threadId] }); } else if (tab === "closed") setTab("all"); await detail.refetch(); }
  function addSampleMessage({ mode, text, attachments, from, branchFromMessage }) { const message={ id:"sample-local-" + Date.now(), direction:"outbound", kind:mode === "note" ? "internal_note" : "email", senderName:chatUser?.displayName || "Admin", senderEmail:from, recipientEmail:mode === "note" ? "" : conversation.participantEmail, createdAt:new Date().toISOString(), textBody:text, attachments:attachments.map(file => ({ ...file })) }; if (mode === "reply" && branchFromMessage) { const branchId = "sample-branch-" + Date.now(); const branch = { ...conversation, id:branchId, messages:[branchFromMessage,message], unreadCount:0, lastMessageAt:message.createdAt, preview:messagePreview(message) }; setSampleBranches(current => [...current, branch]); setSampleMessages(current => ({ ...current, [branchId]:[branchFromMessage,message] })); setSampleStatuses(current => ({ ...current,[branchId]:"open" })); setMailbox(conversation.mailbox); setTab("open"); setSelected(branchId); setReaderOpen(true); toast("Reply added as a new thread"); return; } setSampleMessages(current => ({ ...current, [conversation.id]:[...(current[conversation.id] || conversation.messages),message] })); setSampleStatuses(current => ({ ...current,[conversation.id]:"open" })); setTab("open"); toast(mode === "note" ? "Internal note saved" : "Reply added to preview"); }
  function startReply(message) { setReplyContext(message.id === latestMessage?.id ? null : message); requestAnimationFrame(() => { document.querySelector('.inbox-compose-tabs button')?.click(); document.querySelector(".inbox-editor")?.focus(); }); }
  function startForward(message) { openDraft(forwardDraft(message, conversation)); }
  function openDraft(draft = null) { setComposeExpanded(true); setReplyContext(null); setNewDraft(draft); setSelected("new"); setReaderOpen(true); }
  function backToList() {
    setComposeExpanded(true);
    setReaderOpen(false);
    requestAnimationFrame(() => document.querySelector('.inbox-row[aria-current="true"]')?.focus());
  }
  const backButton = <button type="button" className="inbox-back inbox-editor-icon" aria-label="Back to conversations" onClick={backToList}><ArrowLeft size={18} /></button>;
  return <div className="pp-page inbox-page">
    {canWrite && <PageHeaderActions><button type="button" className="pp-btn pp-btn-primary" onClick={() => openDraft()}><Plus size={16} />New email</button></PageHeaderActions>}
    <div className={"inbox-shell pp-panel" + (readerOpen ? " is-reading" : "") + (sidebarCollapsed ? " is-sidebar-collapsed" : "")}>
      <aside className="inbox-list" aria-label="Conversations">
        <div className="inbox-list-head inbox-mailbox-head">
          <MailboxWorkspace mailboxes={readableMailboxes} personalMailbox={personalMailbox} personalName={chatUser?.displayName || personalMailbox} selected={mailbox} onSelect={nextMailbox => setMailbox(nextMailbox)} isLoading={mailboxLoading} collapseButton={<InboxSidebarToggle collapsed={sidebarCollapsed} onClick={() => setSidebarCollapsed(value => !value)} />} />
        </div>
        <div className="inbox-list-tabs-row"><div className="inbox-list-tabs pp-section-tabs" role="group" aria-label="Mail view">
          {["all", "open", "closed"].map(status => <button type="button" key={status} aria-pressed={tab === status} onClick={() => setTab(status)}>{status === "all" ? "All mail" : status === "open" ? "Open" : "Closed"}<span className="inbox-count">{status === "all" ? threads.filter(thread => thread.mailbox === mailbox).length : threads.filter(thread => thread.mailbox === mailbox && thread.status === status).length}</span></button>)}
        </div></div>
        <div className="inbox-rows">
          {inbox.isLoading ? <p className="inbox-list-empty" role="status">Loading conversations…</p> : inbox.isError ? <div className="inbox-list-empty" role="alert"><p>Couldn’t load conversations.</p><button type="button" className="pp-btn" onClick={() => inbox.refetch()}>Try again</button></div> : visible.length ? visible.map(thread => <button type="button" key={thread.id} aria-current={selected === thread.id ? "true" : undefined} className={"inbox-row" + (selected === thread.id ? " is-selected" : "") + (thread.unreadCount > 0 ? " is-unread" : "")} onClick={() => { setSelected(thread.id); setReaderOpen(true); }}>
            <Avatar name={thread.participantName} email={thread.participantEmail} unread={thread.unreadCount > 0} />
            <span className="inbox-row-copy"><span className="inbox-row-top"><strong>{thread.participantName || thread.participantEmail}</strong><time dateTime={thread.lastMessageAt} title={timeLabel(thread.lastMessageAt)}>{listTimeLabel(thread.lastMessageAt)}</time></span><span className="inbox-row-subject">{thread.subject}</span><span className="inbox-row-preview">{thread.preview || thread.participantEmail}</span>{thread.unreadCount > 0 && <span className="sr-only">Unread</span>}</span>
          </button>) : <p className="inbox-list-empty">{hasMailQuery ? "No matching conversations." : "No " + tab + " conversations in this mailbox."}</p>}
        </div>
      </aside>
      <section className={"inbox-reader" + (selected === "new" ? " is-composing" : "") + (chatMode ? " is-chat-mode" : "")} aria-label="Conversation">
        {selected === "new" ? <>
          <div className="inbox-titlebar">{backButton}<div className="inbox-title-copy"><h2 tabIndex={-1}>New email</h2><p className={`inbox-mailbox-context-line is-${activeMailboxContext.kind}`}><strong>{activeMailboxContext.label}</strong><span>{mailbox}</span></p></div><button type="button" className="inbox-editor-icon" onClick={() => { setSelected(visible[0]?.id || ""); setReaderOpen(false); }} aria-label="Cancel new email"><X size={18} /></button></div>
          <Composer mailbox={(writableMailboxes.includes(mailbox) ? mailbox : writableMailboxes[0]) || mailbox} mailboxes={[(writableMailboxes.includes(mailbox) ? mailbox : writableMailboxes[0]) || mailbox]} personalMailbox={personalMailbox} initialDraft={newDraft} canWrite={canWrite} onSent={onSent} branchFromMessage={newDraft?.branchFromMessage} branchFromThreadId={newDraft?.branchFromThreadId} />
        </> : conversation ? <>
          <div className="inbox-titlebar">{backButton}<div className="inbox-title-copy"><h2 tabIndex={-1}>{conversation.subject}</h2><p className={`inbox-mailbox-context-line is-${mailboxContext(conversation.mailbox, personalMailbox).kind}`}><strong>{mailboxContext(conversation.mailbox, personalMailbox).label}</strong><span>{conversation.mailbox}</span>{conversation.isSample && <em>Preview</em>}</p></div><div className="inbox-title-actions"><label className="inbox-status"><select aria-label="Conversation status" value={conversation.status} onChange={event => changeStatus(event.target.value)} disabled={!writableMailboxes.includes(conversation.mailbox) || statusMutation.isPending}><option value="open">Open</option><option value="closed">Closed</option></select><CaretDown size={13} /></label><button type="button" className={"inbox-mode-toggle" + (chatMode ? " is-active" : "")} aria-label={chatMode ? "Use email view" : "Use chat mode"} aria-pressed={chatMode} title={chatMode ? "Use email view" : "Use chat mode"} onClick={toggleChatMode}><ChatCircleDots size={17} /><span>{chatMode ? "Email" : "Chat"}</span></button></div></div>
          <div className="inbox-view-switcher">
            <div className={"inbox-view-pane inbox-chat-view" + (chatMode ? " is-active" : "")} aria-hidden={!chatMode}>{chatViewMounted && <ChatThread messages={messages} currentUser={chatUser} typingParticipant={typingParticipant} onScroll={collapseComposeOnScroll} />}</div>
            <div className={"inbox-view-pane inbox-email-view" + (!chatMode ? " is-active" : "")} aria-hidden={chatMode}>
              <div className="inbox-thread" onScroll={collapseComposeOnScroll} onWheel={collapseComposeOnScroll}>
                <EmailBodyToolbar zoom={emailZoom} onZoomChange={setEmailZoom} />
                {latestMessage && <MessageCard key={latestMessage.id} message={latestMessage} conversation={conversation} currentUser={chatUser} bodyZoom={emailZoom} onReply={() => startReply(latestMessage)} onForward={() => startForward(latestMessage)} />}
                {!!olderMessages.length && <>
                  <button type="button" className={"inbox-thread-toggle" + (threadHistoryOpen ? " is-open" : "")} aria-label={threadHistoryOpen ? "Hide earlier messages" : "Show earlier messages"} aria-expanded={threadHistoryOpen} aria-controls={`inbox-history-${conversation.id}`} title={threadHistoryOpen ? "Hide earlier messages" : "Show earlier messages"} onClick={() => setHistoryOpen(value => !value)}><DotsThreeOutline size={22} weight="bold" /></button>
                  <div id={`inbox-history-${conversation.id}`} className={"inbox-thread-history" + (threadHistoryOpen ? " is-open" : "")} role="region" aria-label="Earlier messages" aria-hidden={!threadHistoryOpen}><div className="inbox-thread-history-inner"><p className="inbox-thread-history-label"><span>Earlier messages</span><span className="inbox-thread-history-count">{olderMessages.length}</span></p>{olderMessages.map(message => <MessageCard key={message.id} message={message} conversation={conversation} currentUser={chatUser} bodyZoom={emailZoom} isEarlier onReply={() => startReply(message)} onForward={() => startForward(message)} />)}</div></div>
                </>}
              </div>
            </div>
          </div>
          {writableMailboxes.includes(conversation.mailbox) && <Composer key={conversation.id} thread={conversation} mailbox={conversation.mailbox} mailboxes={[conversation.mailbox]} personalMailbox={personalMailbox} canWrite onSent={onSent} onSampleSend={addSampleMessage} onTyping={announceTyping} branchFromMessage={replyContext} isCompact={!composeExpanded} onComposerInteract={expandComposeOnInteract} />}
        </> : <><div className="inbox-mobile-empty-bar">{backButton}</div><div className="inbox-empty">{detail.isError ? <div role="alert"><p>Couldn’t load this conversation.</p><button type="button" className="pp-btn" onClick={() => detail.refetch()}>Try again</button></div> : detail.isLoading ? "Loading conversation…" : "Select a conversation to read it."}</div></>}
      </section>
    </div>
    {filterDialogOpen && <MailFilterDialog value={filters} onChange={setFilters} onClose={() => setFilterDialogOpen(false)} onReset={() => setFilters({ sortOrder:"newest", read:"all", direction:"all", sender:"", subject:"" })} />}
  </div>;
}
