"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTicketAction } from "@/app/tools/tickets/actions";
import type { MemberOption } from "@/components/tickets/types";

export function CreateTicketDialog({ members }: { members: MemberOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New ticket</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
        <h2 className="text-lg font-semibold">New ticket</h2>
        <form
          action={(formData) => {
            startTransition(async () => {
              await createTicketAction(formData);
              setOpen(false);
            });
          }}
          className="mt-4 space-y-4"
        >
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required minLength={2} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" className="mt-1" rows={3} />
          </div>
          <div>
            <Label htmlFor="assignedTo">Assignee</Label>
            <select
              id="assignedTo"
              name="assignedTo"
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              defaultValue=""
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" name="dueDate" type="date" className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create ticket"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
