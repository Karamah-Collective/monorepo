import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Code,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Minus,
  Quotes,
  TextB,
  TextItalic,
  TextStrikethrough,
  X,
} from "@phosphor-icons/react";
import { isSafeDescriptionLink, parseDescriptionMarkdown } from "./richDescriptionModel.js";

const EMPTY_FORMATS = {
  bold: false,
  italic: false,
  strike: false,
  unordered: false,
  ordered: false,
  quote: false,
  code: false,
  link: false,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineNodesToHtml(nodes) {
  return nodes.map((node) => {
    if (node.type === "text") return escapeHtml(node.text);
    if (node.type === "code") return `<code>${escapeHtml(node.text)}</code>`;
    const content = inlineNodesToHtml(node.children || []);
    if (node.type === "strong") return `<strong>${content}</strong>`;
    if (node.type === "emphasis") return `<em>${content}</em>`;
    if (node.type === "strike") return `<s>${content}</s>`;
    if (node.type === "link" && isSafeDescriptionLink(node.url)) {
      return `<a href="${escapeHtml(node.url)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
    }
    return content;
  }).join("");
}

function markdownToEditorHtml(markdown) {
  return parseDescriptionMarkdown(markdown).map((block) => {
    if (block.type === "paragraph") {
      return `<p>${block.lines.map(inlineNodesToHtml).join("<br>")}</p>`;
    }
    if (block.type === "unordered-list" || block.type === "ordered-list") {
      const tag = block.type === "ordered-list" ? "ol" : "ul";
      return `<${tag}>${block.items.map((item) => `<li>${inlineNodesToHtml(item)}</li>`).join("")}</${tag}>`;
    }
    if (block.type === "quote") {
      return `<blockquote>${block.lines.map(inlineNodesToHtml).join("<br>")}</blockquote>`;
    }
    if (block.type === "divider") return "<hr>";
    return "";
  }).join("");
}

function inlineToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue || "").replaceAll("\u00a0", " ");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  const content = Array.from(node.childNodes).map(inlineToMarkdown).join("");
  if (tag === "br") return "\n";
  if ((tag === "strong" || tag === "b") && content) return `**${content}**`;
  if ((tag === "em" || tag === "i") && content) return `*${content}*`;
  if ((tag === "s" || tag === "strike" || tag === "del") && content) return `~~${content}~~`;
  if (tag === "code" && content) return `\`${content.replaceAll("`", "")}\``;
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    return isSafeDescriptionLink(href) && content ? `[${content}](${href})` : content;
  }
  return content;
}

function blockToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return inlineToMarkdown(node).trim();
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "hr") return "---";
  if (tag === "ul" || tag === "ol") {
    return Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child, index) => `${tag === "ol" ? `${index + 1}.` : "-"} ${Array.from(child.childNodes).map(inlineToMarkdown).join("").trim()}`)
      .join("\n");
  }
  if (tag === "blockquote") {
    return Array.from(node.childNodes).map(inlineToMarkdown).join("").split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
  }
  return Array.from(node.childNodes).map(inlineToMarkdown).join("").trim();
}

function editorToMarkdown(editor) {
  return Array.from(editor.childNodes)
    .map(blockToMarkdown)
    .filter(Boolean)
    .join("\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitisePastedHtml(html) {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const clean = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.nodeValue || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    const content = Array.from(node.childNodes).map(clean).join("");
    if (["script", "style", "meta", "link", "iframe", "object"].includes(tag)) return "";
    if (["strong", "b"].includes(tag)) return `<strong>${content}</strong>`;
    if (["em", "i"].includes(tag)) return `<em>${content}</em>`;
    if (["s", "strike", "del"].includes(tag)) return `<s>${content}</s>`;
    if (tag === "code") return `<code>${content}</code>`;
    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      return isSafeDescriptionLink(href) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${content}</a>` : content;
    }
    if (["p", "div", "ul", "ol", "li", "blockquote"].includes(tag)) return `<${tag}>${content}</${tag}>`;
    if (tag === "br" || tag === "hr") return `<${tag}>`;
    if (/^h[1-6]$/.test(tag)) return `<p><strong>${content}</strong></p>`;
    return content;
  };
  return Array.from(documentNode.body.childNodes).map(clean).join("");
}

function closestElement(node, selector, boundary) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const match = element?.closest?.(selector);
  return match && boundary.contains(match) ? match : null;
}

function ToolButton({ active = false, label, children, onAction }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={active ? "is-active" : ""}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onAction}
    >
      {children}
    </button>
  );
}

export default function RichDescriptionEditor({ value = "", onChange, ariaLabelledBy }) {
  const editorRef = useRef(null);
  const focusedRef = useRef(false);
  const initializedRef = useRef(false);
  const lastEmittedRef = useRef(String(value || ""));
  const emitTimerRef = useRef(null);
  const savedRangeRef = useRef(null);
  const [formats, setFormats] = useState(EMPTY_FORMATS);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [characterCount, setCharacterCount] = useState(String(value || "").length);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    clearTimeout(emitTimerRef.current);
    const markdown = editorToMarkdown(editor);
    setCharacterCount(editor.innerText.replace(/\n$/, "").length);
    if (markdown === lastEmittedRef.current) return;
    lastEmittedRef.current = markdown;
    onChange(markdown);
  }, [onChange]);

  const scheduleChange = useCallback(() => {
    clearTimeout(emitTimerRef.current);
    const editor = editorRef.current;
    if (editor) setCharacterCount(editor.innerText.replace(/\n$/, "").length);
    emitTimerRef.current = setTimeout(emitChange, 180);
  }, [emitChange]);

  const refreshFormats = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) {
      setFormats(EMPTY_FORMATS);
      return;
    }
    const anchor = selection.anchorNode;
    setFormats({
      bold: document.queryCommandState("bold") || Boolean(closestElement(anchor, "strong,b", editor)),
      italic: document.queryCommandState("italic") || Boolean(closestElement(anchor, "em,i", editor)),
      strike: document.queryCommandState("strikeThrough") || Boolean(closestElement(anchor, "s,strike,del", editor)),
      unordered: document.queryCommandState("insertUnorderedList") || Boolean(closestElement(anchor, "ul", editor)),
      ordered: document.queryCommandState("insertOrderedList") || Boolean(closestElement(anchor, "ol", editor)),
      quote: Boolean(closestElement(anchor, "blockquote", editor)),
      code: Boolean(closestElement(anchor, "code", editor)),
      link: Boolean(closestElement(anchor, "a", editor)),
    });
  }, []);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    const incoming = String(value || "");
    if (!editor) return;
    if (!initializedRef.current || (!focusedRef.current && incoming !== lastEmittedRef.current)) {
      editor.innerHTML = markdownToEditorHtml(incoming);
      lastEmittedRef.current = incoming;
      setCharacterCount(editor.innerText.replace(/\n$/, "").length);
      initializedRef.current = true;
    }
  }, [value]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (focusedRef.current) refreshFormats();
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      clearTimeout(emitTimerRef.current);
    };
  }, [refreshFormats]);

  const runCommand = (command, commandValue = null) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus({ preventScroll: true });
    document.execCommand(command, false, commandValue);
    scheduleChange();
    refreshFormats();
  };

  const toggleQuote = () => runCommand("formatBlock", formats.quote ? "p" : "blockquote");

  const toggleCode = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
    const existing = closestElement(selection.anchorNode, "code", editor);
    if (existing) {
      existing.replaceWith(...existing.childNodes);
    } else {
      const range = selection.getRangeAt(0);
      if (range.collapsed) return;
      const code = document.createElement("code");
      code.append(range.extractContents());
      range.insertNode(code);
      selection.removeAllRanges();
      const nextRange = document.createRange();
      nextRange.selectNodeContents(code);
      selection.addRange(nextRange);
    }
    scheduleChange();
    refreshFormats();
  };

  const openLinkEditor = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    const existing = closestElement(selection.anchorNode, "a", editor);
    setLinkUrl(existing?.getAttribute("href") || "https://");
    setLinkError("");
    setLinkOpen(true);
  };

  const applyLink = (event) => {
    event.preventDefault();
    const cleanUrl = linkUrl.trim();
    if (!isSafeDescriptionLink(cleanUrl)) {
      setLinkError("Use a full https:// link or an email address beginning with mailto:.");
      return;
    }
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    const selection = window.getSelection();
    if (!editor || !range || !selection) return;
    editor.focus({ preventScroll: true });
    selection.removeAllRanges();
    selection.addRange(range);
    if (range.collapsed) document.execCommand("insertHTML", false, `<a href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cleanUrl)}</a>`);
    else document.execCommand("createLink", false, cleanUrl);
    const anchor = closestElement(selection.anchorNode, "a", editor);
    if (anchor) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    setLinkOpen(false);
    setLinkError("");
    scheduleChange();
    refreshFormats();
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (html) document.execCommand("insertHTML", false, sanitisePastedHtml(html));
    else document.execCommand("insertText", false, text);
    scheduleChange();
  };

  const handleKeyDown = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (["b", "i", "k"].includes(key)) event.preventDefault();
    if (key === "b") runCommand("bold");
    if (key === "i") runCommand("italic");
    if (key === "k") openLinkEditor();
  };

  return (
    <div className="rich-description-editor">
      <div className="rich-description-toolbar" role="toolbar" aria-label="Description formatting">
        <div className="rich-tool-group">
          <ToolButton active={formats.bold} label="Bold (Ctrl+B)" onAction={() => runCommand("bold")}><TextB size={18} weight="bold" /></ToolButton>
          <ToolButton active={formats.italic} label="Italic (Ctrl+I)" onAction={() => runCommand("italic")}><TextItalic size={18} /></ToolButton>
          <ToolButton active={formats.strike} label="Strikethrough" onAction={() => runCommand("strikeThrough")}><TextStrikethrough size={18} /></ToolButton>
          <ToolButton active={formats.code} label="Inline code" onAction={toggleCode}><Code size={18} /></ToolButton>
        </div>
        <i aria-hidden="true" />
        <div className="rich-tool-group">
          <ToolButton active={formats.unordered} label="Bulleted list" onAction={() => runCommand("insertUnorderedList")}><ListBullets size={19} /></ToolButton>
          <ToolButton active={formats.ordered} label="Numbered list" onAction={() => runCommand("insertOrderedList")}><ListNumbers size={19} /></ToolButton>
          <ToolButton active={formats.quote} label="Quote" onAction={toggleQuote}><Quotes size={18} /></ToolButton>
        </div>
        <i aria-hidden="true" />
        <div className="rich-tool-group">
          <ToolButton active={formats.link} label="Add link (Ctrl+K)" onAction={openLinkEditor}><LinkSimple size={18} /></ToolButton>
          <ToolButton label="Divider" onAction={() => runCommand("insertHorizontalRule")}><Minus size={18} /></ToolButton>
        </div>
        <span className="rich-description-count" aria-live="polite">{characterCount.toLocaleString()} characters</span>
      </div>

      {linkOpen && (
        <form className="rich-link-editor" onSubmit={applyLink}>
          <label>
            Link address
            <input autoFocus value={linkUrl} onChange={(event) => { setLinkUrl(event.target.value); setLinkError(""); }} placeholder="https://example.com" />
          </label>
          <button className="pp-btn primary" type="submit">Apply link</button>
          <button className="icon-button" type="button" aria-label="Close link editor" onClick={() => { setLinkOpen(false); setLinkError(""); }}><X size={18} /></button>
          {linkError && <small role="alert">{linkError}</small>}
        </form>
      )}

      <div
        ref={editorRef}
        className="rich-editor-surface"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby={ariaLabelledBy}
        data-placeholder="Write the form description…"
        onFocus={() => { focusedRef.current = true; refreshFormats(); }}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement.contains(event.relatedTarget)) {
            focusedRef.current = false;
            emitChange();
          }
        }}
        onInput={scheduleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
    </div>
  );
}
