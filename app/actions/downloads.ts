"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { deleteDownload, recordDownload } from "@/lib/services/download-service";
import { CONTENT_BUCKET } from "@/lib/utils/content-board";
import { ticketsCsvNames } from "@/lib/utils/downloads";

// Deletes a download and its file for good (the person who made it, or an admin).
export async function deleteDownloadAction(id: string) {
  const { supabase } = await requireUser();
  try {
    if (!(await deleteDownload(supabase, id))) {
      return { ok: false as const, error: "Only the person who made this, or an admin, can delete it." };
    }
  } catch (error) {
    console.error("delete download failed", error);
    return { ok: false as const, error: "Couldn't delete it. Please try again." };
  }
  revalidatePath("/settings/downloads");
  return { ok: true as const };
}

// Keeps a copy of the tickets list someone just exported, for Settings → Downloads.
export async function saveTicketsCsvAction(csv: string, ticketCount: number) {
  const { supabase, user } = await requireUser();
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace || !(await isWorkspaceAdmin(workspace.id, user.id, supabase))) return { ok: false as const };
  if (typeof csv !== "string" || csv.length > 5 * 1024 * 1024) return { ok: false as const };

  const bytes = new TextEncoder().encode(csv);
  const path = `${workspace.id}/exports/tickets-${Date.now()}.csv`;
  const { error } = await supabase.storage.from(CONTENT_BUCKET).upload(path, bytes, { contentType: "text/csv", upsert: false });
  if (error) {
    console.error("tickets csv not kept", error);
    return { ok: false as const };
  }
  const { name, fileName } = ticketsCsvNames();
  try {
    await recordDownload(supabase, {
      workspaceId: workspace.id,
      userId: user.id,
      kind: "tickets_csv",
      name,
      fileName,
      storagePath: path,
      sizeBytes: bytes.length,
      details: { tickets: ticketCount },
    });
  } catch (recordError) {
    console.error("tickets csv not listed", recordError);
    await supabase.storage.from(CONTENT_BUCKET).remove([path]);
    return { ok: false as const };
  }
  return { ok: true as const };
}
