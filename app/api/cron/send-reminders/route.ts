import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { markOverdueAssignments, sendPendingReviewReminders } from "@/lib/services/reminder-service";
import { assertCronSecret } from "@/lib/utils/cron";

export async function GET(request: Request) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const markedOverdue = await markOverdueAssignments(supabase);
  const remindersSent = await sendPendingReviewReminders(supabase);
  return NextResponse.json({ markedOverdue, remindersSent });
}
