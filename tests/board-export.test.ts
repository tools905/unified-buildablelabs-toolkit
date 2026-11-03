import { describe, expect, it } from "vitest";
import { pdfSafeText, postingDay, selectForExport } from "@/lib/utils/board-export";

const idea = (title: string, status: "idea" | "approved" | "posted", scheduled_for: string | null, posted_at: string | null = null) => ({
  title,
  status,
  scheduled_for,
  posted_at,
});

describe("exporting posts from the board", () => {
  it("uses the posting day, or the day a posted idea went live", () => {
    expect(postingDay(idea("a", "approved", "2026-11-10"))).toBe("2026-11-10");
    expect(postingDay(idea("b", "posted", null, "2026-11-03T20:00:00Z"))).toBe("2026-11-04");
    expect(postingDay(idea("c", "idea", null))).toBeNull();
  });

  it("takes the chosen columns and dates only, earliest first, and never undated ideas", () => {
    const ideas = [
      idea("Late", "approved", "2026-11-20"),
      idea("Early", "posted", "2026-11-02"),
      idea("Out of range", "approved", "2026-12-01"),
      idea("Wrong column", "idea", "2026-11-05"),
      idea("No date", "approved", null),
    ];
    const chosen = selectForExport(ideas, { from: "2026-11-01", to: "2026-11-30" }, ["approved", "posted"]);
    expect(chosen.map((item) => item.idea.title)).toEqual(["Early", "Late"]);
  });

  it("keeps text the PDF font can draw", () => {
    expect(pdfSafeText("“Vibe coding” — red flags 🚩… café")).toBe('"Vibe coding" - red flags ... café');
  });
});
