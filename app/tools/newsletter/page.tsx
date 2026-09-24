import { AppShell } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { NewPostButton } from "@/components/newsletter/new-post-button";
import { NewsletterPostsList } from "@/components/newsletter/posts-list";
import { requireUser } from "@/lib/auth/require-user";
import * as newsletterService from "@/lib/services/newsletter-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function NewsletterPage() {
  await requireEnabledTool("newsletter");
  const { supabase, user } = await requireUser("/tools/newsletter");
  const workspace = await requireDefaultWorkspace(supabase, user.id);

  const posts = await newsletterService.listPosts(supabase, workspace.id);

  const authorIds = Array.from(new Set(posts.flatMap((post) => post.author_ids ?? [])));
  const authors = await newsletterService.getAuthorsForPosts(supabase, authorIds);
  const authorsById = Object.fromEntries(authors.map((author) => [author.id, author]));

  return (
    <AppShell>
      <PageHeader
        eyebrow="The Buildable Labs Times — Newsroom"
        title="Posts"
        actions={<NewPostButton />}
      />
      <NewsletterPostsList initialPosts={posts} authorsById={authorsById} currentUserId={user.id} />
    </AppShell>
  );
}
