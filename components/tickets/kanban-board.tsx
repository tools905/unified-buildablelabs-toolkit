"use client";

import { useMemo, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { CreateTicketDialog } from "@/components/tickets/create-ticket-dialog";
import { TicketCard } from "@/components/tickets/ticket-card";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { TICKET_COLUMNS, type MemberOption, type TicketWithRelations } from "@/components/tickets/types";
import { updateTicketStatusAction } from "@/app/tools/tickets/actions";
import type { TicketStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";

export function KanbanBoard({
  initialTickets,
  members,
  currentUserId,
}: {
  initialTickets: TicketWithRelations[];
  members: MemberOption[];
  currentUserId: string;
}) {
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, TicketStatus>>({});
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TicketStatus | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Merge in-flight drag moves so the board updates instantly, without
  // duplicating server state in a separate useState synced via effect.
  const tickets = useMemo(() => {
    return initialTickets.map((ticket) => {
      const override = optimisticStatus[ticket.id];
      return override && override !== ticket.status ? { ...ticket, status: override } : ticket;
    });
  }, [initialTickets, optimisticStatus]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  const filtered = useMemo(() => {
    return tickets.filter((ticket) => {
      if (assigneeFilter === "me" && ticket.assigned_to !== currentUserId) return false;
      if (assigneeFilter === "unassigned" && ticket.assigned_to) return false;
      if (
        assigneeFilter &&
        assigneeFilter !== "me" &&
        assigneeFilter !== "unassigned" &&
        ticket.assigned_to !== assigneeFilter
      ) {
        return false;
      }
      if (search) {
        const query = search.toLowerCase();
        const matches =
          ticket.title.toLowerCase().includes(query) ||
          (ticket.description ?? "").toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [tickets, search, assigneeFilter, currentUserId]);

  function moveTicket(ticketId: string, status: TicketStatus) {
    setOptimisticStatus((prev) => ({ ...prev, [ticketId]: status }));
    startTransition(() => updateTicketStatusAction(ticketId, status));
  }

  function handleDrop(status: TicketStatus) {
    if (!draggingId) return;
    moveTicket(draggingId, status);
    setDraggingId(null);
    setDragOverStatus(null);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap gap-2">
          <Input
            placeholder="Search tickets…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-xs"
          />
          <select
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">Everyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </select>
        </div>
        <CreateTicketDialog members={members} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {TICKET_COLUMNS.map((column) => {
          const columnTickets = filtered.filter((ticket) => ticket.status === column.status);
          const isDragOver = dragOverStatus === column.status;
          return (
            <div
              key={column.status}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragOverStatus !== column.status) setDragOverStatus(column.status);
              }}
              onDragLeave={() => setDragOverStatus((prev) => (prev === column.status ? null : prev))}
              onDrop={() => handleDrop(column.status)}
              className={cn(
                "flex h-[calc(100vh-260px)] min-h-[20rem] flex-col rounded-lg border bg-muted/40 p-3 transition-colors",
                isDragOver ? "border-primary/60 bg-primary/5" : "border-border",
              )}
            >
              <div className="mb-3 flex shrink-0 items-center justify-between">
                <h2 className="text-sm font-semibold">{column.label}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {columnTickets.length}
                </span>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {columnTickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    isDragging={draggingId === ticket.id}
                    onOpen={() => setSelectedTicketId(ticket.id)}
                    onDragStart={(event) => {
                      setDraggingId(ticket.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverStatus(null);
                    }}
                  />
                ))}
                {columnTickets.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                    No tickets
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTicket ? (
        <TicketDetail
          ticket={selectedTicket}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setSelectedTicketId(null)}
        />
      ) : null}
    </div>
  );
}
