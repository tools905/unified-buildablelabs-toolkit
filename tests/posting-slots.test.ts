import { describe, expect, it } from "vitest";
import { fullPlatforms, indiaTomorrow, longDayLabel, needMessage, slotsUsed } from "@/lib/utils/posting-slots";

describe("posting slots", () => {
  it("only Instagram and LinkedIn take slots", () => {
    expect(slotsUsed({ platforms: ["instagram", "linkedin"] })).toEqual(["instagram", "linkedin"]);
    expect(slotsUsed({ platforms: ["newsletter"] })).toEqual([]);
    expect(slotsUsed({ platforms: [], platform: "linkedin" })).toEqual(["linkedin"]);
  });

  it("a day is full for a platform at 2 posts", () => {
    const day = [{ platforms: ["instagram"] }, { platforms: ["instagram", "linkedin"] }] as const;
    expect(fullPlatforms({ platforms: ["instagram"] }, [...day] as never)).toEqual(["instagram"]);
    expect(fullPlatforms({ platforms: ["linkedin"] }, [...day] as never)).toEqual([]);
    expect(fullPlatforms({ platforms: ["instagram", "linkedin"] }, [...day] as never)).toEqual(["instagram"]);
  });

  it("says plainly what's needed", () => {
    expect(longDayLabel("2026-11-21")).toBe("Saturday, 21 November");
    expect(needMessage({ kind: "reason", ideaTitle: "x", day: "2026-11-21", platforms: ["instagram"] })).toBe(
      "Saturday, 21 November already has 2 Instagram posts. Give a reason to add another.",
    );
    expect(indiaTomorrow(new Date("2026-11-15T20:00:00Z"))).toBe("2026-11-17");
  });
});
