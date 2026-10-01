"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createIdeaAction } from "@/app/tools/content-board/actions";
import { FileDropZone } from "@/components/content-board/file-drop-zone";
import { ReferenceLinksField } from "@/components/content-board/reference-links-field";
import { PLATFORM_META, PLATFORM_OPTIONS } from "@/components/content-board/types";
import { uploadAttachmentFile } from "@/components/content-board/upload-attachment";
import { ATTACHMENT_ACCEPT, checkAttachmentFile, MAX_ATTACHMENTS_PER_IDEA } from "@/lib/utils/content-board";
import { cn } from "@/lib/utils/cn";

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function CreateIdeaDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  // The idea exists but some files failed: the form is done, only Close is left.
  const [created, setCreated] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New idea</Button>;
  }

  function close() {
    setOpen(false);
    setError(null);
    setFiles([]);
    setFileError(null);
    setProgress(null);
    setCreated(false);
  }

  function addFiles(incoming: File[]) {
    setFileError(null);
    const next = [...files];
    const problems: string[] = [];
    for (const file of incoming) {
      const problem = checkAttachmentFile(file);
      if (problem) {
        problems.push(`${file.name}: ${problem}`);
        continue;
      }
      if (next.some((existing) => existing.name === file.name && existing.size === file.size)) continue;
      if (next.length >= MAX_ATTACHMENTS_PER_IDEA) {
        problems.push(`An idea can have up to ${MAX_ATTACHMENTS_PER_IDEA} files.`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
    if (problems.length) setFileError(problems.join(" "));
    if (fileInput.current) fileInput.current.value = "";
  }

  const filesFull = files.length >= MAX_ATTACHMENTS_PER_IDEA;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-5 popover-shadow">
        <h2 className="text-lg font-semibold">New idea</h2>
        <form
          onSubmit={(event) => {
            // Not a form `action`: React would clear every field after a failed save.
            event.preventDefault();
            if (created) return;
            const formData = new FormData(event.currentTarget);
            setError(null);
            startTransition(async () => {
              const result = await createIdeaAction(formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              if (files.length === 0) {
                close();
                return;
              }

              // The files need the idea's id, so they go up once the idea exists.
              const problems: string[] = [];
              for (const [i, file] of files.entries()) {
                setProgress(`Uploading file ${i + 1} of ${files.length}…`);
                try {
                  await uploadAttachmentFile(file, result.ideaId, result.workspaceId);
                } catch (failure) {
                  problems.push(`${file.name}: ${failure instanceof Error ? failure.message : "upload failed"}`);
                }
              }
              setProgress(null);
              if (problems.length) {
                setError(`The idea was created, but some files didn't upload. ${problems.join(" ")} You can add them from the idea.`);
                setCreated(true);
              } else {
                close();
              }
            });
          }}
          className="mt-4 space-y-4"
        >
          <div>
            <Label htmlFor="platform">Platform</Label>
            <select
              id="platform"
              name="platform"
              required
              defaultValue=""
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="" disabled>
                Choose a platform
              </option>
              {PLATFORM_OPTIONS.map((platform) => (
                <option key={platform} value={platform}>
                  {PLATFORM_META[platform].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="title">What are we posting?</Label>
            <Input id="title" name="title" required minLength={2} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="description">Details</Label>
            <Textarea id="description" name="description" className="mt-1" rows={3} />
          </div>
          <div>
            <Label htmlFor="scheduledFor">Post on (optional)</Label>
            <Input id="scheduledFor" name="scheduledFor" type="date" className="mt-1" />
          </div>
          <ReferenceLinksField />

          <div>
            <Label htmlFor="create-files">Images or PDF (optional)</Label>
            <FileDropZone
              className="mt-1 space-y-2"
              disabled={pending || created || filesFull}
              onFiles={addFiles}
            >
              {(dragging) => (
                <>
                  <input
                    ref={fileInput}
                    id="create-files"
                    type="file"
                    multiple
                    accept={ATTACHMENT_ACCEPT}
                    className="sr-only"
                    onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || created || filesFull}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    Add images or PDF
                  </Button>
                  <p className={cn("text-xs", dragging ? "font-medium text-primary" : "text-muted-foreground")}>
                    {dragging ? "Drop to add" : "Drag and drop files here. They upload when you create the idea."}
                  </p>
                  {files.length > 0 ? (
                    <ul className="divide-y divide-border border border-border">
                      {files.map((file, index) => (
                        <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                          <span className="min-w-0 flex-1 truncate">{file.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span>
                          {!pending && !created ? (
                            <button
                              type="button"
                              aria-label={`Remove ${file.name}`}
                              onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                              className="shrink-0 p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </FileDropZone>
            {fileError ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {fileError}
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {progress ? <p className="text-sm text-muted-foreground">{progress}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            {created ? (
              <Button type="button" onClick={close}>
                Close
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={pending} onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {progress ? "Uploading…" : pending ? "Creating…" : "Create idea"}
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
