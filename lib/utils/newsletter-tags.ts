// Tags for the Medium and Substack copies of a post. Medium allows five per story.
export const MAX_POST_TAGS = 5;
export const MAX_TAG_LENGTH = 25;

// Trims, drops a leading #, collapses spaces, removes blanks and repeats (ignoring case), and keeps
// the first MAX_POST_TAGS. Over-long tags are cut rather than refused.
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length === MAX_POST_TAGS) break;
  }
  return result;
}
