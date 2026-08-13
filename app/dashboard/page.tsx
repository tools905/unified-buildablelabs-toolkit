import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  CalendarClock,
  ClipboardCheck,
  KanbanSquare,
  BookOpen,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { listToolkitTools, type ToolkitToolSlug } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

const TOOL_ICONS: Record<ToolkitToolSlug, LucideIcon> = {
  "peer-review": ClipboardCheck,
  "linkedin-assessor": Share2,
  "hr-bot": Bot,
  tickets: KanbanSquare,
  resources: BookOpen,
  meetings: CalendarClock,
};

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const tools = await listToolkitTools();
  const enabledTools = tools.filter((tool) => tool.enabled);

  const displayName =
    (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    user.email?.split("@")[0] ||
    "there";

  return (
    <AppShell>
      <PageHeader
        eyebrow={workspace.name}
        title={`Welcome back, ${displayName}`}
        description="Jump straight into a tool below, or browse the full catalog for everything available to your workspace."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {enabledTools.map((tool) => {
          const Icon = TOOL_ICONS[tool.slug];
          return (
            <Link key={tool.slug} href={`/tools/${tool.slug}`} className="group block">
              <Card className="card-hover-effect flex h-full items-start gap-4 p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate font-semibold">{tool.name}</h3>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
        <span>Looking for a tool that isn&apos;t enabled yet, or want the full breakdown?</span>
        <Link href="/tools" className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline">
          Browse all tools <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </AppShell>
  );
}
