"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { countChanges, diffLines, diffWords, type DiffRow } from "@/lib/utils/text-diff";
import { pickNewsletterContent, type NewsletterContent } from "@/lib/utils/newsletter-versions";
import { listVersionsAction } from "@/app/tools/newsletter/actions";
import type { NewsletterPostVersion } from "@/components/newsletter/types";

const CURRENT = "current";
// Unchanged stretches of the story longer than this are folded so the changes stand out.
const FOLD_AFTER = 6;
const FOLD_CONTEXT = 2;


type Entry = { id: string; number: number | null; content: NewsletterContent; version: NewsletterPostVersion | null };

const BLANK: NewsletterContent = pickNewsletterContent({});

// One line of a git-style diff: removed lines on red with a minus, added lines on green with a
// plus. On an edited line the exact words that changed are marked more strongly.
function DiffLine({ row }: { row: DiffRow }) {
  const empty = row.parts.every((part) => !part.value);
  return (
    <div
      className={cn(
        "grid grid-cols-[1.25rem_minmax(0,1fr)] py-0.5",
        row.type === "delete" && "bg-red-500/10",
        row.type === "insert" && "bg-emerald-500/10",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "select-none text-center font-mono",
          row.type === "delete" && "text-red-600 dark:text-red-400",
          row.type === "insert" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {row.type === "delete" ? "−" : row.type === "insert" ? "+" : ""}
      </span>
      <span className="whitespace-pre-wrap pr-2">
        {row.type !== "equal" ? <span className="sr-only">{row.type === "delete" ? "Removed: " : "Added: "}</span> : null}
        {empty
          ? " "
          : row.parts.map((part, i) =>
              part.type === "equal" ? (
                <span key={i}>{part.value}</span>
              ) : (
                <mark
                  key={i}
                  className={cn(
                    "rounded-sm text-inherit",
                    part.type === "delete" ? "bg-red-500/30" : "bg-emerald-500/30",
                  )}
                >
                  {part.value}
                </mark>
              ),
            )}
      </span>
    </div>
  );
}

function FieldChange({ label, before, after }: { label: string; before: string; after: string }) {
  if (before === after) return null;
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="text-sm">
        {diffLines(before, after).map((row, i) => (
          <DiffLine key={i} row={row} />
        ))}
      </div>
    </div>
  );
}

function StoryChanges({ rows }: { rows: DiffRow[] }) {
  const [unfolded, setUnfolded] = useState<Set<number>>(new Set());

  // Groups rows into runs so long unchanged stretches can be folded away.
  const runs = useMemo(() => {
    const result: { start: number; rows: DiffRow[]; equal: boolean }[] = [];
    rows.forEach((row, index) => {
      const equal = row.type === "equal";
      const last = result[result.length - 1];
      if (last && last.equal === equal) last.rows.push(row);
      else result.push({ start: index, rows: [row], equal });
    });
    return result;
  }, [rows]);

  const line = (row: DiffRow, key: string | number) => <DiffLine key={key} row={row} />;

  return (
    <div className="text-sm leading-relaxed">
      {runs.map((run, runIndex) => {
        if (!run.equal || run.rows.length <= FOLD_AFTER || unfolded.has(run.start)) {
          return <Fragment key={run.start}>{run.rows.map((row, i) => line(row, `${run.start}-${i}`))}</Fragment>;
        }
        const head = runIndex === 0 ? [] : run.rows.slice(0, FOLD_CONTEXT);
        const tail = runIndex === runs.length - 1 ? [] : run.rows.slice(-FOLD_CONTEXT);
        const hidden = run.rows.length - head.length - tail.length;
        return (
          <Fragment key={run.start}>
            {head.map((row, i) => line(row, `${run.start}-h${i}`))}
            <button
              type="button"
              onClick={() => setUnfolded((current) => new Set(current).add(run.start))}
              className="my-1 w-full border border-dashed border-border py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Show {hidden} unchanged line{hidden === 1 ? "" : "s"}
            </button>
            {tail.map((row, i) => line(row, `${run.start}-t${i}`))}
          </Fragment>
        );
      })}
    </div>
  );
}

function CoverChange({ before, after }: { before: NewsletterContent; after: NewsletterContent }) {
  const replaced = before.cover_image_url !== after.cover_image_url;
  const reframed =
    !replaced &&
    (before.cover_focus_x !== after.cover_focus_x ||
      before.cover_focus_y !== after.cover_focus_y ||
      before.cover_zoom !== after.cover_zoom ||
      before.cover_tone !== after.cover_tone);
  if (!replaced && !reframed) return null;

  const summary = reframed
    ? "Framing or tone adjusted"
    : !before.cover_image_url
      ? "Preview image added"
      : !after.cover_image_url
        ? "Preview image removed"
        : "Preview image replaced";

  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Preview image</p>
      <p className="mb-2 text-sm">{summary}</p>
      {replaced ? (
        <div className="flex items-center gap-3">
          {before.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={before.cover_image_url} alt="Before" className="h-16 w-24 object-cover opacity-60 ring-2 ring-red-500" />
          ) : null}
          {before.cover_image_url && after.cover_image_url ? <span className="text-muted-foreground">→</span> : null}
          {after.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={after.cover_image_url} alt="After" className="h-16 w-24 object-cover ring-2 ring-emerald-500" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Changes({
  before,
  after,
  memberName,
}: {
  before: NewsletterContent;
  after: NewsletterContent;
  memberName: (id: string) => string;
}) {
  const rows = useMemo(() => diffLines(before.body, after.body), [before.body, after.body]);
  const added = after.author_ids.filter((id) => !before.author_ids.includes(id));
  const removed = before.author_ids.filter((id) => !after.author_ids.includes(id));
  const bodyChanged = rows.some((row) => row.type !== "equal");
  const words = countChanges([
    ...rows.flatMap((row) => row.parts),
    ...diffWords(before.title, after.title),
    ...diffWords(before.deck ?? "", after.deck ?? ""),
  ]);

  const changed =
    bodyChanged ||
    added.length > 0 ||
    removed.length > 0 ||
    before.title !== after.title ||
    (before.deck ?? "") !== (after.deck ?? "") ||
    (before.tag ?? "") !== (after.tag ?? "") ||
    before.cover_image_url !== after.cover_image_url ||
    before.cover_focus_x !== after.cover_focus_x ||
    before.cover_focus_y !== after.cover_focus_y ||
    before.cover_zoom !== after.cover_zoom ||
    before.cover_tone !== after.cover_tone;

  if (!changed) return <p className="text-sm text-muted-foreground">No differences.</p>;

  return (
    <div className="space-y-5">
      {words.added || words.removed ? (
        <p className="text-xs text-muted-foreground">
          <span className="text-emerald-700 dark:text-emerald-300">+{words.added} words</span>
          {" · "}
          <span className="text-red-700 dark:text-red-300">−{words.removed} words</span>
        </p>
      ) : null}
      <FieldChange label="Desk" before={before.tag ?? ""} after={after.tag ?? ""} />
      <FieldChange label="Headline" before={before.title} after={after.title} />
      <FieldChange label="Deck" before={before.deck ?? ""} after={after.deck ?? ""} />
      {added.length || removed.length ? (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Authors</p>
          <p className="flex flex-wrap gap-1.5 text-sm">
            {added.map((id) => (
              <ins key={id} className="bg-emerald-500/20 px-1.5 no-underline">
                + {memberName(id)}
              </ins>
            ))}
            {removed.map((id) => (
              <del key={id} className="bg-red-500/15 px-1.5">
                − {memberName(id)}
              </del>
            ))}
          </p>
        </div>
      ) : null}
      <CoverChange before={before} after={after} />
      {bodyChanged ? (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Story</p>
          <StoryChanges rows={rows} />
        </div>
      ) : null}
    </div>
  );
}

// Lists every kept version of a post and shows, in track-changes style, what each one changed.
export function VersionHistory({
  postId,
  current,
  memberName,
  beforeAction,
  onClose,
}: {
  postId: string;
  current: NewsletterContent;
  memberName: (id: string) => string;
  // Saves any pending edits so the history works from the latest text.
  beforeAction: () => Promise<void>;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<NewsletterPostVersion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>(CURRENT);
  const [compareTo, setCompareTo] = useState<"previous" | "current">("previous");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    beforeAction()
      .then(() => listVersionsAction(postId))
      .then((rows) => setVersions(rows as NewsletterPostVersion[]))
      .catch(() => setError("Could not load the version history."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const entries: Entry[] = useMemo(
    () => [
      { id: CURRENT, number: null, content: current, version: null },
      ...(versions ?? []).map((version, index, all) => ({
        id: version.id,
        // Numbered from the oldest, so Version 1 is the first one kept.
        number: all.length - index,
        content: pickNewsletterContent(version),
        version,
      })),
    ],
    [current, versions],
  );
  const selectedIndex = Math.max(0, entries.findIndex((entry) => entry.id === selectedId));
  const selected = entries[selectedIndex];
  const older = entries[selectedIndex + 1] ?? null;
  const comparingWithCurrent = compareTo === "current" && selected.id !== CURRENT;

  function entryTitle(entry: Entry) {
    return entry.number === null ? "Current draft" : `Version ${entry.number}`;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
    >
      <div className="popover-shadow flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">Version history</h2>
            <p className="text-xs text-muted-foreground">
              A version is kept each time you leave the editor after changing the post, and whenever it is published.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,40%)_minmax(0,1fr)] md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-1">
          <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {entries.map((entry) => {
                const at = entry.version ? new Date(entry.version.created_at) : null;
                const by = entry.version?.edited_by ?? entry.version?.created_by;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(entry.id)}
                      aria-current={entry.id === selected.id}
                      className={cn(
                        "w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted",
                        entry.id === selected.id && "bg-muted",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{entryTitle(entry)}</span>
                        {entry.version?.kind === "published" ? (
                          <span className="shrink-0 bg-emerald-500/20 px-1.5 font-mono text-[9px] uppercase tracking-widest">
                            Published
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {at ? (
                          <time dateTime={entry.version!.created_at} title={format(at, "d MMM yyyy, h:mm a")}>
                            {format(at, "d MMM, h:mm a")} · {formatDistanceToNow(at, { addSuffix: true })}
                          </time>
                        ) : (
                          "What's in the editor now"
                        )}
                      </div>
                      {by ? <div className="text-xs text-muted-foreground">{memberName(by)}</div> : null}
                    </button>
                  </li>
                );
              })}
              {versions === null && !error ? (
                <li className="px-4 py-3 text-xs text-muted-foreground">Loading versions…</li>
              ) : null}
              {versions?.length === 0 ? (
                <li className="px-4 py-3 text-xs text-muted-foreground">
                  No versions yet. One is kept when you leave the editor after making changes.
                </li>
              ) : null}
            </ul>
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{entryTitle(selected)}</p>
                <p className="text-xs text-muted-foreground">
                  {comparingWithCurrent
                    ? "What has changed since this version"
                    : older
                      ? `Changes from the version before (${entryTitle(older)})`
                      : selected.version
                        ? "The first kept version, shown against an empty post"
                        : "No earlier version yet, so this is shown against an empty post"}
                </p>
              </div>
              {selected.version ? (
                <div className="flex border border-border text-xs" role="radiogroup" aria-label="Compare with">
                  {(["previous", "current"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={compareTo === option}
                      onClick={() => setCompareTo(option)}
                      className={cn(
                        "px-2.5 py-1 transition-colors",
                        compareTo === option ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      {option === "previous" ? "vs. previous" : "vs. current draft"}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="border-b border-border px-6 py-2 text-xs" style={{ color: "#F87171" }}>
                {error}
              </p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {comparingWithCurrent ? (
                <Changes key={`${selected.id}:current`} before={selected.content} after={current} memberName={memberName} />
              ) : (
                <Changes key={`${selected.id}:previous`} before={older?.content ?? BLANK} after={selected.content} memberName={memberName} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
