import { addDays, addHours, isAfter } from "date-fns";
import type { ReviewCadence } from "@/lib/db/types";

export type PlannedRound = {
  title: string;
  roundNumber: number;
  scheduledStartAt: Date;
  dueAt: Date;
};

// This workspace runs entirely on IST (UTC+5:30, no DST), so "9 AM" for
// round scheduling means 9 AM IST, not 9 AM UTC. Stored as UTC methods
// explicitly (not startOfDay/setHours, which read the server's local
// timezone) so this stays deterministic regardless of what timezone the
// process happens to run in — 9:00 IST is always 03:30 UTC.
function atNine(date: Date) {
  const next = new Date(date);
  next.setUTCHours(3, 30, 0, 0);
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

const IST_TIME_ZONE = "Asia/Kolkata";

// This workspace is entirely India-based, so every date/time shown to a
// user should read as IST regardless of the server process's own timezone
// (Vercel defaults to UTC) or the viewer's device settings. Intl.DateTimeFormat
// takes an explicit IANA timeZone, unlike date-fns' format()/toLocaleString(),
// which both read local-timezone getters.
function formatIST(date: Date | string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: IST_TIME_ZONE, ...options }).format(new Date(date));
}

export function formatISTDate(date: Date | string) {
  return formatIST(date, { month: "short", day: "numeric", year: "numeric" });
}

export function formatISTShortDate(date: Date | string) {
  return formatIST(date, { month: "short", day: "numeric" });
}

export function formatISTDateTime(date: Date | string) {
  return formatIST(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatISTShortDateTime(date: Date | string) {
  return formatIST(date, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatISTInputDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Monday 00:00:00 IST that begins the IST week containing `date`, returned
// as a true UTC instant. Computed via UTC getters/setters on an IST-shifted
// copy so it's correct regardless of the process's own timezone — the same
// problem date-fns' startOfWeek()/endOfWeek() have, since they read local
// getters (see atNine() above).
export function startOfISTWeek(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const day = shifted.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const istMidnightMonday = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - diffToMonday);
  return new Date(istMidnightMonday - IST_OFFSET_MS);
}

export function endOfISTWeek(date: Date) {
  return new Date(startOfISTWeek(date).getTime() + 7 * DAY_MS - 1);
}
