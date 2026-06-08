import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startReviewRound } from "@/lib/services/round-service";
import { assertCronSecret } from "@/lib/utils/cron";

export async function GET(request: Request) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const { data: rounds, error } = await supabase
    .from("review_rounds")
    .select("id")
    .eq("status", "planned")
    .lte("scheduled_start_at", new Date().toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let started = 0;
  for (const round of rounds ?? []) {
    await startReviewRound(supabase, round.id);
    started += 1;
  }

  return NextResponse.json({ started });
}
