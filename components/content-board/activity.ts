import { format } from "date-fns";
import type { IdeaPanelData, PanelAttachment } from "@/components/content-board/types";
import type { ContentIdeaStatus } from "@/lib/db/types";
import { groupIntoDrafts } from "@/lib/utils/content-board";

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

// "Mridul", or "Mridul through <app>" when the file came through a connected app instead of the board.
export function uploaderLabel(name: string, via: string | null) {
  return via ? `${name} through ${via}` : name;
}

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
      label: `${what} uploaded by ${uploaderLabel(item.uploaderName, item.uploadedVia)}`,
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

export type UploadGroup = {
  key: string;
  // 1 for the first draft uploaded, counting up.
  number: number;
  uploaderName: string;
  // The app the whole draft came through; null when it was added on the board or the files differ.
  uploadedVia: string | null;
  at: string;
  // Each file with its position in the full list (what the viewer shows when it is picked).
  items: { attachment: PanelAttachment; index: number }[];
};

// The idea's files split into drafts, oldest first: one draft is one person adding files around the
// same time (see groupIntoDrafts). Shows who uploaded first, who added what after them, and which
// draft is the latest.
export function groupUploads(attachments: PanelAttachment[]): UploadGroup[] {
  const drafts = groupIntoDrafts(
    attachments.map((attachment, index) => ({ attachment, index })),
    (item) => item.attachment.uploaderName,
    (item) => item.attachment.createdAt,
  );
  return drafts.map((items, position) => {
    const via = items[0].attachment.uploadedVia;
    return {
      key: items[0].attachment.id,
      number: position + 1,
      uploaderName: items[0].attachment.uploaderName,
      uploadedVia: items.every((item) => item.attachment.uploadedVia === via) ? via : null,
      at: items[0].attachment.createdAt,
      items,
    };
  });
}

// The draft a file belongs to.
export function draftOf(groups: UploadGroup[], index: number): UploadGroup | null {
  return groups.find((group) => group.items.some((item) => item.index === index)) ?? null;
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
