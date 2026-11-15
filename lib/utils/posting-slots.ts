import type { ContentIdeaStatus, ContentPlatform } from "@/lib/db/types";

// Posting slots on the calendar: each day takes up to 2 Instagram and 2 LinkedIn posts. Shortlisted,
// In Progress and Posted ideas count. Shortlisting an Instagram/LinkedIn idea without a day puts it on
// the first day with room (the database's auto_schedule_idea, migration 067); other platforms need a
// day picked. Going over on purpose is allowed with a reason, which the admins are told.

export const SLOT_LIMIT = 2;
export const SLOTTED_PLATFORMS = ["instagram", "linkedin"] as const;
export type SlottedPlatform = (typeof SLOTTED_PLATFORMS)[number];
export const COUNTED_STATUSES: ContentIdeaStatus[] = ["approved", "in_progress", "posted"];
const NAMES: Record<SlottedPlatform, string> = { instagram: "Instagram", linkedin: "LinkedIn" };

type SlotIdea = { platforms?: ContentPlatform[] | null; platform?: ContentPlatform | null };

const platformsOf = (idea: SlotIdea) => (idea.platforms?.length ? idea.platforms : idea.platform ? [idea.platform] : []);

// The limited platforms an idea takes a slot on.
export function slotsUsed(idea: SlotIdea): SlottedPlatform[] {
  const platforms = platformsOf(idea);
  return SLOTTED_PLATFORMS.filter((platform) => platforms.includes(platform));
}

// Which of this idea's platforms are already full on a day, given the other posts there.
export function fullPlatforms(idea: SlotIdea, others: SlotIdea[]): SlottedPlatform[] {
  return slotsUsed(idea).filter((platform) => others.filter((other) => slotsUsed(other).includes(platform)).length >= SLOT_LIMIT);
}

export const platformNames = (platforms: SlottedPlatform[]) => platforms.map((platform) => NAMES[platform]).join(" and ");

// "Saturday, 21 November"
export function longDayLabel(day: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

// Tomorrow in India, the first day an idea can be put on automatically.
export function indiaTomorrow(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

// What's needed from the person before a change can go through.
export type ScheduleNeed =
  | { kind: "day"; ideaTitle: string }
  | { kind: "reason"; ideaTitle: string; day: string; platforms: SlottedPlatform[] };

export function needMessage(need: ScheduleNeed) {
  if (need.kind === "day") return "Pick the day this goes out before shortlisting it.";
  return `${longDayLabel(need.day)} already has ${SLOT_LIMIT} ${platformNames(need.platforms)} posts. Give a reason to add another.`;
}
