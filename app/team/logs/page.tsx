import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";

export default async function TeamLogsPage() {
  const { supabase, user } = await requireUser();
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) redirect("/onboarding");
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  if (!admin) redirect("/dashboard");

  const [auditLogsRes, notificationLogsRes] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("*, profiles!audit_logs_actor_id_fkey(full_name, email)")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("notification_logs")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("sent_at", { ascending: false })
      .limit(100),
  ]);

  const auditLogs = auditLogsRes.data ?? [];
  const notificationLogs = notificationLogsRes.data ?? [];

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Workspace logs</h1>
          <p className="text-muted-foreground">Audit trails and email notification history.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/team">Back to Team</Link>
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Audit logs</CardTitle>
            <CardDescription>Recent actions performed in this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit logs found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => {
                    const actorName = log.profiles?.full_name ?? log.profiles?.email ?? "System";
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{actorName}</TableCell>
                        <TableCell>
                          <Badge>{log.action}</Badge>
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">{log.entity_type}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification logs</CardTitle>
            <CardDescription>Recent transactional emails sent or skipped.</CardDescription>
          </CardHeader>
          <CardContent>
            {notificationLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notification logs found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Notification Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detail / Error</TableHead>
                    <TableHead>Sent At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notificationLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.recipient_email}</TableCell>
                      <TableCell className="capitalize">{log.type.replace(/_/g, " ")}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            log.status === "failed"
                              ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                              : log.status === "skipped"
                                ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          }
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground" title={log.error_message ?? ""}>
                        {log.error_message ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(log.sent_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
