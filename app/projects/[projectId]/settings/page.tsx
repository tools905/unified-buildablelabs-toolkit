import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireUser } from "@/lib/auth/require-user";
import { getProject, updateProject } from "@/lib/services/project-service";
import type { ProjectStatus } from "@/lib/db/types";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { supabase, user } = await requireUser();
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
    redirect(`/projects/${projectId}`);
  }

  return (
    <AppShell>
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
                <Link href={`/projects/${project.id}`}>Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}
