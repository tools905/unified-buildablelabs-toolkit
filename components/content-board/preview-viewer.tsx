"use client";

import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Link2 } from "lucide-react";
import { InlineConfirmButton } from "@/components/content-board/inline-confirm-button";
import { describeUploads, draftOf, formatWhen, groupUploads, type UploadGroup } from "@/components/content-board/activity";
import { ideaPdfUrl } from "@/components/content-board/idea-pdf";
import { PdfViewer } from "@/components/content-board/pdf-viewer";
import { cn } from "@/lib/utils/cn";
import type { PanelAttachment } from "@/components/content-board/types";

export function PreviewViewer({
  ideaId,
  attachments,
  index,
  onIndexChange,
  onRemove,
  busy,
}: {
  ideaId: string;
  attachments: PanelAttachment[];
  index: number;
  onIndexChange: (index: number) => void;
  onRemove: (attachment: PanelAttachment) => void;
  busy: boolean;
}) {
  const current = attachments[index];
  const drafts = groupUploads(attachments);
  const currentDraft = draftOf(drafts, index);

  if (!current) {
    return (
      <div className="flex h-40 items-center justify-center border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
        No preview yet. Add images, a PDF or a design link below.
      </div>
    );
  }

  const canStep = attachments.length > 1 && current.kind !== "pdf";

  return (
    <div className="space-y-2">
      <div className="relative h-[56dvh] min-h-[300px] overflow-hidden border border-border bg-muted/30 sm:h-[64vh]">
        {current.kind === "image" && current.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs, not a fixed host
          <img src={current.url} alt={current.fileName ?? "Slide"} className="h-full w-full object-contain" />
        ) : null}

        {current.kind === "pdf" && current.url ? <PdfViewer key={current.id} url={current.url} pages={current.pages} /> : null}

        {current.kind === "link" ? (
          current.embedUrl ? (
            <iframe
              key={current.embedUrl}
              src={current.embedUrl}
              title="Design preview"
              className="h-full w-full border-0"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
              <Link2 className="h-6 w-6" />
              <p>This link can&apos;t be shown here. Canva view links, Figma, Google Drive and Slides links work best.</p>
            </div>
          )
        ) : null}

        {attachments.length > 1 ? (
          <span className="pointer-events-none absolute left-2 top-2 bg-background/80 px-2 py-0.5 text-xs">
            {index + 1} / {attachments.length}
          </span>
        ) : null}

        {canStep ? (
          <>
            <StepButton side="left" disabled={index === 0} onClick={() => onIndexChange(index - 1)} />
            <StepButton side="right" disabled={index === attachments.length - 1} onClick={() => onIndexChange(index + 1)} />
          </>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">
          {currentDraft && drafts.length > 1 ? (
            <span className="font-medium text-foreground">
              Draft {currentDraft.number}
              {currentDraft === drafts[drafts.length - 1] ? " (latest)" : ""} ·{" "}
            </span>
          ) : null}
          {currentDraft && currentDraft.items.length > 1
            ? `file ${currentDraft.items.findIndex((item) => item.index === index) + 1} of ${currentDraft.items.length} · `
            : ""}
          uploaded by <span className="font-medium text-foreground">{current.uploaderName}</span>
          {current.uploadedVia ? <> through <span className="font-medium text-foreground">{current.uploadedVia}</span></> : null} ·{" "}
          {formatWhen(current.createdAt)}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {current.kind === "link" && current.url ? (
            <a
              href={current.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Open <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          <InlineConfirmButton
            label="Remove"
            question="Remove this?"
            confirmLabel="Yes, remove"
            pendingLabel="Removing…"
            pending={busy}
            onConfirm={() => onRemove(current)}
          />
        </div>
      </div>

      <DraftList ideaId={ideaId} drafts={drafts} index={index} onIndexChange={onIndexChange} />
    </div>
  );
}

// Every draft of the post, newest first so the latest is always at the top: who uploaded it, when,
// what it holds, and a button to download just that draft as a PDF. Picking a draft shows it above;
// the picked draft also lists its files, so any one of them can be looked at.
function DraftList({
  ideaId,
  drafts,
  index,
  onIndexChange,
}: {
  ideaId: string;
  drafts: UploadGroup[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const latest = drafts[drafts.length - 1];
  const newestFirst = [...drafts].reverse();

  return (
    <section aria-label="Drafts" className="space-y-2 border-t border-border pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold">
          {drafts.length === 1 ? "Draft" : `Drafts (${drafts.length})`}
        </h4>
        {drafts.length > 1 ? <span className="text-[11px] text-muted-foreground">Newest first</span> : null}
      </div>
      <ol className="divide-y divide-border border border-border">
        {newestFirst.map((draft) => {
          const selected = draft.items.some((item) => item.index === index);
          const fileIds = draft.items.filter((item) => item.attachment.kind !== "link").map((item) => item.attachment.id);
          const isLatest = draft === latest;
          return (
            <li
              key={draft.key}
              className={cn("transition-colors", selected ? "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-muted/40")}
            >
              <div className="flex items-center gap-2 py-2 pl-3 pr-1.5">
                <button
                  type="button"
                  onClick={() => onIndexChange(draft.items[0].index)}
                  aria-pressed={selected}
                  aria-label={`Show draft ${draft.number}${isLatest ? " (latest)" : ""} by ${draft.uploaderName}`}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <DraftCover draft={draft} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                      Draft {draft.number}
                      {isLatest ? (
                        <span className="rounded-sm bg-primary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                          Latest
                        </span>
                      ) : null}
                      {selected ? <span className="text-[11px] font-medium text-primary">Viewing</span> : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className="text-foreground">{draft.uploaderName}</span>
                      {draft.uploadedVia ? ` through ${draft.uploadedVia}` : ""} · {formatWhen(draft.at)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{describeUploads(draft.items)}</span>
                  </span>
                </button>
                {fileIds.length > 0 ? (
                  // A plain link, so the download works on phones and in in-app browsers too.
                  <a
                    href={ideaPdfUrl(ideaId, fileIds)}
                    rel="noopener"
                    aria-label={`Download draft ${draft.number} as PDF`}
                    title={`Download draft ${draft.number} as PDF`}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
              {selected && draft.items.length > 1 ? (
                <div className="grid grid-cols-6 gap-1.5 px-3 pb-3 sm:grid-cols-8">
                  {draft.items.map(({ attachment, index: itemIndex }, position) => (
                    <FileTile
                      key={attachment.id}
                      attachment={attachment}
                      position={position + 1}
                      selected={itemIndex === index}
                      onSelect={() => onIndexChange(itemIndex)}
                    />
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function pictureOf(attachment: PanelAttachment) {
  return attachment.kind === "image" ? (attachment.thumbUrl ?? attachment.url) : attachment.thumbUrl;
}

// A small look at a draft: its first file, with a count when it holds several.
function DraftCover({ draft }: { draft: UploadGroup }) {
  const first = draft.items[0].attachment;
  const picture = pictureOf(first);
  return (
    <span className="relative grid h-[60px] w-12 shrink-0 place-items-center overflow-hidden rounded-sm border border-border bg-card text-muted-foreground">
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs
        <img src={picture} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
      ) : first.kind === "pdf" ? (
        <FileText className="h-5 w-5" />
      ) : (
        <Link2 className="h-5 w-5" />
      )}
      {draft.items.length > 1 ? (
        <span className="absolute bottom-0.5 right-0.5 rounded-sm bg-black/75 px-1 text-[9px] font-semibold text-white">
          {draft.items.length}
        </span>
      ) : first.kind === "pdf" ? (
        <span className="absolute bottom-0.5 right-0.5 rounded-sm bg-black/75 px-1 text-[9px] font-semibold text-white">PDF</span>
      ) : null}
    </span>
  );
}

function FileTile({
  attachment,
  position,
  selected,
  onSelect,
}: {
  attachment: PanelAttachment;
  position: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const picture = pictureOf(attachment);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Show file ${position}${attachment.fileName ? `: ${attachment.fileName}` : ""}`}
      aria-current={selected}
      title={attachment.fileName ?? undefined}
      className={cn(
        "relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-sm border bg-card text-muted-foreground transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50",
      )}
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs
        <img src={picture} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
      ) : attachment.kind === "pdf" ? (
        <FileText className="h-4 w-4" />
      ) : (
        <Link2 className="h-4 w-4" />
      )}
      <span className="absolute left-0.5 top-0.5 rounded-sm bg-black/60 px-1 text-[9px] text-white">{position}</span>
    </button>
  );
}

function StepButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous slide" : "Next slide"}
      className={cn(
        "absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center bg-background/80 text-foreground transition-opacity hover:bg-background disabled:opacity-0",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
