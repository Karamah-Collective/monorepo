import { useEffect, useRef } from "react";
import {
  Code,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Quotes,
  TextB,
  TextItalic,
  TextStrikethrough,
} from "@phosphor-icons/react";

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

const escapeHtml = value =>
  String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

const inlineHtml = value =>
  escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(\*\*|__)(.+?)\1/g, "<strong>$2</strong>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(\*|_)([^*_\n]+?)\1/g, "<em>$2</em>");

function markdownToVisual(markdown) {
  const blocks = String(markdown || "").trim().split(/\n{2,}/).filter(Boolean);
  if (!blocks.length) return "";

  return blocks.map(block => {
    const lines = block.split("\n");
    if (lines.every(line => /^-\s+/.test(line))) {
      return `<ul>${lines.map(line => `<li>${inlineHtml(line.replace(/^-\s+/, ""))}</li>`).join("")}</ul>`;
    }
    if (lines.every(line => /^\d+\.\s+/.test(line))) {
      return `<ol>${lines.map(line => `<li>${inlineHtml(line.replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
    }
    if (lines.every(line => /^>\s?/.test(line))) {
      return `<blockquote>${lines.map(line => inlineHtml(line.replace(/^>\s?/, ""))).join("<br>")}</blockquote>`;
    }
    return `<p>${lines.map(inlineHtml).join("<br>")}</p>`;
  }).join("");
}

function visualToMarkdown(node) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\u00a0/g, " ");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const children = [...node.childNodes].map(visualToMarkdown).join("");
  switch (node.tagName) {
    case "STRONG":
    case "B":
      return children ? `**${children}**` : "";
    case "EM":
    case "I":
      return children ? `*${children}*` : "";
    case "S":
    case "STRIKE":
    case "DEL":
      return children ? `~~${children}~~` : "";
    case "CODE":
      return children ? `\`${children}\`` : "";
    case "A":
      return SAFE_LINK.test(node.href) ? `[${children}](${node.href})` : children;
    case "BR":
      return "\n";
    case "P":
    case "DIV":
      return `${children}\n\n`;
    case "LI":
      return children.trim();
    case "UL":
      return `${[...node.children].map(item => `- ${visualToMarkdown(item).trim()}`).join("\n")}\n\n`;
    case "OL":
      return `${[...node.children].map((item, index) => `${index + 1}. ${visualToMarkdown(item).trim()}`).join("\n")}\n\n`;
    case "BLOCKQUOTE":
      return `${children.split("\n").filter(Boolean).map(line => `> ${line}`).join("\n")}\n\n`;
    case "PRE":
      return children ? `\`${children}\`\n\n` : "";
    default:
      return children;
  }
}

function placeCaretAfter(node) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretInside(node) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function getEditorRange(editor) {
  if (!editor) return null;

  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  if (!editor.contains(element)) return null;
  return range;
}

function applyInlineElement(editor, tagName, attributes = {}) {
  const range = getEditorRange(editor);
  if (!range || range.collapsed) return false;

  const wrapper = document.createElement(tagName);
  Object.entries(attributes).forEach(([key, value]) => wrapper.setAttribute(key, value));
  wrapper.appendChild(range.extractContents());
  range.insertNode(wrapper);
  placeCaretAfter(wrapper);
  return true;
}

function applyList(editor, tagName) {
  const range = getEditorRange(editor);
  if (!range) return false;

  const selectedText = range.collapsed ? "" : range.toString();
  const lines = selectedText.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const list = document.createElement(tagName);
  const items = lines.length ? lines : [""];

  items.forEach(line => {
    const item = document.createElement("li");
    if (line) item.textContent = line;
    else item.appendChild(document.createElement("br"));
    list.appendChild(item);
  });

  if (!range.collapsed) range.deleteContents();
  range.insertNode(list);
  if (lines.length) placeCaretAfter(list);
  else placeCaretInside(list.firstElementChild);
  return true;
}

function applyQuote(editor) {
  const range = getEditorRange(editor);
  if (!range) return false;

  const quote = document.createElement("blockquote");
  if (range.collapsed) {
    quote.appendChild(document.createElement("br"));
  } else {
    quote.appendChild(range.extractContents());
  }

  range.insertNode(quote);
  if (range.collapsed) placeCaretInside(quote);
  else placeCaretAfter(quote);
  return true;
}

export default function RichDescriptionEditor({ value, onChange, ariaLabelledBy }) {
  const editorRef = useRef(null);
  const focusedRef = useRef(false);
  const lastSavedRef = useRef(value || "");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || focusedRef.current || value === lastSavedRef.current) return;
    editor.innerHTML = markdownToVisual(value);
    lastSavedRef.current = value || "";
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = markdownToVisual(value);
  }, []);

  const save = () => {
    const next = visualToMarkdown(editorRef.current)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd();
    lastSavedRef.current = next;
    onChange(next);
  };

  const runFormat = action => {
    const editor = editorRef.current;
    if (!editor) return;

    const changed = action(editor);
    if (changed) {
      editor.focus();
      save();
    }
  };

  const promptForLink = () => {
    const range = getEditorRange(editorRef.current);
    if (!range || range.collapsed) return;

    const savedRange = range.cloneRange();
    const url = window.prompt("Link URL");
    const cleanUrl = String(url || "").trim();
    if (!SAFE_LINK.test(cleanUrl)) return;

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
    runFormat(editor => applyInlineElement(editor, "a", { href: cleanUrl, target: "_blank", rel: "noopener noreferrer" }));
  };

  return (
    <div className="visual-description-editor">
      <div className="visual-editor-toolbar" role="toolbar" aria-label="Description formatting">
        <div>
          <button type="button" aria-label="Bold" title="Bold" onMouseDown={event => event.preventDefault()} onClick={() => runFormat(editor => applyInlineElement(editor, "strong"))}>
            <TextB size={17} weight="bold" />
          </button>
          <button type="button" aria-label="Italic" title="Italic" onMouseDown={event => event.preventDefault()} onClick={() => runFormat(editor => applyInlineElement(editor, "em"))}>
            <TextItalic size={17} weight="bold" />
          </button>
          <button type="button" aria-label="Strikethrough" title="Strikethrough" onMouseDown={event => event.preventDefault()} onClick={() => runFormat(editor => applyInlineElement(editor, "s"))}>
            <TextStrikethrough size={17} weight="bold" />
          </button>
          <button type="button" aria-label="Code" title="Code" onMouseDown={event => event.preventDefault()} onClick={() => runFormat(editor => applyInlineElement(editor, "code"))}>
            <Code size={17} weight="bold" />
          </button>
        </div>
        <i aria-hidden="true" />
        <div>
          <button type="button" aria-label="Bulleted list" title="Bulleted list" onMouseDown={event => event.preventDefault()} onClick={() => runFormat(editor => applyList(editor, "ul"))}>
            <ListBullets size={17} weight="bold" />
          </button>
          <button type="button" aria-label="Numbered list" title="Numbered list" onMouseDown={event => event.preventDefault()} onClick={() => runFormat(editor => applyList(editor, "ol"))}>
            <ListNumbers size={17} weight="bold" />
          </button>
          <button type="button" aria-label="Quote" title="Quote" onMouseDown={event => event.preventDefault()} onClick={() => runFormat(applyQuote)}>
            <Quotes size={17} weight="bold" />
          </button>
          <button type="button" aria-label="Link" title="Link" onMouseDown={event => event.preventDefault()} onClick={promptForLink}>
            <LinkSimple size={17} weight="bold" />
          </button>
        </div>
      </div>
      <div
        ref={editorRef}
        className="visual-editor-surface"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby={ariaLabelledBy}
        data-placeholder="Write the form introduction..."
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          save();
        }}
        onInput={save}
      />
    </div>
  );
}
