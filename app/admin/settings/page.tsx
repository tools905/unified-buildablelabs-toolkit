import { notFound } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";

export const dynamic = "force-dynamic";

export default async function AppSettingsPage() {
  const { supabase, user } = await requireUser("/admin/settings");
  const workspace = await getCurrentWorkspace(supabase, user.id);
  const admin = workspace ? await isWorkspaceAdmin(workspace.id, user.id, supabase) : false;
  if (!workspace || !admin) notFound();

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">App Settings</h1>
        <p className="text-muted-foreground">Shared settings for the internal toolkit.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Settings shell ready</CardTitle>
          <CardDescription>
            Environment, scoring, notification, and tool-level controls can be added here as the
            toolkit grows.
          </CardDescription>
        </CardHeader>
      </Card>
    </AppShell>
  );
}
