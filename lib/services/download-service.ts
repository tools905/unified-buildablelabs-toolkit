import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_BUCKET } from "@/lib/utils/content-board";
import type { DownloadKind } from "@/lib/utils/downloads";

// Settings → Downloads: every export the team has made, each file kept 30 days (see migration 065).

const LINK_TTL_SECONDS = 10 * 60;

export type DownloadRow = {
  id: string;
  kind: DownloadKind;
  name: string;
  file_name: string;
  storage_path: string | null;
  size_bytes: number;
  details: Record<string, unknown>;
  created_at: string;
  expires_at: string;
  created_by: string | null;
  creator: { full_name: string | null; email: string | null } | null;
};

export async function recordDownload(
  supabase: SupabaseClient<any>,
  input: {
    workspaceId: string;
    userId: string;
    kind: DownloadKind;
    name: string;
    fileName: string;
    storagePath: string;
    sizeBytes: number;
    details: Record<string, unknown>;
  },
) {
  const { data, error } = await supabase
    .from("downloads")
    .insert({
      workspace_id: input.workspaceId,
      created_by: input.userId,
      kind: input.kind,
      name: input.name,
      file_name: input.fileName,
      storage_path: input.storagePath,
      size_bytes: input.sizeBytes,
      details: input.details,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function listDownloads(supabase: SupabaseClient<any>, workspaceId: string) {
  const { data, error } = await supabase
    .from("downloads")
    .select("id, kind, name, file_name, storage_path, size_bytes, details, created_at, expires_at, created_by, creator:profiles!downloads_created_by_fkey(full_name, email)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as DownloadRow[];
}

// A fresh link to the file, or null when it has expired (or was never kept).
export async function downloadLink(supabase: SupabaseClient<any>, id: string) {
  const { data, error } = await supabase.from("downloads").select("storage_path, file_name, expires_at").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data?.storage_path || new Date(data.expires_at).getTime() <= Date.now()) return null;
  const { data: signed, error: signError } = await supabase.storage
    .from(CONTENT_BUCKET)
    .createSignedUrl(data.storage_path, LINK_TTL_SECONDS, { download: data.file_name });
  if (signError || !signed?.signedUrl) throw signError ?? new Error("Could not prepare the download.");
  return signed.signedUrl;
}

// Deletes a download and its file for good. Row-level security lets only the person who made it, or
// an admin, delete it; false when they can't (or it's already gone).
export async function deleteDownload(supabase: SupabaseClient<any>, id: string) {
  const { data, error } = await supabase.from("downloads").delete().eq("id", id).select("storage_path");
  if (error) throw error;
  const row = data?.[0];
  if (!row) return false;
  if (row.storage_path) {
    const { error: storageError } = await supabase.storage.from(CONTENT_BUCKET).remove([row.storage_path]);
    if (storageError) console.error("download file not removed", storageError);
  }
  return true;
}

// The daily cleanup: removes files past their 30 days. The rows stay, shown as expired.
export async function removeExpiredDownloadFiles(admin: SupabaseClient<any>, now = new Date()) {
  const { data, error } = await admin
    .from("downloads")
    .select("id, storage_path")
    .not("storage_path", "is", null)
    .lte("expires_at", now.toISOString())
    .limit(500);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return 0;
  const { error: storageError } = await admin.storage.from(CONTENT_BUCKET).remove(rows.map((row) => row.storage_path as string));
  if (storageError) throw storageError;
  const { error: updateError } = await admin
    .from("downloads")
    .update({ storage_path: null })
    .in("id", rows.map((row) => row.id));
  if (updateError) throw updateError;
  return rows.length;
}
