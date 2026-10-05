import { addStoredAttachmentAction } from "@/app/tools/content-board/actions";
import { prepareImage } from "@/components/content-board/compress-image";
import { renderPdfThumbnail } from "@/components/content-board/pdf-thumbnail";
import { createClient } from "@/lib/supabase/client";
import { CONTENT_BUCKET, checkAttachmentFile } from "@/lib/utils/content-board";

// Uploads one image or PDF straight to storage, then records it on the idea.
// If recording fails the stored files are removed again, so nothing is left behind.
export async function uploadAttachmentFile(file: File, ideaId: string, workspaceId: string) {
  const problem = checkAttachmentFile(file);
  if (problem) throw new Error(problem);
  const isPdf = file.type === "application/pdf";

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
      const storagePath = `${base}.pdf`;
      await put(storagePath, file, "application/pdf");
      // A picture of the first page, so the board card can show the carousel. Optional: without it
      // the card just says "PDF carousel".
      let thumbPath: string | null = null;
      const thumb = await renderPdfThumbnail(file);
      if (thumb) {
        const path = `${base}_thumb.${thumb.type === "image/webp" ? "webp" : "jpg"}`;
        try {
          await put(path, thumb, thumb.type);
          thumbPath = path;
        } catch {
          thumbPath = null;
        }
      }
      const result = await addStoredAttachmentAction({
        ideaId,
        kind: "pdf",
        storagePath,
        thumbPath,
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
