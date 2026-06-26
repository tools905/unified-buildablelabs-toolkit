import { NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/utils/cron";
import { scoreUnscoredLinkedInPosts } from "@/modules/linkedin-assessor";

async function run(request: Request) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;
  const scoring = await scoreUnscoredLinkedInPosts();
  return NextResponse.json({ manualOnly: true, scoring });
}

export const GET = run;
export const POST = run;
