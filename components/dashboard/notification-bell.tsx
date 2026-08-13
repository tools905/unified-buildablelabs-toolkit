"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";

type Notification = {
  id: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell({ notifications }: { notifications: Notification[] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(notifications);
  const [, startTransition] = useTransition();

  const unreadCount = items.filter((item) => !item.read_at).length;

  return (
    <details
      className="relative"
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary
        aria-label="Notifications"
        className="relative inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unreadCount}
          </span>
        ) : null}
      </summary>
      <div className="absolute right-0 top-12 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-border bg-card p-3 popover-shadow">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setItems((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? new Date(0).toISOString() })));
                startTransition(() => markAllNotificationsReadAction());
              }}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.read_at) return;
                  setItems((prev) =>
                    prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date(0).toISOString() } : n)),
                  );
                  startTransition(() => markNotificationReadAction(item.id));
                }}
                className={`block w-full rounded-md p-2 text-left text-sm transition-colors hover:bg-muted ${
                  item.read_at ? "opacity-60" : "bg-muted/60"
                }`}
              >
                <div className="font-medium">{item.title}</div>
                <div className="text-muted-foreground">{item.message}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </details>
  );
}
