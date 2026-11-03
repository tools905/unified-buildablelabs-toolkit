import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanupPostedContentFiles } from "@/lib/services/content-attachment-service";
import { removeExpiredDownloadFiles } from "@/lib/services/download-service";
import { assertCronSecret } from "@/lib/utils/cron";

const KEEP_FILES_FOR_DAYS = 30;

async function run(request: Request) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;
  const admin = createAdminClient();
  const result = await cleanupPostedContentFiles(admin, KEEP_FILES_FOR_DAYS);
  // Exports under Settings → Downloads past their 30 days.
  const downloadFilesRemoved = await removeExpiredDownloadFiles(admin);
  return NextResponse.json({ ...result, downloadFilesRemoved });
}

export const GET = run;
export const POST = run;
