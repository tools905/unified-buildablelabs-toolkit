"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
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

export function NotificationList({ notifications }: { notifications: Notification[] }) {
  const [items, setItems] = useState(notifications);
  const [, startTransition] = useTransition();

  const unreadCount = items.filter((item) => !item.read_at).length;

  return (
    <div>
      {unreadCount > 0 ? (
        <div className="mb-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setItems((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? new Date(0).toISOString() })));
              startTransition(() => markAllNotificationsReadAction());
            }}
          >
            Mark all read
          </Button>
        </div>
      ) : null}
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No notifications yet.
          </p>
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
              className={`card-shadow block w-full rounded-md border border-border bg-card p-4 text-left text-sm transition-colors hover:bg-muted/60 ${
                item.read_at ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.title}</span>
                {!item.read_at ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
              </div>
              <div className="mt-1 text-muted-foreground">{item.message}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
