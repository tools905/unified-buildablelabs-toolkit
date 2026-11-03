"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FolderDown, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExportProgress } from "@/components/content-board/export-progress";
import { useBoardExport, type ExportParams } from "@/components/content-board/use-board-export";
import { deleteDownloadAction } from "@/app/actions/downloads";
import { BASE_PATH } from "@/lib/utils/app-url";
import { COLUMN_LABELS } from "@/lib/utils/content-board";
import { expiryLabel, formatBytes, KEEP_DOWNLOADS_DAYS } from "@/lib/utils/downloads";
import type { DownloadRow } from "@/lib/services/download-service";
import type { ContentIdeaStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";

const DAY_MS = 24 * 60 * 60 * 1000;
const indiaDay = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(value));
const time = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value)).replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());

// "Today", "Yesterday", or "Mon, 3 Nov".
function dayHeading(day: string, now: Date) {
  if (day === indiaDay(now)) return "Today";
  if (day === indiaDay(new Date(now.getTime() - DAY_MS))) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

function summary(item: DownloadRow) {
  const details = item.details as { posts?: number; pages?: number; columns?: ContentIdeaStatus[]; tickets?: number };
  const parts: string[] = [];
  if (details.posts != null) parts.push(`${details.posts} ${details.posts === 1 ? "post" : "posts"}`);
  if (details.pages != null) parts.push(`${details.pages} pages`);
  if (details.tickets != null) parts.push(`${details.tickets} ${details.tickets === 1 ? "ticket" : "tickets"}`);
  if (item.size_bytes) parts.push(formatBytes(item.size_bytes));
  if (details.columns?.length) parts.push(details.columns.map((column) => COLUMN_LABELS[column] ?? column).join(", "));
  return parts.join(" · ");
}

// A small file glyph with a folded corner: PDF in blue, CSV in green.
function FileGlyph({ kind, faded }: { kind: DownloadRow["kind"]; faded: boolean }) {
  const pdf = kind === "board_pdf";
  return (
    <div className={cn("relative grid h-12 w-10 shrink-0 place-items-end pb-1.5", faded && "opacity-40")} aria-hidden>
      <div
        className={cn("absolute inset-0 border", pdf ? "border-primary-hover/50 bg-primary/15" : "border-emerald-400/40 bg-emerald-400/10")}
        style={{ clipPath: "polygon(0 0, 70% 0, 100% 22%, 100% 100%, 0 100%)" }}
      />
      <div className={cn("absolute right-0 top-0 h-[22%] w-[30%] border-b border-l", pdf ? "border-primary-hover/50 bg-primary-hover/30" : "border-emerald-400/40 bg-emerald-400/25")} />
      <span className={cn("relative mx-auto font-mono text-[9px] font-semibold tracking-wider", pdf ? "text-[#a9b8ff]" : "text-emerald-300")}>{pdf ? "PDF" : "CSV"}</span>
    </div>
  );
}

// Settings → Downloads: the team's exports grouped by day, each with how long its file is kept (a
// thin bar that runs down over the 30 days), Download, and Delete for the person who made it or an
// admin. An expired board export can be made again from here, with the same progress as on the board.
export function DownloadsList({ downloads, currentUserId, isAdmin }: { downloads: DownloadRow[]; currentUserId: string; isAdmin: boolean }) {
  const router = useRouter();
  // Deleted here; the rest comes fresh from the server (a remade export appears on refresh).
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const items = useMemo(() => downloads.filter((item) => !removed.has(item.id)), [downloads, removed]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const { run, start, reset } = useBoardExport();
  const [remaking, setRemaking] = useState(false);

  const shown = onlyMine ? items.filter((item) => item.created_by === currentUserId) : items;
  const groups = useMemo(() => {
    const map = new Map<string, DownloadRow[]>();
    for (const item of shown) {
      const day = indiaDay(item.created_at);
      map.set(day, [...(map.get(day) ?? []), item]);
    }
    return [...map.entries()];
  }, [shown]);
  const kept = items.filter((item) => item.storage_path && new Date(item.expires_at) > now);
  const keptBytes = kept.reduce((sum, item) => sum + (item.size_bytes || 0), 0);

  function remove(id: string) {
    setError(null);
    startDelete(async () => {
      const result = await deleteDownloadAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRemoved((current) => new Set(current).add(id));
      setConfirming(null);
    });
  }

  // A remade export lists itself as soon as it's done.
  useEffect(() => {
    if (run.status === "done") router.refresh();
  }, [run.status, router]);

  function makeAgain(params: ExportParams) {
    setRemaking(true);
    void start(params);
  }

  function closeRemake() {
    setRemaking(false);
    if (run.status !== "running") reset();
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground">{kept.length}</span> {kept.length === 1 ? "file" : "files"} ready to download ·{" "}
          <span className="text-foreground">{formatBytes(keptBytes)}</span> kept
        </p>
        <div className="flex border border-border p-0.5 text-xs" role="group" aria-label="Whose downloads">
          {[
            { label: "Everyone", value: false },
            { label: "Only mine", value: true },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={onlyMine === option.value}
              onClick={() => setOnlyMine(option.value)}
              className={cn("px-3 py-1.5", onlyMine === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <div className="grid place-items-center border border-dashed border-border px-6 py-14 text-center">
          <FolderDown className="h-8 w-8 text-quiet" />
          <p className="mt-3 font-medium">{onlyMine ? "You haven't exported anything yet" : "Nothing exported yet"}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Use <span className="text-foreground">Export</span> on the Board or <span className="text-foreground">Export CSV</span> in Tickets. Each file shows up here for{" "}
            {KEEP_DOWNLOADS_DAYS} days.
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map(([day, rows]) => (
            <section key={day}>
              <h2 className="eyebrow mb-2.5">{dayHeading(day, now)}</h2>
              <ul className="space-y-2">
                {rows.map((item) => {
                  const expiry = item.storage_path ? expiryLabel(item.expires_at, now) : null;
                  const available = Boolean(expiry);
                  const lifeLeft = available ? Math.min(1, (new Date(item.expires_at).getTime() - now.getTime()) / (KEEP_DOWNLOADS_DAYS * DAY_MS)) : 0;
                  const soon = available && lifeLeft < 4 / KEEP_DOWNLOADS_DAYS;
                  const canDelete = item.created_by === currentUserId || isAdmin;
                  const who = item.created_by === currentUserId ? "You" : item.creator?.full_name || item.creator?.email || "Someone";
                  const details = item.details as Partial<ExportParams>;
                  return (
                    <li key={item.id} className="card-shadow relative overflow-hidden border border-border bg-card">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3.5 sm:flex-nowrap">
                        <FileGlyph kind={item.kind} faded={!available} />
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate font-medium", !available && "text-muted-foreground")}>{item.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary(item)}</p>
                          <p className="mt-1 text-xs text-chrome">
                            {who} · {time(item.created_at)}
                            <span suppressHydrationWarning className={cn("ml-2", available ? (soon ? "text-amber-400" : "text-muted-foreground") : "text-quiet")}>
                              {available ? `· ${expiry}` : "· Expired"}
                            </span>
                          </p>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-1.5">
                          {confirming === item.id ? (
                            <>
                              <span className="mr-1 max-w-48 text-xs leading-tight">Delete for good? It can&apos;t be recovered.</span>
                              <Button type="button" size="sm" variant="destructive" disabled={deleting} onClick={() => remove(item.id)}>
                                {deleting ? "Deleting…" : "Delete"}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                                Keep
                              </Button>
                            </>
                          ) : (
                            <>
                              {available ? (
                                <Button asChild size="sm" className="gap-1.5">
                                  <a href={`${BASE_PATH}/api/downloads/${item.id}`}>
                                    <Download className="h-3.5 w-3.5" />
                                    Download
                                  </a>
                                </Button>
                              ) : item.kind === "board_pdf" && details.from && details.to && details.columns?.length ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  disabled={run.status === "running"}
                                  onClick={() => makeAgain({ from: details.from!, to: details.to!, columns: details.columns! })}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  Make again
                                </Button>
                              ) : item.kind === "tickets_csv" ? (
                                <Button asChild size="sm" variant="outline">
                                  <Link href="/tools/tickets/admin">Export again</Link>
                                </Button>
                              ) : null}
                              {canDelete ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Delete ${item.name}`}
                                  title="Delete for good"
                                  onClick={() => setConfirming(item.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                      {/* How much of its 30 days the file has left. */}
                      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-border/40" aria-hidden>
                        <div className={cn("h-full", soon ? "bg-amber-400" : "bg-primary-hover/70")} style={{ width: `${lifeLeft * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {remaking && run.status !== "idle" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={(event) => event.target === event.currentTarget && closeRemake()}>
          <div role="dialog" aria-modal="true" aria-label="Making the export again" className="popover-shadow w-full border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">{run.status === "done" ? "Your PDF is ready" : run.status === "error" ? "Export" : "Putting your PDF together"}</h2>
              <button type="button" onClick={closeRemake} aria-label="Close" className="-mr-2 -mt-1 grid h-8 w-8 place-items-center hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ExportProgress run={run} onRetry={() => run.status === "error" && start(run.params)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
