import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowBendUpLeft, ArrowBendUpRight, CaretDown, LinkSimple, ListBullets, ListNumbers, MagnifyingGlass, Paperclip, Plus, TextB, TextItalic, TextUnderline, Trash, X } from "@phosphor-icons/react";
import { useAddInboxNote, useComposeInbox, useInbox, useInboxThread, useSendInboxReply, useSetInboxStatus } from "../api/queries.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { canInbox } from "../auth/permissions.js";
import { useToast } from "../components/Toast.jsx";
import PageHeaderActions from "../components/PageHeaderActions.jsx";

const MAILBOXES = ["contact@karamahcollective.com", "manarah@karamahcollective.com"];
const mailboxKey = email => email.split("@")[0];
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
const listTimeLabel = value => new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
function IconButton({ Icon, label, ...props }) { return <button type="button" className="inbox-editor-icon" aria-label={label} title={label} {...props}><Icon size={18} /></button>; }
function readFiles(files) { return Promise.all([...files].map(file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name:file.name, type:file.type, size:file.size, content:String(reader.result).split(",")[1] }); reader.onerror = reject; reader.readAsDataURL(file); }))); }
const attachmentLabel = size => size < 1024 * 1024 ? Math.ceil(size / 1024) + " KB" : (size / 1024 / 1024).toFixed(1) + " MB";

function Composer({ thread, mailbox, mailboxes, canWrite, onSent, onSampleSend, initialDraft }) {
  const editor = useRef(null), fileInput = useRef(null), toast = useToast();
  const reply = useSendInboxReply(), compose = useComposeInbox(), note = useAddInboxNote();
  const [from, setFrom] = useState(mailbox), [to, setTo] = useState(""), [cc, setCc] = useState(""), [bcc, setBcc] = useState(""), [subject, setSubject] = useState(""), [mode, setMode] = useState("reply"), [attachments, setAttachments] = useState([]), [error, setError] = useState("");
  const [showCopies, setShowCopies] = useState(false);
  useEffect(() => { setFrom(thread?.mailbox || mailbox); setTo(initialDraft?.to || ""); setCc(""); setBcc(""); setSubject(initialDraft?.subject || ""); setMode("reply"); setShowCopies(false); setAttachments([]); setError(""); if (editor.current) editor.current.innerText = initialDraft?.body || ""; }, [thread?.id, thread?.mailbox, mailbox, initialDraft]);
  const mutation = mode === "note" ? note : thread ? reply : compose;
  const run = (command, value) => { editor.current?.focus(); document.execCommand(command, false, value); };
  async function chooseFiles(event) {
    try { const next = [...attachments, ...await readFiles(event.target.files)]; if (next.length > 5 || next.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_BYTES) throw new Error("Add up to five files totalling 5 MB or less."); setAttachments(next); } catch (failure) { setError(failure.message); } event.target.value = "";
  }
  async function send(event) {
    event.preventDefault(); const htmlBody = editor.current?.innerHTML?.trim() || "", text = editor.current?.innerText?.trim() || "";
    if (!text) { setError(mode === "note" ? "Write a note before saving." : "Write a message before sending."); return; }
    const recipients = to.split(",").map(email => email.trim()).filter(Boolean);
    if (!thread && mode === "reply" && (!recipients.length || recipients.some(email => !emailPattern.test(email)))) { setError("Enter one or more valid recipient emails."); return; }
    if (!thread && mode === "reply" && !subject.trim()) { setError("Add a subject."); return; }
    setError("");
    const payload = mode === "note" ? { threadId:thread.id, htmlBody } : thread ? { threadId:thread.id, mailbox:from, subject:thread.subject, htmlBody, attachments } : { recipientEmails:recipients, subject:subject.trim(), mailbox:from, htmlBody, attachments, cc, bcc };
    if (thread?.isSample) { onSampleSend?.({ mode, htmlBody, text, attachments, from }); editor.current.innerHTML = ""; setAttachments([]); return; }
    try { const result = await mutation.mutateAsync(payload); editor.current.innerHTML = ""; setAttachments([]); toast(mode === "note" ? "Internal note saved" : thread ? "Reply sent" : "Email sent"); await onSent?.(result?.threadId, from); } catch (failure) { setError(failure.message); }
  }
  return <form className="inbox-compose" onSubmit={send} aria-label={thread ? "Conversation composer" : "Compose email"}>
    {thread && <div className="inbox-compose-tabs" role="group" aria-label="Reply type"><button type="button" aria-pressed={mode === "reply"} className={mode === "reply" ? "is-active" : ""} onClick={() => setMode("reply")}>Reply</button><button type="button" aria-pressed={mode === "note"} className={mode === "note" ? "is-active" : ""} onClick={() => setMode("note")}>Internal note</button></div>}
    {!thread && <div className="inbox-fields inbox-new-fields"><div className="inbox-recipient-row"><label>To<input value={to} onChange={event => setTo(event.target.value)} placeholder="name@example.com" required /></label><button type="button" className="inbox-copy-toggle" aria-expanded={showCopies} aria-controls="inbox-copy-fields" onClick={() => setShowCopies(value => !value)}>Cc / Bcc</button></div><div id="inbox-copy-fields" className="inbox-cc-bcc" hidden={!showCopies}><label>CC<input value={cc} onChange={event => setCc(event.target.value)} placeholder="Optional recipients" /></label><label>BCC<input value={bcc} onChange={event => setBcc(event.target.value)} placeholder="Private recipients" /></label></div><label>Subject<input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Subject" required maxLength={180} /></label></div>}
    {thread && <p className="inbox-reply-to">{mode === "note" ? "Visible to admins only" : "To " + (thread.participantName || thread.participantEmail) + " <" + thread.participantEmail + ">"}</p>}
    <div className="inbox-editor-box"><div className="inbox-rich-toolbar" role="group" aria-label="Message formatting"><IconButton Icon={TextB} label="Bold" onClick={() => run("bold")} /><IconButton Icon={TextItalic} label="Italic" onClick={() => run("italic")} /><IconButton Icon={TextUnderline} label="Underline" onClick={() => run("underline")} /><i /><IconButton Icon={ListBullets} label="Bulleted list" onClick={() => run("insertUnorderedList")} /><IconButton Icon={ListNumbers} label="Numbered list" onClick={() => run("insertOrderedList")} /><IconButton Icon={LinkSimple} label="Insert link" onClick={() => { const url = prompt("Link URL"); if (url) run("createLink", url); }} /></div>
      <div ref={editor} className="inbox-editor" contentEditable role="textbox" aria-multiline="true" aria-label="Email message" data-placeholder={mode === "note" ? "Write an internal note…" : "Write your message…"} />
      {!!attachments.length && <div className="inbox-draft-attachments">{attachments.map((file, index) => <span key={file.name + index}>{file.name} <small>{attachmentLabel(file.size)}</small><button type="button" onClick={() => setAttachments(current => current.filter((_, item) => item !== index))} aria-label={"Remove " + file.name}>×</button></span>)}</div>}
      <div className="inbox-editor-footer">{mode === "reply" && <label className="inbox-from">From<select value={from} onChange={event => setFrom(event.target.value)} aria-label="Send from email" disabled={!canWrite || mutation.isPending}>{mailboxes.map(email => <option key={email}>{email}</option>)}</select></label>}<div className="inbox-send-actions">{mode === "reply" && <IconButton Icon={Paperclip} label="Attach files" onClick={() => fileInput.current?.click()} disabled={!canWrite} />}<IconButton Icon={Trash} label="Clear draft" onClick={() => { if (editor.current) editor.current.innerHTML = ""; setAttachments([]); }} /><button type="submit" className="pp-btn pp-btn-primary" disabled={!canWrite || mutation.isPending}>{mutation.isPending ? mode === "note" ? "Saving…" : "Sending…" : mode === "note" ? "Save note" : "Send"}</button></div><input ref={fileInput} type="file" multiple hidden onChange={chooseFiles} /></div></div>
    {error && <p className="pp-error-text" role="alert">{error}</p>}
  </form>;
}
function AttachmentSection({ messages }) {
  const files = messages.flatMap(message => (message.attachments || []).map(file => ({ ...file, messageId:message.id })));
  return files.length ? <section className="inbox-attachments"><h3>{files.length} attachment{files.length === 1 ? "" : "s"}</h3><div>{files.map((file, index) => <article key={file.messageId + index}><span className={"inbox-file-thumb " + (file.type?.startsWith("image/") ? "is-image" : "")}><Paperclip size={20} /></span><strong>{file.name}</strong><small>{attachmentLabel(file.size)}</small></article>)}</div></section> : null;
}
export default function ContactsPage() {
  const toast = useToast(), queryClient = useQueryClient(), { access } = useAuth();
  const readableMailboxes = useMemo(() => MAILBOXES.filter(email => canInbox(access, "read", mailboxKey(email))), [access]);
  const writableMailboxes = useMemo(() => MAILBOXES.filter(email => canInbox(access, "write", mailboxKey(email))), [access]);
  const canWrite = writableMailboxes.length > 0, inbox = useInbox(), statusMutation = useSetInboxStatus();
  const [selected, setSelected] = useState(""), [mailbox, setMailbox] = useState(MAILBOXES[0]), [tab, setTab] = useState("open"), [search, setSearch] = useState(""), [sampleMessages, setSampleMessages] = useState({}), [sampleStatuses, setSampleStatuses] = useState({}), [newDraft, setNewDraft] = useState(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const threads = useMemo(() => {
    const samples = DEV_THREADS.map(thread => ({ ...thread, status:sampleStatuses[thread.id] || thread.status }));
    const liveThreads = inbox.data?.threads || [];
    return import.meta.env.DEV && !inbox.isLoading && !inbox.isError && !liveThreads.length ? samples : liveThreads;
  }, [inbox.data, inbox.isLoading, inbox.isError, sampleStatuses]);
  useEffect(() => { if (!readableMailboxes.includes(mailbox)) setMailbox(readableMailboxes[0] || ""); }, [readableMailboxes, mailbox]);
  const visible = useMemo(() => threads.filter(thread => thread.mailbox === mailbox && thread.status === tab && (thread.participantName + " " + thread.participantEmail + " " + thread.subject + " " + thread.preview).toLowerCase().includes(search.trim().toLowerCase())), [threads, mailbox, tab, search]);
  useEffect(() => { if (selected !== "new" && !visible.some(thread => thread.id === selected)) setSelected(visible[0]?.id || ""); }, [visible, selected]);
  const detail = useInboxThread(selected && selected !== "new" && !selected.startsWith("sample-") ? selected : "");
  const sample = DEV_THREADS.find(thread => thread.id === selected);
  const conversation = sample ? { ...sample, status:sampleStatuses[sample.id] || sample.status, messages:sampleMessages[sample.id] || sample.messages } : detail.data?.thread?.id === selected ? { ...detail.data.thread, messages:detail.data.messages || [] } : null;
  useEffect(() => {
    if (readerOpen && window.matchMedia("(max-width:767px)").matches) {
      document.querySelector(".inbox-titlebar h2")?.focus({ preventScroll:true });
    }
  }, [readerOpen, selected, conversation?.id]);
  async function changeStatus(status) { if (conversation?.isSample) { setSampleStatuses(current => ({ ...current, [conversation.id]:status })); setTab(status); toast(status === "closed" ? "Conversation closed" : "Conversation reopened"); return; } try { await statusMutation.mutateAsync({ threadId:conversation.id, status }); queryClient.setQueryData(["inbox"], current => current ? { ...current, threads:current.threads.map(thread => thread.id === conversation.id ? { ...thread, status } : thread) } : current); queryClient.setQueryData(["inbox", conversation.id], current => current?.thread ? { ...current, thread:{ ...current.thread, status } } : current); setTab(status); toast(status === "closed" ? "Conversation closed" : "Conversation reopened"); } catch (failure) { toast(failure.message, "error"); } }
  async function onSent(threadId, from) { await inbox.refetch(); if (threadId) { setMailbox(from); setTab("open"); setSelected(threadId); } else if (tab === "closed") setTab("open"); await detail.refetch(); }
  function addSampleMessage({ mode, text, attachments, from }) { const message={ id:"sample-local-" + Date.now(), direction:"outbound", kind:mode === "note" ? "internal_note" : "email", senderName:"Amina Hassan", senderEmail:from, recipientEmail:mode === "note" ? "" : conversation.participantEmail, createdAt:new Date().toISOString(), textBody:text, attachments:attachments.map(({content,...file})=>file) }; setSampleMessages(current => ({ ...current, [conversation.id]:[...(current[conversation.id] || conversation.messages),message] })); setSampleStatuses(current => ({ ...current,[conversation.id]:"open" })); setTab("open"); toast(mode === "note" ? "Internal note saved" : "Reply added to preview"); }
  function openDraft(draft = null) { setNewDraft(draft); setSelected("new"); setReaderOpen(true); }
  function backToList() {
    setReaderOpen(false);
    requestAnimationFrame(() => document.querySelector('.inbox-row[aria-current="true"]')?.focus());
  }
  const backButton = <button type="button" className="inbox-back inbox-editor-icon" aria-label="Back to conversations" onClick={backToList}><ArrowLeft size={18} /></button>;
  return <div className="pp-page inbox-page">
    {canWrite && <PageHeaderActions><button type="button" className="pp-btn pp-btn-primary" onClick={() => openDraft()}><Plus size={16} />New email</button></PageHeaderActions>}
    <div className={"inbox-shell pp-panel" + (readerOpen ? " is-reading" : "")}>
      <aside className="inbox-list" aria-label="Conversations">
        <div className="inbox-list-head"><label className="inbox-mailbox-label">Mailbox<select value={mailbox} onChange={event => setMailbox(event.target.value)}>{readableMailboxes.map(email => <option key={email}>{email}</option>)}</select></label></div>
        <div className="inbox-list-tabs pp-section-tabs" role="group" aria-label="Conversation status">
          {["open", "closed"].map(status => <button type="button" key={status} aria-pressed={tab === status} onClick={() => setTab(status)}>{status === "open" ? "Open" : "Closed"}<span className="inbox-count">{threads.filter(thread => thread.mailbox === mailbox && thread.status === status).length}</span></button>)}
        </div>
        <label className="inbox-search"><MagnifyingGlass size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label>
        <div className="inbox-rows">
          {inbox.isLoading ? <p className="inbox-list-empty" role="status">Loading conversations…</p> : inbox.isError ? <div className="inbox-list-empty" role="alert"><p>Couldn’t load conversations.</p><button type="button" className="pp-btn" onClick={() => inbox.refetch()}>Try again</button></div> : visible.length ? visible.map(thread => <button type="button" key={thread.id} aria-current={selected === thread.id ? "true" : undefined} className={"inbox-row" + (selected === thread.id ? " is-selected" : "") + (thread.unreadCount > 0 ? " is-unread" : "")} onClick={() => { setSelected(thread.id); setReaderOpen(true); }}>
            <span className="inbox-avatar" aria-hidden="true">{initials(thread.participantName || thread.participantEmail)}{thread.unreadCount > 0 && <i />}</span>
            <span className="inbox-row-copy"><span className="inbox-row-top"><strong>{thread.participantName || thread.participantEmail}</strong><time dateTime={thread.lastMessageAt} title={timeLabel(thread.lastMessageAt)}>{listTimeLabel(thread.lastMessageAt)}</time></span><span className="inbox-row-subject">{thread.subject}</span><span className="inbox-row-preview">{thread.preview || thread.participantEmail}</span>{thread.unreadCount > 0 && <span className="sr-only">Unread</span>}</span>
          </button>) : <p className="inbox-list-empty">{search ? "No matching conversations." : "No " + tab + " conversations in this mailbox."}</p>}
        </div>
      </aside>
      <section className={"inbox-reader" + (selected === "new" ? " is-composing" : "")} aria-label="Conversation">
        {selected === "new" ? <>
          <div className="inbox-titlebar">{backButton}<h2 tabIndex={-1}>New email</h2><button type="button" className="inbox-editor-icon" onClick={() => { setSelected(visible[0]?.id || ""); setReaderOpen(false); }} aria-label="Cancel new email"><X size={18} /></button></div>
          <Composer mailbox={writableMailboxes[0] || mailbox} mailboxes={writableMailboxes} initialDraft={newDraft} canWrite={canWrite} onSent={onSent} />
        </> : conversation ? <>
          <div className="inbox-titlebar">{backButton}<div className="inbox-title-copy"><h2 tabIndex={-1}>{conversation.subject}</h2>{conversation.isSample && <p>Preview conversation</p>}</div><label className="inbox-status"><select aria-label="Conversation status" value={conversation.status} onChange={event => changeStatus(event.target.value)} disabled={!writableMailboxes.includes(conversation.mailbox) || statusMutation.isPending}><option value="open">Open</option><option value="closed">Closed</option></select><CaretDown size={13} /></label></div>
          <div className="inbox-thread">
            {conversation.messages.map(message => <article className={"inbox-message" + (message.kind === "internal_note" ? " is-note" : "")} key={message.id}>
              <div className="inbox-message-head">
                <span className="inbox-avatar" aria-hidden="true">{initials(message.senderName || message.senderEmail)}</span>
                <div className="inbox-message-sender"><strong>{message.kind === "internal_note" ? (message.senderName || "Admin") + " · Internal note" : message.senderName || message.senderEmail}</strong><small title={message.senderEmail}>{message.kind === "internal_note" ? "Visible to admins only" : message.senderEmail}</small></div>
                <time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time>
                {message.kind !== "internal_note" && writableMailboxes.includes(conversation.mailbox) && <div className="inbox-message-actions"><IconButton Icon={ArrowBendUpLeft} label="Reply to message" onClick={() => { document.querySelector('.inbox-compose-tabs button')?.click(); document.querySelector(".inbox-editor")?.focus(); }} /><IconButton Icon={ArrowBendUpRight} label="Forward" onClick={() => openDraft({subject:"Fwd: " + conversation.subject,body:"\n\n---------- Forwarded message ----------\nFrom: " + message.senderEmail + "\n\n" + message.textBody})} /></div>}
              </div>
              <div className="inbox-message-body">{message.textBody || "No message text available."}</div>
            </article>)}
            <AttachmentSection messages={conversation.messages} />
          </div>
          {writableMailboxes.includes(conversation.mailbox) && <Composer key={conversation.id} thread={conversation} mailbox={conversation.mailbox} mailboxes={writableMailboxes} canWrite onSent={onSent} onSampleSend={addSampleMessage} />}
        </> : <><div className="inbox-mobile-empty-bar">{backButton}</div><div className="inbox-empty">{detail.isError ? <div role="alert"><p>Couldn’t load this conversation.</p><button type="button" className="pp-btn" onClick={() => detail.refetch()}>Try again</button></div> : detail.isLoading ? "Loading conversation…" : "Select a conversation to read it."}</div></>}
      </section>
    </div>
  </div>;
}
