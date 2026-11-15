import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { TalentBank } from "@/components/talent/talent-bank";
import { requireUser } from "@/lib/auth/require-user";
import { getFormLink, listCandidates } from "@/lib/services/talent-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { getAppLink } from "@/lib/utils/app-url";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";
import { requireEnabledTool } from "@/modules/core/tools/registry";

// Admins only: members get "not found", as if the tool didn't exist.
export default async function TalentBankPage() {
  await requireEnabledTool("talent-bank");
  const { supabase, user } = await requireUser("/tools/talent-bank");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  if (!(await isWorkspaceAdmin(workspace.id, user.id, supabase))) notFound();
  const [candidates, link] = await Promise.all([listCandidates(supabase, workspace.id), getFormLink(supabase, workspace.id)]);

  return (
    <>
      <PageHeader
        eyebrow="Talent Bank · Admins only"
        title="Candidates"
        description="Everyone worth remembering: their details, resume and work, on one shelf or another."
      />
      <TalentBank candidates={candidates} workspaceId={workspace.id} formLink={link} applyBase={getAppLink("/apply/")} />
    </>
  );
}
