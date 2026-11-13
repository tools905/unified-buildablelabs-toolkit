import type { ContentIdeaStatus } from "@/lib/db/types";

// Who hears about a comment on a post (a written review point or a Pencil review), and how often
// they're emailed. The notice names who commented and the post, never the comment itself: they open
// Team Connect to read it.

export type CommentKind = "point" | "pencil";

// Whoever added the idea, anyone who uploaded a draft, and its assignees; never the commenter.
export function commentRecipients(input: { createdBy: string | null; uploaders: (string | null)[]; assignees: string[]; actorId: string }) {
  const people = [input.createdBy, ...input.uploaders, ...input.assignees].filter((id): id is string => Boolean(id) && id !== input.actorId);
  return [...new Set(people)];
}

const HOUR_MS = 60 * 60 * 1000;

// An email goes out only if none went to this person about this post since this moment: in Ideas or
// Feedback, an hour ago; in the other columns, when the post moved into its current column.
export function emailAllowedSince(
  idea: { status: ContentIdeaStatus; status_changed_at: string | null; created_at: string },
  now = new Date(),
) {
  if (idea.status === "idea" || idea.status === "feedback") return new Date(now.getTime() - HOUR_MS).toISOString();
  return idea.status_changed_at ?? idea.created_at;
}

export function commentNotice(kind: CommentKind, actorName: string, ideaTitle: string) {
  const title = ideaTitle.trim() || "Untitled";
  const did = kind === "pencil" ? "left a Pencil review on" : "added a review point on";
  return {
    bellTitle: kind === "pencil" ? "New Pencil review on your post" : "New review point on your post",
    bellMessage: `${actorName} ${did} “${title}”. Open the post to see it.`,
    subject: `${actorName} commented on your post “${title}”`,
    line: `${actorName} ${did} your post “${title}”.`,
  };
}
