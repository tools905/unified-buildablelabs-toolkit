"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { ListToolbar } from "@/components/dashboard/list-toolbar";
import {
  deleteNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import { describeRange, type DateRange } from "@/lib/utils/date-range";
import { cn } from "@/lib/utils/cn";

type Notification = {
  id: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

export function NotificationList({ notifications, range }: { notifications: Notification[]; range: DateRange }) {
  const [items, setItems] = useState(notifications);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const unreadCount = items.filter((item) => !item.read_at).length;
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function remove() {
    const ids = [...selected];
    setError(null);
    startDelete(async () => {
      const result = await deleteNotificationsAction(ids);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((current) => current.filter((item) => !ids.includes(item.id)));
      setSelected(new Set());
    });
  }

  return (
    <div>
      <ListToolbar
        range={range}
        shownCount={items.length}
        selectedCount={selected.size}
        allSelected={allSelected}
        onToggleAll={() => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))}
        onDelete={remove}
        deleting={deleting}
      />
      {unreadCount > 0 ? (
        <div className="-mt-2 mb-3 flex justify-end">
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
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            {range.key === "all" ? "No notifications yet." : `No notifications for ${describeRange(range).toLowerCase()}.`}
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "card-shadow flex items-start gap-3 rounded-md border border-border bg-card p-4 text-sm transition-colors",
                selected.has(item.id) && "border-primary/50 bg-primary/5",
              )}
            >
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
                aria-label={`Select “${item.title}”`}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <button
                type="button"
                onClick={() => {
                  if (item.read_at) return;
                  setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date(0).toISOString() } : n)));
                  startTransition(() => markNotificationReadAction(item.id));
                }}
                className={cn("min-w-0 flex-1 text-left", item.read_at && "opacity-60")}
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}
