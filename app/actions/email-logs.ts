"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";

// Admins delete entries of their workspace's email history (the database checks this too).
export async function deleteEmailLogsAction(ids: string[]) {
  const { supabase, user } = await requireUser();
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace || !(await isWorkspaceAdmin(workspace.id, user.id, supabase))) {
    return { ok: false as const, error: "Only admins can delete the email history." };
  }
  const clean = ids.filter((id) => typeof id === "string").slice(0, 500);
  if (clean.length) {
    const { error } = await supabase.from("notification_logs").delete().eq("workspace_id", workspace.id).in("id", clean);
    if (error) return { ok: false as const, error: "Couldn't delete those. Please try again." };
  }
  revalidatePath("/team/logs");
  return { ok: true as const };
}
