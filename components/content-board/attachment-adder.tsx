"use client";

import { useRef, useState, useTransition } from "react";
import { Link2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addLinkAttachmentAction, addStoredAttachmentAction } from "@/app/tools/content-board/actions";
import { prepareImage } from "@/components/content-board/compress-image";
import { createClient } from "@/lib/supabase/client";
import { CONTENT_BUCKET, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_IDEA } from "@/lib/utils/content-board";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

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
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const room = MAX_ATTACHMENTS_PER_IDEA - currentCount;
  const busy = uploading !== null || pending;

  async function uploadOne(file: File) {
    const isPdf = file.type === "application/pdf";
    if (!isPdf && !IMAGE_TYPES.includes(file.type)) throw new Error("Use PNG, JPG, WebP or PDF files.");

    const supabase = createClient();
    const base = `${workspaceId}/${ideaId}/${crypto.randomUUID()}`;
    const uploaded: string[] = [];
    const put = async (path: string, body: Blob, contentType: string) => {
      const { error: uploadError } = await supabase.storage
        .from(CONTENT_BUCKET)
        .upload(path, body, { contentType, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      uploaded.push(path);
    };

    try {
      if (isPdf) {
        if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("PDFs can be up to 15 MB.");
        const storagePath = `${base}.pdf`;
        await put(storagePath, file, "application/pdf");
        const result = await addStoredAttachmentAction({
          ideaId,
          kind: "pdf",
          storagePath,
          fileName: file.name,
          sizeBytes: file.size,
        });
        if (!result.ok) throw new Error(result.error);
      } else {
        const prepared = await prepareImage(file);
        const storagePath = `${base}.${prepared.full.ext}`;
        const thumbPath = `${base}_thumb.${prepared.thumb.ext}`;
        await put(storagePath, prepared.full.blob, prepared.full.contentType);
        await put(thumbPath, prepared.thumb.blob, prepared.thumb.contentType);
        const result = await addStoredAttachmentAction({
          ideaId,
          kind: "image",
          storagePath,
          thumbPath,
          fileName: file.name,
          sizeBytes: prepared.full.blob.size,
        });
        if (!result.ok) throw new Error(result.error);
      }
    } catch (failure) {
      if (uploaded.length) await supabase.storage.from(CONTENT_BUCKET).remove(uploaded);
      throw failure;
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    setError(null);
    if (files.length > room) {
      setError(room > 0 ? `You can add ${room} more here (up to ${MAX_ATTACHMENTS_PER_IDEA} per idea).` : `This idea already has ${MAX_ATTACHMENTS_PER_IDEA} items.`);
      return;
    }

    const problems: string[] = [];
    for (const [i, file] of files.entries()) {
      setUploading(`Uploading ${i + 1} of ${files.length}…`);
      try {
        await uploadOne(file);
      } catch (failure) {
        problems.push(`${file.name}: ${failure instanceof Error ? failure.message : "upload failed"}`);
      }
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = "";
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
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="sr-only"
          aria-label="Choose images or a PDF"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy || room <= 0} onClick={() => fileInput.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Add images or PDF
        </Button>
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
      {uploading ? <p className="text-xs text-muted-foreground">{uploading}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
