import { AppShell } from "@/components/dashboard/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { MeetingCard } from "@/components/meetings/meeting-card";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { listMeetings } from "@/lib/services/calendar-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import { extractTicketsFromMeetingAction } from "@/app/tools/meetings/actions";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  await requireEnabledTool("meetings");
  const { supabase, user } = await requireUser("/tools/meetings");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);

  const meetings = await listMeetings(supabase, workspace.id);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Meetings</h1>
        <p className="text-muted-foreground">
          Recap of past meetings, ingested from Granola once a summary is generated.
        </p>
      </div>

      {meetings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No meeting recaps yet. They&apos;ll appear here once Granola generates a summary.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map(
            (meeting: {
              id: string;
              title: string | null;
              event_title: string | null;
              summary_text: string | null;
              summary_markdown: string | null;
              web_url: string | null;
              start_time: string | null;
              attendees: { name: string | null; email: string }[];
              tickets_extracted_at: string | null;
              extracted_tickets_count: number;
            }) => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                admin={admin}
                extractTicketsAction={extractTicketsFromMeetingAction}
              />
            ),
          )}
        </div>
      )}
    </AppShell>
  );
}
