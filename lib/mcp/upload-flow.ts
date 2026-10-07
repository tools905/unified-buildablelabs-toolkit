import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MCP_LIMITS,
  UPLOAD_THUMBNAIL_MAX_BYTES,
  uploadCompleteInput,
  uploadFileInput,
  type McpUploadLinkRow,
  type UploadCompleteInput,
  type UploadLinkState,
  type UploadPrepareResult,
  type UploadResult,
} from "@/lib/mcp/contract";
import { countPdfPages, renderPdfThumbnail } from "@/lib/mcp/pdf-pages";
import { claimLink, findLinkByToken, linkStatus, releaseLink, saveResult } from "@/lib/mcp/upload-links";
import { addStoredAttachment, listAttachments } from "@/lib/services/content-attachment-service";
import { CONTENT_BUCKET } from "@/lib/utils/content-board";

// What happens on the upload page, on the server's side. The page sends the file straight to storage (a
// request to the server is capped at 4.5 MB, a PDF can be 15 MB), so the server does three things: say what
// state the link is in, hand out the places in storage the file may go to, and, once the file is there, check
// it really is what it claims and put it on the idea. Every function takes the server's own database
// connection, because the link table has no rules for signed-in people or connector tokens.

type Admin = SupabaseClient<any>;
type Failure = Extract<UploadResult, { ok: false }>;

const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"] as const;
const fail = (code: Failure["code"], message: string): Failure => ({ ok: false, code, message });

// ---- What a file is -------------------------------------------------------------------------------

export type FileKind = "pdf" | "image";
type Sniffed = "pdf" | "png" | "jpeg" | "webp";

const startsWith = (bytes: Uint8Array, signature: number[], at = 0) => signature.every((byte, i) => bytes[at + i] === byte);

// What a file really is, from its first bytes, whatever its name or the browser says.
export function sniffFile(bytes: Uint8Array): Sniffed | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp"; // RIFF....WEBP
  return null;
}

const EXTENSION_OF: Record<Sniffed, string> = { pdf: "pdf", png: "png", jpeg: "jpg", webp: "webp" };

// The type the browser declared, if it is one we accept. This is only the first check; `complete` looks at the bytes.
function declaredType(contentType: string, fileName: string): Sniffed | null {
  const type = contentType.toLowerCase();
  const name = fileName.toLowerCase();
  if (type === "application/pdf" && name.endsWith(".pdf")) return "pdf";
  if (type === "image/png" && name.endsWith(".png")) return "png";
  if (type === "image/jpeg" && (name.endsWith(".jpg") || name.endsWith(".jpeg"))) return "jpeg";
  if (type === "image/webp" && name.endsWith(".webp")) return "webp";
  return null;
}

// A name that is safe to show and store: no folders, no control characters, not empty.
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return cleaned || "upload";
}

const NOT_ALLOWED = "Use a PDF or an image (PNG, JPG or WebP). The file's name has to end in the right ending too.";
const tooBig = `Files can be up to ${MCP_LIMITS.maxFileBytes / (1024 * 1024)} MB.`;
const ideaFull = `This idea already has ${MCP_LIMITS.maxFilesPerIdea} files. Remove one on the board first, or replace an existing file.`;

// ---- The link -------------------------------------------------------------------------------------

async function usableLink(admin: Admin, token: string, now: Date): Promise<{ link: McpUploadLinkRow } | { failure: Failure }> {
  const link = await findLinkByToken(admin, token);
  if (!link) return { failure: fail("not_found", "This upload link is not valid.") };
  const status = linkStatus(link, now);
  if (status === "used") return { failure: fail("link_expired", "This link has already been used. Ask for a new one.") };
  if (status === "expired") return { failure: fail("link_expired", "This link has expired. Ask for a new one.") };
  return { link };
}

// Where this try's files go. The attempt is part of the name, so a retry after a refusal never reuses a place.
export const baseOf = (link: Pick<McpUploadLinkRow, "workspace_id" | "idea_id" | "id">, attempt: string) =>
  `${link.workspace_id}/${link.idea_id}/mcp-${link.id}-${attempt}`;

export const newAttempt = () => randomBytes(6).toString("hex");

export async function getUploadState(admin: Admin, token: string, now = new Date()): Promise<UploadLinkState> {
  const link = await findLinkByToken(admin, token);
  if (!link) return { status: "unknown" };
  const status = linkStatus(link, now);
  if (status !== "ready") return { status };

  const { data: idea, error } = await admin.from("content_ideas").select("title").eq("id", link.idea_id).maybeSingle();
  if (error) throw error;
  if (!idea) return { status: "unknown" };

  const attachments = await listAttachments(admin, link.idea_id);
  const replaced = link.replaces_attachment_id ? attachments.find((item) => item.id === link.replaces_attachment_id) : undefined;
  return {
    status: "ready",
    idea_title: idea.title,
    file_name: link.file_name,
    replaces_file_name: replaced ? (replaced.file_name ?? "a design link") : null,
    expires_at: link.expires_at,
    limits: {
      max_bytes: MCP_LIMITS.maxFileBytes,
      allowed_extensions: [...ALLOWED_EXTENSIONS],
      files_used: attachments.length,
      files_max: MCP_LIMITS.maxFilesPerIdea,
    },
  };
}

// Whether the idea has room for one more file (a file that replaces another needs none).
async function ideaIsFull(admin: Admin, link: McpUploadLinkRow) {
  const attachments = await listAttachments(admin, link.idea_id);
  const replacing = link.replaces_attachment_id && attachments.some((item) => item.id === link.replaces_attachment_id);
  return attachments.length - (replacing ? 1 : 0) >= MCP_LIMITS.maxFilesPerIdea;
}

// ---- Step 1: where the file may go -----------------------------------------------------------------

export async function prepareUpload(admin: Admin, token: string, rawInput: unknown, now = new Date()): Promise<UploadPrepareResult> {
  const parsed = uploadFileInput.safeParse(rawInput);
  if (!parsed.success) return fail("invalid_input", "That file could not be understood. Choose it again.");
  const input = parsed.data;

  const found = await usableLink(admin, token, now);
  if ("failure" in found) return found.failure;
  const { link } = found;

  const type = declaredType(input.content_type, input.file_name);
  if (!type) return fail("invalid_input", NOT_ALLOWED);
  if (input.size_bytes > MCP_LIMITS.maxFileBytes) return fail("invalid_input", tooBig);
  if (await ideaIsFull(admin, link)) return fail("limit_reached", ideaFull);

  const storage = admin.storage.from(CONTENT_BUCKET);
  const target = async (path: string) => {
    const { data, error } = await storage.createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw error ?? new Error("No upload address.");
    return { path, upload_token: data.token };
  };

  const attempt = newAttempt();
  const base = baseOf(link, attempt);
  const file = await target(`${base}.${EXTENSION_OF[type]}`);
  const thumbnail = input.thumbnail_type ? await target(`${base}_thumb.${input.thumbnail_type === "image/webp" ? "webp" : "jpg"}`) : null;
  return { ok: true, attempt, file, thumbnail };
}

// ---- Step 2: the file is there, check it and put it on the idea ------------------------------------

async function readStored(admin: Admin, path: string): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage.from(CONTENT_BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

const removeStored = (admin: Admin, paths: (string | null)[]) =>
  admin.storage.from(CONTENT_BUCKET).remove(paths.filter((path): path is string => Boolean(path)));

export async function completeUpload(admin: Admin, token: string, rawInput: unknown, now = new Date()): Promise<UploadResult> {
  const parsed = uploadCompleteInput.safeParse(rawInput);
  if (!parsed.success) return fail("invalid_input", "That file could not be understood. Choose it again.");
  const input: UploadCompleteInput = parsed.data;

  const found = await usableLink(admin, token, now);
  if ("failure" in found) return found.failure;
  const { link } = found;

  const type = declaredType(input.content_type, input.file_name);
  if (!type) return fail("invalid_input", NOT_ALLOWED);

  // The places are fixed by the link, so the person can only have written where prepare said.
  const base = baseOf(link, input.attempt);
  const filePath = `${base}.${EXTENSION_OF[type]}`;
  const declaredThumbPath = input.thumbnail_type ? `${base}_thumb.${input.thumbnail_type === "image/webp" ? "webp" : "jpg"}` : null;
  const everything = [filePath, declaredThumbPath, `${base}_thumb.jpg`];

  // Anything refused from here on removes what was sent, and leaves the link usable for another try.
  const refuse = async (code: Failure["code"], message: string) => {
    await removeStored(admin, everything);
    return fail(code, message);
  };

  const bytes = await readStored(admin, filePath);
  if (!bytes) return refuse("invalid_input", "The file did not arrive. Please try again.");
  if (bytes.byteLength > MCP_LIMITS.maxFileBytes) return refuse("invalid_input", tooBig);
  if (sniffFile(bytes) !== type) return refuse("invalid_input", "That file is not what its name says it is. Choose a real PDF or image.");

  let pageCount: number | null = null;
  if (type === "pdf") {
    pageCount = await countPdfPages(bytes);
    if (!pageCount) return refuse("invalid_input", "This PDF could not be opened. It may be damaged or protected.");
  }

  if (await ideaIsFull(admin, link)) return refuse("limit_reached", ideaFull);

  // The small picture: the browser's if it sent a good one, otherwise (for a PDF) one drawn here.
  let thumbPath: string | null = null;
  if (declaredThumbPath) {
    const thumb = await readStored(admin, declaredThumbPath);
    const kind = thumb ? sniffFile(thumb) : null;
    const matches = input.thumbnail_type === "image/webp" ? kind === "webp" : kind === "jpeg";
    if (thumb && matches && thumb.byteLength <= UPLOAD_THUMBNAIL_MAX_BYTES) thumbPath = declaredThumbPath;
    else await removeStored(admin, [declaredThumbPath]);
  }
  if (!thumbPath && type === "pdf") {
    const drawn = await renderPdfThumbnail(bytes);
    if (drawn) {
      const path = `${base}_thumb.jpg`;
      const { error } = await admin.storage.from(CONTENT_BUCKET).upload(path, drawn, { contentType: "image/jpeg", upsert: true });
      if (!error) thumbPath = path;
    }
  }

  // Use the link up. When two requests arrive together only one gets it, and the other must not touch the files.
  const claimed = await claimLink(admin, link.id, now);
  if (!claimed) return fail("link_expired", "This link has already been used. Ask for a new one.");

  const fileName = cleanFileName(input.file_name);
  try {
    const stored = await addStoredAttachment(admin, {
      workspaceId: link.workspace_id,
      ideaId: link.idea_id,
      userId: link.user_id,
      kind: type === "pdf" ? "pdf" : "image",
      storagePath: filePath,
      thumbPath,
      fileName,
      sizeBytes: bytes.byteLength,
      uploadedVia: link.uploaded_via,
      replacesAttachmentId: link.replaces_attachment_id,
    });
    const result = {
      attachment_id: stored.id,
      file_name: fileName,
      kind: type === "pdf" ? ("pdf" as const) : ("image" as const),
      page_count: pageCount,
      replaced_attachment_id: stored.replacedAttachmentId,
    };
    // The file is on the idea whatever happens next, so a failure to note it down must not undo anything.
    await saveResult(admin, link.id, result).catch((failure) => console.error("MCP: could not save the upload result:", failure));
    return { ok: true, ...result };
  } catch (error) {
    // addStoredAttachment already removed the files it was given. Give the link back so the person can retry.
    await removeStored(admin, everything);
    await releaseLink(admin, link.id).catch(() => {});
    if (error instanceof Error && /up to \d+ attachments/.test(error.message)) return fail("limit_reached", ideaFull);
    throw error;
  }
}

