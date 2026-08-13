import { AppShell } from "@/components/dashboard/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { NotificationList } from "@/components/notifications/notification-list";
import { requireUser } from "@/lib/auth/require-user";
import { listNotifications } from "@/lib/services/notification-service";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { supabase, user } = await requireUser("/notifications");
  const notifications = await listNotifications(supabase, user.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Notifications"
        title="Notifications"
        description="Updates relevant to you across the workspace."
      />
      <NotificationList notifications={notifications} />
    </AppShell>
  );
}
