import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export async function requireUser() {
  const headerList = await headers();
  const userId = headerList.get("x-user-id");
  const userEmail = headerList.get("x-user-email");
  const userFullNameEncoded = headerList.get("x-user-full-name");

  if (userId) {
    const user = {
      id: userId,
      email: userEmail ?? undefined,
      user_metadata: {
        full_name: userFullNameEncoded ? decodeURIComponent(userFullNameEncoded) : undefined,
      },
    } as any;
    const supabase = await createClient();
    return { supabase, user };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}
