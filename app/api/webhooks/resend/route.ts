import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordEmailEvent } from "@/lib/services/newsletter-send-service";

// Resend reports what happened to each newsletter email (delivered, opened, clicked, bounced,
// complained) here. Deliveries are signed (Svix / Standard Webhooks); anything unsigned or
// older than five minutes is refused. Until RESEND_WEBHOOK_SECRET is set every call gets 401,
// the same as the Granola webhook before it is configured.

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured." }, { status: 401 });

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return NextResponse.json({ error: "Missing signature." }, { status: 401 });

  const payload = await request.text();
  let event;
  try {
    // Verification needs no API call; the key is only there because the SDK client wants one.
    event = new Resend(process.env.RESEND_API_KEY || "re_unused").webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  try {
    const outcome = await recordEmailEvent(createAdminClient(), id, event as Parameters<typeof recordEmailEvent>[2]);
    return NextResponse.json({ outcome });
  } catch (error) {
    // A non-2xx answer makes Resend retry the event later.
    console.error("Resend webhook failed", error);
    return NextResponse.json({ error: "Could not record the event." }, { status: 500 });
  }
}
