import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/require-user";
import { getProject, addProjectMember, removeProjectMember } from "@/lib/services/project-service";
import { getCurrentWorkspace, isWorkspaceAdmin, getWorkspaceMembers } from "@/lib/services/workspace-service";
import { getRoundProgressMap, startReviewRound } from "@/lib/services/round-service";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) redirect("/onboarding");
  const { projectId } = await params;
  const project = await getProject(supabase, projectId);
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  if (!admin || project.workspace_id !== workspace.id) notFound();

  const workspaceMembers = await getWorkspaceMembers(supabase, workspace.id);
  const activeProjectMembers = (project.project_members ?? []).filter((m: any) => m.is_active);
  const activeUserIds = new Set(activeProjectMembers.map((m: any) => m.user_id));
  const nonProjectMembers = workspaceMembers.filter((m) => !activeUserIds.has(m.user_id));

  const roundProgress = await getRoundProgressMap(
    supabase,
    (project.review_rounds ?? []).map((round) => round.id),
  );

  const queryParams = await searchParams;

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

  async function removeMemberAction(formData: FormData) {
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
    const targetUserId = String(formData.get("userId"));
    try {
      await removeProjectMember(supabase, projectId, targetUserId, user.id);
    } catch {
      redirect(`/tools/peer-review/admin/${projectId}?error=min_members`);
    }
    redirect(`/tools/peer-review/admin/${projectId}`);
  }

  async function addMemberAction(formData: FormData) {
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
    const targetUserId = String(formData.get("userId"));
    const roleLabel = String(formData.get("roleLabel") ?? "");
    await addProjectMember(supabase, projectId, targetUserId, roleLabel, user.id);
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

      {queryParams.error === "min_members" ? (
        <Alert className="mb-6 border-destructive/40 bg-destructive/5 text-destructive">
          <AlertTitle>Cannot Remove Member</AlertTitle>
          <AlertDescription>
            A project must have at least 2 active members to support full peer reviews.
          </AlertDescription>
        </Alert>
      ) : null}

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
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {activeProjectMembers.map((member: any) => {
                const displayName = member.profiles?.full_name ?? member.profiles?.email;
                return (
                  <div key={member.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div>
                      <div className="font-medium">{displayName}</div>
                      <div className="text-sm text-muted-foreground">{member.role_label ?? "Team member"}</div>
                    </div>
                    {["draft", "active"].includes(project.status) ? (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="userId" value={member.user_id} />
                        <ConfirmButton
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          message={`Are you sure you want to remove ${displayName} from the project? Their pending reviews for ongoing rounds will be deleted.`}
                        >
                          Remove
                        </ConfirmButton>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {["draft", "active"].includes(project.status) && nonProjectMembers.length > 0 ? (
              <div className="border-t border-border pt-4">
                <h3 className="mb-3 text-sm font-medium">Add to project</h3>
                <form action={addMemberAction} className="space-y-3">
                  <div className="space-y-2">
                    <select
                      name="userId"
                      required
                      className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Select team member...</option>
                      {nonProjectMembers.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.profiles?.full_name ?? m.profiles?.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Input
                      name="roleLabel"
                      placeholder="Project role, e.g. Lead Designer"
                      className="h-10 text-sm"
                    />
                  </div>
                  <Button type="submit" size="sm" className="w-full">
                    Add member
                  </Button>
                </form>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
