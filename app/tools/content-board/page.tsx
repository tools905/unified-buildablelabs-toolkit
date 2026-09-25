import { AppShell } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { KanbanBoard } from "@/components/content-board/kanban-board";
import { requireUser } from "@/lib/auth/require-user";
import { getWorkspaceMembers } from "@/lib/services/workspace-service";
import { listContentIdeas } from "@/lib/services/content-idea-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function ContentBoardPage() {
  await requireEnabledTool("content-board");
  const { supabase, user } = await requireUser("/tools/content-board");
  const workspace = await requireDefaultWorkspace(supabase, user.id);

  const [ideas, members] = await Promise.all([
    listContentIdeas(supabase, workspace.id),
    getWorkspaceMembers(supabase, workspace.id),
  ]);

  const memberOptions = members.map(
    (member: {
      user_id: string;
      profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[];
    }) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      return {
        id: member.user_id,
        label: profile?.full_name || profile?.email || "Unknown",
      };
    },
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Content Board"
        title="Board"
        description="Plan social content from idea to posted, across every platform."
      />
      <KanbanBoard initialIdeas={ideas} members={memberOptions} currentUserId={user.id} />
    </AppShell>
  );
}
