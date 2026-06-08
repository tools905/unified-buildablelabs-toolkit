import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";

export async function requireAdmin(workspaceId: string) {
  const { supabase, user } = await requireUser();
  const isAdmin = await isWorkspaceAdmin(workspaceId, user.id, supabase);

  if (!isAdmin) {
    notFound();
  }

  return { supabase, user };
}
