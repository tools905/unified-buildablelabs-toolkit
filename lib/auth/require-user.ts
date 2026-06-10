import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser(redirectTo?: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    const nextParam = redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : "";
    redirect(`/login${nextParam}`);
  }

  return { supabase, user };
}
