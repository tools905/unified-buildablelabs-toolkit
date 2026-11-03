import { describe, expect, it } from "vitest";
import { boardExportNames, dayRangeLabel, expiryLabel, exportPercent, formatBytes, ticketsCsvNames, timeLeftLabel } from "@/lib/utils/downloads";

describe("download names", () => {
  it("names a board export by its dates and columns", () => {
    expect(dayRangeLabel("2026-11-01", "2026-11-30")).toBe("1 Nov – 30 Nov 2026");
    expect(dayRangeLabel("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 – 3 Jan 2027");
    const names = boardExportNames("2026-11-01", "2026-11-30", ["approved", "posted"]);
    expect(names.name).toBe("Board posts · 1 Nov – 30 Nov 2026");
    expect(names.fileName).toBe("BuildableLabs board posts 1 Nov to 30 Nov 2026 (Shortlisted, Posted).pdf");
  });

  it("names the tickets list by when it was made, in India time", () => {
    const names = ticketsCsvNames(new Date("2026-11-04T08:44:00Z"));
    expect(names.name).toBe("Tickets · 4 Nov 2026, 2:14 pm");
    expect(names.fileName).toBe("BuildableLabs tickets 2026-11-04.csv");
  });
});

describe("keeping downloads", () => {
  it("counts down to the day the file goes", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    expect(expiryLabel("2026-12-04T09:00:00Z", now)).toBe("Expires in 30 days");
    expect(expiryLabel("2026-11-27T10:00:00Z", now)).toBe("Expires in 23 days");
    expect(expiryLabel("2026-11-05T12:00:00Z", now)).toBe("Expires in 2 days");
    expect(expiryLabel("2026-11-04T20:00:00Z", now)).toBe("Expires today");
    expect(expiryLabel("2026-11-04T09:00:00Z", now)).toBeNull();
  });

  it("shows sizes plainly", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(20_480)).toBe("20 KB");
    expect(formatBytes(27_158_528)).toBe("25.9 MB");
  });
});

describe("export progress", () => {
  it("moves by pages, then saving and uploading", () => {
    const weights = [1, 9, 10];
    expect(exportPercent({ weights, done: 0, stage: "build" })).toBe(0);
    expect(exportPercent({ weights, done: 2, stage: "build" })).toBe(45);
    expect(exportPercent({ weights, done: 3, stage: "build" })).toBe(90);
    expect(exportPercent({ weights, done: 3, stage: "saving" })).toBe(92);
    expect(exportPercent({ weights, done: 3, stage: "done" })).toBe(100);
  });

  it("estimates the time left once there's enough to go on", () => {
    expect(timeLeftLabel(1000, 2)).toBeNull();
    expect(timeLeftLabel(10_000, 50)).toBe("About 10 seconds left");
    expect(timeLeftLabel(2_000, 80)).toBe("A few seconds left");
    expect(timeLeftLabel(30_000, 20)).toBe("About 2 minutes left");
  });
});
