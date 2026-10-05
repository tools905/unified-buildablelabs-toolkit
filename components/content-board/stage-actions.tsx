"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTENT_COLUMNS, type ContentIdeaWithRelations } from "@/components/content-board/types";
import { nextStep } from "@/lib/utils/content-board";
import { cn } from "@/lib/utils/cn";
import type { ContentIdeaStatus } from "@/lib/db/types";

export type MoveIdea = (
  ideaId: string,
  status: ContentIdeaStatus,
  options?: { scheduledFor?: string | null },
) => Promise<string | null>;

// Where the idea is in Ideas → Feedback → Shortlisted → In Progress → Posted, and the one step this
// person can take next. Admins shortlist (optionally choosing the posting day, which puts it on the
// calendar); the assigned people start it and mark it posted.
export function StageActions({
  idea,
  isAdmin,
  currentUserId,
  openReviewCount,
  onMove,
}: {
  idea: ContentIdeaWithRelations;
  isAdmin: boolean;
  currentUserId: string;
  openReviewCount: number;
  onMove: MoveIdea;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(idea.scheduled_for ?? "");
  const assignees = idea.assignees ?? [];
  const step = nextStep({
    status: idea.status,
    isAdmin,
    isAssignee: assignees.some((assignee) => assignee.user_id === currentUserId),
    hasAssignees: assignees.length > 0,
    openReviewCount,
  });
  const currentIndex = CONTENT_COLUMNS.findIndex((column) => column.status === idea.status);
  const shortlisting = step?.kind === "move" && step.to === "approved";

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

      {step?.kind === "move" ? (
        <div className="flex flex-wrap items-end gap-2">
          {step.note ? <p className="w-full text-xs text-amber-500">{step.note}</p> : null}
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
      ) : step?.kind === "blocked" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{step.reason}</p>
          <Button type="button" size="sm" disabled>
            {step.label}
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

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
