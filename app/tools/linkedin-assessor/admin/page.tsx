import Link from "next/link";
import { ChevronDown, Plus, Sparkles } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { LinkedInPostAssessmentList } from "@/components/linkedin-assessor/post-assessment-list";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/dashboard/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLinkedInDashboardData } from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";
import { scoreLinkedInAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LinkedInAdminPage() {
  const { supabase, workspace } = await requireLinkedInAdmin("/tools/linkedin-assessor/admin");
  const data = await getLinkedInDashboardData(supabase, workspace.id);

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">LinkedIn Admin</h1>
          <p className="text-muted-foreground">Manage profiles, review manual submissions, and generate coaching scores.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={scoreLinkedInAction}>
            <SubmitButton variant="outline"><Sparkles className="h-4 w-4" />Score posts</SubmitButton>
          </form>
          <Button asChild><Link href="/tools/linkedin-assessor/admin/members/new"><Plus className="h-4 w-4" />Add profile</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard title="Members" value={data.stats.length} />
        <StatCard title="Posts" value={data.summary.totalPosts} description={data.window.name} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Post assessments</CardTitle>
          <CardDescription>Newest first. Open a post for the full AI feedback.</CardDescription>
        </CardHeader>
        <CardContent><LinkedInPostAssessmentList posts={data.posts} /></CardContent>
      </Card>

      <details className="group mt-6 border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span>Manage members ({data.stats.length})</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="divide-y divide-border border-t border-border">
          {data.stats.map((member) => (
            <Link
              key={member.trackedMemberId}
              href={`/tools/linkedin-assessor/admin/members/${member.trackedMemberId}`}
              className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted"
            >
              <span className="font-medium">{member.name}</span>
            </Link>
          ))}
          {data.stats.length === 0 ? <p className="px-5 py-6 text-center text-sm text-muted-foreground">No LinkedIn profiles are being tracked yet.</p> : null}
        </div>
      </details>
    </>
  );
}
