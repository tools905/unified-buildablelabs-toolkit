import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { listToolkitTools } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  await requireUser("/tools");
  const tools = await listToolkitTools();

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Tools</h1>
        <p className="text-muted-foreground">Shared internal tools for BuildableLabs workflows.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {tools.map((tool) => (
          <Card key={tool.slug} className="card-hover-effect">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{tool.name}</CardTitle>
                <Badge>{tool.enabled ? "Enabled" : "Disabled"}</Badge>
              </div>
              <CardDescription>{tool.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant={tool.enabled ? "default" : "secondary"}>
                <Link href={`/tools/${tool.slug}`}>
                  Open tool
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
