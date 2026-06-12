import { format } from "date-fns";
import { AppShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLinkedInDashboardData } from "@/modules/linkedin-assessor";
import { requireLinkedInAdmin } from "@/modules/linkedin-assessor/context";

export default async function LinkedInPostsPage() {
  const { supabase, workspace } = await requireLinkedInAdmin();
  const data = await getLinkedInDashboardData(supabase, workspace.id);
  return <AppShell><div className="mb-6"><h1 className="text-3xl font-semibold">Post Intelligence</h1><p className="text-muted-foreground">Scored original posts, archetypes, strengths, and coaching suggestions.</p></div><div className="space-y-4">{data.posts.map((post) => <Card key={post.id}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{post.member}</CardTitle><p className="text-sm text-muted-foreground">{format(new Date(post.postedAt), "MMM d, yyyy")}</p></div><div className="flex gap-2"><Badge>{post.archetype.replaceAll("_", " ")}</Badge><Badge>{post.score ?? "Unscored"}</Badge></div></div></CardHeader><CardContent><p className="max-w-4xl text-sm leading-6">{post.text}</p>{post.summary ? <p className="mt-3 text-sm text-muted-foreground">{post.summary}</p> : null}<div className="mt-4 grid gap-4 md:grid-cols-3"><List title="Strengths" items={post.strengths} /><List title="Weaknesses" items={post.weaknesses} /><List title="Suggestions" items={post.suggestions} /></div></CardContent></Card>)}{data.posts.length === 0 ? <Card><CardHeader><CardTitle>No posts collected</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Run Sync Posts from the LinkedIn Admin page.</CardContent></Card> : null}</div></AppShell>;
}
function List({ title, items }: { title: string; items: string[] }) { return <section><h3 className="mb-2 text-sm font-medium">{title}</h3><ul className="space-y-1 text-sm text-muted-foreground">{items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>Not scored yet.</li>}</ul></section>; }
