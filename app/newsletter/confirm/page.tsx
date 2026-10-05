import type { Metadata } from "next";
import { ConfirmSubscription } from "@/components/newsletter/confirm-subscription";
import { SubscriptionPage } from "@/components/newsletter/subscription-page";

export const metadata: Metadata = {
  title: "Confirm your subscription · Buildable Labs",
  robots: { index: false, follow: false },
};

export default async function ConfirmSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <SubscriptionPage>
      <ConfirmSubscription token={token ?? ""} />
    </SubscriptionPage>
  );
}
