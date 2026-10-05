import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { NewPostButton } from "@/components/newsletter/new-post-button";
import { NewsletterPostsList } from "@/components/newsletter/posts-list";
import type { NewsletterSendStatus } from "@/components/newsletter/types";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/require-user";
import * as newsletterService from "@/lib/services/newsletter-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function NewsletterPage() {
  await requireEnabledTool("newsletter");
  const { supabase, user } = await requireUser("/tools/newsletter");
  const workspace = await requireDefaultWorkspace(supabase, user.id);

  const [posts, admin, sends] = await Promise.all([
    newsletterService.listPosts(supabase, workspace.id),
    isWorkspaceAdmin(workspace.id, user.id, supabase),
    supabase.from("newsletter_sends").select("post_id, status").eq("workspace_id", workspace.id).neq("status", "cancelled"),
  ]);
  if (sends.error) throw sends.error;

  const authorIds = Array.from(new Set(posts.flatMap((post) => post.author_ids ?? [])));
  const authors = await newsletterService.getAuthorsForPosts(supabase, authorIds);
  const authorsById = Object.fromEntries(authors.map((author) => [author.id, author]));
  const sendStatusByPostId: Record<string, NewsletterSendStatus> = Object.fromEntries(
    (sends.data ?? [])
      .filter((send: { post_id: string | null }) => send.post_id)
      .map((send: { post_id: string; status: NewsletterSendStatus }) => [send.post_id, send.status]),
  );

  return (
    <>
      <PageHeader
        eyebrow="The Buildable Labs Times — Newsroom"
        title="Posts"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/tools/newsletter/sends">Sends</Link>
            </Button>
            <NewPostButton />
          </>
        }
      />
      <NewsletterPostsList
        initialPosts={posts}
        authorsById={authorsById}
        currentUserId={user.id}
        canEmail={admin}
        sendStatusByPostId={sendStatusByPostId}
      />
    </>
  );
}
