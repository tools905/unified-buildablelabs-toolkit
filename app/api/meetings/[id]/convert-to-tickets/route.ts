import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth/require-user";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { createTicketsFromMeeting } from "@/lib/services/meeting-parser-service";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireEnabledTool("tickets");
  const { id: meetingId } = await params;

  const { supabase, user } = await getUserSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) {
    return NextResponse.json({ error: "No workspace found for this user" }, { status: 404 });
  }

  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, title, event_title, summary_text, summary_markdown, attendees")
    .eq("id", meetingId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (meetingError) {
    return NextResponse.json({ error: meetingError.message }, { status: 500 });
  }
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  let dryRun = false;
  try {
    const body = await request.json();
    dryRun = Boolean(body?.dry_run);
  } catch {
    // no body / not JSON — default to a real run
  }

  try {
    const result = await createTicketsFromMeeting(supabase, workspace.id, meeting, user.id, { dryRun });
    return NextResponse.json({
      tickets: result.tickets,
      preview: result.preview,
      created_count: result.createdCount,
      dry_run: dryRun,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to convert meeting to tickets" },
      { status: 500 },
    );
  }
}
