import { redirect } from "next/navigation";

export default async function ProjectSettingsRedirectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/tools/peer-review/admin/${projectId}/settings`);
}
