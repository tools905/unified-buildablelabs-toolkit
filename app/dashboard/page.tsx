import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import {
  isWorkspaceAdmin,
} from "@/lib/services/workspace-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { listToolkitTools } from "@/modules/core/tools/registry";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  const tools = await listToolkitTools();

  const [{ data: projects }, { data: assignments }, { data: rounds }] =
    await Promise.all([
      supabase.from("projects").select("*, review_rounds(*)").eq("workspace_id", workspace.id),
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">BuildableLabs Toolkit</h1>
          <p className="text-muted-foreground">One internal workspace for reviews, reports, and team tools.</p>
        </div>
        {admin ? (
          <Button asChild>
            <Link href="/tools/peer-review/admin/new">New peer-review project</Link>
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Active Tools" value={tools.filter((tool) => tool.enabled).length} />
        <StatCard title="Peer Review Projects" value={projects?.length ?? 0} />
        <StatCard title="Open Review Rounds" value={openRounds} />
        <StatCard title="Pending Reviews" value={pending} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My review status</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <StatCard title="Pending" value={pending} />
            <StatCard title="Submitted" value={submitted} />
            <StatCard title="Overdue" value={overdue} />
            <StatCard title="Reports Ready" value={reportsReady} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Peer-review projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(projects ?? []).slice(0, 5).map((project) => (
              <Link key={project.id} href={`/tools/peer-review/admin/${project.id}`} className="block rounded-md border border-border p-3 hover:bg-muted">
                <div className="font-medium">{project.name}</div>
                <div className="text-sm text-muted-foreground">{project.cadence}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
