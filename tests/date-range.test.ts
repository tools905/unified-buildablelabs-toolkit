import { describe, expect, it } from "vitest";
import { describeRange, parseDateRange, rangeBounds } from "@/lib/utils/date-range";

const now = new Date("2026-11-04T20:00:00Z"); // 5 Nov, 1:30 am in India

describe("the Notifications and logs date filter", () => {
  it("counts days in India time", () => {
    expect(parseDateRange({ range: "month" }, now)).toEqual({ key: "month", from: "2026-11-01", to: null });
    expect(parseDateRange({ range: "3months" }, now)).toEqual({ key: "3months", from: "2026-08-05", to: null });
  });

  it("takes a custom range and ignores anything that isn't a day", () => {
    expect(parseDateRange({ range: "custom", from: "2026-09-01", to: "nope" })).toEqual({ key: "custom", from: "2026-09-01", to: null });
    expect(parseDateRange({})).toEqual({ key: "all", from: null, to: null });
  });

  it("covers whole days", () => {
    expect(rangeBounds({ key: "custom", from: "2026-09-01", to: "2026-09-30" })).toEqual({
      since: "2026-09-01T00:00:00+05:30",
      until: "2026-09-30T23:59:59.999+05:30",
    });
    expect(describeRange({ key: "custom", from: "2026-09-01", to: "2026-09-30" })).toBe("2026-09-01 to 2026-09-30");
  });
});
