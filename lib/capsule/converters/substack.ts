import { escapeHtml } from "@/lib/utils/markdown";
import { attribute } from "@/lib/capsule/engine/inline";
import { convert, tableToList, type PlatformRules } from "@/lib/capsule/engine/render";
import type { Adapter } from "@/lib/capsule/types";

// INTERIM Substack converter on the shared base, so the Publish menu keeps working. Mridul's real one
// (with the "Originally published at" line and the equation list) replaces the rules below; it only
// needs to keep exporting `substack`.

const rules: PlatformRules = {
  keepImageStyle: false,

  // Substack's title and subtitle are separate fields (the side panel copies them), so no `top`.
  heading(block, h) {
    // The post title is Substack's only h1, so a top-level heading in the story becomes h2.
    const level = Math.min(Math.max(block.level, 2), 6);
    return `<h${level}>${h.inline(block.text)}</h${level}>`;
  },

  code(block) {
    // Keeping the language lets Substack highlight the block (to be confirmed by the paste tests).
    const language = block.language ? ` class="language-${block.language}"` : "";
    return `<pre><code${language}>${escapeHtml(block.text)}</code></pre>`;
  },

  table(block, h) {
    h.warn("table-as-list", "Substack cannot show pasted tables, so each table row was turned into a list item.");
    return tableToList(block, h);
  },

  math(block, h) {
    h.warn("math-plain", "Equations were left as plain LaTeX text. Add them with Substack's LaTeX block after pasting.");
    return `<pre>${escapeHtml(block.tex)}</pre>`;
  },

  embed(block) {
    return `<p><a href="${attribute(escapeHtml(block.url))}">${escapeHtml(block.url)}</a></p>`;
  },

  footnoteRef(n) {
    return `<sup>${n}</sup>`;
  },

  footnotes(notes) {
    return `<h4>Notes</h4><ol>${notes.map((note) => `<li>${note}</li>`).join("")}</ol>`;
  },
};

export const substack: Adapter = {
  platform: "substack",
  transform: (draft) => convert(draft, rules),
};
