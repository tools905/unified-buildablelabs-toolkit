import { splitImageSettings, storyImageStyle } from "@/lib/utils/newsletter-story-image";

// Minimal renderer for the subset of markdown the newsletter editor's
// toolbar produces (headings/bold/italic/strike/link/image/quote/lists/code). Shared so
// the in-app preview and the future public newsletter page render identically.
export function escapeHtml(source: string) {
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

function renderFormatting(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, src: string) => renderImage(alt, src))
    // Only web and mail links become links; anything else (javascript: and the like) keeps just its words.
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) =>
      /^(https?:|mailto:)/i.test(href.trim())
        ? `<a href="${attribute(href.trim())}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : label,
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

// Inline code is cut out first, so nothing inside `backticks` is turned into bold, links and so on.
function renderInline(text: string) {
  return text
    .split(/(`[^`]+`)/g)
    .map((part, index) => (index % 2 === 1 ? `<code>${part.slice(1, -1)}</code>` : renderFormatting(part)))
    .join("");
}

// The line under a table header: dashes per column, with optional colons for alignment.
const TABLE_DIVIDER = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

type Align = "left" | "center" | "right" | null;

// "| a | b |" -> ["a", "b"]. A pipe written as \| stays inside its cell.
function splitTableRow(line: string) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function nextFilledLine(lines: string[], from: number) {
  let at = from;
  while (at < lines.length && !lines[at].trim()) at += 1;
  return at;
}

// A table is a header row, a divider row, then body rows. Text pasted from a chat often has blank lines
// between the rows, so those are skipped as long as the next filled line still starts with a pipe.
// Returns the table's html and the index of the first line after it, or null when this isn't a table.
function readTable(lines: string[], start: number): { html: string; next: number } | null {
  const header = lines[start].trim();
  if (!header.includes("|")) return null;

  const dividerAt = nextFilledLine(lines, start + 1);
  const divider = lines[dividerAt]?.trim();
  if (!divider || !divider.includes("|") || !TABLE_DIVIDER.test(divider)) return null;

  const headers = splitTableRow(header);
  const dividers = splitTableRow(divider);
  if (headers.length !== dividers.length) return null;

  const aligns: Align[] = dividers.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    return left && right ? "center" : right ? "right" : left ? "left" : null;
  });

  const rows: string[][] = [];
  let next = dividerAt + 1;
  for (;;) {
    const at = nextFilledLine(lines, next);
    if (at >= lines.length) break;
    const text = lines[at].trim();
    const touching = at === next;
    if (!(touching ? text.includes("|") : text.startsWith("|"))) break;
    rows.push(splitTableRow(text));
    next = at + 1;
  }

  const cell = (tag: "th" | "td", text: string, column: number) => {
    const style = aligns[column] ? ` style="text-align:${aligns[column]}"` : "";
    return `<${tag}${style}>${renderInline(text)}</${tag}>`;
  };
  const head = `<thead><tr>${headers.map((text, column) => cell("th", text, column)).join("")}</tr></thead>`;
  const body = rows.length
    ? `<tbody>${rows
        .map((row) => `<tr>${headers.map((_, column) => cell("td", row[column] ?? "", column)).join("")}</tr>`)
        .join("")}</tbody>`
    : "";
  return { html: `<table>${head}${body}</table>`, next };
}

export function renderNewsletterMarkdown(source: string) {
  const lines = escapeHtml(source).split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let codeLines: string[] | null = null;
  let codeLanguage = "";

  function closeList() {
    if (listType) html.push(`</${listType}>`);
    listType = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    // A fenced code block runs from one ``` line to the next; its lines are kept exactly as written.
    if (codeLines !== null) {
      if (line.startsWith("```")) {
        const language = codeLanguage ? ` class="language-${codeLanguage}"` : "";
        html.push(`<pre><code${language}>${codeLines.join("\n")}</code></pre>`);
        codeLines = null;
      } else {
        codeLines.push(rawLine);
      }
      continue;
    }
    if (line.startsWith("```")) {
      closeList();
      codeLines = [];
      codeLanguage = line.slice(3).trim().replace(/[^a-zA-Z0-9_+#-]/g, "");
      continue;
    }

    const table = line ? readTable(lines, index) : null;
    if (table) {
      closeList();
      html.push(table.html);
      index = table.next - 1;
      continue;
    }

    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    if (!line) {
      closeList();
      continue;
    }
    // The text was escaped first, so a quote marker ">" is already "&gt;" by the time it is checked.
    if (line.startsWith("&gt; ")) {
      closeList();
      html.push(`<blockquote>${renderInline(line.slice(5))}</blockquote>`);
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
  // A block left open at the end of the text still shows, instead of vanishing.
  if (codeLines !== null) html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
  return html.join("\n");
}
