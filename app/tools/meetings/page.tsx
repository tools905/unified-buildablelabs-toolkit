import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { MeetingCard, type MeetingCardData } from "@/components/meetings/meeting-card";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { listMeetings } from "@/lib/services/calendar-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import { extractTicketsFromMeetingAction } from "@/app/tools/meetings/actions";
import { toMeetingPreview } from "@/lib/utils/meeting-preview";

export const dynamic = "force-dynamic";

// A meeting as stored, before the long recap text is cut down to a preview for the page.
type MeetingRow = Omit<MeetingCardData, "summary_preview" | "summary_truncated"> & {
  summary_markdown: string | null;
  summary_text: string | null;
};

export default async function MeetingsPage() {
  await requireEnabledTool("meetings");
  const { supabase, user } = await requireUser("/tools/meetings");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);

  const rows: MeetingRow[] = await listMeetings(supabase, workspace.id);
  const meetings: MeetingCardData[] = rows.map(toMeetingPreview);

  return (
    <>
      <PageHeader
        eyebrow="Meetings"
        title="Recaps"
        description="Recap of past meetings, ingested from Granola once a summary is generated."
      />

      {meetings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No meeting recaps yet. They&apos;ll appear here once Granola generates a summary.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              admin={admin}
              extractTicketsAction={extractTicketsFromMeetingAction}
            />
          ))}
        </div>
      )}
    </>
  );
}
