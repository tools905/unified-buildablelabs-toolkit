import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { exportFolder, listAttachments } from "@/lib/services/content-attachment-service";
import { CONTENT_BUCKET, groupIntoDrafts } from "@/lib/utils/content-board";
import { exportKey, ideaPdfFileName, pageSizeFor } from "@/lib/utils/content-export";
import { mimeTypeFromPath } from "@/lib/utils/download-name";

const DOWNLOAD_LINK_TTL_SECONDS = 10 * 60;
// PDFs made for downloading are kept so a second download is instant; beyond this many per idea the
// oldest are removed.
const KEEP_EXPORTS = 10;

export class NothingToDownloadError extends Error {
  constructor() {
    super("This idea has no images or PDFs to download yet.");
  }
}

async function readFile(supabase: SupabaseClient<any>, path: string) {
  const { data, error } = await supabase.storage.from(CONTENT_BUCKET).download(path);
  if (error || !data) throw error ?? new Error("Could not read an uploaded file.");
  return new Uint8Array(await data.arrayBuffer());
}

// Builds one PDF from every uploaded image and PDF of an idea, in upload order: an image becomes a
// page, a PDF adds all of its pages.
export async function buildIdeaPdf(supabase: SupabaseClient<any>, files: { kind: string; storage_path: string }[], title: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer("BuildableLabs Team Connect");

  for (const file of files) {
    const bytes = await readFile(supabase, file.storage_path);
    if (file.kind === "pdf") {
      const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await doc.copyPages(source, source.getPageIndices());
      pages.forEach((page) => doc.addPage(page));
      continue;
    }

    const mime = mimeTypeFromPath(file.storage_path);
    // PDF files can only hold JPEG and PNG pictures, so anything else (WebP) is converted first.
    const image =
      mime === "image/png"
        ? await doc.embedPng(bytes)
        : mime === "image/jpeg"
          ? await doc.embedJpg(bytes)
          : await doc.embedJpg(await sharp(bytes).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer());
    const size = pageSizeFor(image.width, image.height);
    const page = doc.addPage([size.width, size.height]);
    page.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
  }

  return doc.save();
}

// A short-lived link that downloads one draft of the idea's post as a single PDF: the draft made of
// `fileIds` (the one on screen), or the latest draft when none are given. Uses the caller's own
// Supabase client, so row-level security decides who may download what.
export async function getIdeaPdfDownloadUrl(supabase: SupabaseClient<any>, ideaId: string, fileIds: string[] = []) {
  const { data: idea, error } = await supabase
    .from("content_ideas")
    .select("id, title, workspace_id")
    .eq("id", ideaId)
    .maybeSingle();
  if (error) throw error;
  if (!idea) throw new NothingToDownloadError();

  const all = await listAttachments(supabase, ideaId);
  const drafts = groupIntoDrafts(all, (item) => item.created_by, (item) => item.created_at);
  const draftIndex = fileIds.length
    ? drafts.findIndex((draft) => draft.some((item) => fileIds.includes(item.id)))
    : drafts.length - 1;
  const draft = draftIndex >= 0 ? drafts[draftIndex] : [];
  const chosen = fileIds.length ? draft.filter((item) => fileIds.includes(item.id)) : draft;
  const files = chosen.filter(
    (item): item is typeof item & { storage_path: string } => item.kind !== "link" && Boolean(item.storage_path),
  );
  if (files.length === 0) throw new NothingToDownloadError();

  const fileName = ideaPdfFileName(drafts.length > 1 ? `${idea.title} - draft ${draftIndex + 1}` : idea.title);
  const storage = supabase.storage.from(CONTENT_BUCKET);

  // A single uploaded PDF already is the download.
  let path = files.length === 1 && files[0].kind === "pdf" ? files[0].storage_path : null;

  if (!path) {
    const folder = exportFolder(idea.workspace_id, ideaId);
    const name = `${exportKey(files)}.pdf`;
    path = `${folder}/${name}`;
    const { data: existing } = await storage.list(folder, { limit: 100 });
    if (!existing?.some((item) => item.name === name)) {
      const pdf = await buildIdeaPdf(supabase, files, idea.title);
      const { error: uploadError } = await storage.upload(path, pdf, { contentType: "application/pdf", upsert: false });
      // Someone else may have made the same PDF a moment ago; theirs is just as good.
      if (uploadError && !/exists|duplicate/i.test(uploadError.message)) throw uploadError;
      // Keep the PDFs of other drafts for quick downloads, but only the most recent few.
      const older = (existing ?? [])
        .filter((item) => item.name !== name)
        .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
        .slice(KEEP_EXPORTS - 1)
        .map((item) => `${folder}/${item.name}`);
      if (older.length) await storage.remove(older);
    }
  }

  const { data, error: signError } = await storage.createSignedUrl(path, DOWNLOAD_LINK_TTL_SECONDS, { download: fileName });
  if (signError || !data?.signedUrl) throw signError ?? new Error("Could not prepare the download.");
  return data.signedUrl;
}
