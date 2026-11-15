import type { Metadata } from "next";
import { ApplyForm } from "@/components/talent/apply-form";
import { ApplyClosed } from "@/components/talent/apply-closed";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOpenLink } from "@/lib/services/talent-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Apply · BuildableLabs",
  description: "Apply to build with BuildableLabs.",
  robots: { index: false, follow: false },
};

// The public application form behind Talent Bank's shared link. No sign-in: the link itself is the key.
export default async function ApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const open = await findOpenLink(createAdminClient(), token).catch(() => null);
  return open ? <ApplyForm token={token} /> : <ApplyClosed />;
}
