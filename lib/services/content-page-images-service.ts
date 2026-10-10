import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { openPdfForPictures } from "@/lib/mcp/pdf-pages";
import { CONTENT_BUCKET } from "@/lib/utils/content-board";
import { pageImagesPrefix, pageImagesReady, PAGE_IMAGE_SIDE, MAX_PAGE_IMAGES, type PageImageInfo } from "@/lib/utils/page-images";

// How long one call keeps drawing before it saves what it has and hands back, so a long PDF is drawn
// over a few calls rather than running past the server's time limit.
const DEFAULT_BUDGET_MS = 40_000;
// Someone else is drawing this PDF's pages if they started less than this long ago.
const LEASE_MS = 90_000;

export type PageImagesProgress = { ready: boolean; busy?: boolean; rendered: number; pageCount: number | null };

// Draws the pages of a PDF attachment as pictures and stores them next to the PDF, picking up where an
// earlier call stopped. Uses the service client: members can read attachments but not change them, and
// the caller has already checked this person can see the attachment.
export async function renderPageImages(
  admin: SupabaseClient<any>,
  attachmentId: string,
  options: { budgetMs?: number } = {},
): Promise<PageImagesProgress> {
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  const { data: row, error } = await admin
    .from("content_idea_attachments")
    .select("id, kind, storage_path, page_images, page_count")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.kind !== "pdf" || !row.storage_path) return { ready: true, rendered: 0, pageCount: null };
  const pages: PageImageInfo[] = Array.isArray(row.page_images) ? row.page_images : [];
  if (pageImagesReady(pages, row.page_count)) return { ready: true, rendered: pages.length, pageCount: row.page_count };

  // Only one drawer at a time.
  const staleBefore = new Date(Date.now() - LEASE_MS).toISOString();
  const { data: leased, error: leaseError } = await admin
    .from("content_idea_attachments")
    .update({ pages_rendering_at: new Date().toISOString() })
    .eq("id", attachmentId)
    .or(`pages_rendering_at.is.null,pages_rendering_at.lt.${staleBefore}`)
    .select("id");
  if (leaseError) throw leaseError;
  if (!leased?.length) return { ready: false, busy: true, rendered: pages.length, pageCount: row.page_count };

  let pageCount: number | null = row.page_count;
  try {
    const { data: file, error: downloadError } = await admin.storage.from(CONTENT_BUCKET).download(row.storage_path);
    if (downloadError) throw downloadError;
    const pdf = await openPdfForPictures(new Uint8Array(await file.arrayBuffer()));
    try {
      pageCount = pdf.pageCount;
      const last = Math.min(pdf.pageCount, MAX_PAGE_IMAGES);
      const prefix = pageImagesPrefix(row.storage_path);
      for (let number = pages.length + 1; number <= last && Date.now() < deadline; number++) {
        const image = await pdf.drawPage(number, PAGE_IMAGE_SIDE);
        const path = `${prefix}${number}.webp`;
        const { error: uploadError } = await admin.storage
          .from(CONTENT_BUCKET)
          .upload(path, image.bytes, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
        if (uploadError) throw uploadError;
        pages.push({ path, width: image.width, height: image.height });
        // Saved as it goes, so a call cut short keeps the pages it finished.
        const { error: saveError } = await admin
          .from("content_idea_attachments")
          .update({ page_images: pages, page_count: pdf.pageCount })
          .eq("id", attachmentId);
        if (saveError) throw saveError;
      }
    } finally {
      await pdf.close();
    }
  } finally {
    await admin.from("content_idea_attachments").update({ pages_rendering_at: null }).eq("id", attachmentId);
  }
  return { ready: pageImagesReady(pages, pageCount), rendered: pages.length, pageCount };
}
