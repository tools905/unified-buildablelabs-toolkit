"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Mail, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { formatISTShortDate } from "@/lib/utils/dates";
import { createDraftAction } from "@/app/tools/newsletter/actions";
import { DeletePostDialog } from "@/components/newsletter/delete-post-dialog";
import type {
  NewsletterAuthor,
  NewsletterPost,
  NewsletterPostStatus,
  NewsletterSendStatus,
} from "@/components/newsletter/types";

const SEND_LABELS: Record<NewsletterSendStatus, string> = {
  scheduled: "Email scheduled",
  sending: "Emailing",
  sent: "Emailed",
  failed: "Email failed",
};

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
  canEmail,
  sendStatusByPostId,
}: {
  initialPosts: NewsletterPost[];
  authorsById: Record<string, NewsletterAuthor>;
  currentUserId: string;
  // Workspace admins can email a published post to subscribers.
  canEmail: boolean;
  sendStatusByPostId: Record<string, NewsletterSendStatus>;
}) {
  const [activeTab, setActiveTab] = useState<NewsletterPostStatus>("published");
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [deletingPost, setDeletingPost] = useState<NewsletterPost | null>(null);

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
            <div key={post.id} className="flex items-center transition-colors hover:bg-muted">
              <Link
                href={`/tools/newsletter/write/${post.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-4"
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
              {post.status === "published" && sendStatusByPostId[post.id] ? (
                <Link
                  href="/tools/newsletter/sends"
                  className={cn(
                    "mr-1 shrink-0 border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground",
                    sendStatusByPostId[post.id] === "failed" && "border-destructive/40 text-destructive",
                  )}
                >
                  {SEND_LABELS[sendStatusByPostId[post.id]]}
                </Link>
              ) : post.status === "published" && canEmail ? (
                <Link
                  href={`/tools/newsletter/send/${post.id}`}
                  aria-label={`Email ${post.title || "this post"} to subscribers`}
                  title="Email to subscribers"
                  className="grid h-9 w-9 shrink-0 place-items-center text-quiet transition-colors hover:bg-muted hover:text-foreground focus-visible:text-foreground"
                >
                  <Mail className="h-4 w-4" />
                </Link>
              ) : null}
              {post.created_by === currentUserId ? (
                <button
                  type="button"
                  onClick={() => setDeletingPost(post)}
                  aria-label={`Delete ${post.title || "untitled draft"}`}
                  title="Delete"
                  className="mr-2 grid h-9 w-9 shrink-0 place-items-center text-quiet transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <span className="mr-2 w-9 shrink-0" aria-hidden />
              )}
            </div>
          ))}
        </div>
      )}

      {deletingPost ? (
        <DeletePostDialog
          postId={deletingPost.id}
          headline={deletingPost.title}
          published={deletingPost.status === "published"}
          onCancel={() => setDeletingPost(null)}
        />
      ) : null}
    </div>
  );
}
