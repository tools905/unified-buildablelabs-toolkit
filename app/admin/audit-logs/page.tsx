import { notFound } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  const { supabase, user } = await requireUser("/admin/audit-logs");
  const workspace = await getCurrentWorkspace(supabase, user.id);
  const admin = workspace ? await isWorkspaceAdmin(workspace.id, user.id, supabase) : false;
  if (!workspace || !admin) notFound();
  const { data: logs } = workspace
    ? await supabase
        .from("audit_logs")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(25)
    : { data: [] };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Audit Logs</h1>
        <p className="text-muted-foreground">Recent admin and system actions.</p>
      </div>
      <div className="space-y-3">
        {(logs ?? []).map((log) => (
          <Card key={log.id}>
            <CardHeader>
              <CardTitle className="text-base">{log.action}</CardTitle>
              <CardDescription>
                {log.entity_type} · {new Date(log.created_at).toLocaleString()}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
        {(logs ?? []).length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No audit logs yet</CardTitle>
              <CardDescription>Important actions will appear here.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
