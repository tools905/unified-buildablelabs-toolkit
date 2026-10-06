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

export type LatestActivity = {
  kind: "reviewed" | "comment" | "resolved" | "upload";
  at: string;
  // Who did it, when that is recorded (ticking a comment done is not).
  by: string | null;
};

// The most recent review activity on an idea: marked as reviewed, a review comment added, a comment
// ticked done, or a file uploaded. Orders the Feedback column and labels its cards.
export function latestActivity(input: {
  reviewedAt?: string | null;
  reviewerName?: string | null;
  points?: { createdAt: string; resolvedAt?: string | null; authorName?: string | null }[];
  uploads?: { createdAt: string; uploaderName?: string | null }[];
}): LatestActivity | null {
  const events: LatestActivity[] = [];
  if (input.reviewedAt) events.push({ kind: "reviewed", at: input.reviewedAt, by: input.reviewerName ?? null });
  for (const point of input.points ?? []) {
    events.push({ kind: "comment", at: point.createdAt, by: point.authorName ?? null });
    if (point.resolvedAt) events.push({ kind: "resolved", at: point.resolvedAt, by: null });
  }
  for (const upload of input.uploads ?? []) events.push({ kind: "upload", at: upload.createdAt, by: upload.uploaderName ?? null });
  const valid = events.filter((event) => !Number.isNaN(new Date(event.at).getTime()));
  if (valid.length === 0) return null;
  return valid.reduce((latest, event) => (new Date(event.at).getTime() > new Date(latest.at).getTime() ? event : latest));
}

// "Reviewed by Aditi", "Comment by Mridul", "Comment marked done", "New upload by Ankitha".
export function describeActivity(activity: LatestActivity) {
  const by = activity.by ? ` by ${activity.by}` : "";
  switch (activity.kind) {
    case "reviewed":
      return `Reviewed${by}`;
    case "comment":
      return `Comment${by}`;
    case "resolved":
      return "Comment marked done";
    default:
      return `New upload${by}`;
  }
}

type SortableIdea = {
  status: ContentIdeaStatus;
  created_at: string;
  first_feedback_at?: string | null;
  latest_activity?: LatestActivity | null;
};

const time = (value: string | null | undefined) => (value ? new Date(value).getTime() : Number.POSITIVE_INFINITY);

// The order cards are shown in inside one column. Ideas: the first one added comes first.
// Feedback: the idea with the most recent review activity (reviewed, commented, a comment ticked
// done, a new upload) on top, reviewed or not.
// Other columns keep the order they arrive in (newest first).
export function sortColumnIdeas<T extends SortableIdea>(status: ContentIdeaStatus, ideas: T[]): T[] {
  if (status === "idea") {
    return [...ideas].sort((a, b) => time(a.created_at) - time(b.created_at));
  }
  if (status === "feedback") {
    const lastActive = (idea: T) => {
      const value = idea.latest_activity?.at ?? idea.first_feedback_at ?? idea.created_at;
      const parsed = new Date(value).getTime();
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    return [...ideas].sort((a, b) => lastActive(b) - lastActive(a) || time(b.created_at) - time(a.created_at));
  }
  return ideas;
}

// Uploads more than this far apart count as separate drafts, even from the same person.
export const SAME_DRAFT_MS = 30 * 60 * 1000;

// Splits an idea's uploads (in upload order) into drafts: one draft is one person adding files around
// the same time. Used by the panel to show the drafts and by the server to know which files make up
// the draft being downloaded, so both always agree.
export function groupIntoDrafts<T>(items: T[], who: (item: T) => string, at: (item: T) => string): T[][] {
  const drafts: T[][] = [];
  for (const item of items) {
    const current = drafts[drafts.length - 1];
    const previous = current?.[current.length - 1];
    const sameDraft =
      previous !== undefined &&
      who(previous) === who(item) &&
      Math.abs(new Date(at(item)).getTime() - new Date(at(previous)).getTime()) <= SAME_DRAFT_MS;
    if (sameDraft) current.push(item);
    else drafts.push([item]);
  }
  return drafts;
}
