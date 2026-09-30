import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { formatISTDate } from "@/lib/utils/dates";
import type { getLinkedInDashboardData } from "@/modules/linkedin-assessor";

type AssessedPost = Awaited<ReturnType<typeof getLinkedInDashboardData>>["posts"][number];

function scoreLabel(post: AssessedPost) {
  if (post.score != null) return post.score;
  return post.override?.exclude_from_quality_average ? "Excluded" : "Unscored";
}

export function LinkedInPostAssessmentList({ posts }: { posts: AssessedPost[] }) {
  if (posts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No posts in this period yet.</p>;
  }

  return (
    <div className="divide-y divide-border">
      {posts.map((post) => (
        <details key={post.id} className="group py-3">
          <summary className="flex cursor-pointer list-none items-center gap-4 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <Link
                  href={`/tools/linkedin-assessor/admin/members/${post.memberId}`}
                  className="font-medium hover:underline"
                >
                  {post.member}
                </Link>
                <span className="text-xs capitalize text-muted-foreground">
                  {formatISTDate(post.postedAt)} · {post.archetype.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{post.text}</p>
            </div>
            <span className="text-xl font-semibold tabular-nums">{scoreLabel(post)}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>

          <div className="mt-4 space-y-4">
            <p className="whitespace-pre-line text-sm leading-6">{post.text}</p>
            <div className="grid gap-4 md:grid-cols-3">
              <CoachingList title="Strengths" items={post.strengths} />
              <CoachingList title="Weaknesses" items={post.weaknesses} />
              <CoachingList title="Next improvements" items={post.suggestions} />
            </div>
            {post.url ? (
              <a
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm text-muted-foreground hover:underline"
              >
                Open post on LinkedIn
              </a>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

function CoachingList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>No signal available.</li>}
      </ul>
    </section>
  );
}
