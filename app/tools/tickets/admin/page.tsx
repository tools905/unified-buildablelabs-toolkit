import { notFound } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketAdminTable } from "@/components/tickets/ticket-admin-table";
import { requireUser } from "@/lib/auth/require-user";
import { getWorkspaceMembers, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { listTickets } from "@/lib/services/ticket-service";
import { getDefaultReviewer } from "@/lib/services/ticket-review-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import { setDefaultReviewerAction } from "@/app/tools/tickets/actions";

export const dynamic = "force-dynamic";

export default async function TicketsAdminPage() {
  await requireEnabledTool("tickets");
  const { supabase, user } = await requireUser("/tools/tickets/admin");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  if (!admin) notFound();

  const [tickets, members, reviewSettings] = await Promise.all([
    listTickets(supabase, workspace.id),
    getWorkspaceMembers(supabase, workspace.id),
    getDefaultReviewer(supabase, workspace.id),
  ]);

  const memberOptions = members.map((member: { user_id: string; profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] }) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    return {
      id: member.user_id,
      label: profile?.full_name || profile?.email || "Unknown",
    };
  });

  const overdue = tickets.filter(
    (t: { due_date: string | null; status: string }) =>
      t.due_date && new Date(t.due_date) < new Date() && t.status !== "done",
  ).length;
  const done = tickets.filter((t: { status: string }) => t.status === "done").length;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Tickets Admin</h1>
        <p className="text-muted-foreground">Bulk operations and workspace-wide ticket reporting.</p>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard title="Total tickets" value={tickets.length} />
        <StatCard title="Overdue" value={overdue} />
        <StatCard title="Done" value={done} />
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Progress reviewer</CardTitle>
          <CardDescription>
            When someone submits claimed progress on a ticket, this person is notified to verify it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData: FormData) => {
              "use server";
              await setDefaultReviewerAction(formData);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <select
              name="reviewerId"
              defaultValue={reviewSettings?.default_reviewer_id ?? ""}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              required
            >
              <option value="" disabled>
                Select a reviewer…
              </option>
              {memberOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
      <TicketAdminTable tickets={tickets} members={memberOptions} />
    </AppShell>
  );
}
