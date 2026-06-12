import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { listToolkitTools } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  await requireDefaultWorkspace(supabase, user.id);
  const tools = await listToolkitTools();
  const enabledTools = tools.filter((tool) => tool.enabled);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Open a BuildableLabs internal tool to continue your workflow.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {enabledTools.map((tool) => (
          <Card key={tool.slug} className="card-hover-effect">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{tool.name}</CardTitle>
                <Badge>Enabled</Badge>
              </div>
              <CardDescription>{tool.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href={`/tools/${tool.slug}`}>Open tool</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
