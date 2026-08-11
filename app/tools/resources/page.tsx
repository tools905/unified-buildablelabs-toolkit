import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { listResources, listRoadmaps } from "@/lib/services/resource-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; roadmap?: string; search?: string }>;
}) {
  await requireEnabledTool("resources");
  const { supabase, user } = await requireUser("/tools/resources");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const params = await searchParams;

  const [resources, roadmaps] = await Promise.all([
    listResources(supabase, workspace.id, {
      category: params.category,
      roadmapId: params.roadmap,
      search: params.search,
    }),
    listRoadmaps(supabase, workspace.id),
  ]);

  const categories = ["tutorial", "guide", "tool", "reference"];

  function buildHref(overrides: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    const merged = { ...params, ...overrides };
    if (merged.category) next.set("category", merged.category);
    if (merged.roadmap) next.set("roadmap", merged.roadmap);
    if (merged.search) next.set("search", merged.search);
    const query = next.toString();
    return `/tools/resources${query ? `?${query}` : ""}`;
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Resources</h1>
        <p className="text-muted-foreground">Guides, tools, and learning roadmaps shared by the team.</p>
      </div>

      <form className="mb-4 flex flex-wrap gap-2" action="/tools/resources">
        <input
          type="search"
          name="search"
          placeholder="Search resources…"
          defaultValue={params.search ?? ""}
          className="h-10 max-w-xs flex-1 rounded-md border border-border bg-background px-3 text-sm"
        />
        {params.category ? <input type="hidden" name="category" value={params.category} /> : null}
        {params.roadmap ? <input type="hidden" name="roadmap" value={params.roadmap} /> : null}
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href={buildHref({ category: undefined })}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            !params.category ? "border-primary bg-primary text-primary-foreground" : "border-border"
          }`}
        >
          All categories
        </a>
        {categories.map((category) => (
          <a
            key={category}
            href={buildHref({ category })}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
              params.category === category ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
          >
            {category}
          </a>
        ))}
      </div>

      {roadmaps.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          <a
            href={buildHref({ roadmap: undefined })}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              !params.roadmap ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
          >
            All roadmaps
          </a>
          {roadmaps.map((roadmap: { id: string; name: string }) => (
            <a
              key={roadmap.id}
              href={buildHref({ roadmap: roadmap.id })}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                params.roadmap === roadmap.id ? "border-primary bg-primary text-primary-foreground" : "border-border"
              }`}
            >
              {roadmap.name}
            </a>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {resources.map(
          (resource: {
            id: string;
            title: string;
            description: string | null;
            url: string;
            category: string;
            tags: string[];
          }) => (
            <Card key={resource.id} className="flex h-full flex-col">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{resource.title}</CardTitle>
                  <Badge className="capitalize">{resource.category}</Badge>
                </div>
                {resource.description ? (
                  <CardDescription>
                    {resource.description.length > 100
                      ? `${resource.description.slice(0, 100)}…`
                      : resource.description}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="mt-auto">
                {resource.tags.length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {resource.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Open resource <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </CardContent>
            </Card>
          ),
        )}
        {resources.length === 0 ? (
          <p className="col-span-full text-center text-muted-foreground">No resources match these filters.</p>
        ) : null}
      </div>
    </AppShell>
  );
}
