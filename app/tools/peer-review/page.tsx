import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function PeerReviewToolPage() {
  const { supabase, user } = await requireUser("/tools/peer-review");
  await requireEnabledTool("peer-review");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);

  const [{ data: projects }, { data: assignments }, { data: rounds }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("*, review_rounds(*)")
        .eq("workspace_id", workspace.id),
      supabase.from("review_assignments").select("*").eq("reviewer_id", user.id),
      supabase
        .from("review_rounds")
        .select("*, projects!inner(workspace_id)")
        .eq("projects.workspace_id", workspace.id),
    ]);

  const pending = assignments?.filter((a) => a.status === "pending").length ?? 0;
  const submitted = assignments?.filter((a) => a.status === "submitted").length ?? 0;
  const overdue = assignments?.filter((a) => a.status === "overdue").length ?? 0;
  const openRounds = rounds?.filter((round) => round.status === "active").length ?? 0;
  const reportsReady =
    rounds?.filter((round) => ["completed", "closed"].includes(round.status)).length ?? 0;

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Peer Review</h1>
          <p className="text-muted-foreground">
            Review cycles, assigned feedback, progress, and reports.
          </p>
        </div>
        {admin ? (
          <Button asChild className="w-full sm:w-auto">
            <Link href="/tools/peer-review/admin/new">New project</Link>
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Projects" value={projects?.length ?? 0} />
        <StatCard title="Open Review Rounds" value={openRounds} />
        <StatCard title="Pending Reviews" value={pending} />
        <StatCard title="Reports Ready" value={reportsReady} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My review status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <StatCard title="Pending" value={pending} />
            <StatCard title="Submitted" value={submitted} />
            <StatCard title="Overdue" value={overdue} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{admin ? "Recent projects" : "Next step"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {admin
              ? (projects ?? []).slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    href={`/tools/peer-review/admin/${project.id}`}
                    className="block rounded-md border border-border p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="font-medium">{project.name}</div>
                    <div className="text-sm text-muted-foreground">{project.cadence}</div>
                  </Link>
                ))
              : null}
            {!admin ? (
              <Button asChild className="w-full sm:w-auto">
                <Link href="/tools/peer-review/member">Open my assigned reviews</Link>
              </Button>
            ) : null}
            {admin && (projects ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No peer-review projects have been created yet.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
