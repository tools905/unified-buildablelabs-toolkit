import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanupPostedContentFiles } from "@/lib/services/content-attachment-service";
import { assertCronSecret } from "@/lib/utils/cron";

const KEEP_FILES_FOR_DAYS = 30;

async function run(request: Request) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;
  const result = await cleanupPostedContentFiles(createAdminClient(), KEEP_FILES_FOR_DAYS);
  return NextResponse.json(result);
}

export const GET = run;
export const POST = run;
