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
