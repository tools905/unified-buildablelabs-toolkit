"use client";

import { useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContentIdeaWithRelations } from "@/components/content-board/types";
import { DEFAULT_EXPORT_COLUMNS, EXPORT_COLUMNS, MAX_EXPORT_POSTS, selectForExport } from "@/lib/utils/board-export";
import { COLUMN_LABELS } from "@/lib/utils/content-board";
import { ExportProgress, ExportRing, runPercent } from "@/components/content-board/export-progress";
import { useBoardExport } from "@/components/content-board/use-board-export";
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
// is, and download them all as one PDF, watching it come together. Closed mid-way, a small ring in
// the corner keeps the progress; the finished file is also kept under Settings → Downloads.
export function ExportDialog({ ideas }: { ideas: ContentIdeaWithRelations[] }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(() => monthRange(0));
  const [columns, setColumns] = useState<ContentIdeaStatus[]>(DEFAULT_EXPORT_COLUMNS);
  const { run, start, reset } = useBoardExport();

  const valid = Boolean(range.from && range.to && range.from <= range.to && columns.length);
  const count = valid ? selectForExport(ideas, range, columns).length : 0;
  const tooMany = count > MAX_EXPORT_POSTS;
  const percent = runPercent(run);

  function openDialog() {
    // A finished or failed export makes way for a new one; a running one is shown as it goes.
    if (run.status === "done" || run.status === "error") reset();
    setOpen(true);
  }

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
      <Button type="button" variant="outline" className="gap-2" onClick={openDialog}>
        <Download className="h-4 w-4" />
        Export
      </Button>
      {!open && (run.status === "running" || run.status === "done") ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="popover-shadow fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2.5 border border-border bg-card py-2 pl-2.5 pr-3.5 text-sm"
        >
          <ExportRing percent={percent} done={run.status === "done"} />
          {run.status === "done" ? "Export ready" : <span className="tabular-nums">Exporting posts · {percent}%</span>}
        </button>
      ) : null}
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
            <div className="flex items-start justify-between gap-3">
              <h2 id="export-title" className="text-base font-semibold">
                {run.status === "running" ? "Putting your PDF together" : run.status === "done" ? "Your PDF is ready" : "Export posts as PDF"}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="-mr-2 -mt-1 grid h-8 w-8 place-items-center hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            {run.status !== "idle" ? (
              <div className="mt-4">
                <ExportProgress run={run} onRetry={() => run.status === "error" && start(run.params)} />
              </div>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  One file: a contents page, then each post&apos;s cover (title, day, platforms, caption) and its latest draft. Posts are picked by their
                  posting day on the calendar.
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {preset("Last month", -1)}
                  {preset("This month", 0)}
                  {preset("Next month", 1)}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted-foreground">
                    From
                    <Input
                      type="date"
                      value={range.from}
                      onChange={(event) => setRange((value) => ({ ...value, from: event.target.value }))}
                      className="mt-1"
                    />
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
                              event.target.checked
                                ? EXPORT_COLUMNS.filter((item) => item === column || current.includes(item))
                                : current.filter((item) => item !== column),
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
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                  <Button type="button" className="gap-2" disabled={!valid || count === 0 || tooMany} onClick={() => start({ ...range, columns })}>
                    <Download className="h-4 w-4" />
                    Export PDF
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
