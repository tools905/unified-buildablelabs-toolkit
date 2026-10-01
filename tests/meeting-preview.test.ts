import { describe, expect, it } from "vitest";
import { fullMeetingSummary, MEETING_PREVIEW_CHARS, toMeetingPreview } from "@/lib/utils/meeting-preview";

const meeting = (markdown: string | null, text: string | null = null) => ({
  id: "m1",
  title: "Weekly sync",
  summary_markdown: markdown,
  summary_text: text,
});

describe("toMeetingPreview", () => {
  it("keeps a short recap whole and says it is not cut", () => {
    const result = toMeetingPreview(meeting("Short recap."));
    expect(result.summary_preview).toBe("Short recap.");
    expect(result.summary_truncated).toBe(false);
  });

  it("cuts a long recap to a preview and flags it", () => {
    const long = "word ".repeat(300);
    const result = toMeetingPreview(meeting(long));
    expect(result.summary_truncated).toBe(true);
    expect(result.summary_preview!.length).toBeLessThanOrEqual(MEETING_PREVIEW_CHARS + 1);
    expect(result.summary_preview!.endsWith("…")).toBe(true);
  });

  it("does not carry the full text to the browser", () => {
    const result = toMeetingPreview(meeting("A".repeat(5000), "B".repeat(5000)));
    expect(result).not.toHaveProperty("summary_markdown");
    expect(result).not.toHaveProperty("summary_text");
    expect(result).toMatchObject({ id: "m1", title: "Weekly sync" });
  });

  it("falls back to the plain text recap and handles a meeting without one", () => {
    expect(toMeetingPreview(meeting(null, "Plain recap.")).summary_preview).toBe("Plain recap.");
    const none = toMeetingPreview(meeting(null, null));
    expect(none.summary_preview).toBeNull();
    expect(none.summary_truncated).toBe(false);
  });

  it("the full text is the markdown recap when there is one", () => {
    expect(fullMeetingSummary(meeting("MD", "TXT"))).toBe("MD");
    expect(fullMeetingSummary(meeting(null, "TXT"))).toBe("TXT");
    expect(fullMeetingSummary(meeting(null, null))).toBeNull();
  });
});
