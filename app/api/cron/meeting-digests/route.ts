import { subDays } from "date-fns";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMeetingDigestNotifications } from "@/lib/services/calendar-service";
import { getWorkspaceByName } from "@/lib/services/workspace-service";
import { assertCronSecret } from "@/lib/utils/cron";

export async function GET(request: Request) {
  const unauthorized = assertCronSecret(request);
  if (unauthorized) return unauthorized;

  const type = new URL(request.url).searchParams.get("type");
  const period = type === "weekly" ? "weekly" : "daily";
  const since = subDays(new Date(), period === "weekly" ? 7 : 1);

  const admin = createAdminClient();
  const workspace = await getWorkspaceByName(admin, "BuildableLabs");
  if (!workspace) {
    return NextResponse.json({ error: "Default workspace not found" }, { status: 500 });
  }

  const result = await sendMeetingDigestNotifications(admin, workspace.id, since, period);
  return NextResponse.json({ period, ...result });
}
