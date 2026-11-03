"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContentIdeaWithRelations } from "@/components/content-board/types";
import { DEFAULT_EXPORT_COLUMNS, EXPORT_COLUMNS, MAX_EXPORT_POSTS, selectForExport } from "@/lib/utils/board-export";
import { COLUMN_LABELS } from "@/lib/utils/content-board";
import { BASE_PATH } from "@/lib/utils/app-url";
import type { ContentIdeaStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";

const pad = (value: number) => String(value).padStart(2, "0");
// A month as first and last day, `offset` months from this one (India time).
function monthRange(offset: number) {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const last = new Date(Date.UTC(year, month + offset, 0));
  const day = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return { from: day(first), to: day(last) };
}

// The board's Export button: pick the dates (by posting day) and the columns, see how many posts that
// is, and download them all as one PDF.
export function ExportDialog({ ideas }: { ideas: ContentIdeaWithRelations[] }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(() => monthRange(0));
  const [columns, setColumns] = useState<ContentIdeaStatus[]>(DEFAULT_EXPORT_COLUMNS);
  const [started, setStarted] = useState(false);

  const valid = Boolean(range.from && range.to && range.from <= range.to && columns.length);
  const count = valid ? selectForExport(ideas, range, columns).length : 0;
  const tooMany = count > MAX_EXPORT_POSTS;
  const href = `${BASE_PATH}/api/content-board/export?${new URLSearchParams({ from: range.from, to: range.to, columns: columns.join(",") })}`;

  const preset = (label: string, offset: number) => {
    const value = monthRange(offset);
    const on = value.from === range.from && value.to === range.to;
    return (
      <button
        type="button"
        onClick={() => setRange(value)}
        className={cn(
          "rounded-full border px-3 py-1.5 text-xs font-medium",
          on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <>
      <Button type="button" variant="outline" className="gap-2" onClick={() => { setOpen(true); setStarted(false); }}>
        <Download className="h-4 w-4" />
        Export
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            className="popover-shadow w-full rounded-t-lg border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-lg"
          >
            <h2 id="export-title" className="text-base font-semibold">
              Export posts as PDF
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One file: a contents page, then each post&apos;s cover (title, day, platforms, caption) and its latest draft.
              Posts are picked by their posting day on the calendar.
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {preset("Last month", -1)}
              {preset("This month", 0)}
              {preset("Next month", 1)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">
                From
                <Input type="date" value={range.from} onChange={(event) => setRange((value) => ({ ...value, from: event.target.value }))} className="mt-1" />
              </label>
              <label className="text-xs text-muted-foreground">
                To
                <Input type="date" value={range.to} onChange={(event) => setRange((value) => ({ ...value, to: event.target.value }))} className="mt-1" />
              </label>
            </div>

            <fieldset className="mt-4">
              <legend className="mb-1.5 text-xs text-muted-foreground">Columns</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {EXPORT_COLUMNS.map((column) => (
                  <label key={column} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columns.includes(column)}
                      onChange={(event) =>
                        setColumns((current) =>
                          event.target.checked ? EXPORT_COLUMNS.filter((item) => item === column || current.includes(item)) : current.filter((item) => item !== column),
                        )
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    {COLUMN_LABELS[column]}
                  </label>
                ))}
              </div>
            </fieldset>

            <p className={cn("mt-4 text-sm", tooMany || (valid && count === 0) ? "text-destructive" : "text-muted-foreground")}>
              {!valid
                ? "Pick a start and end date (start first) and at least one column."
                : count === 0
                  ? "No posts with a posting day in these dates and columns."
                  : tooMany
                    ? `${count} posts: export up to ${MAX_EXPORT_POSTS} at a time. Pick fewer dates.`
                    : `${count} ${count === 1 ? "post" : "posts"} will be exported.`}
            </p>
            {started ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Putting the PDF together. The download starts by itself; many posts can take up to a minute.
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              {valid && count > 0 && !tooMany ? (
                // A plain link: the server answers with the file, which every browser can save.
                <Button asChild>
                  <a href={href} rel="noopener" onClick={() => setStarted(true)}>
                    <Download className="h-4 w-4" />
                    Export PDF
                  </a>
                </Button>
              ) : (
                <Button type="button" disabled>
                  <Download className="h-4 w-4" />
                  Export PDF
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
