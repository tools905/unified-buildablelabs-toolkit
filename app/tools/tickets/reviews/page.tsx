import { formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/require-user";
import { getReviewQueue } from "@/lib/services/ticket-review-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import { approveProgressAction, disputeProgressAction } from "@/app/tools/tickets/actions";

export const dynamic = "force-dynamic";

export default async function TicketReviewsPage() {
  await requireEnabledTool("tickets");
  const { supabase, user } = await requireUser("/tools/tickets/reviews");
  const workspace = await requireDefaultWorkspace(supabase, user.id);

  const queue = await getReviewQueue(supabase, workspace.id, user.id);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Pending Reviews</h1>
        <p className="text-muted-foreground">Progress claims assigned to you for verification.</p>
      </div>
      {queue.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No pending reviews. You&apos;re all caught up.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {queue.map(
            (ticket: {
              id: string;
              title: string;
              claimed_progress_percent: number | null;
              progress_percent: number;
              updated_at: string;
              assignee: { full_name: string | null; email: string } | null;
            }) => (
              <Card key={ticket.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>{ticket.title}</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      Submitted {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {ticket.assignee?.full_name || ticket.assignee?.email || "Unknown"} claims{" "}
                    <span className="font-semibold text-foreground">{ticket.claimed_progress_percent}%</span>{" "}
                    (last verified: {ticket.progress_percent}%)
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <form
                      action={async () => {
                        "use server";
                        const formData = new FormData();
                        formData.set("ticketId", ticket.id);
                        formData.set("verifiedPercent", String(ticket.claimed_progress_percent ?? 0));
                        await approveProgressAction(formData);
                      }}
                    >
                      <Button type="submit" size="sm">
                        Approve at {ticket.claimed_progress_percent}%
                      </Button>
                    </form>
                    <form
                      action={async (formData: FormData) => {
                        "use server";
                        formData.set("ticketId", ticket.id);
                        await disputeProgressAction(formData);
                      }}
                      className="flex flex-1 gap-2"
                    >
                      <Input name="notes" placeholder="Why is this disputed?" className="flex-1" required />
                      <Button type="submit" size="sm" variant="destructive">
                        Dispute
                      </Button>
                    </form>
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
