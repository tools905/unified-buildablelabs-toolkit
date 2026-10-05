import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/services/audit-service";
import { sendNewsletterBatch, type QueuedNewsletterEmail } from "@/lib/services/newsletter-email-service";
import { getAuthorsForPosts } from "@/lib/services/newsletter-service";
import { issueEmail, type IssueEmailContent } from "@/lib/utils/newsletter-email-templates";
import { issueExcerpt, issueUrl } from "@/lib/utils/newsletter-issue";
import { deliveryChangesForEvent, isTrackedEvent } from "@/lib/utils/newsletter-tracking";

// Emailing a published Times post to confirmed subscribers. Everything here runs with the
// service-role client: the admin check happens in the server actions before anything is
// scheduled, and the cron does the sending.

const BATCH_SIZE = 100;
// How long one run holds a send while it sends batches; a crashed run lets go after this.
const LOCK_MS = 60_000;
const MAX_SUBJECT_LENGTH = 200;
const KEEP_EVENTS_MS = 180 * 24 * 60 * 60_000;

export class NewsletterSendError extends Error {}

export type NewsletterSend = {
  id: string;
  workspace_id: string;
  post_id: string | null;
  post_title: string;
  post_slug: string;
  subject: string;
  preview_text: string | null;
  status: "scheduled" | "sending" | "sent" | "cancelled" | "failed";
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  recipient_count: number;
  created_by: string;
  created_at: string;
};

export type NewsletterSendStats = {
  send_id: string;
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  skipped: number;
  queued: number;
  unsubscribed: number;
};

type IssuePost = {
  id: string;
  workspace_id: string;
  title: string;
  deck: string | null;
  tag: string | null;
  body: string;
  slug: string | null;
  status: string;
  cover_image_url: string | null;
  author_ids: string[] | null;
};

const ISSUE_POST_SELECT = "id, workspace_id, title, deck, tag, body, slug, status, cover_image_url, author_ids";

export async function countActiveSubscribers(supabase: SupabaseClient<any>, workspaceId: string) {
  const { count, error } = await supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  if (error) throw error;
  return count ?? 0;
}

// The issue's content, shared by every subscriber's copy of the email.
export async function issueContentForPost(
  supabase: SupabaseClient<any>,
  post: IssuePost,
  options: { subject: string; previewText: string | null },
): Promise<IssueEmailContent> {
  const authors = await getAuthorsForPosts(supabase, post.author_ids ?? []);
  return {
    subject: options.subject,
    previewText: options.previewText,
    title: post.title,
    deck: post.deck,
    tag: post.tag,
    coverImageUrl: post.cover_image_url,
    excerpt: issueExcerpt(post.body ?? ""),
    authors: authors.map((author: { full_name: string | null; email: string }) => author.full_name || author.email),
    url: issueUrl(post.slug ?? ""),
  };
}

export async function getIssuePost(supabase: SupabaseClient<any>, postId: string) {
  const { data, error } = await supabase.from("newsletter_posts").select(ISSUE_POST_SELECT).eq("id", postId).maybeSingle();
  if (error) throw error;
  return data as IssuePost | null;
}

// The send for a post that is scheduled, under way or done (a cancelled one does not count).
export async function getSendForPost(supabase: SupabaseClient<any>, postId: string) {
  const { data, error } = await supabase
    .from("newsletter_sends")
    .select("*")
    .eq("post_id", postId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (error) throw error;
  return data as NewsletterSend | null;
}

export async function listSends(supabase: SupabaseClient<any>, workspaceId: string) {
  const { data: sends, error } = await supabase
    .from("newsletter_sends")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("scheduled_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!sends?.length) return [];

  const { data: stats, error: statsError } = await supabase
    .from("newsletter_send_stats")
    .select("*")
    .in("send_id", sends.map((send) => send.id));
  if (statsError) throw statsError;
  const statsBySend = new Map((stats ?? []).map((row: NewsletterSendStats) => [row.send_id, row]));
  return (sends as NewsletterSend[]).map((send) => ({ send, stats: statsBySend.get(send.id) ?? null }));
}

export async function scheduleIssueSend(
  supabase: SupabaseClient<any>,
  input: {
    workspaceId: string;
    postId: string;
    subject: string;
    previewText: string;
    // Null sends as soon as possible.
    scheduledAt: Date | null;
    actorId: string;
  },
) {
  const post = await getIssuePost(supabase, input.postId);
  if (!post || post.workspace_id !== input.workspaceId) throw new NewsletterSendError("This post no longer exists.");
  if (post.status !== "published" || !post.slug) throw new NewsletterSendError("Publish this post before emailing it.");

  const subject = input.subject.trim() || post.title;
  if (subject.length > MAX_SUBJECT_LENGTH) throw new NewsletterSendError(`Keep the subject under ${MAX_SUBJECT_LENGTH} characters.`);
  const now = new Date();
  const scheduledAt = input.scheduledAt && input.scheduledAt > now ? input.scheduledAt : now;

  const { data, error } = await supabase
    .from("newsletter_sends")
    .insert({
      workspace_id: input.workspaceId,
      post_id: post.id,
      post_title: post.title,
      post_slug: post.slug,
      subject,
      preview_text: input.previewText.trim() || null,
      scheduled_at: scheduledAt.toISOString(),
      created_by: input.actorId,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new NewsletterSendError("This post has already been emailed, or is scheduled to be.");
    throw error;
  }

  await writeAuditLog(supabase, {
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "newsletter_send.scheduled",
    entityType: "newsletter_send",
    entityId: data.id,
  });
  return data as NewsletterSend;
}

export async function cancelIssueSend(supabase: SupabaseClient<any>, sendId: string, workspaceId: string, actorId: string) {
  const { data, error } = await supabase
    .from("newsletter_sends")
    .update({ status: "cancelled" })
    .eq("id", sendId)
    .eq("workspace_id", workspaceId)
    .eq("status", "scheduled")
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new NewsletterSendError("Only a send that hasn't started can be cancelled.");

  await writeAuditLog(supabase, {
    workspaceId,
    actorId,
    action: "newsletter_send.cancelled",
    entityType: "newsletter_send",
    entityId: sendId,
  });
}

async function claimSend(supabase: SupabaseClient<any>, sendId: string) {
  const now = new Date();
  const { data, error } = await supabase
    .from("newsletter_sends")
    .update({ locked_until: new Date(now.getTime() + LOCK_MS).toISOString() })
    .eq("id", sendId)
    .eq("status", "sending")
    .lt("locked_until", now.toISOString())
    .select("id");
  if (error) throw error;
  return Boolean(data?.length);
}

async function releaseSend(supabase: SupabaseClient<any>, sendId: string) {
  await supabase.from("newsletter_sends").update({ locked_until: new Date().toISOString() }).eq("id", sendId);
}

async function nextQueuedBatch(supabase: SupabaseClient<any>, sendId: string) {
  const { data, error } = await supabase
    .from("newsletter_deliveries")
    .select("id, workspace_id, subscriber_id, newsletter_subscribers(email, status)")
    .eq("send_id", sendId)
    .eq("status", "queued")
    .order("id")
    .limit(BATCH_SIZE);
  if (error) throw error;
  return (data ?? []) as unknown as {
    id: string;
    workspace_id: string;
    subscriber_id: string;
    newsletter_subscribers: { email: string; status: string } | null;
  }[];
}

async function finishSend(supabase: SupabaseClient<any>, send: NewsletterSend) {
  const { count: failed, error } = await supabase
    .from("newsletter_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("send_id", send.id)
    .eq("status", "failed");
  if (error) throw error;

  // Only when every email failed (say, the sender was misconfigured) is the whole send a failure.
  const status = send.recipient_count > 0 && failed === send.recipient_count ? "failed" : "sent";
  await supabase.from("newsletter_sends").update({ status, completed_at: new Date().toISOString() }).eq("id", send.id);
  await writeAuditLog(supabase, {
    workspaceId: send.workspace_id,
    actorId: send.created_by,
    action: status === "sent" ? "newsletter_send.sent" : "newsletter_send.failed",
    entityType: "newsletter_send",
    entityId: send.id,
  });
}

// Sends one issue's queued emails, a batch at a time, until none are left or time runs out.
async function sendQueuedEmails(supabase: SupabaseClient<any>, send: NewsletterSend, deadline: number) {
  const totals = { sent: 0, failed: 0, printed: 0, completed: false };
  const post = send.post_id ? await getIssuePost(supabase, send.post_id) : null;
  const content = post ? await issueContentForPost(supabase, post, { subject: send.subject, previewText: send.preview_text }) : null;

  while (Date.now() < deadline) {
    const batch = await nextQueuedBatch(supabase, send.id);
    if (!batch.length) {
      await finishSend(supabase, send);
      totals.completed = true;
      return totals;
    }

    if (!content) {
      // The post was deleted while its issue was still going out.
      await supabase
        .from("newsletter_deliveries")
        .update({ status: "failed", error_message: "The post was deleted before this issue finished sending." })
        .in("id", batch.map((row) => row.id));
      totals.failed += batch.length;
      continue;
    }

    // Anyone who unsubscribed (or bounced) after the send started is left out.
    const gone = batch.filter((row) => row.newsletter_subscribers?.status !== "active");
    if (gone.length) {
      await supabase
        .from("newsletter_deliveries")
        .update({ status: "skipped", error_message: "No longer subscribed when this issue went out." })
        .in("id", gone.map((row) => row.id));
    }

    const emails: QueuedNewsletterEmail[] = batch
      .filter((row) => row.newsletter_subscribers?.status === "active")
      .map((row) => ({
        deliveryId: row.id,
        workspaceId: row.workspace_id,
        subscriberId: row.subscriber_id,
        sendId: send.id,
        to: row.newsletter_subscribers!.email,
        email: issueEmail(content, row.subscriber_id),
      }));
    const result = await sendNewsletterBatch(supabase, emails);
    totals.sent += result.sent;
    totals.failed += result.failed;
    totals.printed += result.printed;
  }
  return totals;
}

// Starts sends that are due and sends their emails in batches until the time budget runs out;
// the cron picks up whatever is left on its next run (every 5 minutes).
export async function processIssueSends(supabase: SupabaseClient<any>, budgetMs = 8_000) {
  const deadline = Date.now() + budgetMs;
  const summary = { started: 0, sent: 0, failed: 0, printed: 0, completed: 0 };

  const { data: due, error: dueError } = await supabase
    .from("newsletter_sends")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .limit(10);
  if (dueError) throw dueError;
  for (const send of due ?? []) {
    const { data: recipients, error } = await supabase.rpc("newsletter_start_send", { p_send_id: send.id });
    if (error) throw error;
    if (recipients !== null) summary.started += 1;
  }

  const { data: active, error: activeError } = await supabase
    .from("newsletter_sends")
    .select("*")
    .eq("status", "sending")
    .order("started_at")
    .limit(10);
  if (activeError) throw activeError;

  for (const send of (active ?? []) as NewsletterSend[]) {
    if (Date.now() >= deadline) break;
    if (!(await claimSend(supabase, send.id))) continue;
    try {
      const totals = await sendQueuedEmails(supabase, send, deadline);
      summary.sent += totals.sent;
      summary.failed += totals.failed;
      summary.printed += totals.printed;
      if (totals.completed) summary.completed += 1;
    } finally {
      await releaseSend(supabase, send.id);
    }
  }
  return summary;
}

// Records one event from Resend's webhook. Events for emails the newsletter didn't send (the
// toolkit's own notification emails go through the same Resend account) are ignored.
export async function recordEmailEvent(
  supabase: SupabaseClient<any>,
  eventId: string,
  event: { type: string; created_at?: string; data?: { email_id?: string; click?: { link?: string }; bounce?: { type?: string } } },
): Promise<"recorded" | "duplicate" | "ignored"> {
  const type = event.type;
  if (!isTrackedEvent(type)) return "ignored";
  const emailId = event.data?.email_id;
  if (!emailId) return "ignored";

  const { data: delivery, error } = await supabase
    .from("newsletter_deliveries")
    .select("id, workspace_id, subscriber_id, status, delivered_at, first_opened_at, first_clicked_at")
    .eq("provider_message_id", emailId)
    .maybeSingle();
  if (error) throw error;
  if (!delivery) return "ignored";

  const occurredAt = event.created_at ?? new Date().toISOString();
  const { error: insertError } = await supabase.from("newsletter_email_events").insert({
    provider_event_id: eventId,
    workspace_id: delivery.workspace_id,
    delivery_id: delivery.id,
    type,
    url: type === "email.clicked" ? event.data?.click?.link ?? null : null,
    occurred_at: occurredAt,
  });
  if (insertError) {
    // Resend retried an event that was already recorded.
    if (insertError.code === "23505") return "duplicate";
    throw insertError;
  }

  const { patch, subscriberStatus } = deliveryChangesForEvent(delivery, {
    type,
    occurredAt,
    bounceType: event.data?.bounce?.type ?? null,
  });
  if (Object.keys(patch).length) {
    const { error: updateError } = await supabase.from("newsletter_deliveries").update(patch).eq("id", delivery.id);
    if (updateError) throw updateError;
  }
  if (subscriberStatus) {
    const { error: subscriberError } = await supabase
      .from("newsletter_subscribers")
      .update({ status: subscriberStatus })
      .eq("id", delivery.subscriber_id)
      .not("status", "in", "(bounced,complained)");
    if (subscriberError) throw subscriberError;
  }
  return "recorded";
}

// Run daily: raw events are kept for 180 days; the per-email first open/click stays for good.
export async function pruneEmailEvents(supabase: SupabaseClient<any>) {
  const { count, error } = await supabase
    .from("newsletter_email_events")
    .delete({ count: "exact" })
    .lt("created_at", new Date(Date.now() - KEEP_EVENTS_MS).toISOString());
  if (error) throw error;
  return count ?? 0;
}
