import { requireEnabledTool } from "@/modules/core/tools/registry";

export default async function LinkedInAssessorLayout({ children }: { children: React.ReactNode }) {
  await requireEnabledTool("linkedin-assessor");
  return children;
}
