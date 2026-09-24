import { notFound } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { NewsletterEditor } from "@/components/newsletter/newsletter-editor";
import { requireUser } from "@/lib/auth/require-user";
import { getWorkspaceMembers, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import * as newsletterService from "@/lib/services/newsletter-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function NewsletterWritePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireEnabledTool("newsletter");
  const { supabase, user } = await requireUser("/tools/newsletter");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const { id } = await params;

  let post;
  try {
    post = await newsletterService.getPost(supabase, id);
  } catch {
    notFound();
  }
  if (!post || post.workspace_id !== workspace.id) notFound();

  const [members, admin] = await Promise.all([
    getWorkspaceMembers(supabase, workspace.id),
    isWorkspaceAdmin(workspace.id, user.id, supabase),
  ]);

  const memberOptions = members.map(
    (member: {
      user_id: string;
      profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[];
    }) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      return { id: member.user_id, label: profile?.full_name || profile?.email || "Unknown" };
    },
  );

  return (
    <AppShell>
      <NewsletterEditor post={post} members={memberOptions} canDelete={admin} />
    </AppShell>
  );
}
