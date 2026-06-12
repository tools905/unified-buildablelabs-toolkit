import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { LinkedInMemberTable } from "@/components/linkedin-assessor/member-table";
import { LinkedInScoreOverview } from "@/components/linkedin-assessor/score-overview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLinkedInDashboardData } from "@/modules/linkedin-assessor";
import { requireLinkedInContext } from "@/modules/linkedin-assessor/context";

export const dynamic = "force-dynamic";

export default async function LinkedInAssessorPage() {
  const { supabase, user, workspace, admin } = await requireLinkedInContext();
  const data = await getLinkedInDashboardData(supabase, workspace.id, { profileId: user.id, memberOnly: !admin });
  if (!admin && data.settings?.member_insights_enabled === false) {
    return <AppShell><div className="mb-6"><h1 className="text-3xl font-semibold">LinkedIn Assessor</h1><p className="text-muted-foreground">Personal LinkedIn coaching insights.</p></div><Card><CardHeader><CardTitle>Personal insights are disabled</CardTitle><CardDescription>An administrator has disabled member-facing LinkedIn results for this workspace.</CardDescription></CardHeader></Card></AppShell>;
  }
  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-3xl font-semibold">LinkedIn Assessor</h1><p className="text-muted-foreground">Original-post consistency, quality, and practical coaching signals.</p></div>
        {admin ? <Button asChild><Link href="/tools/linkedin-assessor/admin">Manage assessor</Link></Button> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Original posts" value={data.summary.totalPosts} description={data.window.name} />
        <StatCard title="Average quality" value={data.summary.averageQuality ?? "N/A"} />
        <StatCard title="Most active" value={data.summary.mostActiveMember ?? "N/A"} />
        <StatCard title="Tracking issues" value={data.stats.filter((member) => member.trackingStatus !== "active").length} />
      </div>
      <div className="mt-6"><LinkedInScoreOverview stats={data.stats} /></div>
      <Card className="mt-6">
        <CardHeader><CardTitle>{admin ? "Team performance" : "My LinkedIn insights"}</CardTitle><CardDescription>Volume and quality are combined using each tracked profile&apos;s configured weights.</CardDescription></CardHeader>
        <CardContent><LinkedInMemberTable stats={data.stats} linkMembers={admin} /></CardContent>
      </Card>
      {!admin && data.stats.length === 0 ? <Card className="mt-6"><CardHeader><CardTitle>No linked LinkedIn profile</CardTitle><CardDescription>Ask an admin to link your toolkit account to a tracked LinkedIn profile.</CardDescription></CardHeader></Card> : null}
    </AppShell>
  );
}
