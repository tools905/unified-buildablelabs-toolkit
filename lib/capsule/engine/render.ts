import { escapeHtml } from "@/lib/utils/markdown";
import { parseBlocks, type Block } from "@/lib/capsule/engine/parse";
import { imageTag, renderInline, type InlineContext } from "@/lib/capsule/engine/inline";
import type { AdapterResult, CapsuleWarning, Draft } from "@/lib/capsule/types";

// The shared base both converters stand on. A converter is a `PlatformRules` object: it says how the
// blocks a platform treats differently should look, and `convert` does the rest (parsing, inline
// formatting, footnote numbering, the common checks, collecting warnings once per code).

type BlockOf<K extends Block["kind"]> = Extract<Block, { kind: K }>;

export type RenderHelpers = {
  // Escaped, formatted HTML for one piece of Markdown text.
  inline(text: string): string;
  warn(code: string, message: string): void;
  ctx: InlineContext;
};

export type PlatformRules = {
  keepImageStyle: boolean;
  heading(block: BlockOf<"heading">, h: RenderHelpers): string;
  code(block: BlockOf<"code">, h: RenderHelpers): string;
  table(block: BlockOf<"table">, h: RenderHelpers): string;
  math(block: BlockOf<"math">, h: RenderHelpers): string;
  embed(block: BlockOf<"embed">, h: RenderHelpers): string;
  // The footnote reference for note number n, and the notes list at the end (HTML in number order).
  footnoteRef(n: number): string;
  footnotes(notes: string[], h: RenderHelpers): string;
  // Optional overrides; the defaults below fit both platforms.
  list?(block: BlockOf<"list">, h: RenderHelpers): string;
  image?(block: BlockOf<"image">, h: RenderHelpers): string;
  // Put before and after the story, e.g. the Medium title or an "Originally published at" line.
  top?(draft: Draft, h: RenderHelpers): string;
  bottom?(draft: Draft, h: RenderHelpers): string;
};

// Checks that do not depend on the platform.
export function baseChecks(draft: Draft): CapsuleWarning[] {
  const warnings: CapsuleWarning[] = [];
  if (!draft.title.trim()) warnings.push({ code: "title-missing", message: "This post has no headline yet." });
  if (!draft.body.trim()) warnings.push({ code: "body-empty", message: "The story is empty." });
  if (!draft.canonicalUrl.trim()) {
    warnings.push({
      code: "no-canonical-url",
      message: "No original link is set. Add it so search engines know which copy is the original.",
    });
  }
  if (draft.tags.length === 0) warnings.push({ code: "no-tags", message: "No tags yet. You will have to think of them on the platform." });
  return warnings;
}

// Neither platform can show a table, so each row becomes a list item: "Header: value; Header: value".
export function tableToList(block: BlockOf<"table">, h: RenderHelpers) {
  const row = (cells: string[]) =>
    cells
      .map((cell, i) => (block.header[i] ? `<strong>${h.inline(block.header[i])}</strong>: ${h.inline(cell)}` : h.inline(cell)))
      .join("; ");
  const items = block.rows.length > 0 ? block.rows.map(row) : [block.header.map((cell) => h.inline(cell)).join("; ")];
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

export function defaultList(block: BlockOf<"list">, h: RenderHelpers) {
  const tag = block.ordered ? "ol" : "ul";
  return `<${tag}>${block.items.map((item) => `<li>${h.inline(item)}</li>`).join("")}</${tag}>`;
}

export function convert(draft: Draft, rules: PlatformRules): AdapterResult {
  const warnings = new Map<string, CapsuleWarning>();
  const warn = (code: string, message: string) => {
    if (!warnings.has(code)) warnings.set(code, { code, message });
  };
  for (const warning of baseChecks(draft)) warn(warning.code, warning.message);

  const blocks = parseBlocks(draft.body);
  const notes = new Map<string, string>();
  for (const block of blocks) if (block.kind === "footnote") notes.set(block.id, block.text);

  // Notes are numbered in the order the story first mentions them.
  const order: string[] = [];
  const ctx: InlineContext = {
    warn,
    keepImageStyle: rules.keepImageStyle,
    footnoteRef(id) {
      if (!notes.has(id)) return `[^${escapeHtml(id)}]`;
      if (!order.includes(id)) order.push(id);
      return rules.footnoteRef(order.indexOf(id) + 1);
    },
  };
  const h: RenderHelpers = { inline: (text) => renderInline(text, ctx), warn, ctx };

  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
        parts.push(rules.heading(block, h));
        break;
      case "paragraph":
        parts.push(`<p>${h.inline(block.text)}</p>`);
        break;
      case "list":
        parts.push((rules.list ?? defaultList)(block, h));
        break;
      case "quote":
        parts.push(`<blockquote>${h.inline(block.text)}</blockquote>`);
        break;
      case "code":
        parts.push(rules.code(block, h));
        break;
      case "image":
        parts.push(rules.image ? rules.image(block, h) : imageTag(block.alt, block.src, ctx));
        break;
      case "hr":
        parts.push("<hr />");
        break;
      case "table":
        parts.push(rules.table(block, h));
        break;
      case "math":
        parts.push(rules.math(block, h));
        break;
      case "embed":
        parts.push(rules.embed(block, h));
        break;
      case "footnote":
        break; // collected above, listed at the end
    }
  }

  // Notes nobody referred to still get listed, after the ones that were.
  for (const id of notes.keys()) if (!order.includes(id)) order.push(id);
  if (order.length > 0) parts.push(rules.footnotes(order.map((id) => h.inline(notes.get(id)!)), h));

  const bottom = rules.bottom?.(draft, h);
  if (bottom) parts.push(bottom);

  const html = `${rules.top?.(draft, h) ?? ""}${parts.join("\n")}`;
  return { html, warnings: [...warnings.values()] };
}
