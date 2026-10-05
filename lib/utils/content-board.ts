import type { ContentIdeaStatus } from "@/lib/db/types";

export const CONTENT_BUCKET = "content-attachments";
export const MAX_ATTACHMENTS_PER_IDEA = 12;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export const MAX_REFERENCE_LINKS = 10;

// How many people one idea can be assigned to.
export const MAX_ASSIGNEES = 10;

type MemberRow = {
  user_id: string;
  profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
};

// The workspace's members as the simple {id, label} list the board's pickers and filters use.
export function toMemberOptions(rows: MemberRow[]) {
  return rows.map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { id: row.user_id, label: profile?.full_name || profile?.email || "Unknown", email: profile?.email };
  });
}

// The people most ideas are assigned to. They are listed first, in this order, in the assign list;
// everyone else follows alphabetically. Matched by email, so a changed display name doesn't matter.
export const FREQUENT_ASSIGNEE_EMAILS = [
  "ananya@buildablelabs.com",
  "ankitha@buildablelabs.com",
  "pavan@buildablelabs.com",
  "mridul@buildablelabs.com",
];

export function orderAssignees<T extends { label: string; email?: string }>(people: T[]) {
  const rank = (person: T) => FREQUENT_ASSIGNEE_EMAILS.indexOf((person.email ?? "").toLowerCase());
  const frequent = people.filter((person) => rank(person) !== -1).sort((a, b) => rank(a) - rank(b));
  const others = people
    .filter((person) => rank(person) === -1)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return { frequent, others };
}

// Which people are new and which were taken off when the list of assignees changes.
export function diffAssignees(current: string[], next: string[]) {
  const before = new Set(current);
  const after = new Set(next);
  return {
    add: [...after].filter((id) => !before.has(id)),
    remove: [...before].filter((id) => !after.has(id)),
  };
}

// The most any platform here allows in a caption (LinkedIn). Instagram's own limit is lower and is
// checked by the post preview.
export const MAX_CAPTION_LENGTH = 3000;

// Matches the database check on content_idea_review_points.body.
export const MIN_REVIEW_POINT_LENGTH = 2;
export const MAX_REVIEW_POINT_LENGTH = 3000;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

// A cheap check that can run before anything is uploaded (or before an idea is created).
export function checkAttachmentFile(file: { type: string; size: number }): string | null {
  const isPdf = file.type === "application/pdf";
  if (!isPdf && !IMAGE_TYPES.includes(file.type)) return "Use PNG, JPG, WebP or PDF files.";
  if (isPdf && file.size > MAX_ATTACHMENT_BYTES) return "PDFs can be up to 15 MB.";
  return null;
}

// Who may move an idea from one column to another.
//  - Ideas → Feedback happens by itself when the first review point is added.
//  - Ideas or Feedback → Shortlisted is an admin's call ("satisfied with the changes"). Open review
//    points are pointed out but don't stop an admin who is satisfied anyway.
//  - Shortlisted → In Progress → Posted is done by the people assigned to post it.
//  - Admins can move any card anywhere (dragging is their override).
// Assignees may also take one step back, to undo a click made by mistake.
export function canMoveIdea(input: {
  from: ContentIdeaStatus;
  to: ContentIdeaStatus;
  isAdmin: boolean;
  isAssignee: boolean;
}) {
  if (input.from === input.to) return false;
  if (input.isAdmin) return true;
  if (!input.isAssignee) return false;
  const assigneeMoves: Partial<Record<ContentIdeaStatus, ContentIdeaStatus[]>> = {
    approved: ["in_progress"],
    in_progress: ["posted", "approved"],
    posted: ["in_progress"],
  };
  return assigneeMoves[input.from]?.includes(input.to) ?? false;
}

// The one step forward a person can take on an idea from where it is now, if any.
export type NextStep =
  // `note` is a reminder shown next to the button; it never stops the move.
  | { kind: "move"; to: ContentIdeaStatus; label: string; note?: string }
  | { kind: "blocked"; label: string; reason: string }
  | { kind: "wait"; reason: string }
  | null;

export function nextStep(input: {
  status: ContentIdeaStatus;
  isAdmin: boolean;
  isAssignee: boolean;
  hasAssignees: boolean;
  openReviewCount: number;
}): NextStep {
  const { status, isAdmin, isAssignee, hasAssignees, openReviewCount } = input;
  switch (status) {
    case "idea":
      return isAdmin
        ? { kind: "move", to: "approved", label: "Shortlist" }
        : { kind: "wait", reason: "Add a review point to send it to Feedback." };
    case "feedback":
      if (!isAdmin) return { kind: "wait", reason: "An admin shortlists it once the review points are fixed." };
      return openReviewCount > 0
        ? {
            kind: "move",
            to: "approved",
            label: "Shortlist",
            note: `${openReviewCount} review ${openReviewCount === 1 ? "point is" : "points are"} still open. You can shortlist anyway.`,
          }
        : { kind: "move", to: "approved", label: "Shortlist" };
    case "approved":
      if (isAssignee || isAdmin) {
        if (!hasAssignees && isAdmin) {
          return { kind: "blocked", label: "Start working", reason: "Assign someone to post it first." };
        }
        return { kind: "move", to: "in_progress", label: "Start working" };
      }
      return { kind: "wait", reason: hasAssignees ? "Waiting for the assigned people to start." : "Waiting for an admin to assign it." };
    case "in_progress":
      return isAssignee || isAdmin
        ? { kind: "move", to: "posted", label: "Mark as posted" }
        : { kind: "wait", reason: "The assigned people mark it posted once it is live." };
    default:
      return null;
  }
}

type SortableIdea = {
  status: ContentIdeaStatus;
  created_at: string;
  first_feedback_at?: string | null;
  reviewed_at?: string | null;
};

const time = (value: string | null | undefined) => (value ? new Date(value).getTime() : Number.POSITIVE_INFINITY);

// The order cards are shown in inside one column. Ideas: the first one added comes first.
// Feedback: ideas marked as reviewed come first, in the order they were reviewed (the first one
// reviewed on top); the ones not reviewed yet follow, the one that got feedback earliest first.
// Other columns keep the order they arrive in (newest first).
export function sortColumnIdeas<T extends SortableIdea>(status: ContentIdeaStatus, ideas: T[]): T[] {
  if (status === "idea") {
    return [...ideas].sort((a, b) => time(a.created_at) - time(b.created_at));
  }
  if (status === "feedback") {
    return [...ideas].sort((a, b) => {
      const aReviewed = Boolean(a.reviewed_at);
      const bReviewed = Boolean(b.reviewed_at);
      if (aReviewed !== bReviewed) return aReviewed ? -1 : 1;
      if (aReviewed && bReviewed) return time(a.reviewed_at) - time(b.reviewed_at) || time(a.created_at) - time(b.created_at);
      return (
        time(a.first_feedback_at ?? a.created_at) - time(b.first_feedback_at ?? b.created_at) ||
        time(a.created_at) - time(b.created_at)
      );
    });
  }
  return ideas;
}
