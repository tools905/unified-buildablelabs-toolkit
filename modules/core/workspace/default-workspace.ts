import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getCurrentWorkspace, joinDefaultWorkspace } from "@/lib/services/workspace-service";

export async function getOrCreateDefaultWorkspace(
  supabase: SupabaseClient<any>,
  userId: string,
) {
  const existing = await getCurrentWorkspace(supabase, userId);
  if (existing) return existing;
  return joinDefaultWorkspace(supabase, userId);
}

export async function requireDefaultWorkspace(
  supabase: SupabaseClient<any>,
  userId: string,
) {
  const workspace = await getOrCreateDefaultWorkspace(supabase, userId);
  if (!workspace) redirect("/onboarding");
  return workspace;
}
