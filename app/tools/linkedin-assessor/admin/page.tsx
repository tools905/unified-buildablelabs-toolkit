import Link from "next/link";
import { Plus, RefreshCw, Sparkles } from "lucide-react";
import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { LinkedInMemberTable } from "@/components/linkedin-assessor/member-table";
import { LinkedInScoreOverview } from "@/components/linkedin-assessor/score-overview";
import { LinkedInMemberScoreBreakdown } from "@/components/linkedin-assessor/member-score-breakdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLinkedInDashboardData } from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";
import { scoreLinkedInAction, syncLinkedInAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LinkedInAdminPage() {
  const { supabase, workspace } = await requireLinkedInAdmin("/tools/linkedin-assessor/admin");
  const data = await getLinkedInDashboardData(supabase, workspace.id, { includeLogs: true });
  return <AppShell>
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="text-3xl font-semibold">LinkedIn Admin</h1><p className="text-muted-foreground">Manage profiles, collect original posts, and generate coaching scores.</p></div>
      <div className="flex flex-wrap gap-2">
        <form action={syncLinkedInAction}><Button variant="outline"><RefreshCw className="h-4 w-4" />Sync posts</Button></form>
        <form action={scoreLinkedInAction}><Button variant="outline"><Sparkles className="h-4 w-4" />Score posts</Button></form>
        <Button asChild><Link href="/tools/linkedin-assessor/admin/members/new"><Plus className="h-4 w-4" />Add profile</Link></Button>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Tracked profiles" value={data.stats.length} />
      <StatCard title="Original posts" value={data.summary.totalPosts} />
      <StatCard title="Average quality" value={data.summary.averageQuality ?? "N/A"} />
      <StatCard title="Tracking issues" value={data.stats.filter((member) => member.trackingStatus !== "active").length} />
    </div>
    <div className="mt-6"><LinkedInScoreOverview stats={data.stats} /></div>
    <LinkedInMemberScoreBreakdown stats={data.stats} />
    <Card className="mt-6"><CardHeader><CardTitle>Tracked members</CardTitle></CardHeader><CardContent><LinkedInMemberTable stats={data.stats} /></CardContent></Card>
    <Card className="mt-6"><CardHeader><CardTitle>Recent sync activity</CardTitle></CardHeader><CardContent className="space-y-3">{data.logs.slice(0, 10).map((log) => <div key={log.id} className="flex flex-col gap-1 border-b border-border pb-3 text-sm last:border-0"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium capitalize">{log.status} · {log.job_type.replaceAll("_", " ")}</span><span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span></div><span className="text-muted-foreground">{log.message}</span></div>)}{data.logs.length === 0 ? <p className="text-sm text-muted-foreground">No sync jobs have run yet.</p> : null}</CardContent></Card>
  </AppShell>;
}
