import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const getUserSession = cache(async () => {
  const supabase = await createClient();
  const result = await supabase.auth.getUser();
  return { supabase, user: result.data.user, error: result.error };
});

export async function requireUser(redirectTo?: string) {
  const { supabase, user, error } = await getUserSession();

  if (error || !user) {
    const nextParam = redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : "";
    redirect(`/login${nextParam}`);
  }

  return { supabase, user };
}
