import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { LinkedInMemberTable } from "@/components/linkedin-assessor/member-table";
import { LinkedInScoreOverview } from "@/components/linkedin-assessor/score-overview";
import { ManualPostForm } from "@/components/linkedin-assessor/manual-post-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLinkedInDashboardData, linkedinMemberRoles } from "@/modules/linkedin-assessor";
import { requireLinkedInContext } from "@/modules/linkedin-assessor/context";
import { connectOwnLinkedInProfileAction } from "./actions";

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
        <div>
          <h1 className="text-3xl font-semibold">LinkedIn Assessor</h1>
          <p className="text-muted-foreground">Manual LinkedIn post scoring, private coaching, and consistency tracking.</p>
        </div>
        {admin ? <Button asChild><Link href="/tools/linkedin-assessor/admin">Manage assessor</Link></Button> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Submitted posts" value={data.summary.totalPosts} description={data.window.name} />
        <StatCard title="Average quality" value={data.summary.averageQuality ?? "N/A"} />
        <StatCard title="Most active" value={data.summary.mostActiveMember ?? "N/A"} />
        <StatCard title="Profiles paused" value={data.stats.filter((member) => member.trackingStatus === "paused").length} />
      </div>

      <div className="mt-6"><LinkedInScoreOverview stats={data.stats} /></div>
      <Card className="mt-6">
        <CardHeader><CardTitle>{admin ? "Team performance" : "My LinkedIn insights"}</CardTitle><CardDescription>Volume and quality are combined using each tracked profile&apos;s configured weights.</CardDescription></CardHeader>
        <CardContent><LinkedInMemberTable stats={data.stats} linkMembers={admin} /></CardContent>
      </Card>

      {!admin && data.posts.length > 0 ? (
        <div className="mt-6 space-y-4">
          <h2 className="text-xl font-semibold">My post coaching</h2>
          {data.posts.map((post) => (
            <Card key={post.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><CardTitle className="text-base">{new Date(post.postedAt).toLocaleDateString()}</CardTitle><CardDescription>{post.postKind.replaceAll("_", " ")} - {post.archetype.replaceAll("_", " ")}</CardDescription></div>
                  <span className="text-2xl font-semibold">{post.score ?? "N/A"}</span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6">{post.text}</p>
                {post.summary ? <p className="mt-3 text-sm text-muted-foreground">{post.summary}</p> : null}
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <CoachingList title="Strengths" items={post.strengths} />
                  <CoachingList title="Weaknesses" items={post.weaknesses} />
                  <CoachingList title="Next improvements" items={post.suggestions} />
                </div>
                {post.url ? <a href={post.url} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-muted-foreground hover:underline">Open post on LinkedIn</a> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!admin && data.stats.length === 0 ? (
        <Card className="mt-6">
          <CardHeader><CardTitle>Connect my profile</CardTitle><CardDescription>Create your tracked profile. LinkedIn Assessor is manual-only: you will submit post URLs and writing for scoring.</CardDescription></CardHeader>
          <CardContent>
            <form action={connectOwnLinkedInProfileAction} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="name">Display name</Label><Input id="name" name="name" required /></div>
              <div className="space-y-2"><Label htmlFor="memberRole">Role</Label><select id="memberRole" name="memberRole" defaultValue="other" className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm">{linkedinMemberRoles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="linkedinProfileUrl">LinkedIn profile URL</Label><Input id="linkedinProfileUrl" name="linkedinProfileUrl" placeholder="linkedin.com/in/profile" required /></div>
              <div className="sm:col-span-2"><Button>Connect profile</Button></div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {!admin && data.stats.length > 0 && data.settings?.member_submissions_enabled !== false ? (
        <Card className="mt-6">
          <CardHeader><CardTitle>Submit post</CardTitle><CardDescription>Paste the LinkedIn post URL and the full post writing. You will receive a private coaching summary by email after scoring.</CardDescription></CardHeader>
          <CardContent><ManualPostForm members={data.members.map((member) => ({ id: member.id, name: member.name }))} memberId={data.members[0]?.id} /></CardContent>
        </Card>
      ) : null}
    </AppShell>
  );
}

function CoachingList({ title, items }: { title: string; items: string[] }) {
  return <section><h3 className="mb-2 text-sm font-medium">{title}</h3><ul className="space-y-1 text-sm text-muted-foreground">{items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>No signal available.</li>}</ul></section>;
}
