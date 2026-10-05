import { PageHeader } from "@/components/dashboard/page-header";
import { ContentCalendar } from "@/components/content-board/content-calendar";
import { requireUser } from "@/lib/auth/require-user";
import { attachCardPreviews, listContentIdeas } from "@/lib/services/content-idea-service";
import { getWorkspaceMembers, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { toMemberOptions } from "@/lib/utils/content-board";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function ContentCalendarPage() {
  await requireEnabledTool("content-board");
  const { supabase, user } = await requireUser("/tools/content-board/calendar");
  const workspace = await requireDefaultWorkspace(supabase, user.id);

  const [rawIdeas, members, admin] = await Promise.all([
    listContentIdeas(supabase, workspace.id),
    getWorkspaceMembers(supabase, workspace.id),
    isWorkspaceAdmin(workspace.id, user.id, supabase),
  ]);
  const ideas = await attachCardPreviews(supabase, rawIdeas);

  return (
    <>
      <PageHeader
        eyebrow="Content Board"
        title="Calendar"
        description="Every post with a posting day, plus shortlisted posts still waiting for one."
      />
      <ContentCalendar ideas={ideas} members={toMemberOptions(members)} isAdmin={admin} currentUserId={user.id} />
    </>
  );
}
