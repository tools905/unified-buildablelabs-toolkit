import { z } from "zod";

export const SUBSCRIBER_SOURCES = ["cta_block", "inline_prompt", "side_rail", "popup", "unknown"] as const;
export type SubscriberSource = (typeof SUBSCRIBER_SOURCES)[number] | "legacy";

export type SubscriberStatus = "pending" | "active" | "unsubscribed" | "bounced" | "complained";

export const subscribeRequestSchema = z.object({
  email: z.string().max(320),
  // A capture point the website does not know about yet is still a signup, so an unrecognised
  // source is recorded as "unknown" rather than rejected.
  source: z.enum(SUBSCRIBER_SOURCES).optional().catch(undefined),
  sourcePath: z.string().max(500).optional().catch(undefined),
  postSlug: z.string().max(200).optional().catch(undefined),
  consentVersion: z.string().max(50).optional().catch(undefined),
  // Honeypot: hidden from people, filled in by bots.
  website: z.string().optional(),
});

export type SubscribeRequest = z.infer<typeof subscribeRequestSchema>;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

const emailSchema = z.string().email().max(254);

export function isValidEmail(email: string) {
  return emailSchema.safeParse(email).success;
}

export function isHoneypotFilled(request: Pick<SubscribeRequest, "website">) {
  return Boolean(request.website?.trim());
}

// What a new signup does to an address that may already be on the list. The response to the
// visitor is the same in every case, so the form never reveals who is subscribed.
export type SubscribeAction = "create" | "resend" | "resubscribe" | "ignore";

export function decideSubscribeAction(status: SubscriberStatus | null): SubscribeAction {
  if (status === null) return "create";
  if (status === "pending") return "resend";
  if (status === "unsubscribed") return "resubscribe";
  // Already active: nothing to do. Bounced or complained: never email again.
  return "ignore";
}

export type ConfirmOutcome = "confirm" | "already_confirmed" | "expired" | "invalid";

export function decideConfirmOutcome(
  subscriber: { status: SubscriberStatus; confirm_token_expires_at: string | null } | null,
  now = Date.now(),
): ConfirmOutcome {
  if (!subscriber) return "invalid";
  if (subscriber.status === "active") return "already_confirmed";
  // An old link must not bring back someone who has since unsubscribed, bounced or complained.
  if (subscriber.status !== "pending") return "invalid";
  if (!subscriber.confirm_token_expires_at || new Date(subscriber.confirm_token_expires_at).getTime() < now) {
    return "expired";
  }
  return "confirm";
}

// Which sites may call the subscribe endpoint from the browser. Until NEWSLETTER_ALLOWED_ORIGINS
// is set, any site may (as before), so the website's existing form keeps working; once set, only
// the listed origins get the CORS header. Same-origin requests through the website's /teams
// rewrite never need it.
export function subscribeCorsHeaders(origin: string | null, allowed = process.env.NEWSLETTER_ALLOWED_ORIGINS) {
  const base = { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  const list = (allowed ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (!list.length) return { ...base, "Access-Control-Allow-Origin": "*" };
  if (origin && list.includes(origin)) return { ...base, "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  return { ...base, Vary: "Origin" };
}

// The visitor's address as the toolkit sees it. Behind the website's rewrite this is the
// first entry of x-forwarded-for; without one, per-IP limits are skipped and the per-email
// limit and honeypot still apply.
export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || null;
}
