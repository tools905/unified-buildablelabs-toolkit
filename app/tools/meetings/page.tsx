import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        <div className="space-y-4">
          {meetings.map(
            (meeting: {
              id: string;
              title: string | null;
              event_title: string | null;
              summary_text: string | null;
              web_url: string | null;
              start_time: string | null;
              attendees: { name: string | null; email: string }[];
              tickets_extracted_at: string | null;
              extracted_tickets_count: number;
            }) => (
              <Card key={meeting.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {meeting.title || meeting.event_title || "Untitled meeting"}
                    </CardTitle>
                    {meeting.start_time ? (
                      <Badge>{new Date(meeting.start_time).toLocaleDateString()}</Badge>
                    ) : null}
                  </div>
                  {meeting.summary_text ? <CardDescription>{meeting.summary_text}</CardDescription> : null}
                </CardHeader>
                <CardContent>
                  {meeting.attendees.length > 0 ? (
                    <p className="mb-2 text-sm text-muted-foreground">
                      {meeting.attendees.map((a) => a.name || a.email).join(", ")}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    {meeting.web_url ? (
                      <a
                        href={meeting.web_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Open in Granola <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                    {admin ? (
                      meeting.tickets_extracted_at ? (
                        <span className="text-sm text-muted-foreground">
                          {meeting.extracted_tickets_count} ticket(s) extracted
                        </span>
                      ) : (
                        <form action={extractTicketsFromMeetingAction}>
                          <input type="hidden" name="meetingId" value={meeting.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Extract tickets
                          </Button>
                        </form>
                      )
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      )}
    </AppShell>
  );
}
