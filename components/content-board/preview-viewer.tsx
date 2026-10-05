"use client";

import { ChevronLeft, ChevronRight, ExternalLink, FileText, Link2 } from "lucide-react";
import { InlineConfirmButton } from "@/components/content-board/inline-confirm-button";
import { describeUploads, formatWhen, groupUploads } from "@/components/content-board/activity";
import { PdfViewer } from "@/components/content-board/pdf-viewer";
import { cn } from "@/lib/utils/cn";
import type { PanelAttachment } from "@/components/content-board/types";

export function PreviewViewer({
  attachments,
  index,
  onIndexChange,
  onRemove,
  busy,
}: {
  attachments: PanelAttachment[];
  index: number;
  onIndexChange: (index: number) => void;
  onRemove: (attachment: PanelAttachment) => void;
  busy: boolean;
}) {
  const current = attachments[index];

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

        {current.kind === "pdf" && current.url ? <PdfViewer key={current.id} url={current.url} /> : null}

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
          Showing {index + 1} of {attachments.length} · uploaded by{" "}
          <span className="font-medium text-foreground">{current.uploaderName}</span> · {formatWhen(current.createdAt)}
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

      <UploadRounds attachments={attachments} index={index} onIndexChange={onIndexChange} />
    </div>
  );
}

// Every upload, grouped by who added it and when, oldest round first and the latest one marked.
// The tiles wrap onto new rows instead of scrolling sideways, so everything is visible at once.
function UploadRounds({
  attachments,
  index,
  onIndexChange,
}: {
  attachments: PanelAttachment[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const groups = groupUploads(attachments);
  const latest = groups[groups.length - 1];

  return (
    <div className="space-y-2 border-t border-border pt-3">
      {groups.length > 1 && latest ? (
        <p className="text-xs">
          <span className="font-semibold text-primary">Latest upload:</span> {describeUploads(latest.items)} by{" "}
          <span className="font-medium">{latest.uploaderName}</span> · {formatWhen(latest.at)}
        </p>
      ) : null}
      <ol className="space-y-3">
        {groups.map((group, groupIndex) => {
          const isLatest = group === latest && groups.length > 1;
          return (
            <li
              key={group.key}
              className={cn("border p-2", isLatest ? "border-primary/50 bg-primary/5" : "border-border")}
              aria-label={`Upload ${groupIndex + 1} by ${group.uploaderName}`}
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <p className="text-xs">
                  <span className="text-muted-foreground">{ordinal(groupIndex + 1)} upload · </span>
                  <span className="font-semibold">{group.uploaderName}</span>
                  <span className="text-muted-foreground"> · {describeUploads(group.items)}</span>
                </p>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {isLatest ? (
                    <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                      Latest
                    </span>
                  ) : null}
                  {formatWhen(group.at)}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6">
                {group.items.map(({ attachment, index: itemIndex }) => (
                  <UploadTile
                    key={attachment.id}
                    attachment={attachment}
                    position={itemIndex + 1}
                    selected={itemIndex === index}
                    onSelect={() => onIndexChange(itemIndex)}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ordinal(value: number) {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][value % 10] ?? "th";
  return `${value}${suffix}`;
}

function UploadTile({
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
  const picture = attachment.kind === "image" ? (attachment.thumbUrl ?? attachment.url) : attachment.thumbUrl;
  const kindLabel = attachment.kind === "pdf" ? "PDF" : attachment.kind === "link" ? "Link" : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Show item ${position}${attachment.fileName ? `: ${attachment.fileName}` : ""}`}
      aria-current={selected}
      title={attachment.fileName ?? undefined}
      className={cn(
        "relative flex aspect-[4/5] items-center justify-center overflow-hidden border bg-card text-muted-foreground transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50",
      )}
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs
        <img src={picture} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
      ) : attachment.kind === "pdf" ? (
        <FileText className="h-5 w-5" />
      ) : (
        <Link2 className="h-5 w-5" />
      )}
      {kindLabel ? (
        <span className="absolute bottom-0.5 right-0.5 rounded-sm bg-black/75 px-1 text-[9px] font-semibold text-white">{kindLabel}</span>
      ) : null}
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
