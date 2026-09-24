"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import * as newsletterService from "@/lib/services/newsletter-service";

async function requireNewsletterContext() {
  await requireEnabledTool("newsletter");
  const { supabase, user } = await requireUser("/tools/newsletter");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  return { supabase, user, workspace };
}

function refreshNewsletter(postId?: string) {
  revalidatePath("/tools/newsletter");
  if (postId) revalidatePath(`/tools/newsletter/write/${postId}`);
}

export async function createDraftAction() {
  const { supabase, user, workspace } = await requireNewsletterContext();
  const post = await newsletterService.createDraft(supabase, workspace.id, user.id);
  refreshNewsletter();
  redirect(`/tools/newsletter/write/${post.id}`);
}

export async function updatePostAction(
  postId: string,
  input: { title: string; deck: string; tag: string; body: string; authorIds: string[] },
) {
  const { supabase } = await requireNewsletterContext();
  const post = await newsletterService.updatePost(supabase, postId, input);
  refreshNewsletter(postId);
  return post;
}

export async function publishPostAction(formData: FormData) {
  const { supabase, workspace, user } = await requireNewsletterContext();
  const postId = String(formData.get("postId"));
  await newsletterService.publishPost(supabase, postId, workspace.id, user.id);
  refreshNewsletter(postId);
  redirect("/tools/newsletter");
}

export async function deletePostAction(formData: FormData) {
  const { supabase, workspace, user } = await requireNewsletterContext();
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  if (!admin) throw new Error("Only admins can delete posts.");
  const postId = String(formData.get("postId"));
  await newsletterService.deletePost(supabase, postId);
  refreshNewsletter();
  redirect("/tools/newsletter");
}
