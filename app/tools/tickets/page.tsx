import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { KanbanBoard } from "@/components/tickets/kanban-board";
import { requireUser } from "@/lib/auth/require-user";
import { getWorkspaceMembers } from "@/lib/services/workspace-service";
import { listTickets } from "@/lib/services/ticket-service";
import { getPerformanceAccuracy } from "@/lib/services/ticket-review-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  await requireEnabledTool("tickets");
  const { supabase, user } = await requireUser("/tools/tickets");
  const workspace = await requireDefaultWorkspace(supabase, user.id);

  const [tickets, members, accuracy] = await Promise.all([
    listTickets(supabase, workspace.id),
    getWorkspaceMembers(supabase, workspace.id),
    getPerformanceAccuracy(supabase, workspace.id, user.id),
  ]);

  const memberOptions = members.map((member: { user_id: string; profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] }) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    return {
      id: member.user_id,
      label: profile?.full_name || profile?.email || "Unknown",
    };
  });

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Tickets</h1>
        <p className="text-muted-foreground">Track work across backlog, in progress, and done.</p>
      </div>
      {accuracy.totalTickets > 0 ? (
        <div className="mb-6 max-w-xs">
          <StatCard
            title="Your progress accuracy"
            value={`${accuracy.accuracy}%`}
            description={`${accuracy.verifiedCount} of ${accuracy.totalTickets} claims verified`}
          />
        </div>
      ) : null}
      <KanbanBoard
        initialTickets={tickets}
        members={memberOptions}
        currentUserId={user.id}
      />
    </AppShell>
  );
}
