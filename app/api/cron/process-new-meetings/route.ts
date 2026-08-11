import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTicketsFromMeeting } from "@/lib/services/meeting-parser-service";
import { getWorkspaceByName } from "@/lib/services/workspace-service";
import { assertCronSecret } from "@/lib/utils/cron";

const SYSTEM_ACTOR_LABEL = "meeting-ticket-pipeline";

export async function GET(request: Request) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;

  const admin = createAdminClient();
  const workspace = await getWorkspaceByName(admin, "BuildableLabs");
  if (!workspace) {
    return NextResponse.json({ error: "Default workspace not found" }, { status: 500 });
  }

  const { data: meetings, error } = await admin
    .from("meetings")
    .select("id, title, event_title, summary_text, summary_markdown, attendees, created_by")
    .eq("workspace_id", workspace.id)
    .is("tickets_extracted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let processedMeetings = 0;
  let ticketsCreated = 0;
  const errors: string[] = [];

  for (const meeting of meetings ?? []) {
    try {
      // No human actor triggered this — audit logs record the workspace
      // creator as the actor since audit_logs.actor_id has no "system" value.
      const result = await createTicketsFromMeeting(admin, workspace.id, meeting, workspace.created_by);
      processedMeetings += 1;
      ticketsCreated += result.createdCount;
    } catch (err) {
      errors.push(`${meeting.id} (${SYSTEM_ACTOR_LABEL}): ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ processedMeetings, ticketsCreated, errors });
}
