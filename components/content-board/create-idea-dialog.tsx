"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createIdeaAction } from "@/app/tools/content-board/actions";
import { UploadDropZone } from "@/components/content-board/upload-drop-zone";
import { CaptionField } from "@/components/content-board/caption-field";
import { AssigneePicker } from "@/components/content-board/assignee-picker";
import { ReferenceLinksField } from "@/components/content-board/reference-links-field";
import { PlatformPicker } from "@/components/content-board/platform-picker";
import { type ContentMemberOption } from "@/components/content-board/types";
import { uploadAttachmentFile } from "@/components/content-board/upload-attachment";
import { checkAttachmentFile, MAX_ATTACHMENTS_PER_IDEA } from "@/lib/utils/content-board";

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function CreateIdeaDialog({
  members,
  isAdmin,
  currentUserId,
}: {
  members: ContentMemberOption[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  // The idea exists but some files failed: the form is done, only Close is left.
  const [created, setCreated] = useState(false);

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
  }

  const filesFull = files.length >= MAX_ATTACHMENTS_PER_IDEA;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-lg border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] popover-shadow sm:max-w-md sm:rounded-lg">
        <h2 className="text-lg font-semibold">New idea</h2>
        <form
          onSubmit={(event) => {
            // Not a form `action`: React would clear every field after a failed save.
            event.preventDefault();
            if (created) return;
            const formData = new FormData(event.currentTarget);
            // Any one thing is enough: a title, details, a caption, a reference post or a file.
            const typed = ["title", "description", "caption"].some((field) => String(formData.get(field) ?? "").trim());
            const linked = formData.getAll("referenceLinks").some((link) => String(link).trim());
            if (!typed && !linked && files.length === 0) {
              setError("Add a title, details, a caption, a reference post or a file.");
              return;
            }
            // Only files: the first file's name becomes the title.
            if (!typed && !linked) formData.set("title", files[0].name.replace(/\.[^.]+$/, ""));
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
            <Label>Platforms</Label>
            <PlatformPicker />
          </div>
          <div>
            <Label htmlFor="title">What are we posting?</Label>
            <Input id="title" name="title" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="description">Details</Label>
            <Textarea id="description" name="description" className="mt-1" rows={3} />
          </div>
          <CaptionField />
          <div>
            <Label htmlFor="scheduledFor">Post on (optional)</Label>
            <Input id="scheduledFor" name="scheduledFor" type="date" className="mt-1" />
          </div>
          <ReferenceLinksField />
          {isAdmin ? <AssigneePicker members={members} currentUserId={currentUserId} /> : null}

          <div>
            <Label htmlFor="create-files">Images or PDF (optional)</Label>
            <UploadDropZone
              className="mt-1"
              inputId="create-files"
              disabled={pending || created || filesFull}
              onFiles={addFiles}
            />
            <p className="mt-1 text-xs text-muted-foreground">Files upload when you create the idea.</p>
            {files.length > 0 ? (
              <ul className="mt-2 divide-y divide-border border border-border">
                {files.map((file, index) => (
                  <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span>
                    {!pending && !created ? (
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                        className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
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
