import { format } from "date-fns";
import { AppShell } from "@/components/dashboard/app-shell";
import { ManualPostForm } from "@/components/linkedin-assessor/manual-post-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLinkedInDashboardData, linkedinArchetypes } from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";
import { overrideLinkedInScoreAction } from "../../actions";

export default async function LinkedInPostsPage() {
  const { supabase, workspace } = await requireLinkedInAdmin();
  const data = await getLinkedInDashboardData(supabase, workspace.id);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Submit post</h1>
        <p className="text-muted-foreground">Scored original and collaborative posts, coaching signals, and admin corrections.</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Submit post</CardTitle>
          <CardDescription>Paste the LinkedIn post URL and writing for a tracked member.</CardDescription>
        </CardHeader>
        <CardContent><ManualPostForm members={data.members.map((member) => ({ id: member.id, name: member.name }))} /></CardContent>
      </Card>

      <div className="space-y-4">
        {data.posts.map((post) => (
          <Card key={post.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{post.member}</CardTitle>
                  <p className="text-sm text-muted-foreground">{format(new Date(post.postedAt), "MMM d, yyyy")} - {post.postKind.replaceAll("_", " ")} - manual submission</p>
                </div>
                <div className="flex gap-2"><Badge>{post.archetype.replaceAll("_", " ")}</Badge><Badge>{post.score ?? "Excluded / unscored"}</Badge></div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="max-w-4xl text-sm leading-6">{post.text}</p>
              {post.url ? <a href={post.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-muted-foreground hover:underline">Open on LinkedIn</a> : null}
              {post.collaborationContext ? <p className="mt-2 text-sm text-muted-foreground">Collaboration: {post.collaborationContext}</p> : null}
              {post.summary ? <p className="mt-3 text-sm text-muted-foreground">{post.summary}</p> : null}
              {post.scoreBreakdown ? (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {Object.entries(post.scoreBreakdown).map(([label, value]) => (
                    <div key={label} className="rounded-md border border-border p-2">
                      <div className="text-xs capitalize text-muted-foreground">{label.replace(/([A-Z])/g, " $1")}</div>
                      <div className="font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <List title="Strengths" items={post.strengths} />
                <List title="Weaknesses" items={post.weaknesses} />
                <List title="Suggestions" items={post.suggestions} />
              </div>
              <details className="mt-5 border-t border-border pt-4">
                <summary className="cursor-pointer text-sm font-medium">Override or exclude score</summary>
                <form action={overrideLinkedInScoreAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="postId" value={post.id} />
                  <div className="space-y-2"><Label htmlFor={`totalScore-${post.id}`}>Corrected total score</Label><Input id={`totalScore-${post.id}`} name="totalScore" type="number" min="0" max="100" defaultValue={post.score ?? post.originalScore ?? ""} /></div>
                  <div className="space-y-2"><Label htmlFor={`archetype-${post.id}`}>Archetype</Label><select id={`archetype-${post.id}`} name="archetype" defaultValue={post.archetype === "unscored" ? "" : post.archetype} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"><option value="">Keep AI archetype</option>{linkedinArchetypes.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></div>
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor={`notes-${post.id}`}>Admin notes</Label><Textarea id={`notes-${post.id}`} name="adminNotes" defaultValue={post.override?.admin_notes ?? ""} /></div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="excludeFromQualityAverage" defaultChecked={post.override?.exclude_from_quality_average ?? false} />Exclude from quality averages</label>
                  <div className="sm:text-right"><Button variant="outline">Save override</Button></div>
                </form>
              </details>
            </CardContent>
          </Card>
        ))}
        {data.posts.length === 0 ? <Card><CardHeader><CardTitle>No posts submitted</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Submit a post URL and writing to start scoring.</CardContent></Card> : null}
      </div>
    </AppShell>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return <section><h3 className="mb-2 text-sm font-medium">{title}</h3><ul className="space-y-1 text-sm text-muted-foreground">{items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>Not scored yet.</li>}</ul></section>;
}
