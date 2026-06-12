import { redirect } from "next/navigation";

export default async function MyReviewRedirectPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  redirect(`/tools/peer-review/member/${assignmentId}`);
}
