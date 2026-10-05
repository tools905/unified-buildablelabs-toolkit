import { escapeHtml } from "@/lib/utils/markdown";
import { imageTag, attribute } from "@/lib/capsule/engine/inline";
import { convert, tableToList, type PlatformRules } from "@/lib/capsule/engine/render";
import type { Adapter } from "@/lib/capsule/types";

// Medium's editor has two body heading sizes (the "big T" and "small T"), which it stores as h3 and
// h4. The paste tests (docs/CAPSULE_PASTE_RESULTS.md) decide whether these stay h3/h4; change them here.
const LARGE_HEADING = "h3";
const SMALL_HEADING = "h4";

const rules: PlatformRules = {
  // Medium throws away inline styles on paste, so image size and alignment are not sent.
  keepImageStyle: false,

  // A heading at the very top of a new Medium story becomes its title, and the line under it the subtitle.
  top(draft) {
    const title = draft.title.trim() ? `<h1>${escapeHtml(draft.title)}</h1>` : "";
    const subtitle = draft.subtitle.trim() ? `<h2>${escapeHtml(draft.subtitle)}</h2>` : "";
    return `${title}${subtitle}`;
  },

  heading(block, h) {
    if (block.level >= 4) {
      h.warn("heading-flattened", "Medium has only two heading sizes, so smaller headings were made the small size.");
    }
    const tag = block.level <= 2 ? LARGE_HEADING : SMALL_HEADING;
    return `<${tag}>${h.inline(block.text)}</${tag}>`;
  },

  list(block, h) {
    if (block.nested) h.warn("list-flattened", "Medium has no lists inside lists, so indented items were moved up a level.");
    const tag = block.ordered ? "ol" : "ul";
    return `<${tag}>${block.items.map((item) => `<li>${h.inline(item)}</li>`).join("")}</${tag}>`;
  },

  image(block, h) {
    return `<figure>${imageTag(block.alt, block.src, h.ctx)}</figure>`;
  },

  code(block, h) {
    if (block.language) {
      h.warn(
        "code-no-highlight",
        "Medium has no syntax highlighting for code blocks. For coloured code, paste a GitHub Gist link on its own line instead.",
      );
    }
    return `<pre>${escapeHtml(block.text)}</pre>`;
  },

  table(block, h) {
    h.warn("table-as-list", "Medium cannot show tables, so each table row was turned into a list item.");
    return tableToList(block, h);
  },

  math(block, h) {
    h.warn("math-plain", "Medium cannot show equations, so they were left as plain LaTeX text. Check them after pasting.");
    return `<pre>${escapeHtml(block.tex)}</pre>`;
  },

  embed(block, h) {
    h.warn(
      "embed-manual",
      "Medium only turns a link into an embed when you type it yourself. Click at the end of each bare link and press Enter.",
    );
    return `<p><a href="${attribute(escapeHtml(block.url))}">${escapeHtml(block.url)}</a></p>`;
  },

  footnoteRef(n) {
    return `<sup>${n}</sup>`;
  },

  footnotes(notes, h) {
    h.warn("footnotes-converted", "Medium has no footnotes, so they became small numbers with a Notes list at the end.");
    return `<${SMALL_HEADING}>Notes</${SMALL_HEADING}><ol>${notes.map((note) => `<li>${note}</li>`).join("")}</ol>`;
  },
};

export const medium: Adapter = {
  platform: "medium",
  transform: (draft) => convert(draft, rules),
};
