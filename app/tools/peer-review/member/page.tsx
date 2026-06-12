import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { getMyAssignments } from "@/lib/services/assignment-service";

function statusBadgeClass(status: string) {
  switch (status) {
    case "pending":
      return "bg-rose-500/10 text-rose-400 border-rose-500/20";
    case "submitted":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "overdue":
      return "bg-rose-500/20 text-rose-300 border-rose-500/30";
    case "skipped":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export default async function MyReviewsPage() {
  const { supabase, user } = await requireUser();
  const assignments = await getMyAssignments(supabase, user.id);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">My reviews</h1>
        <p className="text-muted-foreground">Assigned reviews awaiting your feedback.</p>
      </div>
      <div className="space-y-3">
        {assignments.map((assignment) => (
          <Card key={assignment.id} className="card-hover-effect">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{assignment.reviewee?.full_name ?? assignment.reviewee?.email}</span>
                <Badge className={statusBadgeClass(assignment.status)}>{assignment.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-muted-foreground">
                <div>{assignment.review_rounds?.projects?.name}</div>
                <div>{assignment.review_rounds?.title}</div>
                <div>Due {assignment.review_rounds?.due_at ? new Date(assignment.review_rounds.due_at).toLocaleString() : "n/a"}</div>
              </div>
              <Button
                asChild
                variant={assignment.status === "submitted" ? "outline" : "default"}
                className={
                  assignment.status === "submitted"
                    ? "border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300"
                    : ""
                }
              >
                <Link href={`/tools/peer-review/member/${assignment.id}`}>
                  {assignment.status === "submitted" ? "Edit review" : "Open review"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
