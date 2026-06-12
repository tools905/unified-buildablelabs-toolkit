import { redirect } from "next/navigation";

export default async function RoundReportRedirectPage({
  params,
}: {
  params: Promise<{ projectId: string; roundId: string }>;
}) {
  const { projectId, roundId } = await params;
  redirect(`/tools/peer-review/admin/${projectId}/rounds/${roundId}/report`);
}
