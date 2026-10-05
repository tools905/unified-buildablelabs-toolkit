import { getAppUrl } from "@/lib/utils/app-url";

const DEFAULT_POST_PATH = "/times/{slug}";

// Where a Times issue lives on the website. The UTM tags let the website tell newsletter
// readers apart, so it stops asking them to subscribe.
export function issueUrl(slug: string) {
  const site = (process.env.NEWSLETTER_SITE_URL?.trim() || getAppUrl()).replace(/\/$/, "");
  const path = (process.env.NEWSLETTER_POST_PATH?.trim() || DEFAULT_POST_PATH).replace("{slug}", encodeURIComponent(slug));
  const tags = new URLSearchParams({ utm_source: "newsletter", utm_medium: "email", utm_campaign: slug });
  return `${site}${path}?${tags}`;
}

// Turns one line of the editor's Markdown into plain text: images dropped, links reduced to their
// words, emphasis markers removed.
function plainText(line: string) {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// The opening of an issue for the teaser email: its first paragraphs, up to about `maxWords`
// words, as plain text. Quotes, lists and pictures are skipped; a cut paragraph ends with "…".
export function issueExcerpt(body: string, maxWords = 60) {
  const paragraphs: string[] = [];
  let remaining = maxWords;

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith(">") || line.startsWith("- ") || line.startsWith("#") || /^\d+\.\s/.test(line)) continue;
    const text = plainText(line);
    if (!text) continue;

    const words = text.split(" ");
    if (words.length <= remaining) {
      paragraphs.push(text);
      remaining -= words.length;
    } else {
      paragraphs.push(`${words.slice(0, remaining).join(" ").replace(/[,;:.!?-]+$/, "")}…`);
      remaining = 0;
    }
    if (remaining === 0) break;
  }

  return paragraphs;
}
