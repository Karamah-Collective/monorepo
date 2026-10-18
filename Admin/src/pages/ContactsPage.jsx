import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowBendUpLeft, ArrowBendUpRight, ArrowsOut, CaretDown, ChatCircleDots, DotsThreeOutline, EnvelopeSimple, LinkSimple, ListBullets, ListNumbers, Paperclip, Plus, SlidersHorizontal, Star, TextB, TextItalic, TextUnderline, Trash, X } from "@phosphor-icons/react";
import { useAddInboxNote, useBulkInbox, useComposeInbox, useInbox, useInboxThread, useInboxTyping, useSendInboxReply, useSetInboxStar, useSetInboxStatus, useSetInboxTyping } from "../api/queries.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { canInbox } from "../auth/permissions.js";
import { auth } from "../firebase.js";
import { useToast } from "../components/Toast.jsx";
import PageHeaderActions from "../components/PageHeaderActions.jsx";
import { useMyProfile } from "../api/website.js";
import karamahIconUrl from "../../../Website/assets/images/kc_logo_small_icon.ico";
import manarahIconUrl from "../../../Maps/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png";

const MAILBOXES = ["contact@karamahcollective.com", "manarah@karamahcollective.com"];
const MANARAH_MAILBOX = "manarah@karamahcollective.com";
const SMART_VIEWS = [
  { id:"all", label:"All" },
  { id:"needs-reply", label:"Needs reply" },
  { id:"unread", label:"Unread" },
  { id:"attachments", label:"Has files" },
  { id:"starred", label:"Starred" },
];
const smartViewMatches = (thread, view, currentEmail = "") => {
  if (view === "needs-reply") return (thread.lastMessageDirection || (thread.hasOutbound ? "outbound" : "inbound")) === "inbound" && thread.status !== "closed";
  if (view === "unread") return thread.unreadCount > 0;
  if (view === "attachments") return Boolean(thread.hasAttachments);
  if (view === "starred") return Boolean(thread.starred);
  return true;
};
const mailboxKey = email => email.split("@")[0];
const mailboxLogoUrl = email => String(email || "").toLowerCase().startsWith("manarah@") ? manarahIconUrl : karamahIconUrl;
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
function useDismissibleMenu(open, setOpen, containerRef) {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = event => { if (!containerRef.current?.contains(event.target)) setOpen(false); };
    const closeOnEscape = event => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutsideClick); document.removeEventListener("keydown", closeOnEscape); };
  }, [containerRef, open, setOpen]);
}
function useOverlayMenuPosition(open, anchorRef, menuRef, width) {
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return undefined; }
    const anchor = anchorRef.current;
    if (!anchor) return undefined;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const targetWidth = Math.min(width || rect.width, Math.max(0, viewportWidth - 16));
      const menuHeight = menuRef.current?.offsetHeight || 0;
      const left = Math.max(8, Math.min(rect.left, viewportWidth - targetWidth - 8));
      const below = rect.bottom + 7;
      const top = below + menuHeight > window.innerHeight - 8 && rect.top - menuHeight - 7 >= 8 ? rect.top - menuHeight - 7 : below;
      setPosition({ position:"fixed", zIndex:1000, top, left, width:targetWidth, right:"auto", bottom:"auto", insetInlineEnd:"auto", visibility:"visible" });
    };
    update();
    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", update); document.removeEventListener("scroll", update, true); };
  }, [anchorRef, menuRef, open, width]);
  return position || { position:"fixed", zIndex:1000, visibility:"hidden", pointerEvents:"none" };
}
function OverlayMenu({ open, anchorRef, width, className, children, ...props }) {
  const menuRef = useRef(null);
  const style = useOverlayMenuPosition(open, anchorRef, menuRef, width);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<div ref={menuRef} className={className} style={style} onPointerDown={event => event.stopPropagation()} {...props}>{children}</div>, document.body);
}
function MailboxMark({ mailbox, personalMailbox, personalImageUrl = "", className = "" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const context = mailboxContext(mailbox, personalMailbox);
  const showPersonalImage = context.kind === "personal" && personalImageUrl && !imageFailed;
  return showPersonalImage
    ? <span className={`inbox-workspace-mark inbox-workspace-mark-photo ${className}`.trim()} aria-hidden="true"><img src={personalImageUrl} alt="" onError={() => setImageFailed(true)} /></span>
    : context.kind === "personal" ? <span className={`inbox-workspace-mark ${className}`.trim()} aria-hidden="true">P</span> : <span className={`inbox-workspace-mark inbox-workspace-mark-logo ${className}`.trim()} aria-hidden="true"><img src={mailboxLogoUrl(mailbox)} alt="" /></span>;
}
function MailboxContextBar({ mailbox, personalMailbox, personalName, personalImageUrl = "", mailboxes = [], onSelect, isLoading = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  useDismissibleMenu(open, setOpen, containerRef);
  if (isLoading) return <div className="inbox-mailbox-workspace is-loading" aria-label="Loading mailboxes" aria-busy="true">
    <div className="inbox-account-context-row" aria-hidden="true"><span className="inbox-workspace-mark inbox-skeleton" /><span className="inbox-workspace-copy"><i className="inbox-skeleton inbox-skeleton-line inbox-skeleton-line-name" /><i className="inbox-skeleton inbox-skeleton-line inbox-skeleton-line-address" /></span></div>
  </div>;
  const context = mailboxContext(mailbox, personalMailbox);
  const label = context.kind === "personal" ? personalName || "Personal" : context.label;
  const selectMailbox = nextMailbox => { setOpen(false); if (nextMailbox !== mailbox) onSelect?.(nextMailbox); };
  return <div className="inbox-mailbox-workspace inbox-account-context" aria-label="Selected mail account">
    <div className="inbox-account-context-row" ref={containerRef}>
      <button type="button" className={`inbox-account-trigger${open ? " is-open" : ""}`} aria-label="Change mail account" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} title="Change mail account">
        <MailboxMark mailbox={mailbox} personalMailbox={personalMailbox} personalImageUrl={personalImageUrl} />
        <span className="inbox-workspace-copy"><strong>{label}</strong><small>{mailbox}</small></span>
        <CaretDown size={15} className="inbox-account-trigger-caret" aria-hidden="true" />
      </button>
      <OverlayMenu open={open} anchorRef={containerRef} width={310} className="inbox-account-menu" role="menu" aria-label="Choose mail account">
        <span className="inbox-account-menu-heading">Switch account</span>
        {mailboxes.map(option => {
          const optionContext = mailboxContext(option, personalMailbox);
          const optionLabel = optionContext.kind === "personal" ? personalName || "Personal" : optionContext.label;
          const selected = option === mailbox;
          return <button type="button" role="menuitemradio" aria-checked={selected} className={`inbox-account-option${selected ? " is-selected" : ""}`} key={option} onClick={() => selectMailbox(option)}>
            <MailboxMark mailbox={option} personalMailbox={personalMailbox} personalImageUrl={personalImageUrl} className="inbox-account-option-mark" />
            <span className="inbox-account-option-copy"><strong>{optionLabel}</strong><small>{option}</small></span>
          </button>;
        })}
      </OverlayMenu>
    </div>
  </div>;
}

function MailFolderSelect({ folders, selected, onSelect, unreadOnly = false, onToggleUnread, selectMode = false, onToggleSelect, canWrite = false, onOpenFilter, hasMailQuery = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  useDismissibleMenu(open, setOpen, containerRef);
  const activeFolder = folders.find(folder => folder.id === selected) || folders[0] || { id:"", label:"No folders" };
  const chooseFolder = nextFolder => { setOpen(false); if (nextFolder !== selected) onSelect(nextFolder); };
  return <nav className="inbox-folder-select" aria-label="Mail folders">
    <span className="sr-only">Folder</span>
    <div className="inbox-folder-select-control" ref={containerRef}>
      <button type="button" className={`inbox-folder-trigger${open ? " is-open" : ""}`} aria-label="Choose a mail folder" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span>{activeFolder.label}</span><CaretDown size={14} aria-hidden="true" />
      </button>
      <OverlayMenu open={open} anchorRef={containerRef} width={190} className="inbox-folder-menu" role="listbox" aria-label="Choose a mail folder">
        {folders.map(folder => <button type="button" role="option" aria-selected={selected === folder.id} key={folder.id} className={`inbox-folder-option${selected === folder.id ? " is-selected" : ""}`} onClick={() => chooseFolder(folder.id)}>
          <span>{folder.label}</span>
        </button>)}
      </OverlayMenu>
    </div>
    <button type="button" className={`inbox-folder-unread-toggle${unreadOnly ? " is-active" : ""}`} aria-label="Show unread only" aria-pressed={unreadOnly} title={unreadOnly ? "Show all messages" : "Show unread only"} onClick={onToggleUnread}><EnvelopeSimple size={15} /><span>Unread</span></button>
    <button type="button" className={`inbox-filter-button${hasMailQuery ? " is-active" : ""}`} aria-label="Open conversation filters" title="Sort and filter" onClick={onOpenFilter}><SlidersHorizontal size={16} /></button>
    <button type="button" className={`inbox-select-button inbox-folder-select-action${selectMode ? " is-active" : ""}`} aria-pressed={selectMode} onClick={onToggleSelect} disabled={!canWrite}>{selectMode ? "Done" : "Select"}</button>
  </nav>;
}

function InboxMenuSelect({ value, options, onChange, ariaLabel, className = "", compat = false, portal = true }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  useDismissibleMenu(open, setOpen, containerRef);
  const selected = options.find(option => option.value === value) || options[0];
  return <div className={`inbox-select-menu${className ? ` ${className}` : ""}`} ref={containerRef}>
    {compat && <select className="inbox-select-compat" aria-label={ariaLabel} value={value} onChange={event => onChange(event.target.value)} tabIndex={-1}>{options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>}
    <button type="button" className={`inbox-folder-trigger${open ? " is-open" : ""}`} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <span>{selected?.label}</span><CaretDown size={14} aria-hidden="true" />
    </button>
    {portal ? <OverlayMenu open={open} anchorRef={containerRef} width={null} className="inbox-folder-menu" role="listbox" aria-label={ariaLabel}>
      {options.map(option => <button type="button" role="option" aria-selected={value === option.value} key={option.value} className={`inbox-folder-option${value === option.value ? " is-selected" : ""}`} onClick={() => { setOpen(false); onChange(option.value); }}>
        <span>{option.label}</span>
      </button>)}
    </OverlayMenu> : open && <div className="inbox-folder-menu" role="listbox" aria-label={ariaLabel} onPointerDown={event => event.stopPropagation()}>
      {options.map(option => <button type="button" role="option" aria-selected={value === option.value} key={option.value} className={`inbox-folder-option${value === option.value ? " is-selected" : ""}`} onClick={() => { setOpen(false); onChange(option.value); }}>
        <span>{option.label}</span>
      </button>)}
    </div>}
  </div>;
}

function ThreadActionsMenu({ status, onStatusChange, canWrite }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  useDismissibleMenu(open, setOpen, containerRef);
  return <div className="inbox-thread-options" ref={containerRef}>
    <div className="inbox-status inbox-status-compat" aria-hidden="true"><select value={status} onChange={event => onStatusChange(event.target.value)} disabled={!canWrite} tabIndex={-1}><option value="open">Open</option><option value="closed">Closed</option></select></div>
    <button type="button" className={`inbox-thread-options-trigger${open ? " is-open" : ""}`} aria-label="Conversation options" aria-haspopup="menu" aria-expanded={open} title="Conversation options" onClick={() => setOpen(current => !current)}><DotsThreeOutline size={18} weight="bold" /></button>
    <OverlayMenu open={open} anchorRef={containerRef} width={190} className="inbox-thread-options-menu" role="menu" aria-label="Conversation options">
      <span className="inbox-menu-heading">Status</span>
      <div className="inbox-menu-options" role="group" aria-label="Conversation status">
        {[{ value:"open", label:"Open" }, { value:"closed", label:"Closed" }].map(option => <button type="button" role="menuitemradio" aria-checked={status === option.value} className={`inbox-folder-option${status === option.value ? " is-selected" : ""}`} key={option.value} onClick={() => { if (canWrite) onStatusChange(option.value); setOpen(false); }} disabled={!canWrite}>{option.label}</button>)}
      </div>
    </OverlayMenu>
  </div>;
}

function InboxRowsSkeleton() {
  return <div className="inbox-rows-skeleton" role="status" aria-live="polite">
    <span className="sr-only">Loading conversations</span>
    {["one", "two", "three", "four", "five", "six"].map((row, index) => <div className="inbox-skeleton-row" aria-hidden="true" key={row}>
      <span className="inbox-skeleton inbox-skeleton-avatar" />
      <span className="inbox-skeleton-row-copy">
        <span className="inbox-skeleton-row-top"><span className={`inbox-skeleton inbox-skeleton-line inbox-skeleton-sender is-${index % 3}`} /><span className="inbox-skeleton inbox-skeleton-line inbox-skeleton-date" /></span>
        <span className="inbox-skeleton inbox-skeleton-line inbox-skeleton-subject" />
        <span className="inbox-skeleton inbox-skeleton-line inbox-skeleton-preview" />
      </span>
    </div>)}
  </div>;
}

function MailFilterDialog({ value, onChange, onClose, onReset, smartView, onSmartViewChange, smartViewCounts }) {
  const update = (key, next) => onChange({ ...value, [key]:next });
  const active = smartView !== "all" || value.sortOrder !== "newest" || value.read !== "all" || value.direction !== "all" || value.sender || value.subject;
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
      <div className="inbox-filter-smart-view-block"><span>Quick views</span><div className="inbox-smart-views" role="group" aria-label="Quick views">{SMART_VIEWS.map(view => <button type="button" key={view.id} className={smartView === view.id ? "is-active" : ""} aria-pressed={smartView === view.id} onClick={() => onSmartViewChange(view.id)}>{view.label}<span>{smartViewCounts[view.id] || 0}</span></button>)}</div></div>
      <label><span>Sort</span><InboxMenuSelect portal={false} ariaLabel="Sort mail" value={value.sortOrder} onChange={next => update("sortOrder", next)} options={[{ value:"newest", label:"Newest first" }, { value:"oldest", label:"Oldest first" }]} /></label>
      <label><span>From or email</span><input aria-label="Filter by sender or email" value={value.sender} onChange={event => update("sender", event.target.value)} placeholder="Name or address" /></label>
      <label><span>Subject</span><input aria-label="Filter by subject" value={value.subject} onChange={event => update("subject", event.target.value)} placeholder="Subject contains" /></label>
      <label><span>Read state</span><InboxMenuSelect portal={false} ariaLabel="Read state" value={value.read} onChange={next => update("read", next)} options={[{ value:"all", label:"All messages" }, { value:"unread", label:"Unread only" }, { value:"read", label:"Read only" }]} /></label>
      <label><span>Direction</span><InboxMenuSelect portal={false} ariaLabel="Message direction" value={value.direction} onChange={next => update("direction", next)} options={[{ value:"all", label:"Received and sent" }, { value:"received", label:"Received" }, { value:"sent", label:"Sent" }]} /></label>
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
  async function addFiles(files) {
    if (mode !== "reply" || !canWrite) return;
    try { const next = [...attachments, ...await readFiles(files)]; if (next.length > 5 || next.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_BYTES) throw new Error("Add up to five files totalling 5 MB or less."); setAttachments(next); } catch (failure) { setError(failure.message); }
  }
  async function chooseFiles(event) { await addFiles(event.target.files); event.target.value = ""; }
  function handleFileDrop(event) { event.preventDefault(); if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files); }
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
    <div className="inbox-editor-box" onDragOver={event => event.preventDefault()} onDrop={handleFileDrop}><div className="inbox-rich-toolbar" role="group" aria-label="Message formatting"><div className="inbox-toolbar-basic"><IconButton Icon={TextB} label="Bold" onClick={() => run("bold")} /><IconButton Icon={TextItalic} label="Italic" onClick={() => run("italic")} /><IconButton Icon={TextUnderline} label="Underline" onClick={() => run("underline")} /></div><div className="inbox-mobile-compose-actions">{mode === "reply" && <IconButton Icon={Paperclip} label="Attach files" onClick={() => fileInput.current?.click()} disabled={!canWrite} />}<IconButton Icon={Trash} label="Clear draft" onClick={() => { if (editor.current) editor.current.innerHTML = ""; setAttachments([]); }} /></div><button type="button" className="inbox-mobile-format-toggle" aria-label="More formatting" aria-controls="inbox-mobile-format-tools" aria-expanded={showMobileTools} title="More formatting" onClick={() => setShowMobileTools(value => !value)}><DotsThreeOutline size={18} weight="bold" /></button><div id="inbox-mobile-format-tools" className={"inbox-toolbar-advanced" + (showMobileTools ? " is-mobile-open" : "")}><i /><InboxMenuSelect className="inbox-composer-font-menu" compat ariaLabel="Message typeface" value={fontFamily} onChange={changeFont} options={[{ value:"Plus Jakarta Sans", label:"Default" }, { value:"Geist", label:"Geist" }, { value:"Arial", label:"Arial" }, { value:"Times New Roman", label:"Times New Roman" }, { value:"Georgia", label:"Georgia" }, { value:"Garamond", label:"Garamond" }, { value:"Palatino", label:"Palatino" }, { value:"Verdana", label:"Verdana" }, { value:"Courier New", label:"Courier New" }]} /><InboxMenuSelect className="inbox-composer-size-menu" compat ariaLabel="Message font size" value={fontSize} onChange={changeFontSize} options={["12", "13", "14", "16", "18", "20", "24"].map(value => ({ value, label:value }))} /><i /><IconButton Icon={ListBullets} label="Bulleted list" onClick={() => run("insertUnorderedList")} /><IconButton Icon={ListNumbers} label="Numbered list" onClick={() => run("insertOrderedList")} /><IconButton Icon={LinkSimple} label="Insert link" onClick={() => { const url = prompt("Link URL"); if (url) run("createLink", url); }} /></div></div>
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
  const hasVisibleBackground = node => {
    const legacyBackground = String(node.getAttribute("bgcolor") || "").trim();
    const style = String(node.getAttribute("style") || "");
    const styledBackground = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    const background = legacyBackground || styledBackground;
    if (!background) return Boolean(/(?:^|;)\s*background(?:-image)?\s*:/i.test(style));
    return !/^(?:transparent|none|inherit|initial|unset)$/i.test(background) && !/^rgba?\([^)]*,\s*0(?:\s*%?)?\s*\)$/i.test(background);
  };
  const colorLuminance = value => {
    const source = String(value || "").trim().toLowerCase();
    const hex = source.match(/#([\da-f]{3,8})\b/i);
    const rgb = source.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+)%?)?\s*\)/i);
    const named = { white:[255,255,255], snow:[255,250,250], ivory:[255,255,240], whitesmoke:[245,245,245], beige:[245,245,220], linen:[250,240,230], black:[0,0,0], navy:[0,0,128], maroon:[128,0,0] };
    let channels;
    let alpha = 1;
    if (hex) {
      const digits = hex[1];
      if (digits.length === 3 || digits.length === 4) channels = [digits[0] + digits[0], digits[1] + digits[1], digits[2] + digits[2]].map(value => parseInt(value, 16));
      else channels = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)].map(value => parseInt(value, 16));
      if (digits.length === 4 || digits.length === 8) alpha = parseInt(digits.slice(-2), 16) / 255;
    } else if (rgb) {
      channels = rgb.slice(1, 4).map(Number);
      if (rgb[4] !== undefined) alpha = Number(rgb[4]) / (source.includes("%") ? 100 : 1);
    } else if (named[source]) channels = named[source];
    if (!channels || alpha === 0) return null;
    const normalized = channels.map(channel => channel / 255).map(channel => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return (normalized[0] * .2126) + (normalized[1] * .7152) + (normalized[2] * .0722);
  };
  const surfaceTone = node => {
    const legacyBackground = String(node.getAttribute("bgcolor") || "").trim();
    const style = String(node.getAttribute("style") || "");
    const background = legacyBackground || style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    if (!background) return "light";
    const luminance = colorLuminance(background);
    return luminance === null || luminance > .55 ? "light" : "dark";
  };
  const preserveSurfaceColors = node => {
    const tone = surfaceTone(node);
    [node, ...node.querySelectorAll("*")].forEach(child => {
      child.setAttribute("data-email-preserve-colors", "true");
      child.setAttribute("data-email-surface-tone", tone);
    });
  };
  root.querySelectorAll("[style], [bgcolor]").forEach(node => {
    if (hasVisibleBackground(node)) preserveSurfaceColors(node);
  });
  const updateBanner = [...root.querySelectorAll("*")]
    .filter(node => /this event has been updated/i.test(String(node.textContent || "")) && hasVisibleBackground(node))
    .sort((a, b) => String(a.textContent || "").length - String(b.textContent || "").length)[0];
  if (updateBanner) updateBanner.setAttribute("data-email-update-banner", "true");
  const updateTable = updateBanner?.closest("table");
  if (updateTable) updateTable.setAttribute("data-email-update-banner", "true");
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
function EmailBodyViewport({ children, zoom, onZoomChange }) {
  const viewport = useRef(null);
  const content = useRef(null);
  const zoomRef = useRef(zoom);
  const changeZoomRef = useRef(onZoomChange);
  const fitScaleRef = useRef(1);
  const animationFrame = useRef(null);
  const [baseSize, setBaseSize] = useState({ width:0, height:0, viewportWidth:0 });
  zoomRef.current = zoom;
  changeZoomRef.current = onZoomChange;
  useEffect(() => {
    const viewportNode = viewport.current;
    const contentNode = content.current;
    if (!viewportNode || !contentNode) return undefined;
    const measure = () => {
      const viewportWidth = viewportNode.clientWidth;
      const width = Math.max(viewportWidth, contentNode.scrollWidth);
      const height = contentNode.scrollHeight;
      setBaseSize(previous => previous.width === width && previous.height === height && previous.viewportWidth === viewportWidth ? previous : { width, height, viewportWidth });
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(contentNode);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const fitScale = baseSize.width && baseSize.viewportWidth ? Math.min(1, baseSize.viewportWidth / baseSize.width) : 1;
  const effectiveScale = fitScale * zoom;
  fitScaleRef.current = fitScale;
  useEffect(() => {
    const node = viewport.current;
    if (!node) return undefined;
    const distance = touches => {
      const [first, second] = touches;
      return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    };
    const midpoint = touches => ({ x:(touches[0].clientX + touches[1].clientX) / 2, y:(touches[0].clientY + touches[1].clientY) / 2 });
    let gesture = null;
    const start = event => {
      if (event.touches.length !== 2) return;
      event.preventDefault();
      const center = midpoint(event.touches);
      gesture = { distance:distance(event.touches), zoom:zoomRef.current, scale:fitScaleRef.current * zoomRef.current, scrollLeft:node.scrollLeft, center };
    };
    const move = event => {
      if (!gesture || event.touches.length < 2) return;
      event.preventDefault();
      const ratio = distance(event.touches) / Math.max(1, gesture.distance);
      const nextZoom = Math.min(2.4, Math.max(1, Number((gesture.zoom * ratio).toFixed(3))));
      const rect = node.getBoundingClientRect();
      const centerX = gesture.center.x;
      const contentPoint = (centerX - rect.left + gesture.scrollLeft) / Math.max(.01, gesture.scale);
      const nextScale = fitScaleRef.current * nextZoom;
      changeZoomRef.current(nextZoom);
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = requestAnimationFrame(() => {
        node.scrollLeft = Math.max(0, contentPoint * nextScale - (centerX - rect.left));
        animationFrame.current = null;
      });
    };
    const end = () => { gesture = null; };
    node.addEventListener("touchstart", start, { passive:false });
    node.addEventListener("touchmove", move, { passive:false });
    node.addEventListener("touchend", end, { passive:true });
    node.addEventListener("touchcancel", end, { passive:true });
    return () => {
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchmove", move);
      node.removeEventListener("touchend", end);
      node.removeEventListener("touchcancel", end);
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, []);
  const scaledWidth = baseSize.width ? Math.ceil(baseSize.width * effectiveScale) : undefined;
  const scaledHeight = baseSize.height ? Math.ceil(baseSize.height * effectiveScale) : undefined;
  return <div ref={viewport} className="inbox-message-body-viewport"><div className="inbox-message-body-canvas" style={{ width:scaledWidth ? `${scaledWidth}px` : undefined, minHeight:scaledHeight ? `${scaledHeight}px` : undefined }}><div ref={content} className="inbox-message-body-content" style={{ width:baseSize.width ? `${baseSize.width}px` : undefined, transform:`scale(${effectiveScale})` }}>{children}</div></div></div>;
}
function MessageCard({ message, conversation, currentUser, onReply, onForward, onStar, starred = false, isEarlier = false, bodyZoom = 1, onBodyZoomChange }) {
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
      <div className="inbox-message-meta">{!isNote && <div className="inbox-message-actions">{onStar && <button type="button" className={`inbox-message-star${starred ? " is-active" : ""}`} aria-label={starred ? "Remove star" : "Star conversation"} aria-pressed={starred} title={starred ? "Remove star" : "Star conversation"} onClick={onStar}><Star size={16} weight={starred ? "fill" : "regular"} /></button>}<IconButton Icon={ArrowBendUpLeft} label="Reply to message" onClick={onReply} /><IconButton Icon={ArrowBendUpRight} label="Forward" onClick={onForward} /></div>}<time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time></div>
    </div>
    <div className="inbox-message-content">
      <button type="button" className="inbox-message-details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}>{detailsOpen ? "Hide details" : "Show details"}</button>
      <div className={"inbox-message-details-wrap" + (detailsOpen ? " is-open" : "")} aria-hidden={!detailsOpen}><dl className="inbox-message-details"><div><dt>From</dt><dd>{message.senderAdminEmail ? `${message.senderAdminName || message.senderName || "Admin"} <${message.senderAdminEmail}>` : message.senderName ? `${message.senderName} <${message.senderEmail}>` : message.senderEmail}</dd></div><div><dt>Sent</dt><dd>{timeLabel(message.createdAt)}</dd></div><div><dt>To</dt><dd>{message.recipientEmail || conversation.mailbox}</dd></div><div><dt>Subject</dt><dd>{conversation.subject}</dd></div></dl></div>
      <EmailBodyViewport zoom={bodyZoom} onZoomChange={onBodyZoomChange}>{message.htmlBody ? <div className="inbox-message-body inbox-message-html" dangerouslySetInnerHTML={{ __html: compactHtmlBody(message.htmlBody) }} /> : <div className="inbox-message-body inbox-message-plain">{plainEmailBody(message.textBody)}</div>}</EmailBodyViewport>
      <MessageAttachments files={message.attachments} />
    </div>
  </article>;
}
export default function ContactsPage() {
  const toast = useToast(), queryClient = useQueryClient(), { access, user, loading: authLoading } = useAuth();
  const profileQuery = useMyProfile();
  const chatUser = useMemo(() => user ? { ...user, displayName: user.displayName || user.email } : user, [user]);
  const [searchParams, setSearchParams] = useSearchParams();
  const routeFolder = searchParams.get("folder") || "Inbox";
  const routeMailbox = String(searchParams.get("mailbox") || "").toLowerCase();
  const [folder, setFolder] = useState(routeFolder);
  const [mailbox, setMailbox] = useState(routeMailbox);
  const inbox = useInbox(folder, mailbox), statusMutation = useSetInboxStatus(), starMutation = useSetInboxStar(), bulkMutation = useBulkInbox(), publishTyping = useSetInboxTyping();
  const mailboxLoading = authLoading || inbox.isLoading || !inbox.data;
  const configuredMailboxes = useMemo(() => {
    if (mailboxLoading) return [];
    const fromInbox = Array.isArray(inbox.data?.mailboxes) ? inbox.data.mailboxes : [];
    const permittedSharedMailboxes = MAILBOXES.filter(email => canInbox(access, "read", mailboxKey(email)));
    return [...new Set([...fromInbox, ...permittedSharedMailboxes].map(email => String(email || "").toLowerCase()).filter(Boolean))];
  }, [access, inbox.data?.mailboxes, mailboxLoading]);
  const folders = (Array.isArray(inbox.data?.folders) && inbox.data.folders.length ? inbox.data.folders : [{ id:"all", label:"All mail" }, { id:"Inbox", label:"Inbox" }, { id:"Sent", label:"Sent" }, { id:"Junk", label:"Junk" }, { id:"Deleted", label:"Deleted" }, { id:"Starred", label:"Starred" }]).filter(item => item.id.toLowerCase() !== "snoozed");
  const personalMailbox = String(user?.email || "").toLowerCase();
  const personalImageUrl = typeof profileQuery.data?.profile?.image === "string" ? profileQuery.data.profile.image : "";
  const readableMailboxes = useMemo(() => configuredMailboxes.filter(email => email.toLowerCase() === personalMailbox || canInbox(access, "read", mailboxKey(email))), [access, configuredMailboxes, personalMailbox]);
  const writableMailboxes = useMemo(() => configuredMailboxes.filter(email => email.toLowerCase() === personalMailbox || canInbox(access, "write", mailboxKey(email))), [access, configuredMailboxes, personalMailbox]);
  const canWrite = writableMailboxes.length > 0;
  const storageScope = (user?.email || "workspace").toLowerCase();
  const mailboxStorageKey = `admin-inbox-mailbox:${storageScope}`;
  const tabStorageKey = `admin-inbox-tab:${storageScope}`;
  const [selected, setSelected] = useState(""), [tab, setTab] = useState("all"), [smartView, setSmartView] = useState("all"), [filters, setFilters] = useState({ sortOrder:"newest", read:"all", direction:"all", sender:"", subject:"" }), [sampleMessages, setSampleMessages] = useState({}), [sampleStatuses, setSampleStatuses] = useState({}), [sampleUnread, setSampleUnread] = useState({}), [sampleStarred, setSampleStarred] = useState({}), [sampleBranches, setSampleBranches] = useState([]), [newDraft, setNewDraft] = useState(null);
  const activeMailboxContext = mailboxContext(mailbox, personalMailbox);
  const [readerOpen, setReaderOpen] = useState(false), [historyOpen, setHistoryOpen] = useState(false), [chatMode, setChatMode] = useState(false), [chatViewMounted, setChatViewMounted] = useState(false), [replyContext, setReplyContext] = useState(null), [typingParticipant, setTypingParticipant] = useState(null), [composeExpanded, setComposeExpanded] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width:767px)").matches), [emailZoom, setEmailZoom] = useState(1), [filterDialogOpen, setFilterDialogOpen] = useState(false), [helpOpen, setHelpOpen] = useState(false), [selectMode, setSelectMode] = useState(false), [selectedThreads, setSelectedThreads] = useState(() => new Set());
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
    const samples = [...DEV_THREADS, ...sampleBranches].filter(thread => readableMailboxes.includes(thread.mailbox)).map(thread => ({ ...thread, status:sampleStatuses[thread.id] || thread.status, unreadCount: sampleUnread[thread.id] ?? thread.unreadCount, starred: sampleStarred[thread.id] ?? thread.starred ?? false, lastMessageDirection: thread.lastMessageDirection || thread.messages?.at(-1)?.direction || "", hasAttachments: thread.hasAttachments ?? thread.messages?.some(message => message.attachments?.length) }));
    const liveThreads = inbox.data?.threads || [];
    return import.meta.env.DEV && !inbox.isLoading && !inbox.isError && !liveThreads.length ? samples : liveThreads;
  }, [inbox.data, inbox.isLoading, inbox.isError, readableMailboxes, sampleStatuses, sampleUnread, sampleStarred, sampleBranches]);
  useEffect(() => {
    if (!readableMailboxes.length) { if (!mailbox) setMailbox(""); return; }
    const saved = storedValue(mailboxStorageKey, "");
    const nextMailbox = readableMailboxes.includes(routeMailbox) ? routeMailbox : readableMailboxes.includes(mailbox) ? mailbox : readableMailboxes.includes(saved) ? saved : readableMailboxes[0];
    if (nextMailbox !== mailbox) setMailbox(nextMailbox);
  }, [mailboxStorageKey, readableMailboxes, mailbox, routeMailbox]);
  const selectFolder = nextFolder => { setFolder(nextFolder); setSmartView("all"); setSelected(""); setSelectedThreads(new Set()); setReaderOpen(false); setSearchParams(previous => { const next = new URLSearchParams(previous); next.set("folder", nextFolder); return next; }, { replace:true }); };
  const selectMailbox = nextMailbox => {
    if (!readableMailboxes.includes(nextMailbox) || nextMailbox === mailbox) return;
    setMailbox(nextMailbox);
    setSmartView("all");
    setSelectedThreads(new Set());
    setSelected("");
    setReaderOpen(false);
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.set("mailbox", nextMailbox); return next; }, { replace:true });
  };
  useEffect(() => { if (routeFolder !== folder) setFolder(routeFolder); }, [routeFolder, folder]);
  useEffect(() => { if (routeMailbox && routeMailbox !== mailbox && readableMailboxes.includes(routeMailbox)) setMailbox(routeMailbox); }, [routeMailbox, mailbox, readableMailboxes]);
  useEffect(() => { if (!folders.some(item => item.id === folder)) selectFolder("Inbox"); }, [folder, folders]);
  useEffect(() => { const saved = storedValue(tabStorageKey, "all"); if (["all", "open", "closed"].includes(saved)) setTab(saved); }, [tabStorageKey]);
  useEffect(() => { if (mailbox) { try { localStorage.setItem(mailboxStorageKey, mailbox); } catch {} } }, [mailbox, mailboxStorageKey]);
  useEffect(() => { try { localStorage.setItem(tabStorageKey, tab); } catch {} }, [tab, tabStorageKey]);
  const visible = useMemo(() => threads.filter(thread => {
    const senderHaystack = (thread.participantName + " " + thread.participantEmail).toLowerCase();
    const subjectHaystack = String(thread.subject || "").toLowerCase();
    const matchesRead = filters.read === "all" || (filters.read === "unread" ? thread.unreadCount > 0 : thread.unreadCount <= 0);
    const matchesDirection = filters.direction === "all" || (filters.direction === "sent" ? (thread.hasOutbound ?? thread.source === "outbound") : !(thread.hasOutbound ?? thread.source === "outbound"));
    const matchesSender = !filters.sender.trim() || senderHaystack.includes(filters.sender.trim().toLowerCase());
    const matchesSubject = !filters.subject.trim() || subjectHaystack.includes(filters.subject.trim().toLowerCase());
    return thread.mailbox === mailbox && (tab === "all" || thread.status === tab) && smartViewMatches(thread, smartView, personalMailbox) && matchesRead && matchesDirection && matchesSender && matchesSubject;
  }).sort((a, b) => filters.sortOrder === "oldest" ? new Date(a.lastMessageAt) - new Date(b.lastMessageAt) : new Date(b.lastMessageAt) - new Date(a.lastMessageAt)), [threads, mailbox, tab, smartView, personalMailbox, filters]);
  const hasMailQuery = Boolean(smartView !== "all" || filters.sender.trim() || filters.subject.trim() || filters.read !== "all" || filters.direction !== "all");
  const smartViewCounts = useMemo(() => Object.fromEntries(SMART_VIEWS.map(view => [view.id, threads.filter(thread => thread.mailbox === mailbox && smartViewMatches(thread, view.id, personalMailbox)).length])), [threads, mailbox, personalMailbox]);
  const selectedSet = selectedThreads;
  function setThreadSelected(threadId, checked) {
    setSelectedThreads(current => { const next = new Set(current); if (checked) next.add(threadId); else next.delete(threadId); return next; });
  }
  function toggleSelectMode() {
    setSelectMode(current => { if (current) setSelectedThreads(new Set()); return !current; });
  }
  function localThread(threadId) { return String(threadId || "").startsWith("sample-"); }
  async function toggleStar(thread) {
    const next = !thread.starred;
    if (localThread(thread.id)) {
      setSampleStarred(current => ({ ...current, [thread.id]:next }));
      toast(next ? "Conversation starred" : "Star removed");
      return;
    }
    try { await starMutation.mutateAsync({ threadId:thread.id, starred:next }); toast(next ? "Conversation starred" : "Star removed"); } catch (failure) { toast(failure.message, "error"); }
  }
  async function runBulk(action) {
    const ids = [...selectedSet];
    if (!ids.length) return;
    const samples = ids.filter(localThread);
    if (samples.length) {
      if (action === "star" || action === "unstar") setSampleStarred(current => ({ ...current, ...Object.fromEntries(samples.map(id => [id, action === "star"])) }));
      if (action === "read") setSampleUnread(current => ({ ...current, ...Object.fromEntries(samples.map(id => [id, 0])) }));
      if (action === "close" || action === "open") setSampleStatuses(current => ({ ...current, ...Object.fromEntries(samples.map(id => [id, action])) }));
    }
    const liveIds = ids.filter(id => !localThread(id));
    try { if (liveIds.length) await bulkMutation.mutateAsync({ threadIds:liveIds, action }); setSelectedThreads(new Set()); setSelectMode(false); toast(`${ids.length} conversation${ids.length === 1 ? "" : "s"} updated`); } catch (failure) { toast(failure.message, "error"); }
  }
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
    const handleKeyDown = event => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target?.matches?.("input,textarea,select,[contenteditable='true']")) return;
      if (event.key === "?") { event.preventDefault(); setHelpOpen(true); return; }
      if (event.key.toLowerCase() === "c" && canWrite) { event.preventDefault(); openDraft(); return; }
      if (event.key === "Escape" && selectMode) { setSelectMode(false); setSelectedThreads(new Set()); return; }
      if (!visible.length) return;
      const currentIndex = Math.max(0, visible.findIndex(thread => thread.id === selected));
      if (event.key.toLowerCase() === "j" || event.key === "ArrowDown") { event.preventDefault(); const next = visible[Math.min(visible.length - 1, currentIndex + 1)]; if (next) { setSelected(next.id); setReaderOpen(true); } return; }
      if (event.key.toLowerCase() === "k" || event.key === "ArrowUp") { event.preventDefault(); const next = visible[Math.max(0, currentIndex - 1)]; if (next) { setSelected(next.id); setReaderOpen(true); } return; }
      if (event.key.toLowerCase() === "s" && selectedSummary) { event.preventDefault(); toggleStar(selectedSummary); return; }
      if (event.key.toLowerCase() === "r" && conversation) { event.preventDefault(); document.querySelector(".inbox-editor")?.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canWrite, conversation, selected, selectedSummary, selectMode, visible]);
  useEffect(() => {
    setHistoryOpen(false); setReplyContext(null); setTypingParticipant(null); setComposeExpanded(typeof window === "undefined" || !window.matchMedia("(max-width:767px)").matches);
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
    <div className={"inbox-shell pp-panel" + (readerOpen ? " is-reading" : "")}>
      <aside className="inbox-list" aria-label="Conversations">
        <div className="inbox-list-head inbox-mailbox-head">
          <MailboxContextBar mailbox={mailbox} personalMailbox={personalMailbox} personalName={chatUser?.displayName || personalMailbox} personalImageUrl={personalImageUrl} mailboxes={readableMailboxes} onSelect={selectMailbox} isLoading={mailboxLoading} />
          <MailFolderSelect folders={folders} selected={folder} onSelect={selectFolder} unreadOnly={filters.read === "unread"} onToggleUnread={() => setFilters(current => ({ ...current, read: current.read === "unread" ? "all" : "unread" }))} selectMode={selectMode} onToggleSelect={toggleSelectMode} canWrite={canWrite} onOpenFilter={() => setFilterDialogOpen(true)} hasMailQuery={hasMailQuery} />
        </div>
        <div className="inbox-list-tabs-row"><div className="inbox-list-tabs pp-section-tabs" role="group" aria-label="Mail view">
          {["all", "open", "closed"].map(status => <button type="button" key={status} aria-pressed={tab === status} onClick={() => setTab(status)}>{status === "all" ? "All mail" : status === "open" ? "Open" : "Closed"}<span className="inbox-count">{status === "all" ? threads.filter(thread => thread.mailbox === mailbox).length : threads.filter(thread => thread.mailbox === mailbox && thread.status === status).length}</span></button>)}
        </div></div>
        {selectMode && <div className="inbox-bulk-bar" role="toolbar" aria-label="Bulk conversation actions" aria-live="polite"><span>{selectedSet.size} selected</span><button type="button" onClick={() => runBulk("read")} disabled={!selectedSet.size}>Read</button><button type="button" onClick={() => runBulk("star")} disabled={!selectedSet.size}>Star</button><button type="button" onClick={() => runBulk("close")} disabled={!selectedSet.size}>Close</button></div>}
        {inbox.data?.syncErrors?.length > 0 && <p className="pp-error-text inbox-sync-warning" role="alert">Gmail sync needs attention: {inbox.data.syncErrors[0]} Open Admin preferences to reconnect or update Gmail.</p>}
        <div className="inbox-rows">
          {inbox.isLoading ? <InboxRowsSkeleton /> : inbox.isError ? <div className="inbox-list-empty" role="alert"><p>Couldn’t load conversations.</p><button type="button" className="pp-btn" onClick={() => inbox.refetch()}>Try again</button></div> : visible.length ? visible.map(thread => <div className={`inbox-row-wrap${selected === thread.id ? " is-selected" : ""}`} key={thread.id}>
            {selectMode && <label className="inbox-row-check"><input type="checkbox" checked={selectedSet.has(thread.id)} onChange={event => setThreadSelected(thread.id, event.target.checked)} aria-label={`Select ${thread.subject}`} /></label>}
            <button type="button" aria-current={selected === thread.id ? "true" : undefined} className={"inbox-row" + (selected === thread.id ? " is-selected" : "") + (thread.unreadCount > 0 ? " is-unread" : "")} onClick={() => { setSelected(thread.id); setReaderOpen(true); }}>
              <Avatar name={thread.participantName} email={thread.participantEmail} unread={thread.unreadCount > 0} />
              <span className="inbox-row-copy"><span className="inbox-row-top"><strong>{thread.participantName || thread.participantEmail}</strong><time dateTime={thread.lastMessageAt} title={timeLabel(thread.lastMessageAt)}>{listTimeLabel(thread.lastMessageAt)}</time></span><span className="inbox-row-subject">{thread.subject}</span><span className="inbox-row-preview">{thread.preview || thread.participantEmail}</span><span className="inbox-row-tags">{thread.hasAttachments && <span>Files</span>}{thread.unreadCount > 0 && <span className="sr-only">Unread</span>}</span></span>
            </button>
          </div>) : <p className="inbox-list-empty">{hasMailQuery || smartView !== "all" ? "No matching conversations." : "No " + tab + " conversations in this mailbox."}</p>}
        </div>
      </aside>
      <section className={"inbox-reader" + (selected === "new" ? " is-composing" : "") + (chatMode ? " is-chat-mode" : "")} aria-label="Conversation">
        {selected === "new" ? <>
          <div className="inbox-titlebar">{backButton}<div className="inbox-title-copy"><h2 tabIndex={-1}>New email</h2><p className={`inbox-mailbox-context-line is-${activeMailboxContext.kind}`}><strong>{activeMailboxContext.label}</strong><span>{mailbox}</span></p></div><button type="button" className="inbox-editor-icon" onClick={() => { setSelected(visible[0]?.id || ""); setReaderOpen(false); }} aria-label="Cancel new email"><X size={18} /></button></div>
          <Composer mailbox={(writableMailboxes.includes(mailbox) ? mailbox : writableMailboxes[0]) || mailbox} mailboxes={[(writableMailboxes.includes(mailbox) ? mailbox : writableMailboxes[0]) || mailbox]} personalMailbox={personalMailbox} initialDraft={newDraft} canWrite={canWrite} onSent={onSent} branchFromMessage={newDraft?.branchFromMessage} branchFromThreadId={newDraft?.branchFromThreadId} />
        </> : conversation ? <>
          <div className="inbox-titlebar">{backButton}<div className="inbox-title-copy"><h2 tabIndex={-1}>{conversation.subject}</h2><p className={`inbox-mailbox-context-line is-${mailboxContext(conversation.mailbox, personalMailbox).kind}`}><strong>{mailboxContext(conversation.mailbox, personalMailbox).label}</strong><span>{conversation.mailbox}</span>{conversation.isSample && <em>Preview</em>}</p></div><div className="inbox-title-actions"><button type="button" className="inbox-mode-toggle" aria-label={chatMode ? "Use email view" : "Use chat mode"} aria-pressed={chatMode} title={chatMode ? "Use email view" : "Use chat mode"} onClick={toggleChatMode}>{chatMode ? <EnvelopeSimple size={15} /> : <ChatCircleDots size={15} />}<span className="inbox-mode-current">{chatMode ? "Email" : "Chat"}</span></button><ThreadActionsMenu status={conversation.status} onStatusChange={changeStatus} canWrite={writableMailboxes.includes(conversation.mailbox)} /></div></div>
          <div className="inbox-view-switcher">
            <div className={"inbox-view-pane inbox-chat-view" + (chatMode ? " is-active" : "")} aria-hidden={!chatMode}>{chatViewMounted && <ChatThread messages={messages} currentUser={chatUser} typingParticipant={typingParticipant} onScroll={collapseComposeOnScroll} />}</div>
            <div className={"inbox-view-pane inbox-email-view" + (!chatMode ? " is-active" : "")} aria-hidden={chatMode}>
              <div className="inbox-thread" onScroll={collapseComposeOnScroll} onWheel={collapseComposeOnScroll}>
                {latestMessage && <MessageCard key={latestMessage.id} message={latestMessage} conversation={conversation} currentUser={chatUser} bodyZoom={emailZoom} onBodyZoomChange={setEmailZoom} onStar={writableMailboxes.includes(conversation.mailbox) ? () => toggleStar(conversation) : undefined} starred={conversation.starred} onReply={() => startReply(latestMessage)} onForward={() => startForward(latestMessage)} />}
                {!!olderMessages.length && <>
                  <button type="button" className={"inbox-thread-toggle" + (threadHistoryOpen ? " is-open" : "")} aria-label={threadHistoryOpen ? "Hide earlier messages" : "Show earlier messages"} aria-expanded={threadHistoryOpen} aria-controls={`inbox-history-${conversation.id}`} title={threadHistoryOpen ? "Hide earlier messages" : "Show earlier messages"} onClick={() => setHistoryOpen(value => !value)}><DotsThreeOutline size={22} weight="bold" /></button>
                  <div id={`inbox-history-${conversation.id}`} className={"inbox-thread-history" + (threadHistoryOpen ? " is-open" : "")} role="region" aria-label="Earlier messages" aria-hidden={!threadHistoryOpen}><div className="inbox-thread-history-inner"><p className="inbox-thread-history-label"><span>Earlier messages</span><span className="inbox-thread-history-count">{olderMessages.length}</span></p>{olderMessages.map(message => <MessageCard key={message.id} message={message} conversation={conversation} currentUser={chatUser} bodyZoom={emailZoom} onBodyZoomChange={setEmailZoom} onStar={writableMailboxes.includes(conversation.mailbox) ? () => toggleStar(conversation) : undefined} starred={conversation.starred} isEarlier onReply={() => startReply(message)} onForward={() => startForward(message)} />)}</div></div>
                </>}
              </div>
            </div>
          </div>
          {writableMailboxes.includes(conversation.mailbox) && <Composer key={conversation.id} thread={conversation} mailbox={conversation.mailbox} mailboxes={[conversation.mailbox]} personalMailbox={personalMailbox} canWrite onSent={onSent} onSampleSend={addSampleMessage} onTyping={announceTyping} branchFromMessage={replyContext} isCompact={!composeExpanded} onComposerInteract={expandComposeOnInteract} />}
        </> : <><div className="inbox-mobile-empty-bar">{backButton}</div><div className="inbox-empty">{detail.isError ? <div role="alert"><p>Couldn’t load this conversation.</p><button type="button" className="pp-btn" onClick={() => detail.refetch()}>Try again</button></div> : detail.isLoading ? "Loading conversation…" : "Select a conversation to read it."}</div></>}
      </section>
    </div>
    {helpOpen && <dialog open className="inbox-shortcuts-dialog" aria-label="Keyboard shortcuts"><div className="inbox-shortcuts-head"><div><span className="page-eyebrow">Inbox</span><h2>Keyboard shortcuts</h2></div><button type="button" className="inbox-editor-icon" aria-label="Close keyboard shortcuts" onClick={() => setHelpOpen(false)}><X size={18} /></button></div><div className="inbox-shortcuts-list"><span><kbd>J</kbd><kbd>↓</kbd> Next conversation</span><span><kbd>K</kbd><kbd>↑</kbd> Previous conversation</span><span><kbd>R</kbd> Reply</span><span><kbd>S</kbd> Star or unstar</span><span><kbd>C</kbd> New email</span><span><kbd>?</kbd> Show shortcuts</span></div></dialog>}
    {filterDialogOpen && <MailFilterDialog value={filters} onChange={setFilters} onClose={() => setFilterDialogOpen(false)} smartView={smartView} onSmartViewChange={setSmartView} smartViewCounts={smartViewCounts} onReset={() => { setSmartView("all"); setFilters({ sortOrder:"newest", read:"all", direction:"all", sender:"", subject:"" }); }} />}
  </div>;
}
