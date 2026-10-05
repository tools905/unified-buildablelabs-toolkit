import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processIssueSends, pruneEmailEvents } from "@/lib/services/newsletter-send-service";
import {
  cleanupNewsletterSubscribers,
  retryPendingConfirmations,
} from "@/lib/services/newsletter-subscriber-service";
import { assertCronSecret } from "@/lib/utils/cron";

// Every 5 minutes: retry confirmation emails that failed to send, start issue sends that are
// due, and send their emails in batches.
// Daily (?task=cleanup): remove people who never confirmed, old rate-limit counters and old
// webhook events.
async function run(request: Request) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  if (new URL(request.url).searchParams.get("task") === "cleanup") {
    return NextResponse.json({
      ...(await cleanupNewsletterSubscribers(supabase)),
      emailEventsRemoved: await pruneEmailEvents(supabase),
    });
  }
  return NextResponse.json({
    confirmations: await retryPendingConfirmations(supabase),
    issues: await processIssueSends(supabase),
  });
}

export const GET = run;
export const POST = run;
