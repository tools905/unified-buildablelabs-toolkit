import { AppShell } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourcesCatalog } from "@/components/resources/resources-catalog";
import { QaTopicPicker } from "@/components/resources/qa-topic-picker";
import { UpskillTabs } from "@/components/resources/upskill-tabs";
import { requireUser } from "@/lib/auth/require-user";
import { listResources, listRoadmaps } from "@/lib/services/resource-service";
import { listQaAttemptsForUser } from "@/lib/services/qa-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; roadmap?: string; search?: string; tab?: string }>;
}) {
  await requireEnabledTool("resources");
  const { supabase, user } = await requireUser("/tools/resources");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const params = await searchParams;

  const [resources, roadmaps, isAdmin] = await Promise.all([
    listResources(supabase, workspace.id, {
      category: params.category,
      roadmapId: params.roadmap,
      search: params.search,
    }),
    listRoadmaps(supabase, workspace.id),
    isWorkspaceAdmin(workspace.id, user.id, supabase),
  ]);

  const historyEntries = await Promise.all(
    roadmaps.map(async (roadmap: { id: string }) => [
      roadmap.id,
      await listQaAttemptsForUser(supabase, user.id, roadmap.id),
    ] as const),
  );
  const historyByRoadmapId = Object.fromEntries(historyEntries);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Upskill"
        title="Catalog & Q&A"
        description="Guides, tools, and learning roadmaps shared by the team — plus an adaptive Q&A to test what you've learned."
      />

      <UpskillTabs
        resourcesTab={<ResourcesCatalog resources={resources} roadmaps={roadmaps} params={params} />}
        qaTab={<QaTopicPicker roadmaps={roadmaps} historyByRoadmapId={historyByRoadmapId} isAdmin={isAdmin} />}
      />
    </AppShell>
  );
}
