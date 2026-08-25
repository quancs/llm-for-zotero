import { resolveNoteParentItem, resolveNoteTitle } from "./portalScope";

export type NoteSnapshot = {
  noteId: number;
  noteItemKey?: string;
  title: string;
  html: string;
  text: string;
  libraryID: number;
  parentItemId?: number;
  parentItemKey?: string;
  noteKind: "item" | "standalone";
};

export function stripNoteHtml(html: string): string {
  if (!html) return "";
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function decodeNoteHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function inlineNoteHtmlToMarkdown(html: string): string {
  let text = html.replace(
    /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, _quote, href, label) => {
      const plainLabel = stripNoteHtml(String(label || "")).trim();
      const decodedHref = decodeNoteHtmlEntities(String(href || "")).trim();
      if (!plainLabel) return decodedHref;
      return decodedHref ? `[${plainLabel}](${decodedHref})` : plainLabel;
    },
  );
  text = text.replace(
    /<code[^>]*>([\s\S]*?)<\/code>/gi,
    (_match, content) => `\`${stripNoteHtml(String(content || "")).trim()}\``,
  );
  return stripNoteHtml(text).trim();
}

/**
 * Convert stored Zotero note HTML into the Markdown-like source shown to the
 * model.  Zotero keeps heading levels in `<h1>` ... `<h6>` elements; flattening
 * those elements to plain text makes a later full-note rewrite silently demote
 * every heading.  Preserve the markers while retaining the lightweight plain
 * text representation used by the rest of the note context pipeline.
 */
export function noteHtmlToMarkdownText(html: string): string {
  if (!html) return "";
  let normalized = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  normalized = normalized.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    (_match, content) =>
      `\n\n\`\`\`\n${decodeNoteHtmlEntities(
        stripNoteHtml(String(content || "")),
      )}\n\`\`\`\n\n`,
  );
  normalized = normalized.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_match, level, content) => {
      // Heading weight is already conveyed by the heading itself, but links
      // remain semantically important (for example Zotero note/PDF links).
      const title = inlineNoteHtmlToMarkdown(String(content || ""));
      return title
        ? `\n\n${"#".repeat(Number(level) || 1)} ${title}\n\n`
        : "\n";
    },
  );
  normalized = normalized.replace(
    /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, _quote, href, label) => {
      const plainLabel = stripNoteHtml(String(label || "")).trim();
      const decodedHref = decodeNoteHtmlEntities(String(href || "")).trim();
      if (!plainLabel) return decodedHref;
      return decodedHref ? `[${plainLabel}](${decodedHref})` : plainLabel;
    },
  );
  normalized = normalized.replace(
    /<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_match, _tag, content) => `**${stripNoteHtml(content).trim()}**`,
  );
  normalized = normalized.replace(
    /<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_match, _tag, content) => `*${stripNoteHtml(content).trim()}*`,
  );
  normalized = normalized.replace(
    /<code[^>]*>([\s\S]*?)<\/code>/gi,
    (_match, content) => `\`${stripNoteHtml(content).trim()}\``,
  );
  normalized = normalized.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
  normalized = normalized.replace(/<br\s*\/?>/gi, "\n");
  normalized = normalized.replace(/<li[^>]*>/gi, "\n- ");
  normalized = normalized.replace(/<\/li>/gi, "");
  normalized = normalized.replace(/<blockquote[^>]*>/gi, "\n\n> ");
  normalized = normalized.replace(/<\/blockquote>/gi, "\n\n");
  normalized = normalized.replace(
    /<\/(p|div|ul|ol|table|thead|tbody|tr)>/gi,
    "\n\n",
  );
  normalized = normalized.replace(/<(?!img\b)[^>]+>/gi, "");
  return decodeNoteHtmlEntities(normalized)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function readNoteSnapshot(
  item: Zotero.Item | null | undefined,
): NoteSnapshot | null {
  if (!(item as any)?.isNote?.()) return null;
  const noteId = Number(item?.id);
  if (!Number.isFinite(noteId) || noteId <= 0) return null;
  const html = String((item as any).getNote?.() || "");
  const parentItem = resolveNoteParentItem(item);
  return {
    noteId: Math.floor(noteId),
    noteItemKey:
      typeof (item as any)?.key === "string" && (item as any).key.trim()
        ? (item as any).key.trim().toUpperCase()
        : undefined,
    title: resolveNoteTitle(item),
    html,
    text: noteHtmlToMarkdownText(html),
    libraryID: Number(item?.libraryID) || 0,
    parentItemId: parentItem?.id,
    parentItemKey:
      typeof (parentItem as any)?.key === "string" &&
      (parentItem as any).key.trim()
        ? (parentItem as any).key.trim().toUpperCase()
        : undefined,
    noteKind: parentItem ? "item" : "standalone",
  };
}
