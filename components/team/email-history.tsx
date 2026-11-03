"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListToolbar } from "@/components/dashboard/list-toolbar";
import { deleteEmailLogsAction } from "@/app/actions/email-logs";
import { describeRange, type DateRange } from "@/lib/utils/date-range";

type EmailLog = {
  id: string;
  recipient_email: string;
  type: string;
  status: string;
  error_message: string | null;
  sent_at: string;
};

// The workspace's email history: what was sent or skipped, with ticking, deleting and a date filter.
export function EmailHistory({ logs, range }: { logs: EmailLog[]; range: DateRange }) {
  const [items, setItems] = useState(logs);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Tick boxes show only after the dustbin is pressed.
  const [selecting, setSelecting] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
      const result = await deleteEmailLogsAction(ids);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((current) => current.filter((item) => !ids.includes(item.id)));
      setSelected(new Set());
      setSelecting(false);
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
        selecting={selecting}
        onSelectingChange={(next) => {
          setSelecting(next);
          if (!next) setSelected(new Set());
        }}
      />
      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {range.key === "all" ? "No emails sent yet." : `No emails for ${describeRange(range).toLowerCase()}.`}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {selecting ? (
                <TableHead className="w-8">
                  <span className="sr-only">Select</span>
                </TableHead>
              ) : null}
              <TableHead>Recipient</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detail / Error</TableHead>
              <TableHead>Sent at</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((log) => (
              <TableRow
                key={log.id}
                data-state={selected.has(log.id) ? "selected" : undefined}
                onClick={selecting ? () => toggle(log.id) : undefined}
                className={selecting ? "cursor-pointer" : undefined}
              >
                {selecting ? (
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(log.id)}
                      onChange={() => toggle(log.id)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select the email to ${log.recipient_email}`}
                      className="h-4 w-4 accent-primary"
                    />
                  </TableCell>
                ) : null}
                <TableCell className="font-medium">{log.recipient_email}</TableCell>
                <TableCell className="capitalize">{log.type.replace(/_/g, " ")}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      log.status === "failed"
                        ? "border-rose-500/20 bg-rose-500/10 text-rose-500"
                        : log.status === "skipped"
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
                          : "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                    }
                  >
                    {log.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground" title={log.error_message ?? ""}>
                  {log.error_message ?? "-"}
                </TableCell>
                <TableCell className="text-muted-foreground" suppressHydrationWarning>
                  {new Date(log.sent_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
