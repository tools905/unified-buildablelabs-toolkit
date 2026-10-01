"use client";

import { useRef, useState } from "react";
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
import type { ContentIdeaStatus } from "@/lib/db/types";
import type { IdeaPanelData, PanelReviewPoint } from "@/components/content-board/types";

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

type SaveResult = { ok: true } | { ok: false; error: string };

export function ReviewPoints({
  ideaId,
  points,
  currentUserId,
  currentUserName,
  ideaStatus,
  onMovedToFeedback,
  isAdmin,
  reviewedAt,
  reviewerName,
  changedSinceReview,
  applyLocal,
  onChanged,
}: {
  ideaId: string;
  points: PanelReviewPoint[];
  currentUserId: string;
  currentUserName: string;
  // Where the idea is on the board. Feedback on an idea still in Ideas moves it to Feedback.
  ideaStatus: ContentIdeaStatus;
  onMovedToFeedback: (moved: boolean) => void;
  isAdmin: boolean;
  reviewedAt: string | null;
  reviewerName: string | null;
  changedSinceReview: boolean;
  // Changes the panel's data on screen straight away, before the server has answered.
  applyLocal: (change: (data: IdeaPanelData) => IdeaPanelData) => void;
  // Called once every save has finished, so the panel can reload the server's version.
  // `succeeded` is false if any of them failed.
  onChanged: (succeeded: boolean) => void;
}) {
  const [body, setBody] = useState(() => (typeof window === "undefined" ? "" : readDraft(ideaId)));
  const bodyRef = useRef(body);
  const [error, setError] = useState<string | null>(null);
  // Saves still waiting on the server. The panel reloads only when the last one is done, so an
  // early answer can't put back a list that is missing a change that is still on its way.
  const saving = useRef(0);
  const failedInBatch = useRef(false);

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

  // Runs a save in the background. `undo` puts the screen back if the save fails.
  async function save(action: () => Promise<SaveResult>, undo: () => void) {
    setError(null);
    saving.current += 1;
    try {
      const result = await action();
      if (!result.ok) {
        failedInBatch.current = true;
        undo();
        setError(result.error);
      }
    } catch {
      // A dropped connection or a server error: say so instead of failing silently.
      failedInBatch.current = true;
      undo();
      setError("Couldn't reach the server, so nothing was saved. Please try again.");
    } finally {
      saving.current -= 1;
      if (saving.current === 0) {
        const succeeded = !failedInBatch.current;
        failedInBatch.current = false;
        onChanged(succeeded);
      }
    }
  }

  function submit() {
    if (tooShort || tooLong) return;
    const submitted = body;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: PanelReviewPoint = {
      id: tempId,
      body: submitted.trim(),
      isResolved: false,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      authorId: currentUserId,
      authorName: currentUserName,
    };
    applyLocal((data) => ({ ...data, points: [...data.points, optimistic] }));
    changeBody("");
    // The server moves an idea out of Ideas on its first feedback; show the card moving right away.
    const movesIdea = ideaStatus === "idea";
    if (movesIdea) onMovedToFeedback(true);
    void save(
      () => addReviewPointAction({ ideaId, body: submitted }),
      () => {
        applyLocal((data) => ({ ...data, points: data.points.filter((point) => point.id !== tempId) }));
        if (movesIdea) onMovedToFeedback(false);
        // Give the text back, unless something new has been typed since.
        if (!bodyRef.current) changeBody(submitted);
      },
    );
  }

  function toggleResolved(point: PanelReviewPoint, checked: boolean) {
    const restore = (data: IdeaPanelData) => ({
      ...data,
      points: data.points.map((item) => (item.id === point.id ? point : item)),
    });
    applyLocal((data) => ({
      ...data,
      points: data.points.map((item) =>
        item.id === point.id
          ? { ...item, isResolved: checked, resolvedAt: checked ? new Date().toISOString() : null }
          : item,
      ),
    }));
    void save(() => setReviewPointResolvedAction(point.id, checked), () => applyLocal(restore));
  }

  function removePoint(point: PanelReviewPoint) {
    const index = points.findIndex((item) => item.id === point.id);
    applyLocal((data) => ({ ...data, points: data.points.filter((item) => item.id !== point.id) }));
    void save(
      () => deleteReviewPointAction(point.id),
      () =>
        applyLocal((data) => {
          const next = [...data.points];
          next.splice(Math.max(0, index), 0, point);
          return { ...data, points: next };
        }),
    );
  }

  function toggleReviewed() {
    const marking = reviewedAt === null || changedSinceReview;
    const before = { reviewedAt, reviewerName };
    applyLocal((data) => ({
      ...data,
      history: marking
        ? { ...data.history, reviewedAt: new Date().toISOString(), reviewerName: currentUserName }
        : { ...data.history, reviewedAt: null, reviewerName: null },
    }));
    void save(
      () => setIdeaReviewedAction(ideaId, marking),
      () => applyLocal((data) => ({ ...data, history: { ...data.history, ...before } })),
    );
  }

  function renderPoint(point: PanelReviewPoint) {
    const canDelete = isAdmin || point.authorId === currentUserId;
    // A point that is still being saved has no real id yet, so it can't be changed until it has one.
    const unsaved = point.id.startsWith("temp-");
    return (
      <li key={point.id} className={cn("flex items-start gap-2 py-2", unsaved && "opacity-70")}>
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
          checked={point.isResolved}
          disabled={unsaved}
          aria-label={point.isResolved ? "Mark as still to change" : "Mark as done"}
          onChange={(event) => toggleResolved(point, event.target.checked)}
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
            disabled={unsaved}
            onClick={() => removePoint(point)}
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
          onClick={toggleReviewed}
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
            rows={3}
            className="min-h-[3.5rem] resize-y"
            placeholder="Add a review point…"
            aria-label="New review point"
          />
          <Button type="submit" size="sm" disabled={tooShort || tooLong}>
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
