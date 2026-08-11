"use client";

import { useMemo, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { CreateTicketDialog } from "@/components/tickets/create-ticket-dialog";
import { TicketCard } from "@/components/tickets/ticket-card";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { TICKET_COLUMNS, type MemberOption, type TicketWithRelations } from "@/components/tickets/types";
import { updateTicketStatusAction } from "@/app/tools/tickets/actions";
import type { TicketStatus } from "@/lib/db/types";

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
          return (
            <div
              key={column.status}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(column.status)}
              className="min-h-40 rounded-lg border border-border bg-muted/40 p-3"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{column.label}</h2>
                <span className="text-xs text-muted-foreground">{columnTickets.length}</span>
              </div>
              <div className="space-y-2">
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
                  />
                ))}
                {columnTickets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tickets</p>
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
