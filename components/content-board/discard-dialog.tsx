"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteDiscardedIdeaAction, discardIdeaAction } from "@/app/tools/content-board/actions";
import type { ContentIdeaWithRelations } from "@/components/content-board/types";

// Discarding an idea (anyone, from Ideas or Feedback) with an optional reason, or deleting a discarded
// idea for good (admins). Opened from a card's ⋮ menu.
export function DiscardDialog({
  idea,
  mode,
  onDone,
  onClose,
}: {
  idea: ContentIdeaWithRelations;
  mode: "discard" | "delete";
  // Called once it worked, before closing (the board moves the card at once).
  onDone: () => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const discarding = mode === "discard";

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = discarding ? await discardIdeaAction(idea.id, reason.trim() || null) : await deleteDiscardedIdeaAction(idea.id);
      if (result.ok) {
        onDone();
        onClose();
      } else setError(result.error);
    });
  }

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
        aria-labelledby="discard-dialog-title"
        className="popover-shadow w-full rounded-t-lg border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-lg"
      >
        <h2 id="discard-dialog-title" className="text-base font-semibold">
          {discarding ? "Discard this idea?" : "Delete this idea for good?"}
        </h2>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{idea.title}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {discarding
            ? "It moves to Discarded (hidden between Ideas and Feedback). Anyone can restore it to where it was."
            : "The idea, its files, comments and Pencil reviews are removed. This can't be undone."}
        </p>
        {discarding ? (
          <label className="mt-3 block text-xs text-muted-foreground">
            Why? (optional)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Covered in another post, not on brand…"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            />
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? (discarding ? "Discarding…" : "Deleting…") : discarding ? "Discard" : "Delete for good"}
          </Button>
        </div>
      </div>
    </div>
  );
}
