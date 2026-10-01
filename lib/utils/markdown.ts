import { splitImageSettings, storyImageStyle } from "@/lib/utils/newsletter-story-image";

// Minimal renderer for the subset of markdown the newsletter editor's
// toolbar produces (bold/italic/strike/link/image/quote/lists). Shared so
// the in-app preview and the future public newsletter page render identically.
function escapeHtml(source: string) {
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function attribute(value: string) {
  return value.replace(/"/g, "&quot;");
}

function renderImage(alt: string, src: string) {
  const { url, size, align } = splitImageSettings(src);
  return `<img alt="${attribute(alt)}" src="${attribute(url)}" style="${storyImageStyle(size, align)}" />`;
}

function renderInline(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, src: string) => renderImage(alt, src))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

export function renderNewsletterMarkdown(source: string) {
  const lines = escapeHtml(source).split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function closeList() {
    if (listType) html.push(`</${listType}>`);
    listType = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (line.startsWith("> ")) {
      closeList();
      html.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInline(line.slice(2))}</li>`);
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInline(line.replace(/^\d+\.\s/, ""))}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }
  closeList();
  return html.join("\n");
}
