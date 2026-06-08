import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireUser } from "@/lib/auth/require-user";
import { createProject } from "@/lib/services/project-service";
import { getCurrentWorkspace, getWorkspaceMembers, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { minimumProjectMembers } from "@/lib/utils/team-size";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) redirect("/onboarding");
  if (!(await isWorkspaceAdmin(workspace.id, user.id, supabase))) redirect("/projects");
  const members = await getWorkspaceMembers(supabase, workspace.id);
  const params = await searchParams;
  const minMembers = minimumProjectMembers();

  async function createProjectAction(formData: FormData) {
    "use server";
    const { supabase, user } = await requireUser();
    const workspace = await getCurrentWorkspace(supabase, user.id);
    if (!workspace) throw new Error("Workspace required.");
    const memberIds = formData.getAll("memberIds").map(String);
    if (memberIds.length < minimumProjectMembers()) {
      redirect("/projects/new?error=members");
    }
    const roleLabels = Object.fromEntries(
      memberIds.map((id) => [id, String(formData.get(`role_${id}`) ?? "")]),
    );
    const project = await createProject(supabase, workspace.id, user.id, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      startDate: new Date(String(formData.get("startDate"))),
      endDate: new Date(String(formData.get("endDate"))),
      cadence: String(formData.get("cadence") ?? "weekly") as "weekly",
      reviewDueHours: Number(formData.get("reviewDueHours") ?? 48),
      memberIds,
      roleLabels,
    });
    redirect(`/projects/${project.id}`);
  }

  return (
    <AppShell>
      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
          <CardDescription>
            Select at least three active members. Reviews per person are automatically calculated as member count minus one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {params.error === "members" ? (
            <Alert className="mb-5 border-destructive/40">
              <AlertTitle>Choose at least 3 members</AlertTitle>
              <AlertDescription>
                Full peer review needs at least {minMembers} active project
                member{minMembers === 1 ? "" : "s"} in this environment.
              </AlertDescription>
            </Alert>
          ) : null}
          {members.length < minMembers ? (
            <Alert className="mb-5">
              <AlertTitle>More team members needed</AlertTitle>
              <AlertDescription>
                This workspace currently has {members.length} active member
                {members.length === 1 ? "" : "s"}. Add at least {minMembers} member
                {minMembers === 1 ? "" : "s"} from the Team page before creating
                a review project.
              </AlertDescription>
            </Alert>
          ) : null}
          <form action={createProjectAction} className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Project name</Label>
                <Input id="name" name="name" required minLength={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cadence">Cadence</Label>
                <select id="cadence" name="cadence" className="h-10 w-full rounded-md border border-border bg-card px-3">
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="final_only">Final only</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate">Start date</Label>
                <Input id="startDate" name="startDate" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End date</Label>
                <Input id="endDate" name="endDate" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reviewDueHours">Due window hours</Label>
                <Input id="reviewDueHours" name="reviewDueHours" type="number" min={24} max={168} defaultValue={48} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" />
            </div>
            <div>
              <h2 className="mb-3 font-medium">Members</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {members.map((member) => (
                  <label key={member.user_id} className="rounded-md border border-border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" name="memberIds" value={member.user_id} />
                      <span className="font-medium">{member.profiles?.full_name ?? member.profiles?.email}</span>
                    </div>
                    <Input name={`role_${member.user_id}`} placeholder="Project role, e.g. Developer" className="mt-2" />
                  </label>
                ))}
              </div>
            </div>
            <Button className="w-fit" disabled={members.length < minMembers}>
              Create project
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
