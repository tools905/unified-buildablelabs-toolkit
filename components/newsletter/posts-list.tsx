"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { formatISTShortDate } from "@/lib/utils/dates";
import { createDraftAction } from "@/app/tools/newsletter/actions";
import type { NewsletterAuthor, NewsletterPost, NewsletterPostStatus } from "@/components/newsletter/types";

const TABS: { status: NewsletterPostStatus; label: string }[] = [
  { status: "published", label: "Published" },
  { status: "scheduled", label: "Scheduled" },
  { status: "draft", label: "Drafts" },
];

function authorNames(post: NewsletterPost, authorsById: Record<string, NewsletterAuthor>) {
  return post.author_ids
    .map((id) => authorsById[id]?.full_name || authorsById[id]?.email)
    .filter(Boolean)
    .join(", ");
}

export function NewsletterPostsList({
  initialPosts,
  authorsById,
  currentUserId,
}: {
  initialPosts: NewsletterPost[];
  authorsById: Record<string, NewsletterAuthor>;
  currentUserId: string;
}) {
  const [activeTab, setActiveTab] = useState<NewsletterPostStatus>("published");
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  const counts = useMemo(() => {
    return {
      published: initialPosts.filter((post) => post.status === "published").length,
      scheduled: initialPosts.filter((post) => post.status === "scheduled").length,
      draft: initialPosts.filter((post) => post.status === "draft").length,
    };
  }, [initialPosts]);

  const filtered = useMemo(() => {
    return initialPosts.filter((post) => {
      if (post.status !== activeTab) return false;
      if (onlyMine && post.created_by !== currentUserId) return false;
      if (search) {
        const query = search.toLowerCase();
        const matches =
          (post.title || "").toLowerCase().includes(query) ||
          (post.deck || "").toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [initialPosts, activeTab, onlyMine, search, currentUserId]);

  return (
    <div>
      <div className="mb-6 h-px bg-muted" />

      <div className="mb-5 flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            type="button"
            onClick={() => setActiveTab(tab.status)}
            className={cn(
              "flex items-center border border-transparent px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors",
              activeTab === tab.status && "border-border bg-card text-foreground",
            )}
          >
            {tab.label}
            {tab.status === "draft" && counts.draft > 0 ? (
              <span className="ml-1.5 border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {counts.draft}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mb-6 flex gap-3">
        <div className="relative flex-grow">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-quiet" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your issues…"
            className="h-11 pl-10"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOnlyMine((value) => !value)}
          className={cn(onlyMine && "border-primary/40 text-foreground")}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {onlyMine ? "Only mine" : "Filter"}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 border border-muted py-24 text-center">
          <FileText className="h-8 w-8 text-quiet" strokeWidth={1.3} />
          <div>
            <div className="mb-1.5 text-base font-semibold text-foreground">
              {activeTab === "published" ? "No posts yet" : `No ${activeTab} posts`}
            </div>
            <p className="text-sm text-muted-foreground">Start your blog — write your first idea down.</p>
          </div>
          <form action={createDraftAction}>
            <Button type="submit" variant="outline">
              Start Writing
            </Button>
          </form>
        </div>
      ) : (
        <div className="divide-y divide-muted border-y border-muted">
          {filtered.map((post) => (
            <Link
              key={post.id}
              href={`/tools/newsletter/write/${post.id}`}
              className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{post.title || "Untitled draft"}</p>
                {post.deck ? (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{post.deck}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 font-mono text-[11px] text-quiet">
                {authorNames(post, authorsById) ? <span>{authorNames(post, authorsById)}</span> : null}
                <span>
                  {post.status === "published" && post.published_at
                    ? formatISTShortDate(post.published_at)
                    : `Updated ${formatISTShortDate(post.updated_at)}`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
