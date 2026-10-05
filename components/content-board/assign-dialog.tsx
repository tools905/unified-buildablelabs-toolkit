"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AssigneePicker } from "@/components/content-board/assignee-picker";
import { setIdeaAssigneesAction } from "@/app/tools/content-board/actions";
import {
  assigneeLabel,
  type ContentIdeaWithRelations,
  type ContentMemberOption,
} from "@/components/content-board/types";

// Admins assign people straight from a card's ⋮ menu. Newly assigned people get a notification and
// an email saying who assigned them.
export function AssignDialog({
  idea,
  members,
  currentUserId,
  onClose,
}: {
  idea: ContentIdeaWithRelations;
  members: ContentMemberOption[];
  currentUserId: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-dialog-title"
        className="popover-shadow flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-lg border border-border bg-card sm:max-w-md sm:rounded-lg"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 id="assign-dialog-title" className="text-base font-semibold">
            Assign people
          </h2>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{idea.title}</p>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const ids = new FormData(event.currentTarget).getAll("assigneeIds").map(String);
            setError(null);
            startTransition(async () => {
              const result = await setIdeaAssigneesAction(idea.id, ids);
              if (result.ok) onClose();
              else setError(result.error);
            });
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <AssigneePicker
              members={members}
              currentUserId={currentUserId}
              initial={(idea.assignees ?? []).map((assignee) => ({ id: assignee.user_id, label: assigneeLabel(assignee) }))}
            />
            {error ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
