import { format } from "date-fns";
import { notFound } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLinkedInDashboardData } from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";
import { setTrackedMemberStatusAction, syncLinkedInAction } from "../../../actions";

export default async function LinkedInMemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, workspace } = await requireLinkedInAdmin();
  const data = await getLinkedInDashboardData(supabase, workspace.id);
  const member = data.stats.find((item) => item.trackedMemberId === id);
  if (!member) notFound();
  const posts = data.posts.filter((post) => post.memberId === id);
  return <AppShell>
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold">{member.name}</h1><Badge>{member.trackingStatus.replaceAll("_", " ")}</Badge></div><a href={member.linkedinProfileUrl} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:underline">{member.linkedinProfileUrl}</a></div><div className="flex flex-wrap gap-2"><form action={syncLinkedInAction}><input type="hidden" name="memberId" value={id} /><Button variant="outline"><RefreshCw className="h-4 w-4" />Sync profile</Button></form><form action={setTrackedMemberStatusAction}><input type="hidden" name="memberId" value={id} /><input type="hidden" name="status" value={member.trackingStatus === "paused" ? "pending" : "paused"} /><Button variant="outline">{member.trackingStatus === "paused" ? "Resume" : "Pause"}</Button></form></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard title="Posts" value={member.postCount} /><StatCard title="Volume score" value={member.volumeScore} /><StatCard title="Average quality" value={member.averageQualityScore ?? "N/A"} /><StatCard title="Final score" value={member.finalScore ?? "N/A"} /></div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2"><SignalCard title="Top strengths" items={member.topStrengths} /><SignalCard title="Improvement focus" items={member.improvementFocus} /></div>
    <Card className="mt-6"><CardHeader><CardTitle>Recent original posts</CardTitle></CardHeader><CardContent className="space-y-4">{posts.map((post) => <article key={post.id} className="border-b border-border pb-4 last:border-0 last:pb-0"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{format(new Date(post.postedAt), "MMM d, yyyy")}</span><div className="flex gap-2"><Badge>{post.archetype.replaceAll("_", " ")}</Badge><Badge>{post.score ?? "Unscored"}</Badge></div></div><p className="mt-2 text-sm leading-6">{post.text}</p>{post.summary ? <p className="mt-2 text-sm text-muted-foreground">{post.summary}</p> : null}</article>)}{posts.length === 0 ? <p className="text-sm text-muted-foreground">No original posts have been collected in this analysis window.</p> : null}</CardContent></Card>
  </AppShell>;
}

function SignalCard({ title, items }: { title: string; items: string[] }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-muted-foreground">{items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>No scored signals yet.</li>}</ul></CardContent></Card>; }
