import { NextResponse } from "next/server";
import { cleanupExpiredLinks } from "@/lib/mcp/upload-links";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertCronSecret } from "@/lib/utils/cron";

// Nightly: removes upload links that expired or were used a day ago, and connector call records past 90 days.
async function run(request: Request) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json(await cleanupExpiredLinks(createAdminClient()));
}

export const GET = run;
export const POST = run;
