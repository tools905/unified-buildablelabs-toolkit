"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DisconnectState = { error: string | null };

// Takes back what the person allowed one app: Supabase ends that app's sessions for them and stops its
// refresh tokens. It only ever acts on the signed-in person's own grants.
export async function disconnectAppAction(clientId: string): Promise<DisconnectState> {
  if (!clientId) return { error: "Could not tell which app to disconnect." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are signed out. Sign in again, then try again." };

  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) return { error: "Could not disconnect this app. Please try again." };

  revalidatePath("/connected-apps");
  return { error: null };
}
