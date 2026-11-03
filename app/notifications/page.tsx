import { PageHeader } from "@/components/dashboard/page-header";
import { NotificationList } from "@/components/notifications/notification-list";
import { requireUser } from "@/lib/auth/require-user";
import { listNotifications } from "@/lib/services/notification-service";
import { parseDateRange, rangeBounds } from "@/lib/utils/date-range";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { supabase, user } = await requireUser("/notifications");
  const range = parseDateRange(await searchParams);
  const notifications = await listNotifications(supabase, user.id, rangeBounds(range));

  return (
    <>
      <PageHeader
        eyebrow="Notifications"
        title="Notifications"
        description="Updates relevant to you across the workspace."
      />
      <NotificationList key={`${range.key}:${range.from}:${range.to}`} notifications={notifications} range={range} />
    </>
  );
}
