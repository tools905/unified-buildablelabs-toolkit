"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTicketAction } from "@/app/tools/tickets/actions";
import type { DuplicateTicketMatch } from "@/lib/services/duplicate-ticket-service";
import type { MemberOption } from "@/components/tickets/types";

export function CreateTicketDialog({ members }: { members: MemberOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [duplicate, setDuplicate] = useState<DuplicateTicketMatch | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New ticket</Button>;
  }

  function close() {
    setOpen(false);
    setDuplicate(null);
    setPendingFormData(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 popover-shadow">
        <h2 className="text-lg font-semibold">New ticket</h2>
        <form
          action={(formData) => {
            setPendingFormData(formData);
            startTransition(async () => {
              const result = await createTicketAction(formData);
              if (result.status === "duplicate") {
                setDuplicate(result.duplicate);
              } else {
                close();
              }
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
          {duplicate ? (
            <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p>
                A similar ticket already exists: <strong>{duplicate.title}</strong>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{duplicate.reasoning}</p>
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setDuplicate(null)}>
                  Go back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (!pendingFormData) return;
                    pendingFormData.set("skipDuplicateCheck", "true");
                    startTransition(async () => {
                      await createTicketAction(pendingFormData);
                      close();
                    });
                  }}
                >
                  Create anyway
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create ticket"}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
