import { format } from "date-fns";
import type { IdeaPanelData, PanelAttachment } from "@/components/content-board/types";
import type { ContentIdeaStatus } from "@/lib/db/types";

// "30 Sep 2026, 5:12 pm" in the viewer's own time zone.
export function formatWhen(value: string | Date) {
  return format(typeof value === "string" ? new Date(value) : value, "d MMM yyyy, h:mm a").replace(/ (AM|PM)$/, (m) => m.toLowerCase());
}

export type ActivityEvent = {
  id: string;
  at: string;
  label: string;
  detail?: string;
};

function clip(text: string, max = 80) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Everything that happened to an idea, newest first, built from data the panel already has.
export function buildActivity(data: IdeaPanelData): ActivityEvent[] {
  const events: ActivityEvent[] = [
    { id: "created", at: data.history.createdAt, label: `Idea created by ${data.history.creatorName}` },
  ];

  for (const item of data.attachments) {
    const what = item.kind === "link" ? "Design link" : item.kind === "pdf" ? "PDF" : "Image";
    events.push({
      id: `file-${item.id}`,
      at: item.createdAt,
      label: `${what} uploaded by ${item.uploaderName}`,
      detail: item.kind === "link" ? undefined : (item.fileName ?? undefined),
    });
  }

  if (data.history.reviewedAt) {
    events.push({
      id: "reviewed",
      at: data.history.reviewedAt,
      label: `Marked as reviewed by ${data.history.reviewerName ?? "Unknown"}`,
    });
  }

  for (const point of data.points) {
    events.push({
      id: `comment-${point.id}`,
      at: point.createdAt,
      label: `Comment added by ${point.authorName}`,
      detail: clip(point.body),
    });
    if (point.isResolved && point.resolvedAt) {
      events.push({ id: `done-${point.id}`, at: point.resolvedAt, label: "Comment marked done", detail: clip(point.body) });
    }
  }

  if (data.history.postedAt) {
    events.push({ id: "posted", at: data.history.postedAt, label: "Moved to Posted" });
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

// True when a file was added after the idea was last marked as reviewed.
export function hasChangesSinceReview(data: IdeaPanelData) {
  const reviewedAt = data.history.reviewedAt ? new Date(data.history.reviewedAt).getTime() : null;
  if (reviewedAt === null) return false;
  return data.attachments.some((item) => new Date(item.createdAt).getTime() > reviewedAt);
}

// Uploads more than this far apart count as separate rounds, even from the same person.
const SAME_UPLOAD_MS = 30 * 60 * 1000;

export type UploadGroup = {
  key: string;
  uploaderName: string;
  at: string;
  // Each file with its position in the full list (what the viewer shows when it is picked).
  items: { attachment: PanelAttachment; index: number }[];
};

// The idea's files split into rounds of uploading, in the order they happened: one round is one
// person adding files around the same time. Shows at a glance who uploaded first, who added what
// after them, and which round is the latest.
export function groupUploads(attachments: PanelAttachment[]): UploadGroup[] {
  const groups: UploadGroup[] = [];
  attachments.forEach((attachment, index) => {
    const last = groups[groups.length - 1];
    const previous = last?.items[last.items.length - 1]?.attachment;
    const sameRound =
      last &&
      previous &&
      last.uploaderName === attachment.uploaderName &&
      Math.abs(new Date(attachment.createdAt).getTime() - new Date(previous.createdAt).getTime()) <= SAME_UPLOAD_MS;
    if (sameRound) last.items.push({ attachment, index });
    else groups.push({ key: attachment.id, uploaderName: attachment.uploaderName, at: attachment.createdAt, items: [{ attachment, index }] });
  });
  return groups;
}

// "8 images", "1 PDF", "2 images · 1 design link".
export function describeUploads(items: { attachment: PanelAttachment }[]) {
  const count = (kind: PanelAttachment["kind"]) => items.filter((item) => item.attachment.kind === kind).length;
  const parts: string[] = [];
  const images = count("image");
  const pdfs = count("pdf");
  const links = count("link");
  if (images) parts.push(`${images} ${images === 1 ? "image" : "images"}`);
  if (pdfs) parts.push(`${pdfs} ${pdfs === 1 ? "PDF" : "PDFs"}`);
  if (links) parts.push(`${links} design ${links === 1 ? "link" : "links"}`);
  return parts.join(" · ");
}

// How the latest activity is highlighted: red while reviewed work is still waiting in Feedback,
// green once the idea has been shortlisted (or gone further). Nothing before any review.
export function activityTone(status: ContentIdeaStatus, reviewPointCount: number): "waiting" | "shortlisted" | null {
  if (status === "feedback" && reviewPointCount > 0) return "waiting";
  if (status === "approved" || status === "in_progress" || status === "posted") return "shortlisted";
  return null;
}
