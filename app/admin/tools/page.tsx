import { notFound } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { listToolkitTools } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function ToolSettingsPage() {
  const { supabase, user } = await requireUser("/admin/tools");
  const workspace = await getCurrentWorkspace(supabase, user.id);
  const admin = workspace ? await isWorkspaceAdmin(workspace.id, user.id, supabase) : false;
  if (!workspace || !admin) notFound();
  const tools = await listToolkitTools();

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Tool Settings</h1>
        <p className="text-muted-foreground">Enabled tools are controlled by the shared toolkit registry.</p>
      </div>
      <div className="space-y-3">
        {tools.map((tool) => (
          <Card key={tool.slug}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{tool.name}</CardTitle>
                  <CardDescription>{tool.description}</CardDescription>
                </div>
                <Badge>{tool.enabled ? "Enabled" : "Disabled"}</Badge>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
