import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QaAttemptPublic } from "@/lib/services/qa-service";

export function QaResult({ attempt, onRetake }: { attempt: QaAttemptPublic; onRetake: () => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            You scored {attempt.score} / {attempt.totalQuestions}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {attempt.turns.map((turn) => (
            <div key={turn.turnNumber} className="rounded-md border border-border p-3 text-sm">
              <p className="mb-1 font-medium">
                {turn.turnNumber}. {turn.question}
              </p>
              <p className={turn.isCorrect ? "text-emerald-600" : "text-destructive"}>
                Your answer: {turn.options.find((option) => option.id === turn.selectedOptionId)?.text ?? "—"}
              </p>
              {!turn.isCorrect ? (
                <p className="text-muted-foreground">
                  Correct answer: {turn.options.find((option) => option.id === turn.correctOptionId)?.text ?? "—"}
                </p>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Improvement steps</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {(attempt.summary?.improvementSteps ?? []).map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Button onClick={onRetake}>Back to roadmaps</Button>
    </div>
  );
}
