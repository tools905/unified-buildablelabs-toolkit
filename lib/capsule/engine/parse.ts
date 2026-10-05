// Step one of every converter: read the story's Markdown into a list of blocks. Text inside a block
// is still raw Markdown (not escaped); `renderInline` escapes and formats it when a platform renders it.
// The parser knows more than the website renderer (tables, footnotes, math, bare links), because a
// writer may paste those in, and each platform has to decide what to do with them.

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[]; nested: boolean }
  | { kind: "quote"; text: string }
  | { kind: "code"; language: string; text: string }
  | { kind: "image"; alt: string; src: string }
  | { kind: "hr" }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "math"; tex: string }
  | { kind: "embed"; url: string }
  | { kind: "footnote"; id: string; text: string };

const FENCE = /^```/;
const HEADING = /^(#{1,6})\s+(.+)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const EMBED = /^https?:\/\/\S+$/;
const FOOTNOTE = /^\[\^([^\]\s]+)\]:\s*(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;
const TABLE_SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

// Same clean-up the website renderer uses, so a language name can never break out of its attribute.
export function cleanLanguage(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_+#-]/g, "");
}

// Index of the next line that has text, from `from` on (or the line count when there is none).
function nextFilled(lines: string[], from: number) {
  let at = from;
  while (at < lines.length && !lines[at].trim()) at += 1;
  return at;
}

function tableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      i++;
      continue;
    }

    // Fenced code: everything up to the closing fence is kept exactly as written. An unclosed fence
    // runs to the end of the story, like on the website.
    if (FENCE.test(line)) {
      const language = cleanLanguage(line.slice(3));
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i].trim())) code.push(lines[i++]);
      i++; // the closing fence
      blocks.push({ kind: "code", language, text: code.join("\n") });
      continue;
    }

    // Math: "$$ x $$" on one line, or a $$ line, the formula, and a closing $$ line.
    if (line.startsWith("$$")) {
      const single = /^\$\$(.+)\$\$$/.exec(line);
      if (single) {
        blocks.push({ kind: "math", tex: single[1].trim() });
        i++;
        continue;
      }
      const tex: string[] = [line.slice(2)];
      i++;
      while (i < lines.length && !lines[i].trim().endsWith("$$")) tex.push(lines[i++]);
      if (i < lines.length) tex.push(lines[i].trim().slice(0, -2));
      i++;
      blocks.push({ kind: "math", tex: tex.join("\n").trim() });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // A table needs a header row followed by a |---|---| row; anything else with pipes is a paragraph.
    // Text copied from a chat often has blank lines between the rows, so those are skipped as long as the
    // next filled line still starts with a pipe (the divider must then have a pipe too, so a lone "---"
    // after a blank line stays a rule). This matches what the website renderer accepts.
    if (line.startsWith("|")) {
      const dividerAt = nextFilled(lines, i + 1);
      const divider = lines[dividerAt]?.trim();
      if (divider !== undefined && TABLE_SEPARATOR.test(divider) && (dividerAt === i + 1 || divider.includes("|"))) {
        const header = tableCells(line);
        const rows: string[][] = [];
        i = dividerAt + 1;
        for (;;) {
          const at = nextFilled(lines, i);
          if (at >= lines.length || !lines[at].trim().startsWith("|")) break;
          rows.push(tableCells(lines[at]));
          i = at + 1;
        }
        blocks.push({ kind: "table", header, rows });
        continue;
      }
    }

    const footnote = FOOTNOTE.exec(line);
    if (footnote) {
      blocks.push({ kind: "footnote", id: footnote[1], text: footnote[2] });
      i++;
      continue;
    }

    const image = IMAGE.exec(line);
    if (image) {
      blocks.push({ kind: "image", alt: image[1], src: image[2] });
      i++;
      continue;
    }

    if (EMBED.test(line)) {
      blocks.push({ kind: "embed", url: line });
      i++;
      continue;
    }

    // Lines in a row that start with ">" are one quote.
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) quote.push(lines[i++].trim().replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", text: quote.join(" ") });
      continue;
    }

    // A list runs while lines keep the same kind of marker. Indented items are kept, but flattened,
    // and the block remembers it so a platform can warn.
    const ordered = NUMBERED.test(line);
    if (ordered || BULLET.test(line)) {
      const marker = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      let nested = false;
      while (i < lines.length && marker.test(lines[i].trim())) {
        if (/^\s{2,}/.test(lines[i])) nested = true;
        items.push(marker.exec(lines[i].trim())![1]);
        i++;
      }
      blocks.push({ kind: "list", ordered, items, nested });
      continue;
    }

    // Like the website, each line of text is its own paragraph.
    blocks.push({ kind: "paragraph", text: line });
    i++;
  }

  return blocks;
}
