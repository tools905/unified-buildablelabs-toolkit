"use client";

import { useRef } from "react";
import { Loader2, Upload } from "lucide-react";
import { FileDropZone } from "@/components/content-board/file-drop-zone";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS_PER_IDEA } from "@/lib/utils/content-board";
import { cn } from "@/lib/utils/cn";

// The usual upload box: an Upload button in the middle of a dashed area that also takes files
// dragged onto it. Clicking anywhere in the box opens the file picker.
export function UploadDropZone({
  onFiles,
  disabled = false,
  onBlockedDrop,
  busyLabel = null,
  inputId,
  className,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  onBlockedDrop?: () => void;
  // Shown instead of the hint while files are uploading.
  busyLabel?: string | null;
  inputId?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <FileDropZone
      disabled={disabled}
      onBlockedDrop={onBlockedDrop}
      onFiles={onFiles}
      className={cn("rounded-lg p-0", disabled ? "opacity-70" : "hover:border-primary/50", className)}
    >
      {(dragging) => (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label="Upload images or a PDF"
          onClick={() => {
            if (!disabled) input.current?.click();
          }}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              input.current?.click();
            }
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 px-4 py-6 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <input
            ref={input}
            id={inputId}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              onFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <span className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold shadow-sm">
            {busyLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busyLabel ? "Uploading…" : "Upload"}
          </span>
          <p className={cn("text-sm font-medium", dragging && "text-primary")}>
            {dragging ? "Drop to upload" : busyLabel ?? "Choose a file or drag & drop it here"}
          </p>
          <p className="text-xs text-muted-foreground">
            PNG, JPG, WebP or PDF · PDFs up to 15 MB · up to {MAX_ATTACHMENTS_PER_IDEA} files
          </p>
        </div>
      )}
    </FileDropZone>
  );
}
