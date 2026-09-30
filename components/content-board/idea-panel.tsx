"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ExternalLink, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttachmentAdder } from "@/components/content-board/attachment-adder";
import { PreviewViewer } from "@/components/content-board/preview-viewer";
import { ReviewPoints } from "@/components/content-board/review-points";
import {
  CONTENT_COLUMNS,
  PLATFORM_META,
  type ContentIdeaWithRelations,
  type IdeaPanelData,
  type PanelAttachment,
} from "@/components/content-board/types";
import { getIdeaPanelAction, removeAttachmentAction } from "@/app/tools/content-board/actions";

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
}: {
  idea: ContentIdeaWithRelations;
  onClose: () => void;
  onEdit: () => void;
  keyboardActive: boolean;
}) {
  const [data, setData] = useState<IdeaPanelData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [index, setIndex] = useState(0);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();

  const urlCache = useRef(new Map<string, { url: string; at: number }>());

  const ideaId = idea.id;
  const refresh = useCallback(() => {
    getIdeaPanelAction(ideaId)
      .then((next) => {
        const now = Date.now();
        const attachments = next.attachments.map((item) => {
          if (item.kind === "link" || !item.url) return item;
          const cached = urlCache.current.get(item.id);
          if (cached && now - cached.at < URL_REUSE_MS) return { ...item, url: cached.url };
          urlCache.current.set(item.id, { url: item.url, at: now });
          return item;
        });
        setData({ ...next, attachments });
        setLoadError(false);
        setIndex((value) => Math.min(value, Math.max(0, next.attachments.length - 1)));
      })
      .catch(() => setLoadError(true));
  }, [ideaId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const attachments = data?.attachments ?? [];
  const currentKind = attachments[index]?.kind;

  useEffect(() => {
    if (!keyboardActive) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (currentKind === "pdf") return;
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
      if (event.key === "ArrowRight") setIndex((value) => Math.min(attachments.length - 1, value + 1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keyboardActive, onClose, currentKind, attachments.length]);

  function removeAttachment(attachment: PanelAttachment) {
    setRemoveError(null);
    startRemoving(async () => {
      const result = await removeAttachmentAction(attachment.id);
      if (!result.ok) {
        setRemoveError(result.error);
        return;
      }
      refresh();
    });
  }

  const meta = PLATFORM_META[idea.platform];
  const PlatformIcon = meta.icon;
  const statusLabel = CONTENT_COLUMNS.find((column) => column.status === idea.status)?.label ?? idea.status;

  return (
    <aside
      aria-label="Idea preview and review"
      className="panel-slide-in popover-shadow fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-background sm:w-[460px] lg:w-[540px]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: meta.color }}
            >
              <PlatformIcon className="h-3 w-3" />
              {meta.label}
            </span>
            <span className="eyebrow">{statusLabel}</span>
          </div>
          <h2 className="line-clamp-2 text-base font-semibold leading-snug">{idea.title}</h2>
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
            <button type="button" className="underline" onClick={refresh}>
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
                busy={removing}
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
                onChanged={refresh}
              />
            </section>

            <ReferencePosts links={idea.reference_links ?? []} onEdit={onEdit} />

            <ReviewPoints
              ideaId={idea.id}
              points={data.points}
              currentUserId={data.currentUserId}
              isAdmin={data.isAdmin}
              onChanged={refresh}
            />
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
