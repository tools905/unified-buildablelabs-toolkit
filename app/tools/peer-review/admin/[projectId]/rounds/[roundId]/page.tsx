import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/require-user";
import { closeRound, getRoundProgress, cancelRound } from "@/lib/services/round-service";
import { sendPendingReviewReminders } from "@/lib/services/reminder-service";

export default async function RoundPage({
  params,
}: {
  params: Promise<{ projectId: string; roundId: string }>;
}) {
  const { supabase } = await requireUser();
  const { projectId, roundId } = await params;
  const [{ data: round }, progress] = await Promise.all([
    supabase.from("review_rounds").select("*, projects(*)").eq("id", roundId).single(),
    getRoundProgress(supabase, roundId),
  ]);
  if (!round) redirect(`/tools/peer-review/admin/${projectId}`);

  async function closeAction() {
    "use server";
    const { supabase } = await requireUser();
    await closeRound(supabase, roundId);
    redirect(`/tools/peer-review/admin/${projectId}/rounds/${roundId}/report`);
  }

  async function cancelAction() {
    "use server";
    const { supabase } = await requireUser();
    await cancelRound(supabase, roundId);
    redirect(`/tools/peer-review/admin/${projectId}`);
  }

  async function sendRemindersAction() {
    "use server";
    const { supabase } = await requireUser();
    await sendPendingReviewReminders(supabase, roundId);
    redirect(`/tools/peer-review/admin/${projectId}/rounds/${roundId}`);
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{round.title}</h1>
          <p className="text-muted-foreground">{round.projects?.name}</p>
        </div>
        <Badge>{round.status}</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total" value={progress.total} />
        <StatCard title="Submitted" value={progress.submitted} />
        <StatCard title="Pending" value={progress.pending} />
        <StatCard title="Overdue" value={progress.overdue} />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Completion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress.completionRate} />
          <p className="text-sm text-muted-foreground">{progress.completionRate}% submitted</p>
          <div>
            <h2 className="mb-2 font-medium">Missing reviewers</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {progress.missingReviewers.map((reviewer, index) => (
                <div key={reviewer?.id ?? `missing-${index}`} className="rounded-md border border-border p-3">
                  {reviewer?.full_name ?? reviewer?.email ?? "Unknown"}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {round.status === "active" ? (
              <form action={sendRemindersAction}>
                <Button variant="outline">Send reminders</Button>
              </form>
            ) : null}
            {round.status === "active" || round.status === "planned" ? (
              <>
                <form action={closeAction}>
                  <Button variant="destructive">Close round</Button>
                </form>
                <form action={cancelAction}>
                  <ConfirmButton
                    type="submit"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    message="Are you sure you want to stop/cancel this review round? Reviewers will no longer be able to submit reviews, and no report will be generated."
                  >
                    Stop/Cancel round
                  </ConfirmButton>
                </form>
              </>
            ) : null}
            {round.status === "completed" || round.status === "closed" ? (
              <Button asChild>
                <Link href={`/tools/peer-review/admin/${projectId}/rounds/${roundId}/report`}>View report</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
