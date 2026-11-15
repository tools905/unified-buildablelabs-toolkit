import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/services/notification-service";
import { sendOverLimitEmail } from "@/lib/services/email-service";
import { getAppLink } from "@/lib/utils/app-url";
import { COUNTED_STATUSES, fullPlatforms, indiaTomorrow, longDayLabel, needMessage, platformNames, type ScheduleNeed, type SlottedPlatform } from "@/lib/utils/posting-slots";
import type { ContentPlatform } from "@/lib/db/types";

// The person has to add something first: a posting day, or a reason for going over a day's slots.
// Server actions pass `need` back so the screen can ask for it and try again.
export class ScheduleNeedsInput extends Error {
  constructor(readonly need: ScheduleNeed) {
    super(needMessage(need));
  }
}

type SlotCheck = {
  workspaceId: string;
  ideaId: string;
  ideaTitle: string;
  day: string;
  platforms: ContentPlatform[] | null;
  platform: ContentPlatform | null;
  overLimitReason?: string | null;
};

// The platforms this idea would push over the limit on `day` (empty when there's room). Over the
// limit needs a reason; without one this asks for it.
export async function checkPostingDay(supabase: SupabaseClient<any>, input: SlotCheck) {
  const { data, error } = await supabase
    .from("content_ideas")
    .select("id, platforms, platform")
    .eq("workspace_id", input.workspaceId)
    .eq("scheduled_for", input.day)
    .in("status", COUNTED_STATUSES)
    .neq("id", input.ideaId);
  if (error) throw error;
  const full = fullPlatforms(input, data ?? []);
  if (full.length && !input.overLimitReason?.trim()) {
    throw new ScheduleNeedsInput({ kind: "reason", ideaTitle: input.ideaTitle, day: input.day, platforms: full });
  }
  return full;
}

// Puts a newly shortlisted Instagram/LinkedIn idea on the first day from tomorrow with room.
export async function autoSchedule(supabase: SupabaseClient<any>, ideaId: string) {
  const { data, error } = await supabase.rpc("auto_schedule_idea", { p_idea: ideaId, p_from: indiaTomorrow() });
  if (error) throw error;
  return (data as string | null) ?? null;
}

// Someone went over a day's slots on purpose: the admins get a bell and an email with the reason.
// Best effort: the change is saved either way.
export async function notifyOverLimit(
  supabase: SupabaseClient<any>,
  input: { workspaceId: string; ideaId: string; ideaTitle: string; actorId: string; day: string; platforms: SlottedPlatform[]; reason: string },
) {
  try {
    const [{ data: admins }, { data: actor }] = await Promise.all([
      supabase
        .from("workspace_members")
        .select("user_id, profile:profiles!workspace_members_user_id_fkey(full_name, email)")
        .eq("workspace_id", input.workspaceId)
        .eq("role", "admin")
        .eq("status", "active"),
      supabase.from("profiles").select("full_name, email").eq("id", input.actorId).maybeSingle(),
    ]);
    const name = actor?.full_name || actor?.email || "Someone";
    const what = platformNames(input.platforms);
    const day = longDayLabel(input.day);
    const title = input.ideaTitle.trim() || "Untitled";
    const url = getAppLink(`/tools/content-board/calendar?idea=${input.ideaId}`);
    type AdminRow = { user_id: string; profile: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null };
    const results = await Promise.allSettled(
      ((admins ?? []) as AdminRow[])
        .filter((row) => row.user_id !== input.actorId)
        .flatMap((row) => {
          const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
          return [
            createNotification({
              userId: row.user_id,
              type: "content_idea_over_limit",
              title: `Extra ${what} post on ${day}`,
              message: `${name} put “${title}” on ${day}, which already had 2 ${what} posts. Reason: “${input.reason.trim()}”`,
            }),
            profile?.email
              ? sendOverLimitEmail(supabase, {
                  to: profile.email,
                  recipientName: profile.full_name?.split(/\s+/)[0] || profile.email,
                  actorName: name,
                  ideaTitle: title,
                  day,
                  platforms: what,
                  reason: input.reason.trim(),
                  url,
                  workspaceId: input.workspaceId,
                })
              : Promise.resolve(),
          ];
        }),
    );
    for (const result of results) if (result.status === "rejected") console.error("over-limit notification failed", result.reason);
  } catch (error) {
    console.error("over-limit notifications failed", error);
  }
}
