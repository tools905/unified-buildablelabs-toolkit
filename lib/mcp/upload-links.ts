import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MCP_LIMITS, type McpUploadLinkRow, type McpUploadResultRecord } from "@/lib/mcp/contract";
import { CONTENT_BUCKET } from "@/lib/utils/content-board";

// One-time upload links. The link's secret (the token) is shown once and never stored: only its SHA-256 hash
// is, so a copy of the table can't open a link. Every function takes the server's own database connection,
// because the table has no access rules for signed-in people or for connector tokens.

export type UploadLinkStatus = "ready" | "expired" | "used";

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function linkStatus(link: Pick<McpUploadLinkRow, "used_at" | "expires_at">, now = new Date()): UploadLinkStatus {
  if (link.used_at) return "used";
  return new Date(link.expires_at).getTime() <= now.getTime() ? "expired" : "ready";
}

export async function createUploadLink(
  admin: SupabaseClient<any>,
  input: {
    workspaceId: string;
    ideaId: string;
    userId: string;
    fileName: string;
    replacesAttachmentId: string | null;
    uploadedVia: string | null;
  },
  now = new Date(),
) {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + MCP_LIMITS.uploadLinkMinutes * 60_000).toISOString();
  const { data, error } = await admin
    .from("mcp_upload_links")
    .insert({
      workspace_id: input.workspaceId,
      idea_id: input.ideaId,
      user_id: input.userId,
      file_name: input.fileName,
      replaces_attachment_id: input.replacesAttachmentId,
      uploaded_via: input.uploadedVia,
      token_hash: hashToken(token),
      expires_at: expiresAt,
      created_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, token, expiresAt };
}

export async function findLinkByToken(admin: SupabaseClient<any>, token: string): Promise<McpUploadLinkRow | null> {
  if (!token || token.length > 200) return null;
  const { data, error } = await admin.from("mcp_upload_links").select("*").eq("token_hash", hashToken(token)).maybeSingle();
  if (error) throw error;
  return (data as McpUploadLinkRow | null) ?? null;
}

export async function findLinkById(admin: SupabaseClient<any>, id: string): Promise<McpUploadLinkRow | null> {
  const { data, error } = await admin.from("mcp_upload_links").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as McpUploadLinkRow | null) ?? null;
}

// Uses the link up. The condition is part of the update itself, so when two requests arrive together only
// one of them gets the link and the other gets null.
export async function claimLink(admin: SupabaseClient<any>, linkId: string, now = new Date()): Promise<McpUploadLinkRow | null> {
  const { data, error } = await admin
    .from("mcp_upload_links")
    .update({ used_at: now.toISOString() })
    .eq("id", linkId)
    .is("used_at", null)
    .gt("expires_at", now.toISOString())
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data as McpUploadLinkRow | null) ?? null;
}

// Gives the link back when the upload failed after it was claimed, so the person can try again.
export async function releaseLink(admin: SupabaseClient<any>, linkId: string) {
  const { error } = await admin.from("mcp_upload_links").update({ used_at: null, result: null }).eq("id", linkId);
  if (error) throw error;
}

export async function saveResult(admin: SupabaseClient<any>, linkId: string, result: McpUploadResultRecord) {
  const { error } = await admin.from("mcp_upload_links").update({ result }).eq("id", linkId);
  if (error) throw error;
}

type OldLink = Pick<McpUploadLinkRow, "id" | "workspace_id" | "idea_id">;

// Files a try left in storage that never became part of the idea (the person gave up, or the file was refused
// and the page was closed). They live next to the idea's own files with this link's id in their name.
async function removeOrphanFiles(admin: SupabaseClient<any>, link: OldLink) {
  const folder = `${link.workspace_id}/${link.idea_id}`;
  const stored = admin.storage.from(CONTENT_BUCKET);
  const { data: objects, error } = await stored.list(folder, { search: `mcp-${link.id}`, limit: 100 });
  if (error || !objects?.length) return 0;

  const { data: attachments, error: attachmentError } = await admin
    .from("content_idea_attachments")
    .select("storage_path, thumb_path")
    .eq("idea_id", link.idea_id);
  if (attachmentError) throw attachmentError;
  const inUse = new Set((attachments ?? []).flatMap((item) => [item.storage_path, item.thumb_path]).filter(Boolean));

  const orphans = objects.map((object) => `${folder}/${object.name}`).filter((path) => !inUse.has(path));
  if (orphans.length) await stored.remove(orphans);
  return orphans.length;
}

// Nightly: links that expired or were used more than a day ago (with any file they left behind), and call
// records past their keeping time.
export async function cleanupExpiredLinks(admin: SupabaseClient<any>, now = new Date()) {
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const columns = "id, workspace_id, idea_id";
  const expired = await admin.from("mcp_upload_links").select(columns).lt("expires_at", dayAgo);
  if (expired.error) throw expired.error;
  const used = await admin.from("mcp_upload_links").select(columns).lt("used_at", dayAgo);
  if (used.error) throw used.error;
  const old = [...new Map([...(expired.data ?? []), ...(used.data ?? [])].map((link: OldLink) => [link.id, link])).values()];

  let orphanFilesRemoved = 0;
  for (const link of old) orphanFilesRemoved += await removeOrphanFiles(admin, link);
  if (old.length) {
    const removed = await admin.from("mcp_upload_links").delete().in("id", old.map((link) => link.id));
    if (removed.error) throw removed.error;
  }

  const keepFrom = new Date(now.getTime() - MCP_LIMITS.auditKeepDays * 24 * 3600_000).toISOString();
  const audit = await admin.from("mcp_audit_log").delete().lt("created_at", keepFrom).select("id");
  if (audit.error) throw audit.error;
  return { linksRemoved: old.length, orphanFilesRemoved, auditRowsRemoved: audit.data?.length ?? 0 };
}
