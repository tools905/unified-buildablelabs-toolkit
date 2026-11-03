import type { ContentIdeaStatus } from "@/lib/db/types";

// Exporting posts from the board as one PDF: which posts go in, in what order, and text made safe for
// the PDF's built-in font. Shared by the Export dialog (to count) and the server (to build).

export const EXPORT_COLUMNS: ContentIdeaStatus[] = ["idea", "feedback", "approved", "in_progress", "posted"];
export const DEFAULT_EXPORT_COLUMNS: ContentIdeaStatus[] = ["approved", "in_progress", "posted"];
// A busy month of posts (about 0.6 MB each); more would pass storage's 50 MB file limit.
export const MAX_EXPORT_POSTS = 75;

type ExportableIdea = {
  status: ContentIdeaStatus;
  scheduled_for: string | null;
  posted_at?: string | null;
  title: string;
};

const indiaDay = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(value));

// The day a post goes (or went) out: its posting day on the calendar, or for a posted idea without
// one, the day it was marked posted. Ideas without a day are not exported.
export function postingDay(idea: Pick<ExportableIdea, "status" | "scheduled_for" | "posted_at">) {
  if (idea.scheduled_for) return idea.scheduled_for.slice(0, 10);
  if (idea.status === "posted" && idea.posted_at) return indiaDay(idea.posted_at);
  return null;
}

// The posts to export: in the chosen columns, with a posting day from `from` to `to` (inclusive),
// earliest day first.
export function selectForExport<T extends ExportableIdea>(ideas: T[], range: { from: string; to: string }, columns: ContentIdeaStatus[]) {
  return ideas
    .map((idea) => ({ idea, day: postingDay(idea) }))
    .filter((item): item is { idea: T; day: string } => item.day !== null && columns.includes(item.idea.status) && item.day >= range.from && item.day <= range.to)
    .sort((a, b) => a.day.localeCompare(b.day) || a.idea.title.localeCompare(b.idea.title));
}

// The PDF's built-in font only has Western European letters: curly quotes and dashes become plain
// ones, accents stay when they can, and anything else (emoji, other scripts) is left out.
export function pdfSafeText(text: string | null | undefined) {
  return (text ?? "")
    .replace(/[\u2018\u2019\u201A\u2032\u02BC\u00B4]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/\r/g, "")
    .replace(/[^\n\x20-\x7E -ÿ]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}
