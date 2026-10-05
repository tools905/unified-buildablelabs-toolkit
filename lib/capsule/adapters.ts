import { escapeHtml, renderNewsletterMarkdown } from "@/lib/utils/markdown";
import type { Adapter, AdapterResult, CapsulePlatform, CapsuleWarning, Draft } from "@/lib/capsule/types";

// PLACEHOLDER converters. They let the preview and the Publish screens work today. The real Medium
// and Substack converters (Ananya's engine) replace `adapters` below; everything else only calls
// `adapters[platform].transform(draft)`, so nothing else changes when they do.

function checks(draft: Draft): CapsuleWarning[] {
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

const medium: Adapter = {
  platform: "medium",
  transform(draft): AdapterResult {
    const body = renderNewsletterMarkdown(draft.body);
    // Medium turns a heading at the very top into the story title, so the title travels inside the html.
    const top = `${draft.title.trim() ? `<h1>${escapeHtml(draft.title)}</h1>` : ""}${
      draft.subtitle.trim() ? `<h2>${escapeHtml(draft.subtitle)}</h2>` : ""
    }`;
    const html = `${top}${body}`;
    const warnings = checks(draft);
    if (/<pre><code class="language-/.test(html)) {
      warnings.push({ code: "code-no-highlight", message: "Medium has no syntax highlighting for code blocks." });
    }
    return { html, warnings };
  },
};

const substack: Adapter = {
  platform: "substack",
  transform(draft): AdapterResult {
    // Substack has separate fields for the title and subtitle, so the html is only the story.
    const html = renderNewsletterMarkdown(draft.body);
    return { html, warnings: checks(draft) };
  },
};

export const adapters: Record<CapsulePlatform, Adapter> = { medium, substack };
