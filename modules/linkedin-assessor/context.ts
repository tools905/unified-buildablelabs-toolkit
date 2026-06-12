import "server-only";

import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { requireEnabledTool } from "@/modules/core/tools/registry";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";

export async function requireLinkedInContext(path = "/tools/linkedin-assessor") {
  const { supabase, user } = await requireUser(path);
  await requireEnabledTool("linkedin-assessor");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const admin = await isWorkspaceAdmin(workspace.id, user.id, supabase);
  return { supabase, user, workspace, admin };
}

export async function requireLinkedInAdmin(path?: string) {
  const context = await requireLinkedInContext(path);
  if (!context.admin) notFound();
  return context;
}
