import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/notifications"
      aria-label="Notifications"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
          {unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
