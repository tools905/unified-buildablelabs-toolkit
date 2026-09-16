"use client";

import { isPast, isToday } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils/cn";
import { formatISTShortDate } from "@/lib/utils/dates";
import type { TicketWithRelations } from "@/components/tickets/types";

function initials(name: string | null | undefined, email: string | undefined) {
  const source = name || email || "?";
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function dueDateTone(dueDate: string | null) {
  if (!dueDate) return "text-muted-foreground";
  const date = new Date(dueDate);
  if (isPast(date) && !isToday(date)) return "text-destructive font-medium";
  if (isToday(date)) return "text-amber-600 font-medium";
  return "text-muted-foreground";
}

export function TicketCard({
  ticket,
  onOpen,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  ticket: TicketWithRelations;
  onOpen: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      className={cn(
        "card-shadow card-hover-effect flex h-44 cursor-pointer flex-col rounded-lg border border-border bg-card p-3",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug">{ticket.title}</p>
          {ticket.assignee ? (
            <span
              title={ticket.assignee.full_name || ticket.assignee.email}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
            >
              {initials(ticket.assignee.full_name, ticket.assignee.email)}
            </span>
          ) : null}
        </div>
        {ticket.linked_meeting ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            From: {ticket.linked_meeting.title || ticket.linked_meeting.event_title || "a meeting"}
          </p>
        ) : null}
        {ticket.linear_issue_identifier ? (
          <Badge className="mt-1.5">{ticket.linear_issue_identifier}</Badge>
        ) : null}
      </div>
      <div className="mt-2 shrink-0 border-t border-border pt-2">
        <Progress value={ticket.progress_percent} className="h-1.5" />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={dueDateTone(ticket.due_date)}>
            {ticket.due_date ? formatISTShortDate(ticket.due_date) : "No due date"}
          </span>
          <span className="text-muted-foreground">{ticket.progress_percent}%</span>
        </div>
      </div>
    </div>
  );
}
