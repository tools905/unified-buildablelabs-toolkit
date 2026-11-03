import { COLUMN_LABELS } from "@/lib/utils/content-board";
import type { ContentIdeaStatus } from "@/lib/db/types";

// Settings → Downloads: what each export is called, how long its file is kept, and the progress of
// a board export while it's being put together.

export const KEEP_DOWNLOADS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DownloadKind = "board_pdf" | "tickets_csv";

const shortDay = (day: string, withYear: boolean) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );

// "1 Nov – 30 Nov 2026", or "28 Dec 2026 – 3 Jan 2027" across years.
export function dayRangeLabel(from: string, to: string) {
  if (from === to) return shortDay(from, true);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${shortDay(from, !sameYear)} – ${shortDay(to, true)}`;
}

// A board export: "Board posts · 1 Nov – 30 Nov 2026" in the list, and a file name that says the same.
export function boardExportNames(from: string, to: string, columns: ContentIdeaStatus[]) {
  const range = dayRangeLabel(from, to);
  const columnNames = columns.map((column) => COLUMN_LABELS[column]).join(", ");
  return {
    name: `Board posts · ${range}`,
    fileName: `BuildableLabs board posts ${range.replace(" – ", " to ")} (${columnNames}).pdf`,
  };
}

// The tickets list: "Tickets · 4 Nov 2026, 2:14 pm".
export function ticketsCsvNames(now = new Date()) {
  const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
    .format(now)
    .replace(/\b(am|pm)\b/i, (match) => match.toLowerCase());
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  return { name: `Tickets · ${when}`, fileName: `BuildableLabs tickets ${day}.csv` };
}

// "Expires in 30 days" for a new file, "Expires today" in its last day, or null once it's gone.
export function expiryLabel(expiresAt: string, now = new Date()) {
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (left <= 0) return null;
  if (left < DAY_MS) return "Expires today";
  const days = Math.ceil(left / DAY_MS);
  return `Expires in ${days} days`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// What the server sends, one line each, while it builds a board export.
export type ExportEvent =
  | { type: "start"; posts: { title: string; weight: number }[] }
  | { type: "post"; index: number }
  | { type: "saving" }
  | { type: "uploading" }
  | { type: "done"; url: string; id: string | null; name: string; fileName: string; sizeBytes: number; pages: number }
  | { type: "error"; message: string };

// Putting pages in is most of the work; saving and uploading the file are the last stretch. Each post
// counts by its pages (its cover plus its draft), so a 12-page carousel moves the bar more than a
// single image.
const BUILD_SHARE = 0.9;
export function exportPercent(state: { weights: number[]; done: number; stage: "build" | "saving" | "uploading" | "done" }) {
  if (state.stage === "done") return 100;
  if (state.stage === "uploading") return 96;
  if (state.stage === "saving") return 92;
  const total = state.weights.reduce((sum, weight) => sum + weight, 0);
  if (!total) return 0;
  const done = state.weights.slice(0, state.done).reduce((sum, weight) => sum + weight, 0);
  return Math.floor((done / total) * BUILD_SHARE * 100);
}

// "About 20 seconds left", from how long the done part took. Nothing until there's enough to go on.
export function timeLeftLabel(elapsedMs: number, percent: number) {
  if (percent < 5 || percent >= 100) return null;
  const left = (elapsedMs / percent) * (100 - percent);
  const seconds = Math.max(1, Math.round(left / 1000));
  if (seconds < 10) return "A few seconds left";
  if (seconds < 60) return `About ${Math.round(seconds / 5) * 5} seconds left`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "About a minute left" : `About ${minutes} minutes left`;
}
