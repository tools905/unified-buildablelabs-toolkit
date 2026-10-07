"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { UploadDropZone } from "@/components/content-board/upload-drop-zone";
import { prepareImage } from "@/components/content-board/compress-image";
import { renderPdfThumbnail } from "@/components/content-board/pdf-thumbnail";
import { MCP_UPLOAD_API_PATH, uploadPrepareResultSchema, uploadResultSchema, type UploadFileInput, type UploadResult } from "@/lib/mcp/contract";
import { createClient } from "@/lib/supabase/client";
import { BASE_PATH } from "@/lib/utils/app-url";
import { CONTENT_BUCKET, checkAttachmentFile } from "@/lib/utils/content-board";

// The page's one job: take a file, show what is happening, and say clearly when it is done. The file goes
// straight to storage (not through the server) and the server checks it afterwards: see "The upload page"
// in lib/mcp/contract.ts.

type Done = Extract<UploadResult, { ok: true }>;
type Problem = { message: string; canRetry: boolean };

const MAX_BYTES_MESSAGE = (mb: number) => `Files can be up to ${mb} MB.`;

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "omit" });
  return response.json();
}

const withExtension = (name: string, ext: string) => `${name.replace(/\.[^.]*$/, "") || "image"}.${ext}`;

// `notes` are the facts about the link (limits, expiry). They are hidden once the file is in, because by
// then "this link works once" and the file count are out of date.
export function UploadBox({ token, maxBytes, notes }: { token: string; maxBytes: number; notes?: React.ReactNode }) {
  const [stage, setStage] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  async function send(file: File) {
    setProblem(null);
    const invalid = checkAttachmentFile(file);
    if (invalid) return setProblem({ message: invalid, canRetry: true });
    if (file.size > maxBytes * 2) return setProblem({ message: MAX_BYTES_MESSAGE(Math.round(maxBytes / (1024 * 1024))), canRetry: true });

    try {
      setStage("Preparing…");
      let fullBlob: Blob = file;
      let fileName = file.name;
      let contentType = file.type;
      let thumb: Blob | null = null;
      if (file.type === "application/pdf") {
        thumb = await renderPdfThumbnail(file);
      } else {
        // Images are shrunk first, exactly as on the board, and come with a small picture for the card.
        const prepared = await prepareImage(file);
        fullBlob = prepared.full.blob;
        contentType = prepared.full.contentType;
        fileName = withExtension(file.name, prepared.full.ext);
        thumb = prepared.thumb.blob;
      }
      if (fullBlob.size > maxBytes) return setProblem({ message: MAX_BYTES_MESSAGE(Math.round(maxBytes / (1024 * 1024))), canRetry: true });

      const thumbnailType = thumb && (thumb.type === "image/webp" || thumb.type === "image/jpeg") ? thumb.type : null;
      const input: Omit<UploadFileInput, "thumbnail_type"> & { thumbnail_type: "image/jpeg" | "image/webp" | null } = {
        file_name: fileName,
        content_type: contentType,
        size_bytes: fullBlob.size,
        thumbnail_type: thumbnailType,
      };
      const api = `${BASE_PATH}${MCP_UPLOAD_API_PATH}/${encodeURIComponent(token)}`;

      const prepare = uploadPrepareResultSchema.parse(await postJson(`${api}/prepare`, input));
      if (!prepare.ok) return setProblem({ message: prepare.message, canRetry: prepare.code === "invalid_input" || prepare.code === "limit_reached" });

      setStage("Uploading…");
      const storage = createClient().storage.from(CONTENT_BUCKET);
      const sent = await storage.uploadToSignedUrl(prepare.file.path, prepare.file.upload_token, fullBlob, { contentType });
      if (sent.error) throw new Error(sent.error.message);
      if (prepare.thumbnail && thumb && thumbnailType) {
        // The picture is a nicety: if it doesn't go, the server draws one for a PDF or goes without.
        await storage.uploadToSignedUrl(prepare.thumbnail.path, prepare.thumbnail.upload_token, thumb, { contentType: thumbnailType }).catch(() => {});
      }

      setStage("Checking…");
      const result = uploadResultSchema.parse(await postJson(`${api}/complete`, { ...input, attempt: prepare.attempt }));
      if (result.ok) return setDone(result);
      setProblem({ message: result.message, canRetry: result.code === "invalid_input" || result.code === "limit_reached" });
    } catch {
      setProblem({ message: "The file could not be sent. Check your connection and try again.", canRetry: true });
    } finally {
      setStage(null);
    }
  }

  if (done) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
        <div className="space-y-1 text-sm">
          <p className="font-semibold">Uploaded: {done.file_name}</p>
          <p className="text-muted-foreground">
            {done.kind === "pdf" && done.page_count ? `${done.page_count} ${done.page_count === 1 ? "page" : "pages"}. ` : ""}
            {done.replaced_attachment_id ? "It replaced the earlier file. " : ""}
            Go back to the app and tell it the upload is done.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <UploadDropZone onFiles={(files) => files[0] && void send(files[0])} disabled={stage !== null} busyLabel={stage} />
      <p aria-live="polite" className="sr-only">
        {stage ?? ""}
      </p>
      {problem ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/40 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="text-destructive">{problem.message}</p>
            {problem.canRetry ? <p className="text-xs text-muted-foreground">Choose a file to try again.</p> : null}
          </div>
        </div>
      ) : null}
      {notes}
    </div>
  );
}
