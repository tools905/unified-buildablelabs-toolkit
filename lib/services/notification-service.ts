import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Writes go through the admin client (service role, bypasses RLS) since one
// user is notifying another — there's no "authenticated insert" policy on
// notifications by design. Reads/updates use the caller's own client so RLS
// still restricts each user to their own notifications.
export async function createNotification(input: {
  userId: string;
  title: string;
  message: string;
  type?: string;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").insert({
    user_id: input.userId,
    title: input.title,
    message: input.message,
    type: input.type ?? "info",
  });
  if (error) throw error;
}

export async function listNotifications(
  supabase: SupabaseClient<any>,
  userId: string,
  range: { since: string | null; until: string | null } = { since: null, until: null },
) {
  let query = supabase.from("notifications").select("*").eq("user_id", userId);
  if (range.since) query = query.gte("created_at", range.since);
  if (range.until) query = query.lte("created_at", range.until);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data ?? [];
}

// Deletes the person's own notifications (others' are never matched).
export async function deleteNotifications(supabase: SupabaseClient<any>, userId: string, ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.from("notifications").delete().eq("user_id", userId).in("id", ids.slice(0, 500));
  if (error) throw error;
}

export async function getUnreadNotificationCount(supabase: SupabaseClient<any>, userId: string) {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(supabase: SupabaseClient<any>, notificationId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(supabase: SupabaseClient<any>, userId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}
