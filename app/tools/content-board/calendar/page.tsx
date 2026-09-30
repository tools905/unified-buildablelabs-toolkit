import { AppShell } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { ContentCalendar } from "@/components/content-board/content-calendar";
import { requireUser } from "@/lib/auth/require-user";
import { attachCardPreviews, listContentIdeas } from "@/lib/services/content-idea-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function ContentCalendarPage() {
  await requireEnabledTool("content-board");
  const { supabase, user } = await requireUser("/tools/content-board/calendar");
  const workspace = await requireDefaultWorkspace(supabase, user.id);

  const rawIdeas = await listContentIdeas(supabase, workspace.id);
  const ideas = await attachCardPreviews(supabase, rawIdeas);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Content Board"
        title="Calendar"
        description="See which idea goes out on which day. Set the date from an idea's Edit window."
      />
      <ContentCalendar ideas={ideas} />
    </AppShell>
  );
}
