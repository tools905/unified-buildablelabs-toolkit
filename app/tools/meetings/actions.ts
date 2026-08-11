"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { createTicketsFromMeeting } from "@/lib/services/meeting-parser-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export async function extractTicketsFromMeetingAction(formData: FormData) {
  await requireEnabledTool("tickets");
  const { supabase, user } = await requireUser("/tools/meetings");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  if (!admin) notFound();

  const meetingId = String(formData.get("meetingId"));
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("id, title, event_title, summary_text, summary_markdown, attendees")
    .eq("id", meetingId)
    .eq("workspace_id", workspace.id)
    .single();
  if (error) throw error;

  await createTicketsFromMeeting(supabase, workspace.id, meeting, user.id);

  revalidatePath("/tools/meetings");
  revalidatePath("/tools/tickets");
}
