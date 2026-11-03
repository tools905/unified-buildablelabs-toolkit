import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmailHistory } from "@/components/team/email-history";
import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { parseDateRange, rangeBounds } from "@/lib/utils/date-range";

export default async function TeamLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) redirect("/onboarding");
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  if (!admin) redirect("/dashboard");

  const range = parseDateRange(await searchParams);
  const { since, until } = rangeBounds(range);
  let query = supabase.from("notification_logs").select("id, recipient_email, type, status, error_message, sent_at").eq("workspace_id", workspace.id);
  if (since) query = query.gte("sent_at", since);
  if (until) query = query.lte("sent_at", until);
  const { data } = await query.order("sent_at", { ascending: false }).limit(300);

  return (
    <>
      <PageHeader
        title="Workspace logs"
        description="The emails the workspace has sent or skipped."
        actions={
          <Button asChild variant="outline">
            <Link href="/team">Back to Team</Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Email history</CardTitle>
          <CardDescription>Transactional emails, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailHistory key={`${range.key}:${range.from}:${range.to}`} logs={data ?? []} range={range} />
        </CardContent>
      </Card>
    </>
  );
}
