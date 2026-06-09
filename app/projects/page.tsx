import Link from "next/link";
import { redirect } from "next/navigation";
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
  const projects = await listProjects(supabase, workspace.id);

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Projects</h1>
          <p className="text-muted-foreground">Review cadence and rounds.</p>
        </div>
        {admin ? (
          <Button asChild>
            <Link href="/projects/new">New project</Link>
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => (
          <Link key={project.id} href={`/projects/${project.id}`}>
            <Card className="h-full card-hover-effect">
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {project.description ?? "No description"}
                </p>
                <div className="flex gap-2">
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
