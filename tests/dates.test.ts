import { describe, expect, it } from "vitest";
import { generatePlannedRoundsFromDates } from "@/lib/utils/dates";

describe("generatePlannedRoundsFromDates", () => {
  it("creates weekly rounds through the end date", () => {
    const rounds = generatePlannedRoundsFromDates(
      new Date("2026-01-01"),
      new Date("2026-01-15"),
      "weekly",
      48,
    );
    expect(rounds).toHaveLength(3);
    expect(rounds[0].title).toBe("Week 1 Review");
  });

  it("creates a single final-only round", () => {
    const rounds = generatePlannedRoundsFromDates(
      new Date("2026-01-01"),
      new Date("2026-01-15"),
      "final_only",
      48,
    );
    expect(rounds).toHaveLength(1);
    expect(rounds[0].title).toBe("Final Review");
  });

  it("skips custom cadence for MVP", () => {
    expect(
      generatePlannedRoundsFromDates(
        new Date("2026-01-01"),
        new Date("2026-01-15"),
        "custom",
        48,
      ),
    ).toEqual([]);
  });
});
