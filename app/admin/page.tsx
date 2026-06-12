import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { listToolkitTools } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase, user } = await requireUser("/admin");
  const workspace = await getCurrentWorkspace(supabase, user.id);
  const admin = workspace ? await isWorkspaceAdmin(workspace.id, user.id, supabase) : false;
  if (!workspace || !admin) notFound();
  const workspaceId = workspace.id;

  const tools = await listToolkitTools();
  const [{ count: members }, { count: projects }, { count: pendingReviews }, { count: auditLogs }] =
    await Promise.all([
      supabase
        .from("workspace_members")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      supabase
        .from("review_assignments")
        .select("*, review_rounds!inner(projects!inner(workspace_id))", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("review_rounds.projects.workspace_id", workspaceId),
      supabase
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
    ]);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Admin Reports</h1>
        <p className="text-muted-foreground">Toolkit-wide status for the internal BuildableLabs workspace.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Members" value={members ?? 0} />
        <StatCard title="Active tools" value={tools.filter((tool) => tool.enabled).length} />
        <StatCard title="Peer review projects" value={projects ?? 0} />
        <StatCard title="Pending reviews" value={pendingReviews ?? 0} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {tools.map((tool) => (
          <Card key={tool.slug}>
            <CardHeader>
              <CardTitle>{tool.name}</CardTitle>
              <CardDescription>{tool.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href={`/tools/${tool.slug}`}>Open</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Audit activity</CardTitle>
          <CardDescription>{auditLogs ?? 0} logged workspace actions.</CardDescription>
        </CardHeader>
      </Card>
    </AppShell>
  );
}
