import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/require-user";
import { getProject } from "@/lib/services/project-service";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { getRoundProgress, startReviewRound } from "@/lib/services/round-service";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { supabase, user } = await requireUser();
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) redirect("/onboarding");
  const { projectId } = await params;
  const project = await getProject(supabase, projectId);
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  if (!admin || project.workspace_id !== workspace.id) notFound();
  const roundProgress = Object.fromEntries(
    await Promise.all(
      (project.review_rounds ?? []).map(async (round) => [
        round.id,
        await getRoundProgress(supabase, round.id),
      ]),
    ),
  );

  async function startAction(formData: FormData) {
    "use server";
    const { supabase, user } = await requireUser();
    const workspace = await getCurrentWorkspace(supabase, user.id);
    const actionProject = await getProject(supabase, projectId);
    if (
      !workspace ||
      actionProject.workspace_id !== workspace.id ||
      !(await isWorkspaceAdmin(workspace.id, user.id, supabase))
    ) {
      throw new Error("Admin access required.");
    }
    await startReviewRound(supabase, String(formData.get("roundId")));
    redirect(`/tools/peer-review/admin/${projectId}`);
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{project.name}</h1>
          <p className="text-muted-foreground">{project.description}</p>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href={`/tools/peer-review/admin/${project.id}/settings`}>Settings</Link>
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Review rounds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(project.review_rounds ?? []).sort((a, b) => a.round_number - b.round_number).map((round) => {
              const complete = round.status === "completed" || round.status === "closed";
              const progress = roundProgress[round.id] ?? {
                completionRate: 0,
                submitted: 0,
                total: 0,
                pending: 0,
                overdue: 0,
              };
              return (
                <div key={round.id} className="flex flex-col gap-3 rounded-md border border-border p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium">{round.title}</div>
                    <div className="text-sm text-muted-foreground">
                      Due {new Date(round.due_at).toLocaleString()}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {progress.submitted} of {progress.total} submitted -{" "}
                      {progress.pending} pending
                    </div>
                    <div className="mt-2 w-56">
                      <Progress value={complete ? 100 : progress.completionRate} />
                    </div>
                  </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Badge>{round.status}</Badge>
                    {round.status === "planned" ? (
                      <form action={startAction}>
                        <input type="hidden" name="roundId" value={round.id} />
                        <Button size="sm">Start</Button>
                      </form>
                    ) : null}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/tools/peer-review/admin/${project.id}/rounds/${round.id}`}>Progress</Link>
                    </Button>
                    {complete ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/tools/peer-review/admin/${project.id}/rounds/${round.id}/report`}>Report</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(project.project_members ?? []).map((member) => (
              <div key={member.id} className="rounded-md border border-border p-3">
                <div className="font-medium">{member.profiles?.full_name ?? member.profiles?.email}</div>
                <div className="text-sm text-muted-foreground">{member.role_label ?? "Team member"}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
