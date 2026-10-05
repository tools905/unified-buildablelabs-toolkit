"use client";

import { useCallback, useMemo, useState } from "react";
import { moveIdeaAction } from "@/app/tools/content-board/actions";
import type { ContentIdeaWithRelations } from "@/components/content-board/types";
import type { ContentIdeaStatus } from "@/lib/db/types";

type Override = { to: ContentIdeaStatus; from: ContentIdeaStatus };

// Moves cards between columns. A card shows in its new column at once; if the server refuses the
// move (say, someone without permission), it goes back and the reason is shown.
export function useIdeaMoves(initialIdeas: ContentIdeaWithRelations[]) {
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [moveError, setMoveError] = useState<string | null>(null);

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

  const moveIdea = useCallback(
    async (ideaId: string, status: ContentIdeaStatus, options: { scheduledFor?: string | null } = {}) => {
      setMoveError(null);
      setOptimisticStatus(ideaId, status);
      let problem: string | null = null;
      try {
        const result = await moveIdeaAction(ideaId, status, options);
        if (!result.ok) problem = result.error;
      } catch {
        problem = "Couldn't reach the server, so the card wasn't moved. Please try again.";
      }
      if (problem) {
        setOptimisticStatus(ideaId, null);
        setMoveError(problem);
      }
      return problem;
    },
    [setOptimisticStatus],
  );

  return { ideas, moveIdea, setOptimisticStatus, moveError, clearMoveError: () => setMoveError(null) };
}
