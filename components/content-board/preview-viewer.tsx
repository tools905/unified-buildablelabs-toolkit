"use client";

import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Link2 } from "lucide-react";
import { InlineConfirmButton } from "@/components/content-board/inline-confirm-button";
import { formatWhen } from "@/components/content-board/activity";
import { useDownloadUrl } from "@/components/content-board/use-download-url";
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
  const download = useDownloadUrl(current && current.kind !== "link" ? current.id : null);

  if (!current) {
    return (
      <div className="flex h-40 items-center justify-center border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
        No preview yet. Add images, a PDF or a design link below.
      </div>
    );
  }

  const canStep = attachments.length > 1 && current.kind !== "pdf";
  const downloadUrl = current.kind !== "link" ? current.url : null;

  return (
    <div className="space-y-2">
      <div className="relative h-[64vh] min-h-[320px] overflow-hidden border border-border bg-muted/30">
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
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {attachments.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onIndexChange(i)}
              aria-label={`Show item ${i + 1}`}
              aria-current={i === index}
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border bg-card text-muted-foreground transition-colors",
                i === index ? "border-primary" : "border-border hover:border-primary/50",
              )}
            >
              {item.kind === "image" && item.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs
                <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : item.kind === "pdf" ? (
                <FileText className="h-5 w-5" />
              ) : (
                <Link2 className="h-5 w-5" />
              )}
            </button>
          ))}
        </div>
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
          {downloadUrl ? (
            download.url ? (
              // A plain link: the storage server answers it with a "save as" header, so the browser
              // downloads the file itself. That works on phones and in in-app browsers, where a script
              // saving a fetched copy often does nothing.
              <a
                href={download.url}
                rel="noopener"
                className="inline-flex h-10 items-center gap-1.5 px-3 text-sm text-muted-foreground hover:text-foreground sm:h-8 sm:px-2 sm:text-xs"
              >
                <Download className="h-4 w-4 sm:h-3 sm:w-3" />
                Download
              </a>
            ) : download.error ? (
              <button
                type="button"
                onClick={download.retry}
                title={download.error}
                className="inline-flex h-10 items-center gap-1.5 px-3 text-sm text-destructive sm:h-8 sm:px-2 sm:text-xs"
              >
                <Download className="h-4 w-4 sm:h-3 sm:w-3" />
                Couldn&apos;t prepare it. Retry
              </button>
            ) : (
              <span aria-busy="true" className="inline-flex h-10 items-center gap-1.5 px-3 text-sm text-muted-foreground opacity-60 sm:h-8 sm:px-2 sm:text-xs">
                <Download className="h-4 w-4 sm:h-3 sm:w-3" />
                Preparing…
              </span>
            )
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
      <p className="text-xs text-muted-foreground">
        Uploaded by {current.uploaderName} · {formatWhen(current.createdAt)}
      </p>
    </div>
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
