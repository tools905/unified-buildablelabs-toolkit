// What a newsletter version keeps: everything a reader sees, nothing about publishing state.
export const NEWSLETTER_CONTENT_FIELDS = [
  "title",
  "deck",
  "tag",
  "body",
  "author_ids",
  "cover_image_url",
  "cover_brightness",
  "cover_focus_x",
  "cover_focus_y",
  "cover_zoom",
  "cover_fade",
] as const;

export type NewsletterContent = {
  title: string;
  deck: string | null;
  tag: string | null;
  body: string;
  author_ids: string[];
  cover_image_url: string | null;
  cover_brightness: number | null;
  cover_focus_x: number;
  cover_focus_y: number;
  cover_zoom: number;
  cover_fade: "lighter" | "darker" | null;
};

export type NewsletterVersionKind = "session" | "published";

// Saves closer together than this, by the same person, count as one editing session.
export const NEWSLETTER_SESSION_GAP_MS = 10 * 60 * 1000;

export function pickNewsletterContent(source: Record<string, unknown>): NewsletterContent {
  return {
    title: String(source.title ?? ""),
    deck: (source.deck as string | null) || null,
    tag: (source.tag as string | null) || null,
    body: String(source.body ?? ""),
    author_ids: [...((source.author_ids as string[] | null) ?? [])],
    cover_image_url: (source.cover_image_url as string | null) ?? null,
    cover_brightness: (source.cover_brightness as number | null) ?? null,
    cover_focus_x: Number(source.cover_focus_x ?? 50),
    cover_focus_y: Number(source.cover_focus_y ?? 50),
    // Postgres numeric comes back as a string.
    cover_zoom: Number(source.cover_zoom ?? 1),
    cover_fade: (source.cover_fade as "lighter" | "darker" | null) ?? null,
  };
}

export function sameNewsletterContent(a: NewsletterContent, b: NewsletterContent) {
  return NEWSLETTER_CONTENT_FIELDS.every((field) =>
    field === "author_ids"
      ? a.author_ids.length === b.author_ids.length && a.author_ids.every((id, i) => id === b.author_ids[i])
      : a[field] === b[field],
  );
}

export function isBlankNewsletterContent(content: NewsletterContent) {
  return !content.title.trim() && !content.deck?.trim() && !content.tag?.trim() && !content.body.trim() && !content.cover_image_url;
}

// A save starts a new session when someone else saved last, or when the post has sat
// untouched for a while. The post as it stood before such a save is worth keeping.
export function startsNewSession(
  post: { updated_at: string; updated_by: string | null },
  actorId: string,
  now = Date.now(),
) {
  if (post.updated_by !== actorId) return true;
  return now - new Date(post.updated_at).getTime() >= NEWSLETTER_SESSION_GAP_MS;
}

// Every file a post's versions still point at, as one string to search for file names.
export function newsletterVersionReferences(versions: { body: string | null; cover_image_url: string | null }[]) {
  return versions.map((version) => `${version.body ?? ""}\n${version.cover_image_url ?? ""}`).join("\n");
}
