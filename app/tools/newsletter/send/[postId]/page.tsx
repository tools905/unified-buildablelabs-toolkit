import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { IssueSendForm } from "@/components/newsletter/issue-send-form";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  countActiveSubscribers,
  getIssuePost,
  getSendForPost,
  issueContentForPost,
  listSends,
} from "@/lib/services/newsletter-send-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { formatISTDateTime, formatISTShortDate } from "@/lib/utils/dates";
import { issueEmail } from "@/lib/utils/newsletter-email-templates";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function Notice({ children }: { children: ReactNode }) {
  return <div className="border border-border bg-card px-6 py-5 text-sm text-muted-foreground">{children}</div>;
}

export default async function SendIssuePage({ params }: { params: Promise<{ postId: string }> }) {
  await requireEnabledTool("newsletter");
  const { postId } = await params;
  const { supabase, user } = await requireUser(`/tools/newsletter/send/${postId}`);
  const workspace = await requireDefaultWorkspace(supabase, user.id);

  const header = (
    <PageHeader
      eyebrow="The Buildable Labs Times — Newsroom"
      title="Email to subscribers"
      actions={
        <Button asChild variant="outline">
          <Link href="/tools/newsletter/sends">All sends</Link>
        </Button>
      }
    />
  );

  if (!(await isWorkspaceAdmin(workspace.id, user.id, supabase))) {
    return (
      <>
        {header}
        <Notice>Only workspace admins can email subscribers.</Notice>
      </>
    );
  }

  const admin = createAdminClient();
  const post = await getIssuePost(admin, postId);
  if (!post || post.workspace_id !== workspace.id) notFound();

  if (post.status !== "published" || !post.slug) {
    return (
      <>
        {header}
        <Notice>Publish this post before emailing it to subscribers.</Notice>
      </>
    );
  }

  const existing = await getSendForPost(admin, post.id);
  if (existing) {
    const when =
      existing.status === "scheduled"
        ? `is scheduled to go out ${formatISTDateTime(existing.scheduled_at)}`
        : existing.status === "sending"
          ? "is being sent right now"
          : `was emailed ${formatISTDateTime(existing.completed_at ?? existing.started_at ?? existing.scheduled_at)}`;
    return (
      <>
        {header}
        <Notice>
          <span className="font-semibold text-foreground">{post.title}</span> {when}. Each post is emailed once.{" "}
          <Link href="/tools/newsletter/sends" className="text-foreground underline underline-offset-2">
            See it under All sends
          </Link>
          .
        </Notice>
      </>
    );
  }

  const [recipients, sends, content] = await Promise.all([
    countActiveSubscribers(admin, workspace.id),
    listSends(admin, workspace.id),
    issueContentForPost(admin, post, { subject: post.title, previewText: post.deck }),
  ]);

  // The plan is two issues a week; this only warns, it never blocks.
  const sent = sends.map(({ send }) => send).filter((send) => send.status === "sent" && send.completed_at);
  const lastSent = sent[0];
  const sentThisWeek = sent.filter((send) => new Date(send.completed_at!).getTime() > new Date().getTime() - WEEK_MS).length;
  const cadenceNote = lastSent
    ? `The last issue went out ${formatISTShortDate(lastSent.completed_at!)}.`
    : "This will be the first issue emailed to subscribers.";
  const cadenceWarning =
    sentThisWeek >= 2 ? `${sentThisWeek} issues have already gone out in the last 7 days; the plan is two a week.` : null;

  return (
    <>
      {header}
      <IssueSendForm
        postId={post.id}
        title={post.title}
        defaultSubject={post.title}
        defaultPreviewText={post.deck ?? ""}
        recipients={recipients}
        previewHtml={issueEmail(content, null).html}
        cadenceNote={cadenceNote}
        cadenceWarning={cadenceWarning}
      />
    </>
  );
}
