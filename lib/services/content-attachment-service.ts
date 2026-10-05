import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentAttachmentKind } from "@/lib/db/types";
import { CONTENT_BUCKET, MAX_ATTACHMENTS_PER_IDEA } from "@/lib/utils/content-board";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type ContentAttachmentRow = {
  id: string;
  idea_id: string;
  kind: ContentAttachmentKind;
  storage_path: string | null;
  thumb_path: string | null;
  url: string | null;
  file_name: string | null;
  size_bytes: number | null;
  sort_order: number;
  created_by: string;
  created_at: string;
};

export async function listAttachments(supabase: SupabaseClient<any>, ideaId: string): Promise<ContentAttachmentRow[]> {
  const { data, error } = await supabase
    .from("content_idea_attachments")
    .select("*")
    .eq("idea_id", ideaId)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

// Signed links handed out recently, kept while the server stays warm. Giving the same file the same
// link on every page load lets the browser reuse the image it already has instead of downloading
// every thumbnail again after each refresh, and skips a storage request. Only paths read from rows
// the caller can see (row-level security) are ever passed in here.
const REUSE_SIGNED_URL_MS = 40 * 60 * 1000;
const signedCache = new Map<string, { url: string; at: number }>();

export async function signPaths(supabase: SupabaseClient<any>, paths: string[]) {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;
  const now = Date.now();
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const hit = signedCache.get(path);
    if (hit && now - hit.at < REUSE_SIGNED_URL_MS) signed.set(path, hit.url);
    else missing.push(path);
  }
  if (missing.length === 0) return signed;
  const { data, error } = await supabase.storage.from(CONTENT_BUCKET).createSignedUrls(missing, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) {
      signed.set(item.path, item.signedUrl);
      signedCache.set(item.path, { url: item.signedUrl, at: now });
    }
  }
  if (signedCache.size > 5000) {
    for (const [path, entry] of signedCache) if (now - entry.at >= REUSE_SIGNED_URL_MS) signedCache.delete(path);
  }
  return signed;
}

// Where the PDF made for downloading an idea is kept (see content-export-service).
export function exportFolder(workspaceId: string, ideaId: string) {
  return `${workspaceId}/${ideaId}/exports`;
}

// Removes every PDF made for downloading this idea. Best effort: a leftover export is harmless.
export async function removeIdeaExports(supabase: SupabaseClient<any>, workspaceId: string, ideaId: string) {
  const folder = exportFolder(workspaceId, ideaId);
  const { data } = await supabase.storage.from(CONTENT_BUCKET).list(folder, { limit: 100 });
  const paths = (data ?? []).map((item) => `${folder}/${item.name}`);
  if (paths.length) await supabase.storage.from(CONTENT_BUCKET).remove(paths);
}

export async function addStoredAttachment(
  supabase: SupabaseClient<any>,
  input: {
    workspaceId: string;
    ideaId: string;
    userId: string;
    kind: "image" | "pdf";
    storagePath: string;
    thumbPath?: string | null;
    fileName: string;
    sizeBytes: number;
  },
) {
  const prefix = `${input.workspaceId}/${input.ideaId}/`;
  const paths = [input.storagePath, input.thumbPath].filter((path): path is string => Boolean(path));
  if (paths.some((path) => !path.startsWith(prefix))) throw new Error("Invalid file path.");

  const existing = await listAttachments(supabase, input.ideaId);
  if (existing.length >= MAX_ATTACHMENTS_PER_IDEA) {
    await supabase.storage.from(CONTENT_BUCKET).remove(paths);
    throw new Error(`An idea can have up to ${MAX_ATTACHMENTS_PER_IDEA} attachments.`);
  }

  const { error } = await supabase.from("content_idea_attachments").insert({
    idea_id: input.ideaId,
    workspace_id: input.workspaceId,
    kind: input.kind,
    storage_path: input.storagePath,
    thumb_path: input.thumbPath ?? null,
    file_name: input.fileName,
    size_bytes: input.sizeBytes,
    sort_order: existing.length ? Math.max(...existing.map((item) => item.sort_order)) + 1 : 0,
    created_by: input.userId,
  });
  if (error) {
    await supabase.storage.from(CONTENT_BUCKET).remove(paths);
    throw error;
  }
}

export async function addLinkAttachment(
  supabase: SupabaseClient<any>,
  input: { workspaceId: string; ideaId: string; userId: string; url: string },
) {
  const existing = await listAttachments(supabase, input.ideaId);
  if (existing.length >= MAX_ATTACHMENTS_PER_IDEA) {
    throw new Error(`An idea can have up to ${MAX_ATTACHMENTS_PER_IDEA} attachments.`);
  }

  const { error } = await supabase.from("content_idea_attachments").insert({
    idea_id: input.ideaId,
    workspace_id: input.workspaceId,
    kind: "link",
    url: input.url,
    sort_order: existing.length ? Math.max(...existing.map((item) => item.sort_order)) + 1 : 0,
    created_by: input.userId,
  });
  if (error) throw error;
}

export async function removeAttachment(supabase: SupabaseClient<any>, attachmentId: string) {
  const { data: row, error: readError } = await supabase
    .from("content_idea_attachments")
    .select("id, storage_path, thumb_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) return;

  const paths = [row.storage_path, row.thumb_path].filter((path): path is string => Boolean(path));
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(CONTENT_BUCKET).remove(paths);
    if (storageError) throw storageError;
  }

  const { data: deleted, error } = await supabase
    .from("content_idea_attachments")
    .delete()
    .eq("id", attachmentId)
    .select("id");
  if (error) throw error;
  if (!deleted?.length) throw new Error("Could not remove this attachment.");
}

export async function removeStoredFilesForIdea(supabase: SupabaseClient<any>, ideaId: string) {
  const { data: idea } = await supabase.from("content_ideas").select("workspace_id").eq("id", ideaId).maybeSingle();
  if (idea?.workspace_id) await removeIdeaExports(supabase, idea.workspace_id, ideaId);
  const rows = await listAttachments(supabase, ideaId);
  const paths = rows.flatMap((row) => [row.storage_path, row.thumb_path]).filter((path): path is string => Boolean(path));
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(CONTENT_BUCKET).remove(paths);
  if (error) throw error;
}

// Files (not links) of ideas that were posted more than `olderThanDays` ago.
export async function cleanupPostedContentFiles(supabase: SupabaseClient<any>, olderThanDays: number) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("content_idea_attachments")
    .select("id, idea_id, workspace_id, storage_path, thumb_path, content_ideas!inner(status, posted_at)")
    .neq("kind", "link")
    .eq("content_ideas.status", "posted")
    .lt("content_ideas.posted_at", cutoff);
  if (error) throw error;

  const rows = data ?? [];
  const paths = rows.flatMap((row) => [row.storage_path, row.thumb_path]).filter((path): path is string => Boolean(path));
  for (let i = 0; i < paths.length; i += 100) {
    const { error: storageError } = await supabase.storage.from(CONTENT_BUCKET).remove(paths.slice(i, i + 100));
    if (storageError) throw storageError;
  }
  const ideas = new Map(rows.map((row) => [row.idea_id as string, row.workspace_id as string]));
  for (const [ideaId, workspaceId] of ideas) await removeIdeaExports(supabase, workspaceId, ideaId);
  const ids = rows.map((row) => row.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error: deleteError } = await supabase.from("content_idea_attachments").delete().in("id", ids.slice(i, i + 100));
    if (deleteError) throw deleteError;
  }
  return { attachmentsRemoved: ids.length, filesRemoved: paths.length };
}
