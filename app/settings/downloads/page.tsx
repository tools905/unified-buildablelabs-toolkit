import { PageHeader } from "@/components/dashboard/page-header";
import { DownloadsList } from "@/components/settings/downloads-list";
import { requireUser } from "@/lib/auth/require-user";
import { listDownloads } from "@/lib/services/download-service";
import { isWorkspaceAdmin } from "@/lib/services/workspace-service";
import { KEEP_DOWNLOADS_DAYS } from "@/lib/utils/downloads";
import { requireDefaultWorkspace } from "@/modules/core/workspace/default-workspace";

export default async function DownloadsPage() {
  const { supabase, user } = await requireUser("/settings/downloads");
  const workspace = await requireDefaultWorkspace(supabase, user.id);
  const [downloads, admin] = await Promise.all([listDownloads(supabase, workspace.id), isWorkspaceAdmin(workspace.id, user.id, supabase)]);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Downloads"
        description={`Everything the team has exported, newest first. Each file can be downloaded again for ${KEEP_DOWNLOADS_DAYS} days.`}
      />
      <DownloadsList downloads={downloads} currentUserId={user.id} isAdmin={admin} />
    </>
  );
}
