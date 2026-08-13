import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
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
      <PageHeader
        eyebrow="Catalog"
        title="Tools"
        description="Every internal tool available to BuildableLabs, including ones not yet enabled for your workspace."
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4">
        {tools.map((tool) => (
          <Card key={tool.slug} className="card-hover-effect flex h-full flex-col">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>{tool.name}</CardTitle>
                <Badge>{tool.enabled ? "Enabled" : "Disabled"}</Badge>
              </div>
              <CardDescription>{tool.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button asChild variant={tool.enabled ? "default" : "secondary"} className="w-full sm:w-auto">
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
