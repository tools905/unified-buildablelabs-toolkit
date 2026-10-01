import { PageHeader } from "@/components/dashboard/page-header";
import { KanbanBoard } from "@/components/content-board/kanban-board";
import { requireUser } from "@/lib/auth/require-user";
import { getWorkspaceMembers, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { attachCardPreviews, listContentIdeas } from "@/lib/services/content-idea-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import { toMemberOptions } from "@/lib/utils/content-board";

export const dynamic = "force-dynamic";

export default async function ContentBoardPage() {
  await requireEnabledTool("content-board");
  const { supabase, user } = await requireUser("/tools/content-board");
  const workspace = await requireDefaultWorkspace(supabase, user.id);

  const [rawIdeas, members, admin] = await Promise.all([
    listContentIdeas(supabase, workspace.id),
    getWorkspaceMembers(supabase, workspace.id),
    isWorkspaceAdmin(workspace.id, user.id, supabase),
  ]);
  const ideas = await attachCardPreviews(supabase, rawIdeas);

  const memberOptions = toMemberOptions(members);

  return (
    <>
      <PageHeader
        eyebrow="Content Board"
        title="Board"
        description="Plan social content from idea to posted, across every platform."
      />
      <KanbanBoard initialIdeas={ideas} members={memberOptions} currentUserId={user.id} isAdmin={admin} />
    </>
  );
}
