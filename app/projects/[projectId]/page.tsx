import { redirect } from "next/navigation";

export default async function ProjectRedirectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/tools/peer-review/admin/${projectId}`);
}
