import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicWorkspace } from "@/lib/services/newsletter-service";
import { sendNewsletterEmail } from "@/lib/services/newsletter-email-service";
import { confirmationEmail, welcomeEmail } from "@/lib/utils/newsletter-email-templates";
import {
  decideConfirmOutcome,
  decideSubscribeAction,
  type SubscriberSource,
  type SubscriberStatus,
} from "@/lib/utils/newsletter-subscription";
import {
  CONFIRM_TOKEN_TTL_MS,
  createConfirmToken,
  hashToken,
  rateLimitBucket,
  verifySubscriberSignature,
} from "@/lib/utils/newsletter-tokens";

// Public-facing writes: these run through the service-role client from unauthenticated API
// routes, never from the browser.

type Limit = { kind: string; windowSeconds: number; maxHits: number };

export const IP_LIMITS: Limit[] = [
  { kind: "ip-10m", windowSeconds: 600, maxHits: 5 },
  { kind: "ip-day", windowSeconds: 86_400, maxHits: 20 },
];

// Stops bots from flooding someone else's inbox with confirmation emails.
export const EMAIL_LIMITS: Limit[] = [
  { kind: "email-10m", windowSeconds: 600, maxHits: 1 },
  { kind: "email-day", windowSeconds: 86_400, maxHits: 3 },
];

// A confirmation that failed to send is retried by the cron, up to this many attempts in all.
const MAX_CONFIRMATION_ATTEMPTS = 3;
const RETRY_WINDOW_MS = 24 * 60 * 60_000;
const KEEP_UNCONFIRMED_MS = 30 * 24 * 60 * 60_000;

async function withinLimits(supabase: SupabaseClient<any>, limits: Limit[], value: string) {
  for (const limit of limits) {
    const { data, error } = await supabase.rpc("newsletter_hit_rate_limit", {
      p_bucket: rateLimitBucket(limit.kind, value),
      p_window_seconds: limit.windowSeconds,
      p_max_hits: limit.maxHits,
    });
    if (error) throw error;
    if (!data) return false;
  }
  return true;
}

type SubscriberForEmail = { id: string; workspace_id: string; email: string };

async function sendConfirmation(supabase: SupabaseClient<any>, subscriber: SubscriberForEmail, attempt: number) {
  const { token, hash } = createConfirmToken();
  // A new link replaces any earlier one. confirmation_sent_at is cleared until this one is
  // actually sent, so a failed send is picked up by the retry.
  const { error } = await supabase
    .from("newsletter_subscribers")
    .update({
      confirm_token_hash: hash,
      confirm_token_expires_at: new Date(Date.now() + CONFIRM_TOKEN_TTL_MS).toISOString(),
      confirmation_sent_at: null,
      confirmation_attempts: attempt,
    })
    .eq("id", subscriber.id);
  if (error) throw error;

  const result = await sendNewsletterEmail(supabase, {
    workspaceId: subscriber.workspace_id,
    subscriberId: subscriber.id,
    to: subscriber.email,
    kind: "confirmation",
    email: confirmationEmail({ token }),
  });
  if (!result.ok) return false;

  await supabase
    .from("newsletter_subscribers")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", subscriber.id);
  return true;
}

export type SubscribeInput = {
  email: string;
  source: SubscriberSource;
  sourcePath: string | null;
  postSlug: string | null;
  consentVersion: string | null;
  ip: string | null;
};

export async function subscribe(
  supabase: SupabaseClient<any>,
  input: SubscribeInput,
): Promise<{ status: "pending" | "rate_limited" }> {
  if (input.ip && !(await withinLimits(supabase, IP_LIMITS, input.ip))) return { status: "rate_limited" };

  const { data: existing, error: lookupError } = await supabase
    .from("newsletter_subscribers")
    .select("id, workspace_id, email, status, source")
    .eq("email", input.email)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const action = decideSubscribeAction((existing?.status as SubscriberStatus | undefined) ?? null);
  if (action === "ignore") return { status: "pending" };

  // The consent record always reflects the latest signup; where they signed up is kept from
  // the signup that started this subscription.
  const consent = { consent_at: new Date().toISOString(), consent_version: input.consentVersion };
  const origin = { source: input.source, source_path: input.sourcePath, source_post_slug: input.postSlug };

  let subscriber: SubscriberForEmail;
  if (action === "create") {
    const workspace = await getPublicWorkspace(supabase);
    if (!workspace) throw new Error("The BuildableLabs workspace does not exist.");
    const { data, error } = await supabase
      .from("newsletter_subscribers")
      .insert({ workspace_id: workspace.id, email: input.email, status: "pending", ...origin, ...consent })
      .select("id, workspace_id, email")
      .single();
    if (error) {
      // The same address was submitted at the same moment; that request sends the email.
      if (error.code === "23505") return { status: "pending" };
      throw error;
    }
    subscriber = data;
  } else {
    const restartsSubscription = action === "resubscribe" || existing!.source === "legacy";
    const { error } = await supabase
      .from("newsletter_subscribers")
      .update({
        ...consent,
        ...(restartsSubscription ? origin : {}),
        status: "pending",
        confirmation_attempts: 0,
      })
      .eq("id", existing!.id);
    if (error) throw error;
    subscriber = existing!;
  }

  // Over the per-email limit the visitor still sees "check your inbox"; the email they already
  // have keeps working.
  if (!(await withinLimits(supabase, EMAIL_LIMITS, input.email))) return { status: "pending" };

  await sendConfirmation(supabase, subscriber, 1);
  return { status: "pending" };
}

export async function confirmSubscription(
  supabase: SupabaseClient<any>,
  token: string,
): Promise<"confirmed" | "expired" | "invalid"> {
  if (!token) return "invalid";

  const { data: subscriber, error } = await supabase
    .from("newsletter_subscribers")
    .select("id, workspace_id, email, status, confirm_token_expires_at")
    .eq("confirm_token_hash", hashToken(token))
    .maybeSingle();
  if (error) throw error;

  const outcome = decideConfirmOutcome(subscriber);
  if (outcome === "already_confirmed") return "confirmed";
  if (outcome !== "confirm") return outcome;

  const { data: changed, error: updateError } = await supabase
    .from("newsletter_subscribers")
    .update({ status: "active", confirmed_at: new Date().toISOString() })
    .eq("id", subscriber!.id)
    .eq("status", "pending")
    .select("id");
  if (updateError) throw updateError;
  // Two clicks at the same moment: only the one that made the change sends the welcome email.
  if (!changed?.length) return "confirmed";

  await sendNewsletterEmail(supabase, {
    workspaceId: subscriber!.workspace_id,
    subscriberId: subscriber!.id,
    to: subscriber!.email,
    kind: "welcome",
    email: welcomeEmail({ subscriberId: subscriber!.id }),
  });
  return "confirmed";
}

// Works however many times it is called. A row that no longer exists still answers "done", so
// the response never tells anyone whether an address is on the list.
export async function unsubscribe(supabase: SupabaseClient<any>, subscriberId: string, signature: string) {
  if (!subscriberId || !signature || !verifySubscriberSignature(subscriberId, signature)) return false;

  const { error } = await supabase
    .from("newsletter_subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
    .eq("id", subscriberId)
    .in("status", ["active", "pending"]);
  if (error) throw error;
  return true;
}

// Run by the cron: sends again any recent confirmation that failed to go out.
export async function retryPendingConfirmations(supabase: SupabaseClient<any>, limit = 50) {
  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("id, workspace_id, email, confirmation_attempts")
    .eq("status", "pending")
    .is("confirmation_sent_at", null)
    .neq("source", "legacy")
    .gte("confirmation_attempts", 1)
    .lt("confirmation_attempts", MAX_CONFIRMATION_ATTEMPTS)
    .gte("consent_at", new Date(Date.now() - RETRY_WINDOW_MS).toISOString())
    .limit(limit);
  if (error) throw error;

  let sent = 0;
  for (const subscriber of data ?? []) {
    if (await sendConfirmation(supabase, subscriber, subscriber.confirmation_attempts + 1)) sent += 1;
  }
  return { attempted: data?.length ?? 0, sent };
}

// Run daily: people who never confirmed are removed after 30 days. Legacy subscribers who
// have not been sent their re-confirmation yet are kept.
export async function cleanupNewsletterSubscribers(supabase: SupabaseClient<any>) {
  const cutoff = new Date(Date.now() - KEEP_UNCONFIRMED_MS).toISOString();

  const expired = await supabase
    .from("newsletter_subscribers")
    .delete({ count: "exact" })
    .eq("status", "pending")
    .lt("confirmation_sent_at", cutoff);
  if (expired.error) throw expired.error;

  const neverSent = await supabase
    .from("newsletter_subscribers")
    .delete({ count: "exact" })
    .eq("status", "pending")
    .is("confirmation_sent_at", null)
    .neq("source", "legacy")
    .lt("consent_at", cutoff);
  if (neverSent.error) throw neverSent.error;

  const rateLimits = await supabase
    .from("newsletter_rate_limits")
    .delete({ count: "exact" })
    .lt("window_start", new Date(Date.now() - 2 * 86_400_000).toISOString());
  if (rateLimits.error) throw rateLimits.error;

  return {
    unconfirmedRemoved: (expired.count ?? 0) + (neverSent.count ?? 0),
    rateLimitRowsRemoved: rateLimits.count ?? 0,
  };
}
