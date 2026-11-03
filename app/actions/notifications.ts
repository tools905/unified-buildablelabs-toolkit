"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { deleteNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/services/notification-service";

export async function markNotificationReadAction(notificationId: string) {
  const { supabase } = await requireUser();
  await markNotificationRead(supabase, notificationId);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction() {
  const { supabase, user } = await requireUser();
  await markAllNotificationsRead(supabase, user.id);
  revalidatePath("/", "layout");
}

export async function deleteNotificationsAction(ids: string[]) {
  const { supabase, user } = await requireUser();
  try {
    await deleteNotifications(supabase, user.id, ids.filter((id) => typeof id === "string"));
  } catch {
    return { ok: false as const, error: "Couldn't delete those. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true as const };
}
