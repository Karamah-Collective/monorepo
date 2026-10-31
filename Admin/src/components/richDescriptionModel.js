const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

export function isSafeDescriptionLink(value) {
  return SAFE_LINK.test(String(value || "").trim());
}

export function parseInlineMarkdown(source) {
  const text = String(source || "");
  const token = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|(\*\*|__)(.+?)\3|(~~)(.+?)\5|(`)([^`]+)\7|(\*|_)([^*_\n]+?)\9/g;
  const nodes = [];
  let index = 0;
  for (let match; (match = token.exec(text));) {
    if (match.index > index) nodes.push({ type: "text", text: text.slice(index, match.index) });
    if (match[1]) nodes.push({ type: "link", url: match[2], children: parseInlineMarkdown(match[1]) });
    else if (match[3]) nodes.push({ type: "strong", children: parseInlineMarkdown(match[4]) });
    else if (match[5]) nodes.push({ type: "strike", children: parseInlineMarkdown(match[6]) });
    else if (match[7]) nodes.push({ type: "code", text: match[8] });
    else nodes.push({ type: "emphasis", children: parseInlineMarkdown(match[10]) });
    index = token.lastIndex;
  }
  if (index < text.length) nodes.push({ type: "text", text: text.slice(index) });
  return nodes;
}

export function parseDescriptionMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => { if (paragraph.length) { blocks.push({ type: "paragraph", lines: paragraph.map(parseInlineMarkdown) }); paragraph = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  const flushAll = () => { flushParagraph(); flushList(); };

  lines.forEach(line => {
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "unordered-list" : "ordered-list";
      if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      list.items.push(parseInlineMarkdown((unordered || ordered)[1]));
      return;
    }
    if (quoted) { flushAll(); blocks.push({ type: "quote", lines: [parseInlineMarkdown(quoted[1])] }); return; }
    if (!line.trim()) { flushAll(); return; }
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) { flushAll(); blocks.push({ type: "divider" }); return; }
    flushList();
    paragraph.push(line);
  });
  flushAll();
  return blocks;
}
