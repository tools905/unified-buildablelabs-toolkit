import { describe, expect, it } from "vitest";
import { dailyGreeting, dailyGreetingParts, firstName, GREETING_LINES, todayLabel } from "@/lib/utils/greeting";

describe("the daily greeting", () => {
  it("uses the person's first name", () => {
    expect(firstName("Aditi Chourasia", "aditi@buildablelabs.com")).toBe("Aditi");
    expect(firstName(null, "pavan.shelat@buildablelabs.com")).toBe("Pavan");
    expect(dailyGreeting("u1", "Pavan")).toContain("Pavan");
  });

  it("stays the same all day and changes from one day to the next", () => {
    const morning = dailyGreeting("u1", "Aditi", new Date("2026-11-04T03:00:00Z"));
    const evening = dailyGreeting("u1", "Aditi", new Date("2026-11-04T17:00:00Z"));
    expect(morning).toBe(evening);
    const week = Array.from({ length: 7 }, (_, i) => dailyGreeting("u1", "Aditi", new Date(Date.UTC(2026, 10, 4 + i, 6))));
    expect(new Set(week).size).toBeGreaterThan(3);
  });

  it("has about thirty lines, each naming the person", () => {
    expect(GREETING_LINES.length).toBe(30);
    expect(GREETING_LINES.every((line) => line.includes("{name}"))).toBe(true);
  });
});

describe("the greeting's parts and date", () => {
  it("splits the line around the name and dates it in India time", () => {
    const parts = dailyGreetingParts("u1", "Aditi", new Date("2026-11-04T03:00:00Z"));
    expect(parts.name).toBe("Aditi");
    expect(`${parts.before}${parts.name}${parts.after}`).toBe(dailyGreeting("u1", "Aditi", new Date("2026-11-04T03:00:00Z")));
    // 20:00 UTC on the 3rd is already the 4th in India.
    expect(todayLabel(new Date("2026-11-03T20:00:00Z"))).toBe("Wednesday · 4 November");
  });
});
