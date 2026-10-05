import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentAttachmentKind } from "@/lib/db/types";
import { CONTENT_BUCKET, MAX_ATTACHMENTS_PER_IDEA } from "@/lib/utils/content-board";
import { downloadFileName, mimeTypeFromPath } from "@/lib/utils/download-name";

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

export async function signPaths(supabase: SupabaseClient<any>, paths: string[]) {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;
  const { data, error } = await supabase.storage.from(CONTENT_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
  }
  return signed;
}

// A link that saves one attached file when opened. The storage server answers it with a "save as"
// header and the right file name, so any browser, phones and in-app browsers included, downloads it
// by simply following the link: no script has to fetch the file first.
export async function signDownload(supabase: SupabaseClient<any>, attachmentId: string) {
  const { data: row, error } = await supabase
    .from("content_idea_attachments")
    .select("id, kind, storage_path, file_name")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.kind === "link" || !row.storage_path) throw new Error("This file can't be downloaded.");

  const name = downloadFileName(row.file_name, mimeTypeFromPath(row.storage_path));
  const { data, error: signError } = await supabase.storage
    .from(CONTENT_BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, { download: name });
  if (signError || !data?.signedUrl) throw signError ?? new Error("Could not prepare the download.");
  return { url: data.signedUrl };
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
    .select("id, storage_path, thumb_path, content_ideas!inner(status, posted_at)")
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
  const ids = rows.map((row) => row.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error: deleteError } = await supabase.from("content_idea_attachments").delete().in("id", ids.slice(i, i + 100));
    if (deleteError) throw deleteError;
  }
  return { attachmentsRemoved: ids.length, filesRemoved: paths.length };
}
