import { escapeHtml } from "@/lib/utils/markdown";
import { splitImageSettings, storyImageStyle } from "@/lib/utils/newsletter-story-image";

// What inline rendering needs from the converter that is running it.
export type InlineContext = {
  warn(code: string, message: string): void;
  // HTML for a footnote reference like [^1]; each platform decides how references look.
  footnoteRef(id: string): string;
  // The website stores image size and alignment in the address; platforms that ignore styles drop it.
  keepImageStyle: boolean;
};

const SAFE_LINK = /^(https?:|mailto:)/i;

// Quotes are the only thing escapeHtml leaves alone that can end an attribute early.
export function attribute(value: string) {
  return value.replace(/"/g, "&quot;");
}

export function isPublicImageUrl(url: string) {
  return /^https:\/\//i.test(url.trim());
}

export function imageTag(alt: string, src: string, ctx: InlineContext) {
  const { url, size, align } = splitImageSettings(src);
  if (!isPublicImageUrl(url)) {
    ctx.warn(
      "image-not-public",
      "An image is not at a public https address, so it will not come across when you paste. Upload it from the editor instead.",
    );
  }
  const style = ctx.keepImageStyle ? ` style="${storyImageStyle(size, align)}"` : "";
  return `<img alt="${attribute(alt)}" src="${attribute(url)}"${style} />`;
}

// Turns one line of Markdown into HTML. Text is escaped first. Links and images are swapped for
// placeholders before bold/italic run, so an underscore inside an address never becomes <em>.
export function renderInline(text: string, ctx: InlineContext): string {
  return text
    .split(/(`[^`]+`)/g)
    .map((part, index) => (index % 2 === 1 ? `<code>${escapeHtml(part.slice(1, -1))}</code>` : formatText(part, ctx)))
    .join("");
}

function formatText(text: string, ctx: InlineContext) {
  const held: string[] = [];
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`;

  // The placeholder character can't appear in real text, so a stray one is dropped first.
  const formatted = escapeHtml(text.replace(/\u0000/g, ""))
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => hold(imageTag(alt, src, ctx)))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
      // Only web and mail links survive. Anything else (javascript:, relative paths) keeps its words.
      if (!SAFE_LINK.test(href)) {
        ctx.warn("link-removed", "A link that is not a full web address was turned into plain text.");
        return label;
      }
      return hold(`<a href="${attribute(href)}">${label}</a>`);
    })
    .replace(/\[\^([^\]\s]+)\]/g, (_m, id: string) => hold(ctx.footnoteRef(id)))
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/(^|[^\w])_([^_]+)_(?!\w)/g, "$1<em>$2</em>")
    .replace(/\*([^*\s][^*]*)\*/g, "<em>$1</em>");

  // A held link can itself hold an image, so keep restoring until nothing is left.
  let html = formatted;
  while (html.includes("\u0000")) html = html.replace(/\u0000(\d+)\u0000/g, (_m, n: string) => held[Number(n)]);
  return html;
}
