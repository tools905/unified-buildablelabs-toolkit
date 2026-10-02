import type { Draft } from "@/lib/capsule/types";
import type { NewsletterPost } from "@/components/newsletter/types";

// A newsletter post as the capsule engine sees it. The website's one-word "desk" tag isn't part of
// the draft: capsule tags are the separate list the writer fills in for Medium and Substack.
export function toDraft(
  post: Pick<NewsletterPost, "id" | "title" | "deck" | "tags" | "body" | "original_url">,
): Draft {
  return {
    id: post.id,
    title: post.title,
    subtitle: post.deck ?? "",
    tags: post.tags ?? [],
    body: post.body,
    canonicalUrl: post.original_url ?? "",
  };
}
