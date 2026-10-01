import { format } from "date-fns";
import type { IdeaPanelData } from "@/components/content-board/types";

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
