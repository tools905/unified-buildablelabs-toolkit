"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QaResult } from "@/components/resources/qa-result";
import { submitQaAnswerAction } from "@/app/tools/resources/qa-actions";
import type { QaAttemptPublic } from "@/lib/services/qa-service";

export function QaSession({
  initialAttempt,
  onExit,
}: {
  initialAttempt: QaAttemptPublic;
  onExit: () => void;
}) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (attempt.status === "completed") {
    return <QaResult attempt={attempt} onRetake={onExit} />;
  }

  const pendingTurn = attempt.turns.find((turn) => turn.selectedOptionId === null);

  if (!pendingTurn) {
    return <p className="text-muted-foreground">Something went wrong loading this question.</p>;
  }

  const answeredCount = attempt.turns.filter((turn) => turn.selectedOptionId !== null).length;

  function handleSubmit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitQaAnswerAction(attempt.id, selected);
        setAttempt(result);
        setSelected(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not submit your answer.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Question {pendingTurn.turnNumber} of {attempt.totalQuestions}
        </span>
        {pendingTurn.isChallenge ? (
          <Badge className="border-primary/40 bg-primary/10 text-primary">Follow-up challenge</Badge>
        ) : null}
      </div>
      <p className="mb-4 text-lg font-medium">{pendingTurn.question}</p>
      <div className="mb-4 space-y-2">
        {pendingTurn.options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSelected(option.id)}
            className={`block w-full rounded-md border px-4 py-2 text-left text-sm transition-colors ${
              selected === option.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
            }`}
          >
            <span className="mr-2 font-semibold">{option.id}.</span>
            {option.text}
          </button>
        ))}
      </div>
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {answeredCount} of {attempt.totalQuestions} answered
        </span>
        <Button onClick={handleSubmit} disabled={!selected || isPending}>
          {isPending ? "Submitting…" : "Submit answer"}
        </Button>
      </div>
    </div>
  );
}
