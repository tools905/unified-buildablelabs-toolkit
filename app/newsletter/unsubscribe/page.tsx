import type { Metadata } from "next";
import { SubscriptionPage } from "@/components/newsletter/subscription-page";
import { UnsubscribeForm } from "@/components/newsletter/unsubscribe-form";

export const metadata: Metadata = {
  title: "Unsubscribe · Buildable Labs",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; t?: string }>;
}) {
  const { s, t } = await searchParams;
  return (
    <SubscriptionPage>
      <UnsubscribeForm subscriberId={s ?? ""} signature={t ?? ""} />
    </SubscriptionPage>
  );
}
