"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addReviewPointAction,
  deleteReviewPointAction,
  setIdeaReviewedAction,
  setReviewPointResolvedAction,
} from "@/app/tools/content-board/actions";
import { formatWhen } from "@/components/content-board/activity";
import { cn } from "@/lib/utils/cn";
import { MAX_REVIEW_POINT_LENGTH, MIN_REVIEW_POINT_LENGTH } from "@/lib/utils/content-board";
import type { PanelReviewPoint } from "@/components/content-board/types";

// An unsent comment is kept per idea, so closing the panel, opening another card or a failed
// save never throws away what a reviewer has typed.
function draftKey(ideaId: string) {
  return `content-review-draft:${ideaId}`;
}

function readDraft(ideaId: string) {
  try {
    return window.sessionStorage.getItem(draftKey(ideaId)) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(ideaId: string, value: string) {
  try {
    if (value) window.sessionStorage.setItem(draftKey(ideaId), value);
    else window.sessionStorage.removeItem(draftKey(ideaId));
  } catch {
    // Storage can be unavailable (private windows); the draft just isn't remembered then.
  }
}

export function ReviewPoints({
  ideaId,
  points,
  currentUserId,
  isAdmin,
  reviewedAt,
  reviewerName,
  changedSinceReview,
  onChanged,
}: {
  ideaId: string;
  points: PanelReviewPoint[];
  currentUserId: string;
  isAdmin: boolean;
  reviewedAt: string | null;
  reviewerName: string | null;
  changedSinceReview: boolean;
  onChanged: () => void;
}) {
  const [body, setBody] = useState(() => (typeof window === "undefined" ? "" : readDraft(ideaId)));
  const bodyRef = useRef(body);
  // `pending` only updates on the next render, so a very fast double click could send twice.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = points.filter((point) => !point.isResolved);
  const done = points.filter((point) => point.isResolved);

  const trimmedLength = body.trim().length;
  const tooShort = trimmedLength < MIN_REVIEW_POINT_LENGTH;
  const tooLong = trimmedLength > MAX_REVIEW_POINT_LENGTH;
  const hasDraft = trimmedLength > 0;

  function changeBody(next: string) {
    bodyRef.current = next;
    setBody(next);
    writeDraft(ideaId, next);
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onSuccess?: () => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSuccess?.();
        onChanged();
      } catch {
        // A dropped connection or a server error: say so instead of failing silently.
        setError("Couldn't reach the server, so nothing was saved. Please try again.");
      } finally {
        inFlight.current = false;
      }
    });
  }

  function submit() {
    if (pending || tooShort || tooLong) return;
    const submitted = body;
    run(
      () => addReviewPointAction({ ideaId, body: submitted }),
      // Keep whatever was typed while the save was in flight.
      () => {
        if (bodyRef.current === submitted) changeBody("");
      },
    );
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
          <p className={cn("whitespace-pre-wrap break-words text-sm", point.isResolved && "text-muted-foreground line-through")}>
            {point.body}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {point.authorName} · {formatWhen(point.createdAt)}
            {point.isResolved && point.resolvedAt ? ` · done ${formatWhen(point.resolvedAt)}` : ""}
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-border px-3 py-2">
        {reviewedAt ? (
          <div className="min-w-0 text-sm">
            <p className="flex items-center gap-1 font-medium">
              <Check className="h-4 w-4 text-primary" />
              Reviewed by {reviewerName ?? "Unknown"}
            </p>
            <p className="text-xs text-muted-foreground">{formatWhen(reviewedAt)}</p>
            {changedSinceReview ? (
              <p className="mt-1 text-xs text-amber-500">A new file was added after this review.</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not reviewed yet.</p>
        )}
        <Button
          type="button"
          size="sm"
          variant={reviewedAt && !changedSinceReview ? "ghost" : "default"}
          disabled={pending}
          onClick={() => run(() => setIdeaReviewedAction(ideaId, reviewedAt === null || changedSinceReview))}
        >
          {reviewedAt === null ? "Mark as reviewed" : changedSinceReview ? "Review again" : "Undo review"}
        </Button>
      </div>

      {points.length > 0 ? (
        <ul className="mt-2 divide-y divide-border">
          {open.map(renderPoint)}
          {done.map(renderPoint)}
        </ul>
      ) : null}

      <form
        className="mt-3 space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(event) => changeBody(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter adds a line (not while an IME is composing).
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            className="min-h-[3.5rem] resize-y"
            placeholder="Add a review point…"
            aria-label="New review point"
          />
          <Button type="submit" size="sm" disabled={pending || tooShort || tooLong}>
            Add
          </Button>
        </div>
        {hasDraft && !tooLong ? (
          <p className="text-xs text-muted-foreground">Not added yet. Press Add or Enter to save this point.</p>
        ) : null}
        {tooLong ? (
          <p role="alert" className="text-xs text-destructive">
            This is {trimmedLength - MAX_REVIEW_POINT_LENGTH} characters too long ({trimmedLength}/{MAX_REVIEW_POINT_LENGTH}).
            Shorten it, or split it into two points.
          </p>
        ) : trimmedLength > MAX_REVIEW_POINT_LENGTH * 0.8 ? (
          <p className="text-xs text-muted-foreground">
            {trimmedLength}/{MAX_REVIEW_POINT_LENGTH}
          </p>
        ) : null}
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
