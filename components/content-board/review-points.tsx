"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addReviewPointAction,
  deleteReviewPointAction,
  setReviewPointResolvedAction,
} from "@/app/tools/content-board/actions";
import { cn } from "@/lib/utils/cn";
import type { PanelReviewPoint } from "@/components/content-board/types";

export function ReviewPoints({
  ideaId,
  points,
  currentUserId,
  isAdmin,
  onChanged,
}: {
  ideaId: string;
  points: PanelReviewPoint[];
  currentUserId: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = points.filter((point) => !point.isResolved);
  const done = points.filter((point) => point.isResolved);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      onChanged();
    });
  }

  function renderPoint(point: PanelReviewPoint) {
    const canDelete = isAdmin || point.authorId === currentUserId;
    return (
      <li key={point.id} className="flex items-start gap-2 py-2">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
          checked={point.isResolved}
          disabled={pending}
          aria-label={point.isResolved ? "Mark as still to change" : "Mark as done"}
          onChange={(event) => run(() => setReviewPointResolvedAction(point.id, event.target.checked))}
        />
        <div className="min-w-0 flex-1">
          <p className={cn("break-words text-sm", point.isResolved && "text-muted-foreground line-through")}>{point.body}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {point.authorName} · {formatDistanceToNow(new Date(point.createdAt), { addSuffix: true })}
          </p>
        </div>
        {canDelete ? (
          <button
            type="button"
            aria-label="Delete this point"
            disabled={pending}
            onClick={() => run(() => deleteReviewPointAction(point.id))}
            className="p-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </li>
    );
  }

  return (
    <section aria-label="Review">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Review</h3>
        <span className="text-xs text-muted-foreground">
          {points.length === 0 ? "No points yet" : `${open.length} to change · ${done.length} done`}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Note what should change before this goes out. Tick a point once it&apos;s fixed.</p>

      {points.length > 0 ? (
        <ul className="mt-2 divide-y divide-border">
          {open.map(renderPoint)}
          {done.map(renderPoint)}
        </ul>
      ) : null}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => addReviewPointAction({ ideaId, body }), () => setBody(""));
        }}
      >
        <Input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={500}
          aria-label="New review point"
        />
        <Button type="submit" size="sm" disabled={pending || body.trim().length < 2}>
          Add
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
