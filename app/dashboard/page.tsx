import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  CalendarClock,
  ClipboardCheck,
  KanbanSquare,
  BookOpen,
  Newspaper,
  Share2,
  type LucideIcon,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { listToolkitTools, type ToolkitTool, type ToolkitToolSlug } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

const TOOL_ICONS: Record<ToolkitToolSlug, LucideIcon> = {
  "peer-review": ClipboardCheck,
  "linkedin-assessor": Share2,
  "hr-bot": Bot,
  tickets: KanbanSquare,
  resources: BookOpen,
  meetings: CalendarClock,
  newsletter: Newspaper,
  "content-board": KanbanSquare,
};

function ToolCardBody({ tool }: { tool: ToolkitTool }) {
  const Icon = TOOL_ICONS[tool.slug];
  return (
    <>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate font-semibold">{tool.name}</h3>
          {tool.enabled ? (
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
          ) : (
            <Badge>Not enabled</Badge>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
      </div>
    </>
  );
}

// Every tool in the catalog. Tools that are switched off are listed too, so nobody has to look
// elsewhere for the full picture, but only enabled ones open.
function ToolGrid({ tools }: { tools: ToolkitTool[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) =>
        tool.enabled ? (
          <Link key={tool.slug} href={`/tools/${tool.slug}`} prefetch className="group block">
            <Card className="card-hover-effect flex h-full items-start gap-4 p-5">
              <ToolCardBody tool={tool} />
            </Card>
          </Link>
        ) : (
          <Card key={tool.slug} aria-disabled="true" className="flex h-full items-start gap-4 p-5 opacity-60">
            <ToolCardBody tool={tool} />
          </Card>
        ),
      )}
    </div>
  );
}

// The workspace-wide numbers admins used to find under Admin Reports.
async function loadAdminStats(supabase: SupabaseClient<any>, workspaceId: string) {
  const [members, projects, pendingReviews, auditLogs] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
    supabase.from("projects").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase
      .from("review_assignments")
      .select("*, review_rounds!inner(projects!inner(workspace_id))", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("review_rounds.projects.workspace_id", workspaceId),
    supabase.from("audit_logs").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId),
  ]);
  return {
    members: members.count ?? 0,
    projects: projects.count ?? 0,
    pendingReviews: pendingReviews.count ?? 0,
    auditLogs: auditLogs.count ?? 0,
  };
}

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const [tools, admin] = await Promise.all([listToolkitTools(), isWorkspaceAdmin(workspace.id, user.id, supabase)]);
  const stats = admin ? await loadAdminStats(supabase, workspace.id) : null;
  const companyTools = tools.filter((tool) => tool.group === "company");
  const contentTools = tools.filter((tool) => tool.group === "content");

  const displayName =
    (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    user.email?.split("@")[0] ||
    "there";

  return (
    <>
      <PageHeader
        eyebrow={workspace.name}
        title={`Welcome back, ${displayName}`}
        description="Every tool your team uses, in one place."
      />

      {stats ? (
        <CollapsibleSection title="Workspace overview">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard title="Members" value={stats.members} />
            <StatCard title="Active tools" value={tools.filter((tool) => tool.enabled).length} />
            <StatCard title="Peer review projects" value={stats.projects} />
            <StatCard title="Pending reviews" value={stats.pendingReviews} />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {stats.auditLogs} logged workspace actions.{" "}
            <Link href="/team/logs" className="font-medium text-primary hover:underline">
              View workspace logs
            </Link>
          </p>
        </CollapsibleSection>
      ) : null}

      {companyTools.length > 0 ? (
        <CollapsibleSection title="Company" count={companyTools.length}>
          <ToolGrid tools={companyTools} />
        </CollapsibleSection>
      ) : null}

      {contentTools.length > 0 ? (
        <CollapsibleSection title="Content" count={contentTools.length}>
          <ToolGrid tools={contentTools} />
        </CollapsibleSection>
      ) : null}
    </>
  );
}
