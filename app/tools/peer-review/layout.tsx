import { requireEnabledTool } from "@/modules/core/tools/registry";

export default async function PeerReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireEnabledTool("peer-review");
  return children;
}
