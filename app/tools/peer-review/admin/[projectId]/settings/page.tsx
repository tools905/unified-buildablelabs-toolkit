import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireUser } from "@/lib/auth/require-user";
import { getProject, updateProject, deleteProject } from "@/lib/services/project-service";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { writeAuditLog } from "@/lib/services/audit-service";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProjectStatus } from "@/lib/db/types";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { supabase } = await requireUser();
  const { projectId } = await params;
  const project = await getProject(supabase, projectId);

  async function updateProjectAction(formData: FormData) {
    "use server";
    const { supabase } = await requireUser();
    await updateProject(supabase, projectId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      reviewDueHours: Number(formData.get("reviewDueHours") ?? 48),
      status: String(formData.get("status")) as ProjectStatus,
    });
    redirect(`/tools/peer-review/admin/${projectId}`);
  }

  async function deleteProjectAction() {
    "use server";
    const { supabase, user } = await requireUser();
    const workspace = await getCurrentWorkspace(supabase, user.id);
    if (!workspace) throw new Error("Workspace required.");

    const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
    if (!admin) throw new Error("Only workspace admins can delete projects.");

    await deleteProject(supabase, projectId);

    const adminClient = createAdminClient();
    await writeAuditLog(adminClient, {
      workspaceId: workspace.id,
      actorId: user.id,
      action: "project.deleted",
      entityType: "project",
      entityId: projectId,
    });

    redirect("/tools/peer-review/admin");
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Project settings</CardTitle>
            <CardDescription>
              Update project name, description, due window, and status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateProjectAction} className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Project name</Label>
                  <Input id="name" name="name" required minLength={2} defaultValue={project.name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={project.status}
                    className="h-10 w-full rounded-md border border-border bg-card px-3"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reviewDueHours">Due window hours</Label>
                  <Input
                    id="reviewDueHours"
                    name="reviewDueHours"
                    type="number"
                    min={24}
                    max={168}
                    defaultValue={project.review_due_hours}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" defaultValue={project.description ?? ""} />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Save settings</Button>
                <Button type="button" asChild variant="outline">
                  <Link href={`/tools/peer-review/admin/${project.id}`}>Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Permanently delete this project and all associated review rounds, assignments, and reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={deleteProjectAction}>
              <ConfirmButton
                type="submit"
                variant="destructive"
                message="Are you sure you want to delete this project? All rounds, reviews, and logs will be permanently removed. This action cannot be undone."
              >
                Delete Project
              </ConfirmButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
