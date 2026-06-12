import { AppShell } from "@/components/dashboard/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateLinkedInLeaderboards, getLinkedInDashboardData, type LinkedInMemberStats } from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";

export default async function LinkedInLeaderboardsPage() {
  const { supabase, workspace } = await requireLinkedInAdmin();
  const data = await getLinkedInDashboardData(supabase, workspace.id);
  const boards = calculateLinkedInLeaderboards(data.stats);
  return <AppShell><div className="mb-6"><h1 className="text-3xl font-semibold">Leaderboards</h1><p className="text-muted-foreground">Compare final score, original-post volume, and average content quality.</p></div><div className="grid gap-4 lg:grid-cols-3"><Board title="Final score" rows={boards.finalScore} field="finalScore" /><Board title="Post volume" rows={boards.volume} field="postCount" /><Board title="Average quality" rows={boards.quality} field="averageQualityScore" /></div></AppShell>;
}

function Board({ title, rows, field }: { title: string; rows: LinkedInMemberStats[]; field: "finalScore" | "postCount" | "averageQualityScore" }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><ol className="space-y-3">{rows.map((member, index) => <li key={member.trackedMemberId} className="flex items-center justify-between gap-3 text-sm"><span>{index + 1}. {member.name}</span><span className="font-semibold">{member[field] ?? "N/A"}</span></li>)}{rows.length === 0 ? <li className="text-sm text-muted-foreground">No profiles tracked.</li> : null}</ol></CardContent></Card>;
}
