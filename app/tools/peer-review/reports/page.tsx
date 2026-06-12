import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWorkspace } from "@/lib/services/workspace-service";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function PeerReviewReportsPage() {
  const { supabase, user } = await requireUser("/tools/peer-review/reports");
  await requireEnabledTool("peer-review");
  const workspace = await getCurrentWorkspace(supabase, user.id);

  const { data: rounds } = workspace
    ? await supabase
        .from("review_rounds")
        .select("*, projects!inner(workspace_id, name)")
        .eq("projects.workspace_id", workspace.id)
        .in("status", ["completed", "closed"])
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Peer Review Reports</h1>
        <p className="text-muted-foreground">Completed and closed peer-review rounds.</p>
      </div>
      <div className="space-y-3">
        {(rounds ?? []).map((round) => (
          <Card key={round.id}>
            <CardHeader>
              <CardTitle>{round.title}</CardTitle>
              <CardDescription>{round.projects?.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href={`/tools/peer-review/admin/${round.project_id}/rounds/${round.id}/report`}>
                  View report
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        {(rounds ?? []).length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No reports yet</CardTitle>
              <CardDescription>Completed peer-review rounds will appear here.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
