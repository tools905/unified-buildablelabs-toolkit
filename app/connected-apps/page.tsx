import { PageHeader } from "@/components/dashboard/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { latestUseByClient, toConnectedApps } from "@/lib/mcp/connected-apps";
import { formatISTDateTime } from "@/lib/utils/dates";
import { DisconnectButton } from "@/app/connected-apps/disconnect-button";

export const dynamic = "force-dynamic";

export default async function ConnectedAppsPage() {
  const { supabase, user } = await requireUser("/connected-apps");

  const [grants, audit] = await Promise.all([
    supabase.auth.oauth.listGrants(),
    // The person's own calls, newest first. If it can't be read the page still works, without "last used".
    supabase
      .from("mcp_audit_log")
      .select("client_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const apps = grants.data ? toConnectedApps(grants.data, latestUseByClient(audit.data ?? [])) : [];

  return (
    <>
      <PageHeader
        eyebrow="Connected apps"
        title="Connected apps"
        description="Apps you have allowed to use the toolkit as you. Disconnect one and it can no longer sign in."
      />

      {grants.error ? (
        <Alert className="border-destructive/40">
          <AlertDescription className="text-destructive">
            Could not load your connected apps. Refresh the page to try again.
          </AlertDescription>
        </Alert>
      ) : apps.length === 0 ? (
        <Card>
          <CardContent className="space-y-1 py-8 text-center">
            <p className="font-medium">No apps are connected</p>
            <p className="text-sm text-muted-foreground">
              When you connect an AI app to the toolkit, it shows up here, and you can disconnect it at any time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <Card key={app.clientId}>
              <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div>
                    <p className="font-semibold">{app.name}</p>
                    {app.website ? <p className="break-all text-xs text-muted-foreground">{app.website}</p> : null}
                  </div>
                  <dl className="space-y-0.5 text-sm">
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Connected</dt>
                      <dd>{formatISTDateTime(app.connectedAt)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Last used</dt>
                      <dd>{app.lastUsedAt ? formatISTDateTime(app.lastUsedAt) : "Not used yet"}</dd>
                    </div>
                  </dl>
                  {app.permissions.length > 0 ? (
                    <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                      {app.permissions.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="shrink-0">
                  <DisconnectButton clientId={app.clientId} name={app.name} />
                </div>
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground">
            After you disconnect an app it cannot sign in again until you allow it again. A connection that is already
            open can keep working for a short while, until its current sign-in runs out.
          </p>
        </div>
      )}
    </>
  );
}
