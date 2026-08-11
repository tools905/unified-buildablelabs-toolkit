import { notFound } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { getResourceRoadmapIds, listResources, listRoadmaps } from "@/lib/services/resource-service";
import { RESOURCE_CATEGORIES } from "@/lib/validation/resource-schema";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import {
  createResourceAction,
  createRoadmapAction,
  deleteResourceAction,
  deleteRoadmapAction,
  updateResourceAction,
} from "@/app/tools/resources/actions";

export const dynamic = "force-dynamic";

function RoadmapCheckboxes({
  roadmaps,
  selectedIds,
}: {
  roadmaps: { id: string; name: string }[];
  selectedIds: string[];
}) {
  if (roadmaps.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {roadmaps.map((roadmap) => (
        <label key={roadmap.id} className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            name="roadmapIds"
            value={roadmap.id}
            defaultChecked={selectedIds.includes(roadmap.id)}
          />
          {roadmap.name}
        </label>
      ))}
    </div>
  );
}

export default async function ResourcesAdminPage() {
  await requireEnabledTool("resources");
  const { supabase, user } = await requireUser("/tools/resources/admin");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  if (!admin) notFound();

  const [resources, roadmaps] = await Promise.all([
    listResources(supabase, workspace.id),
    listRoadmaps(supabase, workspace.id),
  ]);

  const roadmapsByResource = new Map<string, string[]>();
  await Promise.all(
    resources.map(async (resource: { id: string }) => {
      roadmapsByResource.set(resource.id, await getResourceRoadmapIds(supabase, resource.id));
    }),
  );

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Resources Admin</h1>
        <p className="text-muted-foreground">Add resources, manage roadmaps, and edit the catalog.</p>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add resource</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createResourceAction} className="space-y-3">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required minLength={2} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="url">URL</Label>
                <Input id="url" name="url" type="url" required className="mt-1" />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" rows={2} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="category">Category</Label>
                  <select
                    id="category"
                    name="category"
                    defaultValue="reference"
                    className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm capitalize"
                  >
                    {RESOURCE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="tags">Tags (comma-separated)</Label>
                  <Input id="tags" name="tags" className="mt-1" />
                </div>
              </div>
              <RoadmapCheckboxes roadmaps={roadmaps} selectedIds={[]} />
              <Button type="submit">Add resource</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Learning roadmaps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={createRoadmapAction} className="space-y-2">
              <Input name="name" placeholder="Roadmap name" required minLength={2} />
              <Textarea name="description" placeholder="Description (optional)" rows={2} />
              <Button type="submit" size="sm">
                Add roadmap
              </Button>
            </form>
            <div className="space-y-2">
              {roadmaps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No roadmaps yet.</p>
              ) : (
                roadmaps.map((roadmap: { id: string; name: string }) => (
                  <div key={roadmap.id} className="flex items-center justify-between rounded-md border border-border p-2">
                    <span className="text-sm">{roadmap.name}</span>
                    <form action={deleteRoadmapAction}>
                      <input type="hidden" name="roadmapId" value={roadmap.id} />
                      <ConfirmButton
                        type="submit"
                        variant="ghost"
                        size="sm"
                        message={`Delete roadmap "${roadmap.name}"? Resources stay, just unlinked.`}
                      >
                        Delete
                      </ConfirmButton>
                    </form>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 text-lg font-semibold">All resources</h2>
      <div className="space-y-3">
        {resources.map(
          (resource: {
            id: string;
            title: string;
            description: string | null;
            url: string;
            category: string;
            tags: string[];
          }) => (
            <details key={resource.id} className="rounded-md border border-border">
              <summary className="cursor-pointer p-3 text-sm font-medium">{resource.title}</summary>
              <div className="border-t border-border p-3">
                <form action={updateResourceAction} className="space-y-3">
                  <input type="hidden" name="resourceId" value={resource.id} />
                  <div>
                    <Label>Title</Label>
                    <Input name="title" defaultValue={resource.title} required minLength={2} className="mt-1" />
                  </div>
                  <div>
                    <Label>URL</Label>
                    <Input name="url" type="url" defaultValue={resource.url} required className="mt-1" />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea name="description" defaultValue={resource.description ?? ""} rows={2} className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Category</Label>
                      <select
                        name="category"
                        defaultValue={resource.category}
                        className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm capitalize"
                      >
                        {RESOURCE_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Tags (comma-separated)</Label>
                      <Input name="tags" defaultValue={resource.tags.join(", ")} className="mt-1" />
                    </div>
                  </div>
                  <RoadmapCheckboxes roadmaps={roadmaps} selectedIds={roadmapsByResource.get(resource.id) ?? []} />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm">
                      Save changes
                    </Button>
                  </div>
                </form>
                <form action={deleteResourceAction} className="mt-2">
                  <input type="hidden" name="resourceId" value={resource.id} />
                  <ConfirmButton
                    type="submit"
                    variant="destructive"
                    size="sm"
                    message={`Delete "${resource.title}"?`}
                  >
                    Delete resource
                  </ConfirmButton>
                </form>
              </div>
            </details>
          ),
        )}
        {resources.length === 0 ? <p className="text-sm text-muted-foreground">No resources yet.</p> : null}
      </div>
    </AppShell>
  );
}
