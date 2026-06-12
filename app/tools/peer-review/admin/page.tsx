import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { listProjects } from "@/lib/services/project-service";
import {
  getCurrentWorkspace,
  isWorkspaceAdmin,
} from "@/lib/services/workspace-service";

export default async function ProjectsPage() {
  const { supabase, user } = await requireUser();
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) redirect("/onboarding");
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  if (!admin) notFound();
  const projects = await listProjects(supabase, workspace.id);

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Projects</h1>
          <p className="text-muted-foreground">Review cadence and rounds.</p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/tools/peer-review/admin/new">New project</Link>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <Link key={project.id} href={`/tools/peer-review/admin/${project.id}`}>
            <Card className="h-full card-hover-effect">
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {project.description ?? "No description"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge>{project.status}</Badge>
                  <Badge>{project.cadence}</Badge>
                  <Badge>{project.review_rounds?.length ?? 0} rounds</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
