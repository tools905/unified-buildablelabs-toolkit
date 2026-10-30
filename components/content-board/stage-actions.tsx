"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTENT_COLUMNS, assigneeLabel, type ContentIdeaWithRelations } from "@/components/content-board/types";
import { nextStep, type AfterChanges } from "@/lib/utils/content-board";
import { markChangesDoneAction, restoreIdeaAction, setAfterChangesAction } from "@/app/tools/content-board/actions";
import { formatWhen } from "@/components/content-board/activity";
import { cn } from "@/lib/utils/cn";
import type { ContentIdeaStatus } from "@/lib/db/types";

export type MoveIdea = (
  ideaId: string,
  status: ContentIdeaStatus,
  options?: { scheduledFor?: string | null },
) => Promise<string | null>;

// Where the idea is in Ideas → Feedback → Shortlisted → In Progress → Posted, and the one step this
// person can take next. Anyone can shortlist from Feedback (team members once every review point is
// fixed), optionally choosing the posting day, which puts it on the calendar; then start it and mark it
// posted.
export function StageActions({
  idea,
  isAdmin,
  currentUserId,
  openReviewCount,
  afterChanges,
  changesDoneByName,
  discarded = null,
  onMove,
  onChanged,
}: {
  idea: ContentIdeaWithRelations;
  isAdmin: boolean;
  currentUserId: string;
  openReviewCount: number;
  afterChanges: AfterChanges | null;
  changesDoneByName: string | null;
  discarded?: { at: string; byName: string | null; reason: string | null; from: "idea" | "feedback" } | null;
  onMove: MoveIdea;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(idea.scheduled_for ?? "");
  const assignees = idea.assignees ?? [];
  const step = nextStep({ status: idea.status, isAdmin, openReviewCount, afterChanges, changesDoneByName });
  // Anyone can start a shortlisted idea; with nobody assigned yet, the person who starts it is added.
  const startNote =
    step?.kind === "move" && step.to === "in_progress" && assignees.length === 0
      ? "Nobody is assigned yet. Starting it assigns you."
      : step?.kind === "move" && step.to === "in_progress" && !assignees.some((assignee) => assignee.user_id === currentUserId)
        ? `Assigned to ${assignees.map(assigneeLabel).join(", ")}. Anyone on the team can start it.`
        : null;
  const currentIndex = CONTENT_COLUMNS.findIndex((column) => column.status === idea.status);
  const shortlisting = step?.kind === "move" && step.to === "approved";

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else onChanged();
    });
  }

  function move(to: ContentIdeaStatus) {
    setError(null);
    startTransition(async () => {
      const problem = await onMove(idea.id, to, shortlisting && date ? { scheduledFor: date } : {});
      if (problem) setError(problem);
    });
  }

  return (
    <section aria-label="Stage" className="space-y-3 border border-border p-3">
      <ol className="flex items-center gap-1" aria-label="Progress">
        {CONTENT_COLUMNS.map((column, index) => (
          <li key={column.status} className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              className={cn(
                "h-1 rounded-full",
                index < currentIndex ? "bg-primary/60" : index === currentIndex ? "bg-primary" : "bg-muted",
              )}
            />
            <span
              aria-current={index === currentIndex ? "step" : undefined}
              className={cn(
                "truncate text-[10px] sm:text-[11px]",
                index === currentIndex ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {column.label}
            </span>
          </li>
        ))}
      </ol>

      {idea.status === "discarded" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Discarded{discarded?.byName ? ` by ${discarded.byName}` : ""}
            {discarded ? ` on ${formatWhen(discarded.at)}` : ""}.
            {discarded?.reason ? <span className="mt-1 block text-foreground">&ldquo;{discarded.reason}&rdquo;</span> : null}
          </p>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => restoreIdeaAction(idea.id))}>
            {pending ? "Restoring…" : `Restore to ${discarded?.from === "feedback" ? "Feedback" : "Ideas"}`}
          </Button>
        </div>
      ) : step?.kind === "move" ? (
        <div className="flex flex-wrap items-end gap-2">
          {step.note ? <p className="w-full text-xs text-amber-500">{step.note}</p> : null}
          {startNote ? <p className="w-full text-xs text-muted-foreground">{startNote}</p> : null}
          {shortlisting ? (
            <label className="min-w-[10rem] flex-1 text-xs text-muted-foreground">
              Posting day (optional, puts it on the calendar)
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 h-9" />
            </label>
          ) : null}
          <Button type="button" size="sm" disabled={pending} onClick={() => move(step.to)}>
            {step.to === "posted" ? <Check className="h-4 w-4" /> : null}
            {pending ? "Moving…" : step.label}
          </Button>
        </div>
      ) : step?.kind === "changes_done" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="w-full text-xs text-amber-500">{step.note}</p>
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => markChangesDoneAction(idea.id))}>
            <Check className="h-4 w-4" />
            {pending ? "Sending…" : step.label}
          </Button>
        </div>
      ) : step?.kind === "wait" ? (
        <p className="text-xs text-muted-foreground">{step.reason}</p>
      ) : idea.status === "posted" ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-primary" />
          Posted.
          {idea.post_url && /^https?:\/\//i.test(idea.post_url) ? (
            <a
              href={idea.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              View live post <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span>Add the post link from the card or with Edit.</span>
          )}
        </p>
      ) : null}

      {/* Admins, while an idea is in Ideas or Feedback: what happens once the team makes the changes. */}
      {isAdmin && (idea.status === "idea" || idea.status === "feedback") ? (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-xs font-semibold">Once the team has made the changes</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Once the team has made the changes">
            {(
              [
                { value: "shortlist", label: "They move it to Shortlisted", hint: "For small fixes, like size changes. No need to check again." },
                { value: "review", label: "Send it back to me for review", hint: "They mark the changes done; it stays in Feedback for you." },
              ] as const
            ).map((option) => {
              const on = afterChanges === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={option.hint}
                  disabled={pending}
                  // Tapping the chosen option again clears it (the usual rule applies then).
                  onClick={() => run(() => setAfterChangesAction(idea.id, on ? null : option.value))}
                  className={cn(
                    "rounded-sm border px-2.5 py-1.5 text-left text-xs transition-colors",
                    on ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {afterChanges === "shortlist"
              ? "The team can move it to Shortlisted themselves once they've made the changes."
              : afterChanges === "review"
                ? changesDoneByName
                  ? `${changesDoneByName} marked the changes done. Review it, then shortlist it or add more feedback.`
                  : "The team will mark the changes done and it comes back to you here."
                : "Not chosen: the team can shortlist it once every review point is marked fixed."}
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
