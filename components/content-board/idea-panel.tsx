"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityTimeline } from "@/components/content-board/activity-timeline";
import { hasChangesSinceReview } from "@/components/content-board/activity";
import { AttachmentAdder } from "@/components/content-board/attachment-adder";
import { PreviewViewer } from "@/components/content-board/preview-viewer";
import { ReviewPoints } from "@/components/content-board/review-points";
import {
  CONTENT_COLUMNS,
  assigneeLabel,
  ideaPlatforms,
  platformMeta,
  type ContentIdeaWithRelations,
  type IdeaPanelData,
  type PanelAttachment,
} from "@/components/content-board/types";
import type { ContentIdeaStatus } from "@/lib/db/types";
import { loadPanel, peekFreshPanel, peekPanel, storePanel } from "@/components/content-board/panel-cache";
import { removeAttachmentAction } from "@/app/tools/content-board/actions";

// Signed links last an hour; reuse them for 45 minutes so refreshing the panel
// (after adding a point, say) doesn't make images reload or the PDF restart.
const URL_REUSE_MS = 45 * 60 * 1000;

// A side panel (the board stays visible) with the idea's preview and review points.
// Give it key={idea.id} so switching ideas starts fresh.
export function IdeaPanel({
  idea,
  onClose,
  onEdit,
  keyboardActive,
  onOptimisticStatus,
}: {
  idea: ContentIdeaWithRelations;
  onClose: () => void;
  onEdit: () => void;
  keyboardActive: boolean;
  // Lets the board move this idea's card before the server has answered (null undoes it).
  onOptimisticStatus?: (ideaId: string, status: ContentIdeaStatus | null) => void;
}) {
  // Opening an idea that was looked at (or hovered) a moment ago shows it at once.
  const [data, setData] = useState<IdeaPanelData | null>(() => peekPanel(idea.id));
  const dataRef = useRef<IdeaPanelData | null>(data);
  const [loadError, setLoadError] = useState(false);
  const [index, setIndex] = useState(0);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const router = useRouter();

  const urlCache = useRef(new Map<string, { url: string; at: number }>());
  // Two quick actions start two reloads; only the newest one may update the screen, otherwise a
  // slower, older answer could put back a list that is missing the point that was just added.
  const refreshSeq = useRef(0);
  const boardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ideaId = idea.id;

  const commit = useCallback((next: IdeaPanelData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  // Changes the panel on screen straight away. The server's answer replaces it a moment later.
  const applyLocal = useCallback(
    (change: (current: IdeaPanelData) => IdeaPanelData) => {
      const current = dataRef.current;
      if (!current) return;
      const next = change(current);
      storePanel(ideaId, next);
      commit(next);
    },
    [commit, ideaId],
  );

  const refresh = useCallback(
    (options: { fresh?: boolean } = {}) => {
      const seq = ++refreshSeq.current;
      loadPanel(ideaId, options)
        .then((next) => {
          if (seq !== refreshSeq.current) return;
          const now = Date.now();
          const attachments = next.attachments.map((item) => {
            if (item.kind === "link" || !item.url) return item;
            const cached = urlCache.current.get(item.id);
            if (cached && now - cached.at < URL_REUSE_MS) return { ...item, url: cached.url };
            urlCache.current.set(item.id, { url: item.url, at: now });
            return item;
          });
          commit({ ...next, attachments });
          setLoadError(false);
          setIndex((value) => Math.min(value, Math.max(0, next.attachments.length - 1)));
        })
        .catch(() => {
          // With data already on screen, a failed quiet reload must not blank it out.
          if (seq === refreshSeq.current && !dataRef.current) setLoadError(true);
        });
    },
    [commit, ideaId],
  );

  // After an edit: reload this panel, and a moment later quietly refresh the board behind it so
  // the card's counts and thumbnail catch up (without making the click wait for that).
  // The board is only refreshed after a clean save: refreshing it while the connection is down
  // would make the browser reload the whole page.
  const afterChange = useCallback(
    (succeeded: boolean = true) => {
      refresh({ fresh: true });
      if (!succeeded) return;
      if (boardTimer.current) clearTimeout(boardTimer.current);
      boardTimer.current = setTimeout(() => router.refresh(), 1500);
    },
    [refresh, router],
  );

  useEffect(() => {
    // Skip the request when the data was loaded only moments ago (for example by hovering the card).
    if (!peekFreshPanel(ideaId)) refresh();
  }, [ideaId, refresh]);

  const attachments = data?.attachments ?? [];
  const currentKind = attachments[index]?.kind;

  // A file dropped just outside the upload box would make the browser open it and leave the app.
  useEffect(() => {
    function ignoreFileDrop(event: DragEvent) {
      if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) event.preventDefault();
    }
    window.addEventListener("dragover", ignoreFileDrop);
    window.addEventListener("drop", ignoreFileDrop);
    return () => {
      window.removeEventListener("dragover", ignoreFileDrop);
      window.removeEventListener("drop", ignoreFileDrop);
    };
  }, []);

  useEffect(() => {
    if (!keyboardActive) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable),
      );
      if (event.key === "Escape") {
        // Escape while typing only leaves the field, so a half-written comment isn't closed away.
        if (typing && (target as HTMLInputElement).value) (target as HTMLElement).blur();
        else onClose();
        return;
      }
      if (typing) return;
      if (currentKind === "pdf") return;
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
      if (event.key === "ArrowRight") setIndex((value) => Math.min(attachments.length - 1, value + 1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keyboardActive, onClose, currentKind, attachments.length]);

  function removeAttachment(attachment: PanelAttachment) {
    setRemoveError(null);
    const before = dataRef.current?.attachments ?? [];
    applyLocal((current) => ({ ...current, attachments: current.attachments.filter((item) => item.id !== attachment.id) }));
    setIndex((value) => Math.min(value, Math.max(0, before.length - 2)));
    void (async () => {
      const putBack = () => applyLocal((current) => ({ ...current, attachments: before }));
      let succeeded = true;
      try {
        const result = await removeAttachmentAction(attachment.id);
        if (!result.ok) {
          succeeded = false;
          putBack();
          setRemoveError(result.error);
        }
      } catch {
        succeeded = false;
        putBack();
        setRemoveError("Couldn't reach the server, so nothing was removed. Please try again.");
      }
      afterChange(succeeded);
    })();
  }

  const platforms = ideaPlatforms(idea);
  const statusLabel = CONTENT_COLUMNS.find((column) => column.status === idea.status)?.label ?? idea.status;

  return (
    <aside
      aria-label="Idea preview and review"
      className="panel-slide-in popover-shadow fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-background sm:w-[460px] lg:w-[540px]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {platforms.map((platform) => {
              const meta = platformMeta(platform);
              const PlatformIcon = meta.icon;
              return (
                <span
                  key={platform}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: meta.color }}
                >
                  {PlatformIcon ? <PlatformIcon className="h-3 w-3" /> : null}
                  {meta.label}
                </span>
              );
            })}
            <span className="eyebrow">{statusLabel}</span>
          </div>
          <h2 className="line-clamp-2 text-base font-semibold leading-snug">{idea.title}</h2>
          {(idea.assignees ?? []).length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Assigned to {(idea.assignees ?? []).map(assigneeLabel).join(", ")}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label="Edit idea details">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {loadError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t load this idea&apos;s preview.{" "}
            <button type="button" className="underline" onClick={() => refresh({ fresh: true })}>
              Try again
            </button>
          </p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <section aria-label="Preview" className="space-y-3">
              <h3 className="text-sm font-semibold">Preview</h3>
              <PreviewViewer
                attachments={attachments}
                index={index}
                onIndexChange={setIndex}
                onRemove={removeAttachment}
                busy={false}
              />
              {removeError ? (
                <p role="alert" className="text-xs text-destructive">
                  {removeError}
                </p>
              ) : null}
              <AttachmentAdder
                ideaId={idea.id}
                workspaceId={data.workspaceId}
                currentCount={attachments.length}
                onChanged={() => afterChange()}
              />
            </section>

            <ReferencePosts links={idea.reference_links ?? []} onEdit={onEdit} />

            <ReviewPoints
              ideaId={idea.id}
              points={data.points}
              currentUserId={data.currentUserId}
              currentUserName={data.currentUserName}
              ideaStatus={idea.status}
              onMovedToFeedback={(moved) => onOptimisticStatus?.(idea.id, moved ? "feedback" : null)}
              isAdmin={data.isAdmin}
              reviewedAt={data.history.reviewedAt}
              reviewerName={data.history.reviewerName}
              changedSinceReview={hasChangesSinceReview(data)}
              applyLocal={applyLocal}
              onChanged={afterChange}
            />

            <ActivityTimeline data={data} />
          </>
        )}
      </div>
    </aside>
  );
}

function describeLink(href: string) {
  try {
    const url = new URL(href);
    const path = url.pathname === "/" ? "" : url.pathname;
    return { host: url.hostname.replace(/^www\./, ""), path: `${path}${url.search}` };
  } catch {
    return { host: href, path: "" };
  }
}

function ReferencePosts({ links, onEdit }: { links: string[]; onEdit: () => void }) {
  return (
    <section aria-label="Reference posts" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Reference posts</h3>
        <button type="button" onClick={onEdit} className="text-xs text-muted-foreground hover:text-foreground">
          {links.length ? "Edit links" : "Add links"}
        </button>
      </div>
      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground">No reference links yet. Add posts that inspired this idea.</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {links.map((href) => {
            const { host, path } = describeLink(href);
            return (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{host}</span>
                    {path ? <span className="text-muted-foreground">{path}</span> : null}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
