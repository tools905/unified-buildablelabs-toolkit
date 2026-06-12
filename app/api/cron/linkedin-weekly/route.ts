import { NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/utils/cron";
import { generateLinkedInWeeklyReports } from "@/modules/linkedin-assessor";

async function run(request: Request) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json(await generateLinkedInWeeklyReports());
}

export const GET = run;
export const POST = run;
