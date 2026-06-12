import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getCurrentWorkspace, isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

export default async function PeerReviewToolPage() {
  const { supabase, user } = await requireUser("/tools/peer-review");
  await requireEnabledTool("peer-review");
  const workspace = await getCurrentWorkspace(supabase, user.id);
  const admin = workspace ? await isWorkspaceAdmin(workspace.id, user.id, supabase) : false;

  redirect(admin ? "/tools/peer-review/admin" : "/tools/peer-review/member");
}
