import { escapeHtml } from "@/lib/utils/markdown";
import { attribute } from "@/lib/capsule/engine/inline";
import { convert, defaultList, tableToList, type PlatformRules, type RenderHelpers } from "@/lib/capsule/engine/render";
import type { Adapter, Draft } from "@/lib/capsule/types";

// Settings the paste tests (docs/CAPSULE_PASTE_RESULTS.md) may change. Edit the values here; the rules
// below do not need to change.
const FIRST_HEADING_LEVEL = 2; // the post title is Substack's only h1, so story headings start at h2
const SMALL_HEADING = "h4"; // used for the "Notes" and "Equations to add" lists at the end
const KEEP_CODE_LANGUAGE = true; // a language class lets Substack highlight the block, if it reads it

// Substack has no setting for the original link, so the story ends with a line that says where the
// post first appeared. Search engines and readers both follow it.
function originalLine(draft: Draft, h: RenderHelpers) {
  const url = draft.canonicalUrl.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    h.warn("canonical-url-invalid", "The original link is not a full web address, so the “Originally published at” line was left out.");
    return "";
  }
  return `<p><em>Originally published at <a href="${attribute(escapeHtml(url))}">${escapeHtml(url)}</a>.</em></p>`;
}

// Substack cannot take an equation from pasted text, so each one is marked where it belongs
// ("[Equation 1]") and written out in a list at the end, ready to copy into Substack's LaTeX block.
function equationList(equations: string[]) {
  if (equations.length === 0) return "";
  const items = equations.map((tex, i) => `<p><strong>Equation ${i + 1}</strong></p><pre>${escapeHtml(tex)}</pre>`);
  return `<${SMALL_HEADING}>Equations to add</${SMALL_HEADING}>${items.join("")}`;
}

// Built fresh for every conversion, because it remembers the equations it has met along the way.
function createRules(): PlatformRules {
  const equations: string[] = [];

  return {
    keepImageStyle: false,

    // Substack's title and subtitle are separate fields (the side panel copies them), so no `top`.
    heading(block, h) {
      const level = Math.min(Math.max(block.level, FIRST_HEADING_LEVEL), 6);
      return `<h${level}>${h.inline(block.text)}</h${level}>`;
    },

    list(block, h) {
      if (block.nested) h.warn("list-flattened", "Indented list items were moved up a level.");
      return defaultList(block, h);
    },

    code(block) {
      const language = KEEP_CODE_LANGUAGE && block.language ? ` class="language-${block.language}"` : "";
      return `<pre><code${language}>${escapeHtml(block.text)}</code></pre>`;
    },

    table(block, h) {
      h.warn("table-as-list", "Substack cannot show pasted tables, so each table row was turned into a list item.");
      return tableToList(block, h);
    },

    math(block, h) {
      equations.push(block.tex);
      h.warn(
        "math-list",
        "Substack cannot paste equations. Each one is marked [Equation 1], [Equation 2]… in the text and written out in a list at the end. Add each with Substack's LaTeX block, then delete the list.",
      );
      return `<p>[Equation ${equations.length}]</p>`;
    },

    embed(block) {
      return `<p><a href="${attribute(escapeHtml(block.url))}">${escapeHtml(block.url)}</a></p>`;
    },

    footnoteRef(n) {
      return `<sup>${n}</sup>`;
    },

    footnotes(notes, h) {
      h.warn("footnotes-converted", "Footnotes cannot be pasted into Substack, so they became small numbers with a Notes list at the end.");
      return `<${SMALL_HEADING}>Notes</${SMALL_HEADING}><ol>${notes.map((note) => `<li>${note}</li>`).join("")}</ol>`;
    },

    // The "Originally published at" line comes before the equation list, so deleting the list after
    // adding the equations means deleting to the end of the post.
    bottom(draft, h) {
      return `${originalLine(draft, h)}${equationList(equations)}`;
    },
  };
}

export const substack: Adapter = {
  platform: "substack",
  transform: (draft) => convert(draft, createRules()),
};
