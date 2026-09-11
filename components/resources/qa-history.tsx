import { format } from "date-fns";

type QaHistoryAttempt = {
  id: string;
  status: string;
  score: number | null;
  total_questions: number;
  completed_at: string | null;
  created_at: string;
};

export function QaHistory({ attempts }: { attempts: QaHistoryAttempt[] }) {
  const completed = attempts.filter((attempt) => attempt.status === "completed");
  if (completed.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">Past attempts</p>
      <ul className="space-y-1">
        {completed.slice(0, 3).map((attempt) => (
          <li key={attempt.id} className="text-xs text-muted-foreground">
            {attempt.score}/{attempt.total_questions} ·{" "}
            {format(new Date(attempt.completed_at ?? attempt.created_at), "MMM d, yyyy")}
          </li>
        ))}
      </ul>
    </div>
  );
}
