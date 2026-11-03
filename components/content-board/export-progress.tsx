"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Download, FolderDown, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExportRun } from "@/components/content-board/use-board-export";
import { exportPercent, formatBytes, timeLeftLabel } from "@/lib/utils/downloads";
import { cn } from "@/lib/utils/cn";

const STEPS = [
  { key: "gather", label: "Finding" },
  { key: "build", label: "Adding" },
  { key: "file", label: "Saving" },
  { key: "done", label: "Ready" },
] as const;

function stepOf(run: ExportRun) {
  if (run.status === "done") return 3;
  if (run.status !== "running") return 0;
  return run.stage === "gather" ? 0 : run.stage === "build" ? 1 : 2;
}

// A board export while it's being put together: the percentage and time left, and a bar with one
// segment per post, as wide as its pages, filling in as each post goes into the PDF. The last
// segment is saving and uploading the file.
export function ExportProgress({ run, onRetry }: { run: Exclude<ExportRun, { status: "idle" }>; onRetry: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (run.status !== "running") return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [run.status]);

  if (run.status === "error") {
    return (
      <div className="py-2">
        <p className="text-sm font-medium text-destructive">The export didn&apos;t finish</p>
        <p className="mt-1 text-sm text-muted-foreground">{run.message}</p>
        <Button type="button" variant="outline" className="mt-4 gap-2" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  const posts = run.posts;
  const done = run.status === "done" ? posts.length : run.done;
  const stage = run.status === "done" ? "done" : run.stage === "gather" ? "build" : run.stage;
  const weights = posts.map((post) => post.weight);
  const percent = run.status === "running" && run.stage === "gather" ? 0 : exportPercent({ weights, done, stage });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const elapsed = (run.status === "done" ? run.finishedAt : now) - run.startedAt;
  const left = run.status === "running" ? timeLeftLabel(elapsed, percent) : null;
  const current = run.status === "running" && run.stage === "build" ? posts[done] : null;
  const step = stepOf(run);
  const fileDone = run.status === "done";
  const fileActive = run.status === "running" && (run.stage === "saving" || run.stage === "uploading");

  return (
    <div aria-live="polite" className="min-w-0">
      <div className="flex items-end justify-between gap-4">
        <div className="font-mono text-5xl font-medium tabular-nums leading-none tracking-tight">
          {fileDone ? (
            <Check className="h-11 w-11 text-emerald-400" aria-label="Done" />
          ) : (
            <>
              {percent}
              <span className="text-2xl text-muted-foreground">%</span>
            </>
          )}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {fileDone ? (
            <span>Done in {Math.max(1, Math.round(elapsed / 1000))} s</span>
          ) : (
            <span className="tabular-nums">{left ?? (posts.length ? "Working out the time left…" : "Starting…")}</span>
          )}
          {posts.length ? (
            <span className="mt-0.5 block tabular-nums text-chrome">
              {Math.min(done, posts.length)} of {posts.length} {posts.length === 1 ? "post" : "posts"}
            </span>
          ) : null}
        </div>
      </div>

      {/* One segment per post, as wide as its pages; the last one is the file itself. */}
      <div
        className="mt-5 flex h-3 w-full gap-[2px]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Export progress"
      >
        {posts.length === 0 ? (
          <div className="export-shimmer h-full w-full bg-muted" />
        ) : (
          <>
            {posts.map((post, index) => (
              <div
                key={index}
                title={post.title}
                style={{ flexGrow: post.weight, flexBasis: 0 }}
                className={cn(
                  "h-full min-w-[3px] transition-colors duration-300",
                  index < done ? "bg-primary-hover" : index === done && run.status === "running" ? "export-shimmer bg-primary/40" : "bg-muted",
                )}
              />
            ))}
            <div
              title="Saving the file"
              style={{ flexGrow: Math.max(1, total * 0.11), flexBasis: 0 }}
              className={cn(
                "h-full min-w-[6px] transition-colors duration-300",
                fileDone ? "bg-emerald-400" : fileActive ? "export-shimmer bg-primary/40" : "bg-muted",
              )}
            />
          </>
        )}
      </div>

      <p className="mt-3 min-h-5 truncate text-sm text-chrome">
        {fileDone ? (
          `${run.result.pages} pages · ${formatBytes(run.result.sizeBytes)} · your download has started`
        ) : current ? (
          <>
            Adding <span className="text-foreground">{current.title || "Untitled"}</span>
          </>
        ) : fileActive ? (
          run.stage === "saving" ? (
            "Binding the pages into one file…"
          ) : (
            "Uploading the file…"
          )
        ) : (
          "Finding the posts in those dates…"
        )}
      </p>

      <ol className="mt-4 grid grid-cols-4 gap-2">
        {STEPS.map((item, index) => (
          <li key={item.key} className="flex flex-col gap-1.5">
            <span className={cn("h-0.5 w-full", index < step || fileDone ? "bg-primary-hover" : index === step ? "bg-primary/60" : "bg-border")} />
            <span className={cn("flex items-center gap-1 text-[11px]", index <= step ? "text-foreground" : "text-muted-foreground")}>
              {index < step || fileDone ? (
                <Check className="h-3 w-3 text-primary-hover" />
              ) : index === step ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              {item.label}
            </span>
          </li>
        ))}
      </ol>

      {fileDone ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild className="gap-2">
            <a href={run.result.url}>
              <Download className="h-4 w-4" />
              Download again
            </a>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/settings/downloads">
              <FolderDown className="h-4 w-4" />
              See all downloads
            </Link>
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-[11px] text-muted-foreground">You can close this; the export carries on and the download starts when it&apos;s ready.</p>
      )}
    </div>
  );
}

// A small round progress mark for when the export window is closed.
export function ExportRing({ percent, done }: { percent: number; done: boolean }) {
  const radius = 9;
  const length = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={radius} fill="none" stroke="var(--border)" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke={done ? "#34d399" : "var(--primary-hover)"}
        strokeWidth="3"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - percent / 100)}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}

export function runPercent(run: ExportRun) {
  if (run.status === "done") return 100;
  if (run.status !== "running" || run.stage === "gather") return 0;
  return exportPercent({ weights: run.posts.map((post) => post.weight), done: run.done, stage: run.stage });
}
