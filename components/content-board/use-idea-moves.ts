"use client";

import { useCallback, useMemo, useState } from "react";
import { moveIdeaAction } from "@/app/tools/content-board/actions";
import { SCHEDULE_CANCELLED, useSchedulePrompt } from "@/components/content-board/schedule-prompt";
import type { ContentIdeaWithRelations } from "@/components/content-board/types";
import type { ContentIdeaStatus } from "@/lib/db/types";

type Override = { to: ContentIdeaStatus; from: ContentIdeaStatus };

// Moves cards between columns. A card shows in its new column at once; if the server refuses the
// move (say, someone without permission), it goes back and the reason is shown. A move that needs a
// posting day or a reason for a full day asks for it first (render `scheduleDialog`).
export function useIdeaMoves(initialIdeas: ContentIdeaWithRelations[]) {
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [moveError, setMoveError] = useState<string | null>(null);
  const { withPrompt, dialog: scheduleDialog } = useSchedulePrompt();

  // An override only applies while the server still reports the column the card was moved from.
  // Once fresh data arrives (with the move, or with someone else's later change) the server wins.
  const ideas = useMemo(
    () =>
      initialIdeas.map((idea) => {
        const override = overrides[idea.id];
        return override && override.from === idea.status ? { ...idea, status: override.to } : idea;
      }),
    [initialIdeas, overrides],
  );

  const setOptimisticStatus = useCallback(
    (ideaId: string, status: ContentIdeaStatus | null) => {
      setOverrides((previous) => {
        const next = { ...previous };
        const from = initialIdeas.find((idea) => idea.id === ideaId)?.status;
        if (status && from) next[ideaId] = { to: status, from };
        else delete next[ideaId];
        return next;
      });
    },
    [initialIdeas],
  );

  // Shows the card in `status` at once and runs `action`; if it fails, the card goes back and the
  // reason is shown.
  const runMove = useCallback(
    async (ideaId: string, status: ContentIdeaStatus, action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setMoveError(null);
      setOptimisticStatus(ideaId, status);
      let problem: string | null = null;
      try {
        const result = await action();
        if (!result.ok) problem = result.error;
      } catch {
        problem = "Couldn't reach the server, so the card wasn't moved. Please try again.";
      }
      if (problem === SCHEDULE_CANCELLED) {
        setOptimisticStatus(ideaId, null);
        return null;
      }
      if (problem) {
        setOptimisticStatus(ideaId, null);
        setMoveError(problem);
      }
      return problem;
    },
    [setOptimisticStatus],
  );

  const moveIdea = useCallback(
    (ideaId: string, status: ContentIdeaStatus, options: { scheduledFor?: string | null } = {}) =>
      runMove(ideaId, status, () => withPrompt((answer) => moveIdeaAction(ideaId, status, { ...options, ...answer }))),
    [runMove, withPrompt],
  );

  return { ideas, moveIdea, runMove, setOptimisticStatus, moveError, clearMoveError: () => setMoveError(null), scheduleDialog };
}
