import { AppShell } from "@/components/dashboard/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function HrBotPage() {
  await requireUser("/tools/hr-bot");
  await requireEnabledTool("hr-bot");

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">HR Bot</h1>
        <p className="text-muted-foreground">Approved HR guidance and team knowledge Q&A will live here.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Module shell ready</CardTitle>
          <CardDescription>
            The toolkit now has a dedicated HR Bot module boundary for future knowledge base,
            chat, policy controls, and answer review workflows.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No unrestricted chatbot or AI answer endpoint is active in this skeleton.
        </CardContent>
      </Card>
    </AppShell>
  );
}
