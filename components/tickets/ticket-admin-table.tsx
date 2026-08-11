"use client";

import { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  bulkAssignAction,
  bulkDeleteAction,
  bulkUpdateStatusAction,
} from "@/app/tools/tickets/actions";
import { TICKET_COLUMNS, type MemberOption, type TicketWithRelations } from "@/components/tickets/types";
import type { TicketStatus } from "@/lib/db/types";

function toCsv(tickets: TicketWithRelations[]) {
  const header = ["Title", "Status", "Assignee", "Progress %", "Due date", "Created at"];
  const rows = tickets.map((ticket) => [
    ticket.title,
    ticket.status,
    ticket.assignee?.full_name || ticket.assignee?.email || "",
    String(ticket.progress_percent),
    ticket.due_date ? ticket.due_date.slice(0, 10) : "",
    ticket.created_at.slice(0, 10),
  ]);
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

function downloadCsv(tickets: TicketWithRelations[]) {
  const blob = new Blob([toCsv(tickets)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tickets-${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function TicketAdminTable({
  tickets,
  members,
}: {
  tickets: TicketWithRelations[];
  members: MemberOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = tickets.length > 0 && selected.size === tickets.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(tickets.map((t) => t.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{selected.size} selected</span>
        <select
          disabled={selected.size === 0 || pending}
          onChange={(event) => {
            const status = event.target.value as TicketStatus;
            if (!status) return;
            startTransition(() => bulkUpdateStatusAction(selectedIds, status));
            event.target.value = "";
          }}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
          defaultValue=""
        >
          <option value="" disabled>
            Bulk change status…
          </option>
          {TICKET_COLUMNS.map((column) => (
            <option key={column.status} value={column.status}>
              {column.label}
            </option>
          ))}
        </select>
        <select
          disabled={selected.size === 0 || pending}
          onChange={(event) => {
            const value = event.target.value;
            startTransition(() => bulkAssignAction(selectedIds, value || null));
            event.target.value = "";
          }}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
          defaultValue=""
        >
          <option value="" disabled>
            Bulk reassign…
          </option>
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.label}
            </option>
          ))}
        </select>
        <ConfirmButton
          type="button"
          variant="destructive"
          size="sm"
          disabled={selected.size === 0 || pending}
          message={`Delete ${selected.size} ticket(s)? This cannot be undone.`}
          onClick={() => {
            startTransition(async () => {
              await bulkDeleteAction(selectedIds);
              setSelected(new Set());
            });
          }}
        >
          Delete selected
        </ConfirmButton>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => downloadCsv(tickets)}
        >
          Export CSV
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all tickets" />
            </TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Due date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.id}>
              <TableCell>
                <input
                  type="checkbox"
                  checked={selected.has(ticket.id)}
                  onChange={() => toggleOne(ticket.id)}
                  aria-label={`Select ${ticket.title}`}
                />
              </TableCell>
              <TableCell className="max-w-xs truncate">{ticket.title}</TableCell>
              <TableCell>{TICKET_COLUMNS.find((c) => c.status === ticket.status)?.label}</TableCell>
              <TableCell>{ticket.assignee?.full_name || ticket.assignee?.email || "Unassigned"}</TableCell>
              <TableCell>{ticket.progress_percent}%</TableCell>
              <TableCell>{ticket.due_date ? format(new Date(ticket.due_date), "MMM d, yyyy") : "—"}</TableCell>
            </TableRow>
          ))}
          {tickets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No tickets yet.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
