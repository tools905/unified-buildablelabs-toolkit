import { PageHeader } from "@/components/dashboard/page-header";
import { PasteLab } from "@/components/capsule/paste-lab";
import { requireUser } from "@/lib/auth/require-user";
import { requireEnabledTool } from "@/modules/core/tools/registry";

export const dynamic = "force-dynamic";

// Not linked from anywhere: a bench for testing how each browser handles "copy the post, then open
// Medium or Substack". Open it by address while we are building capsule publishing.
export default async function PasteLabPage() {
  await requireEnabledTool("newsletter");
  await requireUser("/tools/newsletter/paste-lab");

  return (
    <>
      <PageHeader
        eyebrow="Capsule publishing"
        title="Paste lab"
        description="Try copy-and-open in each browser. Not linked in the menu."
      />
      <PasteLab />
    </>
  );
}
