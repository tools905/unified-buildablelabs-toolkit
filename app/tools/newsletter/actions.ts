"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import * as newsletterService from "@/lib/services/newsletter-service";
import { sendNewsletterTestEmail } from "@/lib/services/newsletter-email-service";
import {
  cancelIssueSend,
  getIssuePost,
  issueContentForPost,
  NewsletterSendError,
  processIssueSends,
  scheduleIssueSend,
} from "@/lib/services/newsletter-send-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { issueEmail } from "@/lib/utils/newsletter-email-templates";

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
  input: {
    title: string;
    deck: string;
    tag: string;
    body: string;
    tags: string[];
    originalUrl?: string;
    authorIds: string[];
    coverImageUrl: string | null;
    coverBrightness: number | null;
    coverFocusX: number;
    coverFocusY: number;
    coverZoom: number;
    coverTone: number | null;
  },
) {
  const { supabase, user } = await requireNewsletterContext();
  const post = await newsletterService.updatePost(supabase, postId, input, user.id);
  refreshNewsletter(postId);
  return post;
}

export async function removeStaleImagesAction(postId: string, urls: string[]) {
  const { supabase } = await requireNewsletterContext();
  await newsletterService.removeStaleImages(supabase, postId, urls);
}

export async function listVersionsAction(postId: string) {
  const { supabase } = await requireNewsletterContext();
  return newsletterService.listVersions(supabase, postId);
}

export async function publishPostAction(formData: FormData) {
  const { supabase, workspace, user } = await requireNewsletterContext();
  const postId = String(formData.get("postId"));
  await newsletterService.publishPost(supabase, postId, workspace.id, user.id);
  refreshNewsletter(postId);
  redirect("/tools/newsletter");
}

export async function deletePostAction(formData: FormData) {
  const { supabase, user } = await requireNewsletterContext();
  const postId = String(formData.get("postId"));
  // Drafts and published posts alike, but only by the person who created the post.
  const post = await newsletterService.getPost(supabase, postId);
  if (post.created_by !== user.id) throw new Error("Only the person who created this post can delete it.");
  await newsletterService.deletePost(supabase, postId);
  refreshNewsletter();
  redirect("/tools/newsletter");
}

// --- Emailing an issue to subscribers ------------------------------------------------------

// Sending reaches every subscriber, so it is limited to workspace admins.
async function requireNewsletterAdmin() {
  const context = await requireNewsletterContext();
  if (!(await isWorkspaceAdmin(context.workspace.id, context.user.id, context.supabase))) {
    throw new Error("Only workspace admins can email subscribers.");
  }
  return context;
}

type IssueSendInput = { subject: string; previewText: string };

export async function sendTestIssueAction(postId: string, input: IssueSendInput) {
  const { user, workspace } = await requireNewsletterAdmin();
  const admin = createAdminClient();
  const post = await getIssuePost(admin, postId);
  if (!post || post.workspace_id !== workspace.id || post.status !== "published") {
    return { ok: false, message: "Publish this post before emailing it." };
  }
  if (!user.email) return { ok: false, message: "Your account has no email address to send the test to." };

  const content = await issueContentForPost(admin, post, {
    subject: `[Test] ${input.subject.trim() || post.title}`,
    previewText: input.previewText.trim() || null,
  });
  const result = await sendNewsletterTestEmail(user.email, issueEmail(content, null));
  if (!result.ok) return { ok: false, message: result.error ?? "The test email could not be sent." };
  return {
    ok: true,
    message: result.printed
      ? "Test printed to the server log (no newsletter sender is set up here)."
      : `Test sent to ${user.email}.`,
  };
}

// Schedules the issue, or with no time starts sending it straight away; batches that don't
// fit in this request are sent by the cron within five minutes.
export async function scheduleIssueSendAction(postId: string, input: IssueSendInput & { scheduledAt: string | null }) {
  const { workspace, user } = await requireNewsletterAdmin();
  const admin = createAdminClient();
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return { error: "Pick a valid date and time." };

  try {
    await scheduleIssueSend(admin, {
      workspaceId: workspace.id,
      postId,
      subject: input.subject,
      previewText: input.previewText,
      scheduledAt,
      actorId: user.id,
    });
    if (!scheduledAt) await processIssueSends(admin);
  } catch (error) {
    if (error instanceof NewsletterSendError) return { error: error.message };
    throw error;
  }

  revalidatePath("/tools/newsletter");
  revalidatePath("/tools/newsletter/sends");
  redirect("/tools/newsletter/sends");
}

export async function cancelIssueSendAction(formData: FormData) {
  const { workspace, user } = await requireNewsletterAdmin();
  const sendId = String(formData.get("sendId"));
  try {
    await cancelIssueSend(createAdminClient(), sendId, workspace.id, user.id);
  } catch (error) {
    if (!(error instanceof NewsletterSendError)) throw error;
  }
  revalidatePath("/tools/newsletter");
  revalidatePath("/tools/newsletter/sends");
}
