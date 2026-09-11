import { addDays, addHours, isAfter } from "date-fns";
import type { ReviewCadence } from "@/lib/db/types";

export type PlannedRound = {
  title: string;
  roundNumber: number;
  scheduledStartAt: Date;
  dueAt: Date;
};

// Uses UTC methods explicitly (not startOfDay/setHours, which read the
// server's local timezone) so round scheduling is deterministic regardless
// of what timezone the process happens to run in.
function atNine(date: Date) {
  const next = new Date(date);
  next.setUTCHours(9, 0, 0, 0);
  return next;
}

export function generatePlannedRoundsFromDates(
  startDate: Date,
  endDate: Date,
  cadence: ReviewCadence,
  reviewDueHours: number,
): PlannedRound[] {
  if (cadence === "custom") return [];

  const rounds: PlannedRound[] = [];
  const stepDays = cadence === "biweekly" ? 14 : 7;
  let cursor = cadence === "final_only" ? atNine(endDate) : atNine(startDate);
  let roundNumber = 1;

  while (!isAfter(cursor, atNine(endDate))) {
    const title =
      cadence === "final_only" ? "Final Review" : `Week ${roundNumber} Review`;
    rounds.push({
      title,
      roundNumber,
      scheduledStartAt: cursor,
      dueAt: addHours(cursor, reviewDueHours),
    });
    if (cadence === "final_only") break;
    cursor = addDays(cursor, stepDays);
    roundNumber += 1;
  }

  return rounds;
}
