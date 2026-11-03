import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import { CONTENT_BUCKET, COLUMN_LABELS, groupIntoDrafts } from "@/lib/utils/content-board";
import { MAX_EXPORT_POSTS, pdfSafeText, selectForExport } from "@/lib/utils/board-export";
import { pageSizeFor } from "@/lib/utils/content-export";
import { pageImagesReady, type PageImageInfo } from "@/lib/utils/page-images";
import type { ContentIdeaStatus, ContentPlatform } from "@/lib/db/types";

const DOWNLOAD_LINK_TTL_SECONDS = 10 * 60;
// Storage takes files up to 50 MB.
const MAX_FILE_BYTES = 48 * 1024 * 1024;
// Pages are pictures this size (longest side), which keeps a month of carousels to a sensible file.
const PICTURE_SIDE = 1350;
const KEEP_EXPORTS = 5;

const COVER = { width: 1080, height: 1350, margin: 80 };
const INK = rgb(0.07, 0.07, 0.09);
const MUTED = rgb(0.42, 0.44, 0.5);
const ACCENT = rgb(0.04, 0.25, 0.87);

export class ExportProblem extends Error {}

type Attachment = {
  id: string;
  kind: "image" | "pdf" | "link";
  storage_path: string | null;
  page_images: PageImageInfo[] | null;
  page_count: number | null;
  sort_order: number;
  created_by: string;
  created_at: string;
};

type IdeaRow = {
  id: string;
  title: string;
  status: ContentIdeaStatus;
  scheduled_for: string | null;
  posted_at: string | null;
  caption: string | null;
  post_url: string | null;
  platform: ContentPlatform;
  platforms: ContentPlatform[] | null;
  attachments: Attachment[] | null;
};

const PLATFORM_NAMES: Record<string, string> = {
  any: "Any",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  youtube: "YouTube",
  facebook: "Facebook",
  blog: "Blog",
  newsletter: "Newsletter",
};

const longDay = (day: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

// Splits text into lines that fit `width` at `size`, keeping the writer's own line breaks. A word too
// long for a line (a web address) is broken where it reaches the edge.
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  const pieces = (word: string) => {
    const out: string[] = [];
    let piece = "";
    for (const char of word) {
      if (piece && font.widthOfTextAtSize(piece + char, size) > width) {
        out.push(piece);
        piece = "";
      }
      piece += char;
    }
    if (piece) out.push(piece);
    return out;
  };
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ").flatMap(pieces)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

// Draws lines from `y` downwards; stops (with "…") before `bottom`. Returns where it ended.
function drawLines(page: PDFPage, lines: string[], options: { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb>; bottom: number; gap?: number }) {
  let y = options.y;
  const step = options.size * (options.gap ?? 1.3);
  for (let index = 0; index < lines.length; index++) {
    if (y - step < options.bottom) {
      page.drawText("...", { x: options.x, y, size: options.size, font: options.font, color: options.color });
      return y - step;
    }
    page.drawText(lines[index], { x: options.x, y, size: options.size, font: options.font, color: options.color });
    y -= step;
  }
  return y;
}

async function readFile(supabase: SupabaseClient<any>, path: string) {
  const { data, error } = await supabase.storage.from(CONTENT_BUCKET).download(path);
  if (error || !data) throw error ?? new Error("Could not read an uploaded file.");
  return new Uint8Array(await data.arrayBuffer());
}

const toJpeg = (bytes: Uint8Array) =>
  sharp(bytes).resize({ width: PICTURE_SIDE, height: PICTURE_SIDE, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer();

// The latest draft's pages, as pictures where it can (small files), else the PDF's own pages.
async function addDraftPages(supabase: SupabaseClient<any>, doc: PDFDocument, attachments: Attachment[]) {
  const sorted = [...attachments].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const drafts = groupIntoDrafts(sorted, (item) => item.created_by, (item) => item.created_at);
  const files = (drafts[drafts.length - 1] ?? []).filter((item) => item.kind !== "link" && item.storage_path);
  for (const file of files) {
    if (file.kind === "pdf" && !pageImagesReady(file.page_images, file.page_count)) {
      const source = await PDFDocument.load(await readFile(supabase, file.storage_path!), { ignoreEncryption: true });
      (await doc.copyPages(source, source.getPageIndices())).forEach((page) => doc.addPage(page));
      continue;
    }
    const paths = file.kind === "pdf" ? (file.page_images ?? []).map((page) => page.path) : [file.storage_path!];
    // A few at a time: quick, without holding a whole month of pictures at once.
    for (let start = 0; start < paths.length; start += 6) {
      const pictures = await Promise.all(paths.slice(start, start + 6).map(async (path) => toJpeg(await readFile(supabase, path))));
      for (const picture of pictures) {
        const image = await doc.embedJpg(picture);
        const size = pageSizeFor(image.width, image.height);
        doc.addPage([size.width, size.height]).drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
      }
    }
  }
  return files.length;
}

type ExportInput = { workspaceId: string; from: string; to: string; columns: ContentIdeaStatus[] };

// One PDF of every post in `columns` with a posting day from `from` to `to`: a contents page, then for
// each post a cover page (title, day, column, platforms, caption) followed by its latest draft. Uses
// the caller's client, so row-level security decides what they can export.
export async function buildBoardPdf(supabase: SupabaseClient<any>, input: ExportInput) {
  const { data, error } = await supabase
    .from("content_ideas")
    .select(
      "id, title, status, scheduled_for, posted_at, caption, post_url, platform, platforms, attachments:content_idea_attachments(id, kind, storage_path, page_images, page_count, sort_order, created_by, created_at)",
    )
    .eq("workspace_id", input.workspaceId)
    .in("status", input.columns);
  if (error) throw error;
  const chosen = selectForExport((data ?? []) as IdeaRow[], { from: input.from, to: input.to }, input.columns);
  if (chosen.length === 0) throw new ExportProblem("No posts with a posting day in those dates and columns.");
  if (chosen.length > MAX_EXPORT_POSTS) {
    throw new ExportProblem(`That's ${chosen.length} posts; export up to ${MAX_EXPORT_POSTS} at a time (pick fewer dates).`);
  }

  const doc = await PDFDocument.create();
  const title = `BuildableLabs posts, ${longDay(input.from)} to ${longDay(input.to)}`;
  doc.setTitle(title);
  doc.setProducer("BuildableLabs Team Connect");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = COVER.width - COVER.margin * 2;

  // Contents, carrying on to more pages when there are many posts.
  let contents = doc.addPage([COVER.width, COVER.height]);
  let y = COVER.height - COVER.margin - 20;
  contents.drawText("BUILDABLELABS TEAM CONNECT", { x: COVER.margin, y, size: 18, font: bold, color: ACCENT });
  y -= 70;
  y = drawLines(contents, wrap(pdfSafeText(title), bold, 48, width), { x: COVER.margin, y, size: 48, font: bold, color: INK, bottom: COVER.margin });
  y -= 10;
  const columnNames = input.columns.map((column) => COLUMN_LABELS[column]).join(", ");
  contents.drawText(pdfSafeText(`${chosen.length} ${chosen.length === 1 ? "post" : "posts"} · ${columnNames}`), { x: COVER.margin, y, size: 24, font: regular, color: MUTED });
  y -= 70;
  for (const { idea, day } of chosen) {
    if (y < COVER.margin + 40) {
      contents = doc.addPage([COVER.width, COVER.height]);
      y = COVER.height - COVER.margin - 20;
    }
    contents.drawText(longDay(day), { x: COVER.margin, y, size: 22, font: bold, color: INK });
    const line = wrap(pdfSafeText(`${idea.title} (${COLUMN_LABELS[idea.status]})`), regular, 22, width - 210)[0] ?? "";
    contents.drawText(line, { x: COVER.margin + 210, y, size: 22, font: regular, color: INK });
    y -= 40;
  }

  // Each post.
  for (const { idea, day } of chosen) {
    const cover = doc.addPage([COVER.width, COVER.height]);
    let top = COVER.height - COVER.margin - 20;
    cover.drawText(pdfSafeText(`${longDay(day)} · ${COLUMN_LABELS[idea.status]}`).toUpperCase(), { x: COVER.margin, y: top, size: 20, font: bold, color: ACCENT });
    top -= 80;
    top = drawLines(cover, wrap(pdfSafeText(idea.title) || "Untitled", bold, 52, width), { x: COVER.margin, y: top, size: 52, font: bold, color: INK, bottom: 700, gap: 1.2 });
    top -= 20;
    const platforms = (idea.platforms?.length ? idea.platforms : [idea.platform]).map((platform) => PLATFORM_NAMES[platform] ?? platform).join(", ");
    cover.drawText(pdfSafeText(`Platforms: ${platforms}`), { x: COVER.margin, y: top, size: 24, font: regular, color: MUTED });
    top -= 40;
    if (idea.post_url) {
      top = drawLines(cover, wrap(pdfSafeText(`Live post: ${idea.post_url}`), regular, 20, width), { x: COVER.margin, y: top, size: 20, font: regular, color: MUTED, bottom: 600 });
    }
    top -= 40;
    const caption = pdfSafeText(idea.caption);
    cover.drawText("Caption", { x: COVER.margin, y: top, size: 22, font: bold, color: INK });
    top -= 40;
    drawLines(cover, wrap(caption || "No caption yet.", regular, 24, width), { x: COVER.margin, y: top, size: 24, font: regular, color: caption ? INK : MUTED, bottom: COVER.margin });

    const added = await addDraftPages(supabase, doc, idea.attachments ?? []);
    if (added === 0) cover.drawText("No images or PDFs uploaded yet.", { x: COVER.margin, y: COVER.margin, size: 20, font: regular, color: MUTED });
  }

  const bytes = await doc.save();
  if (bytes.length > MAX_FILE_BYTES) throw new ExportProblem("That export is too large to download in one file. Pick fewer dates or columns.");
  return bytes;
}

// The export, saved to storage, as a short-lived download link.
export async function exportBoardPdf(supabase: SupabaseClient<any>, input: ExportInput) {
  const bytes = await buildBoardPdf(supabase, input);

  const storage = supabase.storage.from(CONTENT_BUCKET);
  const folder = `${input.workspaceId}/board-exports`;
  const name = `${input.from}_${input.to}_${Date.now()}.pdf`;
  const { error: uploadError } = await storage.upload(`${folder}/${name}`, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw uploadError;
  // Only the last few exports are kept.
  const { data: existing } = await storage.list(folder, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  const older = (existing ?? []).filter((item) => item.name !== name).slice(KEEP_EXPORTS - 1).map((item) => `${folder}/${item.name}`);
  if (older.length) await storage.remove(older);

  const fileName = `BuildableLabs posts ${input.from} to ${input.to}.pdf`;
  const { data: signed, error: signError } = await storage.createSignedUrl(`${folder}/${name}`, DOWNLOAD_LINK_TTL_SECONDS, { download: fileName });
  if (signError || !signed?.signedUrl) throw signError ?? new Error("Could not prepare the download.");
  return signed.signedUrl;
}
