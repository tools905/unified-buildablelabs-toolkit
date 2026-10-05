"use client";

import { useState, useTransition } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addLinkAttachmentAction } from "@/app/tools/content-board/actions";
import { UploadDropZone } from "@/components/content-board/upload-drop-zone";
import { uploadAttachmentFile } from "@/components/content-board/upload-attachment";
import { MAX_ATTACHMENTS_PER_IDEA } from "@/lib/utils/content-board";

export function AttachmentAdder({
  ideaId,
  workspaceId,
  currentCount,
  onChanged,
}: {
  ideaId: string;
  workspaceId: string;
  currentCount: number;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const room = MAX_ATTACHMENTS_PER_IDEA - currentCount;
  const busy = uploading !== null || pending;

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setError(null);
    if (files.length > room) {
      setError(room > 0 ? `You can add ${room} more here (up to ${MAX_ATTACHMENTS_PER_IDEA} per idea).` : `This idea already has ${MAX_ATTACHMENTS_PER_IDEA} items.`);
      return;
    }

    const problems: string[] = [];
    for (const [i, file] of files.entries()) {
      setUploading(`Uploading ${i + 1} of ${files.length}…`);
      try {
        await uploadAttachmentFile(file, ideaId, workspaceId);
      } catch (failure) {
        problems.push(`${file.name}: ${failure instanceof Error ? failure.message : "upload failed"}`);
      }
    }
    setUploading(null);
    if (problems.length) setError(problems.join(" "));
    onChanged();
  }

  function addLink() {
    setError(null);
    startTransition(async () => {
      const result = await addLinkAttachmentAction({ ideaId, url: link });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLink("");
      setShowLink(false);
      onChanged();
    });
  }

  return (
    <div className="space-y-2">
      <UploadDropZone
        disabled={busy || room <= 0}
        busyLabel={uploading}
        onBlockedDrop={() => {
          if (room <= 0) setError(`This idea already has ${MAX_ATTACHMENTS_PER_IDEA} items.`);
        }}
        onFiles={(files) => void handleFiles(files)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy || room <= 0} onClick={() => setShowLink((value) => !value)}>
          <Link2 className="h-4 w-4" />
          Add design link
        </Button>
        <span className="text-xs text-muted-foreground">
          {currentCount} / {MAX_ATTACHMENTS_PER_IDEA}
        </span>
      </div>

      {showLink ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addLink();
          }}
        >
          <Input
            type="url"
            required
            placeholder="https://www.canva.com/design/…/view"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            aria-label="Design link"
          />
          <Button type="submit" size="sm" disabled={pending}>
            Add
          </Button>
        </form>
      ) : null}

      {showLink ? (
        <p className="text-xs text-muted-foreground">
          Works with Canva view links, Figma, Google Drive and Slides. Share it as &quot;anyone with the link&quot; so it can load.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
