import "server-only";

import { createHash } from "node:crypto";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsletterEmail } from "@/lib/utils/newsletter-email-templates";

export type NewsletterDeliveryKind =
  | "confirmation"
  | "reconfirmation"
  | "lead_magnet"
  | "welcome"
  | "sequence"
  | "issue";

// Newsletter email goes out from its own sender (a dedicated subdomain), separate from the
// toolkit's EMAIL_FROM used for internal notifications.
function newsletterSender() {
  let from = process.env.NEWSLETTER_EMAIL_FROM ?? "";
  if (from.startsWith('"') && from.endsWith('"')) from = from.slice(1, -1);
  return from.trim();
}

// Outside production, leaving NEWSLETTER_EMAIL_FROM unset prints each email to the dev server
// log instead of sending it, so the whole flow can be tried locally without reaching an inbox.
function printsInsteadOfSending() {
  return !newsletterSender() && process.env.NODE_ENV !== "production";
}

async function finishDelivery(
  supabase: SupabaseClient<any>,
  deliveryId: string,
  patch: { status: "sent" | "failed" | "skipped"; provider_message_id?: string | null; error_message?: string | null },
) {
  await supabase
    .from("newsletter_deliveries")
    .update({ ...patch, sent_at: patch.status === "sent" ? new Date().toISOString() : null })
    .eq("id", deliveryId);
}

export async function sendNewsletterEmail(
  supabase: SupabaseClient<any>,
  input: {
    workspaceId: string;
    subscriberId: string;
    to: string;
    kind: NewsletterDeliveryKind;
    email: NewsletterEmail;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { data: delivery, error } = await supabase
    .from("newsletter_deliveries")
    .insert({ workspace_id: input.workspaceId, subscriber_id: input.subscriberId, kind: input.kind })
    .select("id")
    .single();
  if (error) throw error;

  if (printsInsteadOfSending()) {
    console.info(
      [
        "",
        `── Newsletter email (not sent: NEWSLETTER_EMAIL_FROM is unset) ──`,
        `To:      ${input.to}`,
        `Kind:    ${input.kind}`,
        `Subject: ${input.email.subject}`,
        ...Object.entries(input.email.headers ?? {}).map(([name, value]) => `${name}: ${value}`),
        "",
        input.email.text,
        "──",
        "",
      ].join("\n"),
    );
    await finishDelivery(supabase, delivery.id, { status: "skipped", error_message: "Printed to the server log (NEWSLETTER_EMAIL_FROM unset)." });
    return { ok: true };
  }

  const from = newsletterSender();
  const apiKey = process.env.RESEND_API_KEY;
  if (!from || !apiKey) {
    const message = !from ? "NEWSLETTER_EMAIL_FROM is not configured." : "RESEND_API_KEY is not configured.";
    console.error(`Newsletter email not sent: ${message}`);
    await finishDelivery(supabase, delivery.id, { status: "failed", error_message: message });
    return { ok: false, error: message };
  }

  try {
    const result = await new Resend(apiKey).emails.send(
      {
        from,
        to: input.to,
        subject: input.email.subject,
        html: input.email.html,
        text: input.email.text,
        headers: input.email.headers,
      },
      // A retried request for the same delivery is never sent twice.
      { idempotencyKey: delivery.id },
    );
    if (result.error) {
      const message = result.error.message || "Unknown Resend error";
      await finishDelivery(supabase, delivery.id, { status: "failed", error_message: message });
      return { ok: false, error: message };
    }
    await finishDelivery(supabase, delivery.id, { status: "sent", provider_message_id: result.data?.id ?? null });
    return { ok: true };
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "Unknown email error";
    await finishDelivery(supabase, delivery.id, { status: "failed", error_message: message });
    return { ok: false, error: message };
  }
}

// An issue email already recorded as a queued delivery, ready to go out.
export type QueuedNewsletterEmail = {
  deliveryId: string;
  workspaceId: string;
  subscriberId: string;
  sendId: string;
  to: string;
  email: NewsletterEmail;
};

// Sends up to 100 issue emails in one Resend call and records each one's outcome on its
// delivery. Returns how many went out, failed, or were only printed (locally).
export async function sendNewsletterBatch(supabase: SupabaseClient<any>, emails: QueuedNewsletterEmail[]) {
  const result = { sent: 0, failed: 0, printed: 0 };
  if (!emails.length) return result;
  const ids = emails.map((item) => item.deliveryId);

  const markAll = async (status: "failed" | "skipped", message: string) => {
    const { error } = await supabase.from("newsletter_deliveries").update({ status, error_message: message }).in("id", ids);
    if (error) throw error;
  };

  if (printsInsteadOfSending()) {
    const [first] = emails;
    console.info(
      [
        "",
        `── Newsletter issue batch (not sent: NEWSLETTER_EMAIL_FROM is unset) ──`,
        `To (${emails.length}): ${emails.map((item) => item.to).join(", ")}`,
        `Subject: ${first.email.subject}`,
        ...Object.entries(first.email.headers ?? {}).map(([name, value]) => `${name}: ${value}`),
        "",
        `First email, as ${first.to} gets it:`,
        first.email.text,
        "──",
        "",
      ].join("\n"),
    );
    await markAll("skipped", "Printed to the server log (NEWSLETTER_EMAIL_FROM unset).");
    result.printed = emails.length;
    return result;
  }

  const from = newsletterSender();
  const apiKey = process.env.RESEND_API_KEY;
  if (!from || !apiKey) {
    const message = !from ? "NEWSLETTER_EMAIL_FROM is not configured." : "RESEND_API_KEY is not configured.";
    console.error(`Newsletter issue batch not sent: ${message}`);
    await markAll("failed", message);
    result.failed = emails.length;
    return result;
  }

  let messageIds: (string | null)[];
  try {
    const response = await new Resend(apiKey).batch.send(
      emails.map((item) => ({
        from,
        to: item.to,
        subject: item.email.subject,
        html: item.email.html,
        text: item.email.text,
        headers: item.email.headers,
      })),
      // The same batch retried after a crash is not sent twice.
      { idempotencyKey: `newsletter-batch/${createHash("sha256").update(ids.join(",")).digest("hex")}` },
    );
    if (response.error) {
      await markAll("failed", response.error.message || "Unknown Resend error");
      result.failed = emails.length;
      return result;
    }
    messageIds = emails.map((_item, index) => response.data.data[index]?.id ?? null);
  } catch (sendError) {
    await markAll("failed", sendError instanceof Error ? sendError.message : "Unknown email error");
    result.failed = emails.length;
    return result;
  }

  // Resend has accepted the batch, so a failure from here on must not mark these emails failed.
  const sentAt = new Date().toISOString();
  const rows = emails.map((item, index) => ({
    id: item.deliveryId,
    workspace_id: item.workspaceId,
    subscriber_id: item.subscriberId,
    send_id: item.sendId,
    kind: "issue",
    status: "sent",
    provider_message_id: messageIds[index],
    sent_at: sentAt,
  }));
  const { error } = await supabase.from("newsletter_deliveries").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  result.sent = emails.length;
  return result;
}

// A one-off email that belongs to no subscriber (an admin's test send), so nothing is recorded.
export async function sendNewsletterTestEmail(to: string, email: NewsletterEmail): Promise<{ ok: boolean; printed?: boolean; error?: string }> {
  if (printsInsteadOfSending()) {
    console.info(["", "── Newsletter test email (not sent: NEWSLETTER_EMAIL_FROM is unset) ──", `To:      ${to}`, `Subject: ${email.subject}`, "", email.text, "──", ""].join("\n"));
    return { ok: true, printed: true };
  }
  const from = newsletterSender();
  const apiKey = process.env.RESEND_API_KEY;
  if (!from || !apiKey) return { ok: false, error: !from ? "NEWSLETTER_EMAIL_FROM is not configured." : "RESEND_API_KEY is not configured." };
  try {
    const response = await new Resend(apiKey).emails.send({ from, to, subject: email.subject, html: email.html, text: email.text });
    return response.error ? { ok: false, error: response.error.message } : { ok: true };
  } catch (sendError) {
    return { ok: false, error: sendError instanceof Error ? sendError.message : "Unknown email error" };
  }
}
