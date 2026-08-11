"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/services/notification-service";

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
